/**
 * AFKDetector - Monitors DJ activity and removes inactive DJs
 * 36 minutes inactive → 36 second warning → removal
 */
class AFKDetector {
  constructor(bot, logger) {
    this.bot = bot;
    this.logger = logger;
    
    this.userLastActivity = new Map(); // userId -> timestamp
    this.afkWarnings = new Map(); // userId -> { warnedAt, username }
    this.afkTimeout = 36 * 60 * 1000; // 36 minutes
    this.afkWarningTime = 36 * 1000; // 36 seconds
    
    // Start monitoring
    this.startMonitoring();
  }

  startMonitoring() {
    setInterval(() => {
      this.checkAFKDJs();
    }, 30000); // Check every 30 seconds
    this.logger.log('⏰ AFK detection started (36 min timeout)');
  }

  trackActivity(userId, activityType = 'activity') {
    if (!userId) return;
    
    const wasTracked = this.userLastActivity.has(userId);
    this.userLastActivity.set(userId, Date.now());
    
    // Clear warning if exists
    if (this.afkWarnings.has(userId)) {
      const userName = this.afkWarnings.get(userId).username;
      this.logger.log(`✅ ${userName} activity detected (${activityType}) - AFK timer reset & warning cleared`);
      this.afkWarnings.delete(userId);
    } else if (wasTracked) {
      // Silent reset - user is active, timer refreshed
      this.logger.debug(`⏰ AFK timer reset for user (${activityType})`);
    }
  }

  async checkAFKDJs() {
    try {
      if (!this.bot?.socket?.getState) return; // Skip if socket not ready
      const now = Date.now();
      const state = this.bot.socket.getState();
      const djs = state?.djs || [];
      
      if (djs.length === 0) return;
      
      for (const dj of djs) {
        const djId = dj.uuid || dj.userProfile?.uuid;
        if (!djId) continue; // Skip if no ID
        
        // Get DJ name from state
        const djName = state?.allUserData?.[djId]?.name || dj.name || 'Unknown DJ';
        
        // Skip the bot
        if (djId === this.bot.config.userId) continue;
        
        const lastActivity = this.userLastActivity.get(djId);
        
        // Set initial activity if not tracked
        if (!lastActivity) {
          this.userLastActivity.set(djId, now);
          continue;
        }
        
        const inactiveTime = now - lastActivity;
        const hasWarning = this.afkWarnings.has(djId);
        
        // Check if warned and time expired
        if (hasWarning) {
          const warning = this.afkWarnings.get(djId);
          const timeSinceWarning = now - warning.warnedAt;
          
          if (timeSinceWarning >= this.afkWarningTime) {
            this.logger.log(`⏰ Removing ${djName} from stage (AFK timeout)`);
            await this.bot.chat.sendMessage(this.bot.config.roomId, `⏰ **${djName}** removed from stage due to inactivity.`);
            
            try {
              await this.bot.socket.action('removeDj', { djUuid: djId });
              this.afkWarnings.delete(djId);
              this.userLastActivity.delete(djId);
            } catch (error) {
              this.logger.error(`Failed to remove AFK DJ: ${error.message}`);
            }
          }
        }
        // Check if reached AFK timeout
        else if (inactiveTime >= this.afkTimeout) {
          const minutesInactive = Math.floor(inactiveTime / 60000);
          this.logger.warn(`⚠️ ${djName} inactive for ${minutesInactive} minutes`);
          await this.bot.chat.sendMessage(
            this.bot.config.roomId,
            `⚠️ **AFK Warning:** @${djName} - You've been inactive for 36 minutes. **Vote or chat within 36 seconds** or you'll be removed from stage.`
          );
          
          this.afkWarnings.set(djId, { warnedAt: now, username: djName });
        }
      }
    } catch (error) {
      this.logger.error(`AFK check error: ${error.message}`);
    }
  }
}

module.exports = AFKDetector;
