// Path: hangfm-bot-modular/modules/handlers/EventHandler.js
// Responsibilities:
// - Detect AI keywords ("bot" variations) and dispatch to AI manager
// - Handle slash commands
// - Deduplicate by message id
// - Content safety + spam guard hooks

// Lightweight logger
const log = (...a) => console.log("[EventHandler]", ...a);
const err = (...a) => console.error("[EventHandler]", ...a);

// Optional utilities (present in your repo). If missing, the handler still works.
let ContentFilter = null;
try { ContentFilter = require("../features/ContentFilter"); } catch {}
let SpamProtection = null;
try { SpamProtection = require("../utils/SpamProtection"); } catch {}

// Normalized keyword matchers (covers common obfuscations + Greek omicron)
const AI_KEYWORDS = [
  /\bb[o0\u03BF]t\b/i,           // bot, b0t, bοt (Greek omicron)
  /\bb[o0]t2\b/i,                // bot2
  /\bb0\+\b/i,                   // b0+
  /\bb[o0]t\w*/i,                // bot* ("bot, bots, botty")
];

// Simple TTL cache for dedup by message id
class TTLSet {
  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttl = ttlMs;
    this.map = new Map();
    setInterval(() => this._sweep(), Math.min(this.ttl, 60_000)).unref?.();
  }
  has(id) {
    const v = this.map.get(id);
    return !!v && v > Date.now();
  }
  add(id) {
    this.map.set(id, Date.now() + this.ttl);
  }
  _sweep() {
    const now = Date.now();
    for (const [k, exp] of this.map) if (exp <= now) this.map.delete(k);
  }
}

class EventHandler {
  /**
   * @param {object} deps
   *  - chat: CometChatManager instance
   *  - ai: AIManager instance (must expose generateResponse({ text, senderUid, roomId }))
   *  - config: Config (must include ROOM_UUID or COMETCHAT_GROUP_GUID)
   */
  constructor({ chat, ai, config }) {
    this.chat = chat;
    this.ai = ai;
    this.config = config || {};

    this.roomGuid = this.config.COMETCHAT_GROUP_GUID || this.config.ROOM_UUID || this.config.roomId;
    this.seen = new TTLSet(10 * 60 * 1000); // 10m

    // Optional protections
    this.filter = ContentFilter ? new ContentFilter(this.config) : null;
    this.spam = SpamProtection ? new SpamProtection(this.config) : null;
  }

  /** Wire CometChat incoming messages to this handler */
  bind() {
    this.chat.on("message", (msg) => this.handleIncomingMessage(msg));
    log("bound to chat onMessage");
  }

  _isFromSelf(msg) {
    const self = this.chat.getSelfUid();
    const sender = msg?.sender?.uid || msg?.getSender?.()?.getUid?.();
    return self && sender && String(self).toLowerCase() === String(sender).toLowerCase();
  }

  _extractText(msg) {
    return msg?.text || msg?.getText?.() || "";
  }

  _extractId(msg) {
    return msg?.id || msg?.getId?.() || `${msg?.sentAt || Date.now()}-${Math.random()}`;
  }

  _extractSenderUid(msg) {
    return msg?.sender?.uid || msg?.getSender?.()?.getUid?.() || null;
  }

  _extractSenderName(msg) {
    return msg?.sender?.name || msg?.getSender?.()?.getName?.() || "User";
  }

  async handleIncomingMessage(msg) {
    // 1) Dedup by ID only
    const msgId = this._extractId(msg);
    if (this.seen.has(msgId)) {
      log("(duplicate id, skipped)");
      return;
    }
    this.seen.add(msgId);

    // 2) Ignore self
    if (this._isFromSelf(msg)) {
      log("(self message, skipped)");
      return;
    }

    const text = this._extractText(msg);
    if (!text.trim()) return;

    const senderUid = this._extractSenderUid(msg);
    const senderName = this._extractSenderName(msg);

    log("New message:", text.substring(0, 60));

    // 3) Slash commands
    if (text.startsWith("/")) {
      await this.handleCommand(text, senderUid, senderName);
      return;
    }

    // 4) AI keyword detection
    const hasKeyword = AI_KEYWORDS.some((rx) => rx.test(text));
    if (!hasKeyword) return;

    log("🎯 AI keyword detected:", text.substring(0, 60));

    // 5) Spam guard (optional)
    if (this.spam && !this.spam.checkAI?.(senderUid)) {
      log("⛔ Spam limit for", senderUid);
      return;
    }

    // 6) Content filter (optional)
    if (this.filter) {
      const safe = await this._checkSafety(text);
      if (!safe) {
        log("🚫 Content blocked");
        return;
      }
    }

    // 7) Generate AI response
    try {
      const response = await this.ai.generateResponse({
        text,
        senderUid,
        senderName,
        roomId: this.roomGuid,
      });

      if (response && response.trim()) {
        log("🤖 AI response:", response.substring(0, 60));
        await this.chat.sendTextToRoom(response);
      } else {
        log("⚠️ AI returned empty response");
      }
    } catch (e) {
      err("AI generation failed:", e);
    }
  }

  async _checkSafety(text) {
    // Link safety
    const linkRegex = /https?:\/\/\S+|www\.\S+\.\S+|bit\.ly\/\S+|t\.co\/\S+/i;
    const linkMatch = text.match(linkRegex);
    if (linkMatch) {
      const url = linkMatch[0];
      const isSafe = this.filter.checkLinkSafety ? await this.filter.checkLinkSafety(url) : true;
      if (!isSafe) {
        log("🚫 Unsafe link:", url);
        await this.chat.sendTextToRoom("🚫 Unsafe links are not allowed in AI prompts");
        return false;
      }
    }

    // Hateful content
    if (this.filter.checkHatefulContent) {
      const isHateful = await this.filter.checkHatefulContent(text);
      if (isHateful) {
        log("🚫 Hateful content detected");
        return false;
      }
    }

    return true;
  }

  async handleCommand(text, senderUid, senderName) {
    const cmd = text.split(" ")[0].toLowerCase();

    log("Command:", cmd);

    switch (cmd) {
      case "/help":
        await this.chat.sendTextToRoom(
          "🤖 Commands: /help, /ping, /stats\n" +
          "Say 'bot' to trigger AI!"
        );
        break;

      case "/ping":
        await this.chat.sendTextToRoom("🏓 Pong!");
        break;

      case "/stats":
        await this.chat.sendTextToRoom(
          `📊 Bot is online and listening for AI keywords!`
        );
        break;

      default:
        log("Unknown command:", cmd);
    }
  }
}

module.exports = EventHandler;
