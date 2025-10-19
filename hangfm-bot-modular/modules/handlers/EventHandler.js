"use strict";

/**
 * EventHandler — routes chat → admin/user command handlers, tracks AFK,
 * optional AI reply on mention.
 *
 * v4:
 *  - understands ttfm-socket shapes: userSpoke/speak/chat/userMessage
 *  - understands wrapper packets: { message: { name, payload:{text,...} } }
 *  - existing CometChat / generic shapes retained
 */
class EventHandler {
  constructor(bot, logger) {
    this.bot = bot;
    this.logger = logger;
    this.roomId = bot?.config?.roomId;
  }

  async handleChatMessage(message) {
    try {
      const { userId, userName, text } = this.parseChatMessage(message);
      if (!text) return;

      this.logger?.log?.(`💬 ${userName || "Unknown"}: ${text}`);

      // AFK touch (guarded)
      try {
        if (userId && this.bot?.afk?.trackActivity) this.bot.afk.trackActivity(userId);
      } catch (e) {
        this.logger?.debug?.(`AFK track skipped: ${e?.message || e}`);
      }

      // Admin-only commands (/.ai, /.grant, /glue, /.verbose)
      if (text.startsWith('/.') || /^\/glue\b/i.test(text) || /^\/\.?verbose\b/i.test(text)) {
        if (userId && this.bot?.spam?.canUseCommand && !this.bot.spam.canUseCommand(userId)) return;
        const handledAdmin = await this.bot?.admin?.process?.(text, userId, userName);
        if (handledAdmin) { this.bot?.spam?.recordCommandUsage?.(userId); return; }
      }

      // User slash commands
      if (text.startsWith('/')) {
        this.logger?.debug?.(`[cmd] recognized: ${text}`);
        if (userId && this.bot?.spam?.canUseCommand && !this.bot.spam.canUseCommand(userId)) return;
        const handled = await this.bot?.commands?.processCommand?.(text, userId, userName);
        if (handled) { this.bot?.spam?.recordCommandUsage?.(userId); return; }
        this.logger?.debug?.(`[cmd] not handled by CommandHandler: ${text}`);
      }

      // Optional: AI on mention
      if (this.bot?.ai?.isEnabled && this.bot.ai.isEnabled()) {
        const name = this.bot?.config?.botName || '';
        const mentioned = name && new RegExp(`\\b${name.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\\\$&')}\\b`, 'i').test(text);
        if (mentioned && this.bot?.spam?.canUseAI?.(userId)) {
          const reply = await this.bot.ai.generateReply(text, { userId, userName });
          if (reply) await this.bot.say?.(this.roomId, reply);
          this.bot.spam?.recordAIUsage?.(userId);
          return;
        }
      }
    } catch (e) {
      this.logger?.error?.(`handleChatMessage error: ${e?.stack || e}`);
    }
  }

  async handlePlayedSong(payload) {
    try {
      const state = this.bot?.socket?.state || {};
      const djs = state?.room?.djs || [];
      const botId = String(this.bot?.config?.userId || '');
      const onStage = djs.map(String).includes(botId);
      if (!onStage) return;

      if (this.bot?.music?.selectSong) {
        try {
          const next = await this.bot.music.selectSong(state?.room?.history || [], true);
          if (next && this.bot?.queue?.add) this.bot.queue.add(next);
        } catch (selErr) {
          this.logger?.warn?.(`Song selection failed: ${selErr.message}`);
        }
      }
    } catch (e) {
      this.logger?.error?.(`handlePlayedSong error: ${e?.stack || e}`);
    }
  }

  // ===== Helpers =====

  parseChatMessage(message) {
    // 0) Bare string message
    if (typeof message === 'string') {
      return { userId: '', userName: 'Unknown', text: String(message) };
    }

    // 1) Wrapper packets from ttfm-socket: { message: { name, payload } }
    //    We care about message.name ∈ { userSpoke, speak, chat, userMessage }
    const wrapper = message?.message || message?.data?.message;
    if (wrapper && typeof wrapper === 'object' && wrapper.name) {
      const lower = String(wrapper.name).toLowerCase();
      if (['userspoke','speak','chat','usermessage','user_spoke','user_message'].includes(lower)) {
        const p = wrapper.payload || wrapper.data || wrapper.args || wrapper.body || {};
        const text = firstTruthy(p.text, p.message, wrapper.text, message?.text, '');
        const userId = firstTruthy(p.userId, p.userid, p.uid, p.user?.id, wrapper.userId, wrapper.userid, message?.userId, '');
        const userName = firstTruthy(p.username, p.name, p.user?.name, wrapper.username, wrapper.name, 'Unknown');
        return { userId: String(userId || ''), userName: String(userName || 'Unknown'), text: String(text || '') };
      }
    }

    // 2) Raw socket “chat” style objects: { name:'userSpoke', text:'...', userid/name }
    if (message && (message.name || message.type)) {
      const n = String(message.name || message.type).toLowerCase();
      if (['userspoke','speak','chat','usermessage','user_spoke','user_message'].includes(n)) {
        const p = message.payload || message.data || message.args || message.body || {};
        const text = firstTruthy(message.text, p.text, p.message, '');
        const userId = firstTruthy(message.userId, message.userid, p.userId, p.userid, '');
        const userName = firstTruthy(message.username, message.name, p.username, p.name, 'Unknown');
        return { userId: String(userId || ''), userName: String(userName || 'Unknown'), text: String(text || '') };
      }
    }

    // 3) CometChat TextMessage shape: { text, sender:{ uid, name } }
    if (message && typeof message.text === 'string' && message.sender) {
      const uid = message.sender.uid || message.sender.id || message.sender.userId;
      const name = message.sender.name || message.sender.username || 'Unknown';
      return { userId: String(uid || ''), userName: String(name), text: String(message.text) };
    }

    // 4) Generic wrapped form { data: { text, userProfile: { uuid, name } } }
    const data = message?.data || message || {};
    const text = firstTruthy(data.text, data.message, data.body, '');
    const profile = data.userProfile || data.profile || data.sender || {};
    const userId = firstTruthy(profile.uuid, profile.id, profile.userId, profile.uid, data.userId, '');
    const userName = firstTruthy(profile.name, profile.username, profile.handle, 'Unknown');

    return { userId: String(userId || ''), userName: String(userName || 'Unknown'), text: String(text || '') };
  }
}

// tiny helper for selecting first non-empty value
function firstTruthy(...xs) {
  for (const x of xs) {
    if (x !== undefined && x !== null && String(x).length > 0) return x;
  }
  return undefined;
}

module.exports = EventHandler;



