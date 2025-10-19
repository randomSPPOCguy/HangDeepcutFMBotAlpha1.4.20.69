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

      // Optional: AI on keyword triggers
      if (this.bot?.ai?.isEnabled && this.bot.ai.isEnabled()) {
        // Check for keyword triggers (bot, b0t, etc.)
        const keywords = this.bot?.config?.keywordTriggers || ['bot', 'b0t', 'bot2', 'b0t2', '@bot2'];
        const textLower = text.toLowerCase();
        const hasKeyword = keywords.some(kw => textLower.includes(kw.toLowerCase()));
        
        if (hasKeyword && userId !== this.bot?.config?.userId && this.bot?.spam?.canUseAI?.(userId)) {
          this.logger?.log?.(`🎯 AI keyword detected: ${text}`);
          
          // CONTENT FILTERING - Block links before AI
          const linkRegex = /https?:\/\/\S+/i;
          if (linkRegex.test(text)) {
            this.logger?.warn?.(`🚫 Blocked AI trigger with link: ${text.substring(0, 50)}`);
            await this.bot?.chat?.sendMessage?.(this.roomId, '🚫 Links are not allowed in AI prompts');
            return;
          }
          
          // CONTENT FILTERING - Check for inappropriate content
          if (this.bot?.filter?.isInappropriate) {
            const filtered = await this.bot.filter.isInappropriate(text);
            if (filtered) {
              this.logger?.warn?.(`🚫 Blocked inappropriate AI trigger: ${text.substring(0, 50)}`);
              return; // Silently ignore
            }
          }
          
          // Get current song info from state
          const currentSong = this.bot?.socket?.state?.room?.nowPlaying || this.bot?.socket?.state?.room?.currentSong;
          const roomState = this.bot?.socket?.state;
          
          try {
            // Generate AI response with error handling
            const reply = await this.bot.ai.generateResponse(text, userId, userName, currentSong, roomState);
            
            if (reply && reply.trim()) {
              await this.bot?.chat?.sendMessage?.(this.roomId, reply);
              this.logger?.log?.(`🤖 AI response: ${reply}`);
              this.bot.spam?.recordAIUsage?.(userId);
            } else {
              this.logger?.warn?.('AI returned empty response');
            }
          } catch (aiError) {
            this.logger?.error?.(`AI generation failed: ${aiError.message}`);
            // Send friendly fallback
            await this.bot?.chat?.sendMessage?.(this.roomId, 'Sorry, I couldn\'t process that right now.');
          }
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



