/**
 * Config - loads environment and validates required fields.
 * Loads config from project root and shares data files with original bot.
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

class Config {
  constructor() {
    // Path from modules/core/Config.js to project root is ../../..
    const projectRoot = path.resolve(__dirname, '../../..');
    
    // Look for config file in project root (shared with original bot)
    const envCandidates = [
      path.join(projectRoot, 'hang-fm-config.env'),
      path.join(projectRoot, '.env')
    ];
    let envPath = null;
    for (const p of envCandidates) {
      if (fs.existsSync(p)) { 
        envPath = p; 
        console.log(`🔧 [MODULAR] Loading config from: ${envPath}`);
        break; 
      }
    }
    if (envPath) {
      dotenv.config({ path: envPath });
    } else {
      dotenv.config();
    }

    // Store project root for data file paths (SHARED with original bot)
    this.projectRoot = projectRoot;
    
    // Bot User Token & IDs
    this.botUserToken = process.env.BOT_USER_TOKEN;
    this.cometChatAuth = process.env.COMETCHAT_AUTH;
    this.cometChatApiKey = process.env.COMETCHAT_API_KEY;
    this.userId = process.env.USER_ID;
    this.roomId = process.env.ROOM_ID;
    
    // Bot Settings
    this.botName = process.env.BOT_NAME || 'BOT-MODULAR';
    this.botAvatar = process.env.BOT_AVATAR || 'bot-01';
    this.chatAvatarId = process.env.CHAT_AVATAR_ID || process.env.BOT_AVATAR || 'bot-01';
    this.debug = process.env.DEBUG === 'true';
    this.verboseMode = process.env.VERBOSE_MODE === 'true';
    this.contentFilterEnabled = process.env.CONTENT_FILTER_ENABLED !== 'false';
    
    // Greetings
    this.bootGreet = process.env.BOOT_GREET === 'true';
    this.bootGreetMessage = process.env.BOOT_GREET_MESSAGE || '🧩 BOT-MODULAR Online (Dev)';
    this.userGreet = process.env.USER_GREET === 'true';
    this.userGreetMessage = process.env.USER_GREET_MESSAGE || 'Welcome {name}!';
    
    // AI Provider Configuration
    this.currentProvider = process.env.AI_PROVIDER || 'gemini';
    
    // OpenAI
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.openaiEnabled = process.env.OPENAI_ENABLED !== 'false';
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    
    // Gemini
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.geminiEnabled = process.env.GEMINI_ENABLED !== 'false';
    this.geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    
    // HuggingFace
    this.huggingfaceApiKey = process.env.HUGGINGFACE_API_KEY;
    this.huggingfaceEnabled = process.env.HUGGINGFACE_ENABLED !== 'false';
    this.huggingfaceModel = process.env.HUGGINGFACE_MODEL || 'meta-llama/Llama-3.2-3B-Instruct';
    this.huggingfaceFallbackModel = process.env.HUGGINGFACE_FALLBACK_MODEL || 'mistralai/Mistral-7B-Instruct-v0.2';
    
    // Music Research APIs
    this.discogsToken = process.env.DISCOGS_TOKEN;
    this.discogsEnabled = process.env.DISCOGS_ENABLED === 'true';
    this.spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
    this.spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.spotifyEnabled = process.env.SPOTIFY_ENABLED === 'true';
    this.wikipediaAccessToken = process.env.WIKIPEDIA_ACCESS_TOKEN;
    this.wikipediaUserAgent = process.env.WIKIPEDIA_USER_AGENT || 'HangBot/1.0';
    this.musicbrainzUserAgent = process.env.MUSICBRAINZ_USER_AGENT || 'HangBot/1.0';
    
    // Weather API
    this.openweatherApiKey = process.env.OPENWEATHER_API_KEY;
    this.weatherLocation = process.env.WEATHER_LOCATION || 'New York,NY,US';
    
    // Tenor GIF API
    this.tenorApiKey = process.env.TENOR_API_KEY;
    
    // DJ Functionality
    this.djEnabled = process.env.DJ_ENABLED === 'true';
    this.autoUpvote = process.env.AUTO_UPVOTE === 'true';
    this.djQueueLimit = parseInt(process.env.DJ_QUEUE_LIMIT) || 10;
    
    // Bot Personality
    this.botPersonality = process.env.BOT_PERSONALITY || 'sassy';
    this.enableProfanity = process.env.ENABLE_PROFANITY === 'true';
    this.responseLengthLimit = parseInt(process.env.RESPONSE_LENGTH_LIMIT) || 200;
    
    // Keyword Triggers
    this.keywordTriggers = (process.env.KEYWORD_TRIGGERS || 'bot,b0t,bot2,b0t2,@bot2').split(',').map(t => t.trim());
    
    // Bot Exclusions
    this.excludeBotNames = (process.env.EXCLUDE_BOT_NAMES || '').split(',').map(name => name.trim().toLowerCase()).filter(Boolean);
    this.excludeUserIds = (process.env.EXCLUDE_USERIDS || '').split(',').map(id => id.trim()).filter(Boolean);
    
    // Conversation Memory
    this.enableConversationMemory = process.env.ENABLE_CONVERSATION_MEMORY === 'true';
    this.userMemoryDuration = parseInt(process.env.USER_MEMORY_DURATION) || 86400;
    
    // Auto Stage Management
    this.autoStageManagement = true;
    this.minDJsForBot = 3;
    this.maxDJsForBot = 4;
    
    console.log(`📊 [MODULAR] Data files will be shared from: ${projectRoot}`);
  }
  validate() {
    if (!this.botUserToken) throw new Error('BOT_USER_TOKEN required');
    if (!this.userId) throw new Error('USER_ID required');
    if (!this.roomId) throw new Error('ROOM_ID required');
    return true;
  }
}
module.exports = Config;
