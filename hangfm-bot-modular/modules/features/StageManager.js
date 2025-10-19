/**
 * StageManager - Auto-hop stage management
 * 
 * Bot stays on floor by default (glued)
 * Mods/co-owners can unglue to allow auto-hop
 */

class StageManager {
  constructor(bot, logger) {
    this.bot = bot;
    this.logger = logger;
    
    // Stage management state
    this.gluedToFloor = true; // Bot STAYS ON FLOOR by default
    this.lastGlueStatus = true; // Track last status to prevent spam
    this.songsPlayedSinceHopUp = 0;
    this.lastAutoHopDownTime = null;
    
    // Configuration
    this.minDJsForBot = 3; // Bot hops up if ≤3 DJs
    this.maxDJsForBot = 4; // Bot hops down if 4+ DJs (3 humans + bot)
    this.hopCooldown = 2 * 60 * 1000; // 2 minutes cooldown after hopping down
    
    this.logger.log(`🔒 Bot glued to floor (default) - mods can use /glue to allow auto-hop`);
  }
  
  async checkAutoStageManagement() {
    try {
      const state = this.bot.socket.getState();
      if (!state) return;
      
      const isBotOnStage = this.isUserOnStage(this.bot.config.userId);
      const currentDJCount = state.djs?.length || 0;
      const humanDJCount = isBotOnStage ? currentDJCount - 1 : currentDJCount;
      
      // ALWAYS keep music selection flowing (even when glued) for vibe analysis
      await this.keepMusicFlowing(state, isBotOnStage);
      
      // CRITICAL: If bot is on stage with NO music and NO queue, queue immediately
      const nowPlaying = state.playback?.song;
      const songsRemaining = state.songsRemainingForDj || 0;
      
      if (isBotOnStage && !nowPlaying && songsRemaining === 0) {
        this.logger.log('🚨 CRITICAL: Bot on stage with no music - queueing now!');
        await this.selectAndQueueSong('critical-emergency');
        return;
      }
      
      // Bot hops up if ≤3 DJs AND not glued
      if (currentDJCount <= 3 && !isBotOnStage && !this.gluedToFloor) {
        // Check cooldown
        const timeSinceHopDown = this.lastAutoHopDownTime ? Date.now() - this.lastAutoHopDownTime : Infinity;
        
        if (timeSinceHopDown < this.hopCooldown) {
          // Don't spam - only log once
          return;
        }
        
        this.logger.log(`🎧 Auto-hopping up: Only ${currentDJCount} DJs on stage`);
        await this.hopUpToStage();
        return;
      }
      
      // Bot hops down if ≥3 HUMAN DJs (bot makes room)
      if (humanDJCount >= 3 && isBotOnStage) {
        // Must play at least 1 song before hopping down
        if (this.songsPlayedSinceHopUp >= 1) {
          this.logger.log(`🎧 Auto-hopping down: ${humanDJCount} humans on stage (making room)`);
          await this.hopDownFromStage();
          this.songsPlayedSinceHopUp = 0;
          this.lastAutoHopDownTime = Date.now();
        }
        return;
      }
      
      // ONLY log glue status when it CHANGES (no spam)
      if (this.gluedToFloor && !isBotOnStage && this.lastGlueStatus !== this.gluedToFloor) {
        this.logger.log(`🔒 Bot glued to floor`);
        this.lastGlueStatus = this.gluedToFloor;
      }
      
      // If bot is on stage without a song, select one
      if (isBotOnStage && songsRemaining === 0) {
        this.logger.log('🎵 Bot on stage without queue - selecting song...');
        await this.selectAndQueueSong('on-stage-backup');
      }
      
    } catch (error) {
      this.logger.error(`Error in auto stage management: ${error.message}`);
    }
  }
  
  async keepMusicFlowing(state, isBotOnStage) {
    try {
      // Keep music selection active even when glued to floor
      // This maintains vibe analysis and social awareness
      if (this.gluedToFloor && !isBotOnStage) {
        // Don't actually queue or hop, but DO select songs to keep flow
        // Run music selection periodically (every 5 minutes) to maintain cache
        const now = Date.now();
        if (!this.lastFlowCheck || (now - this.lastFlowCheck) > 5 * 60 * 1000) {
          this.logger.debug('🎵 Background music selection (maintaining flow)');
          const selection = await this.bot.music.selectSong(state);
          if (selection) {
            this.logger.debug(`💭 Would play: ${selection.artist} - ${selection.title}`);
          }
          this.lastFlowCheck = now;
        }
      }
    } catch (error) {
      this.logger.debug(`Flow check error: ${error.message}`);
    }
  }
  
