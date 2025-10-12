// Slim entry point for hang-fm-simple
const HangFmBot = require('./modules/core/Bot');

(async () => {
  const bot = new HangFmBot();
  try {
    await bot.start();
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }

  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down bot...');
    process.exit(0);
  });
})();
