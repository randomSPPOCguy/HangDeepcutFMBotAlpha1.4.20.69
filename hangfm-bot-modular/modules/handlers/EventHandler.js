// hangfm-bot-modular/modules/handlers/EventHandler.js
const chat = require('../connection/CometChatManager');
const Config = require('../../Config');
const ContentFilter = require('../utils/ContentFilter');

const KEYWORD_REGEXES = [
  /\bbot2\b/i,
  /\bb[o0ο]t\b/i,      // bot / b0t / bοt (omicron)
  /\bb0\+\b/i,         // b0+
];

// optional: mention by name
function hasBotMention(text, botName) {
  if (!botName) return false;
  const pat = new RegExp(`@?\\b${botName}\\b`, 'i');
  return pat.test(text);
}

class EventHandler {
  constructor(aiManager) {
    this.ai = aiManager;
    this.processed = new Set(); // store message IDs only
  }

  start() {
    chat.addMessageListener('bot-main-listener', {
      onTextMessageReceived: (msg) => this._handleText(msg),
    });
    console.log('✅ [EventHandler] Message listener registered');
  }

  async _handleText(message) {
    try {
      // Guard: group + correct room
      if (message.getReceiverType() !== 'group') return;
      if (message.getReceiver() !== Config.ROOM_ID) return;

      const id = message.getId();
      if (this.processed.has(id)) return;
      this.processed.add(id);

      const textRaw = message.getText() || '';
      const text = String(textRaw);
      const sender = message.getSender()?.getUid?.() || '';

      // Ignore our own messages
      if (sender && sender.toLowerCase() === Config.COMETCHAT_UID.toLowerCase()) return;

      // Basic safety filter
      if (!ContentFilter.isAllowed(text)) return;

      console.log(`📨 [EventHandler] New message: ${text.substring(0, 60)}`);

      // Commands first (examples)
      if (/^!help\b/i.test(text)) {
        await chat.sendTextToGroup(Config.ROOM_ID, 'Commands: !help, !stats, !queue, !now, !skip');
        return;
      }

      // AI keyword triggers
      const hasKeyword =
        KEYWORD_REGEXES.some((re) => re.test(text)) || hasBotMention(text, Config.BOT_NAME);

      if (hasKeyword) {
        console.log(`🎯 [EventHandler] AI keyword detected: ${text.substring(0, 60)}`);
        
        const reply = await this.ai.generateResponse({
          text,
          senderUid: sender,
          senderName: message.getSender()?.getName?.() || sender,
          username: message.getSender()?.getName?.() || sender,
          roomId: Config.ROOM_ID,
        });

        if (reply && reply.trim()) {
          console.log(`🤖 [EventHandler] AI reply: ${reply.substring(0, 60)}`);
          await chat.sendTextToGroup(Config.ROOM_ID, reply.trim());
        }
      }
    } catch (err) {
      console.error('⚠️ [EventHandler] onTextMessageReceived error:', err);
    }
  }
}

module.exports = EventHandler;
