/**
 * AdminCommandHandler - admin-only commands.
 * 
 * Commands: /glue, /.ai, /.grant, /.verbose
 */
class AdminCommandHandler {
  constructor(bot, logger) {
    this.bot = bot;
    this.logger = logger;
  }
  
  async process(text, senderId, senderName) {
    const raw = String(text || "").trim();
    if (!raw.startsWith('/')) return false;
    
    const [cmd, ...rest] = raw.split(/\s+/);
    const args = rest.join(" ");
    
    switch (cmd.toLowerCase()) {
      case '/glue':
        await this.handleGlue(senderId, senderName);
        return true;
      case '/.ai':
        await this.handleAI(args, senderId, senderName);
        return true;
      case '/.grant':
        await this.handleGrant(args, senderId, senderName);
        return true;
      case '/.verbose':
        await this.handleVerbose(senderId, senderName);
        return true;
      case '/.restart':
      case '/.reboot':
        await this.handleRestart(senderId, senderName);
        return true;
      case '/.shutdown':
      case '/.stop':
        await this.handleShutdown(senderId, senderName);
        return true;
      default:
        return false; // Not an admin command
    }
  }
  
  async handleGlue(senderId, senderName) {
    try {
      // Check if user is mod or co-owner
      const isMod = await this.isUserModerator(senderId);
      const isCoOwner = await this.isUserCoOwner(senderId);
      
      if (!isMod && !isCoOwner) {
        await this.bot.chat.sendMessage(
          this.bot.config.roomId,
          `❌ Access denied. Only mods and co-owners can use /glue.`
        );
        return;
      }
      
      // Toggle glue status
      if (this.bot.gluedToFloor) {
        // Unglue
        this.bot.gluedToFloor = false;
        this.bot.lastGlueStatusLog = null;
        await this.bot.chat.sendMessage(
          this.bot.config.roomId,
          `🔓 **BOT UNGLUED** 🔓\n**Bot can now auto-hop up to stage.**\n**Unglued by:** ${senderName}`
        );
        this.logger.log(`🔓 Bot unglued by ${senderName}`);
      } else {
        // Glue to floor
        this.bot.gluedToFloor = true;
        
        // Remove from stage if on stage
        const isOnStage = this.bot.isUserOnStage(this.bot.config.userId);
        if (isOnStage) {
          this.logger.log(`🔒 Bot on stage - removing...`);
          await this.bot.hopDownFromStage();
          await this.bot.chat.sendMessage(
            this.bot.config.roomId,
            `🔒 **BOT GLUED TO FLOOR** 🔒\n**Bot removed from stage and cannot auto-hop up.**\n**Glued by:** ${senderName}`
          );
        } else {
          await this.bot.chat.sendMessage(
            this.bot.config.roomId,
            `🔒 **BOT GLUED TO FLOOR** 🔒\n**Bot cannot auto-hop up to stage.**\n**Glued by:** ${senderName}`
          );
        }
        
        this.logger.log(`🔒 Bot glued to floor by ${senderName}`);
      }
    } catch (error) {
      this.logger.error(`Glue command error: ${error.message}`);
      await this.bot.chat.sendMessage(
        this.bot.config.roomId,
        `❌ **Glue Error:** Failed to execute command.`
      );
    }
  }
  
  async isUserModerator(userId) {
    try {
      const state = this.bot.socket.getState();
      const user = state.allUserData?.[userId];
      return user?.role === 'moderator' || user?.role === 'admin';
    } catch (error) {
      this.logger.error(`Error checking moderator: ${error.message}`);
      return false;
    }
  }
  
  async isUserCoOwner(userId) {
    try {
      const state = this.bot.socket.getState();
      const room = state.room;
      return room?.coOwnerUuids?.includes(userId) || room?.ownerUuid === userId;
    } catch (error) {
      this.logger.error(`Error checking co-owner: ${error.message}`);
      return false;
    }
  }
  
  async handleAI(args, senderId, senderName) {
    try {
      // Check permissions
      const isMod = await this.isUserModerator(senderId);
      const isCoOwner = await this.isUserCoOwner(senderId);
      
      if (!isMod && !isCoOwner) {
        await this.bot.chat.sendMessage(
          this.bot.config.roomId,
          `❌ Access denied. Only mods and co-owners can use /.ai`
        );
        return;
      }
      
      const provider = args.toLowerCase().trim();
      const validProviders = ['openai', 'gemini', 'huggingface', 'auto', 'off'];
      
      if (!validProviders.includes(provider)) {
        await this.bot.chat.sendMessage(
          this.bot.config.roomId,
          `❌ Invalid provider. Options: openai, gemini, huggingface, auto, off`
        );
        return;
      }
      
      // Switch AI provider
      await this.bot.ai.switchProvider(provider);
      
      await this.bot.chat.sendMessage(
        this.bot.config.roomId,
        `✅ AI provider switched to: **${provider}**\nChanged by: ${senderName}`
      );
      this.logger.log(`🤖 AI provider changed to ${provider} by ${senderName}`);
      
    } catch (error) {
      this.logger.error(`AI command error: ${error.message}`);
      await this.bot.chat.sendMessage(
        this.bot.config.roomId,
        `❌ Failed to switch AI provider.`
      );
    }
  }
  
