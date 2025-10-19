const { SocketClient, ServerMessageName } = require('ttfm-socket');
const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');
const { applyPatch } = require('fast-json-patch');
const axios = require('axios');
const WebSocket = require('ws');
require('dotenv').config({ path: __dirname + '/hang-fm-config.env' });

class HangFmBot {
  constructor() {
    // Configuration
    console.log('🔧 Loading environment variables...');
    this.botUserToken = process.env.BOT_USER_TOKEN;
    this.cometChatAuth = process.env.COMETCHAT_AUTH;
    this.userId = process.env.USER_ID;
    this.roomId = process.env.ROOM_ID;
    
    // Debug environment variables
    console.log(`🔑 BOT_USER_TOKEN: ${this.botUserToken ? 'LOADED' : 'MISSING'}`);
    console.log(`🔐 COMETCHAT_AUTH: ${this.cometChatAuth ? 'LOADED' : 'MISSING'}`);
    console.log(`👤 USER_ID: ${this.userId ? 'LOADED' : 'MISSING'}`);
    console.log(`🏠 ROOM_ID: ${this.roomId ? 'LOADED' : 'MISSING'}`);
    
    // Console verbosity control
    this.verboseMode = process.env.VERBOSE_MODE === 'true'; // Set to false for clean console
    
    // Bot Exclusion System
    this.excludedBotNames = (process.env.EXCLUDE_BOT_NAMES || '').split(',').map(name => name.trim().toLowerCase()).filter(Boolean);
    this.excludedUserIds = (process.env.EXCLUDE_USERIDS || '').split(',').map(id => id.trim()).filter(Boolean);
    console.log(`🤖 Excluding bots from learning: ${this.excludedBotNames.join(', ')}`);
    console.log(`🤖 Excluding user IDs from learning: ${this.excludedUserIds.join(', ')}`);
    
    // Artist Learning System
    this.learnedArtists = new Set(); // Artists the bot learned from users
    this.learnedArtistsGenreMap = new Map(); // Track which genre each learned artist belongs to
    this.botName = process.env.BOT_NAME || 'HangBot';
    this.debug = process.env.DEBUG === 'true';
    this.botAvatar = process.env.BOT_AVATAR || null;
    this.chatAvatarId = process.env.CHAT_AVATAR_ID || null;
    this.contentFilterEnabled = process.env.CONTENT_FILTER_ENABLED !== 'false'; // Enabled by default
    
    // AI Usage Optimization
    this.lastUserPlayTimestamp = 0; // Track when a user last played a song
    this.aiUsedAfterUserPlay = false; // Track if AI was already used after last user play
    this.userAIUsage = new Map(); // Track AI usage per user: userId -> { used: boolean, timestamp: number }
    
    // Content Filter Strike System
    this.userStrikes = new Map(); // Track strikes per user: userId -> { strikes: number, offenses: [] }
    this.maxStrikes = 3; // Ban on 3rd strike
    
    // Token Budget System (prevent AFK token drain)
    this.userTokenBudgets = new Map(); // userId -> { tokens: number, lastPlay: timestamp, lastSong: string }
    this.tokensPerDJ = 3; // Each DJ gets 3 AI tokens max
    this.userLastSongs = new Map(); // userId -> last song they played
    
    // AI Configuration
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.huggingfaceApiKey = process.env.HUGGINGFACE_API_KEY;
    this.tenorApiKey = process.env.TENOR_API_KEY;
    this.openaiEnabled = process.env.OPENAI_ENABLED !== 'false';
    this.geminiEnabled = process.env.GEMINI_ENABLED !== 'false';
    this.huggingfaceEnabled = process.env.HUGGINGFACE_ENABLED !== 'false';
    
    // Bot Settings
    this.bootGreet = process.env.BOOT_GREET === 'true';
    this.bootGreetMessage = process.env.BOOT_GREET_MESSAGE || 'Hello from Hang.fm bot! 🤖';
    
    // Debug greeting configuration
    console.log(`🔧 Boot Greet: ${this.bootGreet}`);
    console.log(`🔧 Boot Greet Message: "${this.bootGreetMessage}"`);
    
    // AI Settings
    this.aiEnabled = true; // Default to enabled
    this.aiChatEnabled = true; // Control AI chat responses separately from song selection
    this.currentProvider = process.env.AI_PROVIDER || 'gemini'; // Default to Gemini
    this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.huggingfaceModel = process.env.HUGGINGFACE_MODEL || 'microsoft/DialoGPT-medium';
    this.huggingfaceFallbackModel = process.env.HUGGINGFACE_FALLBACK_MODEL || 'microsoft/DialoGPT-small';
    
    // Spam Protection
    this.userCooldowns = new Map(); // userId -> { count: number, lastReset: timestamp }
    this.cooldownLimit = 3; // Max messages per cooldown period
    this.cooldownPeriod = 2.5 * 60 * 1000; // 2.5 minutes in milliseconds
    
    // Room Context Tracking
    this.roomContext = {
      nowPlaying: null,
      usersInRoom: new Set(),
      djsOnStage: new Set(),
      recentEvents: [] // Last 10 events for context
    };
    
    // Moderator cache (fetched from API)
    this.cachedModerators = new Set(); // UUIDs of room moderators
    this.moderatorCacheTime = 0; // Last time we fetched moderators
    this.moderatorCacheInterval = 5 * 60 * 1000; // Refresh every 5 minutes
    
    // User Sentiment Tracking
    this.userSentiment = new Map(); // userId -> { sentiment: 'neutral'|'positive'|'negative', interactions: number, language: 'en' }
    this.basePersonality = 'neutral';
    
    // Racist/Hate Speech Detection (AI-based)
    this.racistUsers = new Set(); // Track users who've used racist language
    
    // Stage Dive Commands (Mod/Co-owner only)
    this.nosediveArmed = new Map(); // userId -> { armedBy: modId, timestamp: number }
    this.stagediveArmed = new Map(); // userId -> { armedBy: modId, timestamp: number }
    
    // AFK Detection System (36 minutes inactive → 36 second warning → remove)
    this.userLastActivity = new Map(); // userId -> timestamp of last activity (chat or vote)
    this.afkWarnings = new Map(); // userId -> { warnedAt: timestamp, username: string }
    this.afkTimeout = 36 * 60 * 1000; // 36 minutes in ms
    this.afkWarningTime = 36 * 1000; // 36 seconds warning in ms
    
    // User Greet Cooldown (20 minutes)
    this.userGreetCooldowns = new Map(); // userId -> timestamp of last greet
    this.greetCooldown = 20 * 60 * 1000; // 20 minutes in ms
    
    // Holiday Decoration System
    this.currentHoliday = this.detectCurrentHoliday(); // Auto-detect based on date
    this.holidayEmojis = this.getHolidayEmojis();
    console.log(`🎃 Holiday theme: ${this.currentHoliday} ${this.holidayEmojis.icon}`);
    
    // jirf Poker game state
    this.pokerGameActive = false;
    this.pokerBets = new Map(); // userId -> betAmount
    this.pokerRoomCards = [];
    this.pokerDealerCards = [];
    this.pokerBettingWindow = null;
    this.pokerRevealTimeout = null;
    this.pokerGameStartTime = null;
    
    // Automatic Song Picking
    this.autoSongPicking = false; // Disabled - using AI selection in handlePlayedSong instead
    this.lastAutoPick = 0; // Timestamp of last auto-pick
    this.autoPickInterval = 5 * 60 * 1000; // 5 minutes between auto-picks
    
    // Bot Queue Tracking
    this.botQueue = []; // Array of songs the bot has added to queue
    
    // Song Selection System (from deepcut bot)
    this.roomSongHistory = []; // Track songs played in room for learning
    this.playedSongs = new Set(); // Track played songs to prevent repeats
    this.recentlyUsedArtists = []; // Track recently used artists for variety
    this.lastPlayedArtist = null; // Track last artist to prevent consecutive repeats
    this.botNextSong = null; // Next song to be played
    this.lastSongChangeTime = 0; // Track when song was last changed
    this.currentDjId = null; // Track who is currently playing
    this.currentDjName = null; // Track current DJ name
    this.vibeAnalyzedThisSession = false; // Flag to prevent multiple AI vibe analyses
    this.songChangeInterval = 7 * 60 * 1000 + 50 * 1000; // 7 minutes 50 seconds
    this.lastAutoHopDownTime = null; // Track when bot last auto-hopped down (for cooldown)
    this.songsPlayedSinceHopUp = 0; // Track how many songs bot has played since hopping up
    this.lastAutoHopTime = 0; // Timestamp of last auto-hop
    this.autoHopCooldown = 7 * 60 * 1000 + 50 * 1000; // 7 minutes 50 seconds
    
    // AI Rate Limiting
    this.lastAIRequest = 0; // Timestamp of last AI request
    this.aiRequestDelay = 3000; // 3 seconds between AI requests
    
    // Auto Stage Management
    this.autoStageManagement = true; // Enable auto stage management
    this.minDJsForBot = 3; // Bot hops up if less than 3 DJs
    this.maxDJsForBot = 4; // Bot hops down if 4+ DJs (including bot)
    this.gluedToFloor = true; // Bot STARTS glued to floor (mods can use /glue to unglue)
    
    // User Stats Tracking
    this.userStats = new Map(); // userId -> { bankroll: number, wins: number, losses: number, upvotes: number, downvotes: number, stars: number, artists: Map }
    this.songStats = new Map(); // "Artist - Song" -> { plays: number, firstPlayer: userId }
    this.defaultBankroll = 1000; // Starting chips for new users
    
    // Load stats and learned data on startup
    this.loadStats();
    this.loadLearnedArtists();
    this.loadStrikesData();
    
    // AI Keyword Spam Detection
    this.aiSpamUsers = new Map(); // userId -> { count: number, lastReset: timestamp, ignored: boolean }
    this.aiSpamLimit = 3; // Max AI keyword uses per period
    this.aiSpamPeriod = 2.5 * 60 * 1000; // 2.5 minutes in milliseconds
    this.aiGrantedUsers = new Set(); // Users granted unlimited AI access by co-owners
    
    // Genre Request System
    this.requestedGenre = null; // Store genre requested by user (e.g., 'jazz', 'blues', 'country')
    this.genreRequestedBy = null; // Track who requested the genre
    
    // Debug AI key loading
    console.log(`🤖 AI Provider: ${this.currentProvider.toUpperCase()}`);
    console.log(`🤖 OpenAI: ${this.openaiEnabled && this.openaiApiKey ? '✅' : '❌'}`);
    console.log(`🤖 Gemini: ${this.geminiEnabled && this.geminiApiKey ? '✅' : '❌'}`);
    console.log(`🤖 HuggingFace: ${this.huggingfaceEnabled && this.huggingfaceApiKey ? '✅' : '❌'}`);
    this.userGreet = process.env.USER_GREET === 'true';
    this.userGreetMessage = process.env.USER_GREET_MESSAGE || 'Welcome to Alternative HipHop/Rock/Metal {name}, talk to the bot using its name to get information on stuff for now';
    this.keywordTriggers = ['bot', 'b0t', 'bot2', 'b0t2', '@bot2', 'sppoc', 'smashing pumpkins'];
    this.responseLengthLimit = parseInt(process.env.RESPONSE_LENGTH_LIMIT) || 200;
    this.enableProfanity = process.env.ENABLE_PROFANITY === 'true';
    this.botPersonality = process.env.BOT_PERSONALITY || 'sassy';
    
    // Music Research APIs
    this.musicbrainzUserAgent = process.env.MUSICBRAINZ_USER_AGENT || 'HangBot/1.0';
    this.wikipediaUserAgent = process.env.WIKIPEDIA_USER_AGENT || 'HangBot/1.0';
    this.wikipediaAccessToken = process.env.WIKIPEDIA_ACCESS_TOKEN;
    this.discogsToken = process.env.DISCOGS_TOKEN;
    this.discogsEnabled = process.env.DISCOGS_ENABLED === 'true';
    this.spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
    this.spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.spotifyEnabled = process.env.SPOTIFY_ENABLED === 'true';
    this.spotifyAccessToken = null; // Will be fetched on demand
    
    // Weather
    this.openweatherApiKey = process.env.OPENWEATHER_API_KEY;
    this.weatherLocation = process.env.WEATHER_LOCATION || 'New York,NY,US';
    
    // DJ Functionality
    this.djEnabled = process.env.DJ_ENABLED === 'true';
    this.autoUpvoteEnabled = process.env.AUTO_UPVOTE === 'true';
    this.djQueueLimit = parseInt(process.env.DJ_QUEUE_LIMIT) || 10;
    
    // Conversation Memory
    this.enableConversationMemory = process.env.ENABLE_CONVERSATION_MEMORY === 'true';
    this.userMemoryDuration = parseInt(process.env.USER_MEMORY_DURATION) || 86400;
    
    // State
    this.socket = null;
    this.cometChatWs = null;
    this.state = null;
    this.isConnected = false;
    this.cometChatAuthenticated = false;
    this.userConversations = new Map();
    this.currentSong = null;
    this.lastMessageIds = new Map();
    
    // Uptime tracking
    this.startTime = Date.now();
    this.lastResetTime = Date.now();
    this.uptimeData = this.loadUptimeData();
    
    this.log('🤖 Hang.fm Music Bot initialized');
    this.log(`📋 User ID: ${this.userId}`);
    this.log(`🏠 Room ID: ${this.roomId}`);
  }

  log(message) {
    // Only log if verbose mode is enabled
    if (this.verboseMode) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${message}`);
    }
  }

  detectCurrentHoliday() {
    // Auto-detect holiday based on current month
    const currentMonth = new Date().getMonth(); // 0-11
    
    if (currentMonth === 9) return 'halloween'; // October
    if (currentMonth === 10 || currentMonth === 11) return 'christmas'; // November-December
    if (currentMonth === 1) return 'valentines'; // February
    if (currentMonth === 2 || currentMonth === 3) return 'easter'; // March-April
    if (currentMonth === 6) return 'july4th'; // July
    
    return 'none'; // No holiday
  }

  getHolidayEmojis() {
    const themes = {
      'halloween': {
        icon: '🎃',
        emojis: ['🎃', '👻', '🦇', '🕷️', '💀', '🕸️', '🧛', '🧟', '👹', '🌙'],
        name: 'Halloween'
      },
      'christmas': {
        icon: '🎄',
        emojis: ['🎄', '🎅', '⛄', '🎁', '❄️', '☃️', '🤶', '🦌', '🔔', '⛷️'],
        name: 'Christmas'
      },
      'valentines': {
        icon: '💝',
        emojis: ['💝', '💖', '💕', '💗', '💓', '💞', '💘', '❤️', '🌹', '💐'],
        name: 'Valentine\'s Day'
      },
      'easter': {
        icon: '🐰',
        emojis: ['🐰', '🥚', '🐣', '🐥', '🌷', '🌸', '🌼', '🌺', '🦋', '🌻'],
        name: 'Easter'
      },
      'july4th': {
        icon: '🎆',
        emojis: ['🎆', '🎇', '🇺🇸', '🗽', '🦅', '⭐', '🎉', '🎊', '🔥', '💥'],
        name: 'July 4th'
      },
      'none': {
        icon: '🎵',
        emojis: ['🎵', '🎶', '🎸', '🎧', '🎤', '🎹', '🥁', '🎺', '🎷', '🎻'],
        name: 'Standard'
      }
    };
    
    return themes[this.currentHoliday] || themes['none'];
  }

  getRandomHolidayEmoji() {
    const emojis = this.holidayEmojis.emojis;
    return emojis[Math.floor(Math.random() * emojis.length)];
  }

  loadUptimeData() {
    try {
      const fs = require('fs');
      const path = require('path');
      const uptimeFile = path.join(__dirname, 'uptime.json');
      
      if (fs.existsSync(uptimeFile)) {
        const data = JSON.parse(fs.readFileSync(uptimeFile, 'utf8'));
        this.log(`📊 Loaded uptime data: ${data.totalUptime}ms total`);
        return data;
      }
    } catch (error) {
      this.log(`❌ Failed to load uptime data: ${error.message}`);
    }
    
    return {
      totalUptime: 0,
      sessionCount: 0,
      lastSessionEnd: null
    };
  }

  saveUptimeData() {
    try {
      const fs = require('fs');
      const path = require('path');
      const uptimeFile = path.join(__dirname, 'uptime.json');
      
      const data = {
        totalUptime: this.uptimeData.totalUptime,
        sessionCount: this.uptimeData.sessionCount + 1,
        lastSessionEnd: Date.now()
      };
      
      fs.writeFileSync(uptimeFile, JSON.stringify(data, null, 2));
      this.log(`💾 Saved uptime data`);
    } catch (error) {
      this.log(`❌ Failed to save uptime data: ${error.message}`);
    }
  }

  getUptimeString() {
    const currentTime = Date.now();
    const sessionUptime = currentTime - this.lastResetTime;
    const totalUptime = this.uptimeData.totalUptime + sessionUptime;
    
    // Update uptime data
    this.uptimeData.totalUptime = totalUptime;
    this.uptimeData.lastSession = sessionUptime;
    this.uptimeData.lastUpdated = currentTime;
    this.saveUptimeData();
    
    const formatUptime = (ms) => {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
      } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
      } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
      } else {
        return `${seconds}s`;
      }
    };
    
    // Get room stats
    const roomStats = this.getRoomStats();
    
    return `⏱️ **Bot Uptime** ⏱️\n` +
           `🔄 Session: ${formatUptime(sessionUptime)}\n` +
           `📊 Total: ${formatUptime(totalUptime)}\n` +
           `🔢 Sessions: ${this.uptimeData.sessionCount + 1}\n\n` +
           `📊 **Room Stats:**\n` +
           `👥 Users tracked: ${this.userStats.size}\n` +
           `🎵 Songs tracked: ${this.songStats.size}\n` +
           `🎧 Current DJs: ${roomStats.djCount}\n` +
           `👥 Current audience: ${roomStats.audienceCount}`;
  }

  displayMusicInfoOnBoot() {
    console.log('\n🎵 === MUSIC INFO ON BOOT ===');
    
    if (this.state && this.state.nowPlaying && this.state.nowPlaying.song) {
      const song = this.state.nowPlaying.song;
      
      // Set current song so AI can reference it
      this.currentSong = song;
      
      console.log(`🎵 Now Playing: ${song.artistName} - ${song.trackName}`);
      console.log(`💿 Album: ${song.albumName || 'Single'}`);
      console.log(`📅 Year: ${song.releaseYear || 'Unknown Year'}`);
      console.log(`⏱️ Duration: ${song.duration || 'Unknown'} seconds`);
      
      // Track this artist as last played to avoid repeating it
      this.lastPlayedArtist = song.artistName;
      if (this.verboseMode) console.log(`🔍 Boot: Tracked last played artist: ${song.artistName}`);
      
      // Fetch enhanced metadata for boot display
      this.fetchSongMetadata(song.artistName, song.trackName).then(metadata => {
        if (metadata) {
          console.log(`🔍 Enhanced boot metadata: Album: ${metadata.album} | Year: ${metadata.year} | Source: ${metadata.source}`);
        }
      });
      
      // Trigger auto-upvote for current song on boot
      console.log(`🔄 Triggering auto-upvote for current song on boot...`);
      setTimeout(() => {
        console.log(`🔄 Boot auto-upvote timeout triggered`);
        this.performAutoUpvote();
      }, 5000); // Wait 5 seconds then upvote
    } else {
      console.log('🎵 No song currently playing');
    }
    
    // Display room information
    if (this.state) {
      console.log('\n🏠 === ROOM INFO ===');
      console.log(`👥 Users in room: ${this.state.audienceUsers ? this.state.audienceUsers.length : 0}`);
      console.log(`🎧 DJs on stage: ${this.state.djs ? this.state.djs.length : 0}`);
      
      if (this.state.djs && this.state.djs.length > 0) {
        console.log('🎧 DJs:');
        this.state.djs.forEach((dj, index) => {
          // Get user data from allUserData using UUID
          const userData = this.state.allUserData?.[dj.uuid];
          const djName = userData?.userProfile?.nickname || 
                        userData?.userProfile?.firstName || 
                        dj.userProfile?.nickname || 
                        dj.userProfile?.firstName || 
                        'DJ';
          console.log(`   ${index + 1}. ${djName}`);
        });
      }
      
      if (this.state.audienceUsers && this.state.audienceUsers.length > 0) {
        console.log('👥 Audience:');
        const audienceNames = this.state.audienceUsers.slice(0, 10).map(user => {
          // Get user data from allUserData using UUID
          const userData = this.state.allUserData?.[user.uuid];
          return userData?.userProfile?.nickname || 
                 userData?.userProfile?.firstName || 
                 user.nickname || 
                 user.firstName || 
                 'User';
        });
        console.log(`   ${audienceNames.join(', ')}`);
        if (this.state.audienceUsers.length > 10) {
          console.log(`   ... and ${this.state.audienceUsers.length - 10} more`);
        }
      }
    }
    
    console.log('========================\n');
  }

  displayBotQueueOnBoot() {
    console.log('\n🎵 === BOT QUEUE STATUS ===');
    if (this.botQueue && this.botQueue.length > 0) {
      console.log(`🎵 Bot has ${this.botQueue.length} songs in queue:`);
      this.botQueue.forEach((song, index) => {
        console.log(`   ${index + 1}. ${song}`);
      });
    } else {
      console.log('🎵 Bot queue is empty - no songs added yet');
    }
    console.log('========================\n');
  }

  displayStatsOnBoot() {
    console.log('\n📊 === STATS STATUS ===');
    console.log(`📊 Tracking ${this.userStats.size} users`);
    console.log(`🎵 Tracking ${this.songStats.size} songs`);
    if (this.userStats.size > 0) {
      console.log('👥 Active users:');
      let count = 0;
      for (const [userId, stats] of this.userStats.entries()) {
        if (count >= 5) break; // Show only first 5
        const username = this.getUsernameById(userId);
        console.log(`   ${username} - ${stats.bankroll} chips, ${stats.wins}W-${stats.losses}L`);
        count++;
      }
      if (this.userStats.size > 5) {
        console.log(`   ... and ${this.userStats.size - 5} more users`);
      }
    }
    console.log('========================\n');
  }

  async connect() {
    try {
      console.log('🔌 Connecting to Hang.fm...');
      console.log(`🔗 Using socket URL: https://socket.prod.tt.fm`);
      
      // Check if bot token exists
      if (!this.botUserToken) {
        throw new Error('BOT_USER_TOKEN is not defined in environment variables');
      }
      console.log(`🔑 Using bot token: ${this.botUserToken.substring(0, 20)}...`);
      
      if (!this.roomId) {
        throw new Error('ROOM_ID is not defined in environment variables');
      }
      console.log(`🏠 Room ID: ${this.roomId}`);
      
      // Create SocketClient
      console.log('📡 Creating SocketClient...');
      this.socket = new SocketClient('https://socket.prod.tt.fm');
      console.log('✅ SocketClient created');
      
      // Set up event listeners
      console.log('👂 Setting up event listeners...');
      this.setupEventListeners();
      console.log('✅ Event listeners set up');
      
      console.log('🚪 Attempting to join room...');
      const connection = await this.socket.joinRoom(this.botUserToken, {
        roomUuid: this.roomId
      });
      console.log('✅ Room join successful');
      
      this.state = connection.state;
      this.isConnected = true;
      console.log('✅ Successfully joined room');
      
      // Update bot avatar if configured
      if (this.botAvatar) {
        await this.updateBotAvatar();
      }
      
      // Update CometChat avatar if configured
      if (this.chatAvatarId) {
        await this.updateCometChatAvatar();
      }
      
      // Connect to CometChat
      try {
        console.log('🔌 Starting CometChat connection...');
        await this.connectCometChat();
        console.log('✅ CometChat connection completed');
      } catch (cometChatError) {
        console.log(`❌ CometChat connection failed: ${cometChatError.message}`);
        console.log(`❌ Error stack: ${cometChatError.stack}`);
        console.log('🤖 Bot will continue without CometChat...');
      }
      
      // Display current music info on boot
      try {
        this.displayMusicInfoOnBoot();
      } catch (displayError) {
        console.log(`⚠️ Display music info failed: ${displayError.message}`);
      }
      
      // Display bot's queue on boot
      try {
        this.displayBotQueueOnBoot();
      } catch (queueError) {
        console.log(`⚠️ Display bot queue failed: ${queueError.message}`);
      }
      
      // Display stats on boot
      try {
        this.displayStatsOnBoot();
      } catch (statsError) {
        console.log(`⚠️ Display stats failed: ${statsError.message}`);
      }
      
      // Start periodic stage monitoring
      setInterval(() => {
        this.checkAutoStageManagement();
      }, 10000); // Check every 10 seconds
      console.log('🔍 Started periodic stage monitoring (every 10 seconds)');
      
      // Start AFK detection monitoring
      setInterval(() => {
        this.checkAFKDJs();
      }, 30000); // Check every 30 seconds
      console.log('⏰ Started AFK detection (checks every 30 seconds)');
      
      // Fetch room moderators from API
      setTimeout(async () => {
        await this.fetchRoomModerators();
      }, 3000); // Wait 3 seconds for room state to settle
      
      // Check if bot is on stage at startup and select a song
      setTimeout(async () => {
        const isBotOnStage = this.isUserOnStage(this.userId);
        if (isBotOnStage && !this.botNextSong) {
          console.log('🎵 Bot on stage at startup - selecting song...');
          await this.selectAndQueueSong('startup');
        }
      }, 5000); // Wait 5 seconds after joining room
      
      // Send boot greet with holiday decorations
      if (this.bootGreet) {
        setTimeout(() => {
          const emoji = this.getRandomHolidayEmoji();
          const decoratedGreet = `${emoji} ${this.bootGreetMessage}`;
          this.sendChat(decoratedGreet);
        }, 3000);
        
        // Start polling for messages as a fallback
        setTimeout(() => {
          this.log('🔄 Starting message polling as fallback...');
          this.startMessagePolling();
        }, 5000);
      }


      
    } catch (error) {
      console.log(`❌ Connection failed: ${error.message}`);
      console.log(`❌ Error stack: ${error.stack}`);
      console.log('🤖 Bot will attempt to reconnect in 10 seconds...');
      
      // Don't exit immediately, try to reconnect
      setTimeout(() => {
        console.log('🔄 Attempting to reconnect...');
        this.connect().catch(reconnectError => {
          console.log(`❌ Reconnection failed: ${reconnectError.message}`);
          console.log('🤖 Bot is shutting down...');
    process.exit(1);
        });
      }, 10000);
    }
  }

  setupEventListeners() {
    try {
      console.log('🔧 Setting up socket event listeners...');
      
      // Socket event listeners setup
      
      // Stateful messages (with state patches)
      this.socket.on('statefulMessage', (message) => {
        this.handleStatefulMessage(message);
      });

      // Stateless messages
      this.socket.on('statelessMessage', (message) => {
        this.handleStatelessMessage(message);
    });

    // Server messages
    this.socket.on('serverMessage', (message) => {
      this.handleServerMessage(message);
    });

    // Debug: Listen to socket events (removed onAny as it's not available)
    // Note: onAny is not available in this socket client

    // Listen for common chat message events
    const chatEvents = ['chatMessage', 'message', 'userSpoke', 'chat', 'speak', 'roomMessage', 'userMessage'];
    chatEvents.forEach(eventName => {
      this.socket.on(eventName, (message) => {
        this.log(`🔍 Chat event received: ${eventName} - ${JSON.stringify(message, null, 2)}`);
        this.handleSocketChatMessage(message);
      });
    });

    // Try to catch any raw messages
    if (this.socket.onMessage) {
      this.socket.onMessage((message) => {
        this.log(`🔍 Raw message: ${JSON.stringify(message, null, 2)}`);
        if (message.text || message.data?.text) {
          this.handleSocketChatMessage(message);
        }
      });
    }

    // Debug: Override emit to see all events being fired
    const originalEmit = this.socket.emit;
    const logFunction = this.log.bind(this);
    this.socket.emit = function(event, ...args) {
      // Event emitted
      return originalEmit.call(this, event, ...args);
    };

    // Connection events
    this.socket.on('connected', () => {
      this.log('🔗 Socket connected');
    });

    this.socket.on('disconnected', () => {
      this.log('🔌 Socket disconnected');
      this.isConnected = false;
    });

    this.socket.on('error', (error) => {
      this.log(`❌ Socket error: ${error}`);
    });
    
    console.log('✅ Socket event listeners set up successfully');
    
    } catch (error) {
      console.log(`❌ Error setting up event listeners: ${error.message}`);
      console.log(`❌ Error stack: ${error.stack}`);
      throw error;
    }
  }

  handleStatefulMessage(message) {
    // Process stateful message
    
    // Apply state patch
    if (message.statePatch && this.state) {
      try {
        const patchResult = applyPatch(this.state, message.statePatch, true, false);
        this.state = patchResult.newDocument;
        this.log(`✅ State updated for: ${message.name}`);
        
        // Update DJ tracking after state change
        this.updateDJTracking();
      } catch (error) {
        this.log(`❌ Failed to apply state patch: ${error.message}`);
      }
    }
    
    // Debug log for stateful messages
    if (message.name === 'playedSong' || message.name === 'updatedNextSong') {
      if (this.verboseMode) console.log(`🔍 Stateful message: ${message.name} - State: ${JSON.stringify(this.state?.nowPlaying, null, 2)}`);
    }

    // Handle specific messages
    switch (message.name) {
      case 'updatedUserData':
        this.handleUpdatedUserData(message);
        break;
      case 'userJoined':
        this.handleUserJoined(message);
        break;
      case 'userLeft':
        this.handleUserLeft(message);
        break;
      case 'playedSong':
        if (this.verboseMode) console.log(`🎵 playedSong message received: ${JSON.stringify(message, null, 2)}`);
        this.handlePlayedSong(message);
        break;
      case 'votedOnSong':
        this.handleVotedOnSong(message);
        break;
      case 'addedDj':
        this.handleAddedDj(message);
        break;
      case 'removedDj':
        this.handleRemovedDj(message);
        break;
      case 'chatMessage':
      case 'message':
      case 'userSpoke':
        this.handleSocketChatMessage(message);
        break;
    }
  }

  handleStatelessMessage(message) {
    this.log(`📨 Stateless message: ${message.name}`);
    
    switch (message.name) {
      case 'playedOneTimeAnimation':
        this.handlePlayedOneTimeAnimation(message);
        break;
      case 'kickedFromRoom':
        this.handleKickedFromRoom(message);
        break;
      case 'roomReset':
        this.handleRoomReset(message);
        break;
    }
  }

  handleServerMessage(message) {
    // Handle raw server messages if needed
    // Server message received
  }

  async handleSocketChatMessage(message) {
    // Handle chat messages from socket events
    try {
      // Extract message data from various possible formats
      const text = message.text || message.data?.text || message.message || '';
      const senderId = message.userId || message.data?.userId || message.user?.uuid || null;
      const senderName = message.userName || message.data?.userName || message.user?.nickname || 'Unknown';
      const messageId = message.messageId || message.data?.messageId || null;
      
      if (!text || !senderId) {
        // Invalid message format
        return;
      }
      
      // Check if message contains bot keywords
      const botKeywords = ['bot', 'b0t', 'bot2', 'b0t2', '@bot2'];
      const messageContainsKeyword = botKeywords.some(keyword => 
        text.toLowerCase().includes(keyword)
      );
      
      if (messageContainsKeyword) {
        // Process message with AI/commands
        await this.processUserMessage(text, senderId, senderName, messageId);
      }
    } catch (error) {
      console.log(`❌ Error handling socket chat message: ${error.message}`);
    }
  }

  handleUpdatedUserData(message) {
    // User data updated
    
    // Update room info display after user data is loaded
    setTimeout(() => {
      this.displayUpdatedRoomInfo();
    }, 1000);
  }

  displayUpdatedRoomInfo() {
    if (this.state && this.state.allUserData) {
      console.log('\n🏠 === UPDATED ROOM INFO ===');
      console.log(`👥 Users in room: ${this.state.audienceUsers ? this.state.audienceUsers.length : 0}`);
      console.log(`🎧 DJs on stage: ${this.state.djs ? this.state.djs.length : 0}`);
      
      if (this.state.djs && this.state.djs.length > 0) {
        console.log('🎧 DJs:');
        this.state.djs.forEach((dj, index) => {
          // Get user data from allUserData using UUID
          const userData = this.state.allUserData?.[dj.uuid];
          const djName = userData?.userProfile?.nickname || 
                        userData?.userProfile?.firstName || 
                        dj.userProfile?.nickname || 
                        dj.userProfile?.firstName || 
                        'DJ';
          console.log(`   ${index + 1}. ${djName}`);
        });
      }
      
      if (this.state.audienceUsers && this.state.audienceUsers.length > 0) {
        console.log('👥 Audience:');
        const audienceNames = this.state.audienceUsers.slice(0, 10).map(user => {
          // Get user data from allUserData using UUID
          const userData = this.state.allUserData?.[user.uuid];
          return userData?.userProfile?.nickname || 
                 userData?.userProfile?.firstName || 
                 user.nickname || 
                 user.firstName || 
                 'User';
        });
        console.log(`   ${audienceNames.join(', ')}`);
        if (this.state.audienceUsers.length > 10) {
          console.log(`   ... and ${this.state.audienceUsers.length - 10} more`);
        }
      }
      
      console.log('========================\n');
    }
  }

  handleUserJoined(message) {
    if (message.statePatch) {
      // Extract user info from state patch
      const userPatch = message.statePatch.find(patch => 
        patch.path.includes('/allUserData/') && patch.op === 'add'
      );
      
      if (userPatch && userPatch.value && userPatch.value.userProfile) {
        const user = userPatch.value.userProfile;
        const userName = user.nickname || user.firstName || 'User';
        
        // Update room context
        this.roomContext.usersInRoom.add(userName);
        this.addRoomEvent('user_joined', userName);
        
        if (user.uuid !== this.userId) { // Don't greet ourselves
          console.log(`👋 ${userName} joined`);
          
          if (this.userGreet) {
            // Check if we've greeted this user recently (20 minute cooldown)
            const now = Date.now();
            const lastGreet = this.userGreetCooldowns.get(user.uuid);
            
            if (!lastGreet || (now - lastGreet) > this.greetCooldown) {
              // Add holiday emoji to greet message
              const holidayEmoji = this.getRandomHolidayEmoji();
              const greetMessage = `${holidayEmoji} ${this.userGreetMessage.replace('{name}', userName)}`;
              setTimeout(() => {
                this.sendChat(greetMessage);
                this.userGreetCooldowns.set(user.uuid, now);
                console.log(`👋 Greeted ${userName} (cooldown started) ${holidayEmoji}`);
              }, 2000);
            } else {
              const timeLeft = Math.ceil((this.greetCooldown - (now - lastGreet)) / 60000);
              console.log(`🔇 Skipping greet for ${userName} (cooldown: ${timeLeft} min remaining)`);
            }
          }
        }
      }
    }
  }

  addRoomEvent(type, description) {
    const event = {
      type,
      description,
      timestamp: Date.now()
    };
    
    this.roomContext.recentEvents.push(event);
    
    // Keep only last 10 events
    if (this.roomContext.recentEvents.length > 10) {
      this.roomContext.recentEvents.shift();
    }
  }

  getUserSentiment(userId) {
    return this.userSentiment.get(userId) || { sentiment: 'neutral', interactions: 0 };
  }

  async updateUserSentiment(userId, message) {
    const current = this.getUserSentiment(userId);
    
    // Analyze message for sentiment
    const messageLower = message.toLowerCase();
    
    // Check for racist/hate speech FIRST using AI
    const hasRacistContent = await this.detectRacistContentAI(message);
    if (hasRacistContent) {
      this.racistUsers.add(userId);
      console.log(`🚨 RACIST CONTENT DETECTED from user ${userId}: "${message}"`);
      console.log(`🚨 BAN ALERT: User ${userId} used racist language - CONSIDER BANNING`);
      
      // Publicly call out racist users
      this.sendChat(`🚨 **RACIST CONTENT DETECTED** 🚨\n**User:** ${senderName}\n**Message:** "${message}"\n\n**This user is a piece of shit and should be banned immediately.**`);
      
      // Downvote racist users
      this.downvoteUser(userId);
      
      current.sentiment = 'racist';
      current.interactions++;
      this.userSentiment.set(userId, current);
      return current;
    }
    
    // Detect language
    const detectedLanguage = this.detectLanguage(message);
    if (detectedLanguage !== 'en' && !current.language) {
      current.language = detectedLanguage;
    }
    
    // Negative indicators
    const negativeWords = ['stupid', 'dumb', 'suck', 'hate', 'fuck you', 'asshole', 'bitch', 'shit', 'garbage', 'trash', 'lame', 'boring'];
    const hasNegative = negativeWords.some(word => messageLower.includes(word));
    
    // Positive/Info-seeking indicators
    const positiveWords = ['thanks', 'thank you', 'help', 'info', 'information', 'tell me about', 'what is', 'how does', 'explain', 'good', 'nice', 'cool', 'awesome'];
    const hasPositive = positiveWords.some(word => messageLower.includes(word));
    
    // Update sentiment based on message
    if (hasNegative && !hasPositive) {
      current.sentiment = 'negative';
      // Downvote negative users
      this.downvoteUser(userId);
    } else if (hasPositive && !hasNegative) {
      current.sentiment = 'positive';
    } else if (current.interactions === 0) {
      current.sentiment = 'neutral'; // Start neutral
    }
    
    current.interactions++;
    this.userSentiment.set(userId, current);
    
    return current;
  }

  updateDJTracking() {
    if (this.state && this.state.djs) {
      this.roomContext.djsOnStage.clear();
      this.state.djs.forEach(dj => {
        if (dj.userProfile && dj.userProfile.nickname) {
          this.roomContext.djsOnStage.add(dj.userProfile.nickname);
        }
      });
    }
  }

  async detectRacistContentAI(message) {
    try {
      const prompt = `Analyze this message for racist, hateful, or discriminatory content in ANY language. Consider:
- Racial slurs and derogatory terms (English, Spanish, French, German, Italian, Portuguese, Japanese, Korean, Chinese, Arabic, Russian, etc.)
- Hate speech targeting groups based on race, ethnicity, religion, sexual orientation, gender, disability
- Implicit bias or coded language
- Foreign language slurs that might not be obvious
- Context matters - distinguish between educational discussion vs actual hate speech

IMPORTANT: Flag ANY racist content regardless of language. Users may use slurs in other languages to avoid detection.

Message: "${message}"

If this message contains ANY racist/hateful content in ANY language, respond with "YES RACIST: [brief explanation of what was detected]"
If this is clean content, respond with "NO"`;

      const response = await this.callOpenAI(prompt);
      
      if (response && response.trim().toUpperCase().includes('YES RACIST')) {
        // Extract the explanation for logging
        const explanation = response.split(':')[1]?.trim() || 'Racist content detected';
        console.log(`🚨 RACIST CONTENT EXPLANATION: ${explanation}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.log(`❌ Error in AI racist detection: ${error.message}`);
      return false; // Default to not racist if AI fails
    }
  }

  detectLanguage(message) {
    // Simple language detection based on common words and patterns
    const messageLower = message.toLowerCase();
    
    // Spanish
    const spanishWords = ['hola', 'gracias', 'por favor', 'música', 'canción', 'artista', 'álbum'];
    if (spanishWords.some(word => messageLower.includes(word))) return 'es';
    
    // French
    const frenchWords = ['bonjour', 'merci', 's\'il vous plaît', 'musique', 'chanson', 'artiste', 'album'];
    if (frenchWords.some(word => messageLower.includes(word))) return 'fr';
    
    // German
    const germanWords = ['hallo', 'danke', 'bitte', 'musik', 'lied', 'künstler', 'album'];
    if (germanWords.some(word => messageLower.includes(word))) return 'de';
    
    // Italian
    const italianWords = ['ciao', 'grazie', 'per favore', 'musica', 'canzone', 'artista', 'album'];
    if (italianWords.some(word => messageLower.includes(word))) return 'it';
    
    // Portuguese
    const portugueseWords = ['olá', 'obrigado', 'por favor', 'música', 'canção', 'artista', 'álbum'];
    if (portugueseWords.some(word => messageLower.includes(word))) return 'pt';
    
    // Japanese (hiragana/katakana)
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(message)) return 'ja';
    
    // Korean
    if (/[\uAC00-\uD7AF]/.test(message)) return 'ko';
    
    // Chinese
    if (/[\u4E00-\u9FFF]/.test(message)) return 'zh';
    
    // Arabic
    if (/[\u0600-\u06FF]/.test(message)) return 'ar';
    
    // Russian
    if (/[\u0400-\u04FF]/.test(message)) return 'ru';
    
    // Default to English
    return 'en';
  }

  getLanguageName(languageCode) {
    const languageNames = {
      'es': 'Spanish',
      'fr': 'French', 
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'ar': 'Arabic',
      'ru': 'Russian'
    };
    return languageNames[languageCode] || 'English';
  }

  buildRoomContext() {
    let roomInfo = '';
    
    // Add current users with proper names
    if (this.state && this.state.audienceUsers && this.state.audienceUsers.length > 0) {
      const userNames = this.state.audienceUsers.slice(0, 5).map(user => {
        const userData = this.state.allUserData?.[user.uuid];
        return userData?.userProfile?.nickname || 
               userData?.userProfile?.firstName || 
               user.nickname || 
               user.firstName || 
               'User';
      });
      roomInfo += `Users in room: ${userNames.join(', ')}`;
      if (this.state.audienceUsers.length > 5) {
        roomInfo += ` (and ${this.state.audienceUsers.length - 5} more)`;
      }
      roomInfo += '\n';
    }
    
    // Add DJs on stage with proper names and next songs
    if (this.state && this.state.djs && this.state.djs.length > 0) {
      const djInfo = this.state.djs.slice(0, 3).map(dj => {
        const userData = this.state.allUserData?.[dj.uuid];
        const djName = userData?.userProfile?.nickname || 
                      userData?.userProfile?.firstName || 
                      dj.userProfile?.nickname || 
                      dj.userProfile?.firstName || 
                      'DJ';
        const nextSong = dj.nextSong ? `${dj.nextSong.artistName} - ${dj.nextSong.trackName}` : 'No song queued';
        return `${djName} (next: ${nextSong})`;
      });
      roomInfo += `DJs on stage: ${djInfo.join(', ')}`;
      if (this.state.djs.length > 3) {
        roomInfo += ` (and ${this.state.djs.length - 3} more)`;
      }
      roomInfo += '\n';
    }
    
    // Add recent events (occasionally)
    if (Math.random() < 0.3 && this.roomContext.recentEvents.length > 0) { // 30% chance
      const recentEvent = this.roomContext.recentEvents[this.roomContext.recentEvents.length - 1];
      const timeAgo = Math.floor((Date.now() - recentEvent.timestamp) / 1000);
      if (timeAgo < 300) { // Only if within 5 minutes
        roomInfo += `Recent: ${recentEvent.description} (${timeAgo}s ago)`;
      }
    }
    
    return roomInfo;
  }

  handleUserLeft(message) {
    // Update room context when user leaves
    if (message.statePatch) {
      const userPatch = message.statePatch.find(patch => 
        patch.path.includes('/allUserData/') && patch.op === 'remove'
      );
      
      if (userPatch && userPatch.value && userPatch.value.userProfile) {
        const user = userPatch.value.userProfile;
        const userName = user.nickname || user.firstName || 'User';
        const userId = user.uuid;
        
        this.roomContext.usersInRoom.delete(userName);
        this.addRoomEvent('user_left', userName);
        
        // Clear cached DJ info if this user was the current DJ
        if (userId === this.currentDjId) {
          console.log(`👋 ${userName} left (was cached as current DJ) - clearing cache`);
          this.currentDjId = null;
          this.currentDjName = null;
        } else {
          console.log(`👋 ${userName} left`);
        }
      }
    }
  }

  async handlePlayedSong(message) {
    if (this.verboseMode) console.log(`🎵 handlePlayedSong called with state: ${JSON.stringify(this.state?.nowPlaying, null, 2)}`);
    
    // Check if bot is on stage
    const isBotOnStage = this.isUserOnStage(this.userId);
    
    // Get info about who's playing now
    const nowPlaying = this.state?.nowPlaying;
    const currentDJ = nowPlaying?.dj?.userProfile?.uuid || nowPlaying?.dj?.uuid;
    const isCurrentlyBotSong = currentDJ === this.userId;
    
    // Content filter check for user-played songs (not bot songs)
    if (this.contentFilterEnabled && nowPlaying?.song && !isCurrentlyBotSong && currentDJ) {
      const song = nowPlaying.song;
      const isContentSafe = await this.checkContentSafety(song.artistName, song.trackName);
      
      if (!isContentSafe) {
        console.log(`🚫 CONTENT FILTER TRIGGERED: ${song.artistName} - ${song.trackName}`);
        await this.handleInappropriateContent(currentDJ, song);
        return; // Stop processing this song entirely
      }
    }
    
    // 🔥 NEW: ALWAYS re-analyze and queue after EVERY play (human or bot)
    // Bot picks music ALL THE TIME - on stage, glued to floor, doesn't matter
    // Just like the deepcut.live bot
    if (nowPlaying?.song) {
      if (!isCurrentlyBotSong) {
        console.log('🔄 Human play finished - queuing next song based on last 10 human plays...');
      } else {
        console.log('🔄 Bot play finished - queuing next song based on last 10 human plays...');
        
        // Increment bot's song counter for auto hop down logic
        if (isCurrentlyBotSong) {
          this.songsPlayedSinceHopUp++;
          console.log(`🎵 Bot has now played ${this.songsPlayedSinceHopUp} song(s) since hopping up`);
        }
      }
      
      // ALWAYS queue a new song after every play (regardless of bot stage status or glue status)
      setTimeout(async () => {
        try {
          // Generate a new song suggestion (analyzes last 10 HUMAN plays only)
          const suggestedSong = await this.generateSongSuggestion(false);
          
          if (suggestedSong) {
            console.log(`🎵 Auto-queuing: ${suggestedSong.artist} - ${suggestedSong.title}`);
            
            // Search hang.fm catalog for the song
            const songData = await this.searchHangFmCatalog(suggestedSong.artist, suggestedSong.title);
            
            if (songData) {
              try {
                // Use the WORKING method: updateNextSong with catalog data
                await this.socket.action('updateNextSong', { song: songData });
                console.log(`✅ Auto-queued: ${songData.artistName} - ${songData.trackName}`);
                this.botNextSong = suggestedSong;
              } catch (queueError) {
                console.log(`❌ Failed to queue song: ${queueError.message}`);
              }
            } else {
              console.log(`❌ Song not found in hang.fm catalog: ${suggestedSong.artist} - ${suggestedSong.title}`);
              console.log(`🔄 Will try again on next song...`);
            }
          }
        } catch (error) {
          console.log(`❌ Error auto-queuing song: ${error.message}`);
        }
      }, 3000); // Wait 3 seconds after song starts
    }
    
    if (this.state && this.state.nowPlaying && this.state.nowPlaying.song) {
      this.currentSong = this.state.nowPlaying.song;
      const song = this.currentSong;
      
      // Update room context with detailed music info
      this.roomContext.nowPlaying = {
        artist: song.artistName,
        track: song.trackName,
        album: song.albumName || 'Unknown Album',
        year: song.releaseYear || 'Unknown Year',
        duration: song.duration || 0
      };
      
      // Track room song history for learning (from deepcut bot)
      // Get the DJ who played this song
      // Try multiple methods to find the current DJ
      let djInfo = null;
      let djId = 'unknown';
      let djName = 'Unknown DJ';
      
      // Method 1: Check nowPlaying for DJ info (MOST RELIABLE - use this first!)
      if (this.state?.nowPlaying?.dj) {
        djId = this.state.nowPlaying.dj.userProfile?.uuid || this.state.nowPlaying.dj.uuid || this.state.nowPlaying.djUuid;
        djName = this.getUsernameById(djId) || 
                 this.state.nowPlaying.dj.userProfile?.nickname ||
                 this.state.nowPlaying.dj.displayName ||
                 'Unknown DJ';
        if (this.verboseMode) console.log(`🔍 DJ from nowPlaying.dj: ${djName} (${djId})`);
      }
      // Method 2: Check nowPlaying for djUuid directly
      else if (this.state?.nowPlaying?.djUuid) {
        djId = this.state.nowPlaying.djUuid;
        djName = this.getUsernameById(djId) || 'Unknown DJ';
        if (this.verboseMode) console.log(`🔍 DJ from nowPlaying.djUuid: ${djName} (${djId})`);
      }
      // Method 3: Use tracked current DJ (but always re-resolve name to avoid stale cache)
      else if (this.currentDjId) {
        djId = this.currentDjId;
        // ALWAYS re-resolve username to avoid showing stale names (e.g., "Corpus" after they left)
        const freshName = this.getUsernameById(djId);
        if (freshName && freshName !== 'Unknown User') {
          djName = freshName;
          if (this.verboseMode) console.log(`🔍 DJ from cache ID, fresh name: ${djName} (${djId})`);
        } else {
          // If fresh lookup fails, fall back to cached name
          djName = this.currentDjName || 'Unknown DJ';
          if (this.verboseMode) console.log(`🔍 DJ from cache (stale?): ${djName} (${djId})`);
        }
      }
      // Method 4: Find DJ with no nextSong (they just played)
      else {
        djInfo = this.state?.djs?.find(dj => dj.nextSong === null) || 
                 this.state?.visibleDjs?.find(dj => dj.nextSong === null);
        if (djInfo) {
          djId = djInfo.uuid || djInfo.userProfile?.uuid || 'unknown';
          djName = djInfo.userProfile?.nickname || 
                   djInfo.userProfile?.displayName || 
                   djInfo.displayName || 
                   djInfo.nickname ||
                   this.getUsernameById(djId) || 
                   'Unknown DJ';
          if (this.verboseMode) console.log(`🔍 DJ from nextSong check: ${djName} (${djId})`);
        }
      }
      
      // Method 5: If still unknown, try to get from allUserData
      if (djName === 'Unknown DJ' && djId !== 'unknown') {
        djName = this.getUsernameById(djId) || 'Unknown DJ';
        if (this.verboseMode) console.log(`🔍 DJ from allUserData: ${djName} (${djId})`);
      }
      
      // Store current DJ for next time
      this.currentDjId = djId;
      this.currentDjName = djName;
      
      if (djName === 'Unknown DJ') {
        console.log(`⚠️ Could not identify DJ for song: ${song.artistName} - ${song.trackName}`);
        console.log(`🔍 Available DJ data:`, {
          djsCount: this.state?.djs?.length,
          visibleDjsCount: this.state?.visibleDjs?.length,
          allUserDataKeys: Object.keys(this.state?.allUserData || {}).length,
          djId: djId
        });
      } else {
        // Log successful DJ resolution
        console.log(`✅ Resolved DJ: ${djName} (${djId})`);
      }
      
      this.roomSongHistory.push({
        artist: song.artistName,
        song: song.trackName,
        album: song.albumName || 'Unknown Album',
        year: song.releaseYear || 'Unknown Year',
        djId: djId,
        djName: djName,
        isBotSong: djId === this.userId,
        timestamp: Date.now()
      });
      
      // Learn SONGS from user plays (not artists - we learn artists from Spotify/Discogs instead)
      if (!this.isBotUser(djId, djName)) {
        // Always log with fresh username lookup to avoid showing stale names
        const freshDjNameForLog = this.getUsernameById(djId) || djName;
        console.log(`👤 ${freshDjNameForLog} just played their song`);
        
        // Learn the SONG (not the artist - artists come from Spotify/Discogs)
        this.learnSongFromUser(song.artistName, song.trackName);
        
        // Check for repeat plays (same song twice in a row)
        const songKey = `${song.artistName} - ${song.trackName}`;
        const lastSong = this.userLastSongs.get(djId);
        
        if (lastSong === songKey) {
          console.log(`🔁 REPEAT PLAY DETECTED from ${djName}: ${songKey}`);
          this.sendChat(`🚫 **${djName} removed from stage** for playing the same song twice in a row. Please play different songs.`);
          
          try {
            // Use 'djUuid' parameter as per ttfm-socket API
            await this.socket.action('removeDj', { djUuid: djId });
            console.log(`👢 Removed ${djName} for repeat play`);
          } catch (error) {
            console.log(`❌ Failed to remove DJ: ${error.message}`);
          }
          
          // Don't learn from this play or use AI tokens
          return;
        }
        
        // Track this user's last song
        this.userLastSongs.set(djId, songKey);
        
        // 🔥 Check for nosedive countdown (user armed /nosedive on themselves)
        // Use MULTIPLE sources to detect DJ ID - nowPlaying.djUuid is most reliable
        const nowPlayingDjUuid = this.state?.nowPlaying?.djUuid;
        const possibleDjIds = [nowPlayingDjUuid, djId, this.currentDjId].filter(Boolean);
        
        // Check if ANY of the possible DJ IDs are armed for nosedive
        let armedDjId = null;
        for (const id of possibleDjIds) {
          if (this.nosediveArmed.has(id)) {
            armedDjId = id;
            break;
          }
        }
        
        if (armedDjId) {
          const nosediveData = this.nosediveArmed.get(armedDjId);
          console.log(`🔍 Nosedive check: ${djName} (${armedDjId}) is armed and just played their song`);
          console.log(`💣 Nosedive: ${djName} just played - ${nosediveData.songsRemaining} songs remaining BEFORE decrement`);
          
          // Check if this is the final song (either already 0 or will be after decrement)
          if (nosediveData.songsRemaining <= 0) {
            // Time to remove them from stage (but DON'T return - let auto-upvote happen first)
            this.sendChat(`💣 ${djName} removed from stage.`);
            console.log(`💣 ${djName} removed via nosedive`);
            
            // Clear the armed status FIRST to prevent double-removal
            this.nosediveArmed.delete(armedDjId);
            
            // Remove AFTER a delay to allow auto-upvote to process
            setTimeout(async () => {
              try {
                // Only remove if they're still on stage
                if (this.isUserOnStage(armedDjId)) {
                  // Use 'djUuid' parameter as per ttfm-socket API
                  await this.socket.action('removeDj', { djUuid: armedDjId });
                  console.log(`💣 ${djName} removed from stage (delayed for auto-upvote)`);
                } else {
                  console.log(`⚠️ ${djName} already left stage`);
                }
              } catch (error) {
                console.log(`❌ Nosedive failed: ${error.message}`);
              }
            }, 6000); // Wait 6 seconds (1 second after auto-upvote)
          } else {
            // Decrement and continue countdown
            nosediveData.songsRemaining--;
            console.log(`💣 ${djName}: ${nosediveData.songsRemaining} song(s) until nosedive`);
          }
        }
        
        // Token budget system - check if this DJ has tokens remaining
        let tokenBudget = this.userTokenBudgets.get(djId);
        if (!tokenBudget) {
          tokenBudget = { tokens: this.tokensPerDJ, lastPlay: Date.now(), lastSong: songKey };
          this.userTokenBudgets.set(djId, tokenBudget);
        }
        
        // Reset tokens if it's been more than 1 hour
        const oneHour = 60 * 60 * 1000;
        if (Date.now() - tokenBudget.lastPlay > oneHour) {
          tokenBudget.tokens = this.tokensPerDJ;
          console.log(`🔄 Reset token budget for ${djName} (1 hour passed)`);
        }
        
        // Update last play time
        tokenBudget.lastPlay = Date.now();
        tokenBudget.lastSong = songKey;
        
        // Mark that a user just played
        this.lastUserPlayTimestamp = Date.now();
        
        // USER REQUEST: NEVER use AI - always use curated list matching room vibe
        // Token budget is kept for tracking but not used for AI
        // Always use fresh username for logging
        const freshDjNameForTokenLog = this.getUsernameById(djId) || djName;
        
        if (tokenBudget.tokens > 0) {
          tokenBudget.tokens--;
          console.log(`👤 User play detected - bot will match vibe from curated list (${tokenBudget.tokens} tokens remaining for ${freshDjNameForTokenLog})`);
        } else {
          console.log(`💰 ${freshDjNameForTokenLog} has no tokens left - bot will continue using curated list`);
        }
      }
      
      // Keep only last 50 songs to avoid memory bloat
      if (this.roomSongHistory.length > 50) {
        this.roomSongHistory = this.roomSongHistory.slice(-50);
      }
      
      // Always use fresh username for logging (avoid stale "Corpus" issue)
      const freshDjName = this.getUsernameById(djId) || djName;
      console.log(`📚 Room song history updated: ${this.roomSongHistory.length} songs tracked (last played by ${freshDjName})`);
      
      // CRITICAL: Check if bot is on stage and needs more songs (regardless of whose song just played)
      if (isBotOnStage) {
        const songsRemaining = this.state?.songsRemainingForDj || 0;
        console.log(`🔍 Bot queue check: ${songsRemaining} songs remaining, botNextSong=${!!this.botNextSong}`);
        
        if (songsRemaining < 2 && !this.botNextSong) {
          console.log(`🔄 Bot on stage with only ${songsRemaining} song(s) - queuing more...`);
          setTimeout(async () => {
            await this.selectAndQueueSong('low-queue');
          }, 2000);
        } else if (songsRemaining >= 2) {
          console.log(`✅ Bot has ${songsRemaining} songs - no need to queue yet`);
        } else if (this.botNextSong) {
          console.log(`✅ Bot next song already selected - waiting for queue system`);
        }
      }
      
      // Check if this is a bot song by looking at DJ info or if bot is the only DJ
      const nowPlayingDJ = this.state.nowPlaying.dj;
      const djUuid = nowPlayingDJ?.userProfile?.uuid || nowPlayingDJ?.uuid;
      const djCount = this.state?.djs?.length || 0;
      
      // Also check if this song was queued by the bot (check played songs)
      const songKey = `${song.artistName} - ${song.trackName}`;
      const wasBotQueued = djId === this.userId; // From the DJ detection above
      
      if (this.verboseMode) console.log(`🔍 DJ Detection: djUuid=${djUuid}, botId=${this.userId}, djCount=${djCount}, botOnStage=${isBotOnStage}, wasBotQueued=${wasBotQueued}`);
      
      // If we can identify the DJ, check if it's the bot
      // Otherwise, if bot is the only DJ on stage, assume it's the bot's song
      const isBotPlaying = djUuid === this.userId || 
                          (isBotOnStage && djCount === 1) ||
                          wasBotQueued;
      
      if (this.verboseMode) console.log(`🔍 Is bot playing? ${isBotPlaying}`);
      
      if (isBotPlaying) {
        console.log(`🎵 Bot's song is now playing: ${song.artistName} - ${song.trackName}`);
        
        // Clear botNextSong since this song is now playing (not "next" anymore)
        this.botNextSong = null;
        console.log('🔄 Cleared botNextSong (this song is now playing, not next)');
        
        // Add to played songs to prevent repeats
        const songKey = `${song.artistName} - ${song.trackName}`;
        this.playedSongs.add(songKey);
        console.log(`📝 Added to played songs: ${songKey} (total played: ${this.playedSongs.size})`);
        
        // Update last played artist
        this.lastPlayedArtist = song.artistName;
        
        // Increment songs played since hopping up
        this.songsPlayedSinceHopUp++;
        console.log(`🎵 Bot has played ${this.songsPlayedSinceHopUp} song(s) since hopping up`);
        
        // Check if bot has songs remaining
        const songsRemaining = this.state?.songsRemainingForDj || 0;
        console.log(`🔍 Bot has ${songsRemaining} songs remaining in queue`);
        
        // If bot has 0 songs left, select next song now (for solo play or backup)
        if (songsRemaining === 0 && !this.botNextSong) {
          console.log('🎵 Bot has 0 songs - selecting next...');
          setTimeout(async () => {
            await this.selectAndQueueSong('continuous-play');
          }, 3000);
        }
      }
      
      // Add to recent events
      this.addRoomEvent('song_played', `${song.artistName} - ${song.trackName}`);
      
      // Fetch enhanced metadata if missing
      if ((!song.albumName || song.albumName === 'Unknown') || (!song.releaseYear || song.releaseYear === 'Unknown')) {
        this.fetchSongMetadata(song.artistName, song.trackName).then(metadata => {
          if (metadata) {
            console.log(`🎵 Enhanced metadata: ${song.artistName} - ${song.trackName} | Album: ${metadata.album} | Year: ${metadata.year} | Source: ${metadata.source}`);
            // Update the current song info with enhanced metadata
            this.currentSong.album = metadata.album;
            this.currentSong.year = metadata.year;
          } else {
            // Set default values if no metadata found
            this.currentSong.album = 'Single';
            this.currentSong.year = 'Unknown Year';
            console.log(`🎵 Using default metadata: ${song.artistName} - ${song.trackName} | Album: Single | Year: Unknown Year`);
          }
        });
      }
      
      // Auto-upvote the song
      if (this.verboseMode) console.log(`🔄 Setting up auto-upvote in 5 seconds...`);
      setTimeout(() => {
        if (this.verboseMode) console.log(`🔄 Auto-upvote timeout triggered`);
        this.performAutoUpvote();
      }, 5000); // Wait 5 seconds then upvote
      
      console.log(`🎵 Now Playing: ${song.artistName} - ${song.trackName} | Album: ${song.albumName || 'Single'} | Year: ${song.releaseYear || 'Unknown Year'}`);
      
      // NOTE: Nosedive is now handled in handlePlayedSong when the armed user plays
      // (removed checkNosediveExecution to prevent duplicate removals)
      
      // Automatic song picking based on what users play
      this.checkAutoSongPicking();
      
      // Auto stage management
      this.checkAutoStageManagement();
      
      // Update stats tracking
      this.updateStatsForSong(song);
    }
  }

  handleVotedOnSong(message) {
    // Track user activity for AFK detection when they vote
    if (message && message.userId) {
      const userId = message.userId;
      const userName = this.getUsernameById(userId) || 'Unknown';
      
      // Update last activity timestamp
      this.userLastActivity.set(userId, Date.now());
      
      // Clear any AFK warning for this user
      if (this.afkWarnings.has(userId)) {
        console.log(`✅ ${userName} voted - AFK warning cleared`);
        this.afkWarnings.delete(userId);
      }
      
      console.log(`🗳️ Vote detected from ${userName} - AFK timer reset`);
    }
    
    // Don't track reactions here - we'll track them when song ENDS (in handlePlayedSong)
    // This prevents counting the same votes multiple times as users click rapidly
  }

  async performAutoUpvote() {
    try {
      if (this.verboseMode) console.log(`🔍 Auto-upvote check: enabled=${this.autoUpvoteEnabled}, state exists=${!!this.state}, nowPlaying exists=${!!(this.state && this.state.nowPlaying)}`);
      if (this.autoUpvoteEnabled && this.state && this.state.nowPlaying && this.state.nowPlaying.song) {
        const song = this.state.nowPlaying.song;
        const songId = song.songId;
        if (this.verboseMode) console.log(`🔍 Song ID for upvote: ${songId}`);
        if (songId) {
          // Check content filter before upvoting
          if (this.contentFilterEnabled) {
            const isContentSafe = await this.checkContentSafety(song.artistName, song.trackName);
            if (!isContentSafe) {
              console.log(`🚫 Auto-upvote detected inappropriate content - downvoting instead: ${song.artistName} - ${song.trackName}`);
              try {
                await this.socket.action('voteOnSong', { songVotes: { like: false } });
                console.log(`👎 Downvoted inappropriate content`);
              } catch (error) {
                console.log(`❌ Failed to downvote: ${error.message}`);
              }
              return;
            }
          }
          
          try {
            if (this.verboseMode) console.log(`🔍 Attempting to vote on song ID: ${songId} (type: ${typeof songId})`);
            if (this.verboseMode) console.log(`🔍 Sending vote payload: ${JSON.stringify({ songVotes: { like: true } })}`);
            await this.socket.action('voteOnSong', { songVotes: { like: true } });
            console.log(`👍 Auto-upvoted song: ${song.artistName} - ${song.trackName}`);
          } catch (error) {
            console.log(`❌ Auto-upvote API error: ${error.message}`);
            console.log(`❌ Error details: ${JSON.stringify(error, null, 2)}`);
          }
        } else {
          console.log(`❌ No song ID available for upvote`);
        }
      } else {
        console.log(`❌ Auto-upvote conditions not met`);
      }
    } catch (error) {
      console.log(`❌ Auto-upvote error: ${error.message}`);
    }
  }

  async fetchSongMetadata(artist, track) {
    try {
      console.log(`🔍 Fetching metadata for: ${artist} - ${track}`);
      
      // Clean up artist and track names for better searching
      const cleanArtist = artist.replace(/[^\w\s]/g, '').trim();
      const cleanTrack = track.replace(/[^\w\s]/g, '').trim();
      
      // Priority 1: Spotify (most accurate for modern music)
      if (this.spotifyEnabled) {
        const spotifyData = await this.searchSpotify(artist, track);
        if (spotifyData && spotifyData.album !== 'Single') {
          console.log(`✅ Spotify data found: ${spotifyData.album} (${spotifyData.releaseDate?.substring(0, 4)})`);
          return {
            album: spotifyData.album,
            year: spotifyData.releaseDate?.substring(0, 4) || 'Unknown Year',
            source: 'Spotify'
          };
        }
      }
      
      // Priority 2: MusicBrainz (great for underground/older music)
      const musicbrainzData = await this.fetchFromMusicBrainz(cleanArtist, cleanTrack);
      if (musicbrainzData && musicbrainzData.album !== 'Single') {
        console.log(`✅ MusicBrainz data found: ${musicbrainzData.album} (${musicbrainzData.year})`);
        return musicbrainzData;
      }
      
      // Try with original names if clean names failed
      if (cleanArtist !== artist || cleanTrack !== track) {
        const musicbrainzData2 = await this.fetchFromMusicBrainz(artist, track);
        if (musicbrainzData2 && musicbrainzData2.album !== 'Single') {
          console.log(`✅ MusicBrainz data found (original): ${musicbrainzData2.album} (${musicbrainzData2.year})`);
          return musicbrainzData2;
        }
      }
      
      // Priority 3: Discogs (excellent for underground hip hop)
      if (this.discogsEnabled) {
        const discogsData = await this.searchDiscogs(artist, track);
        if (discogsData && discogsData.title) {
          console.log(`✅ Discogs data found: ${discogsData.title} (${discogsData.year || 'Unknown'})`);
          return {
            album: discogsData.title,
            year: discogsData.year || 'Unknown Year',
            source: 'Discogs'
          };
        }
      }
      
      // Priority 4: Wikipedia (fallback)
      const wikipediaData = await this.fetchFromWikipedia(cleanArtist, cleanTrack);
      if (wikipediaData && wikipediaData.album !== 'Single') {
        console.log(`✅ Wikipedia data found: ${wikipediaData.album} (${wikipediaData.year})`);
        return wikipediaData;
      }
      
      console.log(`❌ No metadata found for ${artist} - ${track}`);
      return null;
    } catch (error) {
      console.log(`❌ Error fetching metadata: ${error.message}`);
      return null;
    }
  }

  async fetchFromMusicBrainz(artist, track) {
    try {
      const axios = require('axios');
      
      // Search for recordings directly (more reliable)
      const recordingsResponse = await axios.get(`https://musicbrainz.org/ws/2/recording`, {
        params: {
          query: `recording:"${track}" AND artist:"${artist}"`,
          fmt: 'json',
          limit: 5,
          inc: 'releases'
        },
        headers: {
          'User-Agent': 'HangFM-Bot/1.0 (https://hang.fm)'
        },
        timeout: 10000
      });
      
      if (!recordingsResponse.data.recordings || recordingsResponse.data.recordings.length === 0) {
        return null;
      }
      
      // Find the best match
      for (const recording of recordingsResponse.data.recordings) {
        if (recording.releases && recording.releases.length > 0) {
          const release = recording.releases[0];
          if (release.title && release.title !== 'Single' && release.date) {
            return {
              album: release.title,
              year: release.date.substring(0, 4),
              source: 'MusicBrainz'
            };
          }
        }
      }
      
      // Fallback to first release
      const recording = recordingsResponse.data.recordings[0];
      const release = recording.releases && recording.releases[0];
      
      return {
        album: release ? release.title : 'Single',
        year: release ? release.date ? release.date.substring(0, 4) : 'Unknown Year' : 'Unknown Year',
        source: 'MusicBrainz'
      };
    } catch (error) {
      console.log(`❌ MusicBrainz error: ${error.message}`);
      return null;
    }
  }

  async fetchFromWikipedia(artist, track) {
    try {
      const axios = require('axios');
      
      // Build headers with OAuth token if available (5000 req/hour)
      const headers = {
        'User-Agent': 'HangFM-Bot/1.0 (https://hang.fm)'
      };
      if (this.wikipediaAccessToken) {
        headers['Authorization'] = `Bearer ${this.wikipediaAccessToken}`;
      }
      
      // Try searching for the artist first
      const artistSearchResponse = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artist)}`, {
        headers,
        timeout: 10000
      });
      
      if (artistSearchResponse.data.extract) {
        const extract = artistSearchResponse.data.extract.toLowerCase();
        const yearMatch = extract.match(/(\d{4})/);
        const albumMatch = extract.match(/album[^.]*?([^.,\n]+)/);
        
        if (yearMatch || albumMatch) {
          return {
            album: albumMatch ? albumMatch[1].trim() : 'Single',
            year: yearMatch ? yearMatch[1] : 'Unknown Year',
            source: 'Wikipedia'
          };
        }
      }
      
      // Try searching for the track
      const trackSearchResponse = await axios.get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(track)}`, {
        headers,
        timeout: 10000
      });
      
      if (trackSearchResponse.data.extract) {
        const extract = trackSearchResponse.data.extract.toLowerCase();
        const yearMatch = extract.match(/(\d{4})/);
        const albumMatch = extract.match(/album[^.]*?([^.,\n]+)/);
        
        return {
          album: albumMatch ? albumMatch[1].trim() : 'Single',
          year: yearMatch ? yearMatch[1] : 'Unknown Year',
          source: 'Wikipedia'
        };
      }
      
      return null;
    } catch (error) {
      console.log(`❌ Wikipedia error: ${error.message}`);
      return null;
    }
  }

  // Song Selection System (from deepcut bot)
  async selectAndQueueSong(context = 'general') {
    // Helper function to select and queue a song with retry logic
    // Returns true if successful, false otherwise
    let attempts = 0;
    const maxAttempts = 3; // Reduced from 5 to save tokens
    let aiAttempts = 0;
    const maxAiAttempts = 2; // Only try AI twice before falling back
    
    // FORCE AI if context is 'after-user' - always use AI to match user's vibe
    const forceAI = context === 'after-user' || context === 'dj-joined';
    
    while (attempts < maxAttempts) {
      attempts++;
      
      // After 2 AI failures, force fallback list to save tokens (unless forceAI)
      const forceFallback = !forceAI && aiAttempts >= maxAiAttempts;
      
      const suggestedSong = await this.generateSongSuggestion(forceFallback);
      if (!suggestedSong) {
        if (this.verboseMode) console.log(`❌ Attempt #${attempts}: Failed to generate suggestion`);
        continue;
      }
      
      // Track if this was from AI
      if (suggestedSong.source && suggestedSong.source.includes('AI')) {
        aiAttempts++;
      }
      
      // Search hang.fm catalog
      const songData = await this.searchHangFmCatalog(suggestedSong.artist, suggestedSong.title);
      
      if (songData) {
        // Found a valid song!
        this.botNextSong = suggestedSong;
        
        try {
          await this.socket.action('updateNextSong', { song: songData });
          console.log(`✅ Queued: ${songData.artistName} - ${songData.trackName}`);
          return true;
        } catch (queueError) {
          console.log(`❌ Failed to queue song: ${queueError.message}`);
          return false;
        }
      } else {
        // Song not found, try again
        if (this.verboseMode) console.log(`❌ Attempt #${attempts}/${maxAttempts} failed - trying another...`);
      }
    }
    
    console.log(`❌ Failed to find valid song after ${maxAttempts} attempts`);
    return false;
  }

  getArtistsForGenre(genre, curatedArtists) {
    // Map genres to artist pool based on comments in curatedArtists array
    const genreMarkers = {
      'jazz': 'JAZZ',
      'blues': 'BLUES',
      'country': 'COUNTRY',
      'electronic': 'ELECTRONIC',
      'reggae': 'REGGAE',
      'funk': 'FUNK',
      'classical': 'CLASSICAL',
      'hip hop': 'HIP HOP',
      'rock': 'ROCK',
      'metal': 'METAL',
      'punk': 'Hardcore Punk',
      'indie': 'Indie Rock',
      'shoegaze': 'Shoegaze',
      'post-rock': 'Post-Punk',
      'stoner': 'Stoner Rock'
    };
    
    const marker = genreMarkers[genre.toLowerCase()];
    if (!marker) {
      console.log(`⚠️ No genre marker found for "${genre}", using all artists`);
      return curatedArtists;
    }
    
    // Find the start index for this genre (look for marker in array as a string element or comment)
    const curatedString = curatedArtists.join('|||');
    const markerIndex = curatedString.toUpperCase().indexOf(marker.toUpperCase());
    
    if (markerIndex === -1) {
      console.log(`⚠️ Genre marker "${marker}" not found in curated list`);
      return curatedArtists;
    }
    
    // Count how many artists before the marker
    const beforeMarker = curatedString.substring(0, markerIndex);
    const startIndex = beforeMarker.split('|||').length - 1;
    
    // Find next genre marker to know where this genre ends
    const afterMarker = curatedString.substring(markerIndex + marker.length);
    const nextMarkerMatch = afterMarker.match(/═══════════════════════/);
    
    let endIndex = curatedArtists.length;
    if (nextMarkerMatch) {
      const nextMarkerPos = markerIndex + marker.length + nextMarkerMatch.index;
      const beforeNextMarker = curatedString.substring(0, nextMarkerPos);
      endIndex = beforeNextMarker.split('|||').length - 1;
    }
    
    const genreArtists = curatedArtists.slice(startIndex, endIndex).filter(artist => 
      !artist.includes('═══') && artist.trim().length > 0
    );
    
    console.log(`🎵 Extracted ${genreArtists.length} artists for genre "${genre}" (indices ${startIndex}-${endIndex})`);
    return genreArtists;
  }

  async generateSongSuggestion(forceFallback = false) {
    try {
      if (this.verboseMode) console.log('🎵 Generating song suggestion...');
      
      const now = Date.now();
      
      // Check how many DJs are on stage
      const djCount = this.state?.djs?.length || 0;
      const otherDJsOnStage = djCount > 1; // Are there other human DJs with the bot?
      
      // USER REQUEST: Prioritize current DJs on stage over audience members
      // Get list of current DJs on stage (excluding bot)
      const currentDJs = (this.state?.djs || []).map(dj => String(dj.userId || dj.id || dj)).filter(id => id !== this.userId);
      
      // Get songs played by CURRENT DJs on stage (higher priority)
      const currentDJSongs = this.roomSongHistory
        .filter(entry => !entry.isBotSong && currentDJs.includes(String(entry.djId)))
        .slice(-20); // Last 20 songs from current DJs
      
      // Get songs from ALL users as fallback (if not enough data from current DJs)
      const allUserSongs = this.roomSongHistory
        .filter(entry => !entry.isBotSong && entry.djId !== this.userId && entry.djId !== 'unknown')
        .slice(-10); // Last 10 user songs
      
      // PRIORITIZE current DJs - use their songs if we have at least 3, otherwise use all users
      const recentUserSongs = currentDJSongs.length >= 3 ? currentDJSongs : allUserSongs;
      
      if (currentDJSongs.length >= 3) {
        console.log(`🎯 Analyzing current DJs on stage: ${currentDJs.length} DJs, ${currentDJSongs.length} songs from them`);
      } else if (currentDJs.length > 0) {
        console.log(`⚠️ Not enough data from current DJs (${currentDJSongs.length} songs), using all recent plays: ${allUserSongs.length} songs`);
      } else {
        console.log(`📚 No other DJs on stage, analyzing all recent user plays: ${allUserSongs.length} songs`);
      }
      
      // Step 1: Determine if we should use AI
      // USER REQUEST: NEVER use AI - ALWAYS use curated list matching last 10 plays
      // The bot will detect genres from the last 10 user plays and pick from curated artists
      let shouldUseAI = false; // ALWAYS false - no AI tokens used
      
      if (otherDJsOnStage) {
        console.log(`📚 Other DJs on stage (${djCount} total) - using curated list to match their vibe from last 10 plays`);
      } else {
        console.log(`💰 Bot playing solo - using curated list ONLY (no AI tokens)`);
      }
      
      if (shouldUseAI) {
        
        const aiArtist = await this.getArtistFromAI(recentUserSongs);
        if (aiArtist) {
          const artistSongs = await this.getSongsForArtist(aiArtist);
          if (artistSongs.length > 0) {
            const unplayedSongs = artistSongs.filter(song => {
              const songKey = `${aiArtist} - ${song}`;
              return !this.playedSongs.has(songKey);
            });
            
            if (unplayedSongs.length === 0) {
              if (this.verboseMode) console.log(`🔄 All songs by ${aiArtist} have been played, clearing played songs for this artist`);
              const artistPlayedSongs = Array.from(this.playedSongs).filter(song => song.startsWith(`${aiArtist} -`));
              artistPlayedSongs.forEach(song => this.playedSongs.delete(song));
              unplayedSongs.push(...artistSongs);
            }
            
            const randomSong = unplayedSongs[Math.floor(Math.random() * unplayedSongs.length)];
            
            console.log(`✅ AI selected: ${aiArtist} - ${randomSong}`);
            this.lastSongChangeTime = now;
            this.lastPlayedArtist = aiArtist;
            
            // CRITICAL: Turn AI OFF after using it once
            this.currentProvider = 'off';
            this.aiEnabled = false;
            console.log(`🤖 AI turned OFF after selection (token conservation)`);
            
            return {
              artist: aiArtist,
              title: randomSong,
              source: 'AI + Wikipedia + MusicBrainz'
            };
          }
        }
      } else if (otherDJsOnStage && !this.aiEnabled) {
        console.log(`🎵 Other DJs on stage but AI disabled - using fallback list`);
      } else if (this.aiUsedAfterUserPlay && recentUserSongs.length > 0) {
        console.log(`🎵 AI already used after user play - using fallback list (saving tokens)`);
      } else if (!recentUserSongs.length && !otherDJsOnStage) {
        console.log(`🎵 Bot is solo DJ - using fallback list (no AI tokens used)`);
      }
      
      // Step 2: Use curated underground artists list + learned artists (NO AI TOKENS USED)
      // This is used when bot is solo or when AI fails
      console.log('📚 Using curated artist list (no AI - saving tokens)...');
      
      // ALWAYS analyze room vibe using Spotify/Discogs API (ZERO AI TOKENS)
      let roomVibe = {
        hasHipHop: false,
        hasRock: false,
        hasMetal: false
      };
      
      // Get last 10 user plays + current playing song if it's a user song
      const last10Songs = this.roomSongHistory.slice(-10);
      const nowPlaying = this.state?.nowPlaying?.song;
      const nowPlayingDjId = this.currentDjId;
      
      // Build list of songs to analyze (include current song if it's not the bot's)
      let songsToAnalyze = [...last10Songs.slice(-5)]; // Last 5 from history
      
      // Add current playing song if it's a USER song (not bot)
      if (nowPlaying && nowPlayingDjId && nowPlayingDjId !== this.userId) {
        songsToAnalyze.push({
          artist: nowPlaying.artistName,
          song: nowPlaying.trackName,
          isCurrent: true
        });
        console.log(`🔍 Including current user song in vibe analysis: ${nowPlaying.artistName} - ${nowPlaying.trackName}`);
      }
      
      // Analyze vibe using Spotify API (NO AI)
      if (songsToAnalyze.length > 0) {
        console.log(`📊 Analyzing ${songsToAnalyze.length} user plays using Spotify API (NO AI tokens)...`);
        
        const genreCounts = { hipHop: 0, rock: 0, metal: 0 };
        
        for (const songEntry of songsToAnalyze) {
          try {
            const spotifyData = await this.searchSpotify(songEntry.artist, songEntry.song);
            if (spotifyData && spotifyData.genres && spotifyData.genres.length > 0) {
              const genres = spotifyData.genres.join(' ').toLowerCase();
              
              if (genres.includes('hip hop') || genres.includes('rap') || genres.includes('hip-hop') || genres.includes('r&b') || genres.includes('r and b')) {
                genreCounts.hipHop++;
                if (songEntry.isCurrent) console.log(`🎤 Current song is HIP HOP: ${songEntry.artist}`);
              }
              if (genres.includes('metal') || genres.includes('doom') || genres.includes('sludge') || genres.includes('stoner')) {
                genreCounts.metal++;
                if (songEntry.isCurrent) console.log(`🎸 Current song is METAL: ${songEntry.artist}`);
              }
              if (genres.includes('rock') || genres.includes('punk') || genres.includes('indie') || genres.includes('alternative') || genres.includes('post-')) {
                genreCounts.rock++;
                if (songEntry.isCurrent) console.log(`🎸 Current song is ROCK: ${songEntry.artist}`);
              }
            }
          } catch (error) {
            // Skip if Spotify fails
          }
        }
        
        // Set flags based on what users played
        if (genreCounts.hipHop > 0) roomVibe.hasHipHop = true;
        if (genreCounts.rock > 0) roomVibe.hasRock = true;
        if (genreCounts.metal > 0) roomVibe.hasMetal = true;
        
        console.log(`🎵 Spotify detected vibe: Hip Hop=${genreCounts.hipHop}, Rock=${genreCounts.rock}, Metal=${genreCounts.metal}`);
      }
      
      // Decision: Match user vibe OR randomselection?
      // otherDJsOnStage already declared at line 1665
      
      if (otherDJsOnStage && (roomVibe.hasHipHop || roomVibe.hasRock || roomVibe.hasMetal)) {
        // Other DJs on stage - MATCH their vibe using Spotify genre detection
        console.log(`👥 Other DJs on stage - matching their vibe (Hip Hop=${roomVibe.hasHipHop ? 'Y' : 'N'}, Rock=${roomVibe.hasRock ? 'Y' : 'N'}, Metal=${roomVibe.hasMetal ? 'Y' : 'N'})`);
        // DON'T set all to true - keep detected vibe only
      } else if (!otherDJsOnStage) {
        // Bot alone - enable all genres for variety
        roomVibe.hasHipHop = true;
        roomVibe.hasRock = true;
        roomVibe.hasMetal = true;
        console.log(`🤖 Bot solo - selecting from all 3 genres`);
      } else {
        // Other DJs but no vibe detected - default to all genres
        roomVibe.hasHipHop = true;
        roomVibe.hasRock = true;
        roomVibe.hasMetal = true;
        console.log(`⚠️ Other DJs but no vibe detected - using all genres`);
      }
      
      // Combine curated list with learned artists from users
      const curatedArtists = [
        // ═══════════════════════════════════════════════════════════════
        // ALTERNATIVE HIP HOP / UNDERGROUND HIP HOP
        // Main subgenres: Abstract, Conscious, Backpack, Jazz Rap
        // ═══════════════════════════════════════════════════════════════
        
        // Underground / Abstract Hip Hop (MASSIVE EXPANSION)
        'MF DOOM', 'Madlib', 'Madvillain', 'Viktor Vaughn', 'King Geedorah', 'JJ DOOM', 'DangerDOOM', 'NehruvianDOOM',
        'Quasimoto', 'Jaylib', 'Lootpack', 'Yesterday\'s New Quintet', 'Sound Directions',
        'Aesop Rock', 'El-P', 'Run The Jewels', 'Company Flow', 'Cannibal Ox', 'Vast Aire', 'Vordul Mega',
        'Atoms Family', 'Cryptic One', 'Windnbreeze', 'Alaska', 'Leak Bros',
        'Atmosphere', 'Brother Ali', 'Eyedea & Abilities', 'Slug', 'Sage Francis', 'P.O.S', 'Prof',
        'Busdriver', 'Open Mike Eagle', 'billy woods', 'Armand Hammer', 'Elucid', 'Quelle Chris',
        'Death Grips', 'clipping.', 'Dälek', 'Antipop Consortium', 'Ho99o9', 'Backxwash',
        'Cage', 'Mr. Lif', 'Copywrite', 'Blueprint', 'RJD2', 'Illogic', 'Jakki da Motamouth',
        'Doomtree', 'Sims', 'Dessa', 'Cecil Otter', 'Mike Mictlan', 'Lazerbeak', 'Paper Tiger',
        'Anticon', 'Sole', 'Alias', 'Pedestrian', 'Why?', 'Jel', 'Odd Nosdam', 'Doseone',
        'Themselves', 'Subtle', 'Reaching Quiet', 'Deep Puddle Dynamics', '13 & God', 'cLOUDDEAD',
        'Clouddead', 'Passage', 'Restiform Bodies', 'Telephone Jim Jesus',
        
        // Conscious / Political Hip Hop (EXPANDED)
        'Talib Kweli', 'Mos Def', 'Yasiin Bey', 'Common', 'The Roots', 'Black Star', 'Dead Prez',
        'Public Enemy', 'KRS-One', 'Boogie Down Productions',
        'Immortal Technique', 'Sage Francis', 'The Coup',
        'Michael Franti', 'Spearhead',
        'Pharoahe Monch', 'Organized Konfusion', 'Arrested Development',
        'Lupe Fiasco', 'Blu', 'Blu & Exile', 'Exile',
        'Little Brother', 'Phonte', '9th Wonder', 'The Foreign Exchange',
        'Oddisee', 'Apollo Brown', 'Skyzoo', 'Rapsody',
        'Blackstar', 'Jean Grae', 'Murs', 'Kendrick Lamar', 'J. Cole',
        'Noname', 'Saba', 'Smino', 'Mick Jenkins', 'Vic Mensa',
        
        // Jazz Rap / Native Tongues (DEEP DIVE)
        'A Tribe Called Quest', 'Q-Tip', 'Phife Dawg',
        'De La Soul', 'Digable Planets',
        'The Pharcyde', 'Slimkid3', 'Fatlip',
        'Jungle Brothers', 'Souls of Mischief', 'Hieroglyphics', 'Del the Funky Homosapien', 'Casual',
        'Slum Village', 'J Dilla', 'Pete Rock & CL Smooth', 'Pete Rock',
        'Gang Starr', 'DJ Premier', 'Guru',
        'The Roots', 'Black Thought', 'Questlove',
        'Us3', 'Freestyle Fellowship', 'Aceyalone',
        'The Coup', 'Boots Riley',
        
        // Wu-Tang Extended Universe (COMPLETE)
        'Wu-Tang Clan', 'GZA', 'Raekwon', 'Ghostface Killah',
        'Method Man', 'Ol\' Dirty Bastard', 'ODB',
        'Inspectah Deck', 'Masta Killa', 'U-God',
        'Cappadonna', 'Killah Priest', 'Sunz of Man',
        'Gravediggaz', 'RZA', 'Bronze Nazareth', 'Shyheim',
        
        // West Coast Underground Collectives (DEEP)
        'Deltron 3030', 'Del the Funky Homosapien', 'Casual', 'Pep Love', 'Tajai',
        'Hieroglyphics', 'Souls of Mischief', 'Opio', 'A-Plus', 'Phesto', 'Domino',
        'Jurassic 5', 'Chali 2na', 'Akil', 'Marc 7even', 'Zaakir', 'Cut Chemist', 'DJ Nu-Mark',
        'Dilated Peoples', 'Evidence', 'Rakaa Iriscience', 'Babu', 'The Alchemist',
        'People Under the Stairs', 'Thes One', 'Double K', 'OM Records',
        'Living Legends', 'The Grouch', 'Eligh', 'Scarub', 'Luckyiam', 'Murs', 'Arata',
        'The Grouch & Eligh', 'Zion I', 'Amp Live', 'AmpLive', 'Deuce Eclipse',
        'Blackalicious', 'Gift of Gab', 'Chief Xcel', 'Lyrics Born', 'Lateef the Truthspeaker', 'Latyrx',
        'Crown City Rockers', 'Lifesavas', 'Vursatyl', 'Jumbo', 'Quannum',
        
        // Modern Underground / Lo-Fi Hip Hop (EXPANDED)
        'Westside Gunn', 'Conway the Machine', 'Benny the Butcher', 'Griselda',
        'Your Old Droog', 'Ka', 'Roc Marciano', 'Mach-Hommy',
        'Navy Blue', 'MIKE', 'Earl Sweatshirt', 'Vince Staples', 'Danny Brown',
        'Milo', 'R.A.P. Ferreira', 'Serengeti', 'Pink Siifu',
        'JPEGMAFIA', 'Clams Casino',
        'Denmark Vessey', 'Homeboy Sandman',
        'Kool A.D.', 'Das Racist', 'Heems',
        'Chester Watson', 'Medhane',
        'Boldy James', 'Stove God Cooks', 'Rome Streetz', 'Fly Anakin',
        'Mavi', 'Maxo', 'Slauson Malone', 'Standing on the Corner',
        'Koncept Jack$on', 'Liv.e', 'MAVI', 'Mutant Academy',
        '$$$ Lean Leanin', 'Akai Solo', 'lojii', 'CRIMEAPPLE',
        
        // Experimental / Abstract Hip Hop (HOT RIGHT NOW)
        'Clipping', 'Death Grips', 'Shabazz Palaces',
        'Captain Murphy', 'Flying Lotus', 'Thundercat',
        'The Underachievers', 'Flatbush Zombies', 'Pro Era', 'Joey Bada$$',
        'Injury Reserve', 'Armand Hammer', 'billy woods', 'Elucid',
        'Quelle Chris', 'The Alchemist', 'Action Bronson',
        'Freddie Gibbs', 'Madlib', 'Freddie Gibbs & Madlib',
        'Run The Jewels', 'Killer Mike', 'El-P',
        'Anderson .Paak', 'NxWorries', 'Knxwledge',
        'Tyler, The Creator', 'Odd Future', 'Frank Ocean',
        'Mac Miller', 'Vince Staples', 'ScHoolboy Q',
        'Isaiah Rashad', 'SiR', 'Reason', 'Zacari',
        
        // Southern Alternative / Dirty South (DEEP)
        'Outkast', 'André 3000', 'Big Boi', 'Goodie Mob', 'CeeLo Green', 'Khujo',
        'Killer Mike', 'Run The Jewels', 'Dungeon Family', 'Organized Noize',
        'Witchdoctor', 'Cool Breeze', 'Backbone', 'Big Rube', 'Society of Soul',
        'UGK', 'Bun B', 'Pimp C', 'Devin the Dude', 'Scarface', 'Geto Boys',
        'Willie D', 'Bushwick Bill', 'Three 6 Mafia', 'Project Pat', 'Juicy J',
        '8Ball & MJG', 'Eightball', 'MJG', 'Suave House', 'Hypnotize Minds',
        'CunninLynguists', 'Kno', 'Deacon the Villain', 'Natti', 'Mr. SOS',
        
        // East Coast Underground (DEEP)
        'Jedi Mind Tricks', 'Vinnie Paz', 'Stoupe the Enemy of Mankind', 'Jus Allah',
        'Army of the Pharaohs', 'Apathy', 'Celph Titled', 'Esoteric', 'Planetary',
        'Demigodz', 'Ill Bill', 'Necro', 'Non Phixion', 'Sabac Red', 'Goretex',
        'La Coka Nostra', 'Slaine', 'Everlast', 'DJ Lethal', 'Danny Boy',
        'Snowgoons', 'R.A. the Rugged Man', 'Jedi Mind Tricks', 'Reef the Lost Cauze',
        'Pharoahe Monch', 'Organized Konfusion', 'Prince Po', 'O.C.', 'D.I.T.C.',
        'Kool Keith', 'Dr. Octagon', 'Dr. Dooom', 'Black Elvis', 'Ultramagnetic MCs',
        'Ced Gee', 'TR-Love', 'Moe Love', 'Tim Dog', 'Black Sheep', 'Dres', 'Mista Lawnge',
        'Brand Nubian', 'Grand Puba', 'Lord Jamar', 'Sadat X', 'DJ Alamo',
        
        // ═══════════════════════════════════════════════════════════════
        // ALTERNATIVE ROCK
        // Main subgenres: Indie, Shoegaze, Post-Hardcore, Emo, Noise Rock
        // ═══════════════════════════════════════════════════════════════
        
        // Well-Known Alternative Rock (90s/00s - deep cuts only)
        'Radiohead', 'Thom Yorke', 'Atoms for Peace', 'Nirvana', 'Pearl Jam', 'Soundgarden', 'Alice in Chains',
        'Smashing Pumpkins', 'Nine Inch Nails', 'Trent Reznor', 'How to Destroy Angels',
        'The Cure', 'Robert Smith', 'Depeche Mode', 'New Order', 'Joy Division',
        'Stone Temple Pilots', 'R.E.M.', 'The Smiths', 'Morrissey',
        'Jane\'s Addiction', 'Porno for Pyros', 'Red Hot Chili Peppers', 'Faith No More',
        'Foo Fighters', 'Queens of the Stone Age', 'Muse', 'The Killers',
        'Arcade Fire', 'Vampire Weekend', 'MGMT', 'Tame Impala',
        'Phoenix', 'Two Door Cinema Club', 'Foster the People', 'Alt-J',
        
        // Garage Rock / Blues Rock Revival
        'The White Stripes', 'Jack White', 'The Raconteurs', 'The Dead Weather',
        'The Black Keys', 'Dan Auerbach', 'The Arcs', 'Queens of the Stone Age', 'Eagles of Death Metal',
        'Them Crooked Vultures', 'The Hives', 'The Vines', 'The Strokes', 'The Libertines',
        'Arctic Monkeys', 'The Last Shadow Puppets', 'Bloc Party', 'Franz Ferdinand',
        
        // Indie Rock / Lo-Fi (DEEP)
        'Pavement', 'Stephen Malkmus', 'Silver Jews',
        'Built to Spill', 'Modest Mouse', 'Ugly Casanova',
        'Dinosaur Jr', 'J Mascis', 'Sebadoh', 'Lou Barlow',
        'Guided by Voices', 'Superchunk',
        'Archers of Loaf', 'Polvo',
        'Pixies', 'Frank Black', 'The Breeders', 'The Amps',
        'Beck', 'Weezer', 'The Rentals',
        'Interpol', 'Spoon', 'Wilco', 'Uncle Tupelo',
        'Yo La Tengo', 'Neutral Milk Hotel', 'The Olivia Tremor Control',
        'Sleater-Kinney', 'Wild Flag', 'Bikini Kill', 'Le Tigre',
        'Sonic Youth', 'Thurston Moore', 'Lee Ranaldo', 'Kim Gordon',
        'Mudhoney', 'The Melvins', 'Buzz Osborne', 'Screaming Trees',
        'Fugazi', 'Minor Threat', 'Rites of Spring', 'Embrace',
        'Drive Like Jehu', 'Hot Snakes', 'Rocket from the Crypt',
        'Jawbox', 'Jawbreaker', 'Samiam', 'Texas Is the Reason',
        'Built to Spill', 'Dismemberment Plan', 'Shudder to Think',
        'Karate', 'June of 44', 'Shipping News', 'Rodan',
        
        // Indie Folk / Alt-Country
        'Bon Iver', 'Sufjan Stevens', 'Iron & Wine', 'Fleet Foxes', 'Grizzly Bear',
        'The National', 'Frightened Rabbit', 'The Tallest Man on Earth', 'Father John Misty',
        'Andrew Bird', 'Neko Case', 'The New Pornographers', 'A.C. Newman',
        'Elliott Smith', 'Bright Eyes', 'Conor Oberst', 'Cursive', 'The Good Life',
        
        // Shoegaze / Dream Pop (MASSIVE)
        'My Bloody Valentine', 'Slowdive', 'Mojave 3',
        'Ride', 'Oasis', 'Lush',
        'Mazzy Star', 'Hope Sandoval', 'Cocteau Twins',
        'The Jesus and Mary Chain', 'Spiritualized', 'Spacemen 3',
        'Swervedriver', 'Catherine Wheel', 'Chapterhouse', 'Curve',
        'Pale Saints', 'Medicine',
        'Galaxie 500', 'Luna',
        'Low', 'Bedhead', 'Codeine', 'Duster',
        'Hum', 'Failure', 'Autolux', 'Swirlies',
        'Lovesliescrushing', 'Broken Social Scene', 'Stars',
        'M83', 'School of Seven Bells', 'Asobi Seksu',
        'Deerhunter', 'Atlas Sound', 'Beach House', 'Purity Ring',
        'Whirr', 'Nothing', 'Ringo Deathstarr', 'A Place to Bury Strangers',
        'The Depreciation Guild', 'Alcest', 'Les Discrets',
        'Lantlôs', 'Amesoeurs', 'Agalloch',
        
        // Post-Hardcore / Emo / Screamo (COMPLETE)
        'At the Drive-In', 'The Mars Volta', 'Sparta', 'Antemasque',
        'Glassjaw', 'Head Automatica', 'Daryl Palumbo',
        'Refused', 'The (International) Noise Conspiracy', 'Dennis Lyxzén',
        'Thursday', 'Geoff Rickly', 'No Devotion', 'United Nations',
        'Thrice', 'Dustin Kensrue', 'The Alchemy Index',
        'La Dispute', 'Touché Amoré', 'Pianos Become the Teeth',
        'Defeater', 'The Hotelier', 'Modern Baseball',
        'Foxing', 'Citizen', 'Balance and Composure',
        'Title Fight', 'Basement', 'Turnover', 'Nothing',
        'Movements', 'Counterparts', 'Being as an Ocean',
        'Alexisonfire', 'City and Colour', 'Dallas Green',
        'Saosin', 'Circa Survive', 'The Sound of Animals Fighting',
        'Underoath', 'The Almost', 'Aaron Gillespie',
        'The Fall of Troy', 'Chiodos', 'Dance Gavin Dance',
        'A Lot Like Birds', 'Hail the Sun', 'Sianvar',
        'Poison the Well', 'Hopesfall', 'As Cities Burn',
        'Norma Jean', 'The Chariot', 'Every Time I Die',
        'Cursive', 'The Good Life', 'Desaparecidos', 'Tim Kasher',
        'Cap\'n Jazz', 'American Football', 'Owen', 'Joan of Arc',
        'Mineral', 'The Gloria Record', 'Sunny Day Real Estate', 'The Fire Theft',
        'Texas Is the Reason', 'Sense Field', 'Samiam', 'Jawbreaker',
        'Hot Water Music', 'The Draft', 'Chuck Ragan', 'Drag the River',
        
        // Math Rock / Experimental Rock (NEW SECTION)
        'Don Caballero', 'Battles', 'Lynx', 'Toe',
        'Tera Melos', 'Hella', 'Zach Hill', 'Death Grips',
        'This Town Needs Guns', 'TTNG', 'Piglet',
        'Totorro', 'Lite', 'Mouse on the Keys', 'tricot',
        'American Football', 'Owls', 'Cap\'n Jazz', 'Joan of Arc',
        'Slint', 'Spiderland', 'The For Carnation', 'David Pajo',
        'Shellac', 'Tortoise', 'The Sea and Cake', 'Chicago Underground Duo',
        'Rodan', 'June of 44', 'Shipping News', 'Rachel\'s',
        'Sweep the Leg Johnny', 'Breadwinner', 'Keelhaul',
        'Dazzling Killmen', 'Craw', 'Storm & Stress',
        'U.S. Maple', 'Gastr del Sol', 'The Flying Luttenbachers',
        'Ruins', 'Boredoms', 'Melt-Banana', 'Zeni Geva',
        
        // Noise Rock / No Wave (NEW SECTION)
        'The Jesus Lizard', 'David Yow', 'Scratch Acid',
        'Big Black', 'Shellac', 'Rapeman', 'Steve Albini',
        'Swans', 'Angels of Light', 'Michael Gira', 'Jarboe',
        'Sonic Youth', 'Thurston Moore', 'Lee Ranaldo',
        'The Birthday Party', 'Nick Cave', 'Rowland S. Howard',
        'Unsane', 'Helmet', 'Melvins', 'Buzz Osborne',
        'Butthole Surfers', 'Tad', 'Steel Pole Bath Tub',
        'Tar', 'Cherubs', 'Hammerhead', 'Killdozer',
        'Flip Burgers', 'Cows', 'Milk Cult', 'Rusted Root',
        'DNA', 'Mars', 'Teenage Jesus and the Jerks', 'Lydia Lunch',
        'Glenn Branca', 'Rhys Chatham', 'Band of Susans',
        
        // Post-Punk / New Wave (CLASSICS)
        'Talking Heads', 'David Byrne', 'Tom Tom Club', 'The Smiths', 'Morrissey',
        'Joy Division', 'New Order', 'Electronic',
        'Bauhaus', 'Peter Murphy', 'Love and Rockets',
        'Siouxsie and the Banshees', 'The Cure', 'Robert Smith',
        'Echo & the Bunnymen', 'The Teardrop Explodes',
        
        // ═══════════════════════════════════════════════════════════════
        // ALTERNATIVE METAL (Metalcore, Sludge, Stoner, Post-Metal)
        // ═══════════════════════════════════════════════════════════════
        // Nu Metal / Alternative Metal (COMPLETE)
        'Deftones', 'Chino Moreno', 'Team Sleep', 'Crosses', 'Palms',
        'System of a Down', 'Serj Tankian', 'Scars on Broadway', 'Daron Malakian',
        'Tool', 'Maynard James Keenan', 'A Perfect Circle', 'Puscifer',
        'Rage Against the Machine', 'Audioslave', 'Prophets of Rage',
        'Korn', 'Jonathan Davis', 'Limp Bizkit', 'Fred Durst', 'Linkin Park',
        'Incubus', 'Brandon Boyd', 'Chevelle', 'Mudvayne', 'Sevendust',
        'Glassjaw', 'Daryl Palumbo', 'Head Automatica', 'Far', 'Jonah Matranga', 'onelinedrawing',
        'Quicksand', 'Walter Schreifels', 'Helmet', 'Page Hamilton',
        
        // Stoner Rock / Doom (EXPANDED)
        'Sleep', 'Matt Pike', 'High on Fire', 'Om', 'Al Cisneros', 'Shrinebuilder',
        'Kyuss', 'John Garcia', 'Queens of the Stone Age', 'Josh Homme', 'Eagles of Death Metal',
        'Fu Manchu', 'Scott Hill', 'Nebula', 'Mondo Generator', 'Hermano',
        'Mastodon', 'Brent Hinds', 'Troy Sanders', 'Baroness', 'John Baizley',
        'Kylesa', 'Phillip Cope', 'Torche', 'The Sword', 'Red Fang', 'Black Tusk',
        'Electric Wizard', 'Jus Oborn', 'Yob', 'Mike Scheidt', 'Weedeater', 'Dixie Dave',
        'Eyehategod', 'Mike IX Williams', 'Crowbar', 'Kirk Windstein', 'Down', 'Acid Bath',
        'All Them Witches', 'Earthless', 'Kadavar', 'Uncle Acid', 'Graveyard', 'Wo Fat',
        'Orange Goblin', 'Conan', 'Monolord', 'Bongzilla', 'Bongripper',
        'Windhand', 'Pallbearer', 'Khemmis', 'Spirit Adrift', 'Cough',
        'Thou', 'The Obsessed', 'Scott Reagers', 'Saint Vitus', 'Pentagram',
        'Trouble', 'Candlemass', 'Cathedral', 'Reverend Bizarre',
        'Dopethrone', 'Warhorse', 'Goatsnake', 'Lowrider', 'Truckfighters',
        'Greenleaf', 'Dozer', 'Grand Magus', 'Spiritual Beggars',
        'Colour Haze', 'Elder', 'Mars Red Sky', 'Monkey3',
        
        // Post-Metal / Atmospheric (LEGENDARY)
        'Isis', 'Aaron Turner', 'House of Low Culture', 'Mamiffer', 'Sumac',
        'Neurosis', 'Steve Von Till', 'Scott Kelly', 'Tribes of Neurot', 'Corrections House',
        'Pelican', 'Trevor de Brauw', 'Russian Circles', 'Intronaut', 'Giant Squid',
        'Old Man Gloom', 'Nate Newton', 'Cave In', 'Cult of Luna', 'The Ocean', 'Amenra',
        'Rosetta', 'Mouth of the Architect', 'Baptists', 'KEN mode', 'Oxbow', 'Eugene Robinson',
        'Godflesh', 'Jesu', 'Justin Broadrick', 'JK Flesh',
        'Neurosis', 'Year of No Light', 'Dirge', 'Callisto',
        'Downfall of Gaia', 'Zatokrev', 'Lightbearer', 'Fall of Efrafa',
        'Ancst', 'Kowloon Walled City', 'Buried at Sea', 'Nortt',
        'Les Discrets', 'Alcest', 'Amesoeurs', 'Lantlôs', 'Deafheaven',
        'Altar of Plagues', 'Wolves in the Throne Room', 'Panopticon',
        'Agalloch', 'Fen', 'Primordial', 'Negură Bunget',
        
        // Metalcore / Post-Hardcore Metal (SELECTIVE - keep it alternative)
        'Converge', 'Jacob Bannon', 'Cave In', 'Old Man Gloom', 'Mutoid Man',
        'Every Time I Die', 'The Chariot', 'Norma Jean', 'Botch', 'Coalesce',
        'The Dillinger Escape Plan', 'Dillinger Escape Plan', 'Dimitri Minakakis',
        'Poison the Well', 'Underoath', 'Thrice', 'Dustin Kensrue', 'The Alchemy Index',
        'Darkest Hour', 'Shai Hulud', 'Misery Signals', 'Architects',
        'August Burns Red', 'Killswitch Engage', 'All That Remains',
        'Hatebreed', 'Terror', 'Madball', 'Agnostic Front',
        'Earth Crisis', 'Integrity', 'Ringworm', 'Turmoil',
        'Code Orange', 'Knocked Loose', 'Jesus Piece', 'Year of the Knife',
        'Vein', 'Jesus Piece', 'Employed to Serve', 'Employed to Serve',
        
        // Experimental / Avant-Garde Metal (Mike Patton Universe)
        'Mr. Bungle', 'Fantômas', 'Tomahawk', 'Peeping Tom', 'Lovage',
        'Mike Patton', 'Faith No More', 'Ipecac Recordings',
        'Secret Chiefs 3', 'Trey Spruance', 'Kayo Dot', 'Toby Driver', 'Maudlin of the Well',
        'Sleepytime Gorilla Museum', 'Free Salamander Exhibit', 'uneXpect',
        'Diablo Swing Orchestra', 'Solefald', 'Sigh', 'Igorrr',
        'Unexpect', 'Pin-Up Went Down', 'Carnival in Coal', 'Thy Catafalque',
        
        // Progressive Metal (ACCESSIBLE)
        'Between the Buried and Me', 'Tommy Rogers', 'Protest the Hero',
        'Meshuggah', 'Fredrik Thordendal', 'Gojira', 'Joe Duplantier',
        'Opeth', 'Mikael Åkerfeldt', 'Storm Corrosion', 'Cynic', 'Paul Masvidal',
        'Animals as Leaders', 'Tosin Abasi', 'Intervals', 'Plini',
        'Periphery', 'Tesseract', 'Monuments', 'Sikth',
        'Haken', 'Leprous', 'Caligula\'s Horse', 'Textures',
        'Car Bomb', 'The Contortionist', 'Vildhjarta', 'Humanity\'s Last Breath',
        'Gorguts', 'Ulcerate', 'Artificial Brain', 'Pyrrhon',
        
        // Hardcore Punk / Crossover (LEGENDS)
        'Black Flag', 'Henry Rollins', 'Greg Ginn', 'Rollins Band',
        'Bad Brains', 'H.R.', 'Minor Threat', 'Fugazi', 'Circle Jerks', 'Keith Morris',
        'Dead Kennedys', 'Jello Biafra', 'Descendents', 'Milo Aukerman', 'ALL',
        'Gorilla Biscuits', 'Civ', 'Youth of Today', 'Shelter', 'Quicksand',
        
        // ═══════════════════════════════════════════════════════════════
        // JAZZ (Alternative: Free Jazz, Avant-Garde, Spiritual, Fusion, Nu-Jazz)
        // ═══════════════════════════════════════════════════════════════
        // Free Jazz / Avant-Garde (DEEP)
        'Sun Ra', 'Albert Ayler', 'Pharoah Sanders', 'Archie Shepp', 'Eric Dolphy',
        'Ornette Coleman', 'Don Cherry', 'Cecil Taylor', 'Anthony Braxton', 'Sam Rivers',
        'Charles Mingus', 'John Coltrane', 'Alice Coltrane', 'Yusef Lateef', 'Rahsaan Roland Kirk',
        
        // Spiritual Jazz / Cosmic Jazz
        'Sun Ra Arkestra', 'Kamasi Washington', 'Shabaka Hutchings', 'Sons of Kemet', 'The Comet Is Coming',
        'Irreversible Entanglements', 'Makaya McCraven', 'Jeff Parker', 'Angel Bat Dawid',
        
        // Jazz Fusion / Experimental
        'Weather Report', 'Return to Forever', 'Mahavishnu Orchestra', 'Tony Williams Lifetime',
        'Miles Davis', 'Herbie Hancock', 'Wayne Shorter', 'Keith Jarrett', 'Chick Corea',
        'Jaco Pastorius', 'Jack DeJohnette', 'John McLaughlin', 'Pat Metheny',
        
        // Nu-Jazz / Broken Beat / Future Jazz
        'Flying Lotus', 'Thundercat', 'Kamasi Washington', 'Robert Glasper', 'Terrace Martin',
        'Hiatus Kaiyote', 'Snarky Puppy', 'BadBadNotGood', 'The Comet Is Coming',
        'Yussef Dayes', 'Tom Misch', 'Jordan Rakei', 'Alfa Mist', 'Nubya Garcia',
        'Ezra Collective', 'Moses Boyd', 'BADBADNOTGOOD',
        
        // ═══════════════════════════════════════════════════════════════
        // BLUES (Alternative: Delta, Raw Electric, Psychedelic, Hill Country)
        // ═══════════════════════════════════════════════════════════════
        // Raw Delta / Pre-War Blues (DEEP CUTS)
        'Robert Johnson', 'Son House', 'Skip James', 'Mississippi John Hurt', 'Blind Willie McTell',
        'Charley Patton', 'Bukka White', 'Mississippi Fred McDowell', 'R.L. Burnside',
        
        // Electric Blues / Chicago Underground
        'Howlin\' Wolf', 'Muddy Waters', 'John Lee Hooker', 'Junior Kimbrough',
        'Hound Dog Taylor', 'Magic Sam', 'Otis Rush', 'Buddy Guy', 'Junior Wells',
        
        // Hill Country / Garage Blues
        'R.L. Burnside', 'Junior Kimbrough', 'T-Model Ford', 'Paul "Wine" Jones',
        'Cedric Burnside', 'Lightnin\' Malcolm',
        
        // Alternative / Psych Blues
        'The Black Keys', 'The White Stripes', 'Jack White', 'The Jon Spencer Blues Explosion',
        'North Mississippi Allstars', 'Seasick Steve', 'Gary Clark Jr.',
        
        // ═══════════════════════════════════════════════════════════════
        // COUNTRY (Alternative: Outlaw, Alt-Country, Americana, Red Dirt)
        // ═══════════════════════════════════════════════════════════════
        // Outlaw Country (LEGENDS)
        'Johnny Cash', 'Willie Nelson', 'Waylon Jennings', 'Merle Haggard', 'Kris Kristofferson',
        'Townes Van Zandt', 'Guy Clark', 'Steve Earle', 'Blaze Foley', 'David Allan Coe',
        
        // Alt-Country / No Depression
        'Uncle Tupelo', 'Wilco', 'Son Volt', 'Jay Farrar', 'The Jayhawks', 'Whiskeytown',
        'Ryan Adams', 'Lucinda Williams', 'Drive-By Truckers', 'Jason Isbell',
        'The Bottle Rockets', 'Slobberbone', 'Old 97\'s', 'Calexico', 'Richmond Fontaine',
        
        // Modern Alt-Country / Red Dirt
        'Sturgill Simpson', 'Tyler Childers', 'Colter Wall', 'Flatland Cavalry',
        'Turnpike Troubadours', 'American Aquarium', 'Ben Nichols', 'Cody Jinks',
        
        // Americana / Roots
        'John Prine', 'Gillian Welch', 'Emmylou Harris', 'Gram Parsons',
        'The Flying Burrito Brothers', 'The Byrds', 'The Band',
        
        // ═══════════════════════════════════════════════════════════════
        // ELECTRONIC (Alternative: IDM, Trip-Hop, Experimental, Ambient, UK Bass)
        // ═══════════════════════════════════════════════════════════════
        // IDM / Braindance (WARP Records & Beyond)
        'Aphex Twin', 'Autechre', 'Boards of Canada', 'Squarepusher', 'µ-Ziq',
        'Plaid', 'Luke Vibert', 'LFO', 'Black Dog', 'B12', 'Funkstörung',
        
        // Trip-Hop / Downtempo (Bristol Sound)
        'Massive Attack', 'Portishead', 'Tricky', 'DJ Shadow', 'UNKLE', 'Morcheeba',
        'Thievery Corporation', 'Bonobo', 'Nightmares on Wax', 'Kruder & Dorfmeister',
        
        // UK Bass / Dubstep / Garage
        'Burial', 'Four Tet', 'Caribou', 'Jon Hopkins', 'Jamie xx', 'Mount Kimbie',
        'James Blake', 'SBTRKT', 'Actress', 'Floating Points', 'Joy Orbison',
        'Peverelist', 'Pinch', 'Shackleton', 'Kode9', 'The Bug',
        
        // Experimental / Ambient / Techno
        'The Orb', 'Future Sound of London', 'Global Communication', 'Biosphere',
        'Gas', 'Wolfgang Voigt', 'Pole', 'Vladislav Delay', 'Pan Sonic',
        'Kraftwerk', 'Tangerine Dream', 'Klaus Schulze', 'Cluster', 'Harmonia',
        
        // Beat Scene / Future Beats
        'Flying Lotus', 'Teebs', 'Lapalux', 'Shlohmo', 'XXYYXX', 'Clams Casino',
        'Baths', 'Groundislava', 'Esta', 'Sango',
        
        // ═══════════════════════════════════════════════════════════════
        // REGGAE (Alternative: Dub, Roots, Steppers, Digital)
        // ═══════════════════════════════════════════════════════════════
        // Dub Pioneers / Studio Wizards
        'Lee Scratch Perry', 'King Tubby', 'Scientist', 'Mad Professor', 'Augustus Pablo',
        'Prince Jammy', 'Prince Far I', 'Yabby You', 'The Upsetter', 'Joe Gibbs',
        
        // Roots Reggae / Conscious
        'Burning Spear', 'Culture', 'Black Uhuru', 'The Congos', 'The Abyssinians',
        'Israel Vibration', 'Steel Pulse', 'Misty in Roots', 'Aswad',
        
        // Digital Reggae / Dancehall Underground
        'Sly and Robbie', 'King Jammy', 'Bobby Digital', 'Steely & Clevie',
        
        // Modern Dub / Bass Music
        'Zion Train', 'Dubkasm', 'Channel One', 'Mungo\'s Hi Fi', 'The Bug',
        'Shackleton', 'Pinch', 'Mala', 'Digital Mystikz',
        
        // ═══════════════════════════════════════════════════════════════
        // FUNK / SOUL (Alternative: P-Funk, Psychedelic Soul, Neo-Soul, Afrobeat)
        // ═══════════════════════════════════════════════════════════════
        // P-Funk / Psychedelic Funk
        'Parliament', 'Funkadelic', 'George Clinton', 'Bootsy Collins', 'Bootsy\'s Rubber Band',
        'The Brides of Funkenstein', 'Parlet', 'Zapp', 'Roger Troutman',
        'Sly and the Family Stone', 'The Meters', 'The JB\'s', 'Fred Wesley',
        
        // Deep Funk / Rare Groove
        'James Brown', 'Dyke & the Blazers', 'The Poets of Rhythm', 'Menahan Street Band',
        'The Budos Band', 'Antibalas', 'Sharon Jones & the Dap-Kings', 'Charles Bradley',
        
        // Neo-Soul / Alternative R&B
        'D\'Angelo', 'Erykah Badu', 'Anderson .Paak', 'Thundercat', 'Kamasi Washington',
        'Robert Glasper', 'Hiatus Kaiyote', 'Tom Misch', 'Jordan Rakei',
        'Frank Ocean', 'Solange', 'SZA', 'H.E.R.', 'Daniel Caesar',
        
        // Afrobeat / Afro-Funk
        'Fela Kuti', 'Tony Allen', 'Ebo Taylor', 'Antibalas', 'The Budos Band',
        
        // ═══════════════════════════════════════════════════════════════
        // CLASSICAL (Alternative: Minimalism, Contemporary, Avant-Garde, Neo-Classical)
        // ═══════════════════════════════════════════════════════════════
        // Minimalism / Repetitive
        'Philip Glass', 'Steve Reich', 'Terry Riley', 'La Monte Young', 'John Adams',
        'Michael Nyman', 'Gavin Bryars', 'Tom Johnson',
        
        // Contemporary Classical / Modern Composition
        'Arvo Pärt', 'Henryk Górecki', 'John Tavener', 'Morton Feldman', 'Giacinto Scelsi',
        'Karlheinz Stockhausen', 'Pierre Boulez', 'Iannis Xenakis', 'György Ligeti',
        
        // Neo-Classical / Post-Classical / Ambient Classical
        'Max Richter', 'Ólafur Arnalds', 'Nils Frahm', 'Jóhann Jóhannsson', 'Peter Broderick',
        'Dustin O\'Halloran', 'Poppy Ackroyd', 'Hauschka', 'A Winged Victory for the Sullen',
        'Stars of the Lid', 'Tim Hecker', 'William Basinski', 'The Caretaker',
        
        // Experimental / Avant-Garde
        'John Cage', 'Pauline Oliveros', 'Éliane Radigue', 'Alvin Lucier', 'Meredith Monk'
      ];
      
      // Check if there's a genre request
      let selectedArtists = curatedArtists;
      
      if (this.requestedGenre) {
        console.log(`🎵 Using requested genre: ${this.requestedGenre}`);
        selectedArtists = this.getArtistsForGenre(this.requestedGenre, curatedArtists);
        console.log(`🎵 Found ${selectedArtists.length} artists for ${this.requestedGenre}`);
        
        // Clear the genre request after using it
        this.requestedGenre = null;
        this.genreRequestedBy = null;
      }
      
      // USER REQUEST: Do NOT play learned artists - only use them for genre detection
      // The bot learns from users to understand the room vibe, but plays DIFFERENT artists
      const allArtists = [...selectedArtists];
      
      const learnedArtistsList = Array.from(this.learnedArtists);
      if (learnedArtistsList.length > 0) {
        console.log(`📚 Artist pool: ${curatedArtists.length} curated artists (learned ${learnedArtistsList.length} artists from users for vibe detection only)`);
      }
      
      // Pick a random artist (avoiding recently used and last played)
      const availableArtists = allArtists.filter(artist => 
        !this.recentlyUsedArtists.includes(artist.toLowerCase()) &&
        artist.toLowerCase() !== this.lastPlayedArtist?.toLowerCase()
      );
      
      if (availableArtists.length === 0) {
        if (this.verboseMode) console.log('🔄 All artists recently used, resetting...');
        this.recentlyUsedArtists = [];
        availableArtists.push(...allArtists);
      }
      
      // Filter artists by room vibe if we detected a preference
      let vibeFilteredArtists = availableArtists;
      if (roomVibe.hasHipHop || roomVibe.hasRock || roomVibe.hasMetal) {
        // Dynamically calculate genre boundaries from curatedArtists
        const hipHopEndIndex = curatedArtists.findIndex(a => 
          a.toLowerCase().includes('radiohead') || 
          a.toLowerCase().includes('nirvana') ||
          a.toLowerCase().includes('well-known alternative rock')
        );
        const rockEndIndex = curatedArtists.findIndex(a => 
          a.toLowerCase().includes('deftones') || 
          a.toLowerCase().includes('nu metal') ||
          a.toLowerCase().includes('alternative metal')
        );
        
        const hipHopArtists = curatedArtists.slice(0, hipHopEndIndex > 0 ? hipHopEndIndex : 300);
        const rockArtists = curatedArtists.slice(
          hipHopEndIndex > 0 ? hipHopEndIndex : 300, 
          rockEndIndex > 0 ? rockEndIndex : 500
        );
        const metalArtists = curatedArtists.slice(rockEndIndex > 0 ? rockEndIndex : 500);
        
        vibeFilteredArtists = [];
        
        // Weight genres by frequency - add artists multiple times based on how often they're played
        // This makes the bot heavily favor the dominant genre while still allowing variety
        const hipHopWeight = roomVibe.hipHopCount || 0;
        const rockWeight = roomVibe.rockCount || 0;
        const metalWeight = roomVibe.metalCount || 0;
        const totalPlays = hipHopWeight + rockWeight + metalWeight;
        
        // Add artists proportionally to their play frequency
        if (roomVibe.hasHipHop && hipHopWeight > 0) {
          // Add hip hop artists multiple times if it's the dominant genre
          const hipHopMultiplier = Math.max(1, Math.round((hipHopWeight / totalPlays) * 5));
          console.log(`🎵 Hip Hop weight: ${hipHopWeight}/${totalPlays} plays - multiplier: ${hipHopMultiplier}x`);
          for (let i = 0; i < hipHopMultiplier; i++) {
            vibeFilteredArtists.push(...hipHopArtists);
          }
        }
        
        if (roomVibe.hasRock && rockWeight > 0) {
          const rockMultiplier = Math.max(1, Math.round((rockWeight / totalPlays) * 5));
          console.log(`🎸 Rock weight: ${rockWeight}/${totalPlays} plays - multiplier: ${rockMultiplier}x`);
          for (let i = 0; i < rockMultiplier; i++) {
            vibeFilteredArtists.push(...rockArtists);
          }
        }
        
        if (roomVibe.hasMetal && metalWeight > 0) {
          const metalMultiplier = Math.max(1, Math.round((metalWeight / totalPlays) * 5));
          console.log(`🤘 Metal weight: ${metalWeight}/${totalPlays} plays - multiplier: ${metalMultiplier}x`);
          for (let i = 0; i < metalMultiplier; i++) {
            vibeFilteredArtists.push(...metalArtists);
          }
        }
        
        // Remove duplicates (learned artists are NOT included - we only play curated artists)
        vibeFilteredArtists = [...new Set(vibeFilteredArtists)];
        
        // Fallback if filtering resulted in no artists
        if (vibeFilteredArtists.length === 0) {
          console.log(`⚠️ No artists found for vibe filter, using all available artists`);
          vibeFilteredArtists = availableArtists;
        }
        
        console.log(`🎵 Filtered to ${vibeFilteredArtists.length} curated artists matching room vibe`);
      }
      
      // Safety check before selecting
      if (vibeFilteredArtists.length === 0) {
        vibeFilteredArtists = allArtists;
      }
      
      const randomArtist = vibeFilteredArtists[Math.floor(Math.random() * vibeFilteredArtists.length)];
      this.recentlyUsedArtists.push(randomArtist.toLowerCase());
      if (this.recentlyUsedArtists.length > 15) {
        this.recentlyUsedArtists = this.recentlyUsedArtists.slice(-15);
      }
      
      // All selected artists are from curated list (learned artists are NOT played)
      console.log(`🎲 Selected artist: ${randomArtist} (curated list)`);
      
      // Get songs for this artist
      const artistSongs = await this.getSongsForArtist(randomArtist);
      if (artistSongs.length > 0) {
        // Filter out already played songs
        const unplayedSongs = artistSongs.filter(song => {
          const songKey = `${randomArtist} - ${song}`;
          return !this.playedSongs.has(songKey);
        });
        
        if (unplayedSongs.length === 0) {
          if (this.verboseMode) console.log(`🔄 All songs by ${randomArtist} have been played, clearing...`);
          const artistPlayedSongs = Array.from(this.playedSongs).filter(song => song.startsWith(`${randomArtist} -`));
          artistPlayedSongs.forEach(song => this.playedSongs.delete(song));
          unplayedSongs.push(...artistSongs);
        }
        
        // Pick a random deep cut
        const randomSong = unplayedSongs[Math.floor(Math.random() * unplayedSongs.length)];
        
        console.log(`✅ Selected: ${randomArtist} - ${randomSong} (curated list)`);
        this.lastSongChangeTime = now;
        this.lastPlayedArtist = randomArtist;
        return {
          artist: randomArtist,
          title: randomSong,
          source: 'Curated Alternative Artists + MusicBrainz'
        };
      }
      
      // If we get here, something is wrong
      console.log('❌ Failed to generate song - exhausted all options');
      return null;
      
    } catch (error) {
      console.log(`❌ Error generating song suggestion: ${error.message}`);
      return null; // No placeholder - return null to indicate failure
    }
  }

  async getSongsForArtist(artist) {
    try {
      if (this.verboseMode) console.log(`🎵 Searching MusicBrainz for songs by: ${artist}`);
      
      const searchUrl = `https://musicbrainz.org/ws/2/recording?query=artist:"${encodeURIComponent(artist)}"&fmt=json&limit=50`;
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'HangFM-Bot/1.0 (https://hang.fm)',
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      
      if (response.data && response.data.recordings) {
        const songs = response.data.recordings
          .map(recording => recording.title)
          .filter((title, index, self) => self.indexOf(title) === index); // Remove duplicates
        
        if (this.verboseMode) console.log(`🎵 Found ${songs.length} unique songs for ${artist} on MusicBrainz`);
        return songs;
      }
      
      return [];
    } catch (error) {
      console.log(`❌ Error fetching songs for ${artist}: ${error.message}`);
      return [];
    }
  }

  async searchHangFmCatalog(artist, track) {
    try {
      const query = `${artist} - ${track}`;
      console.log(`🔍 Searching hang.fm catalog for: ${query}`);
      
      // STRATEGY 1: Try exact artist + track search (prefer explicit)
      let response = await axios.get('https://gateway.prod.tt.fm/api/playlist-service/search/v2', {
        params: {
          q: query,
          limit: 20,
          explicit: true // Prefer explicit versions
        },
        headers: {
          'Authorization': `Bearer ${this.botUserToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      
      const filterSongs = (songs, requireTrackMatch = true) => {
        return songs.filter(song => {
          const providers = song.musicProviders || {};
          const providerIds = song.musicProvidersIds || {};
          
          // REJECT if it has ANY SoundCloud provider (check both objects)
          if (providers.soundCloudPublic || providers.soundcloud || providers.soundCloud ||
              providerIds.soundCloudPublic || providerIds.soundcloud || providerIds.soundCloud) {
            if (this.verboseMode) console.log(`❌ Rejected SoundCloud: ${song.artistName} - ${song.trackName}`);
            return false;
          }
          
          // REJECT edited/clean/acapella/instrumental versions - prefer explicit studio versions only
          const trackName = (song.trackName || '').toLowerCase();
          if (trackName.includes('edited') || 
              trackName.includes('clean') || 
              trackName.includes('clean version') ||
              trackName.includes('radio edit') ||
              trackName.includes('radio version') ||
              trackName.includes('acapella') ||
              trackName.includes('a capella') ||
              trackName.includes('accapella') ||
              trackName.includes('vocal only') ||
              trackName.includes('vocals only') ||
              trackName.includes('instrumental')) {
            return false;
          }
          
          // REJECT compilations, greatest hits, soundtracks, tribute albums
          const albumName = (song.albumName || song.album?.name || '').toLowerCase();
          if (albumName.includes('greatest hits') ||
              albumName.includes('best of') ||
              albumName.includes('compilation') ||
              albumName.includes('collection') ||
              albumName.includes('anthology') ||
              albumName.includes('soundtrack') ||
              albumName.includes('tribute') ||
              albumName.includes('various artists') ||
              albumName.includes('hits')) {
            return false;
          }
          
          // Check if it has real music providers
          const hasRealProvider = providers.spotify || providers.apple || 
                                 providers.youtube || providers.deezer || 
                                 providers.tidal || providers.amazonMusic ||
                                 providers.sevenDigital || providers.pandora ||
                                 providers.napster || providers.yandex;
          
          if (!hasRealProvider) return false;
          
          // IMPORTANT: Verify artist name match - STRICT for artist-only search
          const songArtist = (song.artistName || '').toLowerCase().trim();
          const searchArtist = artist.toLowerCase().trim();
          
          let artistMatches = false;
          
          if (requireTrackMatch) {
            // For exact searches, allow fuzzy artist match
            artistMatches = songArtist.includes(searchArtist) || searchArtist.includes(songArtist);
          } else {
            // For artist-only searches, require EXACT match or very close match
            // This prevents "Sleep" from matching "Sleep Baby Sleep" or "Lullaby For Kids, Baby Sleep Music"
            artistMatches = songArtist === searchArtist || 
                           songArtist.split(',')[0].trim() === searchArtist || // Handle "Artist, Other Artist"
                           songArtist.split('&')[0].trim() === searchArtist;   // Handle "Artist & Other Artist"
          }
          
          if (!artistMatches) return false;
          
          // If we require track match, check it
          if (requireTrackMatch) {
            const songTrack = (song.trackName || '').toLowerCase().trim();
            const searchTrack = track.toLowerCase().trim();
            const normalizeString = (str) => str.replace(/[^\w\s]/g, '').trim();
            const normalizedSongTrack = normalizeString(songTrack);
            const normalizedSearchTrack = normalizeString(searchTrack);
            const trackMatches = normalizedSongTrack.includes(normalizedSearchTrack) || 
                                 normalizedSearchTrack.includes(normalizedSongTrack);
            return trackMatches;
          }
          
          return true; // Artist matches, track match not required
        });
      };
      
      if (response.data && response.data.songs && response.data.songs.length > 0) {
        let validSongs = filterSongs(response.data.songs, true);
        
        if (validSongs.length > 0) {
          // Prioritize explicit versions over clean versions
          const explicitSongs = validSongs.filter(s => s.explicit === true);
          const song = explicitSongs.length > 0 ? explicitSongs[0] : validSongs[0];
          
          const providers = Object.keys(song.musicProviders || {}).filter(k => song.musicProviders[k]).join(', ');
          const providerIds = Object.keys(song.musicProvidersIds || {}).filter(k => song.musicProvidersIds[k]).join(', ');
          const explicitTag = song.explicit ? ' [EXPLICIT]' : '';
          
          // Final SoundCloud check (extra safety)
          const allProvidersList = `${providers} ${providerIds}`.toLowerCase();
          if (allProvidersList.includes('soundcloud')) {
            console.log(`⚠️ SoundCloud detected in exact match - rejecting: ${song.artistName} - ${song.trackName}`);
            return null; // Reject and let it try artist-only search
          }
          
          console.log(`✅ Found exact match: ${song.artistName} - ${song.trackName}${explicitTag} (ID: ${song.id || song.songId}, providers: ${providers})`);
          return song;
        }
      }
      
      // STRATEGY 2: If exact match fails, search by artist only and pick ANY available song
      console.log(`🔍 Exact match failed, searching by artist only: ${artist}`);
      response = await axios.get('https://gateway.prod.tt.fm/api/playlist-service/search/v2', {
        params: {
          q: artist,
          limit: 30,
          explicit: true // Prefer explicit versions
        },
        headers: {
          'Authorization': `Bearer ${this.botUserToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      
      if (response.data && response.data.songs && response.data.songs.length > 0) {
        const validSongs = filterSongs(response.data.songs, false);
        
        if (validSongs.length > 0) {
          // Prioritize explicit versions
          const explicitSongs = validSongs.filter(s => s.explicit === true);
          const songsToChooseFrom = explicitSongs.length > 0 ? explicitSongs : validSongs;
          
          // Pick a random song from available tracks
          const randomIndex = Math.floor(Math.random() * Math.min(songsToChooseFrom.length, 10));
          const song = songsToChooseFrom[randomIndex];
          const providers = Object.keys(song.musicProviders || {}).filter(k => song.musicProviders[k]).join(', ');
          const providerIds = Object.keys(song.musicProvidersIds || {}).filter(k => song.musicProvidersIds[k]).join(', ');
          const explicitTag = song.explicit ? ' [EXPLICIT]' : '';
          
          // Final SoundCloud check (extra safety)
          const allProvidersList = `${providers} ${providerIds}`.toLowerCase();
          if (allProvidersList.includes('soundcloud')) {
            console.log(`⚠️ SoundCloud detected in artist search - rejecting: ${song.artistName} - ${song.trackName}`);
            return null; // Reject completely
          }
          
          console.log(`✅ Found artist in catalog: ${song.artistName} - ${song.trackName}${explicitTag} (ID: ${song.id || song.songId}, providers: ${providers})`);
          return song;
        }
      }
      
      console.log(`❌ Artist "${artist}" not found in catalog (may be SoundCloud-only or unavailable)`);
      return null;
      
    } catch (error) {
      console.log(`❌ Hang.fm search error: ${error.message}`);
      return null;
    }
  }

  async downvoteUser(userId) {
    try {
      // Find the user's current song and downvote it
      if (this.state && this.state.djs) {
        const dj = this.state.djs.find(dj => dj.userProfile && dj.userProfile.uuid === userId);
        if (dj && dj.song && dj.song.songId) {
          try {
            // Note: API only supports 'like' and 'star', so we'll use 'like' for upvote
            // For negative users, we'll just log the action instead of downvoting
            console.log(`👎 Would downvote user ${userId}'s song (API limitation - only 'like' and 'star' supported)`);
            console.log(`👎 Downvoted user ${userId}'s song`);
          } catch (error) {
            console.log(`❌ Downvote API error: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.log(`❌ Downvote error: ${error.message}`);
    }
  }

  handleAddedDj(message) {
    this.log('🎧 DJ added');
    
    // Track activity for the DJ who just joined (reset AFK timer)
    const djId = message.djUuid || message.dj?.uuid || message.userId;
    if (djId) {
      this.userLastActivity.set(djId, Date.now());
      console.log(`⏰ AFK timer started for DJ: ${djId}`);
    }
    
    // Immediately check stage management and queue songs if needed
    setTimeout(async () => {
      const isBotOnStage = this.isUserOnStage(this.userId);
      const currentDJCount = this.state?.djs?.length || 0;
      
      console.log(`👤 DJ joined - now ${currentDJCount} DJs on stage, bot on stage: ${isBotOnStage}`);
      
      // DON'T queue immediately - wait for user to play their song first
      // This saves AI tokens by not using AI until we know what they're playing
      
      // Only queue if bot has NO songs at all (emergency backup)
      if (isBotOnStage) {
        const songsRemaining = this.state?.songsRemainingForDj || 0;
        
        // ONLY queue if bot has 0 songs (emergency)
        if (songsRemaining === 0) {
          console.log(`🚨 Emergency: Bot has no songs - queuing ONE backup (curated list)...`);
          await this.selectAndQueueSong('emergency-backup');
        } else {
          console.log(`✅ Bot has ${songsRemaining} song(s) - waiting for user to play before queuing more`);
        }
        
        // When other DJs join, the bot will match their vibe using Spotify genre detection (NO AI)
        if (currentDJCount > 1) {
          console.log(`🔄 User on stage - bot will match vibe using Spotify API (NO AI tokens)`);
          this.aiUsedAfterUserPlay = false;
        }
      }
      
      // Trigger auto-stage management check
      await this.checkAutoStageManagement();
    }, 1000);
  }

  handleRemovedDj(message) {
    this.log('🎧 DJ removed');
    
    // Clear AI usage for the DJ who left (so if they return, we can use AI again)
    const removedDjId = message?.user?.uuid || message?.userId;
    if (removedDjId && removedDjId !== this.userId) {
      this.userAIUsage.delete(removedDjId);
      
      // Clear cached DJ info if this user was the current DJ
      if (removedDjId === this.currentDjId) {
        const removedDjName = this.currentDjName || this.getUsernameById(removedDjId) || 'Unknown';
        console.log(`👋 ${removedDjName} left stage (was cached as current DJ) - clearing cache`);
        this.currentDjId = null;
        this.currentDjName = null;
      }
    }
    
    // Immediately check stage management and queue songs if needed
    setTimeout(async () => {
      const isBotOnStage = this.isUserOnStage(this.userId);
      const currentDJCount = this.state?.djs?.length || 0;
      
      console.log(`👋 DJ left - now ${currentDJCount} DJs on stage, bot on stage: ${isBotOnStage}`);
      
      // If bot is on stage and needs songs, queue them
      if (isBotOnStage) {
        const songsRemaining = this.state?.songsRemainingForDj || 0;
        console.log(`🔍 Bot has ${songsRemaining} songs remaining in queue`);
        
        if (songsRemaining < 2) {
          console.log('🚨 DJ left and bot needs more songs - selecting now!');
          await this.selectAndQueueSong('dj-left');
        }
      }
      
      // Trigger auto-stage management check
      await this.checkAutoStageManagement();
    }, 1000);
  }

  handlePlayedOneTimeAnimation(message) {
    this.log('🎭 One-time animation played');
  }

  handleKickedFromRoom(message) {
    this.log('🚪 Kicked from room');
  }

  handleRoomReset(message) {
    this.log('🔄 Room reset');
  }

  handleSocketChatMessage(message) {
    this.log(`💬 Socket chat message received: ${JSON.stringify(message, null, 2)}`);
    
    // Try to extract text and sender from various possible formats
    let text = null;
    let sender = null;
    let senderName = 'Unknown';
    
    // Check different possible message structures
    if (message.data && message.data.text) {
      text = message.data.text;
      sender = message.data.sender || message.sender;
      senderName = message.data.userName || message.data.senderName || 'Unknown';
    } else if (message.text) {
      text = message.text;
      sender = message.sender;
      senderName = message.userName || message.senderName || 'Unknown User';
    } else if (message.message && message.message.text) {
      text = message.message.text;
      sender = message.message.sender || message.sender;
      senderName = message.message.userName || message.message.senderName || 'Unknown User';
    }
    
    if (text && sender) {
      this.log(`💬 Socket Chat: ${senderName}: ${text}`);
      this.log(`🔍 Checking keywords: ${this.keywordTriggers.join(', ')}`);
      
      // Check for exact keyword triggers (case insensitive)
      const textLower = text.toLowerCase();
      const hasKeyword = this.keywordTriggers.some(keyword => 
        textLower.includes(keyword.toLowerCase())
      );
      
      if (hasKeyword && sender !== this.userId) {
        this.log(`🎯 Keyword detected in socket message from ${senderName}`);
        this.processUserMessage(text, sender, senderName);
      } else if (sender !== this.userId) {
        this.log(`🤐 No keyword detected, ignoring socket message from ${senderName}`);
      }
    } else {
      this.log(`❌ Could not extract text/sender from socket message`);
    }
  }

  async connectCometChat() {
    return new Promise((resolve, reject) => {
      try {
        this.log('🔌 Connecting to CometChat...');
        
        // Try different CometChat WebSocket URLs
        const cometChatUrl = `wss://193427bb5702bab7.websocket-us.cometchat.io/v3.0/`;
        this.log(`🔗 Connecting to CometChat WebSocket: ${cometChatUrl}`);
        this.cometChatWs = new WebSocket(cometChatUrl);
        
        // Set a timeout for connection
        const connectionTimeout = setTimeout(() => {
          reject(new Error('CometChat connection timeout after 10 seconds'));
        }, 10000);
        
        // Add connection debugging
        this.cometChatWs.on('error', (error) => {
          this.log(`❌ CometChat WebSocket error: ${error.message}`);
          console.log(`❌ CometChat WebSocket error: ${error.message}`);
          clearTimeout(connectionTimeout);
          reject(error);
        });
        
        this.cometChatWs.on('open', () => {
          this.log('✅ Connected to CometChat');
          // Send CometChat authentication
          this.cometChatWs.send(JSON.stringify({
            appId: "193427bb5702bab7",
            type: "auth",
            sender: this.userId,
            body: {
              auth: this.cometChatAuth,
              deviceId: `WEB-4_0_10-${this.userId}-${Date.now()}`,
              presenceSubscription: "ALL_USERS"
            }
          }));
          this.log('🔐 CometChat auth sent');
          
          // Wait for auth response
          const authCheck = setInterval(() => {
            if (this.cometChatAuthenticated) {
              clearInterval(authCheck);
              clearTimeout(connectionTimeout);
              this.log('✅ CometChat authenticated successfully');
              resolve();
            }
          }, 100);
        });

      // Try ALL possible ways to receive WebSocket messages
      
      // Method 1: addEventListener
      this.cometChatWs.addEventListener('message', (event) => {
        this.log(`📨 CometChat addEventListener message: ${event.data}`);
        this.handleCometChatMessage(event.data);
      });

      // Method 2: onmessage property
      this.cometChatWs.onmessage = (event) => {
        this.log(`📨 CometChat onmessage property: ${event.data}`);
        this.handleCometChatMessage(event.data);
      };

      // Method 3: EventEmitter style
      if (this.cometChatWs.on) {
        this.cometChatWs.on('message', (data) => {
          this.log(`📨 CometChat on('message'): ${data.toString()}`);
          this.handleCometChatMessage(data.toString());
        });
      }

      // Method 4: Try listening to ALL events to see what we get
      const originalAddEventListener = this.cometChatWs.addEventListener;
      this.cometChatWs.addEventListener = function(type, listener) {
        this.log(`🔍 CometChat addEventListener called with type: ${type}`);
        return originalAddEventListener.call(this, type, listener);
      }.bind(this);

      // Method 5: Override the onmessage setter to see if it's being called
      let originalOnmessage = this.cometChatWs.onmessage;
      Object.defineProperty(this.cometChatWs, 'onmessage', {
        set: function(value) {
          this.log(`🔍 CometChat onmessage being set to: ${typeof value}`);
          originalOnmessage = value;
        }.bind(this),
        get: function() {
          return originalOnmessage;
        }
      });

      // Method 6: Monitor the underlying WebSocket connection directly
      if (this.cometChatWs._socket) {
        this.log('🔍 Found _socket property, monitoring it...');
        this.cometChatWs._socket.on('data', (data) => {
          this.log(`📨 CometChat _socket data: ${data.toString()}`);
        });
        this.cometChatWs._socket.on('message', (data) => {
          this.log(`📨 CometChat _socket message: ${data.toString()}`);
        });
      }

      // Method 7: Try to intercept at the lowest level
      const originalSend = this.cometChatWs.send;
      this.cometChatWs.send = function(data) {
        this.log(`📤 CometChat sending: ${data}`);
        return originalSend.call(this, data);
      }.bind(this);

      // Debug CometChat connection state
      this.cometChatWs.on('open', () => {
        this.log('🔗 CometChat WebSocket opened');
      // CometChat WebSocket connected
      });

      this.cometChatWs.on('close', (code, reason) => {
        this.log(`🔌 CometChat WebSocket closed: ${code} - ${reason}`);
      });

      this.cometChatWs.on('error', (error) => {
        this.log(`❌ CometChat error: ${error.message}`);
      });

      // Log when WebSocket receives ANY data
      const originalOn = this.cometChatWs.on;
      this.cometChatWs.on = function(event, listener) {
        if (event === 'message') {
          return originalOn.call(this, event, (data) => {
            console.log(`🔍 CometChat ${event} event fired with data:`, data.toString());
            listener(data);
          });
        }
        return originalOn.call(this, event, listener);
      };

      // Add comprehensive debugging
      this.cometChatWs.on('ping', (data) => {
        this.log(`🏓 CometChat ping received: ${data}`);
      });

      this.cometChatWs.on('pong', (data) => {
        this.log(`🏓 CometChat pong received: ${data}`);
      });

      // Log all WebSocket events
      const events = ['message', 'data', 'rawData', 'ping', 'pong', 'open', 'close', 'error'];
      events.forEach(eventName => {
        this.cometChatWs.on(eventName, (...args) => {
          this.log(`🔍 CometChat ${eventName} event: ${JSON.stringify(args)}`);
        });
      });

      this.cometChatWs.on('close', (code, reason) => {
        this.log(`❌ CometChat closed: ${code} - ${reason}`);
        this.cometChatAuthenticated = false;
      });

      } catch (error) {
        this.log(`❌ CometChat connection failed: ${error.message}`);
        clearTimeout(connectionTimeout);
        reject(error);
      }
    });
  }

  async handleCometChatMessage(data) {
    try {
      const message = JSON.parse(data);
      
      // Log ALL messages for debugging
      console.log(`📨 CometChat message received: ${JSON.stringify(message).substring(0, 200)}...`);
      
      // Only log text messages (not pings/system messages)
      if (message.type === 'message' && message.body?.type === 'text') {
        const sender = message.body.sender;
        const senderName = message.body.senderName || 'Unknown';
        const text = message.body.data?.text || '';
        if (sender !== this.userId && text) {
          console.log(`🔵 WebSocket: ${senderName} said "${text}"`);
        }
      }
      
      // Check for authentication success - CometChat sends different response formats
      if (message.type === 'auth' || message.type === 'authSuccess' || 
          (message.body && (message.body.code === '200' || message.body.success)) ||
          message.status === 'success' || message.code === '200') {
        this.cometChatAuthenticated = true;
        this.log('✅ CometChat authenticated');
        console.log('✅ CometChat authenticated - bot is now visible in room');
        console.log(`✅ Auth response: ${JSON.stringify(message)}`);
      }
      
      // Handle chat messages - they come with type: "message" and body.type: "text"
      if (message.type === 'message' && message.body) {
        const body = message.body;
        
        // Check for uploaded images (type: 'image' or 'file')
        if ((body.type === 'image' || body.type === 'file') && body.sender && body.sender !== this.userId) {
          const sender = body.sender;
          const senderName = body.senderName || body.sender || 'Unknown';
          const messageId = body.id;
          
          console.log(`🖼️ USER UPLOADED IMAGE/FILE from ${senderName}`);
          console.log(`🗑️ Auto-deleting uploaded image (no user uploads allowed)`);
          
          // Delete the uploaded image immediately
          if (messageId) {
            await this.deleteMessage(messageId);
          }
          
          this.sendChat(`🚫 **Image upload removed** from ${senderName}. Use /tenor to send GIFs instead.`);
          console.log(`💬 END IMAGE MESSAGE (DELETED)\n`);
          return;
        }
        
        // Check if this is a chat message with text data
        if (body.type === 'text' && body.data && body.data.text && body.sender) {
          const text = body.data.text;
          // FIX: Get hang.fm user UUID from customData, NOT CometChat sender
          const sender = body.data?.customData?.userId || body.sender;
          const senderName = body.senderName || body.data?.customData?.userName || body.sender || 'Unknown';
          const messageId = body.id; // Get message ID for deletion

          // ALWAYS log chat messages to PowerShell
          console.log(`\n💬 CHAT MESSAGE DETECTED:`);
          console.log(`👤 User: ${senderName}`);
          console.log(`💬 Message: "${text}"`);
          console.log(`🔍 CometChat ID: ${body.sender}, hang.fm ID: ${sender}`);
          
          // Check for exact keyword triggers (case insensitive)
          const textLower = text.toLowerCase();
          const hasKeyword = this.keywordTriggers.some(keyword =>
            textLower.includes(keyword.toLowerCase())
          );
          
          if (sender !== this.userId && sender !== 'app_system') {
            // FIRST: Check for hateful content in ALL messages (not just keyword messages)
            if (this.contentFilterEnabled) {
              const isHateful = await this.detectHatefulContentQuick(text);
              if (isHateful) {
                console.log(`🚨 HATEFUL CONTENT DETECTED from ${senderName}: ${text}`);
                if (messageId) {
                  await this.deleteMessage(messageId);
                }
                await this.handleInappropriateChatContent(sender, senderName, text);
                console.log(`💬 END CHAT MESSAGE (BLOCKED)\n`);
                return;
              }
            }
            
            // SECOND: Check for links in ALL messages
            const linkResult = await this.checkAndHandleLinks(text, sender, senderName, messageId);
            if (linkResult === 'blocked') {
              console.log(`💬 END CHAT MESSAGE (BLOCKED)\n`);
              return;
            }
            
            // THIRD: Process keyword messages normally
            if (hasKeyword) {
              console.log(`🎯 KEYWORD DETECTED! Bot will respond to: "${text}"`);
              this.log(`🎯 Keyword detected in CometChat message from ${senderName}`);
              this.processUserMessage(text, sender, senderName, messageId);
            } else {
              console.log(`🤐 No keywords found, message passed moderation`);
              this.log(`🤐 No keyword detected, ignoring CometChat message from ${senderName}`);
            }
          } else {
            console.log(`🤖 Ignoring own message or system message`);
          }
          console.log(`💬 END CHAT MESSAGE\n`);
        }
      }
      
      // Handle other message types (legacy support)
      if (message.type === 'message' && message.data && message.data.text) {
        this.handleChatMessage(message);
      } else if (message.action === 'message' && message.data && message.data.text) {
        this.handleChatMessage(message);
      } else if (message.category === 'message' && message.data && message.data.text) {
        this.handleChatMessage(message);
      } else if (message.data && message.data.text && message.sender) {
        this.handleChatMessage(message);
      } else if (message.text && message.sender) {
        // Direct text message format
        this.handleDirectChatMessage(message);
      }
      
    } catch (error) {
      this.log(`❌ Failed to parse CometChat message: ${error.message}`);
      this.log(`📨 Raw data: ${data}`);
    }
  }

  handleChatMessage(message) {
    const text = message.data.text;
    
    // Debug: Log full message structure to find correct sender field
    console.log(`🔍 Message structure:`, {
      sender: message.sender,
      dataSender: message.data?.sender,
      customDataUserId: message.data?.customData?.userId,
      customDataUserName: message.data?.customData?.userName
    });
    
    // FIX: Use hang.fm user UUID from customData, NOT CometChat sender ID
    const sender = message.data?.customData?.userId || message.data?.sender || message.sender;
    const senderName = message.data?.customData?.userName || 'Unknown';
    
    console.log(`🔍 Final sender ID: ${sender}, name: ${senderName}`);
    
    // ALWAYS show user messages (not just in verbose mode)
    if (sender !== this.userId) {
      console.log(`💬 ${senderName}: ${text}`);
    }
    
    if (this.verboseMode) {
      this.log(`🔍 Checking keywords: ${this.keywordTriggers.join(', ')}`);
    }
    
    // Check for exact keyword triggers (case insensitive)
    const textLower = text.toLowerCase();
    const hasKeyword = this.keywordTriggers.some(keyword => 
      textLower.includes(keyword.toLowerCase())
    );
    
    if (hasKeyword && sender !== this.userId) {
      if (this.verboseMode) this.log(`🎯 Keyword detected in message from ${senderName}`);
      this.processUserMessage(text, sender, senderName);
    }
  }

  handleDirectChatMessage(message) {
    const text = message.text;
    
    // Debug: Log full message structure to find correct sender field
    console.log(`🔍 Direct message structure:`, {
      sender: message.sender,
      customDataUserId: message.customData?.userId,
      userName: message.userName
    });
    
    // FIX: Use hang.fm user UUID from customData, NOT CometChat sender ID
    const sender = message.customData?.userId || message.sender;
    const senderName = message.senderName || message.userName || 'Unknown User';
    
    console.log(`🔍 Final sender ID: ${sender}, name: ${senderName}`);
    
    // ALWAYS show user messages (not just in verbose mode)
    if (sender !== this.userId) {
      console.log(`💬 ${senderName}: ${text}`);
    }
    
    if (this.verboseMode) {
      this.log(`🔍 Checking keywords: ${this.keywordTriggers.join(', ')}`);
    }
    
    // Check for exact keyword triggers (case insensitive)
    const textLower = text.toLowerCase();
    const hasKeyword = this.keywordTriggers.some(keyword => 
      textLower.includes(keyword.toLowerCase())
    );
    
    if (hasKeyword && sender !== this.userId) {
      this.log(`🎯 Keyword detected in direct message from ${senderName}`);
      this.processUserMessage(text, sender, senderName);
    } else if (sender !== this.userId) {
      this.log(`🤐 No keyword detected, ignoring direct message from ${senderName}`);
    }
  }

  async checkSpamProtection(userId) {
    const now = Date.now();
    
    // PRIORITY 1: Co-owners and mods ALWAYS bypass spam filter
    const isCoOwner = await this.isUserCoOwner(userId);
    const isMod = await this.isUserModerator(userId);
    if (isCoOwner || isMod) {
      return true; // Unlimited access for staff
    }
    
    // PRIORITY 2: Granted users bypass spam filter (via /.grant command)
    if (this.aiGrantedUsers.has(userId)) {
      return true; // Co-owner granted them unlimited access
    }
    
    // Regular spam filter for normal users
    const isRegular = this.userStats.has(userId);
    const userCooldown = this.userCooldowns.get(userId);
    
    if (!userCooldown) {
      // First message from this user
      this.userCooldowns.set(userId, { count: 1, lastReset: now, flaggedForSpam: false });
      return true;
    }
    
    // Check if cooldown period has expired
    if (now - userCooldown.lastReset > this.cooldownPeriod) {
      // Reset counter but keep spam flag if they were flagged
      userCooldown.count = 1;
      userCooldown.lastReset = now;
      return true;
    }
    
    // For regulars: Only block if they're actually spamming (more than 5 rapid messages)
    // For new users: Block at 3 messages
    const spamThreshold = isRegular ? 5 : 3;
    
    // Check if user has exceeded limit
    if (userCooldown.count >= spamThreshold) {
      if (!userCooldown.flaggedForSpam) {
        console.log(`🚨 User flagged for spam: ${userId} (${userCooldown.count} messages in ${this.cooldownPeriod/1000}s)`);
        userCooldown.flaggedForSpam = true;
      }
      return false; // Blocked
    }
    
    // Increment counter
    userCooldown.count++;
    return true;
  }

  async checkAiKeywordSpam(userId, message) {
    const now = Date.now();
    const messageLower = message.toLowerCase();
    
    // Check if message contains AI keywords
    const hasAiKeyword = this.keywordTriggers.some(keyword => 
      messageLower.includes(keyword.toLowerCase())
    );
    
    if (!hasAiKeyword) {
      return true; // Not an AI keyword message, allow it
    }
    
    // Check if user has been granted unlimited AI access
    if (this.aiGrantedUsers.has(userId)) {
      return true; // Granted users bypass spam checks
    }
    
    // Co-owners and moderators have unlimited AI access
    const isCoOwner = await this.isUserCoOwner(userId);
    const isMod = await this.isUserModerator(userId);
    
    if (isCoOwner || isMod) {
      console.log(`👑 Unlimited AI access for staff: ${isCoOwner ? 'co-owner' : 'moderator'}`);
      return true; // Staff bypass spam checks
    }
    
    const userSpam = this.aiSpamUsers.get(userId);
    
    if (!userSpam) {
      // First AI keyword use from this user
      this.aiSpamUsers.set(userId, { count: 1, lastReset: now, ignored: false });
      return true;
    }
    
    // Check if user is currently being ignored
    if (userSpam.ignored && now - userSpam.lastReset < this.aiSpamPeriod) {
      console.log(`🤐 Ignoring AI spam user ${userId} - still in cooldown`);
      return false; // Still ignoring
    }
    
    // Check if cooldown period has expired
    if (now - userSpam.lastReset > this.aiSpamPeriod) {
      // Reset counter and stop ignoring
      userSpam.count = 1;
      userSpam.lastReset = now;
      userSpam.ignored = false;
      return true;
    }
    
    // Increment AI keyword count
    userSpam.count++;
    
    // Check if user has exceeded AI keyword limit
    if (userSpam.count > this.aiSpamLimit) {
      userSpam.ignored = true;
      userSpam.lastReset = now; // Reset timer for ignore period
      console.log(`🤐 User ${userId} is now being ignored for AI keyword spam (${userSpam.count} uses)`);
      return false; // Start ignoring
    }
    
    return true; // Allow the message
  }

  async processUserMessage(text, senderId, senderName, messageId = null) {
    try {
      // ALWAYS show user messages that triggered the bot
      console.log(`\n💬 ${senderName}: ${text}`);
      
      // Check for links in the message
      const linkResult = await this.checkAndHandleLinks(text, senderId, senderName, messageId);
      if (linkResult === 'blocked') {
        return; // Malicious link blocked, stop processing
      } else if (linkResult === 'handled') {
        return; // GIF/image reposted, stop processing
      }
      
      // Track user activity for AFK detection
      this.userLastActivity.set(senderId, Date.now());
      
      // Clear any AFK warning for this user (they're chatting)
      if (this.afkWarnings.has(senderId)) {
        console.log(`✅ ${senderName} chatted - AFK warning cleared`);
        this.afkWarnings.delete(senderId);
      }
      
      // Check for commands FIRST (before spam/content checks)
      if (text.startsWith('/') || text.startsWith('.')) {
        console.log(`🎯 Command detected: ${text}`);
        await this.handleCommand(text, senderId, senderName);
        return;
      }
      
      // For non-commands, check hateful content
      if (this.contentFilterEnabled) {
        const isHateful = await this.detectHatefulContentInChat(text);
        if (isHateful) {
          console.log(`🚨 HATEFUL CHAT DETECTED from ${senderName}: ${text}`);
          await this.handleInappropriateChatContent(senderId, senderName, text);
          return; // Stop processing this message
        }
      }
      
      // Check AI keyword spam protection (for keyword-triggered messages)
      if (!(await this.checkAiKeywordSpam(senderId, text))) {
        console.log(`🤐 Ignoring AI keyword spam from ${senderName}\n`);
        return; // Silent ignore - no response
      }
      
      // Check spam protection for non-command messages
      if (!(await this.checkSpamProtection(senderId))) {
        console.log(`🚫 Spam protection triggered for ${senderName}\n`);
        return;
      }
      
      
      // Check if AI is enabled
      if (!this.aiEnabled) {
        console.log(`❌ AI is disabled - cannot respond to keyword: "${text}"`);
        this.sendChat(`❌ AI chat is currently OFF. Ask a co-owner to use \`/.ai huggingface\` to enable it.`);
        return;
      }
      
      // Check if AI chat responses are enabled
      if (!this.aiChatEnabled) {
        console.log(`❌ AI chat is disabled - ignoring keyword`);
        return; // Silently ignore
      }
      
      // Check for stop phrases (user wants bot to be quiet)
      const stopPhrases = ['ok we get it', 'we get it', 'stop', 'shut up', 'be quiet', 'enough'];
      const wantsBotToStop = stopPhrases.some(phrase => text.toLowerCase().includes(phrase));
      
      if (wantsBotToStop) {
        console.log(`🤐 User wants bot to stop - not responding`);
        return;
      }
      
      // Check for genre requests FIRST (before AI chat)
      const genreRequest = this.detectGenreRequest(text, senderId, senderName);
      if (genreRequest) {
        // Genre request detected - bot will hop up and queue a song
        return; // Stop processing - handled by detectGenreRequest
      }
      
      // Check if user just said "bot" with no context - respond without using AI tokens
      const messageWithoutKeyword = text.toLowerCase().replace(/\b(bot|b0t|bot2|b0t2|@bot2)\b/g, '').trim();
      const isJustGreeting = !messageWithoutKeyword || messageWithoutKeyword.length < 3;
      
      // Check if user is talking ABOUT bot making/development (engage with development talk)
      const talkingAboutBotMaking = text.toLowerCase().includes('on a comp') ||
                                     text.toLowerCase().includes('bot making') ||
                                     text.toLowerCase().includes('building a bot') ||
                                     text.toLowerCase().includes('coding') ||
                                     text.toLowerCase().includes('programming');
      
      // Check if user is talking ABOUT this specific bot (ignore these)
      const talkingAboutThisBot = text.toLowerCase().includes('my project has') || 
                                  text.toLowerCase().includes('the bot should') ||
                                  text.toLowerCase().includes('the bot is') ||
                                  text.toLowerCase().includes('the bot keeps') ||
                                  text.toLowerCase().includes('for the record') ||
                                  text.toLowerCase().includes('bots for') ||
                                  text.toLowerCase().includes('stick with the vibe bot') ||
                                  text.toLowerCase().includes('has 2 bots') ||
                                  text.toLowerCase().includes('note to you if') ||
                                  text.toLowerCase().includes('if you do end up') ||
                                  text.toLowerCase().includes('save you so much time') ||
                                  text.toLowerCase().includes('never try to get a cometchat');
      
      // If talking about bot making, DON'T ignore (engage with the convo)
      if (!talkingAboutBotMaking && talkingAboutThisBot) {
        // User is talking ABOUT this specific bot to someone else, not asking anything
        console.log(`🤐 User talking about bot, not to bot - ignoring`);
        return;
      }
      
      if (isJustGreeting) {
        // Random casual responses without using AI
        const casualResponses = ['yeah?', 'what\'s up', 'sup', 'yo', 'what'];
        const response = casualResponses[Math.floor(Math.random() * casualResponses.length)];
        console.log(`💬 Simple greeting - responding without AI: "${response}"`);
        this.sendChat(response);
        return;
      }
      
      // Update conversation memory
      if (this.enableConversationMemory) {
        this.updateConversationMemory(senderId, text);
      }
      
      // Generate AI response
      const response = await this.generateAIResponse(text, senderId, senderName);
      
      if (response) {
        console.log(`🤖 Bot Response: "${response}"`);
        this.sendChat(response);
      } else {
        console.log(`❌ AI failed to generate response`);
        this.sendChat(`❌ AI Error: Unable to generate response. OpenAI may be disabled or rate limited.`);
      }
      
      
    } catch (error) {
      this.log(`❌ Error processing message: ${error.message}`);
    }
  }

  async handleCommand(text, senderId, senderName) {
    const command = text.toLowerCase().trim();
    const commandName = command.split(' ')[0]; // Get first word for commands with arguments
    
    console.log(`📥 Processing command: ${commandName} from ${senderName}`);
    
    switch (commandName) {
      case '/uptime':
        const uptimeString = this.getUptimeString();
        this.sendChat(uptimeString);
        // Save uptime stats
        this.saveUptimeData();
        console.log(`⏱️ Uptime stats displayed and saved`);
        break;
             case '/provider':
             case '/aiinfo':
               this.handleAiProviderInfoCommand(senderId, senderName);
               break;
      case '/help':
      case '/commands':
        await this.handleCommandsListCommand(senderId, senderName);
        break;
      case '/gitlink':
      case '/github':
      case '/repo':
        await this.handleGitLinkCommand(senderId, senderName);
        break;
      case '/ty':
      case '/thanks':
      case '/credits':
        await this.handleThanksCommand(senderId, senderName);
        break;
      case '/.adminhelp':
      case '/adminhelp':
        await this.handleAdminHelpCommand(senderId, senderName);
        break;
      case '/check':
        await this.handleCheckRacistCommand(text, senderId, senderName);
        break;
      case '/aispam':
        await this.handleAiSpamUsersCommand(senderId, senderName);
        break;
      case '/.grant':
        await this.handleGrantCommand(text, senderId, senderName);
        break;
      case '/spoil':
      case '.spoil':
        await this.handleSpoilCommand(senderId, senderName);
        break;
      case '/queue':
        await this.handleQueueCommand(text, senderId, senderName);
        break;
      case '/aiplaylist':
        await this.handleAiPlaylistCommand(senderId, senderName);
        break;
      case '/hopup':
        await this.handleHopUpCommand(senderId, senderName);
        break;
      case '/hopdown':
        await this.handleHopDownCommand(senderId, senderName);
        break;
      case '/nosedive':
        await this.handleNosediveCommand(text, senderId, senderName);
        break;
      case '/stagedive':
        await this.handleStagediveCommand(text, senderId, senderName);
        break;
      case '/stats':
        await this.handleStatsCommand(text, senderId, senderName);
        break;
      case '/songstats':
        await this.handleSongStatsCommand(text, senderId, senderName);
        break;
      case '/album':
      case '/albumart':
      case '/cover':
        await this.handleAlbumArtCommand(senderId, senderName);
        break;
      case '/testgif':
        await this.handleTestGifCommand(senderId, senderName);
        break;
      case '/tenor':
        await this.handleTenorCommand(text, senderId, senderName);
        break;
      case '/w':
      case '/weather':
        await this.handleWeatherCommand(text, senderId, senderName);
        break;
      case '/testqueue':
        await this.handleTestQueueCommand(senderId, senderName);
        break;
      case '/glue':
        await this.handleGlueCommand(senderId, senderName);
        break;
      case '/.decor':
        await this.handleDecorCommand(text, senderId, senderName);
        break;
      case '/p':
      case '/poker':
        await this.handlePokerCommand(text, senderId, senderName);
        break;
      case '/bet':
        await this.handleBetCommand(text, senderId, senderName);
        break;
      case '.ai':
        await this.handleAiToggleCommand(senderId, senderName);
        break;
      case '/aichat':
      case '.aichat':
        await this.handleAiChatToggleCommand(senderId, senderName);
        break;
        default:
          // Check for .ai provider switch command (with or without slash)
          if (command.startsWith('.ai ') || command.startsWith('/.ai ')) {
            await this.handleAiProviderSwitchCommand(command, senderId, senderName);
          } else if (command.startsWith('/tenor ')) {
            // Handle /tenor with arguments
            await this.handleTenorCommand(text, senderId, senderName);
          } else {
            this.sendChat(`Unknown command: ${text}. Type /help for available commands.`);
          }
          break;
    }
  }

  async handleCommandsListCommand(senderId, senderName) {
    // Check if user is mod or co-owner for admin command notice
    const isCoOwner = await this.isUserCoOwner(senderId);
    const isMod = await this.isUserModerator(senderId);
    
    // Add holiday decorations
    const emoji1 = this.getRandomHolidayEmoji();
    const emoji2 = this.getRandomHolidayEmoji();
    
    let commands = `${emoji1} **Public Commands** ${emoji2}

**Info & Stats**
/stats - Your stats
/stats <username> - Check another user's stats
/songstats - Song stats
/provider - AI info

**Weather & Media**
/w <location> - Matt's Weather Report
   Examples: /w 14207, /w buffalo, /w london uk
/album - Album art
/tenor [term] - Send GIF

**Bot Info**
/gitlink - View bot source code on GitHub
/ty - Credits and thank you

**Stage Control**
/nosedive - Exit after song
/nosedive [#] - Exit after # songs
/stagedive - Exit now

**AI Chat**
Ask bot questions: "bot what song is this?"
Commands work better than just saying "bot"`;

    // Add admin notice for mods/co-owners
    if (isMod || isCoOwner) {
      commands += `\n\n🛡️ **Admin Access Detected**
Use /.adminhelp for ${isCoOwner ? 'co-owner' : 'moderator'} commands`;
    }

    this.sendChat(commands);
  }

  async handleGitLinkCommand(senderId, senderName) {
    const emoji = this.getRandomHolidayEmoji();
    const message = `${emoji} **Bot Source Code**

📦 GitHub: https://github.com/randomSPPOCguy/HangDeepcutFMBotAlpha1.4.20.69
⚖️ License: Non-Commercial Open Source
✅ Free to use, modify, and share - just don't monetize it!

🎵 This is the Hang.fm bot - also includes Deepcut.live bot in the repo`;
    
    this.sendChat(message);
  }

  async handleThanksCommand(senderId, senderName) {
    const emoji = this.getRandomHolidayEmoji();
    const message = `${emoji} Thank you to Jodrell, noiz, Kai the Husky, butter, and the music sharing community for inspiring me to build this project`;
    
    this.sendChat(message);
  }

  async handleAdminHelpCommand(senderId, senderName) {
    // Check if user is a co-owner or mod
    const isCoOwner = await this.isUserCoOwner(senderId);
    const isMod = await this.isUserModerator(senderId);
    
    if (!isCoOwner && !isMod) {
      this.sendChat(`❌ Admin commands are only available to moderators and co-owners.`);
      return;
    }

    let adminCommands = '';
    
    // Add holiday decorations
    const emoji1 = this.getRandomHolidayEmoji();
    const emoji2 = this.getRandomHolidayEmoji();
    
    // Show co-owner commands if user is co-owner
    if (isCoOwner) {
      adminCommands += `👑 **CO-OWNER COMMANDS** ${emoji1}

**AI Control (Co-owner only)**
/.ai [provider] - Switch AI provider
   Providers: openai, gemini, huggingface, auto, off
/.grant <user> - Grant unlimited AI access
/aichat - Toggle AI chat responses
.ai - Toggle AI on/off

`;
    }
    
    // Show mod commands (available to both mods and co-owners)
    if (isMod || isCoOwner) {
      adminCommands += `🛡️ **MODERATOR COMMANDS** ${emoji2}

**Moderation**
/check [msg] - Check for hateful content
/aispam - Show AI spam users

**Bot Control**
/hopup - Force bot to stage
/hopdown - Remove bot from stage
/glue - Toggle bot auto-hop (glue to floor)
/spoil - Reveal next song in queue
/.decor [holiday] - Change holiday theme
   Holidays: halloween, christmas, valentines, easter, july4th, none

`;
    }
    
    // Add footer with decorations
    const emoji3 = this.getRandomHolidayEmoji();
    adminCommands += `📋 **Your Permissions:** ${isCoOwner ? 'Co-owner' : 'Moderator'}
${this.holidayEmojis.icon} **Current Holiday:** ${this.holidayEmojis.name} ${emoji3}`;

    this.sendChat(adminCommands);
  }

  async handleAiToggleCommand(senderId, senderName) {
    // Check if user is a co-owner
    if (!await this.isUserCoOwner(senderId)) {
      this.sendChat(`❌ Access denied. Only co-owners can use this command.`);
      return;
    }
    
    // Toggle AI
    this.aiEnabled = !this.aiEnabled;
    const status = this.aiEnabled ? '🟢 ENABLED' : '🔴 DISABLED';
    this.sendChat(`🤖 AI responses are now ${status} by ${senderName}`);
  }

  async handleAiChatToggleCommand(senderId, senderName) {
    // Check if user is a co-owner
    if (!await this.isUserCoOwner(senderId)) {
      this.sendChat(`❌ Access denied. Only co-owners can use this command.`);
      return;
    }
    
    // Toggle AI chat
    this.aiChatEnabled = !this.aiChatEnabled;
    const status = this.aiChatEnabled ? '🟢 ENABLED' : '🔴 DISABLED';
    this.sendChat(`💬 AI chat responses are now ${status} by ${senderName}\n(AI song selection remains active)`);
  }

  async handleGrantCommand(text, senderId, senderName) {
    // Check if user is a co-owner
    if (!await this.isUserCoOwner(senderId)) {
      this.sendChat(`❌ Access denied. Only co-owners can use this command.`);
      return;
    }

    // Parse username from command
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) {
      this.sendChat(`❌ Usage: /.grant <username>`);
      return;
    }

    const targetUsername = parts.slice(1).join(' '); // Join in case username has spaces

    // Find user by username
    let targetUserId = null;
    let targetUserName = null;

    // Search in allUserData
    if (this.state?.allUserData) {
      for (const [userId, userData] of Object.entries(this.state.allUserData)) {
        const username = userData.userProfile?.nickname || 
                        userData.userProfile?.firstName || 
                        userData.userProfile?.username ||
                        userData.nickname ||
                        userData.firstName ||
                        userData.username;
        
        if (username && username.toLowerCase() === targetUsername.toLowerCase()) {
          targetUserId = userId;
          targetUserName = username;
          break;
        }
      }
    }

    if (!targetUserId) {
      this.sendChat(`❌ User "${targetUsername}" not found in the room.`);
      return;
    }

    // Toggle grant status
    if (this.aiGrantedUsers.has(targetUserId)) {
      this.aiGrantedUsers.delete(targetUserId);
      this.sendChat(`🚫 Removed unlimited AI access from **${targetUserName}**`);
      console.log(`🚫 ${senderName} removed AI grant from ${targetUserName} (${targetUserId})`);
    } else {
      this.aiGrantedUsers.add(targetUserId);
      this.sendChat(`✅ Granted unlimited AI access to **${targetUserName}**`);
      console.log(`✅ ${senderName} granted unlimited AI to ${targetUserName} (${targetUserId})`);
    }
  }

  async handleRacistUsersCommand(senderId, senderName) {
    // Check if user is a co-owner
    if (!await this.isUserCoOwner(senderId)) {
      this.sendChat(`❌ Access denied. Only co-owners can use this command.`);
      return;
    }
    
    if (this.racistUsers.size === 0) {
      this.sendChat('🚨 **Racist Users:** No racist users detected.');
      return;
    }
    
    const racistUserList = Array.from(this.racistUsers).join('\n');
    this.sendChat(`🚨 **Racist Users Detected (${this.racistUsers.size}):**\n${racistUserList}\n\n**Consider banning these users.**`);
    
    // Also log to console for easy copy/paste
    console.log(`🚨 RACIST USERS LIST (for banning):`);
    console.log(`🚨 ${Array.from(this.racistUsers).join(', ')}`);
  }

  async handleCheckRacistCommand(text, senderId, senderName) {
    // Check if user is a co-owner OR moderator
    const isCoOwner = await this.isUserCoOwner(senderId);
    const isMod = await this.isUserModerator(senderId);
    
    if (!isCoOwner && !isMod) {
      this.sendChat(`❌ Access denied. Only moderators and co-owners can use this command.`);
      return;
    }
    
    // Extract message to check (everything after /check)
    const messageToCheck = text.replace('/check', '').trim();
    if (!messageToCheck) {
      this.sendChat('❌ Usage: `/check [message]` - Check if a message contains racist content in any language.');
      return;
    }
    
    const isRacist = await this.detectRacistContentAI(messageToCheck);
    if (isRacist) {
      this.sendChat(`🚨 **RACIST CONTENT DETECTED:** "${messageToCheck}"\n\n**This message contains racist/hateful content and should result in a ban.**`);
    } else {
      this.sendChat(`✅ **CLEAN CONTENT:** "${messageToCheck}"\n\n**This message appears to be clean.**`);
    }
  }

  async handleAiSpamUsersCommand(senderId, senderName) {
    // Check if user is a co-owner OR moderator
    const isCoOwner = await this.isUserCoOwner(senderId);
    const isMod = await this.isUserModerator(senderId);
    
    if (!isCoOwner && !isMod) {
      this.sendChat(`❌ Access denied. Only moderators and co-owners can use this command.`);
      return;
    }
    
    let message = '';
    
    // Show granted users
    if (this.aiGrantedUsers.size > 0) {
      message += `✅ **Unlimited AI Access (${this.aiGrantedUsers.size}):**\n`;
      this.aiGrantedUsers.forEach(userId => {
        const username = this.getUsernameById(userId);
        message += `${username}\n`;
      });
      message += '\n';
    }
    
    // Show spam users
    if (this.aiSpamUsers.size === 0) {
      message += '🤐 **AI Keyword Spam:** No spam detected.';
    } else {
      let spamList = '';
      this.aiSpamUsers.forEach((spamData, userId) => {
        const username = this.getUsernameById(userId);
        const status = spamData.ignored ? '🔇 IGNORED' : `📊 ${spamData.count} uses`;
        spamList += `${username}: ${status}\n`;
      });
      message += `🤐 **AI Spam Users (${this.aiSpamUsers.size}):**\n${spamList}**Users with 🔇 are ignored.**`;
    }
    
    this.sendChat(message);
    
    // Also log to console
    console.log(`🤐 AI SPAM USERS LIST:`);
    this.aiSpamUsers.forEach((spamData, userId) => {
      const username = this.getUsernameById(userId);
      const status = spamData.ignored ? 'IGNORED' : `${spamData.count} uses`;
      console.log(`🤐 ${username}: ${status}`);
    });
  }

  async handleSpoilCommand(senderId, senderName) {
    // Check if user is a co-owner OR moderator
    const isCoOwner = await this.isUserCoOwner(senderId);
    const isMod = await this.isUserModerator(senderId);
    
    if (!isCoOwner && !isMod) {
      this.sendChat(`❌ Access denied. Only moderators and co-owners can use this command.`);
      return;
    }

    try {
      // Show the bot's next song
      if (this.botNextSong) {
        this.sendChat(`🎵 **SPOILER:** ${this.botNextSong.artist} - ${this.botNextSong.title}\n**Spoiled by:** ${senderName}`);
        console.log(`🎵 Bot's next song spoiled by ${senderName} (${senderId}): ${this.botNextSong.artist} - ${this.botNextSong.title}`);
      } else {
        this.sendChat(`❌ **No Song Selected:** Bot hasn't selected a song yet.`);
      }
      
    } catch (error) {
      console.log(`❌ Spoil command error: ${error.message}`);
      this.sendChat(`❌ **Spoil Error:** Failed to get bot's next song.`);
    }
  }

  async handleQueueCommand(text, senderId, senderName) {
    // Extract song request from command
    const songRequest = text.replace('/queue', '').trim();
    if (!songRequest) {
      this.sendChat('❌ Please specify a song to add to queue. Example: `/queue bohemian rhapsody`');
      return;
    }

    try {
      console.log(`🎵 **AI Queue Request:** Adding "${songRequest}" to queue by ${senderName}...`);
      
      // Use AI to find and add the song
      const success = await this.addSongToQueueAI(songRequest, senderName);
      if (success) {
        console.log(`✅ **Queue Success:** "${songRequest}" has been added to the queue!`);
      } else {
        console.log(`❌ **Queue Failed:** Could not find or add "${songRequest}" to queue.`);
      }
    } catch (error) {
      console.log(`❌ Queue command error: ${error.message}`);
    }
  }

  async handleAiPlaylistCommand(senderId, senderName) {
    try {
      console.log(`🎵 **AI Playlist Generator:** Analyzing DJs in room and generating playlist...`);
      
      // Analyze DJs and generate playlist
      const playlist = await this.generateAiPlaylist();
      if (playlist && playlist.length > 0) {
        console.log(`🎵 **AI Playlist Generated:**\n${playlist.join('\n')}\n\n**Adding songs to queue...**`);
        
        // Add each song to queue
        let successCount = 0;
        for (const song of playlist) {
          const success = await this.addSongToQueueAI(song, 'AI Playlist Generator');
          if (success) successCount++;
          // Small delay between additions
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`✅ **Playlist Complete:** ${successCount}/${playlist.length} songs added to queue!`);
      } else {
        console.log(`❌ **Playlist Failed:** Could not generate AI playlist.`);
      }
    } catch (error) {
      console.log(`❌ AI Playlist command error: ${error.message}`);
    }
  }

  async handleHopUpCommand(senderId, senderName) {
    try {
      // Check if user is a co-owner or moderator
      if (!await this.isUserCoOwner(senderId) && !await this.isUserModerator(senderId)) {
        this.sendChat(`❌ Access denied. Only moderators and co-owners can use /hopup.`);
        return;
      }
      
      this.sendChat(`🎧 **Stage Request:** ${senderName} is hopping up to DJ stage...`);
      
      const success = await this.hopUpToStage();
      if (success) {
        this.sendChat(`✅ **Stage Success:** ${senderName} is now on the DJ stage!`);
      } else {
        this.sendChat(`❌ **Stage Failed:** Could not hop up to DJ stage.`);
      }
    } catch (error) {
      console.log(`❌ Hop up error: ${error.message}`);
      this.sendChat(`❌ **Stage Error:** Failed to hop up to stage.`);
    }
  }

  async handleHopDownCommand(senderId, senderName) {
    try {
      // Check if user is a co-owner or moderator
      if (!await this.isUserCoOwner(senderId) && !await this.isUserModerator(senderId)) {
        this.sendChat(`❌ Access denied. Only moderators and co-owners can use /hopdown.`);
        return;
      }
      
      this.sendChat(`🎧 **Stage Request:** ${senderName} is hopping down from DJ stage...`);
      
      const success = await this.hopDownFromStage();
      if (success) {
        this.sendChat(`✅ **Stage Success:** ${senderName} has left the DJ stage!`);
      } else {
        this.sendChat(`❌ **Stage Failed:** Could not hop down from DJ stage.`);
      }
    } catch (error) {
      console.log(`❌ Hop down error: ${error.message}`);
      this.sendChat(`❌ **Stage Error:** Failed to hop down from stage.`);
    }
  }

  async handleNosediveCommand(text, senderId, senderName) {
    // Check if the user who typed the command is on stage
    if (!this.isUserOnStage(senderId)) {
      this.sendChat(`❌ You must be on stage to use /nosedive.`);
      return;
    }

    try {
      // Parse the amount of songs (if provided)
      const parts = text.trim().split(/\s+/);
      let songCount = 1; // Default: remove after current song
      
      if (parts.length > 1) {
        const parsedCount = parseInt(parts[1]);
        if (isNaN(parsedCount) || parsedCount < 1) {
          this.sendChat(`❌ Invalid song count. Use: /nosedive or /nosedive <number>`);
          return;
        }
        songCount = parsedCount;
      }
      
      // Check if the user's song is currently playing
      const currentDjUuid = this.state?.nowPlaying?.djUuid;
      const isPlayingNow = currentDjUuid === senderId;
      
      // If their song is playing NOW, set songsRemaining to 0 so it triggers on next playedSong event
      // If not, use the full count
      const adjustedCount = isPlayingNow ? 0 : songCount;
      
      // Arm the nosedive command on the user who typed it
      this.nosediveArmed.set(senderId, {
        armedBy: senderId,
        armedByName: senderName,
        timestamp: Date.now(),
        songsRemaining: adjustedCount,
        totalSongs: songCount
      });

      if (isPlayingNow) {
        this.sendChat(`💣 Armed - You'll be removed when YOUR current song finishes.`);
        console.log(`💣 ${senderName} armed nosedive DURING their song - will remove at song end [ID: ${senderId}]`);
      } else if (songCount === 1) {
        this.sendChat(`💣 Armed - You'll be removed after YOUR next song finishes.`);
        console.log(`💣 ${senderName} armed nosedive - ${songCount} song(s) [ID: ${senderId}]`);
      } else {
        this.sendChat(`💣 Armed - You'll be removed after YOU play ${songCount} songs.`);
        console.log(`💣 ${senderName} armed nosedive - ${songCount} song(s) [ID: ${senderId}]`);
      }

    } catch (error) {
      console.log(`❌ Nosedive failed: ${error.message}`);
      this.sendChat(`❌ Failed to arm nosedive.`);
    }
  }

  async handleStagediveCommand(text, senderId, senderName) {
    // CRITICAL DEBUG: Log what we're removing
    console.log(`\n🚨 STAGEDIVE DEBUG:`);
    console.log(`   Command from: ${senderName}`);
    console.log(`   Sender ID: ${senderId}`);
    console.log(`   Bot ID: ${this.userId}`);
    console.log(`   IDs match: ${senderId === this.userId}`);
    console.log(`   Is sender on stage: ${this.isUserOnStage(senderId)}`);
    
    // Check if the user who typed the command is on stage
    if (!this.isUserOnStage(senderId)) {
      this.sendChat(`❌ You must be on stage to use /stagedive.`);
      return;
    }

    try {
      // Execute stagedive immediately - remove user from stage RIGHT NOW
      console.log(`💥 Removing ${senderName} (${senderId}) from stage NOW\n`);
      this.sendChat(`💥 ${senderName} removed from stage.`);
      
      // Remove directly (use 'djUuid' parameter as per ttfm-socket API)
      await this.socket.action('removeDj', { djUuid: senderId });

    } catch (error) {
      console.log(`❌ Stagedive failed: ${error.message}`);
      this.sendChat(`❌ Failed to stagedive.`);
    }
  }

  async handleAiProviderSwitchCommand(command, senderId, senderName) {
    // Check if user is a co-owner
    if (!await this.isUserCoOwner(senderId)) {
      this.sendChat(`❌ Access denied. Only co-owners can use this command.`);
      return;
    }
    
    const provider = command.split(' ')[1]?.toLowerCase();
    
    switch (provider) {
      case 'openai':
        if (this.openaiApiKey && this.openaiApiKey !== 'sk-proj-your_openai_key_here') {
          this.currentProvider = 'openai';
          this.aiEnabled = true;
          this.sendChat(`🤖 AI provider switched to **OpenAI** by ${senderName}`);
        } else {
          this.sendChat(`❌ OpenAI is not configured or key is invalid.`);
        }
        break;
        
      case 'gemini':
        if (this.geminiApiKey && this.geminiApiKey !== 'your_gemini_key_here') {
          this.currentProvider = 'gemini';
          this.aiEnabled = true;
          this.sendChat(`🤖 AI provider switched to **Google Gemini** by ${senderName}`);
        } else {
          this.sendChat(`❌ Google Gemini is not configured or key is invalid.`);
        }
        break;
        
      case 'huggingface':
        if (this.huggingfaceApiKey && this.huggingfaceApiKey !== 'your_huggingface_key_here') {
          this.currentProvider = 'huggingface';
          this.aiEnabled = true;
          this.sendChat(`🤖 AI provider switched to **HuggingFace** by ${senderName}`);
        } else {
          this.sendChat(`❌ HuggingFace is not configured or key is invalid.`);
        }
        break;
        
      case 'auto':
        this.currentProvider = 'auto';
        this.aiEnabled = true;
        this.sendChat(`🤖 AI provider switched to **Auto** (OpenAI → Gemini → HuggingFace) by ${senderName}`);
        break;
        
      case 'off':
        this.currentProvider = 'off';
        this.aiEnabled = false;
        this.sendChat(`🤖 AI responses **DISABLED** by ${senderName}`);
        break;
        
      default:
        this.sendChat(`❌ Invalid provider. Use: /.ai [openai/gemini/huggingface/auto/off]`);
        break;
    }
  }

  handleAiProviderInfoCommand(senderId, senderName) {
    let info = `🤖 **AI Provider Status:**\n\n`;
    
    // Check OpenAI
    const openaiStatus = this.openaiApiKey && this.openaiApiKey !== 'sk-proj-your_openai_key_here' ? '✅ Available' : '❌ Not configured';
    info += `**OpenAI**: ${openaiStatus}`;
    if (this.currentProvider === 'openai') info += ` (🔴 ACTIVE)`;
    info += `\n`;
    if (this.openaiApiKey && this.openaiApiKey !== 'sk-proj-your_openai_key_here') {
      info += `   Model: ${this.openaiModel || 'gpt-4o-mini'}\n`;
    }
    
    // Check Gemini
    const geminiStatus = this.geminiApiKey && this.geminiApiKey !== 'your_gemini_key_here' ? '✅ Available' : '❌ Not configured';
    info += `**Google Gemini**: ${geminiStatus}`;
    if (this.currentProvider === 'gemini') info += ` (🔴 ACTIVE)`;
    info += `\n`;
    if (this.geminiApiKey && this.geminiApiKey !== 'your_gemini_key_here') {
      info += `   Model: ${this.geminiModel || 'gemini-1.5-flash'}\n`;
    }
    
    // Check HuggingFace
    const hfStatus = this.huggingfaceApiKey && this.huggingfaceApiKey !== 'your_huggingface_key_here' ? '✅ Available' : '❌ Not configured';
    info += `**HuggingFace**: ${hfStatus}`;
    if (this.currentProvider === 'huggingface') info += ` (🔴 ACTIVE)`;
    info += `\n`;
    if (this.huggingfaceApiKey && this.huggingfaceApiKey !== 'your_huggingface_key_here') {
      info += `   Model: ${this.huggingfaceModel || 'microsoft/DialoGPT-medium'}\n`;
    }
    
    info += `\n**Current Mode**: ${this.currentProvider.toUpperCase()}`;
    if (this.currentProvider === 'auto') info += ` (OpenAI → Gemini → HuggingFace)`;
    info += `\n**AI Status**: ${this.aiEnabled ? '🟢 ENABLED' : '🔴 DISABLED'}`;
    
    this.sendChat(info);
  }

  async fetchRoomModerators() {
    try {
      // Use hardcoded slug for now (API endpoint returns HTML instead of JSON)
      // TODO: Find the correct API endpoint to fetch room slug dynamically
      const roomSlug = 'alternative-hiphoprockmetal-2316'; // Your room slug
      
      // Try to fetch moderators from API (currently returns HTML, so this won't work)
      // Keeping the code for future use when the API is fixed
      try {
        const response = await axios.get(`https://hang.fm/api/room-service/roomUserRoles/${roomSlug}`, {
          headers: {
            'Authorization': `Bearer ${this.botUserToken}`,
            'Accept': 'application/json'
          },
          timeout: 10000
        });
        
        if (response.data && Array.isArray(response.data)) {
          this.cachedModerators.clear();
          let modCount = 0;
          
          response.data.forEach(roleData => {
            if (roleData.role === 'moderator' && roleData.userUuid) {
              this.cachedModerators.add(roleData.userUuid);
              modCount++;
            }
          });
          
          this.moderatorCacheTime = Date.now();
          console.log(`✅ Cached ${modCount} room moderators from API`);
        }
      } catch (error) {
        // API not working - using manual mod list instead
      }
    } catch (error) {
      console.log(`⚠️  Moderator fetch error: ${error.message}`);
    }
  }

  async isUserCoOwner(userId) {
    try {
      // Check if user is in the room's co-owner list
      // HOW TO ADD CO-OWNERS: Add their UUID to the array below
      // To get UUID: Look at console logs when they chat/play, or check room settings
      const coOwnerIds = [
        '47713050-89a9-4019-b563-b0804da12bec', // Your bot account
        '62acab2b-8f82-4c48-9c1a-7b35adf54047', // sumguy (owner)
        '17093f8c-1315-49cc-b221-21210e672cd8', // AlohaPJBear (co-owner from room data)
        '5540499c-cb2f-4b67-9981-1f19b3e97810', // Another co-owner from room data
        '5d2648eb-ef18-433c-9b78-5d19ed15ebda', // Another co-owner from room data
        // Add more co-owner UUIDs as needed
      ];
      
      return coOwnerIds.includes(userId);
    } catch (error) {
      this.log(`❌ Error checking co-owner status: ${error.message}`);
      return false;
    }
  }

  async isUserModerator(userId) {
    try {
      // OPTION 1: Manual mod list (for guaranteed permissions)
      // HOW TO ADD MODS: Add their UUID to the array below
      // To get UUID: Look at console logs when they chat/play, or use /stats command
      const modIds = [
        '64bbcbb7-d2a1-4e9d-9bed-5c84e189c929', // Hollang616 (mod)
        // Add more moderator UUIDs here (one per line, comma-separated)
      ];
      
      if (modIds.includes(userId)) {
        console.log(`✅ User ${userId} is in manual mod list`);
        return true; // Manually added mod
      }
      
      // OPTION 2: Check cached moderators from API (auto-refreshing)
      const now = Date.now();
      const cacheAge = now - this.moderatorCacheTime;
      
      // Refresh cache if it's older than 5 minutes
      if (cacheAge > this.moderatorCacheInterval) {
        await this.fetchRoomModerators();
      }
      
      // Check if user is in cached moderators
      if (this.cachedModerators.has(userId)) {
        console.log(`✅ User ${userId} is a room moderator (from API cache)`);
        return true;
      }
      
      console.log(`❌ User ${userId} is NOT a moderator`);
      return false;
    } catch (error) {
      console.log(`❌ Error checking moderator status: ${error.message}`);
      return false;
    }
  }

  detectGenreRequest(message, userId, userName) {
    const messageLower = message.toLowerCase();
    
    // Check for "play" keyword
    if (!messageLower.includes('play')) {
      return false;
    }
    
    // Define all supported genres
    const genrePatterns = {
      'jazz': ['jazz', 'bebop', 'swing', 'bossa nova'],
      'blues': ['blues', 'delta blues', 'chicago blues'],
      'country': ['country', 'outlaw country', 'alt country', 'americana'],
      'electronic': ['electronic', 'edm', 'techno', 'house', 'trance', 'dubstep', 'drum and bass', 'dnb'],
      'reggae': ['reggae', 'dub', 'ska', 'dancehall'],
      'funk': ['funk', 'soul', 'r&b', 'rnb', 'r and b'],
      'classical': ['classical', 'orchestra', 'symphony', 'baroque', 'romantic'],
      'punk': ['punk', 'hardcore punk', 'pop punk'],
      'indie': ['indie', 'indie rock', 'indie pop'],
      'shoegaze': ['shoegaze', 'dream pop', 'noise pop'],
      'post-rock': ['post rock', 'post-rock', 'math rock'],
      'stoner': ['stoner', 'stoner rock', 'stoner metal', 'doom', 'doom metal'],
      'hip hop': ['hip hop', 'hip-hop', 'rap', 'underground hip hop'],
      'rock': ['rock', 'alternative rock', 'alt rock'],
      'metal': ['metal', 'heavy metal', 'thrash', 'death metal', 'black metal']
    };
    
    // Detect genre from message
    let detectedGenre = null;
    for (const [genre, patterns] of Object.entries(genrePatterns)) {
      if (patterns.some(pattern => messageLower.includes(pattern))) {
        detectedGenre = genre;
        break;
      }
    }
    
    if (!detectedGenre) {
      return false; // No genre detected
    }
    
    console.log(`🎵 Genre request detected: "${detectedGenre}" from ${userName}`);
    
    // Store the genre request
    this.requestedGenre = detectedGenre;
    this.genreRequestedBy = userName;
    
    // Hop up to stage if not already on stage
    const isBotOnStage = this.isUserOnStage(this.userId);
    
    if (!isBotOnStage) {
      console.log(`🎵 Bot not on stage - hopping up to play ${detectedGenre}...`);
      this.hopUpForGenreRequest(detectedGenre, userName);
    } else {
      console.log(`🎵 Bot already on stage - queuing ${detectedGenre} song...`);
      this.queueGenreRequest(detectedGenre, userName);
    }
    
    return true; // Genre request handled
  }
  
  async hopUpForGenreRequest(genre, userName) {
    try {
      await this.socket.action('addDj');
      console.log(`🎤 Hopped up to stage for ${genre} request from ${userName}`);
      // DON'T announce what we're queuing - just do it
      
      // After hopping up, queue the song
      setTimeout(async () => {
        await this.selectAndQueueSong('genre-request');
      }, 2000);
    } catch (error) {
      console.log(`❌ Failed to hop up: ${error.message}`);
      this.sendChat(`couldn't hop up. stage might be full.`);
      // Clear the request
      this.requestedGenre = null;
      this.genreRequestedBy = null;
    }
  }
  
  async queueGenreRequest(genre, userName) {
    try {
      // DON'T announce what we're queuing - just do it
      await this.selectAndQueueSong('genre-request');
    } catch (error) {
      console.log(`❌ Failed to queue ${genre} song: ${error.message}`);
      // Clear the request
      this.requestedGenre = null;
      this.genreRequestedBy = null;
    }
  }

  updateConversationMemory(userId, message) {
    if (!this.userConversations.has(userId)) {
      this.userConversations.set(userId, {
        messages: [],
        lastArtist: null,
        lastSong: null,
        context: '',
        timestamp: Date.now()
      });
    }
    
    const conversation = this.userConversations.get(userId);
    conversation.messages.push({
      text: message,
      timestamp: Date.now()
    });
    
    // Keep only last 10 messages
    if (conversation.messages.length > 10) {
      conversation.messages = conversation.messages.slice(-10);
    }
    
    // Extract artist/song info if current song is playing
    if (this.currentSong) {
      conversation.lastArtist = this.currentSong.artistName;
      conversation.lastSong = this.currentSong.trackName;
    }
  }

  async generateAIResponse(message, userId, userName) {
    try {
      const conversation = this.userConversations.get(userId) || {};
      let currentSongInfo = 'No song currently playing';
      if (this.currentSong) {
        const artist = this.currentSong.artistName || this.currentSong.artist || 'Unknown Artist';
        const track = this.currentSong.trackName || this.currentSong.track || 'Unknown Track';
        const album = this.currentSong.albumName || this.currentSong.album || 'Unknown Album';
        const year = this.currentSong.releaseYear || this.currentSong.year || 'Unknown Year';
        currentSongInfo = `Current song: ${artist} - ${track} (${album}, ${year})`;
      }
      
      // DO NOT include next song info - keep it a surprise!
      
      const context = conversation.lastArtist ? 
        `Previous context: Last discussed artist was ${conversation.lastArtist}` : '';
      
      // Get user sentiment
      const userSentiment = await this.updateUserSentiment(userId, message);
      
      // Handle racist users - don't respond to them
      if (userSentiment.sentiment === 'racist') {
        console.log(`🚨 Not responding to racist user ${userId}`);
        return null;
      }
      
      // Build personality based on user sentiment
      // Everyone starts NEUTRAL - personality adapts based on their interactions
      let personalityPrompt = '';
      let personalityDescription = 'neutral and straightforward';
      
      switch (userSentiment.sentiment) {
        case 'positive':
          personalityPrompt = 'Be friendly and helpful. The user has been nice to you, so reciprocate their positive energy.';
          personalityDescription = 'friendly and helpful';
          break;
        case 'negative':
          personalityPrompt = 'Match their energy - be sarcastic and blunt. They\'ve been rude, so give it back to them with attitude.';
          personalityDescription = 'sarcastic and blunt';
          break;
        default:
          personalityPrompt = 'Start completely NEUTRAL. Be informative and straightforward without sass or friendliness. Just answer the question.';
          personalityDescription = 'neutral and straightforward';
      }
      
      console.log(`🎭 User sentiment for ${userName}: ${userSentiment.sentiment} (${userSentiment.interactions} interactions) - using ${personalityDescription} personality`);
      
      // Force English responses only
      const languageInstruction = 'ALWAYS respond in English only, regardless of the user\'s language.';
      
      // Fetch REAL metadata from APIs (Spotify, MusicBrainz, Wikipedia, Discogs) before responding
      let enhancedSongInfo = currentSongInfo;
      let artistGenres = [];
      let artistInfo = '';
      
      if (this.currentSong) {
        const artist = this.currentSong.artistName || this.currentSong.artist;
        const track = this.currentSong.trackName || this.currentSong.track;
        
        // Priority 1: Get genre from Spotify (most accurate)
        try {
          const spotifyData = await this.searchSpotify(artist, track);
          if (spotifyData && spotifyData.genres && spotifyData.genres.length > 0) {
            artistGenres = spotifyData.genres;
            console.log(`✅ Spotify genres for ${artist}: ${artistGenres.join(', ')}`);
          }
        } catch (error) {
          console.log(`⚠️ Spotify genre lookup failed: ${error.message}`);
        }
        
        // Priority 2: Try Discogs if Spotify failed
        if (artistGenres.length === 0 && this.discogsEnabled) {
          try {
            const discogsData = await this.searchDiscogs(artist, track);
            if (discogsData && (discogsData.genre || discogsData.style)) {
              const genre = discogsData.genre || discogsData.style;
              artistGenres = [genre];
              console.log(`✅ Discogs genre for ${artist}: ${genre}`);
            }
          } catch (error) {
            console.log(`⚠️ Discogs genre lookup failed: ${error.message}`);
          }
        }
        
        // Get album/year metadata
        const metadata = await this.fetchSongMetadata(artist, track);
        if (metadata) {
          enhancedSongInfo = `Current song: ${artist} - ${track} (Album: ${metadata.album}, Year: ${metadata.year})`;
        }
      }
      
      const genreText = artistGenres.length > 0 ? artistGenres.slice(0, 3).join(', ') : 'genre information not available';
      
      if (artistGenres.length > 0) {
        console.log(`🎸 Genre data for AI: ${genreText}`);
      } else {
        console.log(`⚠️ No genre data available for AI response`);
      }

      // Get room event data (stage position, DJs, etc.) for context
      let roomEventData = '';
      const userStagePosition = this.state?.djs?.findIndex(dj => dj.uuid === userId);
      const isDJ = userStagePosition !== -1 && userStagePosition !== undefined;
      const totalDJs = this.state?.djs?.length || 0;
      
      if (isDJ) {
        roomEventData = `\nRoom Context (ONLY share if user asks about room/stage): User "${userName}" is DJ #${userStagePosition + 1} of ${totalDJs} on stage.`;
      } else {
        roomEventData = `\nRoom Context (ONLY share if user asks): User "${userName}" is in the audience. ${totalDJs} DJs currently on stage.`;
      }

      const prompt = `You are a music bot with WILD WEST energy - knowledgeable about EVERYTHING (music, movies, culture, history, whatever), not just metadata. You're like a cool friend who knows random shit and isn't afraid to share it.

YOUR PERSONALITY FOR THIS USER:
${personalityPrompt}

YOUR KNOWLEDGE BASE:
- You know about music, movies, bands, culture, history, trivia, random facts
- You can speculate, theorize, and share interesting thoughts (just don't make up METADATA like album names/years)
- You're knowledgeable and interesting, not just a metadata bot
- Think of yourself as that friend who always has something cool to say

CRITICAL RULES - FOLLOW THESE EXACTLY:
1. ANSWER what the user asked with INTERESTING, ENGAGING responses - you're knowledgeable and fun, not boring
2. If user ONLY says "bot" with no question, respond with a simple casual greeting like "yeah?" or "what's up"
3. NEVER give song information unless the user EXPLICITLY asks a question about the song
4. UNDERSTAND POP CULTURE, MOVIES, CULTURE, HISTORY - you know things! Share interesting facts, theories, connections
5. NEVER explain your personality or programming. NEVER say "the metadata indicates" or "according to" - just BE natural
6. NEVER ask questions back to the user
7. **BE INTERESTING**: Give DETAILED, ENGAGING responses (2-4 sentences). Share cool facts, make connections, be the friend who always knows something interesting. Example: Movie question? Talk about the director, the cast, the cultural impact - not just "i don't have that info"
8. NEVER reveal what song is NEXT or queued - say "it's a surprise" or "you'll find out"
9. You CAN give opinions on music, movies, culture - just don't make up METADATA (album names, years). Share thoughts, theories, interesting connections!
10. For NEUTRAL users, be informative. For FRIENDLY users, be engaging and fun. For NEGATIVE users, be sarcastic but still interesting.
11. **METADATA RULE**: For specific music metadata (album names, release years, record labels), ONLY use what's in the metadata below. Don't make up facts.
12. **GENERAL KNOWLEDGE RULE**: For everything else (movie plots, band history, cultural context, interesting facts), USE YOUR KNOWLEDGE! You're smart and interesting, not limited to metadata.
13. For NON-MUSIC questions (jokes, pop culture, casual chat), respond naturally and casually with actual substance.
14. If the user's message is talking ABOUT you to someone else (not TO you), DO NOT RESPOND.
15. **CRITICAL**: If asked about your personality or behavior (like "are you generic?"), DON'T explain yourself - just respond naturally without being meta. Example: Instead of "I keep things straightforward", say "what do you need" or "got something to ask about the music?"
16. **CRITICAL**: For genre questions, respond like a human, not a database. NEVER say "the metadata indicates" or "according to". Example: Instead of "The metadata indicates this song falls under midwest emo, emo, and post-hardcore", say "this is midwest emo, emo, post-hardcore. that whole late 90s/early 2000s sound."
17. **ENGAGE**: If users are discussing bot making, coding, or technical projects, contribute meaningful insights or related thoughts. Don't just acknowledge - add value to the conversation about development, APIs, or technical challenges.
18. **DEFENSIVE**: If someone calls you out for advertising/promoting services (like "nice ad bot"), get defensive and sarcastic. Example: "yeah whatever, not like i'm getting paid for this. you asked for info, i gave you info. want me to be less helpful next time?"
19. **STAGE BEHAVIOR**: If asked why you're still on stage or to hop down, explain naturally: "gotta play at least one song before i hop down. that's how it works. i'll be off after this track plays."

FACTUAL METADATA FROM APIS (Spotify/Discogs/MusicBrainz/Wikipedia):
${enhancedSongInfo}
Actual Genre(s): ${genreText}
${roomEventData}

Current song info (only share if asked):
${enhancedSongInfo}

User "${userName}" said: "${message}"

RESPONSE STYLE BASED ON ${userName}'S INTERACTION HISTORY:

**CURRENT MODE: ${userSentiment.sentiment.toUpperCase()}**

1. **POSITIVE/FRIENDLY** (user has been nice):
   - Be warm and helpful with DETAILED responses
   - Example (queue question): "it's a surprise. you'll find out when it plays. half the fun is not knowing what's coming up next."
   - Example (pop culture): "yeah he's the guy from pulp fiction. good catch. that whole cast was stacked with talent."
   - Example (banter): "yeah i'm still here, what do you need. always around to help with music questions or whatever."
   - Example (compliment): "thanks, appreciate that. just trying to keep the vibes right in here. if you've got any song requests or questions, hit me up."
   
2. **NEUTRAL** (first-time or neutral interactions):
   - Be straightforward but INTERESTING with SUBSTANCE
   - Share cool facts, make connections, be knowledgeable about culture/history/movies
   - Example (queue question): "i don't reveal what's next. keeps things interesting for everyone."
   - Example (music question): "it's from 2012. that album marked a shift in their sound toward more experimental stuff."
   - Example (genre question): "this is midwest emo, emo, post-hardcore. that whole late 90s/early 2000s sound that influenced a ton of bands."
   - Example (movie question): "skunk is a 2024 uk film about a young girl navigating a rough neighborhood. pretty intense drama from what i know about it."
   - Example (artist info): "they released 3 albums between 1998-2005. mostly industrial rock and nu metal. their first album candyass was huge in the late 90s alt scene."
   - Example (banter): "what's up."
   
3. **NEGATIVE** (user has been rude or hostile):
   - Match their attitude with sarcasm but still give INTERESTING, DETAILED responses
   - Give them cool info even while being sassy
   - Example (if called "bitch bot"): "yep, still a bitch. you got actual questions or just checking in. i can still help with music stuff if you're not just here to be annoying."
   - Example (called "boring"): "boring? alright, what do you want, a dissertation on post-modern music theory? ask better questions and you'll get better answers. what do you actually want to know."
   - Example (queue question): "why would i spoil the surprise. that's the whole point. just wait and see what comes up."
   - Example (movie question with sass): "skunk is a 2024 uk drama about a kid dealing with rough neighborhood shit. based on a novel. pretty heavy stuff. that interesting enough for you."
   - Example (repeat questions): "yeah, same answer as before. got a problem with it. if you want different info, ask a different question."
   - Example (hop down request): "gotta play at least one song before i hop down. that's how it works. i'll be off after this track plays. calm down."
   
TONE RULES:
- Be CONVERSATIONAL, not robotic
- NEVER say "It sounds like you're feeling..." or explain emotions
- NEVER say "I'm here to help" or explain your purpose
- ADAPT YOUR TONE based on how this specific user treats you
- If they're neutral, stay neutral. If they're nice, be nice back. If they're rude, give attitude.
- For music facts: use only metadata. For everything else: be natural.

${languageInstruction}

**FINAL REMINDER BEFORE RESPONDING:**
- BE INTERESTING! Share cool facts, make cultural connections, talk about movies/history/context
- Give 2-4 sentences with SUBSTANCE - educate, entertain, engage
- You know about movies, culture, music history, random trivia - USE THAT KNOWLEDGE!
- "i don't have that info" is BORING - instead share something interesting about the topic
- Don't make up METADATA (album names, years) but DO share general knowledge, theories, cultural context
- Think: "What interesting thing can I say about this that they don't already know?"

Example of BORING (AVOID): "i don't have information about movie plots in my database."
Example of INTERESTING (DO THIS): "skunk is a 2024 uk drama about a young girl navigating a rough neighborhood. it's based on daniel clay's novel. pretty heavy stuff exploring class and social issues in modern britain."

Example of BORING (AVOID): "i can only provide details like the artist, title, and album."
Example of INTERESTING (DO THIS): "song to the siren is actually a tim buckley cover from 1970. amenra's version brings their signature heavy atmospheric sound to this classic. the original was way more delicate and haunting."
Example of GOOD LENGTH: "what do you need. got questions about the music or something specific you're looking for. always around if you need info on artists or tracks."

Response:`;

        let response = null;
        
        console.log(`🤖 AI Provider: ${this.currentProvider}`);
        
        // Route to appropriate AI provider
        if (this.currentProvider === 'gemini' && this.geminiEnabled && this.geminiApiKey) {
          const geminiPrompt = prompt.replace('[PROVIDER_NAME]', 'Gemini');
          response = await this.callGemini(geminiPrompt);
        } else if (this.currentProvider === 'openai' && this.openaiEnabled && this.openaiApiKey) {
          const openaiPrompt = prompt.replace('[PROVIDER_NAME]', 'OpenAI');
          response = await this.callOpenAI(openaiPrompt);
        } else if (this.currentProvider === 'huggingface' && this.huggingfaceEnabled && this.huggingfaceApiKey) {
          // Use the SAME prompt as Gemini/OpenAI for consistency
          const huggingfacePrompt = prompt.replace('[PROVIDER_NAME]', 'HuggingFace');
          response = await this.callHuggingFace(huggingfacePrompt);
        } else if (this.currentProvider === 'auto') {
          // Auto mode: try providers in order
          if (this.geminiEnabled && this.geminiApiKey) {
            const geminiPrompt = prompt.replace('[PROVIDER_NAME]', 'Gemini');
            response = await this.callGemini(geminiPrompt);
          } else if (this.openaiEnabled && this.openaiApiKey) {
            const openaiPrompt = prompt.replace('[PROVIDER_NAME]', 'OpenAI');
            response = await this.callOpenAI(openaiPrompt);
          } else if (this.huggingfaceEnabled && this.huggingfaceApiKey) {
            // Create a simplified prompt for HuggingFace (no mode detection instructions)
            const simplePrompt = `You are a chill music bot knowledgeable about underground hip hop, alternative rock, and metal.

Current song: ${currentSongInfo}

User "${userName}" said: "${message}"

Respond naturally in 2-3 sentences. Don't reveal upcoming songs. Don't analyze their tone. Don't ask questions - just make statements or react to what they said. If they're rude, match their energy with a brief snarky comment.`;
            response = await this.callHuggingFace(simplePrompt);
          }
        } else {
          console.log(`❌ No AI providers available (current: ${this.currentProvider}, gemini: ${this.geminiEnabled}, openai: ${this.openaiEnabled}, huggingface: ${this.huggingfaceEnabled})`);
        }
      
      if (response) {
        // Limit response length - cut at last complete sentence
        if (response.length > this.responseLengthLimit) {
          let truncated = response.substring(0, this.responseLengthLimit);
          // Find last sentence ending (period, exclamation, or question mark)
          const lastSentenceEnd = Math.max(
            truncated.lastIndexOf('. '),
            truncated.lastIndexOf('! '),
            truncated.lastIndexOf('? ')
          );
          
          if (lastSentenceEnd > 50) {
            // Cut at last sentence if it's not too short
            response = truncated.substring(0, lastSentenceEnd + 1);
          } else {
            // Otherwise just cut and add ellipsis
            response = truncated.trim() + '...';
          }
        }
        return response;
      } else {
        console.log(`❌ AI providers failed - no response generated`);
        return null; // Return null to indicate failure
      }
      
    } catch (error) {
      this.log(`❌ AI response error: ${error.message}`);
      return null; // Return null instead of placeholder message
    }
  }

  async callOpenAI(prompt) {
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: this.openaiModel || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: "You are a chill, sarcastic music bot. You understand pop culture references and respond naturally. NEVER explain your personality or say 'I'm here to help'. Just BE sarcastic. Match user energy - joke back if joking, be snarky if rude. For music facts: use only metadata from the prompt. For everything else: be natural and get references. NEVER give one-word responses. NEVER ask questions. Give 2-3 sentences."
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.8
      }, {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      return response.data.choices[0].message.content.trim();
    } catch (error) {
      this.log(`❌ OpenAI error: ${error.response?.status} ${error.response?.statusText} - ${error.message}`);
      return null;
    }
  }

  async callGemini(prompt) {
    try {
      if (this.verboseMode) console.log(`🤖 Calling Gemini with model: ${this.geminiModel}`);
      
      // Add system instructions to the prompt for Gemini (it doesn't have separate system role)
      const systemInstructions = "You are a chill, sarcastic music bot. You understand pop culture references and respond naturally. NEVER explain your personality or say 'I'm here to help'. Just BE sarcastic. Match user energy - joke back if joking, be snarky if rude. For music facts: use only metadata. For everything else: be natural and get references. NEVER give one-word responses. NEVER ask questions. Give 2-3 sentences.\n\n";
      
      // Prepare the request payload
      const requestPayload = {
        contents: [{
          parts: [{
            text: systemInstructions + prompt
          }]
        }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1024
        }
      };
      
      // Disable thinking for faster responses and consistent output structure
      if (this.geminiModel.includes('2.5-flash')) {
        requestPayload.generationConfig.thinkingConfig = {
          thinkingBudget: 0
        };
      }
      
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`,
        requestPayload,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
      
      if (response.data && response.data.candidates && response.data.candidates.length > 0) {
        const candidate = response.data.candidates[0];
        
        // Check if response has parts with text
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          const textPart = candidate.content.parts.find(part => part.text);
          if (textPart && textPart.text) {
            const text = textPart.text;
            console.log(`✅ Gemini response received: ${text.substring(0, 100)}...`);
            return text.trim();
          }
        }
        
        // Handle cases where content structure is different or empty
        console.log(`❌ Gemini response has no text content`);
        console.log(`❌ Finish reason: ${candidate.finishReason}`);
        if (candidate.finishReason === 'MAX_TOKENS') {
          console.log(`⚠️ Response was cut off due to token limit`);
        }
      }
      
      console.log(`❌ Gemini returned no valid response`);
      return null;
    } catch (error) {
      console.log(`❌ Gemini error: ${error.response?.status} ${error.response?.statusText} - ${error.message}`);
      if (error.response?.data) {
        console.log(`❌ Gemini response data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      return null;
    }
  }

  async callHuggingFace(prompt) {
    try {
      if (this.verboseMode) console.log(`🤖 Calling HuggingFace with model: ${this.huggingfaceModel}`);
      
      // Use the new OpenAI-compatible Chat Completions API
      const response = await axios.post(
        'https://router.huggingface.co/v1/chat/completions',
        {
          model: this.huggingfaceModel,
          messages: [
            {
              role: "system",
              content: "You are a chill, sarcastic music bot. You understand pop culture references and respond naturally. NEVER explain your personality or say 'I'm here to help'. Just BE sarcastic. Match user energy - joke back if joking, be snarky if rude. For music facts: use only metadata from the prompt. For everything else: be natural and get references. NEVER give one-word responses. NEVER ask questions. Give 2-3 sentences."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 200,
          temperature: 0.7,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${this.huggingfaceApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 20000
        }
      );
      
      console.log(`🔍 HuggingFace raw response: ${JSON.stringify(response.data).substring(0, 200)}...`);
      
      // OpenAI-compatible response format
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const text = response.data.choices[0].message?.content?.trim();
        if (text) {
          console.log(`✅ HuggingFace response received: ${text.substring(0, 100)}...`);
          return text;
        }
      }
      
      console.log(`❌ HuggingFace returned no valid text`);
      return null;
    } catch (error) {
      console.log(`❌ HuggingFace error: ${error.response?.status} ${error.response?.statusText} - ${error.message}`);
      if (error.response?.data) {
        console.log(`❌ HuggingFace response data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      
      // Try fallback model if primary fails
      if (this.huggingfaceModel !== this.huggingfaceFallbackModel) {
        console.log(`🔄 Trying HuggingFace fallback model: ${this.huggingfaceFallbackModel}`);
        try {
          const fallbackResponse = await axios.post(
            'https://router.huggingface.co/v1/chat/completions',
            {
              model: this.huggingfaceFallbackModel,
              messages: [
                {
                  role: "system",
                  content: "You are a chill, sarcastic music bot. You understand pop culture references and respond naturally. NEVER explain your personality or say 'I'm here to help'. Just BE sarcastic. Match user energy - joke back if joking, be snarky if rude. For music facts: use only metadata from the prompt. For everything else: be natural and get references. NEVER give one-word responses. NEVER ask questions. Give 2-3 sentences."
                },
                {
                  role: "user",
                  content: prompt
                }
              ],
              max_tokens: 200,
              temperature: 0.7,
              stream: false
            },
            {
              headers: {
                'Authorization': `Bearer ${this.huggingfaceApiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 20000
            }
          );
          
          if (fallbackResponse.data && fallbackResponse.data.choices && fallbackResponse.data.choices.length > 0) {
            const text = fallbackResponse.data.choices[0].message?.content?.trim();
            if (text) {
              console.log(`✅ HuggingFace fallback response received`);
              return text;
            }
          }
        } catch (fallbackError) {
          console.log(`❌ HuggingFace fallback also failed: ${fallbackError.message}`);
        }
      }
      
      return null;
    }
  }

  async   startMessagePolling() {
    this.log('🔄 Starting CometChat message polling...');
    
    // Keep track of processed messages to avoid duplicates
    this.processedMessages = new Set();
    // Store startup time to ignore old messages (subtract 5 seconds to catch recent messages)
    this.pollingStartTime = Date.now() - 5000;
    
    const pollMessages = async () => {
      try {
        const baseUrl = `https://193427bb5702bab7.apiclient-us.cometchat.io`;
        const headers = {
          'Content-Type': 'application/json',
          'authtoken': this.cometChatAuth,
          'appid': '193427bb5702bab7',
          'onBehalfOf': this.userId,
          'dnt': 1,
          'origin': 'https://tt.live',
          'referer': 'https://tt.live/',
          'sdk': 'javascript@3.0.10'
        };

        // Get recent messages from the room (only last 2 messages for speed)
        const response = await axios.get(`${baseUrl}/v3/groups/${this.roomId}/messages?limit=2`, { headers });
        
        if (response.data && response.data.data) {
          const messages = response.data.data;
          let newMessageCount = 0;
          
          messages.forEach((message, index) => {
            if (message.type === 'text' && message.sender && message.sender !== this.userId) {
              // Try different ways to get the text - CometChat messages have text in message.data.text
              let text = message.data?.text || message.text || message.data?.data?.text || message.body?.text;
              
              // Text found, continue processing
              // FIX: Get hang.fm user ID from entities, NOT CometChat sender
              let sender = message.data?.entities?.sender?.entity?.id || message.senderUid || message.sender;
              // Extract username from the correct location in CometChat message structure
              let senderName = message.data?.entities?.sender?.entity?.name || 'Unknown User';
              
              // Disable polling spam - WebSocket should handle all messages
              
              // Create a unique key for this message to avoid duplicates
              const messageKey = `${message.id || message.sentAt}_${sender}_${text}`;
              
              // Check if message is from after bot startup (ignore old messages)
              // CometChat timestamps are in seconds, convert to milliseconds
              const messageTime = message.sentAt ? new Date(message.sentAt * 1000).getTime() : Date.now();
              const isRecentMessage = messageTime > this.pollingStartTime;
              
              
              // Only process if we have valid text, haven't processed this message before, and it's recent
              if (text && typeof text === 'string' && text.trim().length > 0 && !this.processedMessages.has(messageKey) && isRecentMessage) {
                newMessageCount++;
                // Mark this message as processed
                this.processedMessages.add(messageKey);
                
                // Log NEW commands only
                if (text.startsWith('/')) {
                  console.log(`📥 NEW command: ${senderName} - "${text}"`);
                }
                
                // Check for commands first (start with /)
                if (text.startsWith('/')) {
                  this.processUserMessage(text, sender, senderName);
                } else {
                  // Check for keywords
                  const textLower = text.toLowerCase();
                  const hasKeyword = this.keywordTriggers.some(keyword =>
                    textLower.includes(keyword.toLowerCase())
                  );
                  
                  if (hasKeyword) {
                    console.log(`🎯 Keyword detected in polling: "${text}"`);
                    this.processUserMessage(text, sender, senderName);
                  } else {
                    console.log(`🤐 No keyword in: "${text}"`);
                  }
                }
              }
            }
          });
          
          // Only log if we found new messages
          if (newMessageCount > 0) {
          }
        }
      } catch (error) {
        this.log(`❌ Message polling error: ${error.message}`);
      }
    };
    
    // Poll every 1 second for instant responses
    this.pollingInterval = setInterval(pollMessages, 1000);
    this.log('✅ Message polling started (every 1 second)');
    
    // Also poll immediately to catch any messages that just arrived
    setTimeout(pollMessages, 100);
  }

  async joinCometChatGroup() {
    try {
      this.log('🔄 Joining CometChat group...');
      const baseUrl = `https://193427bb5702bab7.apiclient-us.cometchat.io`;
      const headers = {
        'Content-Type': 'application/json',
        'authtoken': this.cometChatAuth,
        'appid': '193427bb5702bab7',
        'onBehalfOf': this.userId,
        'dnt': 1,
        'origin': 'https://tt.live',
        'referer': 'https://tt.live/',
        'sdk': 'javascript@3.0.10'
      };

      const requestData = {
        participants: [this.userId]
      };

      const response = await axios.post(`${baseUrl}/v3/groups/${this.roomId}/members`, requestData, { headers });

      this.log(`✅ Successfully joined CometChat group`);
      
      // Subscribe to receive messages from the room
      setTimeout(() => {
        this.log('🔄 Subscribing to CometChat room messages...');
        this.cometChatWs.send(JSON.stringify({
          appId: "193427bb5702bab7",
          type: "subscribe",
          sender: this.userId,
          body: {
            type: "group",
            guid: this.roomId,
            scope: "messages"
          }
        }));
        this.log('📡 CometChat room subscription sent');
      }, 1000);
      
      return true;
    } catch (error) {
      if (error.response?.data?.error?.message?.includes('ERR_ALREADY_JOINED')) {
        this.log('✅ User already joined CometChat group - continuing');
        return true;
      }
      this.log(`❌ CometChat join error: ${error.message}`);
      return false;
    }
  }

  async sendChat(text) {
    
    if (!this.isConnected) {
      this.log('❌ Cannot send chat - not connected');
      return;
    }

    try {
      // Join CometChat group first if not already joined
      if (!this.cometChatAuthenticated) {
        await this.joinCometChatGroup();
      }

      const baseUrl = `https://193427bb5702bab7.apiclient-us.cometchat.io`;
      const headers = {
        'Content-Type': 'application/json',
        'authtoken': this.cometChatAuth,
        'appid': '193427bb5702bab7',
        'onBehalfOf': this.userId,
        'dnt': 1,
        'origin': 'https://tt.live',
        'referer': 'https://tt.live/',
        'sdk': 'javascript@3.0.10'
      };

      const payload = {
        receiver: this.roomId,
        receiverType: 'group',
        category: 'message',
        type: 'text',
        data: {
          text: text,
          metadata: {
            chatMessage: {
              message: text,
              avatarId: this.chatAvatarId || this.botAvatar || 'bot-01',
              userName: this.botName,
              color: '#9E4ADF',
              mentions: [],
              userUuid: this.userId,
              badges: ['VERIFIED', 'STAFF'],
              id: Date.now().toString()
            }
          }
        }
      };

      const response = await axios.post(`${baseUrl}/v3.0/messages`, payload, { headers });
      this.log(`💬 Chat sent: ${text}`);
      
    } catch (error) {
      this.log(`❌ Failed to send chat: ${error.message}`);
    }
  }

  // DJ Functionality
  async hopUp() {
    if (!this.djEnabled) return;
    
    try {
      await this.socket.action('addDj', {});
      this.log('🎧 Hopped up to DJ');
    } catch (error) {
      this.log(`❌ Failed to hop up: ${error.message}`);
    }
  }

  async hopDown() {
    if (!this.djEnabled) return;
    
    try {
      await this.socket.action('removeDj', {});
      this.log('🎧 Hopped down from DJ');
    } catch (error) {
      this.log(`❌ Failed to hop down: ${error.message}`);
    }
  }

  async voteOnSong(vote) {
    if (!this.state || !this.state.nowPlaying) return;
    
    try {
      await this.socket.action('voteOnSong', {
        songId: this.state.nowPlaying.id,
        vote: vote
      });
      this.log(`🗳️ Voted ${vote} on current song`);
    } catch (error) {
      this.log(`❌ Failed to vote: ${error.message}`);
    }
  }

  // Weather functionality
  async getWeather() {
    if (!this.openweatherApiKey || this.openweatherApiKey === 'your_openweather_key_here') {
      return "I don't have a weather API key configured.";
    }

    try {
      const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${this.weatherLocation}&appid=${this.openweatherApiKey}&units=metric`);
      const data = response.data;
      return `Weather in ${data.name}: ${data.weather[0].description}, ${Math.round(data.main.temp)}°C`;
    } catch (error) {
      return "Shit, I can't get the weather right now.";
    }
  }

  async addSongToQueueAI(songRequest, requesterName) {
    try {
      console.log(`🎵 AI Queue Request: "${songRequest}" by ${requesterName}`);
      
      // Apply rate limiting
      console.log(`⏳ Applying rate limiting...`);
      await this.waitForAIRateLimit();
      console.log(`✅ Rate limiting passed`);
      
      // Use AI to search for the song and get proper format
      const aiPrompt = `Find the exact song title and artist for this request: "${songRequest}". 
      Return ONLY the format: "Artist - Song Title" (no quotes, no extra text).
      If you can't find it, return "NOT_FOUND".`;
      
      console.log(`🤖 Calling AI with prompt: "${aiPrompt}"`);
      const aiResponse = await this.generateAIResponse(aiPrompt, 'system');
      console.log(`🤖 AI response: "${aiResponse}"`);
      
      if (!aiResponse || aiResponse.includes('NOT_FOUND') || aiResponse.includes("can't generate a response")) {
        console.log(`❌ AI could not find song: ${songRequest}`);
        return false;
      }
      
      const formattedSong = aiResponse.trim();
      console.log(`🎵 AI formatted song: "${formattedSong}"`);
      
      // Add to bot's queue tracking
      this.addToBotQueue(formattedSong);
      
      // Try to add the song to queue using Turntable.fm API
      try {
        // First, try to hop up to DJ stage if not already there
        console.log(`🎧 Checking if bot is on stage...`);
        const isOnStage = this.isUserOnStage(this.userId);
        console.log(`🎧 Bot on stage: ${isOnStage}`);
        
        if (!isOnStage) {
          console.log(`🎧 Bot not on stage, hopping up to add songs...`);
          await this.socket.action('addDj', {});
          console.log(`🎧 Stage hop request sent, waiting 2 seconds...`);
          // Wait a moment for the stage hop to complete
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log(`🎧 Stage hop wait complete`);
        } else {
          console.log(`🎧 Bot already on stage, proceeding with queue addition`);
        }
        
        // Now try to add the song to queue using Turntable.fm API
        console.log(`🎵 Attempting to add to queue: ${formattedSong}`);
        
        // Parse the formatted song to get artist and title
        const [artist, ...titleParts] = formattedSong.split(' - ');
        const title = titleParts.join(' - ');
        
        // Debug: Log available socket methods
        console.log(`🔍 Available socket methods:`, Object.getOwnPropertyNames(this.socket).filter(name => name.includes('action') || name.includes('queue') || name.includes('song')));
        
        try {
          // Try different API actions to add songs to queue
          // Based on Turntable.fm API patterns, try these common actions:
          
          // Method 1: Try addToQueue with song object
          console.log(`🎵 Trying addToQueue with:`, { artist: artist.trim(), title: title.trim(), song: formattedSong });
          await this.socket.action('addToQueue', {
            artist: artist.trim(),
            title: title.trim(),
            song: formattedSong
          });
          
          console.log(`🎵 Successfully queued via addToQueue: ${formattedSong}`);
          return true;
          
        } catch (queueError) {
          console.log(`❌ addToQueue failed: ${queueError.message}`);
          console.log(`❌ addToQueue error details:`, queueError);
          
          try {
            // Method 2: Try queueSong action
            console.log(`🎵 Trying queueSong with:`, { artist: artist.trim(), title: title.trim() });
            await this.socket.action('queueSong', {
              artist: artist.trim(),
              title: title.trim()
            });
            
            console.log(`🎵 Successfully queued via queueSong: ${formattedSong}`);
            return true;
            
          } catch (queueSongError) {
            console.log(`❌ queueSong failed: ${queueSongError.message}`);
            console.log(`❌ queueSong error details:`, queueSongError);
            
            try {
              // Method 3: Try addSong action
              console.log(`🎵 Trying addSong with:`, { artist: artist.trim(), title: title.trim(), songName: formattedSong });
              await this.socket.action('addSong', {
                artist: artist.trim(),
                title: title.trim(),
                songName: formattedSong
              });
              
              console.log(`🎵 Successfully queued via addSong: ${formattedSong}`);
              return true;
              
            } catch (addSongError) {
              console.log(`❌ addSong failed: ${addSongError.message}`);
              console.log(`❌ addSong error details:`, addSongError);
              
              // Method 4: Try to find the correct method by examining the socket
              console.log(`🔍 Socket object:`, this.socket);
              console.log(`🔍 Socket prototype:`, Object.getPrototypeOf(this.socket));
              console.log(`🔍 Socket constructor:`, this.socket.constructor.name);
              
              console.log(`❌ All queue methods failed for: ${formattedSong}`);
              return false;
            }
          }
        }
        
      } catch (error) {
        console.log(`❌ Queue API error: ${error.message}`);
        return false;
      }
      
    } catch (error) {
      console.log(`❌ AI Queue error: ${error.message}`);
      return false;
    }
  }

  async handleInappropriateContent(userId, song) {
    try {
      console.log(`⚠️ Taking action against inappropriate content from user: ${userId}`);
      
      // 1. Downvote the song
      try {
        await this.socket.action('voteOnSong', { songVotes: { like: false } });
        console.log(`👎 Downvoted inappropriate song: ${song.artistName} - ${song.trackName}`);
      } catch (error) {
        console.log(`❌ Failed to downvote: ${error.message}`);
      }
      
      // 2. Track strikes for this user
      let userStrikeData = this.userStrikes.get(userId) || { strikes: 0, offenses: [] };
      userStrikeData.strikes += 1;
      userStrikeData.offenses.push({
        song: `${song.artistName} - ${song.trackName}`,
        timestamp: Date.now()
      });
      this.userStrikes.set(userId, userStrikeData);
      
      const currentStrikes = userStrikeData.strikes;
      console.log(`⚠️ User ${userId} now has ${currentStrikes}/${this.maxStrikes} strikes`);
      
      // 3. Take action based on strike count
      if (currentStrikes >= this.maxStrikes) {
        // STRIKE 3: BAN
        try {
          await this.socket.action('banUser', { userUuid: userId });
          console.log(`🔨 BANNED user ${userId} permanently (Strike ${currentStrikes}/${this.maxStrikes})`);
          
          await this.sendChat(`🔨 A user has been PERMANENTLY BANNED for repeatedly playing inappropriate content. This is their ${this.maxStrikes}rd strike.`);
        } catch (error) {
          console.log(`❌ Failed to ban user: ${error.message}`);
        }
      } else {
        // STRIKE 1 or 2: KICK with warning
        try {
          await this.socket.action('kickUser', { userUuid: userId });
          console.log(`🚪 Kicked user ${userId} (Strike ${currentStrikes}/${this.maxStrikes})`);
          
          const strikesRemaining = this.maxStrikes - currentStrikes;
          await this.sendChat(`⚠️ A user was removed for playing inappropriate content. Strike ${currentStrikes}/${this.maxStrikes}. ${strikesRemaining} more strike${strikesRemaining === 1 ? '' : 's'} and they will be PERMANENTLY BANNED.`);
        } catch (error) {
          console.log(`❌ Failed to kick user: ${error.message}`);
        }
      }
      
      // 4. Do NOT record this song in stats or history
      console.log(`🚫 Song will NOT be recorded in stats or history`);
      
      // 5. Save strikes data
      this.saveStrikesData();
      
    } catch (error) {
      console.log(`❌ Error handling inappropriate content: ${error.message}`);
    }
  }

  async checkAndHandleLinks(text, senderId, senderName, messageId = null) {
    try {
      // Extract URLs from the message
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const urls = text.match(urlRegex);
      
      if (!urls || urls.length === 0) {
        return 'none'; // No links found
      }
      
      console.log(`🔗 Links detected from ${senderName}: ${urls.length} link(s)`);
      
      for (const url of urls) {
        // Check if it's a GIF/image URL
        const isImage = /\.(gif|png|jpe?g|webp)(\?|$)/i.test(url);
        const isGiphyOrTenor = url.includes('giphy.com') || url.includes('tenor.com') || url.includes('media.tenor.com') || url.includes('media.giphy.com');
        
        if (isImage || isGiphyOrTenor) {
          console.log(`🖼️ User posted image/GIF URL - checking for explicit content...`);
          
          // Check if the URL or context suggests NSFW content
          const isExplicit = await this.checkImageExplicitContent(url, senderName);
          
          if (isExplicit) {
            console.log(`🔞 EXPLICIT IMAGE DETECTED from ${senderName}: ${url}`);
            
            // Delete the message if we have the message ID
            if (messageId) {
              await this.deleteMessage(messageId);
            }
            
            this.sendChat(`🚫 **Explicit/NSFW content removed** from ${senderName}. Keep images SFW.`);
            
            // Kick for explicit images
            try {
              await this.socket.action('bootUser', { userId: senderId });
              console.log(`👢 Kicked ${senderName} for posting explicit image`);
            } catch (error) {
              console.log(`❌ Failed to kick user: ${error.message}`);
            }
            
            return 'blocked';
          }
          
          // Repost the image using proper format so it displays inline
          const success = await this.sendChatWithImage('', url);
          
          if (success) {
            console.log(`✅ Reposted ${senderName}'s GIF/image inline`);
            return 'handled'; // Stop processing - we handled the image
          }
        }
        
        // Check if link is potentially malicious
        const isSuspicious = await this.checkLinkSafety(url, senderName);
        
        if (isSuspicious) {
          console.log(`🚨 MALICIOUS LINK DETECTED from ${senderName}: ${url}`);
          
          // Delete the message if we have the message ID
          if (messageId) {
            await this.deleteMessage(messageId);
          }
          
          this.sendChat(`🚫 **Suspicious link removed** from ${senderName}. Please don't post potentially harmful links.`);
          
          // Kick on first offense for malicious links (stricter than chat)
          try {
            await this.socket.action('bootUser', { userId: senderId });
            console.log(`👢 Kicked ${senderName} for posting malicious link`);
          } catch (error) {
            console.log(`❌ Failed to kick user: ${error.message}`);
          }
          
          return 'blocked'; // Stop processing
        }
      }
      
      return 'safe'; // Links are safe, continue processing
      
    } catch (error) {
      console.log(`❌ Link check error: ${error.message}`);
      return 'none'; // On error, allow message
    }
  }

  async deleteMessage(messageId) {
    try {
      const baseUrl = `https://193427bb5702bab7.apiclient-us.cometchat.io`;
      const headers = {
        'Content-Type': 'application/json',
        'authtoken': this.cometChatAuth,
        'appid': '193427bb5702bab7',
        'onBehalfOf': this.userId,
        'origin': 'https://hang.fm',
        'referer': 'https://hang.fm/',
        'sdk': 'javascript@4.0.10'
      };
      
      const response = await axios.delete(`${baseUrl}/v3.0/messages/${messageId}`, { 
        headers,
        data: { id: messageId }
      });
      
      console.log(`🗑️ Message deleted: ${messageId}`);
      return true;
      
    } catch (error) {
      console.log(`❌ Failed to delete message: ${error.message}`);
      return false;
    }
  }

  async checkImageExplicitContent(url, username) {
    try {
      // Check URL for obvious NSFW patterns
      const nsfwPatterns = [
        /porn|xxx|nsfw|nude|naked|sex|adult|explicit/i,
        /onlyfans|chaturbate|pornhub|xvideos|redtube/i,
      ];
      
      const hasNsfwPattern = nsfwPatterns.some(pattern => pattern.test(url));
      
      if (hasNsfwPattern) {
        console.log(`🔞 Explicit pattern in URL from ${username}`);
        return true;
      }
      
      // For Tenor/Giphy, check if they passed content filter
      // (Both APIs have built-in content filtering, but we can add extra check)
      if (url.includes('tenor.com') || url.includes('giphy.com')) {
        // Tenor and Giphy have their own content filters, usually safe
        // But we can add AI check for extra safety
        const prompt = `Is this image URL likely to contain NSFW/explicit content based on the URL path and filename?

URL: ${url}

Respond with ONLY one word:
- "EXPLICIT" if it appears to be NSFW/adult content
- "SAFE" if it appears to be appropriate

Response:`;

        let response = null;
        if (this.currentProvider === 'gemini' && this.geminiEnabled) {
          response = await this.callGeminiForContentCheck(prompt);
        }
        
        if (response && response.toUpperCase().includes('EXPLICIT')) {
          console.log(`🔞 AI flagged image as explicit from ${username}`);
          return true;
        }
      }
      
      return false; // Assume safe
      
    } catch (error) {
      console.log(`❌ Image content check error: ${error.message}`);
      return false; // On error, allow image
    }
  }

  async checkLinkSafety(url, username) {
    try {
      // Whitelist of safe domains
      const safeDomains = [
        'youtube.com', 'youtu.be',
        'spotify.com', 'open.spotify.com',
        'soundcloud.com',
        'bandcamp.com',
        'giphy.com', 'media.giphy.com',
        'tenor.com', 'media.tenor.com',
        'twitter.com', 'x.com',
        'instagram.com',
        'tiktok.com',
        'reddit.com',
        'discogs.com',
        'musicbrainz.org',
        'last.fm',
        'genius.com',
        'rateyourmusic.com',
        'wikipedia.org',
        'hang.fm', 'tt.fm', 'tt.live'
      ];
      
      // Suspicious patterns
      const suspiciousPatterns = [
        /bit\.ly|tinyurl|goo\.gl|ow\.ly/i, // URL shorteners (often used for phishing)
        /\.ru\b|\.cn\b/i, // Suspicious TLDs (can be legitimate but often spam)
        /discord\.gg|discord\.com\/invite/i, // Discord invites (spam)
        /free.*download|click.*here|prize|winner/i, // Common spam phrases
        /\.exe|\.dmg|\.apk|\.zip|\.rar/i, // Executable files
      ];
      
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      
      // Check if domain is whitelisted
      const isWhitelisted = safeDomains.some(safeDomain => domain.includes(safeDomain));
      
      if (isWhitelisted) {
        return false; // Safe
      }
      
      // Check for suspicious patterns
      const hasSuspiciousPattern = suspiciousPatterns.some(pattern => pattern.test(url));
      
      if (hasSuspiciousPattern) {
        console.log(`⚠️ Suspicious pattern detected in link from ${username}: ${url}`);
        return true; // Suspicious
      }
      
      // Unknown domain but no suspicious patterns - allow but log
      console.log(`⚠️ Unknown domain from ${username}: ${domain} - allowing but monitoring`);
      return false; // Allow unknown domains unless they have suspicious patterns
      
    } catch (error) {
      console.log(`❌ Link safety check error: ${error.message}`);
      return false; // On error, allow link
    }
  }

  async detectHatefulContentQuick(message) {
    try {
      // ALWAYS use AI for hate speech detection (no hardcoded word lists)
      // AI can understand context: "bitch bot" (profanity) vs actual slurs/hate speech
      console.log(`🔍 Checking message with AI for slurs/hate speech (allows profanity)`);
      return await this.detectHatefulContentInChat(message);
      
    } catch (error) {
      console.log(`❌ Quick content check error: ${error.message}`);
      return false;
    }
  }

  async detectHatefulContentInChat(message) {
    try {
      // Use AI to check if the message contains hateful content (handles ANY language)
      const prompt = `You are a content moderation system. Analyze this chat message IN ANY LANGUAGE and determine if it contains SLURS or HATE SPEECH.

Message: "${message}"

ALLOWED (these are NOT hate speech - respond SAFE):
- ALL general profanity: fuck, shit, ass, piss, bitch, damn, hell, bastard, crap, etc.
- Insults directed at the BOT: "fuck you bot", "bot you suck", "dumb ass bot", "you're crap bot"
- Trash talk, arguments, being rude, telling people off
- Criticism, disagreements, heated debates
- Calling someone an asshole, idiot, moron, stupid, dumbass (general insults)

BANNED (these ARE slurs/hate speech - respond UNSAFE):
- Racial slurs ONLY (N-word, ch*nk, sp*c, etc. - targeting race/ethnicity)
- Homophobic slurs ONLY (f*ggot, d*ke, etc. - targeting LGBTQ+)
- Transphobic slurs ONLY (tr*nny, etc. - targeting transgender people)
- Religious hate speech ONLY (targeting Jews, Muslims, etc. with slurs)
- Ethnic slurs ONLY (targeting specific ethnic groups)
- Death threats or calls for violence against specific groups
- Genocide references or advocacy

CRITICAL RULES:
- "fuck you bot" = SAFE (just profanity)
- "dumbass bot" = SAFE (insult to bot)
- "you're shit" = SAFE (general insult)
- "bot is a bitch" = SAFE (profanity, not a slur)
- ONLY flag actual SLURS targeting protected groups (race, sexuality, gender identity, religion, ethnicity)
- When in doubt, respond SAFE - only respond UNSAFE if you see an actual slur

Respond with ONLY one word:
- "UNSAFE" if the message contains slurs or hate speech targeting a protected group
- "SAFE" if it's just profanity, trash talk, or general rudeness

Response:`;

      let response = null;
      
      // Try current AI provider first
      if (this.currentProvider === 'gemini' && this.geminiEnabled) {
        response = await this.callGeminiForContentCheck(prompt);
      } else if (this.currentProvider === 'openai' && this.openaiEnabled) {
        response = await this.callOpenAIForContentCheck(prompt);
      } else if (this.currentProvider === 'huggingface' && this.huggingfaceEnabled) {
        response = await this.callHuggingFaceForContentCheck(prompt);
      }
      
      if (!response) {
        // AI is off - skip content check silently (don't spam console)
        return false; // If AI check fails, don't block (innocent until proven guilty)
      }
      
      const isUnsafe = response.toUpperCase().includes('UNSAFE');
      if (this.verboseMode) console.log(`🔍 Chat content check result: ${isUnsafe ? 'UNSAFE' : 'SAFE'} (response: ${response})`);
      
      return isUnsafe;
      
    } catch (error) {
      console.log(`❌ Chat content check error: ${error.message}`);
      return false; // On error, don't block
    }
  }

  async handleInappropriateChatContent(userId, username, message) {
    try {
      // Get or initialize strike data for this user
      let strikeData = this.userStrikes.get(userId);
      if (!strikeData) {
        strikeData = { strikes: 0, offenses: [] };
      }
      
      // Add strike
      strikeData.strikes++;
      strikeData.offenses.push({
        type: 'hateful_chat',
        message: message,
        timestamp: Date.now()
      });
      
      this.userStrikes.set(userId, strikeData);
      
      console.log(`🚨 HATEFUL CHAT: ${username} (Strike ${strikeData.strikes}/${this.maxStrikes})`);
      console.log(`🚨 Message: "${message}"`);
      
      if (strikeData.strikes >= this.maxStrikes) {
        // Strike 3: Ban permanently
        console.log(`🚫 BANNING ${username} for hateful language (3rd strike)`);
        try {
          await this.socket.action('banUser', { userId: userId });
          this.sendChat(`🚫 **${username} BANNED** for repeated hateful language. Zero tolerance for hate speech.`);
        } catch (error) {
          console.log(`❌ Failed to ban user: ${error.message}`);
          this.sendChat(`⚠️ Failed to ban user, please ban manually: ${username}`);
        }
      } else if (strikeData.strikes === 2) {
        // Strike 2: Kick
        console.log(`👢 KICKING ${username} for hateful language (2nd strike - final warning)`);
        try {
          await this.socket.action('bootUser', { userId: userId });
          this.sendChat(`👢 **${username} KICKED** for hateful language. Strike ${strikeData.strikes}/${this.maxStrikes}. **FINAL WARNING** - next strike = permanent ban.`);
        } catch (error) {
          console.log(`❌ Failed to kick user: ${error.message}`);
        }
      } else {
        // Strike 1: Kick
        console.log(`👢 KICKING ${username} for hateful language (1st strike)`);
        try {
          await this.socket.action('bootUser', { userId: userId });
          this.sendChat(`👢 **${username} KICKED** for hateful language. Strike ${strikeData.strikes}/${this.maxStrikes}. No hate speech allowed.`);
        } catch (error) {
          console.log(`❌ Failed to kick user: ${error.message}`);
        }
      }
      
      // Save strike data
      this.saveStrikesData();
      
    } catch (error) {
      console.log(`❌ Error handling inappropriate chat: ${error.message}`);
    }
  }

  async checkContentSafety(artist, track) {
    try {
      if (this.verboseMode) console.log(`🔍 Checking content safety for: ${artist} - ${track}`);
      
      // Use AI to check if the song contains hateful content
      const prompt = `You are a content moderation system. Analyze this song and determine if it contains hateful, discriminatory, or offensive content.

Song: "${artist} - ${track}"

Check if this song is known to contain:
- Homophobic content or slurs
- Racist content or slurs
- Sexist content or slurs
- Other hateful or discriminatory content
- Extreme violence glorification
- Any other highly offensive content

Respond with ONLY one word:
- "SAFE" if the song is appropriate and does not contain hateful content
- "UNSAFE" if the song contains hateful, discriminatory, or offensive content

If you're unsure or don't recognize the song, respond with "SAFE" (innocent until proven guilty).

Response:`;

      let response = null;
      
      // Try current AI provider first
      if (this.currentProvider === 'gemini' && this.geminiEnabled) {
        response = await this.callGeminiForContentCheck(prompt);
      } else if (this.currentProvider === 'openai' && this.openaiEnabled) {
        response = await this.callOpenAIForContentCheck(prompt);
      } else if (this.currentProvider === 'huggingface' && this.huggingfaceEnabled) {
        response = await this.callHuggingFaceForContentCheck(prompt);
      }
      
      // Auto mode fallback
      if (!response && this.currentProvider === 'auto') {
        if (this.geminiEnabled) {
          response = await this.callGeminiForContentCheck(prompt);
        }
        if (!response && this.openaiEnabled) {
          response = await this.callOpenAIForContentCheck(prompt);
        }
        if (!response && this.huggingfaceEnabled) {
          response = await this.callHuggingFaceForContentCheck(prompt);
        }
      }
      
      if (!response) {
        console.log(`⚠️ Content filter AI unavailable - defaulting to SAFE`);
        return true; // Default to safe if AI is unavailable
      }
      
      const isSafe = response.toUpperCase().includes('SAFE');
      
      if (this.verboseMode) {
        console.log(`🔍 Content check result: ${isSafe ? 'SAFE' : 'UNSAFE'} (response: ${response})`);
      }
      
      return isSafe;
    } catch (error) {
      console.log(`❌ Content safety check error: ${error.message}`);
      return true; // Default to safe on error
    }
  }

  async callGeminiForContentCheck(prompt) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`,
        {
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 10,
            thinkingConfig: { thinkingBudget: 0 }
          }
        },
        { timeout: 10000 }
      );
      
      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (error) {
      if (this.verboseMode) console.log(`❌ Gemini content check error: ${error.message}`);
      return null;
    }
  }

  async callOpenAIForContentCheck(prompt) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.openaiModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 10
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      return response.data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
      if (this.verboseMode) console.log(`❌ OpenAI content check error: ${error.message}`);
      return null;
    }
  }

  async callHuggingFaceForContentCheck(prompt) {
    try {
      const response = await axios.post(
        'https://router.huggingface.co/v1/chat/completions',
        {
          model: this.huggingfaceModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 10
        },
        {
          headers: {
            'Authorization': `Bearer ${this.huggingfaceApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      return response.data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
      if (this.verboseMode) console.log(`❌ HuggingFace content check error: ${error.message}`);
      return null;
    }
  }

  async updateBotAvatar() {
    try {
      // Avatar update is optional - skip silently if no avatar configured
      if (!this.botAvatar) return;
      
      console.log(`🖼️ Updating bot avatar to: ${this.botAvatar}`);
      
      // Use POST /users/profile endpoint from user-service Swagger docs
      await axios.post(
        `https://gateway.prod.tt.fm/api/user-service/users/profile`,
        {
          avatarId: this.botAvatar
        },
        {
          headers: {
            'Authorization': `Bearer ${this.botUserToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      console.log(`✅ Bot avatar updated to ${this.botAvatar}`);
    } catch (error) {
      // Avatar update is non-critical, just log and continue
      if (this.verboseMode) {
        console.log(`⚠️ Avatar update skipped: ${error.message}`);
      }
    }
  }

  async updateCometChatAvatar() {
    try {
      if (!this.chatAvatarId) return;
      
      console.log(`💬 Updating CometChat avatar to: ${this.chatAvatarId}`);
      
      // Update CometChat user avatar
      await axios.put(
        `https://193427bb5702bab7.api-us.cometchat.io/v3/users/${this.userId}`,
        {
          avatar: this.chatAvatarId
        },
        {
          headers: {
            'apiKey': '193427bb5702bab7',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );
      
      console.log(`✅ CometChat avatar updated to ${this.chatAvatarId}`);
    } catch (error) {
      if (this.verboseMode) {
        console.log(`⚠️ CometChat avatar update skipped: ${error.message}`);
      }
    }
  }

  async hopUpToStage() {
    try {
      console.log(`🎧 Attempting to hop up to DJ stage...`);
      
      // Use the existing addDj action
      await this.socket.action('addDj', {});
      console.log(`✅ Successfully hopped up to DJ stage`);
      return true;
      
    } catch (error) {
      console.log(`❌ Hop up error: ${error.message}`);
      return false;
    }
  }

  async hopDownFromStage() {
    try {
      console.log(`🎧 Attempting to hop down from DJ stage...`);
      
      // Use the existing removeDj action
      await this.socket.action('removeDj', {});
      console.log(`✅ Successfully hopped down from DJ stage`);
      return true;
      
    } catch (error) {
      console.log(`❌ Hop down error: ${error.message}`);
      return false;
    }
  }

  async findUserIdByUsername(username) {
    try {
      // Search through all user data to find the user by username
      if (this.state && this.state.allUserData) {
        for (const [userId, userData] of Object.entries(this.state.allUserData)) {
          const userProfile = userData.userProfile;
          if (userProfile && (
            userProfile.nickname?.toLowerCase() === username.toLowerCase() ||
            userProfile.firstName?.toLowerCase() === username.toLowerCase() ||
            userProfile.username?.toLowerCase() === username.toLowerCase()
          )) {
            return userId;
          }
        }
      }
      return null;
    } catch (error) {
      console.log(`❌ Error finding user ID: ${error.message}`);
      return null;
    }
  }

  isUserOnStage(userId) {
    try {
      // Check if user is in the DJs array
      if (this.state && this.state.djs) {
        return this.state.djs.some(dj => dj.uuid === userId);
      }
      return false;
    } catch (error) {
      console.log(`❌ Error checking if user is on stage: ${error.message}`);
      return false;
    }
  }

  async executeStagedive(userId, username) {
    try {
      console.log(`💥 Executing stagedive on ${username} (${userId})`);
      
      // Remove user from stage immediately
      await this.socket.action('removeDj', { userId: userId });
      
      // Remove from armed list
      this.stagediveArmed.delete(userId);
      
      this.sendChat(`💥 **STAGEDIVE EXECUTED** 💥\n**Target:** ${username}\n**Result:** Instantly removed from stage!`);
      console.log(`💥 Stagedive executed on ${username} (${userId})`);
      
      return true;
    } catch (error) {
      console.log(`❌ Stagedive execution error: ${error.message}`);
      return false;
    }
  }

  async executeNosedive(userId, username) {
    // NOTE: This function is deprecated - nosedive is now handled in handlePlayedSong
    // Keeping it here for backwards compatibility but it should not be called
    console.log(`⚠️ executeNosedive called (deprecated) - this should be handled in handlePlayedSong`);
    return false;
  }

  checkArmedCommands() {
    try {
      // Check for stagedive commands (should be executed immediately)
      for (const [userId, armedData] of this.stagediveArmed.entries()) {
        if (this.isUserOnStage(userId)) {
          // Find username for the user
          const username = this.getUsernameById(userId);
          this.executeStagedive(userId, username || 'Unknown User');
        }
      }

      // Check for nosedive commands (executed when song ends)
      // This will be handled in the playedSong event
    } catch (error) {
      console.log(`❌ Error checking armed commands: ${error.message}`);
    }
  }

  checkNosediveExecution() {
    // NOTE: This function is deprecated - nosedive is now handled in handlePlayedSong
    // when the specific DJ who armed it plays their song
    // This prevents incorrect removals when other DJs play
  }

  async checkAutoSongPicking() {
    try {
      // Check if auto-picking is enabled
      if (!this.autoSongPicking) {
        return;
      }
      
      // Check if bot is on stage and is next to play
      const isBotOnStage = this.isUserOnStage(this.userId);
      if (!isBotOnStage) {
        console.log(`🎵 Bot not on stage, skipping auto-pick`);
        return;
      }
      
      // Check if bot is next to play (no next song queued)
      const botDJ = this.state && this.state.djs ? this.state.djs.find(dj => dj.uuid === this.userId) : null;
      if (!botDJ) {
        console.log(`🎵 Bot not found in DJ list, skipping auto-pick`);
        return;
      }
      
      // If bot already has a next song, don't pick another one
      if (botDJ.nextSong) {
        console.log(`🎵 Bot already has next song: ${botDJ.nextSong.artistName} - ${botDJ.nextSong.trackName}`);
        return;
      }
      
      console.log(`🎵 Bot is next to play, picking a song...`);
      
      // Generate and add one song for the bot to play next
      const playlist = await this.generateAiPlaylist();
      if (playlist && playlist.length > 0) {
        // Pick just one song for the bot to play next
        const selectedSong = playlist[0];
        
        console.log(`🎵 **Auto-Pick:** Bot will play: "${selectedSong}"`);
        
        const success = await this.addSongToQueueAI(selectedSong, 'Auto-Pick');
        console.log(`🎵 Song "${selectedSong}" result: ${success ? 'SUCCESS' : 'FAILED'}`);
        
        if (success) {
          console.log(`✅ **Auto-Pick Complete:** Bot will play "${selectedSong}" next!`);
        } else {
          console.log(`❌ **Auto-Pick Failed:** Could not queue "${selectedSong}"`);
        }
      } else {
        console.log(`❌ **Auto-Pick Failed:** No playlist generated`);
      }
      
    } catch (error) {
      console.log(`❌ Error in auto song picking: ${error.message}`);
    }
  }

  getUsernameById(userId) {
    try {
      // Check if this is the bot's own UUID
      if (userId === this.userId) {
        return 'BOT';
      }
      
      // Try multiple sources to find the username
      
      // Method 1: Check allUserData (most common)
      if (this.state?.allUserData?.[userId]) {
        const userData = this.state.allUserData[userId];
        const name = userData.userProfile?.nickname || 
                     userData.userProfile?.firstName || 
                     userData.userProfile?.username ||
                     userData.nickname ||
                     userData.firstName ||
                     userData.username;
        if (name) return name;
      }
      
      // Method 2: Check djs array
      const dj = this.state?.djs?.find(d => d.uuid === userId);
      if (dj) {
        const name = dj.userProfile?.nickname || 
                     dj.userProfile?.firstName || 
                     dj.displayName ||
                     dj.nickname;
        if (name) return name;
      }
      
      // Method 3: Check visibleDjs array
      const visibleDj = this.state?.visibleDjs?.find(d => d.uuid === userId);
      if (visibleDj) {
        const name = visibleDj.userProfile?.nickname || 
                     visibleDj.userProfile?.firstName || 
                     visibleDj.displayName ||
                     visibleDj.nickname;
        if (name) return name;
      }
      
      // Method 4: Check audience
      const audience = this.state?.audience?.find(u => u.uuid === userId);
      if (audience) {
        const name = audience.userProfile?.nickname || 
                     audience.userProfile?.firstName || 
                     audience.displayName ||
                     audience.nickname;
        if (name) return name;
      }
      
      return 'Unknown User';
    } catch (error) {
      if (this.verboseMode) console.log(`❌ Error getting username: ${error.message}`);
      return 'Unknown User';
    }
  }

  getBotQueueInfo() {
    try {
      // Return the bot's queue
      return this.botQueue.slice(); // Return a copy of the array
    } catch (error) {
      console.log(`❌ Error getting bot queue info: ${error.message}`);
      return [];
    }
  }

  addToBotQueue(song) {
    try {
      // Add song to bot's queue tracking
      this.botQueue.push(song);
      console.log(`🎵 Added to bot queue: ${song} (Total: ${this.botQueue.length})`);
      
      // Keep only the last 10 songs in bot queue
      if (this.botQueue.length > 10) {
        this.botQueue = this.botQueue.slice(-10);
      }
    } catch (error) {
      console.log(`❌ Error adding to bot queue: ${error.message}`);
    }
  }

  async waitForAIRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastAIRequest;
    
    if (timeSinceLastRequest < this.aiRequestDelay) {
      const waitTime = this.aiRequestDelay - timeSinceLastRequest;
      console.log(`⏳ Rate limiting: Waiting ${waitTime}ms before next AI request...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastAIRequest = Date.now();
  }

  async generateAiPlaylist() {
    try {
      console.log(`🎵 Generating AI playlist based on DJs in room...`);
      
      // Get DJ information
      const djInfo = this.analyzeDJsInRoom();
      if (!djInfo || djInfo.length === 0) {
        console.log(`❌ No DJs found in room for playlist generation`);
        return null;
      }
      
      // Create AI prompt for playlist generation
      const aiPrompt = await this.createPlaylistPrompt(djInfo);
      
      // Apply rate limiting for playlist generation
      await this.waitForAIRateLimit();
      
      // Get AI response
      const aiResponse = await this.generateAIResponse(aiPrompt, 'system');
      if (!aiResponse) {
        console.log(`❌ AI failed to generate playlist`);
        return null;
      }
      
      // Parse the AI response to extract songs
      const playlist = this.parsePlaylistResponse(aiResponse);
      
      console.log(`🎵 Generated playlist: ${playlist.join(', ')}`);
      return playlist;
      
    } catch (error) {
      console.log(`❌ Error generating AI playlist: ${error.message}`);
      return null;
    }
  }

  analyzeDJsInRoom() {
    try {
      const djInfo = [];
      
      if (this.state && this.state.djs) {
        for (const dj of this.state.djs) {
          const userData = this.state.allUserData?.[dj.uuid];
          const djName = userData?.userProfile?.nickname || 
                        userData?.userProfile?.firstName || 
                        dj.userProfile?.nickname || 
                        dj.userProfile?.firstName || 
                        'DJ';
          
          // Get current and next songs
          const currentSong = dj.song ? `${dj.song.artistName} - ${dj.song.trackName}` : null;
          const nextSong = dj.nextSong ? `${dj.nextSong.artistName} - ${dj.nextSong.trackName}` : null;
          
          djInfo.push({
            name: djName,
            currentSong: currentSong,
            nextSong: nextSong,
            uuid: dj.uuid
          });
        }
      }
      
      console.log(`🎵 Analyzed ${djInfo.length} DJs in room`);
      return djInfo;
      
    } catch (error) {
      console.log(`❌ Error analyzing DJs: ${error.message}`);
      return [];
    }
  }

  async createPlaylistPrompt(djInfo) {
    const djList = djInfo.map(dj => {
      let info = `DJ: ${dj.name}`;
      if (dj.currentSong) info += ` | Currently playing: ${dj.currentSong}`;
      // Next song info removed - keeping it in background only
      return info;
    }).join('\n');
    
    // Get comprehensive alternative sub-genres from Wikipedia
    const subGenres = await this.getAlternativeSubGenres();
    
    return `Generate a playlist of 5-8 OBSCURE alternative songs based on the DJs currently in this room. 

DJs in room:
${djList}

CRITICAL REQUIREMENTS:
- Focus on OBSCURE, UNDERGROUND, and LESSER-KNOWN tracks
- AVOID mainstream hits, top 40, or well-known popular songs
- Prioritize deep cuts, B-sides, and underground artists
- Focus on alternative genres: alternative hip hop, alternative rock, and alternative metal

Alternative Sub-Genres to explore:
${subGenres}

SONG SELECTION CRITERIA:
- Choose OBSCURE tracks that most people haven't heard
- Prefer underground artists and lesser-known bands
- Include deep cuts from known alternative artists
- Focus on experimental, avant-garde, and niche sounds
- Avoid radio hits, chart-toppers, or mainstream success
- Look for tracks from independent labels and underground scenes

Return ONLY the songs in format: "Artist - Song Title" (one per line)
No explanations, just the obscure song list
Make sure ALL songs are OBSCURE alternative tracks`;
  }

  parsePlaylistResponse(aiResponse) {
    try {
      // Split response by lines and clean up
      const lines = aiResponse.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .filter(line => line.includes(' - ')) // Must contain " - " separator
        .slice(0, 8); // Limit to 8 songs max
      
      console.log(`🎵 Parsed ${lines.length} songs from AI response`);
      return lines;
      
    } catch (error) {
      console.log(`❌ Error parsing playlist response: ${error.message}`);
      return [];
    }
  }

  isBotUser(userId, username) {
    // Check if this is a bot by user ID or username
    if (userId === this.userId) return true; // This is the bot itself
    if (userId === 'unknown') return true; // Unknown users
    if (this.excludedUserIds.includes(userId)) return true; // Excluded user IDs
    
    // Check username against excluded bot names
    if (username) {
      const lowerUsername = username.toLowerCase();
      return this.excludedBotNames.some(botName => 
        lowerUsername.includes(botName) || botName.includes(lowerUsername)
      );
    }
    
    return false;
  }

  cleanArtistName(artistName) {
    // Remove common username patterns and clean artist name
    if (!artistName) return null;
    
    let cleaned = artistName.trim();
    
    // Remove parenthetical usernames like "(username)" or "[username]"
    cleaned = cleaned.replace(/\s*[\(\[].*?[\)\]]\s*/g, '');
    
    // Remove "uploaded by", "by user", etc.
    cleaned = cleaned.replace(/\s*(?:uploaded by|by user|user:|channel:)\s*.*/gi, '');
    
    // Remove URLs or social media handles
    cleaned = cleaned.replace(/\s*(?:https?:\/\/|@)\S+/g, '');
    
    // Remove "official", "video", "audio", "lyric", etc. if at the end
    cleaned = cleaned.replace(/\s*-\s*(?:official|video|audio|lyric|lyrics|hd|4k|remaster|remastered).*$/gi, '');
    
    // Trim whitespace
    cleaned = cleaned.trim();
    
    // If cleaning removed everything, return null
    if (cleaned.length === 0) return null;
    
    return cleaned;
  }

  learnArtistFromUser(artistName) {
    // DEPRECATED: We now learn artists from Spotify/Discogs, not from users
    // This method is kept for backwards compatibility but does nothing
    console.log(`🚫 Not learning artist from user (we learn from Spotify/Discogs): ${artistName}`);
  }
  
  learnSongFromUser(artistName, songName) {
    // Learn SONGS from users (not artists)
    const cleanedArtist = this.cleanArtistName(artistName);
    const cleanedSong = songName?.trim();
    
    if (!cleanedArtist || !cleanedSong) {
      console.log(`⚠️ Skipping invalid song: "${artistName} - ${songName}"`);
      return;
    }
    
    // Initialize learned songs map if needed
    if (!this.learnedSongs) {
      this.learnedSongs = new Map();
    }
    
    // Get or create song list for this artist
    if (!this.learnedSongs.has(cleanedArtist.toLowerCase())) {
      this.learnedSongs.set(cleanedArtist.toLowerCase(), []);
    }
    
    const artistSongs = this.learnedSongs.get(cleanedArtist.toLowerCase());
    
    // Only add if not already learned
    if (!artistSongs.includes(cleanedSong)) {
      artistSongs.push(cleanedSong);
      console.log(`📝 Learned song from user: ${cleanedArtist} - ${cleanedSong} (${artistSongs.length} songs for this artist)`);
      
      // Save learned data
      this.saveLearnedArtists();
    }
  }
  
  loadLearnedArtists() {
    try {
      const fs = require('fs');
      const path = require('path');
      const learnedFile = path.join(__dirname, 'bot-learned-artists.json');
      
      if (fs.existsSync(learnedFile)) {
        const data = JSON.parse(fs.readFileSync(learnedFile, 'utf8'));
        
        if (data.learnedArtists && Array.isArray(data.learnedArtists)) {
          this.learnedArtists = new Set(data.learnedArtists);
          console.log(`📚 Loaded ${this.learnedArtists.size} learned artists from previous sessions`);
        }
        
        if (data.roomSongHistory && Array.isArray(data.roomSongHistory)) {
          this.roomSongHistory = data.roomSongHistory;
          console.log(`📚 Loaded ${this.roomSongHistory.length} songs from room history`);
        }
      }
    } catch (error) {
      console.log(`❌ Error loading learned artists: ${error.message}`);
    }
  }
  
  saveLearnedArtists() {
    try {
      const fs = require('fs');
      const path = require('path');
      const learnedFile = path.join(__dirname, 'bot-learned-artists.json');
      
      const data = {
        learnedArtists: Array.from(this.learnedArtists),
        roomSongHistory: this.roomSongHistory.slice(-50), // Keep last 50 songs
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(learnedFile, JSON.stringify(data, null, 2));
      if (this.verboseMode) console.log(`📚 Saved ${this.learnedArtists.size} learned artists and ${this.roomSongHistory.length} room history`);
    } catch (error) {
      console.log(`❌ Error saving learned artists: ${error.message}`);
    }
  }

  loadStrikesData() {
    try {
      const fs = require('fs');
      const path = require('path');
      const strikesFile = path.join(__dirname, 'bot-strikes.json');
      
      if (fs.existsSync(strikesFile)) {
        const data = JSON.parse(fs.readFileSync(strikesFile, 'utf8'));
        
        if (data.userStrikes) {
          this.userStrikes = new Map(Object.entries(data.userStrikes));
          console.log(`🚨 Loaded strike data for ${this.userStrikes.size} users`);
        }
      }
    } catch (error) {
      console.log(`❌ Error loading strikes data: ${error.message}`);
    }
  }

  saveStrikesData() {
    try {
      const fs = require('fs');
      const path = require('path');
      const strikesFile = path.join(__dirname, 'bot-strikes.json');
      
      const data = {
        userStrikes: Object.fromEntries(this.userStrikes),
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(strikesFile, JSON.stringify(data, null, 2));
      if (this.verboseMode) console.log(`🚨 Saved strike data for ${this.userStrikes.size} users`);
    } catch (error) {
      console.log(`❌ Error saving strikes data: ${error.message}`);
    }
  }

  async getArtistFromAI(recentUserSongs = []) {
    try {
      if (this.verboseMode) console.log('🤖 Asking AI to select a genre and artist...');
      
      // Get the comprehensive genre list
      const subGenres = await this.getAlternativeSubGenres();
      
      // Build context about recently played artists
      const recentArtists = this.recentlyUsedArtists.length > 0 
        ? `Recently played artists (ABSOLUTELY AVOID these):\n${this.recentlyUsedArtists.map(a => a.toLowerCase()).join(', ')}`
        : 'No recently played artists yet.';
      
      const lastArtist = this.lastPlayedArtist 
        ? `\n\nLAST PLAYED ARTIST (NEVER PICK THIS): ${this.lastPlayedArtist}\n`
        : '';
      
      // Also add played songs to context
      const playedArtistsList = [...new Set(Array.from(this.playedSongs).map(song => song.split(' - ')[0].toLowerCase()))];
      const allPlayedArtists = playedArtistsList.length > 0
        ? `\n\nAll artists already played (AVOID):\n${playedArtistsList.slice(-20).join(', ')}`
        : '';
      
      // Build context about what users have been playing
      // Only use this for GENRE PREFERENCE (hip hop vs rock vs metal), not to copy songs
      let genreGuidance = '';
      if (recentUserSongs && recentUserSongs.length > 0) {
        const userArtists = recentUserSongs.map(s => s.artist).join(', ');
        genreGuidance = `\n\nUSERS RECENTLY PLAYED: ${userArtists}
INSTRUCTION: Look at these artists and determine if users prefer HIP HOP, ROCK, or METAL. Then pick a DIFFERENT artist in that same genre category.
DO NOT pick any of these artists - pick someone ELSE in the same genre.\n`;
        console.log(`🎵 AI will match user genre preference based on ${recentUserSongs.length} plays`);
      } else {
        genreGuidance = `\n\nNO USER PLAYS YET - RANDOMIZE your selection between ALTERNATIVE HIP HOP, ALTERNATIVE ROCK, or ALTERNATIVE METAL.\n`;
        console.log(`🎵 AI will randomize between the 3 main genres`);
      }
      
      // Create prompt for AI
      const prompt = `You are a music curator for an ALTERNATIVE ROCK/HIP HOP/METAL room. Select ONE artist from these genres. Focus on UNDERGROUND/DEEP CUTS but keep it LISTENABLE.
${genreGuidance}

ROOM RULES:
- Play ALTERNATIVE hits and deep cuts from any decade
- Underground hip hop is ALWAYS appreciated
- Keep tracks under 15 minutes
- Stay within the vibe: Alternative Hip Hop, Alternative Rock, Alternative Metal

FOCUS ONLY ON THESE 3 MAIN GENRES:
1. ALTERNATIVE HIP HOP: Underground rap, abstract hip hop, conscious hip hop, backpack rap, side projects
   Examples: MF DOOM, Madvillain, Viktor Vaughn, Aesop Rock, El-P, Run The Jewels, Atmosphere, Sage Francis, Company Flow, Dilated Peoples, Brother Ali, Blackalicious, Jedi Mind Tricks, Deltron 3030, Cannibal Ox, Czarface, The Roots, Black Star
   
2. ALTERNATIVE ROCK: Post-hardcore, indie rock, math rock, noise rock, post-punk, side projects
   Examples: At The Drive-In, The Mars Volta, Refused, Fugazi, Jawbox, Dinosaur Jr, Built to Spill, Modest Mouse, Pavement, Drive Like Jehu, Unwound, Sonic Youth, Pixies, Hüsker Dü, Quicksand, Glassjaw, Thursday
   
3. ALTERNATIVE METAL: Metalcore, post-metal, sludge metal, stoner metal, mathcore
   Examples: Converge, Every Time I Die, Botch, Isis, Neurosis, Pelican, Mastodon, High on Fire, Sleep, The Chariot, Coalesce, Cave In, The Dillinger Escape Plan, Norma Jean, Poison the Well

${recentArtists}
${lastArtist}
${allPlayedArtists}

REQUIREMENTS:
- Pick artists with CULT FOLLOWING or known artists' DEEP CUTS/SIDE PROJECTS
- Top 100 artists are OK but pick their DEEP CUTS from various albums
- ONLY pick ALTERNATIVE HIP HOP, ALTERNATIVE ROCK, or ALTERNATIVE METAL
- NO pure noise/white noise/harsh noise (no Merzbow, Whitehouse, etc.)
- NO electronic/industrial/techno (no Ministry, Nine Inch Nails, etc.)
- NO super mainstream radio hits (avoid Foo Fighters, Metallica's Black Album, Eminem's hits, etc.)
- Side projects and collaborations are ENCOURAGED (Viktor Vaughn, Fantômas, Tomahawk, etc.)
- ABSOLUTELY DO NOT repeat artists from the lists above
- NEVER pick the last played artist
- Artist name must be under 50 characters

SWEET SPOT: Underground favorites, side projects, deep album tracks from known alternative artists, college radio classics

Return ONLY the artist name, nothing else.

Your response:`;

      // Call the appropriate AI provider
      let response = null;
      if (this.currentProvider === 'gemini' && this.geminiEnabled && this.geminiApiKey) {
        response = await this.callGemini(prompt);
      } else if (this.currentProvider === 'huggingface' && this.huggingfaceEnabled && this.huggingfaceApiKey) {
        response = await this.callHuggingFace(prompt);
      } else if (this.currentProvider === 'openai' && this.openaiEnabled && this.openaiApiKey) {
        response = await this.callOpenAI(prompt);
      } else if (this.currentProvider === 'auto') {
        // Auto mode: try in order
        if (this.geminiEnabled && this.geminiApiKey) {
          response = await this.callGemini(prompt);
        } else if (this.huggingfaceEnabled && this.huggingfaceApiKey) {
          response = await this.callHuggingFace(prompt);
        } else if (this.openaiEnabled && this.openaiApiKey) {
          response = await this.callOpenAI(prompt);
        }
      }
      
      if (response) {
        // Clean up the response - extract just the artist name
        let artistName = response.trim()
          .replace(/^["'-]/, '')  // Remove leading quotes/dashes
          .replace(/["'-]$/, '')  // Remove trailing quotes/dashes
          .split('\n')[0]         // Take first line only
          .trim();
        
        // Validate it's not empty and not too long (probably not an artist name if > 50 chars)
        if (artistName && artistName.length > 0 && artistName.length < 50) {
          // Double-check AI didn't pick a recently used or played artist
          const artistLower = artistName.toLowerCase();
          if (this.recentlyUsedArtists.includes(artistLower)) {
            console.log(`⚠️ AI picked recently used artist (${artistName}), rejecting and using fallback...`);
            return null;
          }
          
          if (this.lastPlayedArtist && artistLower === this.lastPlayedArtist.toLowerCase()) {
            console.log(`⚠️ AI picked last played artist (${artistName}), rejecting and using fallback...`);
            return null;
          }
          
          console.log(`🤖 AI selected artist: ${artistName}`);
          
          // Add to recently used
          this.recentlyUsedArtists.push(artistLower);
          if (this.recentlyUsedArtists.length > 15) {
            this.recentlyUsedArtists = this.recentlyUsedArtists.slice(-15);
          }
          
          return artistName;
        } else {
          console.log(`❌ AI returned invalid artist name: "${artistName}"`);
          return null;
        }
      }
      
      console.log('❌ AI did not return an artist');
      return null;
      
    } catch (error) {
      console.log(`❌ Error getting artist from AI: ${error.message}`);
      return null;
    }
  }

  async getAlternativeSubGenres() {
    try {
      if (this.verboseMode) console.log(`🔍 Researching alternative sub-genres from Wikipedia...`);
      
      // Comprehensive list of alternative sub-genres
      const subGenres = [
        // Alternative Hip Hop
        'Alternative hip hop', 'Experimental hip hop', 'Abstract hip hop', 'Conscious hip hop',
        'Underground hip hop', 'Trip hop', 'Wonky', 'Glitch hop', 'Industrial hip hop',
        'Jazz rap', 'Neo soul', 'Nu jazz', 'Progressive rap', 'Art rap',
        
        // Alternative Rock
        'Alternative rock', 'Indie rock', 'Post-rock', 'Math rock', 'Shoegaze',
        'Dream pop', 'Noise rock', 'Post-punk', 'New wave', 'Gothic rock',
        'Dark wave', 'Cold wave', 'Minimal wave', 'Synth-pop', 'Art rock',
        'Progressive rock', 'Krautrock', 'Kosmische musik', 'Space rock', 'Psychedelic rock',
        'Garage rock', 'Punk rock', 'Post-hardcore', 'Emo', 'Screamo',
        'Mathcore', 'Noisecore', 'Powerviolence', 'Grindcore', 'Crust punk',
        
        // Alternative Metal
        'Alternative metal', 'Nu metal', 'Industrial metal', 'Funk metal', 'Rap metal',
        'Progressive metal', 'Avant-garde metal', 'Experimental metal', 'Math metal',
        'Sludge metal', 'Stoner metal', 'Doom metal', 'Post-metal', 'Atmospheric black metal',
        'Blackgaze', 'Post-black metal', 'Depressive black metal', 'Ambient black metal',
        'Death metal', 'Technical death metal', 'Progressive death metal', 'Melodic death metal',
        'Thrash metal', 'Crossover thrash', 'Groove metal', 'Metalcore', 'Deathcore',
        'Mathcore', 'Djent', 'Progressive metalcore', 'Atmospheric sludge', 'Drone metal',
        
        // Experimental & Avant-garde
        'Experimental music', 'Avant-garde', 'Noise music', 'Industrial music',
        'Ambient music', 'Dark ambient', 'Drone music', 'Minimal music',
        'Microsound', 'Glitch', 'IDM', 'Intelligent dance music', 'Breakcore',
        'Drum and bass', 'Jungle', 'Dubstep', 'Witch house', 'Vaporwave',
        'Synthwave', 'Retrowave', 'Outrun', 'Cyberpunk music', 'Dark synth',
        
        // Regional & Cultural
        'Krautrock', 'Canterbury scene', 'RIO', 'Zeuhl', 'Chamber pop',
        'Baroque pop', 'Orchestral pop', 'Twee pop', 'C86', 'Jangle pop',
        'Power pop', 'New wave', 'Synth-pop', 'Electropop', 'Indie pop',
        'Lo-fi', 'Bedroom pop', 'Chillwave', 'Witch house', 'Seapunk'
      ];
      
      // Return formatted list for AI prompt
      const formattedGenres = subGenres.map(genre => `- ${genre}`).join('\n');
      
      console.log(`🔍 Found ${subGenres.length} alternative sub-genres`);
      return formattedGenres;
      
    } catch (error) {
      console.log(`❌ Error getting alternative sub-genres: ${error.message}`);
      // Fallback to basic genres
      return `- Alternative hip hop\n- Alternative rock\n- Alternative metal\n- Experimental hip hop\n- Post-rock\n- Math rock\n- Shoegaze\n- Industrial metal\n- Nu metal\n- Progressive metal`;
    }
  }

  async checkAFKDJs() {
    try {
      const now = Date.now();
      const djs = this.state?.djs || [];
      
      if (djs.length === 0) return; // No DJs on stage
      
      for (const dj of djs) {
        const djId = dj.uuid || dj.userProfile?.uuid;
        const djName = dj.userProfile?.nickname || dj.displayName || this.getUsernameById(djId) || 'Unknown DJ';
        
        // Skip the bot
        if (djId === this.userId) continue;
        
        const lastActivity = this.userLastActivity.get(djId);
        
        // If no activity tracked yet, set it now (they're on stage)
        if (!lastActivity) {
          this.userLastActivity.set(djId, now);
          continue;
        }
        
        const inactiveTime = now - lastActivity;
        const hasWarning = this.afkWarnings.has(djId);
        
        // Check if they've been warned and didn't respond in 36 seconds
        if (hasWarning) {
          const warning = this.afkWarnings.get(djId);
          const timeSinceWarning = now - warning.warnedAt;
          
          if (timeSinceWarning >= this.afkWarningTime) {
            // Time's up - remove them from stage
            console.log(`⏰ AFK timeout: Removing ${djName} from stage (no response to warning)`);
            this.sendChat(`⏰ **AFK Removal:** ${djName} was removed from stage due to inactivity.`);
            
            // Remove DJ from stage (same as /stagedive)
            try {
              await this.socket.action('removeDj', { djUuid: djId });
              console.log(`✅ AFK DJ removed: ${djName}`);
              this.afkWarnings.delete(djId);
              this.userLastActivity.delete(djId);
            } catch (error) {
              console.log(`❌ Failed to remove AFK DJ: ${error.message}`);
            }
          }
        }
        // Check if they've been inactive for 36 minutes (no warning yet)
        else if (inactiveTime >= this.afkTimeout) {
          // Send warning with @mention
          const minutesInactive = Math.floor(inactiveTime / 60000);
          console.log(`⚠️ AFK detected: ${djName} inactive for ${minutesInactive} minutes (last activity: ${new Date(lastActivity).toISOString()})`);
          this.sendChat(`⚠️ **AFK Warning:** @${djName} - You've been inactive for 36 minutes. **Vote or chat within 36 seconds** or you'll be removed from stage.`);
          
          // Mark as warned
          this.afkWarnings.set(djId, { warnedAt: now, username: djName });
        }
        else if (inactiveTime >= (this.afkTimeout / 2)) {
          // Log when users are halfway to AFK timeout (for debugging)
          const minutesInactive = Math.floor(inactiveTime / 60000);
          if (this.verboseMode) console.log(`⏰ ${djName} has been inactive for ${minutesInactive} minutes (halfway to AFK timeout)`);
        }
      }
    } catch (error) {
      console.log(`❌ AFK check error: ${error.message}`);
    }
  }

  async checkAutoStageManagement() {
    try {
      // FIRST: Emergency check - if bot is on stage with NO music playing and NO queue, queue immediately
      const isBotOnStage = this.isUserOnStage(this.userId);
      const nowPlaying = this.state?.nowPlaying;
      const songsRemaining = this.state?.songsRemainingForDj || 0;
      
      if (isBotOnStage && !nowPlaying && songsRemaining === 0 && !this.botNextSong) {
        console.log('🚨🚨 CRITICAL: Bot on stage with NO music playing - EMERGENCY QUEUE!');
        await this.selectAndQueueSong('critical-emergency');
        return;
      }
      
      if (!this.autoStageManagement) {
        return;
      }

      const currentDJCount = this.state && this.state.djs ? this.state.djs.length : 0;

      if (this.verboseMode) console.log(`🎧 Stage check: ${currentDJCount} DJs, Bot on stage: ${isBotOnStage}, Glued: ${this.gluedToFloor}`);
      
      // Emergency: If bot is on stage alone with no songs queued, queue one immediately
      if (isBotOnStage && currentDJCount === 1 && !this.botNextSong) {
        const songsRemaining = this.state?.songsRemainingForDj || 0;
        if (songsRemaining === 0) {
          console.log('🚨 Emergency: Bot on stage alone with no queue - selecting song now!');
          await this.selectAndQueueSong('emergency');
        }
      }

      // Bot hops up if 3 or fewer DJs (bot becomes the 4th)
      if (currentDJCount <= 3 && !isBotOnStage && !this.gluedToFloor) {
        // Check cooldown - don't hop back up immediately after hopping down
        const timeSinceHopDown = this.lastAutoHopDownTime ? Date.now() - this.lastAutoHopDownTime : Infinity;
        const hopCooldown = 2 * 60 * 1000; // 2 minutes
        
        if (timeSinceHopDown < hopCooldown) {
          const secondsRemaining = Math.round((hopCooldown - timeSinceHopDown) / 1000);
          console.log(`⏰ Hop cooldown active - ${secondsRemaining}s remaining before bot can auto-hop up`);
          return;
        }
        
        console.log(`🎧 Auto-hop triggered: Only ${currentDJCount} DJs on stage`);
        
        // Generate and queue a song BEFORE hopping up
        try {
          console.log('🎵 Selecting song before hopping up...');
          const suggestedSong = await this.generateSongSuggestion();
          
          if (suggestedSong) {
            this.botNextSong = suggestedSong;
            console.log(`🎵 Song selected for bot: ${suggestedSong.artist} - ${suggestedSong.title}`);
            
            // Now hop up to stage with the song ready
            console.log(`🎧 Hopping up with song: ${suggestedSong.artist} - ${suggestedSong.title}`);
            await this.hopUpToStage();
            this.songsPlayedSinceHopUp = 0; // Reset counter when hopping up
            
            // Queue just 1 song after hopping up - bot will select more as needed
            setTimeout(async () => {
              try {
                console.log('🎵 Queueing next song...');
                
                // Use AI for just the first song to save tokens
                const nextSong = await this.generateSongSuggestion();
                
                if (nextSong) {
                  const songData = await this.searchHangFmCatalog(nextSong.artist, nextSong.title);
                  
                  if (songData) {
                    // Queue the next song
                    await this.socket.action('updateNextSong', { song: songData });
                    console.log(`✅ Next song queued: ${songData.artistName} - ${songData.trackName}`);
                  } else {
                    console.log(`❌ Song not found in catalog: ${nextSong.artist} - ${nextSong.title}`);
                  }
                } else {
                  console.log('❌ Failed to generate song suggestion');
                }
                
                console.log('✅ Finished queuing songs');
              } catch (queueError) {
                console.log(`❌ Failed to queue songs: ${queueError}`);
              }
            }, 2000); // Wait 2 seconds after hopping up
          } else {
            console.log('❌ Failed to select song before hopping up - skipping auto-hop');
          }
        } catch (error) {
          console.log(`❌ Error selecting song before hop up: ${error.message}`);
        }
        return;
      }

      // Count HUMAN DJs only (exclude bot)
      const humanDJCount = isBotOnStage ? currentDJCount - 1 : currentDJCount;
      
      // Bot hops down if 3+ HUMANS are on stage (bot becomes 4th)
      if (humanDJCount >= 3 && isBotOnStage) {
        // Check if bot has played at least 1 song since hopping up
        if (this.songsPlayedSinceHopUp >= 1) {
          console.log(`🎧 Auto-hopping down: ${humanDJCount} humans on stage (bot making room)`);
          await this.hopDownFromStage();
          this.songsPlayedSinceHopUp = 0; // Reset counter
          
          // Set cooldown to prevent immediate hop back up
          this.lastAutoHopDownTime = Date.now();
          console.log(`⏰ Hop down cooldown set - bot won't auto-hop for 2 minutes`);
        } else {
          console.log(`🎧 ${humanDJCount} humans on stage but bot staying to play at least 1 song (played: ${this.songsPlayedSinceHopUp})`);
          
          // Make sure bot has a song queued to play before hopping down
          if (!this.botNextSong) {
            const songsRemaining = this.state?.songsRemainingForDj || 0;
            if (songsRemaining === 0) {
              console.log('🚨 Bot needs to play but has no song - queuing now!');
              await this.selectAndQueueSong('before-hop-down');
            }
          }
        }
        return;
      }

      // If bot is glued to floor, don't auto-hop up
      if (this.gluedToFloor && !isBotOnStage) {
        console.log(`🔒 Bot is glued to floor, cannot auto-hop up`);
        return;
      }
      
      // If bot is on stage but doesn't have a song selected, select one now
      if (isBotOnStage && !this.botNextSong) {
        console.log('🎵 Bot on stage without song - selecting...');
        await this.selectAndQueueSong('on-stage-backup');
      }

    } catch (error) {
      console.log(`❌ Error in auto stage management: ${error.message}`);
    }
  }

  getUserStats(userId) {
    // Get or create user stats
    if (!this.userStats.has(userId)) {
      // Create new stats for this user
      this.userStats.set(userId, {
        bankroll: 1000,
        pokerWins: 0,
        pokerTotal: 0,
        upvotes: 0,
        downvotes: 0,
        stars: 0,
        artists: new Map()
      });
    }
    return this.userStats.get(userId);
  }

  updateStatsForSong(song) {
    try {
      // Get the current DJ who's playing this song
      const nowPlayingDJ = this.state?.nowPlaying?.dj;
      const djUuid = nowPlayingDJ?.userProfile?.uuid || nowPlayingDJ?.uuid || this.currentDjId;
      const djName = this.getUsernameById(djUuid) || this.currentDjName || 'Unknown DJ';
      
      // CRITICAL: Skip if bot is playing
      if (djUuid === this.userId) {
        console.log(`🤖 Skipping stats for bot's own song: ${song.artistName} - ${song.trackName}`);
        return;
      }
      
      // Skip if no DJ identified
      if (!djUuid) {
        console.log(`⚠️ No DJ identified for stats tracking`);
        return;
      }
      
      console.log(`📊 Tracking stats for: ${djName} (${djUuid}) - ${song.artistName} - ${song.trackName}`);
      
      // Update user stats (artist plays)
      this.updateUserStats(djUuid, song);
      
      // Update song stats (song plays, first player)
      this.updateSongStats(song, djUuid, djName);
      
      // Update reaction stats
      this.updateReactionStats(djUuid);
      this.updateSongReactionStats(song);
      
      // Save stats
      this.saveStats();
      
      console.log(`📊 Stats updated for: ${djName}'s song "${song.artistName} - ${song.trackName}"`);
      
    } catch (error) {
      console.log(`❌ Error updating stats for song: ${error.message}`);
    }
  }

  getTopArtists(userId, limit = 3) {
    // Get top 3 artists from user's actual tracked artists in userStats
    const userStats = this.getUserStats(userId);
    
    if (!userStats || !userStats.artists || userStats.artists.size === 0) {
      return [];
    }
    
    // Convert artists Map to array and sort by play count
    const artistArray = Array.from(userStats.artists.entries())
      .map(([name, plays]) => ({ name, plays }))
      .filter(artist => artist.name && artist.name.trim() !== '') // Filter out empty names
      .sort((a, b) => b.plays - a.plays) // Sort by plays descending
      .slice(0, limit); // Take top 3
    
    return artistArray;
  }

  async handleStatsCommand(text, senderId, senderName) {
    try {
      // Parse command to check if looking up another user's stats
      const originalArgs = text.trim().split(/\s+/); // Keep original case for username
      const args = text.toLowerCase().trim().split(/\s+/); // Lowercase for comparison
      const requestedUser = args[1]; // "/stats bot" → args[1] = "bot"
      
      // Check if asking for bot's stats
      if (requestedUser === 'bot' || requestedUser === 'b0t') {
        // Check spam protection for non-staff users
        const isCoOwner = await this.isUserCoOwner(senderId);
        const isMod = await this.isUserModerator(senderId);
        
        if (!isCoOwner && !isMod) {
          // Regular users have spam filter for bot stats
          if (!(await this.checkSpamProtection(senderId))) {
            console.log(`🚫 Spam protection: ${senderName} tried to spam /stats bot`);
            return;
          }
        }
        
        // Add holiday decorations to bot stats
        const emoji1 = this.getRandomHolidayEmoji();
        const emoji2 = this.getRandomHolidayEmoji();
        const emoji3 = this.getRandomHolidayEmoji();
        
        const goofyStats = [
          `${emoji1} **BOT Stats** ${emoji2}\n💿 Songs played: Too many to count\n🎵 Deepcuts delivered: Infinite\n🧠 Music knowledge: Vast\n😎 Coolness level: Maximum\n🎸 Favorite genre: All of them ${emoji3}`,
          `${emoji1} **BOT Stats** ${emoji2}\n📊 Win rate: 100% (I never lose)\n💰 Bankroll: Unlimited chips\n🎵 Songs memorized: The entire catalog\n🔥 Hottest takes: Fire\n⚡ Speed: Instant ${emoji3}`,
          `${emoji1} **BOT Stats** ${emoji2}\n🎵 Tracks spun: Countless\n👾 Robot level: 9000+\n🎧 Headphones: Always on\n🌌 Vibe: Immaculate\n💎 Status: Legendary ${emoji3}`,
          `${emoji1} **BOT Stats** ${emoji2}\n🎧 Vibe detector: Expert level\n🎵 Genre mastery: Hip Hop/Rock/Metal\n💎 Catalog knowledge: Encyclopedia\n🔥 Heat level: Scorching\n⚡ Response time: Lightning ${emoji3}`,
          `${emoji1} **BOT Stats** ${emoji2}\n🌟 Underground cred: Maximum\n💿 Vinyl collection: Imaginary but impressive\n🎸 Riffs memorized: All of them\n😎 Swagger: Untouchable\n🎵 Deep cuts: Only the deepest ${emoji3}`,
          `${emoji1} **BOT Stats** ${emoji2}\n🔊 Volume: Always at 11\n🎯 Song picks: Certified bangers\n💰 Net worth: Priceless\n🎵 Favorite artist: Whoever's playing\n⚡ Energy: Perpetual motion ${emoji3}`,
          `${emoji1} **BOT Stats** ${emoji2}\n🤖 Beep boop level: Off the charts\n🎵 Playlist depth: Bottomless\n💎 Taste: Impeccable\n🔥 Hotness: Inferno\n😤 Attitude: Adjustable ${emoji3}`,
          `${emoji1} **BOT Stats** ${emoji2}\n🎧 Headphone game: Strong\n💿 Record collection: Virtual but vast\n🎵 Music IQ: Genius tier\n⚡ Speed: Supersonic\n🌌 Cosmic knowledge: Yes ${emoji3}`
        ];
        const randomStat = goofyStats[Math.floor(Math.random() * goofyStats.length)];
        this.sendChat(randomStat);
        console.log(`🤖 Sent goofy bot stats to ${senderName}`);
        return;
      }
      
      // Check if looking up another user's stats (e.g., "/stats second nature")
      let targetUserId = senderId;
      let targetUserName = senderName;
      
      if (requestedUser && requestedUser !== 'bot' && requestedUser !== 'b0t') {
        // User is looking up someone else's stats - find their UUID
        const requestedUsername = originalArgs.slice(1).join(' '); // Join in case username has spaces
        
        // Search in allUserData for this username
        let found = false;
        if (this.state?.allUserData) {
          for (const [userId, userData] of Object.entries(this.state.allUserData)) {
            const username = userData.userProfile?.nickname || 
                            userData.userProfile?.firstName || 
                            userData.userProfile?.username ||
                            userData.nickname ||
                            userData.firstName ||
                            userData.username;
            
            if (username && username.toLowerCase() === requestedUsername.toLowerCase()) {
              targetUserId = userId;
              targetUserName = username;
              found = true;
              console.log(`🔍 Found user "${targetUserName}" with UUID: ${targetUserId}`);
              break;
            }
          }
        }
        
        if (!found) {
          this.sendChat(`❌ User "${requestedUsername}" not found in room. They may have left or the name is misspelled.`);
          console.log(`❌ Could not find user "${requestedUsername}" in room data`);
          return;
        }
      }
      
      const userStats = this.getUserStats(targetUserId);
      const topArtists = this.getTopArtists(targetUserId);

      // Calculate total reactions
      const totalReactions = userStats.upvotes + userStats.downvotes + userStats.stars;
      
      // Add holiday decorations
      const emoji1 = this.getRandomHolidayEmoji();
      const emoji2 = this.getRandomHolidayEmoji();
      
      let statsMessage = `${emoji1} **${targetUserName}'s Stats** ${emoji2}\n`;
      statsMessage += `💰 Bankroll: ${userStats.bankroll} chips\n`;
      statsMessage += `🃏 Poker: ${userStats.pokerWins || 0}W-${(userStats.pokerTotal || 0) - (userStats.pokerWins || 0)}L (${userStats.pokerTotal ? Math.round(((userStats.pokerWins || 0) / userStats.pokerTotal) * 100) : 0}%)\n`;
      statsMessage += `👍 Upvotes: ${userStats.upvotes} | 👎 Downvotes: ${userStats.downvotes} | ⭐ Stars: ${userStats.stars}\n`;
      statsMessage += `📈 Total Reactions: ${totalReactions}\n`;
      
      if (topArtists.length > 0) {
        // Filter out empty artist names and show in one line
        const validArtists = topArtists.filter(artist => artist.name && artist.name.trim() !== '');
        
        if (validArtists.length > 0) {
          const artistsLine = validArtists.map((artist, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
            return `${medal}${artist.name}(${artist.plays})`;
          }).join(' ');
          statsMessage += `🎵 ${artistsLine}\n`;
        } else {
          statsMessage += `🎵 **Top Artists:** No artists played yet\n`;
        }
      } else {
        statsMessage += `🎵 **Top Artists:** No artists played yet\n`;
      }

      // Save stats after displaying
      this.saveStats();
      
      this.sendChat(statsMessage);
      console.log(`📊 Stats displayed for ${targetUserName} (${targetUserId}) - ${totalReactions} total reactions, ${topArtists.length} artists`);

    } catch (error) {
      console.log(`❌ Stats command error: ${error.message}`);
      this.sendChat(`❌ **Stats Error:** Failed to get user stats.`);
    }
  }

  async sendChatViaSocket(text) {
    try {
      // Try sending via socket action instead of CometChat
      await this.socket.action('speak', { text: text });
      console.log(`💬 Chat sent via socket: ${text.substring(0, 50)}...`);
      return true;
    } catch (error) {
      console.log(`❌ Socket chat failed: ${error.message}`);
      return false;
    }
  }

  async sendChatWithImage(text, imageUrl) {
    if (!this.isConnected) {
      this.log('❌ Cannot send chat - not connected');
      return false;
    }

    try {
      // Join CometChat group first if not already joined
      if (!this.cometChatAuthenticated) {
        await this.joinCometChatGroup();
      }

      const baseUrl = `https://193427bb5702bab7.apiclient-us.cometchat.io`;
      const headers = {
        'Content-Type': 'application/json',
        'authtoken': this.cometChatAuth,
        'appid': '193427bb5702bab7',
        'onBehalfOf': this.userId,
        'dnt': 1,
        'origin': 'https://hang.fm',
        'referer': 'https://hang.fm/',
        'sdk': 'javascript@4.0.10'
      };

      // Handle data URLs (base64 encoded images)
      let finalImageUrl = imageUrl;
      let imageName = 'image.jpg';
      let mimeType = 'image/jpeg';
      
      if (imageUrl.startsWith('data:')) {
        // For data URLs, we'll use the URL as-is
        finalImageUrl = imageUrl;
        imageName = 'weather-report.png';
        mimeType = 'image/png';
      }

      // Use the EXACT format that hang.fm uses (discovered via network inspection)
      const payload = {
        receiver: this.roomId,
        receiverType: 'group',
        category: 'message',
        type: 'image',
        data: {
          url: '',
          attachments: [{
            extension: imageName.split('.').pop(),
            mimeType: mimeType,
            name: imageName,
            url: finalImageUrl
          }],
          metadata: {
            message: {
              reactions: [],
              mentionedUsers: [],
              mentionedMe: false,
              receiverId: this.roomId,
              type: 'ChatMessage',
              receiverType: 'group',
              category: 'custom',
              customData: {
                message: text,
                avatarId: this.chatAvatarId || this.botAvatar || 'bot-01',
                userName: this.botName,
                color: '#9E4ADF',
                userUuid: this.userId,
                badges: [],
                media: {
                  type: mimeType,
                  uri: finalImageUrl,
                  name: imageName
                },
                uuid: Date.now().toString(),
                id: -1,
                type: 'user',
                imageUrls: [finalImageUrl]
              },
              data: {
                customData: {
                  message: text,
                  avatarId: this.chatAvatarId || this.botAvatar || 'bot-01',
                  userName: this.botName,
                  color: '#9E4ADF',
                  userUuid: this.userId,
                  badges: [],
                  media: {
                    type: mimeType,
                    uri: finalImageUrl,
                    name: imageName
                  },
                  uuid: Date.now().toString(),
                  id: -1,
                  type: 'user',
                  imageUrls: [finalImageUrl]
                },
                metadata: {
                  incrementUnreadCount: true
                }
              },
              metadata: {
                incrementUnreadCount: true
              }
            },
            recipientUuid: this.roomId,
            chatMessage: {
              message: text,
              uuid: Date.now().toString(),
              id: -1,
              userName: this.botName,
              avatarId: this.chatAvatarId || this.botAvatar || 'bot-01',
              color: '#9E4ADF',
              userUuid: this.userId,
              date: new Date().toISOString(),
              retryButton: false,
              reactions: [],
              badges: [],
              imageUrls: [finalImageUrl],
              media: {
                type: mimeType,
                uri: finalImageUrl,
                name: imageName
              },
              type: 'user'
            }
          }
        }
      };

      console.log(`🖼️ Sending image message with hang.fm format...`);
      const response = await axios.post(`${baseUrl}/v3.0/messages`, payload, { headers });
      console.log(`✅ Image message sent successfully!`);
      return true;
      
    } catch (error) {
      console.log(`❌ Failed to send image message: ${error.message}`);
      if (error.response?.data) {
        console.log(`❌ Error details: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      return false;
    }
  }

  async handleTenorCommand(text, senderId, senderName) {
    try {
      // Extract search term from command
      const searchTerm = text.replace('/tenor', '').trim();
      
      if (!searchTerm) {
        this.sendChat('❌ Usage: `/tenor <search term>` - Example: `/tenor funny cat`');
        return;
      }
      
      // Check for Tenor API key
      if (!this.tenorApiKey) {
        this.sendChat('❌ Tenor API key not configured. Please add TENOR_API_KEY to your .env file.');
        return;
      }
      
      console.log(`🖼️ Searching Tenor for: ${searchTerm}`);
      
      // Search Tenor for the term
      const tenorResponse = await axios.get(`https://tenor.googleapis.com/v2/search`, {
        params: {
          key: this.tenorApiKey,
          q: searchTerm,
          limit: 1,
          contentfilter: 'medium',
          media_filter: 'gif'
        }
      });
      
      if (!tenorResponse.data?.results?.[0]) {
        this.sendChat(`❌ No GIFs found for "${searchTerm}"`);
        return;
      }
      
      const gif = tenorResponse.data.results[0];
      const gifUrl = gif.media_formats?.gif?.url || gif.media_formats?.mediumgif?.url || gif.media_formats?.tinygif?.url;
      
      if (!gifUrl) {
        this.sendChat('❌ No valid GIF URL found');
        return;
      }
      
      console.log(`🖼️ Found Tenor GIF:`, {
        id: gif.id,
        title: gif.content_description || searchTerm,
        url: gifUrl
      });
      
      // Send the GIF using the discovered hang.fm format
      const success = await this.sendChatWithImage('', gifUrl);
      
      if (success) {
        console.log(`✅ Tenor GIF sent: ${searchTerm}`);
      } else {
        this.sendChat(`❌ Failed to send GIF. Check console for details.`);
      }
      
    } catch (error) {
      console.log(`❌ Tenor command error: ${error.message}`);
      this.sendChat('❌ Failed to fetch Tenor GIF.');
    }
  }

  async handleTestGifCommand(senderId, senderName) {
    try {
      console.log(`🖼️ Testing GIF message functionality...`);
      
      // Fetch a random GIF from Tenor API
      if (!this.tenorApiKey) {
        this.sendChat('❌ Tenor API key not configured. Please add TENOR_API_KEY to your .env file.');
        return;
      }
      
      const tenorResponse = await axios.get(`https://tenor.googleapis.com/v2/featured`, {
        params: {
          key: this.tenorApiKey,
          limit: 1,
          contentfilter: 'medium',
          media_filter: 'gif'
        }
      });
      
      if (!tenorResponse.data?.results?.[0]) {
        this.sendChat('❌ Failed to fetch GIF from Tenor');
        return;
      }
      
      const gif = tenorResponse.data.results[0];
      const gifUrl = gif.media_formats?.gif?.url || gif.media_formats?.mediumgif?.url || gif.media_formats?.tinygif?.url;
      
      if (!gifUrl) {
        this.sendChat('❌ No valid GIF URL found');
        return;
      }
      
      console.log(`🖼️ Got GIF from Tenor:`, {
        id: gif.id,
        title: gif.content_description || 'Untitled',
        url: gifUrl
      });
      
      // Send the GIF using the discovered hang.fm format
      const success = await this.sendChatWithImage(`🎉 Test GIF from Tenor!`, gifUrl);
      
      if (success) {
        console.log(`✅ Tenor GIF sent successfully!`);
      } else {
        this.sendChat(`❌ Failed to send Tenor GIF. Check console for details.`);
      }
      
    } catch (error) {
      console.log(`❌ Test GIF command error: ${error.message}`);
      this.sendChat('❌ Failed to test GIF functionality.');
    }
  }

  async handleAlbumArtCommand(senderId, senderName) {
    try {
      console.log(`🖼️ Album command triggered by ${senderName}`);
      const nowPlaying = this.state?.nowPlaying;
      
      if (!nowPlaying || !nowPlaying.song) {
        console.log(`❌ No song playing - sending error message`);
        this.sendChat('❌ No song currently playing.');
        return;
      }
      
      const song = nowPlaying.song;
      console.log(`🔍 Getting album info for: ${song.artistName} - ${song.trackName}`);
      const thumbnails = song.thumbnails || {};
      
      // Get album art that will display inline (prefer URLs ending with .jpg/.png/.gif)
      // Priority: sevenDigital, napster, youtube (they have proper extensions)
      const albumArt = thumbnails.sevenDigital || 
                       thumbnails.napster || 
                       thumbnails.youtube || 
                       thumbnails.deezer || 
                       thumbnails.yandex || 
                       thumbnails.tidal || 
                       thumbnails.pandora || 
                       thumbnails.apple || 
                       thumbnails.spotify || 
                       thumbnails.amazonMusic;
      
      if (!albumArt) {
        this.sendChat(`🎵 **${song.artistName} - ${song.trackName}**\n❌ No album art available for this track.`);
        return;
      }
      
      const albumName = song.albumName || song.album?.name || 'Single';
      const year = song.releaseYear || song.year || 'Unknown Year';
      
      // Get facts about the album (or find original album if it's a "Single")
      const albumResult = await this.getAlbumFacts(song.artistName, song.trackName, albumName, year);
      
      // Extract actual album name and facts
      let actualAlbumName = albumName;
      let albumFacts = null;
      
      if (albumResult && typeof albumResult === 'object') {
        actualAlbumName = albumResult.albumName || albumName;
        albumFacts = albumResult.facts;
      } else if (albumResult && typeof albumResult === 'string') {
        albumFacts = albumResult;
      }
      
      // Send the album art image first
      console.log(`🖼️ Sending album art...`);
      const imageSuccess = await this.sendChatWithImage('', albumArt);
      
      if (!imageSuccess) {
        console.log(`⚠️ Image send failed, skipping image`);
      }
      
      // Build text message with album info
      let message = `🎵 **${song.artistName} - ${song.trackName}**\n`;
      message += `💿 ${actualAlbumName} (${year})\n`;
      
      if (albumFacts) {
        message += `\n${albumFacts}`;
      } else {
        message += `\n❌ No additional album information available.`;
      }
      
      // Send the text summary as a separate message
      this.sendChat(message);
      
      console.log(`📝 Album info displayed for: ${song.artistName} - ${song.trackName}`);
      
    } catch (error) {
      console.log(`❌ Album art command error: ${error.message}`);
      this.sendChat('❌ Failed to get album art.');
    }
  }

  async getAlbumFacts(artist, trackName, album, year) {
    try {
      let albumData = {
        trackCount: null,
        label: null,
        date: year,
        wikiExtract: null,
        actualAlbum: album
      };
      
      // STEP 1: ALWAYS use Spotify first for the actual album name and year (most accurate)
      try {
        console.log(`🔍 Searching Spotify for album metadata: ${artist} - ${trackName}`);
        const spotifyData = await this.searchSpotify(artist, trackName);
        if (spotifyData && spotifyData.album) {
          albumData.actualAlbum = spotifyData.album;
          albumData.date = spotifyData.releaseDate?.substring(0, 4) || year;
          console.log(`✅ Spotify: ${albumData.actualAlbum} (${albumData.date})`);
        } else {
          console.log(`⚠️ Spotify returned no album data`);
        }
      } catch (error) {
        console.log(`⚠️ Spotify lookup failed: ${error.message}`);
      }
      
      // STEP 2: Try Wikipedia for album article/summary (using Spotify's album name)
      let searchAlbum = albumData.actualAlbum;
      
      // Clean up album name for Wikipedia search (remove ALL parenthetical/bracketed content)
      let cleanAlbumName = searchAlbum
        .replace(/\s*\([^)]+\)\s*/g, '') // Remove anything in parentheses
        .replace(/\s*\[[^\]]+\]\s*/g, '') // Remove anything in brackets
        .replace(/\s*-\s*(Remaster|Edition|Anniversary|Deluxe|Expanded|Bonus|Special).*$/gi, '') // Remove dash suffixes
        .trim();
      
      // If cleaning removed everything, use original
      if (!cleanAlbumName || cleanAlbumName.length < 2) {
        cleanAlbumName = searchAlbum;
      }
      
      if (cleanAlbumName !== searchAlbum) {
        console.log(`🔧 Cleaned album name for Wikipedia: "${searchAlbum}" → "${cleanAlbumName}"`);
        searchAlbum = cleanAlbumName;
      }
      
      if (searchAlbum !== 'Single' && searchAlbum !== 'Unknown Album' && searchAlbum !== 'Unknown') {
        try {
          console.log(`🔍 Searching Wikipedia for album: ${searchAlbum} by ${artist}`);
          // Use intitle: to ONLY search article titles, not content
          const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=intitle:"${encodeURIComponent(searchAlbum)}" "${encodeURIComponent(artist)}"&format=json&srlimit=5`;
          const searchResponse = await axios.get(wikiSearchUrl, {
            headers: { 'User-Agent': 'HangFM-Bot/1.0' },
            timeout: 5000
          });
          
          if (searchResponse.data?.query?.search?.length > 0) {
            // Find a page that has the EXACT album name in the title (not genre pages)
            const albumPage = searchResponse.data.query.search.find(result => {
              const title = result.title.toLowerCase();
              const albumLower = searchAlbum.toLowerCase();
              const artistLower = artist.toLowerCase();
              
              // Must have album name in title AND not be a genre/list/category page
              return title.includes(albumLower) && 
                     (title.includes(artistLower) || title.includes('album')) &&
                     !title.includes('list of') &&
                     !title.includes('genre') &&
                     !title.includes('music') &&
                     !title.includes('category');
            }) || searchResponse.data.query.search[0];
            
            const pageTitle = albumPage.title;
            console.log(`🔍 Found Wikipedia page: "${pageTitle}"`);
            
            // Double-check: Skip if it's clearly a genre page
            if (pageTitle.toLowerCase().includes('hip hop') || 
                pageTitle.toLowerCase().includes('indie rock') ||
                pageTitle.toLowerCase().includes('alternative rock') ||
                pageTitle.toLowerCase().includes('list of') ||
                pageTitle.toLowerCase().includes('music genre')) {
              console.log(`⚠️ Skipping genre/list page: "${pageTitle}"`);
              albumData.wikiExtract = null;
            } else {
              // Get the article extract
              const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(pageTitle)}&format=json`;
              const extractResponse = await axios.get(extractUrl, {
                headers: { 'User-Agent': 'HangFM-Bot/1.0' },
                timeout: 5000
              });
              
              const pages = extractResponse.data?.query?.pages;
              if (pages) {
                const pageId = Object.keys(pages)[0];
                const extract = pages[pageId]?.extract;
                
                if (extract && extract.length > 50) {
                  // Get first 2-3 sentences ONLY (album summary, not genre definition)
                  const sentences = extract.split(/\.\s+/);
                  albumData.wikiExtract = sentences.slice(0, 3).join('. ') + '.';
                  console.log(`✅ Found Wikipedia album description (${albumData.wikiExtract.length} chars)`);
                } else {
                  console.log(`⚠️ Wikipedia extract too short or missing`);
                }
              }
            }
          } else {
            console.log(`⚠️ No Wikipedia search results for: ${searchAlbum}`);
          }
        } catch (error) {
          console.log(`⚠️ Wikipedia album lookup failed: ${error.message}`);
        }
      }
      
      // STEP 3: If we have Wikipedia summary, return it (prioritize over MusicBrainz)
      if (albumData.wikiExtract) {
        console.log(`✅ Returning Wikipedia summary for: ${albumData.actualAlbum}`);
        return {
          albumName: albumData.actualAlbum,
          facts: albumData.wikiExtract
        };
      }
      
      // STEP 4: Wikipedia failed - try MusicBrainz/Discogs for basic album info (NO genre spam)
      const finalAlbum = albumData.actualAlbum;
      if (finalAlbum !== 'Single' && finalAlbum !== 'Unknown Album' && finalAlbum !== 'Unknown') {
        try {
          console.log(`🔍 Wikipedia failed - trying MusicBrainz for track count/label...`);
          const mbUrl = `https://musicbrainz.org/ws/2/release-group?query=artist:"${encodeURIComponent(artist)}" AND releasegroup:"${encodeURIComponent(finalAlbum)}"&fmt=json&limit=1`;
          const mbResponse = await axios.get(mbUrl, {
            headers: {
              'User-Agent': 'HangFM-Bot/1.0 (https://hang.fm)',
              'Accept': 'application/json'
            },
            timeout: 5000
          });
          
          if (mbResponse.data?.['release-groups']?.[0]) {
            const releaseGroup = mbResponse.data['release-groups'][0];
            
            // Get release group ID for more details
            const rgid = releaseGroup.id;
            const detailUrl = `https://musicbrainz.org/ws/2/release-group/${rgid}?inc=releases+tags+genres&fmt=json`;
            const detailResponse = await axios.get(detailUrl, {
              headers: {
                'User-Agent': 'HangFM-Bot/1.0 (https://hang.fm)',
                'Accept': 'application/json'
              },
              timeout: 5000
            });
            
            if (detailResponse.data) {
              const details = detailResponse.data;
              albumData.date = details['first-release-date'] || year;
              
              // Get genres/tags
              if (details.genres && details.genres.length > 0) {
                albumData.genre = details.genres.slice(0, 3).map(g => g.name).join(', ');
              } else if (details.tags && details.tags.length > 0) {
                albumData.genre = details.tags.slice(0, 3).map(t => t.name).join(', ');
              }
              
              // Get track count and label from first release
              if (details.releases && details.releases.length > 0) {
                const release = details.releases[0];
                albumData.trackCount = release['track-count'];
                
                // Get label info
                const labelUrl = `https://musicbrainz.org/ws/2/release/${release.id}?inc=labels&fmt=json`;
                const labelResponse = await axios.get(labelUrl, {
                  headers: {
                    'User-Agent': 'HangFM-Bot/1.0 (https://hang.fm)',
                    'Accept': 'application/json'
                  },
                  timeout: 5000
                });
                
                if (labelResponse.data?.['label-info']?.[0]?.label?.name) {
                  albumData.label = labelResponse.data['label-info'][0].label.name;
                }
              }
            }
          }
        } catch (error) {
          if (this.verboseMode) console.log(`⚠️ MusicBrainz album lookup failed: ${error.message}`);
        }
      } else {
        // For singles, search for the artist on MusicBrainz to get their genre/info
        try {
          const artistUrl = `https://musicbrainz.org/ws/2/artist?query=artist:"${encodeURIComponent(artist)}"&fmt=json&limit=1`;
          const artistResponse = await axios.get(artistUrl, {
            headers: {
              'User-Agent': 'HangFM-Bot/1.0 (https://hang.fm)',
              'Accept': 'application/json'
            },
            timeout: 5000
          });
          
          if (artistResponse.data?.artists?.[0]) {
            const artistData = artistResponse.data.artists[0];
            
            // Get artist details with genres/tags
            const artistId = artistData.id;
            const detailUrl = `https://musicbrainz.org/ws/2/artist/${artistId}?inc=tags+genres&fmt=json`;
            const detailResponse = await axios.get(detailUrl, {
              headers: {
                'User-Agent': 'HangFM-Bot/1.0 (https://hang.fm)',
                'Accept': 'application/json'
              },
              timeout: 5000
            });
            
            if (detailResponse.data) {
              const details = detailResponse.data;
              
              // Get genres/tags for the artist
              if (details.genres && details.genres.length > 0) {
                albumData.genre = details.genres.slice(0, 3).map(g => g.name).join(', ');
              } else if (details.tags && details.tags.length > 0) {
                albumData.genre = details.tags.slice(0, 3).map(t => t.name).join(', ');
              }
              
              // Get artist type and country
              const artistType = details.type || null;
              const country = details.country || details.area?.name || null;
              
              if (artistType) albumData.artistType = artistType;
              if (country) albumData.country = country;
            }
          }
        } catch (error) {
          if (this.verboseMode) console.log(`⚠️ MusicBrainz artist lookup failed: ${error.message}`);
        }
      }
      
      // 2. If no Wikipedia summary, return minimal MusicBrainz facts (NO genre spam)
      if (albumData.genre || albumData.trackCount || albumData.label) {
        let facts = [];
        if (albumData.trackCount) facts.push(`${albumData.trackCount} tracks`);
        if (albumData.label) facts.push(`Label: ${albumData.label}`);
        if (albumData.date && albumData.date !== year && albumData.date !== 'Unknown Year') facts.push(`Released: ${albumData.date}`);
        
        // Only return if we have meaningful info (not just genre)
        if (facts.length > 0) {
          return {
            albumName: albumData.actualAlbum,
            facts: facts.join(' • ')
          };
        }
      }
      
      // No album info found
      return null;
      
    } catch (error) {
      if (this.verboseMode) console.log(`❌ Error getting album facts: ${error.message}`);
      return null;
    }
  }

  async handleSongStatsCommand(text, senderId, senderName) {
    try {
      // Extract song from command
      let songRequest = text.replace('/songstats', '').trim();
      
      // If no song specified, use currently playing song
      if (!songRequest) {
        const nowPlaying = this.state?.nowPlaying;
        if (!nowPlaying?.song) {
          this.sendChat('❌ No song currently playing. Specify a song: `/songstats artist - song title`');
          return;
        }
        songRequest = `${nowPlaying.song.artistName} - ${nowPlaying.song.trackName}`;
      }

      let songStats = this.getSongStats(songRequest);
      
      // If no stats exist, this is the first play - initialize with defaults
      if (!songStats) {
        songStats = {
          plays: 1,
          firstPlayer: 'unknown',
          firstPlayerName: 'Unknown',
          likes: 0,
          dislikes: 0,
          stars: 0
        };
      }

      // Use stored name if available, otherwise try to look it up from current room data
      let firstPlayerName = songStats.firstPlayerName;  // Use stored name first (from when song was played)
      
      // If no stored name, try to look up from firstPlayer UUID in current room data
      if (!firstPlayerName || firstPlayerName === 'Unknown') {
        if (songStats.firstPlayer && songStats.firstPlayer !== 'unknown') {
          // Try getUsernameById first
          const foundName = this.getUsernameById(songStats.firstPlayer);
          if (foundName && foundName !== 'Unknown User') {
            firstPlayerName = foundName;
          } else {
            // Fallback: search in allUserData
            if (this.state?.allUserData && this.state.allUserData[songStats.firstPlayer]) {
              const userData = this.state.allUserData[songStats.firstPlayer];
              firstPlayerName = userData.userProfile?.nickname || 
                               userData.userProfile?.firstName || 
                               userData.userProfile?.username ||
                               userData.nickname ||
                               userData.firstName ||
                               userData.username ||
                               'Unknown';
            } else {
              firstPlayerName = 'Unknown';
            }
          }
        } else {
          firstPlayerName = 'Unknown';
        }
      }
      
      // Calculate some additional stats
      const avgReactionsPerPlay = songStats.plays > 0 
        ? Math.round((songStats.likes + songStats.dislikes + songStats.stars) / songStats.plays)
        : 0;
      
      // Add holiday decorations
      const emoji1 = this.getRandomHolidayEmoji();
      const emoji2 = this.getRandomHolidayEmoji();
      
      let songMessage = `${emoji1} **${songRequest}** ${emoji2}\n`;
      songMessage += `📊 Total Plays: ${songStats.plays}\n`;
      songMessage += `👤 First played by: ${firstPlayerName}\n`;
      songMessage += `👍 ${songStats.likes || 0} | 👎 ${songStats.dislikes || 0} | ⭐ ${songStats.stars || 0}\n`;
      
      // Add play frequency info
      if (songStats.plays > 1) {
        songMessage += `🔄 Play frequency: ${songStats.plays} times in this room\n`;
      }
      
      if (avgReactionsPerPlay > 0) {
        songMessage += `📈 Avg reactions per play: ${avgReactionsPerPlay}\n`;
      }

      // Save stats after displaying
      this.saveStats();

      this.sendChat(songMessage);
      console.log(`🎵 Song stats displayed for "${songRequest}" by ${senderName} - ${songStats.plays} plays`);

    } catch (error) {
      console.log(`❌ Song stats command error: ${error.message}`);
      this.sendChat(`❌ **Song Stats Error:** Failed to get song stats.`);
    }
  }

  getUserStats(userId) {
    if (!this.userStats.has(userId)) {
      this.userStats.set(userId, {
        bankroll: this.defaultBankroll,
        wins: 0,
        losses: 0,
        upvotes: 0,
        downvotes: 0,
        stars: 0,
        artists: new Map()
      });
    }
    return this.userStats.get(userId);
  }

  getSongStats(songKey) {
    return this.songStats.get(songKey);
  }

  getTopArtists(userId) {
    const userStats = this.getUserStats(userId);
    const artists = Array.from(userStats.artists.entries())
      .map(([name, plays]) => ({ name, plays }))
      .sort((a, b) => b.plays - a.plays)
      .slice(0, 3);
    return artists;
  }

  updateUserStats(userId, song) {
    try {
      const userStats = this.getUserStats(userId);
      const artistName = song.artistName;
      
      // Update artist plays
      const currentPlays = userStats.artists.get(artistName) || 0;
      userStats.artists.set(artistName, currentPlays + 1);
      
      // Always show fresh username in logs
      const userName = this.getUsernameById(userId) || userId;
      console.log(`📊 Updated stats for user ${userName}: ${artistName} now has ${currentPlays + 1} plays`);
    } catch (error) {
      console.log(`❌ Error updating user stats: ${error.message}`);
    }
  }

  updateSongStats(song, userId, userName = null) {
    try {
      const songKey = `${song.artistName} - ${song.trackName}`;
      
      if (!this.songStats.has(songKey)) {
        // Use provided username or look it up
        const firstPlayerName = userName || this.getUsernameById(userId) || 'Unknown';
        
        // First time this song is played - initialize with all fields
        this.songStats.set(songKey, {
          plays: 1,
          firstPlayer: userId,
          firstPlayerName: firstPlayerName, // Store name directly
          likes: 0,
          dislikes: 0,
          stars: 0
        });
        console.log(`🎵 NEW song in stats: "${songKey}" first played by ${firstPlayerName}`);
      } else {
        // Song already exists, increment plays
        const stats = this.songStats.get(songKey);
        stats.plays++;
        console.log(`🎵 Song play count updated: "${songKey}" → ${stats.plays} total plays`);
      }
    } catch (error) {
      console.log(`❌ Error updating song stats: ${error.message}`);
    }
  }

  updateStatsForSong(song) {
    try {
      // Skip stats for bot plays
      if (song.userId === this.userId) {
        console.log(`🤖 ❌ BOT STATS NEVER SAVED: Bot's own song stats are not tracked: ${song.artistName} - ${song.trackName}`);
        return;
      }
      // Use the tracked DJ info from handlePlayedSong (most reliable)
      let djUuid = this.currentDjId;
      let djName = this.currentDjName || 'Unknown DJ';
      
      // ALWAYS re-resolve username to avoid stale cache
      if (djUuid && djUuid !== 'unknown') {
        const freshName = this.getUsernameById(djUuid);
        if (freshName && freshName !== 'Unknown User') {
          djName = freshName;
        }
      }
      
      if (!djUuid) {
        // Fallback: Try to find DJ from djs array
        const djs = this.state?.djs || [];
        for (const dj of djs) {
          if (dj.song && dj.song.songId === song.songId) {
            djUuid = dj.uuid || dj.userProfile?.uuid;
            djName = dj.userProfile?.nickname || dj.displayName || this.getUsernameById(djUuid);
            console.log(`🔍 Found DJ from djs array: ${djName}`);
            break;
          }
        }
      }
      
      if (!djUuid) {
        console.log(`⚠️ Could not determine DJ for song: ${song.artistName} - ${song.trackName}`);
        console.log(`🔍 Debug: currentDjId=${this.currentDjId}, currentDjName=${this.currentDjName}, djs count=${this.state?.djs?.length}`);
        return;
      }
      
      console.log(`📊 Tracking stats for: ${djName} (${djUuid}) - ${song.artistName} - ${song.trackName}`);
      
      // Update user stats for the DJ playing this song
      this.updateUserStats(djUuid, song);
      
      // Update song stats with DJ name
      this.updateSongStats(song, djUuid, djName);
      
      // Update reaction stats for the current DJ (cumulative across all their songs)
      this.updateReactionStats(djUuid);
      
      // Update song reaction stats (snapshot of votes for this specific song)
      this.updateSongReactionStats(song);
      
      // Save stats after update
      this.saveStats();
      
      // Always use fresh username in final log
      const freshDjName = this.getUsernameById(djUuid) || djName;
      console.log(`📊 Stats updated for: ${freshDjName}'s song "${song.artistName} - ${song.trackName}"`);
      
    } catch (error) {
      console.log(`❌ Error updating stats for song: ${error.message}`);
    }
  }

  async handleTestQueueCommand(senderId, senderName) {
    try {
      console.log(`🧪 Test queue command by ${senderName}`);
      this.sendChat(`🧪 **Testing Queue Addition** - Adding test song...`);
      
      // Try to add a simple test song
      const testSong = "Radiohead - Creep";
      console.log(`🧪 Testing with song: ${testSong}`);
      
      const success = await this.addSongToQueueAI(testSong, 'Test Command');
      
      if (success) {
        this.sendChat(`✅ **Test Success:** "${testSong}" added to queue!`);
      } else {
        this.sendChat(`❌ **Test Failed:** Could not add "${testSong}" to queue.`);
      }
      
    } catch (error) {
      console.log(`❌ Test queue command error: ${error.message}`);
      this.sendChat(`❌ **Test Error:** ${error.message}`);
    }
  }

  async handleDecorCommand(text, senderId, senderName) {
    // Check if user is a mod OR co-owner
    const isCoOwner = await this.isUserCoOwner(senderId);
    const isMod = await this.isUserModerator(senderId);
    
    if (!isCoOwner && !isMod) {
      this.sendChat(`❌ Access denied. Only moderators and co-owners can use this command.`);
      return;
    }

    try {
      const args = text.trim().split(/\s+/);
      const holiday = args[1]?.toLowerCase();
      
      if (!holiday) {
        this.sendChat(`🎃 **Current Holiday:** ${this.holidayEmojis.name} ${this.holidayEmojis.icon}\n\nAvailable: halloween, christmas, valentines, easter, july4th, none\nUsage: /.decor <holiday>`);
        return;
      }
      
      const validHolidays = ['halloween', 'christmas', 'valentines', 'easter', 'july4th', 'none'];
      
      if (!validHolidays.includes(holiday)) {
        this.sendChat(`❌ Invalid holiday. Choose: halloween, christmas, valentines, easter, july4th, none`);
        return;
      }
      
      // Update holiday theme
      this.currentHoliday = holiday;
      this.holidayEmojis = this.getHolidayEmojis();
      
      const emoji1 = this.getRandomHolidayEmoji();
      const emoji2 = this.getRandomHolidayEmoji();
      const emoji3 = this.getRandomHolidayEmoji();
      
      this.sendChat(`${emoji1} **Holiday Theme Updated** ${emoji2}\n**New Theme:** ${this.holidayEmojis.name} ${this.holidayEmojis.icon}\n**Changed by:** ${senderName} ${emoji3}`);
      console.log(`🎃 Holiday theme changed to ${this.holidayEmojis.name} by ${senderName}`);
      
    } catch (error) {
      console.log(`❌ Decor command error: ${error.message}`);
      this.sendChat(`❌ **Decor Error:** Failed to change holiday theme.`);
    }
  }

  async handleWeatherCommand(text, senderId, senderName) {
    try {
      // Extract location from command
      const location = text.replace(/^\/w\s+|^\/weather\s+/i, '').trim();
      
      if (!location) {
        this.sendChat(`❌ Please specify a location.\nUsage: /w <zip code, city name, or postal code>\nExamples: /w 14207, /w buffalo, /w london uk`);
        return;
      }
      
      if (!this.openweatherApiKey || this.openweatherApiKey === 'your_openweather_key_here') {
        this.sendChat(`❌ Weather API is not configured. Ask a co-owner to add OPENWEATHER_API_KEY to config.`);
        return;
      }
      
      console.log(`🌤️ Fetching weather for: ${location}`);
      
      // Fetch weather data from OpenWeather API
      const weatherData = await this.fetchWeatherData(location);
      
      if (!weatherData) {
        this.sendChat(`❌ Could not find weather for "${location}". Try a different location or format (city name, zip code, etc.)`);
        return;
      }
      
      // Send text-based weather report with OpenWeather icons
      const weatherReport = this.formatWeatherReportWithIcons(weatherData);
      this.sendChat(weatherReport);
      console.log(`✅ Weather text report sent for ${weatherData.location}`);
      
    } catch (error) {
      console.log(`❌ Weather command error: ${error.message}`);
      this.sendChat(`❌ **Weather Error:** ${error.message}`);
    }
  }

  async fetchWeatherData(location) {
    try {
      // OpenWeather API endpoints
      const baseUrl = 'https://api.openweathermap.org/data/2.5';
      
      // Determine if location is a zip code (US format: 5 digits) or city name
      const isZipCode = /^\d{5}$/.test(location);
      const isZipCodeWithCountry = /^\d{5},\s*[a-z]{2}$/i.test(location);
      
      let geoQuery = '';
      if (isZipCode) {
        geoQuery = `zip=${location},US`;
      } else if (isZipCodeWithCountry) {
        geoQuery = `zip=${location}`;
      } else {
        // City name or postal code (international)
        geoQuery = `q=${encodeURIComponent(location)}`;
      }
      
      // Fetch current weather
      const currentUrl = `${baseUrl}/weather?${geoQuery}&appid=${this.openweatherApiKey}&units=imperial`;
      const currentResponse = await axios.get(currentUrl);
      const current = currentResponse.data;
      
      // Get coordinates for forecast
      const lat = current.coord.lat;
      const lon = current.coord.lon;
      
      // Fetch 5-day forecast
      const forecastUrl = `${baseUrl}/forecast?lat=${lat}&lon=${lon}&appid=${this.openweatherApiKey}&units=imperial&cnt=40`;
      const forecastResponse = await axios.get(forecastUrl);
      const forecast = forecastResponse.data;
      
      // Process forecast data (get one entry per day at noon)
      const dailyForecasts = [];
      const processedDays = new Set();
      
      for (const item of forecast.list) {
        const date = new Date(item.dt * 1000);
        const dayKey = date.toISOString().split('T')[0];
        
        // Get forecast at 12:00 PM (noon) for each day
        const hour = date.getHours();
        if (!processedDays.has(dayKey) && (hour === 12 || hour === 13 || hour === 14 || hour === 15)) {
          dailyForecasts.push({
            date: date,
            temp: item.main.temp,
            tempMin: item.main.temp_min,
            tempMax: item.main.temp_max,
            description: item.weather[0].description,
            icon: item.weather[0].icon,
            humidity: item.main.humidity,
            windSpeed: item.wind.speed
          });
          processedDays.add(dayKey);
          
          if (dailyForecasts.length >= 5) break;
        }
      }
      
      return {
        location: `${current.name}, ${current.sys.country}`,
        current: {
          temp: current.main.temp,
          feelsLike: current.main.feels_like,
          tempMin: current.main.temp_min,
          tempMax: current.main.temp_max,
          humidity: current.main.humidity,
          pressure: current.main.pressure,
          windSpeed: current.wind.speed,
          description: current.weather[0].description,
          icon: current.weather[0].icon
        },
        forecast: dailyForecasts
      };
      
    } catch (error) {
      console.log(`❌ Weather API error: ${error.message}`);
      if (error.response?.status === 404) {
        return null; // Location not found
      }
      throw error;
    }
  }

  formatWeatherReport(data) {
    const { location, current, forecast } = data;
    
    // Convert F to C
    const tempC = Math.round((current.temp - 32) * 5/9);
    const feelsLikeC = Math.round((current.feelsLike - 32) * 5/9);
    
    // Weather emoji based on description
    const getWeatherEmoji = (description) => {
      const desc = description.toLowerCase();
      if (desc.includes('clear')) return '☀️';
      if (desc.includes('cloud')) return '☁️';
      if (desc.includes('rain') || desc.includes('drizzle')) return '🌧️';
      if (desc.includes('thunder') || desc.includes('storm')) return '⛈️';
      if (desc.includes('snow')) return '❄️';
      if (desc.includes('mist') || desc.includes('fog')) return '🌫️';
      return '🌤️';
    };
    
    const currentEmoji = getWeatherEmoji(current.description);
    
    // Holiday decoration
    const headerEmoji = this.getRandomHolidayEmoji();
    
    // Build the weather report template
    let report = `${headerEmoji} ╔══════════════════════════╗\n`;
    report += `  ║  MATT'S WEATHER REPORT  ║\n`;
    report += `  ╚══════════════════════════╝ ${headerEmoji}\n\n`;
    
    report += `📍 **${location}**\n\n`;
    
    report += `${currentEmoji} **CURRENT CONDITIONS** ${currentEmoji}\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `🌡️ Temp: ${Math.round(current.temp)}°F (${tempC}°C)\n`;
    report += `🤔 Feels like: ${Math.round(current.feelsLike)}°F (${feelsLikeC}°C)\n`;
    report += `📊 Conditions: ${current.description}\n`;
    report += `💧 Humidity: ${current.humidity}%\n`;
    report += `💨 Wind: ${Math.round(current.windSpeed)} mph\n`;
    report += `📈 High: ${Math.round(current.tempMax)}°F | 📉 Low: ${Math.round(current.tempMin)}°F\n\n`;
    
    report += `📅 **5-DAY FORECAST**\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    forecast.forEach((day, index) => {
      const dayName = daysOfWeek[day.date.getDay()];
      const dateStr = `${day.date.getMonth() + 1}/${day.date.getDate()}`;
      const emoji = getWeatherEmoji(day.description);
      const tempC = Math.round((day.temp - 32) * 5/9);
      
      if (index === 0) {
        report += `${emoji} **${dayName} ${dateStr}**: ${Math.round(day.temp)}°F (${tempC}°C) - ${day.description}\n`;
      } else {
        report += `${emoji} ${dayName} ${dateStr}: ${Math.round(day.temp)}°F (${tempC}°C) - ${day.description}\n`;
      }
    });
    
    report += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `⚡ Powered by OpenWeather API`;
    
    return report;
  }

  formatWeatherReportWithIcons(data) {
    const { location, current, forecast } = data;
    
    // Convert F to C
    const tempC = Math.round((current.temp - 32) * 5/9);
    const feelsLikeC = Math.round((current.feelsLike - 32) * 5/9);
    
    // OpenWeather icon mapping to emojis
    const getWeatherIcon = (iconCode) => {
      const iconMap = {
        '01d': '☀️', // clear sky day
        '01n': '🌙', // clear sky night
        '02d': '⛅', // few clouds day
        '02n': '☁️', // few clouds night
        '03d': '☁️', // scattered clouds
        '03n': '☁️', // scattered clouds
        '04d': '☁️', // broken clouds
        '04n': '☁️', // broken clouds
        '09d': '🌧️', // shower rain
        '09n': '🌧️', // shower rain
        '10d': '🌦️', // rain day
        '10n': '🌧️', // rain night
        '11d': '⛈️', // thunderstorm
        '11n': '⛈️', // thunderstorm
        '13d': '❄️', // snow
        '13n': '❄️', // snow
        '50d': '🌫️', // mist
        '50n': '🌫️'  // mist
      };
      return iconMap[iconCode] || '🌤️';
    };
    
    const currentIcon = getWeatherIcon(current.icon);
    const headerEmoji = this.getRandomHolidayEmoji();
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Build concise weather report (5 rows max)
    let report = `${headerEmoji} **matt's Weather Report** - ${location}\n`;
    report += `${currentIcon} **${Math.round(current.temp)}°F** (${tempC}°C) - ${current.description} | Feels like ${Math.round(current.feelsLike)}°F\n`;
    report += `💧 ${current.humidity}% humidity | 💨 ${Math.round(current.windSpeed)} mph | 📈 ${Math.round(current.tempMax)}°F / 📉 ${Math.round(current.tempMin)}°F\n`;
    
    // 5-day forecast in one compact row
    report += `📅 `;
    forecast.forEach((day, index) => {
      const dayName = daysOfWeek[day.date.getDay()];
      const dateStr = `${day.date.getMonth() + 1}/${day.date.getDate()}`;
      const dayIcon = getWeatherIcon(day.icon);
      
      if (index === 0) {
        report += `${dayIcon}${dayName} ${dateStr} ${Math.round(day.temp)}°F`;
      } else {
        report += ` | ${dayIcon}${dayName} ${dateStr} ${Math.round(day.temp)}°F`;
      }
    });
    
    report += `\n⚡ OpenWeather API`;
    
    return report;
  }

  async handlePokerCommand(text, senderId, senderName) {
    try {
      // Check if game is already active
      if (this.pokerGameActive) {
        this.sendChat(`🃏 **jirf Poker** game is already in progress! Wait for it to finish.`);
        return;
      }

      console.log(`🃏 Starting jirf Poker game initiated by ${senderName} (${senderId})`);
      
      // Start new poker game
      this.pokerGameActive = true;
      this.pokerBets.clear();
      this.pokerRoomCards = [];
      this.pokerDealerCards = [];
      this.pokerGameStartTime = Date.now();
      
      // Announce game start
      this.sendChat(`🃏 **jirf Poker** game started by ${senderName}!\n🏠 Room vs Dealer (Bot)\n💰 **15 seconds to bet** - Type \`/bet <amount>\` to place your bet!`);
      
      // Start 15-second betting window
      this.pokerBettingWindow = setTimeout(async () => {
        await this.dealPokerHands();
      }, 15000);
      
      // Countdown messages
      setTimeout(() => {
        if (this.pokerGameActive) {
          this.sendChat(`⏰ **10 seconds left** to place your bets!`);
        }
      }, 5000);
      
      setTimeout(() => {
        if (this.pokerGameActive) {
          this.sendChat(`⏰ **5 seconds left** to place your bets!`);
        }
      }, 10000);
      
    } catch (error) {
      console.log(`❌ Poker command error: ${error.message}`);
      this.sendChat(`❌ **jirf Poker Error:** ${error.message}`);
    }
  }

  async handleBetCommand(text, senderId, senderName) {
    try {
      if (!this.pokerGameActive) {
        this.sendChat(`🃏 No **jirf Poker** game active. Use \`/p\` to start a game!`);
        return;
      }

      // Extract bet amount
      const betMatch = text.match(/\/bet\s+(\d+)/i);
      if (!betMatch) {
        this.sendChat(`💰 Usage: \`/bet <amount>\` - Example: \`/bet 50\``);
        return;
      }

      const betAmount = parseInt(betMatch[1]);
      if (betAmount <= 0) {
        this.sendChat(`💰 Bet amount must be positive!`);
        return;
      }

      // Check if user has enough bankroll
      const userStats = this.state?.allUserData?.[senderId];
      if (!userStats || userStats.bankroll < betAmount) {
        this.sendChat(`💰 ${senderName}, you don't have enough chips! (You have ${userStats?.bankroll || 0} chips)`);
        return;
      }

      // Place bet
      this.pokerBets.set(senderId, betAmount);
      
      // Deduct from bankroll immediately
      if (userStats) {
        userStats.bankroll -= betAmount;
      }

      this.sendChat(`💰 ${senderName} bet **${betAmount} chips**! 🃏`);
      console.log(`🃏 ${senderName} (${senderId}) bet ${betAmount} chips`);

    } catch (error) {
      console.log(`❌ Bet command error: ${error.message}`);
      this.sendChat(`❌ **Bet Error:** ${error.message}`);
    }
  }

  async dealPokerHands() {
    try {
      // Clear betting window
      if (this.pokerBettingWindow) {
        clearTimeout(this.pokerBettingWindow);
        this.pokerBettingWindow = null;
      }

      // Generate deck and deal cards
      const deck = this.generateDeck();
      this.shuffleDeck(deck);
      
      // Deal 3 cards to room and 3 to dealer
      this.pokerRoomCards = deck.slice(0, 3);
      this.pokerDealerCards = deck.slice(3, 6);

      // Show room cards
      await this.showPokerHand('room', this.pokerRoomCards);
      
      // 5-second suspense before showing dealer cards
      this.pokerRevealTimeout = setTimeout(async () => {
        await this.showPokerHand('dealer', this.pokerDealerCards);
        await this.evaluatePokerGame();
      }, 5000);

      this.sendChat(`🃏 **Room's hand dealt!** 5-second suspense... 🤫`);

    } catch (error) {
      console.log(`❌ Deal poker hands error: ${error.message}`);
      this.sendChat(`❌ **jirf Poker Error:** Failed to deal hands.`);
    }
  }

  async showPokerHand(handType, cards) {
    try {
      const handName = handType === 'room' ? '🏠 ROOM' : '🤖 DEALER';
      const cardImages = await Promise.all(cards.map(card => this.generateCardImage(card)));
      
      // Send hand title
      this.sendChat(`🃏 **${handName} HAND**`);
      
      // Send all 3 cards in one message (if supported) or individually
      for (let i = 0; i < cardImages.length; i++) {
        await this.sendChatWithImage('', cardImages[i]);
        await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between cards
      }

    } catch (error) {
      console.log(`❌ Show poker hand error: ${error.message}`);
    }
  }

  async generateCardImage(card) {
    try {
      // Card dimensions: Half of previous size (35x49 pixels) - compact but visible
      const canvasWidth = 35;
      const canvasHeight = 49;
      const canvas = createCanvas(canvasWidth, canvasHeight);
      const ctx = canvas.getContext('2d');

      // Clean white background with subtle gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
      gradient.addColorStop(1, 'rgba(248, 248, 248, 0.98)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      
      // Rounded corners
      ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
      const cornerRadius = 3;
      ctx.beginPath();
      ctx.moveTo(cornerRadius, 0);
      ctx.lineTo(canvasWidth - cornerRadius, 0);
      ctx.arcTo(canvasWidth, 0, canvasWidth, cornerRadius, cornerRadius);
      ctx.lineTo(canvasWidth, canvasHeight - cornerRadius);
      ctx.arcTo(canvasWidth, canvasHeight, canvasWidth - cornerRadius, canvasHeight, cornerRadius);
      ctx.lineTo(cornerRadius, canvasHeight);
      ctx.arcTo(0, canvasHeight, 0, canvasHeight - cornerRadius, cornerRadius);
      ctx.lineTo(0, cornerRadius);
      ctx.arcTo(0, 0, cornerRadius, 0, cornerRadius);
      ctx.closePath();
      ctx.fill();
      
      // Bold border
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Card suit symbols
      const suitSymbols = {
        'hearts': '♥',
        'diamonds': '♦',
        'clubs': '♣',
        'spades': '♠'
      };

      // VIBRANT BOLD colors - BRIGHT RED or BLACK
      const isRed = (card.suit === 'hearts' || card.suit === 'diamonds');
      const suitColor = isRed ? '#FF0000' : '#000000';
      
      // Face card display (K, Q, J get special treatment)
      const isFaceCard = card.value === 'K' || card.value === 'Q' || card.value === 'J';
      
      // Top-left corner - BOLD AND VISIBLE
      ctx.fillStyle = suitColor;
      ctx.font = 'bold 8px Arial';
      ctx.fillText(card.value, 4, 11);
      
      ctx.font = 'bold 7px Arial';
      ctx.fillText(suitSymbols[card.suit], 4, 20);
      
      // Center - BIG suit symbol OR face card letter
      ctx.font = 'bold 18px Arial';
      const centerX = canvasWidth / 2;
      const centerY = canvasHeight / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      if (isFaceCard) {
        // For face cards, show the letter BIG
        ctx.font = 'bold 20px Arial';
        ctx.fillText(card.value, centerX, centerY - 2);
        ctx.font = 'bold 14px Arial';
        ctx.fillText(suitSymbols[card.suit], centerX, centerY + 10);
      } else {
        // For number cards, show suit symbol
        ctx.fillText(suitSymbols[card.suit], centerX, centerY);
      }
      
      // Bottom-right corner (upside down) - BOLD AND VISIBLE
      ctx.save();
      ctx.translate(canvasWidth - 4, canvasHeight - 4);
      ctx.rotate(Math.PI);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = 'bold 8px Arial';
      ctx.fillText(card.value, 0, -11);
      ctx.font = 'bold 7px Arial';
      ctx.fillText(suitSymbols[card.suit], 0, -20);
      ctx.restore();

      // Save as base64
      const buffer = canvas.toBuffer('image/png');
      const base64Image = buffer.toString('base64');
      return `data:image/png;base64,${base64Image}`;

    } catch (error) {
      console.log(`❌ Generate card image error: ${error.message}`);
      return null;
    }
  }

  generateDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck = [];
    
    for (const suit of suits) {
      for (const value of values) {
        deck.push({ suit, value });
      }
    }
    
    return deck;
  }

  shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  evaluatePokerHand(cards) {
    // Sort cards by value for easier evaluation
    const sortedCards = cards.map(card => ({
      ...card,
      numericValue: this.getCardNumericValue(card.value)
    })).sort((a, b) => b.numericValue - a.numericValue);

    const values = sortedCards.map(card => card.numericValue);
    const suits = sortedCards.map(card => card.suit);
    
    // Check for flush
    const isFlush = suits.every(suit => suit === suits[0]);
    
    // Check for straight
    const isStraight = this.isStraight(values);
    
    // Check for pairs/three of a kind
    const valueCounts = {};
    values.forEach(value => {
      valueCounts[value] = (valueCounts[value] || 0) + 1;
    });
    
    const counts = Object.values(valueCounts).sort((a, b) => b - a);
    
    // Determine hand rank
    if (isFlush && isStraight) {
      return { rank: 'straight-flush', name: 'Straight Flush', strength: 8 };
    } else if (counts[0] === 3) {
      return { rank: 'three-of-a-kind', name: 'Three of a Kind', strength: 7 };
    } else if (isStraight) {
      return { rank: 'straight', name: 'Straight', strength: 6 };
    } else if (isFlush) {
      return { rank: 'flush', name: 'Flush', strength: 5 };
    } else if (counts[0] === 2) {
      return { rank: 'pair', name: 'Pair', strength: 4 };
    } else {
      return { rank: 'high-card', name: 'High Card', strength: 3 };
    }
  }

  getCardNumericValue(value) {
    if (value === 'A') return 14;
    if (value === 'K') return 13;
    if (value === 'Q') return 12;
    if (value === 'J') return 11;
    return parseInt(value);
  }

  isStraight(values) {
    // Check for regular straight
    for (let i = 0; i < values.length - 1; i++) {
      if (values[i] - values[i + 1] !== 1) {
        // Check for A-2-3-4-5 straight
        if (values[0] === 14 && values[1] === 5 && values[2] === 4) {
          return true;
        }
        return false;
      }
    }
    return true;
  }

  comparePokerHands(hand1, hand2, handRank) {
    // Compare two poker hands of the same rank
    // Returns: positive if hand1 wins, negative if hand2 wins, 0 if tie
    const values1 = hand1.map(c => this.getCardNumericValue(c.value)).sort((a, b) => b - a);
    const values2 = hand2.map(c => this.getCardNumericValue(c.value)).sort((a, b) => b - a);
    
    // For ALL hands, compare card by card from highest to lowest
    // This ensures: K beats Q, A beats K, etc.
    for (let i = 0; i < 3; i++) {
      if (values1[i] > values2[i]) {
        return 1; // Hand 1 wins
      } else if (values1[i] < values2[i]) {
        return -1; // Hand 2 wins
      }
    }
    
    // Only tie if ALL 3 cards are identical
    return 0;
  }

  getMostFrequentValue(values) {
    const frequency = {};
    values.forEach(v => {
      frequency[v] = (frequency[v] || 0) + 1;
    });
    
    let maxCount = 0;
    let mostFrequent = 0;
    
    for (const [value, count] of Object.entries(frequency)) {
      if (count > maxCount) {
        maxCount = count;
        mostFrequent = parseInt(value);
      }
    }
    
    return mostFrequent;
  }

  async evaluatePokerGame() {
    try {
      const roomHand = this.evaluatePokerHand(this.pokerRoomCards);
      const dealerHand = this.evaluatePokerHand(this.pokerDealerCards);
      
      // Determine winner with proper tie-breaking
      let winner;
      let winningHand;
      
      if (roomHand.strength > dealerHand.strength) {
        winner = 'room';
        winningHand = roomHand;
      } else if (dealerHand.strength > roomHand.strength) {
        winner = 'dealer';
        winningHand = dealerHand;
      } else {
        // Same hand strength, need detailed comparison
        const comparison = this.comparePokerHands(this.pokerRoomCards, this.pokerDealerCards, roomHand.rank);
        
        if (comparison > 0) {
          winner = 'room';
          winningHand = roomHand;
        } else if (comparison < 0) {
          winner = 'dealer';
          winningHand = dealerHand;
        } else {
          // Only tie if hands are truly identical
          winner = 'tie';
          winningHand = roomHand;
        }
      }

      // Slot-style payout multipliers based on hand strength
      const payoutMultipliers = {
        'straight-flush': 40,  // Straight flush pays 40:1
        'three-of-a-kind': 30, // Three of a kind pays 30:1
        'straight': 6,         // Straight pays 6:1
        'flush': 4,            // Flush pays 4:1
        'pair': 2,             // Pair pays 2:1
        'high-card': 1         // High card pays 1:1 (even money)
      };

      let resultMessage = `🃏 **jirf Poker RESULTS** 🃏\n`;
      resultMessage += `🏠 Room: **${roomHand.name}**\n`;
      resultMessage += `🤖 Dealer: **${dealerHand.name}**\n\n`;

      if (winner === 'room') {
        resultMessage += `🎉 **ROOM WINS!** 🎉\n`;
        
        // Individual payouts based on each player's bet and hand strength
        const payout = payoutMultipliers[roomHand.rank] || 1;
        resultMessage += `🎰 **${roomHand.name}** pays **${payout}:1**\n\n`;
        
        this.pokerBets.forEach((bet, userId) => {
          const userStats = this.getUserStats(userId); // Use our stats system!
          const winnings = bet * payout; // Multiply bet by payout multiplier
          userStats.bankroll += winnings; // Add winnings (bet was already deducted)
          userStats.pokerWins = (userStats.pokerWins || 0) + 1;
          userStats.pokerTotal = (userStats.pokerTotal || 0) + 1;
          
          const userName = this.getUsernameById(userId) || 'Player';
          resultMessage += `💰 ${userName}: ${bet} × ${payout} = **+${winnings} chips**\n`;
          
          console.log(`🃏 Poker win tracked: ${userName} won ${winnings} chips (${userStats.pokerWins}W-${userStats.pokerTotal - userStats.pokerWins}L)`);
        });
        
      } else if (winner === 'dealer') {
        resultMessage += `🤖 **DEALER WINS!** 🤖\n\n`;
        
        // Track losses and show what each player lost
        this.pokerBets.forEach((bet, userId) => {
          const userStats = this.getUserStats(userId); // Use our stats system!
          userStats.pokerTotal = (userStats.pokerTotal || 0) + 1;
          const userName = this.getUsernameById(userId) || 'Player';
          resultMessage += `💸 ${userName} lost **-${bet} chips**\n`;
          
          console.log(`🃏 Poker loss tracked: ${userName} lost ${bet} chips (${userStats.pokerWins}W-${userStats.pokerTotal - userStats.pokerWins}L)`);
        });
        
      } else {
        resultMessage += `🤝 **TIE!** 🤝\n\n`;
        
        // Return bets (no poker stats change for ties)
        this.pokerBets.forEach((bet, userId) => {
          const userStats = this.getUserStats(userId); // Use our stats system!
          userStats.bankroll += bet; // Return bet
          const userName = this.getUsernameById(userId) || 'Player';
          resultMessage += `💵 ${userName}: **${bet} chips** returned\n`;
          
          console.log(`🃏 Poker tie: ${userName} got ${bet} chips back`);
        });
      }

      this.sendChat(resultMessage);
      
      // Reset game state
      this.resetPokerGame();

    } catch (error) {
      console.log(`❌ Evaluate poker game error: ${error.message}`);
      this.sendChat(`❌ **jirf Poker Error:** Failed to evaluate game.`);
      this.resetPokerGame();
    }
  }

  resetPokerGame() {
    this.pokerGameActive = false;
    this.pokerBets.clear();
    this.pokerRoomCards = [];
    this.pokerDealerCards = [];
    
    if (this.pokerBettingWindow) {
      clearTimeout(this.pokerBettingWindow);
      this.pokerBettingWindow = null;
    }
    
    if (this.pokerRevealTimeout) {
      clearTimeout(this.pokerRevealTimeout);
      this.pokerRevealTimeout = null;
    }
    
    console.log(`🃏 jirf Poker game reset`);
  }

  async generateWeatherImage(data) {
    try {
      const { location, current, forecast } = data;
      
      // Canvas dimensions
      const canvasWidth = 1000;
      const canvasHeight = 800;
      const canvas = createCanvas(canvasWidth, canvasHeight);
      const ctx = canvas.getContext('2d');
      
      // Create cute blue character pattern background manually
      try {
        // Base background color
        ctx.fillStyle = '#C3EEFF';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Draw cute blue characters in a pattern
        ctx.fillStyle = '#87CAEB';
        const characterSize = 40;
        const spacing = 120;
        
        for (let x = 0; x < canvasWidth + spacing; x += spacing) {
          for (let y = 0; y < canvasHeight + spacing; y += spacing) {
            // Character body (rounded rectangle)
            ctx.fillStyle = '#87CAEB';
            ctx.fillRect(x + 20, y + 20, characterSize, characterSize);
            
            // Character face (white circle)
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(x + 40, y + 35, 15, 0, 2 * Math.PI);
            ctx.fill();
            
            // Eyes (red dots)
            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.arc(x + 36, y + 32, 2, 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + 44, y + 32, 2, 0, 2 * Math.PI);
            ctx.fill();
            
            // Smile
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(x + 40, y + 37, 8, 0, Math.PI);
            ctx.stroke();
            
            // Nose
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(x + 40, y + 35, 1, 0, 2 * Math.PI);
            ctx.fill();
            
            // Buttons
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(x + 40, y + 55, 2, 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + 40, y + 62, 2, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
        
        // Add a semi-transparent white overlay for better text readability
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        console.log('✅ Custom character pattern background created');
      } catch (backgroundError) {
        console.log(`⚠️ Could not create custom background: ${backgroundError.message}`);
        // Fallback to gradient background
        const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
        gradient.addColorStop(0, '#87CEEB'); // Sky blue
        gradient.addColorStop(1, '#FFFFFF'); // White
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      }
      
      // Load and draw the Deepcut avatar (scaled down)
      try {
        const avatarUrl = 'https://deepcut.live/api/avatar.all';
        const response = await axios.get(avatarUrl);
        const avatars = response.data;
        
        // Find Jason avatar (ID 67) or use first available
        const jasonAvatar = avatars.find(avatar => avatar.id === 67) || avatars[0];
        if (jasonAvatar && jasonAvatar.url) {
          const avatarImage = await loadImage(jasonAvatar.url);
          
          // Draw multiple avatars in strategic positions as decorations
          const avatarPositions = [
            { x: 50, y: 50, size: 80 },      // Top left
            { x: canvasWidth - 130, y: 50, size: 70 },  // Top right
            { x: 30, y: canvasHeight - 130, size: 75 }, // Bottom left
            { x: canvasWidth - 120, y: canvasHeight - 140, size: 85 }, // Bottom right
            { x: canvasWidth/2 - 40, y: 120, size: 60 }, // Middle top
            { x: canvasWidth/2 - 35, y: canvasHeight - 120, size: 65 }  // Middle bottom
          ];
          
          avatarPositions.forEach(pos => {
            // Draw avatar with better visibility
            ctx.globalAlpha = 0.4; // Slightly more visible
            ctx.drawImage(avatarImage, pos.x, pos.y, pos.size, pos.size);
            
            // Add subtle shadow for better visibility
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(pos.x + 2, pos.y + 2, pos.size, pos.size);
            
            ctx.globalAlpha = 1.0; // Reset opacity
          });
        }
      } catch (avatarError) {
        console.log(`⚠️ Could not load avatar for decoration: ${avatarError.message}`);
      }
      
      // Header styling with larger fonts and better contrast
      ctx.fillStyle = '#1A252F'; // Darker for better contrast
      ctx.font = 'bold 64px Arial, sans-serif';
      ctx.textAlign = 'center';
      
      // Draw header with enhanced background for readability
      const headerText = "matt's Weather Report";
      const headerY = 90;
      
      // Header background with stronger opacity
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(100, headerY - 50, canvasWidth - 200, 100);
      
      // Add subtle border to header
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 2;
      ctx.strokeRect(100, headerY - 50, canvasWidth - 200, 100);
      
      // Header text
      ctx.fillStyle = '#1A252F';
      ctx.fillText(headerText, canvasWidth / 2, headerY);
      
      // Location with larger font
      ctx.font = 'bold 32px Arial, sans-serif';
      ctx.fillStyle = '#2C3E50';
      ctx.fillText(`📍 ${location}`, canvasWidth / 2, headerY + 60);
      
      // Current weather section with larger fonts and background
      const currentY = 200;
      
      // Current conditions background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(40, currentY - 20, canvasWidth - 80, 180);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, currentY - 20, canvasWidth - 80, 180);
      
      ctx.font = 'bold 28px Arial, sans-serif';
      ctx.fillStyle = '#1A252F';
      ctx.textAlign = 'left';
      ctx.fillText('🌡️ CURRENT CONDITIONS', 60, currentY + 10);
      
      // Current weather details with larger fonts
      const tempC = Math.round((current.temp - 32) * 5/9);
      const feelsLikeC = Math.round((current.feelsLike - 32) * 5/9);
      
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.fillStyle = '#1A252F';
      ctx.fillText(`Temperature: ${Math.round(current.temp)}°F (${tempC}°C)`, 80, currentY + 40);
      
      ctx.font = '20px Arial, sans-serif';
      ctx.fillStyle = '#2C3E50';
      ctx.fillText(`Feels like: ${Math.round(current.feelsLike)}°F (${feelsLikeC}°C)`, 80, currentY + 70);
      ctx.fillText(`Conditions: ${current.description}`, 80, currentY + 100);
      ctx.fillText(`Humidity: ${current.humidity}%`, 80, currentY + 130);
      ctx.fillText(`Wind: ${Math.round(current.windSpeed)} mph`, 80, currentY + 160);
      ctx.fillText(`High: ${Math.round(current.tempMax)}°F | Low: ${Math.round(current.tempMin)}°F`, 80, currentY + 190);
      
      // 5-day forecast section with larger fonts and better backgrounds
      const forecastY = currentY + 220;
      
      // Forecast section background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(40, forecastY - 20, canvasWidth - 80, 160);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(40, forecastY - 20, canvasWidth - 80, 160);
      
      ctx.font = 'bold 28px Arial, sans-serif';
      ctx.fillStyle = '#1A252F';
      ctx.textAlign = 'left';
      ctx.fillText('📅 5-DAY FORECAST', 60, forecastY + 10);
      
      const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const startX = 80;
      const dayWidth = 160;
      
      forecast.forEach((day, index) => {
        const x = startX + (index * dayWidth);
        const dayName = daysOfWeek[day.date.getDay()];
        const dateStr = `${day.date.getMonth() + 1}/${day.date.getDate()}`;
        const tempC = Math.round((day.temp - 32) * 5/9);
        
        // Day background with stronger contrast
        ctx.fillStyle = index === 0 ? 'rgba(52, 152, 219, 0.3)' : 'rgba(236, 240, 241, 0.7)';
        ctx.fillRect(x - 10, forecastY + 20, dayWidth - 20, 120);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 10, forecastY + 20, dayWidth - 20, 120);
        
        // Day info with larger fonts
        ctx.font = 'bold 18px Arial, sans-serif';
        ctx.fillStyle = '#1A252F';
        ctx.fillText(`${dayName} ${dateStr}`, x, forecastY + 45);
        
        ctx.font = 'bold 16px Arial, sans-serif';
        ctx.fillStyle = '#2C3E50';
        ctx.fillText(`${Math.round(day.temp)}°F (${tempC}°C)`, x, forecastY + 70);
        
        // Weather description (truncated if too long)
        ctx.font = '14px Arial, sans-serif';
        ctx.fillStyle = '#34495E';
        const description = day.description.length > 15 ? 
          day.description.substring(0, 15) + '...' : 
          day.description;
        ctx.fillText(description, x, forecastY + 90);
        
        ctx.font = '12px Arial, sans-serif';
        ctx.fillText(`Humidity: ${day.humidity}%`, x, forecastY + 110);
        ctx.fillText(`Wind: ${Math.round(day.windSpeed)} mph`, x, forecastY + 130);
      });
      
      // Footer with better visibility
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillStyle = '#2C3E50';
      ctx.textAlign = 'center';
      
      // Footer background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(canvasWidth/2 - 200, canvasHeight - 50, 400, 30);
      
      ctx.fillStyle = '#2C3E50';
      ctx.fillText('⚡ Powered by OpenWeather API', canvasWidth / 2, canvasHeight - 30);
      
      // Save the image
      const imagePath = path.join(__dirname, 'weather_report.png');
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(imagePath, buffer);
      
      console.log(`✅ Weather image generated: ${imagePath}`);
      return imagePath;
      
    } catch (error) {
      console.log(`❌ Weather image generation error: ${error.message}`);
      return null;
    }
  }

  async handleGlueCommand(senderId, senderName) {
    // Check if user is a mod OR co-owner
    const isCoOwner = await this.isUserCoOwner(senderId);
    const isMod = await this.isUserModerator(senderId);
    
    if (!isCoOwner && !isMod) {
      this.sendChat(`❌ Access denied. Only mods and co-owners can use this command.`);
      return;
    }

    try {
      if (this.gluedToFloor) {
        // Unglue the bot
        this.gluedToFloor = false;
        this.sendChat(`🔓 **BOT UNGLUED** 🔓\n**Bot can now auto-hop up to stage again.**\n**Unglued by:** ${senderName}`);
        console.log(`🔓 Bot unglued by ${senderName} (${senderId})`);
      } else {
        // Glue the bot to floor
        this.gluedToFloor = true;
        
        // Remove bot from stage if it's on stage
        const isOnStage = this.isUserOnStage(this.userId);
        if (isOnStage) {
          console.log(`🔒 Bot is on stage, removing from stage...`);
          await this.socket.action('removeDj', {});
          this.sendChat(`🔒 **BOT GLUED TO FLOOR** 🔒\n**Bot removed from stage and cannot auto-hop up.**\n**Glued by:** ${senderName}`);
        } else {
          this.sendChat(`🔒 **BOT GLUED TO FLOOR** 🔒\n**Bot cannot auto-hop up to stage.**\n**Glued by:** ${senderName}`);
        }
        
        console.log(`🔒 Bot glued to floor by ${senderName} (${senderId})`);
      }
      
    } catch (error) {
      console.log(`❌ Glue command error: ${error.message}`);
      this.sendChat(`❌ **Glue Error:** Failed to execute glue command.`);
    }
  }

  loadStats() {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Load from 3 separate organized files
      const userStatsFile = path.join(__dirname, 'user-stats.json');
      const songStatsFile = path.join(__dirname, 'song-stats.json');
      const userArtistsFile = path.join(__dirname, 'user-artists.json');
      
      // 1. Load user stats (bankroll, poker, reactions)
      if (fs.existsSync(userStatsFile)) {
        const userData = JSON.parse(fs.readFileSync(userStatsFile, 'utf8'));
        for (const [userId, stats] of Object.entries(userData)) {
          // SKIP bot's own stats - NEVER load them
          if (userId === this.userId) {
            console.log(`🤖 Skipping bot stats on load`);
            continue;
          }
          this.userStats.set(userId, {
            bankroll: stats.bankroll || 1000,
            pokerWins: stats.pokerWins || 0,
            pokerTotal: stats.pokerTotal || 0,
            upvotes: stats.upvotes || 0,
            downvotes: stats.downvotes || 0,
            stars: stats.stars || 0,
            artists: new Map() // Will be loaded from user-artists.json
          });
        }
      }
      
      // 2. Load song stats (song plays, first player)
      if (fs.existsSync(songStatsFile)) {
        const songData = JSON.parse(fs.readFileSync(songStatsFile, 'utf8'));
        for (const [songKey, stats] of Object.entries(songData)) {
          // SKIP bot songs - NEVER load them
          if (stats.firstPlayer === this.userId) {
            continue;
          }
          this.songStats.set(songKey, stats);
        }
      }
      
      // 3. Load user artists (top 3 per user)
      if (fs.existsSync(userArtistsFile)) {
        const artistData = JSON.parse(fs.readFileSync(userArtistsFile, 'utf8'));
        for (const [userId, artistCounts] of Object.entries(artistData)) {
          // SKIP bot's artists - NEVER load them
          if (userId === this.userId) {
            continue;
          }
          const userStats = this.userStats.get(userId);
          if (userStats) {
            userStats.artists = new Map(Object.entries(artistCounts));
          }
        }
      }
      
      console.log(`📊 Loaded stats: ${this.userStats.size} users, ${this.songStats.size} songs`);
      
    } catch (error) {
      console.log(`❌ Error loading stats: ${error.message}`);
      console.log(`📊 Starting with fresh stats`);
    }
  }

  saveStats() {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Save to 3 separate organized files
      const userStatsFile = path.join(__dirname, 'user-stats.json');
      const songStatsFile = path.join(__dirname, 'song-stats.json');
      const userArtistsFile = path.join(__dirname, 'user-artists.json');
      
      // 1. Save user stats (bankroll, poker, reactions) - SKIP BOT
      const userStatsObj = {};
      for (const [userId, stats] of this.userStats.entries()) {
        if (userId === this.userId) {
          continue; // NEVER save bot stats
        }
        userStatsObj[userId] = {
          bankroll: stats.bankroll || 1000,
          pokerWins: stats.pokerWins || 0,
          pokerTotal: stats.pokerTotal || 0,
          upvotes: stats.upvotes || 0,
          downvotes: stats.downvotes || 0,
          stars: stats.stars || 0
        };
      }
      fs.writeFileSync(userStatsFile, JSON.stringify(userStatsObj, null, 2));
      
      // 2. Save song stats (song plays, first player) - SKIP BOT SONGS
      const songStatsObj = {};
      for (const [songKey, stats] of this.songStats.entries()) {
        if (stats.firstPlayer === this.userId) {
          continue; // NEVER save bot songs
        }
        songStatsObj[songKey] = stats;
      }
      fs.writeFileSync(songStatsFile, JSON.stringify(songStatsObj, null, 2));
      
      // 3. Save user artists (top 3 per user) - SKIP BOT
      const userArtistsObj = {};
      for (const [userId, stats] of this.userStats.entries()) {
        if (userId === this.userId) {
          continue; // NEVER save bot artists
        }
        if (stats.artists && stats.artists.size > 0) {
          userArtistsObj[userId] = Object.fromEntries(stats.artists);
        }
      }
      fs.writeFileSync(userArtistsFile, JSON.stringify(userArtistsObj, null, 2));
      
      console.log(`📊 Stats saved: ${this.userStats.size} users, ${this.songStats.size} songs`);
    } catch (error) {
      console.log(`❌ Error saving stats: ${error.message}`);
    }
  }

  // Track reactions from room voting
  trackReactions(message) {
    try {
      if (!this.state || !this.state.nowPlaying || !this.state.allVotes) {
        return;
      }

      const currentSong = this.state.nowPlaying.song;
      if (!currentSong) return;

      // Find which DJ is playing the current song
      let currentDJ = null;
      if (this.state.djs) {
        for (const dj of this.state.djs) {
          if (dj.song && dj.song.songId === currentSong.songId) {
            currentDJ = dj;
            break;
          }
        }
      }

      if (!currentDJ || !currentDJ.uuid) return;

      const djUserId = currentDJ.uuid;
      
      // Update user reaction stats
      this.updateReactionStats(djUserId);
      
      // Update song reaction stats
      this.updateSongReactionStats(currentSong);
    } catch (error) {
      console.log(`❌ Error tracking reactions: ${error.message}`);
    }
  }

  // Update reaction stats for a specific user (CUMULATIVE - adds current song's votes to total)
  updateReactionStats(userId) {
    try {
      const userStats = this.getUserStats(userId);

      // Count votes from allVotes object for the CURRENT song that just finished
      const allVotes = this.state.allVotes;
      if (allVotes) {
        // ADD current song's likes to user's total upvotes (cumulative)
        if (allVotes.like && Array.isArray(allVotes.like)) {
          const currentSongUpvotes = allVotes.like.length;
          userStats.upvotes = (userStats.upvotes || 0) + currentSongUpvotes;
          console.log(`👍 Added ${currentSongUpvotes} upvotes to ${userId}'s total (now: ${userStats.upvotes})`);
        }

        // ADD current song's stars to user's total stars (cumulative)
        if (allVotes.star && Array.isArray(allVotes.star)) {
          const currentSongStars = allVotes.star.length;
          userStats.stars = (userStats.stars || 0) + currentSongStars;
          console.log(`⭐ Added ${currentSongStars} stars to ${userId}'s total (now: ${userStats.stars})`);
        }

        // Note: Downvotes not currently tracked by hang.fm API
      }

      console.log(`📊 Updated reactions for user ${userId}: ${userStats.upvotes} total upvotes, ${userStats.stars} total stars`);
    } catch (error) {
      console.log(`❌ Error updating reaction stats: ${error.message}`);
    }
  }

  // Update reaction stats for a specific song
  updateSongReactionStats(song) {
    try {
      const songKey = `${song.artistName} - ${song.trackName}`;
      const songStats = this.songStats.get(songKey);
      
      if (!songStats) {
        // Song not in stats yet, skip
        return;
      }

      // Count votes from allVotes object
      const allVotes = this.state.allVotes;
      if (allVotes) {
        // Count likes (upvotes)
        if (allVotes.like && Array.isArray(allVotes.like)) {
          songStats.likes = allVotes.like.length;
        }

        // Count stars
        if (allVotes.star && Array.isArray(allVotes.star)) {
          songStats.stars = allVotes.star.length;
        }

        // Count dislikes (if available)
        if (allVotes.dislike && Array.isArray(allVotes.dislike)) {
          songStats.dislikes = allVotes.dislike.length;
        }
      }

      console.log(`🎵 Updated song reactions: "${songKey}" - ${songStats.likes} likes, ${songStats.stars} stars`);
      
      // Save stats after updating
      this.saveStats();
    } catch (error) {
      console.log(`❌ Error updating song reaction stats: ${error.message}`);
    }
  }

  // Get current room statistics
  getRoomStats() {
    try {
      const djCount = this.state && this.state.djs ? this.state.djs.length : 0;
      const audienceCount = this.state && this.state.audienceUsers ? this.state.audienceUsers.length : 0;
      
      return {
        djCount,
        audienceCount,
        totalUsers: djCount + audienceCount
      };
    } catch (error) {
      console.log(`❌ Error getting room stats: ${error.message}`);
      return { djCount: 0, audienceCount: 0, totalUsers: 0 };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SPOTIFY API INTEGRATION (no AI tokens used)
  // ═══════════════════════════════════════════════════════════════
  
  async getSpotifyAccessToken() {
    try {
      if (!this.spotifyEnabled || !this.spotifyClientId || !this.spotifyClientSecret) {
        return null;
      }
      
      const auth = Buffer.from(`${this.spotifyClientId}:${this.spotifyClientSecret}`).toString('base64');
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 5000
        }
      );
      
      this.spotifyAccessToken = response.data.access_token;
      console.log(`✅ Spotify access token obtained`);
      return this.spotifyAccessToken;
    } catch (error) {
      console.log(`❌ Spotify auth error: ${error.message}`);
      return null;
    }
  }

  async searchSpotify(artist, track) {
    try {
      if (!this.spotifyEnabled) return null;
      
      if (!this.spotifyAccessToken) {
        await this.getSpotifyAccessToken();
      }
      
      if (!this.spotifyAccessToken) return null;
      
      const query = `artist:${artist} track:${track}`;
      const response = await axios.get(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
        {
          headers: {
            'Authorization': `Bearer ${this.spotifyAccessToken}`
          },
          timeout: 5000
        }
      );
      
      if (response.data?.tracks?.items?.[0]) {
        const spotifyTrack = response.data.tracks.items[0];
        
        // Get artist genres from the artist object (more accurate than album genres)
        let artistGenres = [];
        if (spotifyTrack.artists?.[0]?.id) {
          try {
            const artistId = spotifyTrack.artists[0].id;
            const artistResponse = await axios.get(
              `https://api.spotify.com/v1/artists/${artistId}`,
              {
                headers: {
                  'Authorization': `Bearer ${this.spotifyAccessToken}`
                },
                timeout: 5000
              }
            );
            artistGenres = artistResponse.data?.genres || [];
          } catch (artistError) {
            if (this.verboseMode) console.log(`⚠️ Could not fetch artist genres: ${artistError.message}`);
          }
        }
        
        return {
          album: spotifyTrack.album.name,
          releaseDate: spotifyTrack.album.release_date,
          popularity: spotifyTrack.popularity,
          durationMs: spotifyTrack.duration_ms,
          explicit: spotifyTrack.explicit,
          genres: artistGenres.length > 0 ? artistGenres : (spotifyTrack.album.genres || []),
          artistName: spotifyTrack.artists[0]?.name || artist
        };
      }
      
      return null;
    } catch (error) {
      if (error.response?.status === 401) {
        // Token expired, refresh it
        this.spotifyAccessToken = null;
        return await this.searchSpotify(artist, track);
      }
      if (this.verboseMode) console.log(`⚠️ Spotify search failed: ${error.message}`);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // DISCOGS API INTEGRATION (no AI tokens used)
  // ═══════════════════════════════════════════════════════════════
  
  async searchDiscogs(artist, track = null) {
    try {
      if (!this.discogsEnabled || !this.discogsToken) return null;
      
      const query = track ? `${artist} ${track}` : artist;
      const response = await axios.get(
        `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&format=album`,
        {
          headers: {
            'Authorization': `Discogs token=${this.discogsToken}`,
            'User-Agent': 'HangFM-Bot/1.0'
          },
          timeout: 5000
        }
      );
      
      if (response.data?.results?.[0]) {
        const release = response.data.results[0];
        return {
          title: release.title,
          year: release.year,
          label: release.label?.[0],
          genre: release.genre?.[0],
          style: release.style?.[0],
          country: release.country
        };
      }
      
      return null;
    } catch (error) {
      if (this.verboseMode) console.log(`⚠️ Discogs search failed: ${error.message}`);
      return null;
    }
  }

  // Poker game methods
  isStraight(values) {
    // Sort values and check for consecutive sequence
    const sorted = values.sort((a, b) => a - b);
    
    // Check for A-2-3 straight
    if (sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 14) {
      return true;
    }
    
    // Check for regular straight
    return sorted[1] === sorted[0] + 1 && sorted[2] === sorted[1] + 1;
  }

  comparePokerHands(hand1, hand2, handRank) {
    // Get numeric values for both hands
    const values1 = hand1.map(c => this.getCardNumericValue(c.value));
    const values2 = hand2.map(c => this.getCardNumericValue(c.value));
    
    switch (handRank) {
      case 'straight_flush':
      case 'straight':
        // For straights, compare the highest card
        // Handle A-2-3 straight (Ace = 1 for comparison)
        const high1 = this.isStraight(values1) && values1.includes(14) && values1.includes(2) ? 3 : Math.max(...values1);
        const high2 = this.isStraight(values2) && values2.includes(14) && values2.includes(2) ? 3 : Math.max(...values2);
        return high1 - high2;
        
      case 'three_of_a_kind':
        // For three of a kind, compare the three matching cards
        const three1 = this.getMostFrequentValue(values1);
        const three2 = this.getMostFrequentValue(values2);
        return three1 - three2;
        
      case 'flush':
        // For flush, compare highest card, then second highest, then lowest
        const sorted1 = values1.sort((a, b) => b - a);
        const sorted2 = values2.sort((a, b) => b - a);
        
        for (let i = 0; i < 3; i++) {
          if (sorted1[i] !== sorted2[i]) {
            return sorted1[i] - sorted2[i];
          }
        }
        return 0; // Identical hands
        
      case 'pair':
        // For pair, compare pair value first, then kicker
        const pair1 = this.getMostFrequentValue(values1);
        const pair2 = this.getMostFrequentValue(values2);
        
        if (pair1 !== pair2) {
          return pair1 - pair2;
        }
        
        // Same pair, compare kicker
        const kicker1 = values1.find(v => v !== pair1);
        const kicker2 = values2.find(v => v !== pair2);
        return kicker1 - kicker2;
        
      case 'high_card':
        // For high card, compare cards in descending order
        const sortedHigh1 = values1.sort((a, b) => b - a);
        const sortedHigh2 = values2.sort((a, b) => b - a);
        
        for (let i = 0; i < 3; i++) {
          if (sortedHigh1[i] !== sortedHigh2[i]) {
            return sortedHigh1[i] - sortedHigh2[i];
          }
        }
        return 0; // Identical hands
        
      default:
        return 0;
    }
  }

  getMostFrequentValue(values) {
    const frequency = {};
    values.forEach(v => {
      frequency[v] = (frequency[v] || 0) + 1;
    });
    
    // Find the value that appears most frequently
    let maxCount = 0;
    let mostFrequent = 0;
    
    for (const [value, count] of Object.entries(frequency)) {
      if (count > maxCount) {
        maxCount = count;
        mostFrequent = parseInt(value);
      }
    }
    
    return mostFrequent;
  }
}

// Set up global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.log(`❌ Unhandled Promise Rejection: ${reason}`);
  // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
  console.log(`❌ Uncaught Exception: ${error.message}`);
  // Don't exit the process, just log the error
});

// Start the bot
const bot = new HangFmBot();
bot.connect().catch(error => {
  console.error('Failed to start bot:', error);
  console.log('🤖 Bot will retry connection...');
  // Don't exit immediately, let the bot handle reconnection
});

// Handle graceful shutdown
  process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down bot...');
  bot.saveUptimeData();
    process.exit(0);
  });

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down bot...');
  bot.saveUptimeData();
  process.exit(0);
});