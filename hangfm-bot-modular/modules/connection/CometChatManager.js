// Path: hangfm-bot-modular/modules/connection/CometChatManager.js
// Node-friendly CometChat wrapper (SDK v3.x). No external Logger required.
// Exposes: constructor(config), connect(), on(event, fn), sendTextToRoom(text), sendTextToUser(uid, text), getSelf(), ensureJoinedGroup(guid)

const { CometChat } = require("@cometchat-pro/chat");

class CometChatManager {
  /**
   * @param {object} config - from Config.js
   * Required keys: COMETCHAT_APP_ID, COMETCHAT_REGION, COMETCHAT_AUTH
   * Optional keys: COMETCHAT_GROUP_GUID or ROOM_UUID (used as fallback group GUID)
   */
  constructor(config) {
    this.config = config || {};
    this.appId = this.config.COMETCHAT_APP_ID || this.config.cometChatAppId;
    this.region = this.config.COMETCHAT_REGION || this.config.cometChatRegion;
    this.authToken = this.config.COMETCHAT_AUTH || this.config.cometChatAuth; // Auth token from /comet-chat/user-token or /ghost-token

    // Prefer explicit CometChat group; otherwise fallback to room uuid
    this.groupGuid = this.config.COMETCHAT_GROUP_GUID || this.config.ROOM_UUID || this.config.roomId;

    this._inited = false;
    this._loggedIn = false;
    this._listeners = new Map();
    this._listenerKey = `hangfm-bot-${Date.now()}`;
    this._joinedGroups = new Set();
  }

  _log(...args) { console.log("[CometChatManager]", ...args); }
  _err(...args) { console.error("[CometChatManager]", ...args); }

  /** Initialize SDK once */
  async init() {
    if (this._inited) return;
    if (!this.appId || !this.region) {
      throw new Error("CometChat init missing COMETCHAT_APP_ID or COMETCHAT_REGION");
    }

    const appSettings = new CometChat.AppSettingsBuilder()
      .subscribePresenceForAllUsers()
      .setRegion(this.region)
      .autoEstablishSocketConnection(true)
      .build();

    try {
      await CometChat.init(this.appId, appSettings);
      this._inited = true;
      this._log("Initialized (region:", this.region, ")");
    } catch (e) {
      this._err("Initialization failed:", e);
      throw e;
    }
  }

  /** Login with authToken */
  async login() {
    if (this._loggedIn) return this.getSelf();
    if (!this.authToken) throw new Error("COMETCHAT_AUTH is missing");

    try {
      // v3 login signature supports passing an object with authToken
      const user = await CometChat.login({ authToken: this.authToken });
      this._loggedIn = true;
      this._self = user;
      this._log("Logged in as:", user?.uid || user?.getUid?.());

      // Attach unified listener
      CometChat.addMessageListener(
        this._listenerKey,
        new CometChat.MessageListener({
          onTextMessageReceived: (msg) => this._emit("message", msg),
          onCustomMessageReceived: (msg) => this._emit("custom", msg),
          onMessageEdited: (msg) => this._emit("edited", msg),
          onMessageDeleted: (msg) => this._emit("deleted", msg),
        })
      );

      return user;
    } catch (e) {
      this._err("Login failed:", e);
      throw e;
    }
  }

  /** Public: connect -> init + login + (optional) join default group */
  async connect() {
    await this.init();
    const user = await this.login();
    
    // Auto-join default group if configured
    if (this.groupGuid) {
      await this.ensureJoinedGroup(this.groupGuid);
    }
    
    return user;
  }

  /** Join a CometChat group (idempotent) */
  async ensureJoinedGroup(guid) {
    if (!guid) return;
    if (this._joinedGroups.has(guid)) {
      this._log("Already joined group:", guid);
      return;
    }

    try {
      const group = await CometChat.getGroup(guid);
      if (!group.hasJoined) {
        await CometChat.joinGroup(guid, CometChat.GROUP_TYPE.PUBLIC, "");
        this._log("Joined group:", guid);
      } else {
        this._log("Already a member of group:", guid);
      }
      this._joinedGroups.add(guid);
    } catch (e) {
      // Group might not exist or already joined
      this._log("ensureJoinedGroup:", e.message || e);
    }
  }

  /** Event emitter */
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
  }

  _emit(event, ...args) {
    const fns = this._listeners.get(event);
    if (fns) fns.forEach((fn) => fn(...args));
  }

  /** Send text message to a group */
  async sendTextToRoom(text, guid = null) {
    const targetGuid = guid || this.groupGuid;
    if (!targetGuid) throw new Error("No group GUID specified");

    const msg = new CometChat.TextMessage(
      targetGuid,
      text,
      CometChat.RECEIVER_TYPE.GROUP
    );

    try {
      await CometChat.sendMessage(msg);
      this._log("Sent to group:", text.substring(0, 50));
    } catch (e) {
      this._err("Send to group failed:", e);
      throw e;
    }
  }

  /** Send text message to a user */
  async sendTextToUser(uid, text) {
    const msg = new CometChat.TextMessage(
      uid,
      text,
      CometChat.RECEIVER_TYPE.USER
    );

    try {
      await CometChat.sendMessage(msg);
      this._log("Sent to user:", uid, text.substring(0, 50));
    } catch (e) {
      this._err("Send to user failed:", e);
      throw e;
    }
  }

  /** Get logged-in user */
  getSelf() {
    return this._self;
  }

  /** Get logged-in user's UID */
  getSelfUid() {
    return this._self?.uid || this._self?.getUid?.();
  }
}

module.exports = CometChatManager;
