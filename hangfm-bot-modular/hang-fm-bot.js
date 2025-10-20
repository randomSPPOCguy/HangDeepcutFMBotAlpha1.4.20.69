// hangfm-bot-modular/hang-fm-bot.js - SIMPLIFIED ENTRY POINT

const Config = require('./Config');
const chat = require('./modules/connection/CometChatManager');
const EventHandler = require('./modules/handlers/EventHandler');
const AIManager = require('./modules/ai/AIManager');

// Simple logger
const log = (...a) => console.log('[MAIN]', ...a);

(async function main() {
  try {
    log('🚀 Starting Hang.fm Modular Bot...');

    // Show loaded config (without secrets)
    log('Config loaded:', {
      ROOM_ID: Config.ROOM_ID,
      BOT_NAME: Config.BOT_NAME,
      AI_PROVIDER: Config.AI_PROVIDER,
      COMETCHAT_APP_ID: Config.COMETCHAT_APP_ID ? '✅' : '❌',
      COMETCHAT_REGION: Config.COMETCHAT_REGION,
      COMETCHAT_AUTH: Config.COMETCHAT_AUTH ? '✅' : '❌',
      GEMINI_API_KEY: Config.GEMINI_API_KEY ? '✅' : '❌',
    });

    // Connect to CometChat
    log('📡 Connecting to CometChat...');
    await chat.connect();
    log('✅ CometChat connected');

    // Initialize AI Manager
    log('🤖 Initializing AI Manager...');
    const ai = new AIManager(Config, console, null);
    log('✅ AI Manager initialized');

    // Initialize Event Handler
    log('📨 Setting up Event Handler...');
    const eventHandler = new EventHandler(ai);
    eventHandler.start();
    log('✅ Event Handler ready');

    // Send boot greeting
    log('📢 Sending boot greeting...');
    await chat.sendTextToGroup(Config.ROOM_ID, `✅ **${Config.BOT_NAME}** is online! Say "bot" to chat with me.`);
    log('✅ Boot greeting sent');

    log('🎉 Bot is fully operational!');
    log('💬 Listening for messages in room:', Config.ROOM_ID);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      log('👋 Shutting down...');
      process.exit(0);
    });

  } catch (err) {
    console.error('❌ Fatal error during startup:', err);
    console.error(err.stack);
    process.exit(1);
  }
})();