  async handleGrant(args, senderId, senderName) {
    try {
      // Check permissions
      const isCoOwner = await this.isUserCoOwner(senderId);
      
      if (!isCoOwner) {
        await this.bot.chat.sendMessage(
          this.bot.config.roomId,
          `❌ Access denied. Only co-owners can use /.grant`
        );
        return;
      }
      
      // Parse args: @user or <uid:x> or userId, then amount
      const parts = args.trim().split(/\s+/);
      if (parts.length < 2) {
        await this.bot.chat.sendMessage(
          this.bot.config.roomId,
          `❌ Usage: /.grant <@user|<uid:x>|userId> <amount>`
        );
        return;
      }
      
      let targetId = null;
      let targetName = 'Unknown';
      
      // Parse user mention or ID
      if (parts[0].startsWith('@')) {
        targetName = parts[0].substring(1);
        // TODO: Look up user ID from name
        await this.bot.chat.sendMessage(
          this.bot.config.roomId,
          `❌ @mention lookup not yet implemented. Use <uid:userId> format.`
        );
        return;
      } else if (parts[0].startsWith('<uid:') && parts[0].endsWith('>')) {
        targetId = parts[0].slice(5, -1);
      } else {
        targetId = parts[0];
      }
      
      const amount = parseInt(parts[1]);
      
      if (isNaN(amount)) {
        await this.bot.chat.sendMessage(
          this.bot.config.roomId,
          `❌ Invalid amount. Must be a number.`
        );
        return;
      }
      
      // Update user's bankroll
      const userStats = this.bot.stats.getUserStats(targetId);
      const oldBankroll = userStats.bankroll || 1000;
      userStats.bankroll = (userStats.bankroll || 1000) + amount;
      this.bot.stats.saveUserStats();
      
      await this.bot.chat.sendMessage(
        this.bot.config.roomId,
        `💰 **Bankroll Grant**\nUser: ${targetName}\nAmount: ${amount > 0 ? '+' : ''}${amount}\nNew Balance: ${userStats.bankroll}\nGranted by: ${senderName}`
      );
      this.logger.log(`💰 ${senderName} granted ${amount} to ${targetId} (${oldBankroll} → ${userStats.bankroll})`);
      
    } catch (error) {
      this.logger.error(`Grant command error: ${error.message}`);
      await this.bot.chat.sendMessage(
        this.bot.config.roomId,
        `❌ Grant failed.`
      );
    }
  }
  
  async handleVerbose(senderId, senderName) {
    try {
      // Check permissions
      const isMod = await this.isUserModerator(senderId);
      const isCoOwner = await this.isUserCoOwner(senderId);
      
      if (!isMod && !isCoOwner) {
        await this.bot.chat.sendMessage(
          this.bot.config.roomId,
          `❌ Access denied. Only mods and co-owners can use /.verbose`
        );
        return;
      }
      
      // Toggle verbose mode
      this.bot.logger.verbose = !this.bot.logger.verbose;
      
      await this.bot.chat.sendMessage(
        this.bot.config.roomId,
        `🔧 Verbose logging: **${this.bot.logger.verbose ? 'ON' : 'OFF'}**\nToggled by: ${senderName}`
      );
      this.logger.log(`🔧 Verbose mode ${this.bot.logger.verbose ? 'enabled' : 'disabled'} by ${senderName}`);
      
    } catch (error) {
      this.logger.error(`Verbose command error: ${error.message}`);
    }
  }
  
  async handleRestart(senderId, senderName) {
    try {
      // Check permissions
      const isCoOwner = await this.isUserCoOwner(senderId);
      
      if (!isCoOwner) {
        await this.bot.chat.sendMessage(
          this.bot.config.roomId,
          `❌ Access denied. Only co-owners can restart the bot.`
        );
        return;
      }
      
      await this.bot.chat.sendMessage(
        this.bot.config.roomId,
        `🔄 **BOT RESTARTING**\nInitiated by: ${senderName}\n\nBot will reconnect shortly...`
      );
      this.logger.log(`🔄 Bot restart requested by ${senderName}`);
      
      // Give time for message to send, then exit
      setTimeout(() => {
        this.logger.log('🔄 Restarting bot...');
        process.exit(0); // Exit cleanly (PM2/forever will restart)
      }, 2000);
      
    } catch (error) {
      this.logger.error(`Restart command error: ${error.message}`);
    }
  }
  
  async handleShutdown(senderId, senderName) {
    try {
      // Check permissions
      const isCoOwner = await this.isUserCoOwner(senderId);
      
      if (!isCoOwner) {
        await this.bot.chat.sendMessage(
          this.bot.config.roomId,
          `❌ Access denied. Only co-owners can shutdown the bot.`
        );
        return;
      }
      
      await this.bot.chat.sendMessage(
        this.bot.config.roomId,
        `🛑 **BOT SHUTTING DOWN**\nInitiated by: ${senderName}\n\nGoodbye! 👋`
      );
      this.logger.log(`🛑 Bot shutdown requested by ${senderName}`);
      
      // Give time for message to send, then exit
      setTimeout(() => {
        this.logger.log('🛑 Shutting down bot...');
        process.exit(0);
      }, 2000);
      
    } catch (error) {
      this.logger.error(`Shutdown command error: ${error.message}`);
    }
  }
}

module.exports = AdminCommandHandler;
