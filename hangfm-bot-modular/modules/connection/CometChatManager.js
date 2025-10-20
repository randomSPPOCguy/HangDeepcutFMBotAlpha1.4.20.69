// hangfm-bot-modular/modules/connection/CometChatManager.js

// Node.js shim for CometChat SDK (browser-only SDK)
if (typeof window === 'undefined') {
  global.window = {};
}

const {
  CometChat,
  AppSettingsBuilder,
  AppSettings,
  TextMessage,
} = require('@cometchat-pro/chat');

const Config = require('../../Config');

class CometChatManager {
  constructor() {
    this._ready = false;
    this._loggedIn = false;
  }

  async init() {
    if (this._ready) return;

    const { COMETCHAT_APP_ID, COMETCHAT_REGION } = Config;
    if (!COMETCHAT_APP_ID || !COMETCHAT_REGION) {
      throw new Error('[CometChat] Missing COMETCHAT_APP_ID or COMETCHAT_REGION');
    }

    const settings = new AppSettingsBuilder()
      .setRegion(COMETCHAT_REGION)
      .subscribePresenceForAllUsers()
      .autoEstablishSocketConnection(true)
      .build();

    try {
      await CometChat.init(COMETCHAT_APP_ID, settings);
      this._ready = true;
      console.log('✅ [CometChat] init ok');
    } catch (err) {
      console.error('❌ [CometChat] Initialization failed:', err);
      throw err;
    }
  }

  async connect() {
    await this.init();
    if (this._loggedIn) return;

    // Prefer existing user session if present
    try {
      const existing = await CometChat.getLoggedinUser();
      if (existing) {
        this._loggedIn = true;
        console.log(`👤 [CometChat] already logged in as ${existing.getUid()}`);
        return;
      }
    } catch {}

    // Login with Auth Token (server generated token)
    try {
      const user = await CometChat.login(Config.COMETCHAT_AUTH);
      console.log(`👤 [CometChat] logged in as ${user.getUid()}`);
      this._loggedIn = true;
    } catch (err) {
      console.error('❌ [CometChat] Login failed:', err);
      throw err;
    }
  }

  /**
   * Attach message listener for text/custom messages
   */
  addMessageListener(listenerId, { onTextMessageReceived, onCustomMessageReceived }) {
    CometChat.addMessageListener(
      listenerId,
      new CometChat.MessageListener({
        onTextMessageReceived: (m) => onTextMessageReceived && onTextMessageReceived(m),
        onCustomMessageReceived: (m) => onCustomMessageReceived && onCustomMessageReceived(m),
      })
    );
  }

  /**
   * Send a text to a GROUP
   */
  async sendTextToGroup(groupGuid, text) {
    const msg = new TextMessage(groupGuid, text, CometChat.RECEIVER_TYPE.GROUP);
    return CometChat.sendMessage(msg);
  }
}

module.exports = new CometChatManager();
