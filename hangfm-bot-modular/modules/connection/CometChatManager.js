// File: hangfm-bot-modular/modules/connection/CometChatManager.js

if (typeof window === 'undefined') {
  global.window = {}; // Shim to prevent SDK crash in Node.js
}

const { CometChat } = require('@cometchat-pro/chat');
const Config = require('../core/Config');
const Logger = require('../utils/Logger');

class CometChatManager {
  constructor() {
    this.cometChatAppId = Config.COMETCHAT_APP_ID;
    this.region = Config.COMETCHAT_REGION;
    this.apiKey = Config.COMETCHAT_AUTH_KEY;
  }

  async init() {
    try {
      await CometChat.init(this.cometChatAppId, new CometChat.AppSettingsBuilder()
        .subscribePresenceForAllUsers()
        .setRegion(this.region)
        .build());
      Logger.info('[CometChat] Initialized successfully');
    } catch (error) {
      Logger.error('[CometChat] Initialization failed:', error);
      throw error;
    }
  }

  async login(userId) {
    try {
      const user = await CometChat.login(userId, this.apiKey);
      Logger.info(`[CometChat] Logged in as ${user.getUid()}`);
      return user;
    } catch (error) {
      Logger.error('[CometChat] Login failed:', error);
      throw error;
    }
  }
}

module.exports = CometChatManager;
