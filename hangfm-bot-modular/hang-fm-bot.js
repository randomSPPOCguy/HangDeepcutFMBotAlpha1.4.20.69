/* hang-fm-bot.js - MODULAR VERSION WITH COMETCHAT */
'use strict';

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// ---------- tiny logger ----------
const ts = () => {
  const d = new Date();
  const pad = (n, s = 2) => String(n).padStart(s, '0');
  return `[${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}]`;
};
const log = {
  debug: (...a) => console.log(`${ts()} DEBUG`, ...a),
  info:  (...a) => console.log(`${ts()} INFO `, ...a),
  warn:  (...a) => console.warn(`${ts()} WARN `, ...a),
  error: (...a) => console.error(`${ts()} ERROR`, ...a),
  log:   (...a) => console.log(`${ts()} LOG  `, ...a),
};

// ---------- load env (without printing any secrets) ----------
(function loadEnv() {
  log.debug('dotenv loaded');
  const candidates = [
    process.env.HANGFM_ENV_PATH && String(process.env.HANGFM_ENV_PATH),
    path.resolve(__dirname, '..', 'hang-fm-config.env'),  // Parent dir first
    path.resolve(process.cwd(), 'hang-fm-config.env'),    // Current working dir
    path.resolve(process.cwd(), '.env'),                   // .env in cwd
    path.resolve(__dirname, '.env'),                       // .env in module dir
  ].filter(Boolean);

  log.debug(`🔍 Searching for config in: ${candidates.join(', ')}`);

  let usedPath = null;
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        log.debug(`✅ Found config file: ${p}`);
        dotenv.config({ path: p });
        usedPath = p;
        break;
      } else {
        log.debug(`❌ Not found: ${p}`);
      }
    } catch (err) {
      log.debug(`❌ Error checking ${p}: ${err.message}`);
    }
  }
  
  log.info('Booting Hang.fm Modular…');
  
  if (!usedPath) {
    log.warn('⚠️  No config file found! Using environment variables or defaults.');
    log.log('🔧 [MODULAR] Loading config from: environment variables');
    dotenv.config(); // fallback to default .env if present
  } else {
    log.log(`🔧 [MODULAR] Loading config from: ${usedPath}`);
    try {
      log.log(`📊 [MODULAR] Data files will be shared from: ${path.dirname(usedPath)}`);
    } catch {
      /* noop */
    }
  }
  
  // Verify critical variables are loaded
  const criticalVars = ['ROOM_ID', 'USER_ID', 'BOT_USER_TOKEN', 'COMETCHAT_API_KEY'];
  const missing = criticalVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    log.error(`❌ MISSING CRITICAL VARIABLES: ${missing.join(', ')}`);
    log.error('❌ Bot cannot start without these! Check your config file.');
  } else {
    log.debug(`✅ All critical variables loaded`);
  }
})();

// ---------- Import modules ----------
const Config = require('./modules/core/Config');
const SocketManager = require('./modules/connection/SocketManager');
const CometChatManager = require('./modules/connection/CometChatManager');
const EventHandler = require('./modules/handlers/EventHandler');
const CommandHandler = require('./modules/handlers/CommandHandler');
const AdminCommandHandler = require('./modules/handlers/AdminCommandHandler');
const MusicSelector = require('./modules/music/MusicSelector');
const QueueManager = require('./modules/music/QueueManager');
const StatsManager = require('./modules/stats/StatsManager');
const AFKDetector = require('./modules/features/AFKDetector');
const StageManager = require('./modules/features/StageManager');
const SpamProtection = require('./modules/utils/SpamProtection');
const AIManager = require('./modules/ai/AIManager');
const ContentFilter = require('./modules/features/ContentFilter');

