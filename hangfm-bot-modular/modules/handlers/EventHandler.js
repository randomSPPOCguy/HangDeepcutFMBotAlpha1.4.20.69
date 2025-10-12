/**
 * EventHandler - Handles all socket events from hang.fm
 */
const { applyPatch } = require('fast-json-patch');
const { ServerMessageName } = require('ttfm-socket');

class EventHandler {
  constructor(bot, logger) {
    this.bot = bot;
    this.logger = logger;
  }

  handleStatefulMessage(message) {
    try {
      // Apply JSON patch to update state
      if (message.patch && this.bot.socket.state) {
        const result = applyPatch(this.bot.socket.state, message.patch);
        this.bot.socket.state = result.newDocument;
      }

      // Handle specific message types
      switch (message.serverMessageName) {
        case ServerMessageName.playedSong:
          this.handlePlayedSong(message);
          break;
        case ServerMessageName.votedOnSong:
          this.handleVotedOnSong(message);
          break;
        case ServerMessageName.addedDj:
          this.handleAddedDj(message);
          break;
        case ServerMessageName.removedDj:
          this.handleRemovedDj(message);
          break;
        case ServerMessageName.userJoined:
          this.handleUserJoined(message);
          break;
        case ServerMessageName.userLeft:
          this.handleUserLeft(message);
          break;
        default:
          this.logger.debug(`Unhandled stateful message: ${message.serverMessageName}`);
      }
    } catch (error) {
      this.logger.error(`Error handling stateful message: ${error.message}`);
    }
  }

  handleStatelessMessage(message) {
    try {
      this.logger.debug(`Stateless message: ${message.serverMessageName || 'unknown'}`);
      
      // Handle specific stateless messages
      switch (message.serverMessageName) {
        case 'chatMessage':
          this.handleChatMessage(message);
          break;
        default:
          this.logger.debug(`Unhandled stateless message: ${JSON.stringify(message).substring(0, 100)}`);
      }
    } catch (error) {
      this.logger.error(`Error handling stateless message: ${error.message}`);
    }
  }

  handleServerMessage(message) {
    try {
      this.logger.debug(`Server message: ${JSON.stringify(message).substring(0, 100)}`);
    } catch (error) {
      this.logger.error(`Error handling server message: ${error.message}`);
    }
  }

  async handlePlayedSong(message) {
    try {
      const state = this.bot.socket.getState();
      const song = state.playback?.song;
      
      if (!song) {
        this.logger.debug('No song in playback');
        return;
      }

      const artist = song.artistName || 'Unknown Artist';
      const track = song.trackName || 'Unknown Track';
      const djId = state.playback?.djProfile?.uuid;
      const djName = state.playback?.djProfile?.name || 'Unknown DJ';

      this.logger.log(`🎵 Now Playing: ${artist} - ${track} (DJ: ${djName})`);

      // Track activity for AFK detection
      if (djId) {
        this.bot.afk.trackActivity(djId);
      }

      // Update stats (if not bot's song)
      if (djId !== this.bot.config.userId) {
        const songKey = `${artist} - ${track}`;
        this.bot.stats.updateSongStats(songKey, djId, djName);
        this.bot.stats.updateUserStats(djId, artist);
      }
    } catch (error) {
      this.logger.error(`Error in handlePlayedSong: ${error.message}`);
    }
  }

  handleVotedOnSong(message) {
    try {
      const voterId = message.data?.userProfile?.uuid;
      const voterName = message.data?.userProfile?.name || 'Unknown';
      const voteType = message.data?.vote;

      if (voterId) {
        this.bot.afk.trackActivity(voterId);
      }

      this.logger.debug(`👍 ${voterName} voted: ${voteType}`);
    } catch (error) {
      this.logger.error(`Error in handleVotedOnSong: ${error.message}`);
    }
  }

  handleAddedDj(message) {
    try {
      const djId = message.data?.dj?.userProfile?.uuid;
      const djName = message.data?.dj?.userProfile?.name || 'Unknown';
      
      this.logger.log(`🎧 ${djName} hopped on stage`);
      
      if (djId) {
        this.bot.afk.trackActivity(djId);
      }
    } catch (error) {
      this.logger.error(`Error in handleAddedDj: ${error.message}`);
    }
  }

  handleRemovedDj(message) {
    try {
      const djId = message.data?.dj?.userProfile?.uuid;
      const djName = message.data?.dj?.userProfile?.name || 'Unknown';
      
      this.logger.log(`👋 ${djName} stepped off stage`);
    } catch (error) {
      this.logger.error(`Error in handleRemovedDj: ${error.message}`);
    }
  }

  handleUserJoined(message) {
    try {
      const userId = message.data?.userProfile?.uuid;
      const userName = message.data?.userProfile?.name || 'Unknown';
      
      this.logger.log(`👤 ${userName} joined the room`);
      
      if (userId) {
        this.bot.afk.trackActivity(userId);
      }
    } catch (error) {
      this.logger.error(`Error in handleUserJoined: ${error.message}`);
    }
  }

  handleUserLeft(message) {
    try {
      const userName = message.data?.userProfile?.name || 'Unknown';
      this.logger.log(`👋 ${userName} left the room`);
    } catch (error) {
      this.logger.error(`Error in handleUserLeft: ${error.message}`);
    }
  }

  async handleChatMessage(message) {
    try {
      const userId = message.data?.userProfile?.uuid;
      const userName = message.data?.userProfile?.name || 'Unknown';
      const text = message.data?.text || '';

      this.logger.log(`💬 ${userName}: ${text}`);

      // Track activity
      if (userId) {
        this.bot.afk.trackActivity(userId);
      }

      // TODO: Implement command handling
      // if (text.startsWith('/') || text.startsWith('.')) {
      //   await this.bot.commands.handleCommand(userId, userName, text);
      // }

      // TODO: Implement AI chat responses
      // if (text.toLowerCase().includes('bot')) {
      //   await this.bot.ai.generateResponse(text, userId, userName);
      // }
    } catch (error) {
      this.logger.error(`Error in handleChatMessage: ${error.message}`);
    }
  }
}

module.exports = EventHandler;
