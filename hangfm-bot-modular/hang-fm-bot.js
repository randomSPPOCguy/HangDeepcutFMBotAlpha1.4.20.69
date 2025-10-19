/* hang-fm-bot.js */
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
  line:  (...a) => console.log(`${ts()} LOG  `, ...a),
};

// ---------- load env (without printing any secrets) ----------
(function loadEnv() {
  log.debug('dotenv loaded');
  const candidates = [
    process.env.HANGFM_ENV_PATH && String(process.env.HANGFM_ENV_PATH),
    path.resolve(process.cwd(), '.env'),
    'C:\\Users\\markq\\hang-fm-config.env',
  ].filter(Boolean);

  let usedPath = null;
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        dotenv.config({ path: p });
        usedPath = p;
        break;
      }
    } catch {}
  }
  if (!usedPath) {
    dotenv.config(); // fallback to default .env if present
    log.info('Booting Hang.fm Modular…');
    log.line('🔧 [MODULAR] Loading config from: default .env (if present)');
  } else {
    log.info('Booting Hang.fm Modular…');
    log.line(`🔧 [MODULAR] Loading config from: ${usedPath}`);
    try {
      log.line(`📊 [MODULAR] Data files will be shared from: ${path.dirname(usedPath)}`);
    } catch {
      /* noop */
    }
  }
})();

// ---------- build runtime config ----------
const runtimeConfig = {
  env: process.env.NODE_ENV || 'dev',
  roomId: process.env.ROOM_ID || '',
  botName: process.env.BOT_NAME || 'BOT',
  aiProvider: process.env.AI_PROVIDER || 'gemini',
  websocketUrl: process.env.WEBSOCKET_URL || '',
  apiBaseUrl: process.env.API_BASE_URL || '',
  sendHeartbeat: String(process.env.SEND_HEARTBEAT || 'true').toLowerCase() === 'true',
  heartbeatInterval: Number(process.env.HEARTBEAT_INTERVAL || 30000),
  autoJoinRoom: String(process.env.AUTO_JOIN_ROOM || 'true').toLowerCase() === 'true',
  bootGreet: String(process.env.BOOT_GREET || 'true').toLowerCase() === 'true',
  bootGreetMessage: process.env.BOOT_GREET_MESSAGE || 'BOT Online 🦾🤖',
  verbose: String(process.env.VERBOSE_MODE || 'false').toLowerCase() === 'true',
  debug: String(process.env.DEBUG || 'false').toLowerCase() === 'true',
};

log.info('Config summary:', JSON.stringify({
  env: runtimeConfig.env,
  roomId: runtimeConfig.roomId ? '(set)' : '',
  botName: runtimeConfig.botName,
  aiProvider: runtimeConfig.aiProvider,
}));

// ---------- wire up bot ----------
const { createSocketClient } = require('./socket/SocketClient');
const Bot = require('./core/Bot');

(async function main() {
  try {
    log.line('📡 Creating SocketClient...');
    const socketClient = createSocketClient({
      url: runtimeConfig.websocketUrl,
      headers: {
        // Only auth header; never logged.
        Authorization: process.env.BOT_USER_TOKEN ? `Bearer ${process.env.BOT_USER_TOKEN}` : undefined,
      },
    });
    log.line('✅ SocketClient created');

    const bot = new Bot({
      socketClient,
      config: runtimeConfig,
      http: {
        baseUrl: runtimeConfig.apiBaseUrl,
        token: process.env.BOT_USER_TOKEN || '',
      },
    });

    // Connect socket before starting the bot loops
    log.info('Connecting socket…');
    try {
      await socketClient.connect();
      if (socketClient.isConnected()) {
        log.info(`Socket connected${runtimeConfig.websocketUrl ? '' : ' (mock, no URL provided).'}`);
      } else {
        log.warn('Socket not connected; will rely on HTTP polling if API_BASE_URL is set.');
      }
    } catch (e) {
      log.warn('Socket failed to connect; bot will fall back to HTTP polling if available.', e?.message || e);
    }

    await bot.start();
    log.info('Bot started.');

    const shutdown = async (why) => {
      log.info(`Shutting down (${why})…`);
      try { await bot.stop(); } catch {}
      try { socketClient.close(); } catch {}
      process.exit(0);
    };
    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    log.error('Fatal during startup:', err);
    process.exit(1);
  }
})();