  async hopUpToStage() {
    try {
      this.logger.log('🎧 Hopping up to stage...');
      
      // Select song BEFORE hopping up
      const song = await this.selectAndQueueSong('pre-hop-up');
      
      if (!song) {
        this.logger.error('❌ Failed to select song before hop up - aborting');
        return false;
      }
      
      // Hop up to stage
      await this.bot.socket.action('addDj', { song });
      this.songsPlayedSinceHopUp = 0;
      this.logger.log('✅ Hopped up to stage');
      
      // Queue next song after 2 seconds
      setTimeout(async () => {
        await this.selectAndQueueSong('post-hop-up');
      }, 2000);
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to hop up: ${error.message}`);
      return false;
    }
  }
  
  async hopDownFromStage() {
    try {
      this.logger.log('🎧 Hopping down from stage...');
      await this.bot.socket.action('removeDj', {});
      this.logger.log('✅ Hopped down from stage');
      return true;
    } catch (error) {
      this.logger.error(`Failed to hop down: ${error.message}`);
      return false;
    }
  }
  
  async selectAndQueueSong(context = 'auto') {
    try {
      const state = this.bot.socket.getState();
      
      // Select a song from MusicSelector (with social awareness)
      const selection = await this.bot.music.selectSong(state);
      
      if (!selection) {
        this.logger.error(`❌ No song selected (${context})`);
        return null;
      }
      
      this.logger.log(`🎵 Selected: ${selection.artist} - ${selection.title} (${context})`);
      
      // Search hang.fm catalog for the song
      const catalogSong = await this.bot.catalog.search(selection.artist, selection.title);
      
      if (!catalogSong) {
        this.logger.warn(`❌ Song not in catalog: ${selection.artist} - ${selection.title}`);
        return null;
      }
      
      // Queue the song
      await this.bot.socket.action('updateNextSong', { song: catalogSong });
      this.logger.log(`✅ Queued: ${catalogSong.artistName} - ${catalogSong.trackName}`);
      
      return catalogSong;
    } catch (error) {
      this.logger.error(`Failed to select and queue song: ${error.message}`);
      return null;
    }
  }
  
  isUserOnStage(userId) {
    const state = this.bot.socket.getState();
    return state?.djs?.some(dj => dj.uuid === userId) || false;
  }
  
  trackSongPlayed() {
    this.songsPlayedSinceHopUp++;
    this.logger.debug(`📊 Songs played since hop up: ${this.songsPlayedSinceHopUp}`);
  }
  
  async toggleGlue(userId, userName) {
    // Check if user is mod or co-owner
    const isMod = await this.isUserModerator(userId);
    const isCoOwner = await this.isUserCoOwner(userId);
    
    if (!isMod && !isCoOwner) {
      await this.bot.chat.sendMessage(
        this.bot.config.roomId,
        `❌ Access denied. Only mods and co-owners can use /glue.`
      );
      return false;
    }
    
    const state = this.bot.socket.getState();
    const isBotOnStage = this.isUserOnStage(this.bot.config.userId);
    
    if (this.gluedToFloor) {
      // Unglue
      this.gluedToFloor = false;
      this.lastGlueStatus = false;
      await this.bot.chat.sendMessage(
        this.bot.config.roomId,
        `🔓 **BOT UNGLUED** 🔓\n**Bot can now auto-hop up to stage.**\n**Unglued by:** ${userName}`
      );
      this.logger.log(`🔓 Bot unglued by ${userName}`);
    } else {
      // Glue to floor
      this.gluedToFloor = true;
      this.lastGlueStatus = true;
      
      // Remove from stage if on stage
      if (isBotOnStage) {
        await this.hopDownFromStage();
        await this.bot.chat.sendMessage(
          this.bot.config.roomId,
          `🔒 **BOT GLUED TO FLOOR** 🔒\n**Bot removed from stage and cannot auto-hop up.**\n**Glued by:** ${userName}`
        );
      } else {
        await this.bot.chat.sendMessage(
          this.bot.config.roomId,
          `🔒 **BOT GLUED TO FLOOR** 🔒\n**Bot cannot auto-hop up to stage.**\n**Glued by:** ${userName}`
        );
      }
      
      this.logger.log(`🔒 Bot glued to floor by ${userName}`);
    }
    
    return true;
  }
  
  async isUserModerator(userId) {
    const state = this.bot.socket.getState();
    const user = state?.allUserData?.[userId];
    return user?.isModerator || false;
  }
  
  async isUserCoOwner(userId) {
    const state = this.bot.socket.getState();
    const room = state?.room;
    return room?.coOwners?.includes(userId) || room?.owner === userId || false;
  }
}

module.exports = StageManager;

