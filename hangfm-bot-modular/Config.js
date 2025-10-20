// hangfm-bot-modular/Config.js
const path = require('path');
const fs = require('fs');

const CONFIG_CANDIDATES = [
  process.env.HANG_FM_CONFIG,
  path.resolve(process.cwd(), 'hang-fm-config.env'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '.env'),
].filter(Boolean);

// Load the first config file that exists
for (const candidate of CONFIG_CANDIDATES) {
  try {
    if (fs.existsSync(candidate)) {
      require('dotenv').config({ path: candidate });
      console.log(`🔧 [MODULAR] Loading config from: ${candidate}`);
      break;
    }
  } catch {}
}

// Public config object
const cfg = {
  ENV: process.env.NODE_ENV || 'prod',

  // Core / Room
  ROOM_ID: process.env.ROOM_ID || '',          // CometChat group GUID
  BOT_NAME: process.env.BOT_NAME || 'BOT',
  AI_PROVIDER: (process.env.AI_PROVIDER || 'gemini').toLowerCase(),

  // Socket
  SOCKET_BASE_URL: process.env.SOCKET_BASE_URL || 'https://socket.prod.tt.fm',

  // CometChat
  COMETCHAT_APP_ID: process.env.COMETCHAT_APP_ID || '',
  COMETCHAT_REGION: process.env.COMETCHAT_REGION || '',
  COMETCHAT_AUTH: process.env.COMETCHAT_AUTH || '',  // auth token
  COMETCHAT_UID: process.env.COMETCHAT_UID || 'bot', // uid of the bot user

  // Providers
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  HF_API_KEY: process.env.HF_API_KEY || '',

  // Misc
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};

function requireValue(name, value) {
  if (!value || String(value).trim() === '') {
    throw new Error(`[Config] Missing required env: ${name}`);
  }
}

// Validate the absolute minimum needed to boot
requireValue('COMETCHAT_APP_ID', cfg.COMETCHAT_APP_ID);
requireValue('COMETCHAT_REGION', cfg.COMETCHAT_REGION);
requireValue('COMETCHAT_AUTH', cfg.COMETCHAT_AUTH);
requireValue('ROOM_ID', cfg.ROOM_ID);

module.exports = cfg;

