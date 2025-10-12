/**
 * ChatHandler - chat message processing before commands/AI.
 * TODO: Port filtering, AFK checks, decorations.
 */
class ChatHandler {
  constructor(bot, logger){ this.bot = bot; this.logger = logger; }
  async handleChat(text, senderId, senderName){ /* TODO */ }
}
module.exports = ChatHandler;