// ---------- Main ----------
(async function main() {
  try {
    // Load config
    const config = new Config();
    
    log.info('Config summary:', {
      env: config.env,
      roomId: config.roomId,
      botName: config.botName,
      aiProvider: config.aiProvider
    });

    // Create logger adapter for modules
    const logger = {
      debug: log.debug,
      info: log.info,
      warn: log.warn,
      error: log.error,
      log: log.log
    };

    // Initialize Socket Manager
    log.log('📡 Creating SocketClient...');
    const socket = new SocketManager({
      url: config.websocketUrl,
      token: config.botToken,
      roomId: config.roomId
    }, logger);
    log.log('✅ SocketClient created');

    // Initialize CometChat Manager
    log.info('Initializing CometChat…');
    const chat = new CometChatManager({
      cometChatApiKey: config.cometChatApiKey,
      cometChatAuth: config.cometChatAuth,
      userId: config.userId,
      roomId: config.roomId,
      botName: config.botName,
      botAvatar: config.botAvatar,
      chatAvatarId: config.chatAvatarId
    }, logger);

    // Connect to CometChat
    await chat.connect();
    log.info('CometChat initialized.');

    // Initialize other managers
    const spam = new SpamProtection(logger);
    const ai = new AIManager(config, logger, spam);
    const filter = new ContentFilter(ai, logger);
    const stats = new StatsManager(config, logger);
    const music = new MusicSelector(config, logger);
    const queue = new QueueManager(config, logger);
    const afk = new AFKDetector(config, logger);
    const stage = new StageManager(config, logger);

    // Create bot object (simplified - just a container for modules)
    const bot = {
      config,
      logger,
      socket,
      chat,
      stats,
      music,
      queue,
      afk,
      stage,
      spam,
      ai,
      filter,
      glued: config.startGlued || true
    };

    // Initialize handlers
    const events = new EventHandler(bot, logger);
    const commands = new CommandHandler(bot, logger);
    const admin = new AdminCommandHandler(bot, logger);

    bot.events = events;
    bot.commands = commands;
    bot.admin = admin;

    // Connect socket
    log.info('Connecting socket…');
    try {
      await socket.connect();
      if (socket.isConnected) {
        log.info('✅ Socket connected - bot should now be visible in room');
      } else {
        log.warn('⚠️ Socket not connected; will rely on HTTP polling if available.');
      }
    } catch (e) {
      log.error(`❌ Socket failed to connect: ${e?.message || e}`);
      log.error(`   Stack: ${e?.stack}`);
      log.warn('Bot will fall back to HTTP polling.');
    }

    // Wire up event handlers
    log.info('Bot starting…');
    
    // Handle chat messages from CometChat
    chat.onMessage((message) => {
      try {
        events.handleChatMessage(message);
      } catch (err) {
        logger.error('Error handling chat message:', err);
      }
    });

    // Handle socket events with state management
    if (socket.on) {
      const { applyPatch } = require('fast-json-patch');
      
      // Connection monitoring
      socket.on('connected', () => {
        log.info('🔗 Socket connection established');
      });
      socket.on('disconnected', () => {
        log.error('🔌 Socket DISCONNECTED - bot is no longer visible!');
      });
      socket.on('error', (err) => {
        log.error(`❌ Socket error: ${err?.message || err}`);
      });
      
      // Stateful messages (with state patches)
      socket.on('statefulMessage', (message) => {
        try {
          // Apply state patch to keep state in sync with error handling
          if (message.statePatch && socket.state) {
            try {
              const result = applyPatch(socket.state, message.statePatch, true, false);
              socket.updateState(result.newDocument);
            } catch (patchError) {
              logger.warn(`[patch] failed for ${message.name}, resyncing: ${patchError.message}`);
              // Resync from socket if patch fails
              if (socket.socket && typeof socket.socket.getState === 'function') {
                const freshState = socket.socket.getState();
                if (freshState) socket.updateState(freshState);
              }
            }
          }
          
          // Log and handle specific events
          switch (message.name) {
            case 'updatedUserData':
              // This populates allUserData after joining - critical for state
              // Readiness check happens automatically in updateState()
              logger.debug(`📊 updatedUserData received - checking readiness...`);
              break;
            case 'userJoined':
              const joinedUser = message.statePatch?.[0]?.value?.userProfile?.name || 'Unknown';
              log.log(`👋 ${joinedUser} joined the room`);
              events.handleUserJoined?.(message);
              break;
            case 'userLeft':
              const leftUser = message.statePatch?.[0]?.path?.split('/').pop() || 'Unknown';
              log.log(`👋 User left the room`);
              events.handleUserLeft?.(message);
              break;
            case 'addedDj':
              const djName = message.statePatch?.find(p => p.path?.includes('userProfile'))?.value?.name || 'Unknown';
              log.log(`🎧 ${djName} stepped up to DJ`);
              events.handleDJAdded?.(message);
              break;
            case 'removedDj':
              log.log(`🎧 DJ stepped down`);
              events.handleDJRemoved?.(message);
              break;
            case 'playedSong':
              const song = socket.state?.room?.nowPlaying;
              if (song) {
                log.log(`🎵 Now Playing: ${song.artistName} - ${song.trackName}`);
              } else {
                log.log(`⏸️  No song playing`);
              }
              events.handlePlayedSong?.(message);
              break;
            case 'updatedNextSong':
              log.log(`🔄 DJ updated their next song`);
              break;
            case 'votedOnSong':
              log.log(`👍 User voted on song`);
              events.handleUpvote?.(message);
              break;
            default:
              // Log other stateful messages for debugging
              logger.debug(`📨 Stateful: ${message.name}`);
          }
        } catch (e) {
          logger.error(`Error handling stateful message: ${e.message}`);
        }
      });
      
      // Stateless messages
      socket.on('statelessMessage', (message) => {
        try {
          switch (message.name) {
            case 'playedOneTimeAnimation':
              const anim = message.params?.animation || 'unknown';
              log.log(`✨ Animation: ${anim}`);
              break;
            case 'kickedFromRoom':
              log.error(`🚫 Bot was kicked from room!`);
              break;
            case 'roomReset':
              log.warn(`🔄 Room reset - reconnecting...`);
              break;
            default:
              logger.debug(`📨 Stateless: ${message.name}`);
          }
        } catch (e) {
          logger.error(`Error handling stateless message: ${e.message}`);
        }
      });
    }

    // Send boot greeting
    const gluedText = bot.glued ? 'yes' : 'no';
    await chat.sendMessage(config.roomId, `✅ **BOT online** (glued: ${gluedText})`);
    log.info('Boot greeting sent.');

    // Start periodic tasks
    log.info(`🎯 Discovery loop active (every ${config.discoveryPeriodMs}ms).`);
    if (config.discoveryWhileGlued || !bot.glued) {
      setInterval(() => {
        try {
          // Trigger music discovery
          if (music.discoverNewMusic) {
            music.discoverNewMusic().catch(() => {});
          }
        } catch (err) {
          logger.debug('Discovery tick error:', err.message);
        }
      }, config.discoveryPeriodMs || 25000);
    }

    // Start AFK check
    if (afk.startMonitoring) {
      afk.startMonitoring();
    }

    // Start stage management
    if (stage.startManagement) {
      stage.startManagement();
    }

    log.info('Bot started.');

    // Shutdown handler
    const shutdown = async (why) => {
      log.info(`Shutting down (${why})…`);
      try { 
        if (afk.stopMonitoring) afk.stopMonitoring(); 
      } catch {}
      try { 
        if (stage.stopManagement) stage.stopManagement(); 
      } catch {}
      try { 
        if (socket.close) socket.close(); 
      } catch {}
      try {
        if (chat.close) chat.close();
      } catch {}
      process.exit(0);
    };
    
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
  } catch (err) {
    log.error('Fatal during startup:', err);
    console.error(err.stack);
    process.exit(1);
  }
})();
