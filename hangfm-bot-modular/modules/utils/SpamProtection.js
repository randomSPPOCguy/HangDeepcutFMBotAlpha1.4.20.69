/**
 * SpamProtection - Rate limiting and spam detection
 */
class SpamProtection {
  constructor(logger) {
    this.logger = logger;
    
    // General spam protection
    this.userCooldowns = new Map(); // userId -> { count, lastReset, flaggedForSpam }
    this.cooldownLimit = 3;
    this.cooldownPeriod = 2.5 * 60 * 1000; // 2.5 minutes
    
    // AI keyword spam protection
    this.aiSpamUsers = new Map(); // userId -> { count, lastReset, ignored }
    this.aiSpamLimit = 3;
    this.aiSpamPeriod = 2.5 * 60 * 1000;
    this.aiGrantedUsers = new Set(); // Users with unlimited AI access
  }

  async checkSpamProtection(userId, isCoOwner = false, isMod = false, isRegular = false) {
    const now = Date.now();
    
    // Co-owners and mods bypass spam filter
    if (isCoOwner || isMod) {
      return true;
    }
    
    const userCooldown = this.userCooldowns.get(userId);
    
    if (!userCooldown) {
      this.userCooldowns.set(userId, { count: 1, lastReset: now, flaggedForSpam: false });
      return true;
    }
    
    // Check if cooldown period expired
    if (now - userCooldown.lastReset > this.cooldownPeriod) {
      userCooldown.count = 1;
      userCooldown.lastReset = now;
      return true;
    }
    
    // Different thresholds for regular vs new users
    const spamThreshold = isRegular ? 5 : 3;
    
    if (userCooldown.count >= spamThreshold) {
      if (!userCooldown.flaggedForSpam) {
        this.logger.warn(`User flagged for spam: ${userId}`);
        userCooldown.flaggedForSpam = true;
      }
      return false;
    }
    
    userCooldown.count++;
    return true;
  }

  async checkAiKeywordSpam(userId, message, keywordTriggers, isCoOwner = false, isMod = false) {
    const now = Date.now();
    const messageLower = message.toLowerCase();
    
    // Check if message contains AI keywords
    const hasAiKeyword = keywordTriggers.some(keyword => 
      messageLower.includes(keyword.toLowerCase())
    );
    
    if (!hasAiKeyword) {
      return true; // Not an AI keyword message
    }
    
    // Granted users and staff bypass
    if (this.aiGrantedUsers.has(userId) || isCoOwner || isMod) {
      return true;
    }
    
    const userSpam = this.aiSpamUsers.get(userId);
    
    if (!userSpam) {
      this.aiSpamUsers.set(userId, { count: 1, lastReset: now, ignored: false });
      return true;
    }
    
    // Check if user is being ignored
    if (userSpam.ignored && now - userSpam.lastReset < this.aiSpamPeriod) {
      return false;
    }
    
    // Check if cooldown expired
    if (now - userSpam.lastReset > this.aiSpamPeriod) {
      userSpam.count = 1;
      userSpam.lastReset = now;
      userSpam.ignored = false;
      return true;
    }
    
    userSpam.count++;
    
    if (userSpam.count > this.aiSpamLimit) {
      userSpam.ignored = true;
      userSpam.lastReset = now;
      this.logger.log(`🤐 User ${userId} ignored for AI spam`);
      return false;
    }
    
    return true;
  }

  grantUnlimitedAccess(userId) {
    this.aiGrantedUsers.add(userId);
  }

  revokeUnlimitedAccess(userId) {
    this.aiGrantedUsers.delete(userId);
  }

  hasUnlimitedAccess(userId) {
    return this.aiGrantedUsers.has(userId);
  }

  getAiSpamUsers() {
    return this.aiSpamUsers;
  }
}

module.exports = SpamProtection;
