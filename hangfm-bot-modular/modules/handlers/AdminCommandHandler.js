/**
 * AdminCommandHandler - admin-only commands.
 * TODO: Port /.ai, /.grant, /glue, etc.
 */
class AdminCommandHandler {
  constructor(bot, logger){ this.bot = bot; this.logger = logger; }
  async process(text, senderId, senderName){ /* TODO */ }
}
module.exports = AdminCommandHandler;
