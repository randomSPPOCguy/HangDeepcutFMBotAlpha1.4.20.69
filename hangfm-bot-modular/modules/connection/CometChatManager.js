// hangfm-bot-modular/modules/connection/CometChatManager.js
// IMPORTANT: In Node, use classes from the CometChat namespace.
// Do NOT destructure AppSettingsBuilder/TextMessage from require().

const { CometChat } = require('@cometchat-pro/chat');
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

    // Build app settings using the namespace class
    let builder = new CometChat.AppSettingsBuilder().setRegion(COMETCHAT_REGION);

    // Keep these calls defensive across SDK minor versions
    if (typeof builder.subscribePresenceForAllUsers === 'function') {
      builder = builder.subscribePresenceForAllUsers();
    }
    if (typeof builder.autoEstablishSocketConnection === 'function') {
      builder = builder.autoEstablishSocketConnection(true);
    }

    const settings = builder.build();

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

    // Reuse existing session if present
    try {
      const existing = await CometChat.getLoggedinUser();
      if (existing) {
        this._loggedIn = true;
        console.log(`👤 [CometChat] already logged in as ${existing.getUid()}`);
        return;
      }
    } catch {
      // ignore
    }

    // Login with server-side Auth Token
    try {
      // Most SDKs accept auth token via login(token). If not, fallback to loginWithAuthToken.
      let user;
      try {
        user = await CometChat.login(Config.COMETCHAT_AUTH);
      } catch (e) {
        if (e && e.code === 'MISSING_PARAMETERS' || /parameter/i.test(String(e?.message))) {
          if (typeof CometChat.loginWithAuthToken === 'function') {
            user = await CometChat.loginWithAuthToken(Config.COMETCHAT_AUTH);
          } else {
            throw e;
          }
        } else {
          throw e;
        }
      }

      console.log(`👤 [CometChat] logged in as ${user.getUid()}`);
      this._loggedIn = true;
    } catch (err) {
      console.error('❌ [CometChat] Login failed:', err);
      throw err;
    }
  }

  /**
   * Add message listener (text/custom)
   */
  addMessageListener(listenerId, { onTextMessageReceived, onCustomMessageReceived }) {
    CometChat.addMessageListener(
      listenerId,
      new CometChat.MessageListener({
        onTextMessageReceived: (m) =>
          typeof onTextMessageReceived === 'function' && onTextMessageReceived(m),
        onCustomMessageReceived: (m) =>
          typeof onCustomMessageReceived === 'function' && onCustomMessageReceived(m),
      })
    );
  }

  /**
   * Send text to GROUP
   */
  async sendTextToGroup(groupGuid, text) {
    const msg = new CometChat.TextMessage(groupGuid, text, CometChat.RECEIVER_TYPE.GROUP);
    return CometChat.sendMessage(msg);
  }
}

module.exports = new CometChatManager();
