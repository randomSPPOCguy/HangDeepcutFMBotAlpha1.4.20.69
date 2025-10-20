// File: hangfm-bot-modular/modules/connection/CometChatManager.js

if (typeof window === 'undefined') {
  global.window = {}; // Shim to prevent SDK crash in Node.js
}

const { CometChat } = require('@cometchat-pro/chat');

class CometChatManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger || console;
    this.cometChatAppId = config.cometChatAppId;
    this.region = config.cometChatRegion;
    this.apiKey = config.cometChatAuth;
  }

  async init() {
    try {
      await CometChat.init(this.cometChatAppId, new CometChat.AppSettingsBuilder()
        .subscribePresenceForAllUsers()
        .setRegion(this.region)
        .build());
      this.logger.info('[CometChat] Initialized successfully');
    } catch (error) {
      this.logger.error('[CometChat] Initialization failed:', error);
      throw error;
    }
  }

  async login(userId) {
    try {
      const user = await CometChat.login(userId, this.apiKey);
      this.logger.info(`[CometChat] Logged in as ${user.getUid()}`);
      return user;
    } catch (error) {
      this.logger.error('[CometChat] Login failed:', error);
      throw error;
    }
  }

  async connect() {
    // Wrapper method that calls init() and login()
    await this.init();
    // Note: login is called separately in hang-fm-bot.js after connect
    return true;
  }
}

module.exports = CometChatManager;
