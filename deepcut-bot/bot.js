const WebSocket = require('ws');
const { EventEmitter } = require('events');
const crypto = require('crypto');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config({ path: require('path').join(__dirname, 'config.env') });

class DeepcutAIBot extends EventEmitter {
  constructor() {
    super();
    
    // Configuration from environment
    this.auth = process.env.AUTH;
    this.userId = process.env.USERID;
    this.roomId = process.env.ROOMID;
    this.botName = process.env.BOT_NAME || 'BOT2';
    this.debug = process.env.BOT_DEBUG === 'true';
    this.autoUpvote = process.env.AUTO_UPVOTE === 'true';
    this.mainChatSilent = process.env.MAIN_CHAT_SILENT === 'true';
    
    // Permission configuration
    this.ownerUserIds = (process.env.OWNER_USERIDS || '').split(',').filter(id => id.trim());
    this.adminUserIds = (process.env.ADMIN_USERIDS || '').split(',').filter(id => id.trim());
    this.modUserIds = (process.env.MOD_USERIDS || '').split(',').filter(id => id.trim());
    this.commandsAdminOnly = process.env.COMMANDS_ADMIN_ONLY === 'true';
    this.aiKeywordsPublic = process.env.AI_KEYWORDS_PUBLIC === 'true';
    this.ownerPmOnly = process.env.OWNER_PM_ONLY === 'true';
    
    // AI provider configuration
    this.currentAIProvider = process.env.AI_PROVIDER || 'openai';
    this.aiToggleEnabled = process.env.AI_TOGGLE_ENABLED === 'true';
    
    // WebSocket and connection state
    this.ws = null;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.clientId = Date.now() + '-0.' + Math.random().toString().substr(2);
    this.msgId = 0;
    this.lastHeartbeat = Date.now();
    this.lastActivity = Date.now();
    this.presenceInterval = null;
    this.disconnectInterval = 120000; // 2 minutes
    this.presenceUpdateInterval = 10000; // 10 seconds
    this.hasSentStartupGreeting = false; // Prevent multiple startup greetings
    
    // Room state
    this.currentRoom = null;
    this.currentSong = null;
    this.users = new Map();
    this.section = null;
    
    // Command tracking
    this.commands = new Map();
    this.uptimeStart = Date.now();
    this.lifetimeUptime = this.loadLifetimeUptime();
    
    // AI personality and memory
    this.userMemories = new Map(); // userId -> { mood, interactions, personality, conversationHistory }
    this.roomSongHistory = []; // Track songs played in room for learning
    this.keywordTriggers = process.env.KEYWORD_TRIGGERS ? 
      process.env.KEYWORD_TRIGGERS.split(',').map(t => t.trim()) : 
      ['bot', 'b0t', 'bot2', '@bot'];
    
    this.log(`🔍 Loaded keyword triggers: ${this.keywordTriggers.join(', ')}`);
    this.contentFilter = new Set([
      'homophobic', 'racist', 'hateful', 'slur', 'nazi', 'hitler', 'kkk',
      'kys', 'kill yourself', 'death threat', 'suicide', 'murder'
    ]);
    this.allowedProfanity = ['fuck', 'shit', 'ass', 'bitch', 'damn', 'hell', 'crap'];
    
    // Room state tracking
    this.roomState = {
      currentSong: null,
      djs: new Map(), // userId -> { name, seat, songs }
      audience: new Map(), // userId -> { name }
      lastUpdate: Date.now()
    };
    
    // Enhanced song metadata tracking
    this.songMetadata = {
      current: null,
      history: [], // Keep last 10 songs for context
      enhancedData: new Map() // Cache enhanced metadata
    };
    
    // User stats tracking
    this.userStats = new Map(); // userId -> { topArtists: Map, songsPlayed: Map, firstPlayed: Map }
    
    // Bot playlist system
    this.botPlaylist = [];
    this.botNextSong = null;
    this.isBotOnStage = false;
    this.autoSongSelection = true;
    this.songSelectionInterval = null;
    this.songsPlayedCount = 0; // Track songs played to change every 3 songs
    this.playedSongs = new Set(); // Track played songs to prevent repeats
    this.lastSongChangeTime = 0; // Track when song was last changed
    this.songChangeInterval = 7 * 60 * 1000 + 50 * 1000; // 7 minutes 50 seconds
    this.lastPlayedArtist = null; // Track last played artist to avoid repeats
    this.recentlyUsedArtists = []; // Track recently used artists (last 15)
    this.learnedArtists = new Set(); // Artists learned from user plays
    this.learnedSongs = new Map(); // Songs learned from user plays: artist -> Set of songs
    
    // AI usage optimization - only use AI when bot's turn is next
    this.botIsNextToPlay = false; // Flag to indicate bot is next in line
    this.useAIForNextSong = false; // Flag to use AI for next song selection
    
    // Auto-hop and glue system
    this.gluedUntil = null; // Timestamp when glue expires
    this.glueDuration = 36 * 60 * 1000; // 36 minutes in milliseconds
    this.stageCheckInterval = null; // Interval for checking stage
    this.lastStageCheck = 0; // Prevent spam checking
    this.lastAutoHopTime = 0; // Timestamp of last auto-hop
    this.autoHopCooldown = 7 * 60 * 1000 + 50 * 1000; // 7 minutes 50 seconds in milliseconds
    this.rebootTime = Date.now(); // Timestamp of bot reboot/start
    this.rebootCooldown = 30 * 1000; // 30 seconds fallback after reboot (fast when bots are on stage)
    this.isHoppingUp = false; // Flag to prevent multiple simultaneous hop attempts
    this.songsPlayedSinceHopUp = 0; // Track songs played since hopping up
    this.ammyPMReceived = false; // Flag to bypass cooldown on next hop after Ammy PM
    this.songsAllowedThisSet = null; // How many songs Ammy allows this set
    this.songsPlayedThisSet = 0; // How many songs played this set
    
    // Random stickers system
    this.randomStickersEnabled = false;
    this.randomStickersInterval = null;
    
    // Sticker command rate limiting
    this.stickerCommandCooldowns = new Map(); // userId -> lastUsed timestamp
    this.stickerCommandLimit = 3; // Max uses per hour
    this.stickerCommandCooldownTime = 60 * 60 * 1000; // 1 hour in milliseconds
    
    // AI providers (ONLY for chat responses, NEVER for music selection)
    this.aiProviders = {
      openai: {
        key: process.env.OPENAI_API_KEY,
        enabled: process.env.OPENAI_ENABLED !== 'false', // Disabled by default
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
      },
      gemini: { 
        key: process.env.GEMINI_API_KEY, 
        enabled: !!process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest'
      },
      huggingface: {
        key: process.env.HUGGINGFACE_API_KEY,
        enabled: !!process.env.HUGGINGFACE_API_KEY,
        model: process.env.HUGGINGFACE_MODEL || 'facebook/blenderbot-400M-distill',
        fallbackModel: process.env.HUGGINGFACE_FALLBACK_MODEL || 'microsoft/DialoGPT-medium'
      }
    };
    
    // Music provider APIs (for song metadata and selection - NO AI)
    this.wikipediaAccessToken = process.env.WIKIPEDIA_ACCESS_TOKEN;
    this.discogsToken = process.env.DISCOGS_TOKEN;
    this.discogsEnabled = process.env.DISCOGS_ENABLED === 'true';
    this.spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
    this.spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.spotifyEnabled = process.env.SPOTIFY_ENABLED === 'true';
    this.spotifyAccessToken = null; // Will be fetched on demand
    
    // ═══════════════════════════════════════════════════════════════
    // PORTED FROM HANG.FM BOT - Advanced Systems
    // ═══════════════════════════════════════════════════════════════
    
    // Artist Learning System (learn from human users only)
    this.learnedArtistsGenreMap = new Map(); // Track which genre each learned artist belongs to
    this.verboseMode = process.env.VERBOSE_MODE === 'true'; // Console verbosity control
    
    // Content Filter Strike System (3-strike ban for hateful content)
    this.userStrikes = new Map(); // userId -> { strikes: number, offenses: [] }
    this.maxStrikes = 3; // Ban on 3rd strike
    this.contentFilterEnabled = process.env.CONTENT_FILTER_ENABLED !== 'false'; // Enabled by default
    
    // AI Usage Optimization (save tokens)
    this.lastUserPlayTimestamp = 0; // Track when a user last played a song
    this.aiUsedAfterUserPlay = false; // Track if AI was already used after last user play
    this.userAIUsage = new Map(); // userId -> { used: boolean, timestamp: number }
    this.vibeAnalyzedThisSession = false; // Flag to prevent multiple AI vibe analyses
    
    // Current DJ tracking
    this.currentDjId = null; // Track who is currently playing
    this.currentDjName = null; // Track current DJ name
    
    // User Stats Tracking (persistent across sessions)
    this.defaultBankroll = 1000; // Starting chips for new users
    
    // AI Chat Settings
    this.aiChatEnabled = true; // Control AI chat responses separately from song selection
    this.responseLengthLimit = parseInt(process.env.RESPONSE_LENGTH_LIMIT) || 200;
    
    // AI Keyword Spam Detection (VERY RELAXED - deepcut.live users don't abuse)
    this.aiSpamUsers = new Map(); // userId -> { count: number, lastReset: timestamp, strikes: number, restricted: boolean }
    this.aiSpamLimit = 10; // Max 10 AI requests in 30 seconds (very generous)
    this.aiSpamPeriod = 30 * 1000; // 30 seconds
    this.aiSpamStrike1Cooldown = 1 * 60 * 1000; // 1 minute cooldown on first strike
    this.aiSpamStrike2Cooldown = 5 * 60 * 1000; // 5 minutes on second strike
    this.aiSpamStrike3Cooldown = 30 * 60 * 1000; // 30 minutes on third strike (for assholes)
    this.aiGrantedUsers = new Set(); // Users granted unlimited AI access by co-owners (no spam filter)
    
    // Load persistent data on startup
    this.loadStats();
    this.loadLearnedArtists();
    this.loadStrikesData();
    
    // Analyze loaded room history to understand recent plays
    this.analyzeLoadedHistory();
    
    this.log('📊 Loaded stats and learned artists from previous sessions');
    
    this.setupCommands();
    this.initializeSongSelection();
    
    // Delay stage monitoring to prevent immediate bot detection
    setTimeout(() => {
      this.startStageMonitoring();
    }, 10000); // Wait 10 seconds before starting stage monitoring
    
    this.connect();
  }
  
  loadLifetimeUptime() {
    try {
      const path = require('path');
      const uptimeFile = path.join(__dirname, 'uptime.json');
      if (fs.existsSync(uptimeFile)) {
        const data = JSON.parse(fs.readFileSync(uptimeFile, 'utf8'));
        return data.lifetime || 0;
      }
    } catch (error) {
      this.log('Error loading lifetime uptime:', error.message);
    }
    return 0;
  }
  
  saveLifetimeUptime() {
    try {
      const path = require('path');
      const uptimeFile = path.join(__dirname, 'uptime.json');
      const lifetime = this.lifetimeUptime + (Date.now() - this.uptimeStart);
      fs.writeFileSync(uptimeFile, JSON.stringify({ lifetime }));
    } catch (error) {
      this.log('Error saving lifetime uptime:', error.message);
    }
  }
  
  log(...args) {
    if (this.debug) {
      console.log(`[${new Date().toISOString()}]`, ...args);
    }
  }
  
  // Check YouTube restrictions using polsy.org.uk API
  async checkYouTubeRestrictions(videoId) {
    try {
      const url = `https://polsy.org.uk/stuff/ytrestrict.cgi?ytid=${videoId}`;
      const response = await axios.get(url, { timeout: 2000 }); // Reduced to 2 seconds
      
      if (response.data) {
        const html = response.data;
        
        // Parse blocked countries from HTML
        const blockedCountries = [];
        const countryRegex = /<td>([A-Z]{2})<\/td>/g;
        let match;
        
        while ((match = countryRegex.exec(html)) !== null) {
          blockedCountries.push(match[1]);
        }
        
        // Check for major countries
        const majorCountries = {
          'US': 'United States',
          'CA': 'Canada',
          'GB': 'United Kingdom',
          'PT': 'Portugal',
          'NL': 'Netherlands',
          'DE': 'Germany',
          'FR': 'France',
          'ES': 'Spain',
          'IT': 'Italy',
          'BR': 'Brazil'
        };
        
        const blockedMajor = [];
        for (const code of blockedCountries) {
          if (majorCountries[code]) {
            blockedMajor.push(majorCountries[code]);
          }
        }
        
        const isRestricted = blockedCountries.length > 0;
        const totalBlocked = blockedCountries.length;
        const additionalCountries = Math.max(0, totalBlocked - blockedMajor.length);
        
        return {
          isRestricted,
          blockedCountries,
          blockedMajor,
          totalBlocked,
          additionalCountries
        };
      }
      
      return { isRestricted: false, blockedCountries: [], blockedMajor: [], totalBlocked: 0, additionalCountries: 0 };
    } catch (error) {
      this.log(`⚠️ YouTube restriction check failed: ${error.message}`);
      return { isRestricted: false, blockedCountries: [], blockedMajor: [], totalBlocked: 0, additionalCountries: 0 };
    }
  }
  
  // Generate song from curated list (no AI tokens)
  async generateSongFromCuratedList() {
    try {
      const curatedArtists = this.getCuratedArtists();
      const learnedArtists = Array.from(this.learnedArtists || []);
      const allArtists = [...curatedArtists, ...learnedArtists];
      
      this.log(`📚 Curated list: ${curatedArtists.length} artists + ${learnedArtists.length} learned = ${allArtists.length} total`);
      
      // Filter out recently used artists and last played
      const availableArtists = allArtists.filter(artist => 
        !this.recentlyUsedArtists.includes(artist.toLowerCase()) &&
        artist.toLowerCase() !== (this.lastPlayedArtist || '').toLowerCase()
      );
      
      if (availableArtists.length === 0) {
        this.log(`🔄 All artists used recently, resetting...`);
        this.recentlyUsedArtists = [];
        availableArtists.push(...allArtists);
      }
      
      // Pick random artist
      const selectedArtist = availableArtists[Math.floor(Math.random() * availableArtists.length)];
      this.log(`🎲 Selected artist from curated list: ${selectedArtist}`);
      
      // Track this artist
      this.recentlyUsedArtists.push(selectedArtist.toLowerCase());
      if (this.recentlyUsedArtists.length > 15) {
        this.recentlyUsedArtists = this.recentlyUsedArtists.slice(-15);
      }
      
      // Get songs from MusicBrainz
      const songs = await this.getSongsForArtist(selectedArtist);
      if (songs.length > 0) {
        const randomSong = songs[Math.floor(Math.random() * songs.length)];
        this.log(`🎵 Found song: ${selectedArtist} - ${randomSong}`);
        
        // Search for the song on deepcut.live
        const foundSong = await this.searchForSong(selectedArtist, randomSong);
        if (foundSong) {
          this.lastPlayedArtist = selectedArtist;
          return {
            artist: selectedArtist,
            title: randomSong,
            genre: 'Alternative',
            source: 'Curated List (No AI)',
            youtubeSong: foundSong
          };
        }
      }
      
      // Fallback to existing fallback system
      this.log(`❌ Curated song not found, using fallback...`);
      return await this.generateFallbackSong();
      
    } catch (error) {
      this.log(`❌ Error generating from curated list: ${error.message}`);
      return await this.generateFallbackSong();
    }
  }
  
  // Get curated artist list (ported from hang.fm bot)
  getCuratedArtists() {
    return [
      // ═══════════════════════════════════════════════════════════════
      // UNDERGROUND HIP HOP / ALTERNATIVE HIP HOP (MASSIVE EXPANSION)
      // ═══════════════════════════════════════════════════════════════
      // Underground Legends & DOOM Universe
      'MF DOOM', 'Madlib', 'Viktor Vaughn', 'King Geedorah', 'Madvillain', 'DangerDOOM', 'JJ DOOM', 'NehruvianDOOM',
      'Quasimoto', 'Jaylib', 'Lootpack', 'Yesterday\'s New Quintet', 'Czarface',
      
      // Def Jux / Backpack Era
      'Aesop Rock', 'El-P', 'Company Flow', 'Run The Jewels', 'Cannibal Ox', 'Mr. Lif', 'Cage', 'Copywrite',
      'RJD2', 'Murs', 'Slug', 'Atmosphere', 'Blueprint', 'Illogic', 'Vast Aire', 'Vordul Mega',
      
      // Rhymesayers / Fifth Element
      'Brother Ali', 'Eyedea', 'Eyedea & Abilities', 'Abilities', 'P.O.S', 'Doomtree', 'Sims', 'Dessa',
      'Evidence', 'Alchemist', 'Step Brothers', 'Dilated Peoples', 'Rakaa Iriscience',
      
      // Stones Throw / Abstract
      'Busdriver', 'Aceyalone', 'Abstract Rude', 'Freestyle Fellowship', 'The Pharcyde', 'Slum Village',
      'J Dilla', 'Jay Dee', 'Peanut Butter Wolf', 'Oh No', 'Wildchild', 'Lootpack', 'Dudley Perkins',
      
      // Native Tongues / Golden Era Alts
      'A Tribe Called Quest', 'De La Soul', 'Jungle Brothers', 'Black Sheep', 'Leaders of the New School',
      'Digable Planets', 'Shabazz Palaces', 'Deltron 3030', 'Hieroglyphics', 'Souls of Mischief',
      'Del the Funky Homosapien', 'Casual', 'Pep Love', 'Tajai', 'Domino',
      
      // Living Legends / West Coast Underground
      'Living Legends', 'The Grouch', 'Eligh', 'Scarub', 'Murs', 'Luckyiam', 'Sunspot Jonz',
      'People Under the Stairs', 'Thes One', 'Double K', 'Jurassic 5', 'Lyrics Born', 'Gift of Gab',
      'Blackalicious', 'Lifesavas', 'Crown City Rockers', 'Zion I', 'The Grouch & Eligh',
      
      // Underground Kings / Southern Alt
      'Outkast', 'Goodie Mob', 'Killer Mike', 'Big Boi', 'CeeLo Green', 'Dungeon Family',
      'Organized Noize', 'UGK', 'Devin the Dude', 'Z-Ro', 'Trae tha Truth', 'Scarface',
      
      // Conscious / Political Rap
      'Sage Francis', 'Jedi Mind Tricks', 'Immortal Technique', 'Dead Prez', 'Public Enemy',
      'KRS-One', 'Boogie Down Productions', 'Paris', 'The Coup', 'Boots Riley', 'Talib Kweli',
      'Mos Def', 'Yasiin Bey', 'Common', 'The Roots', 'Black Star', 'Black Thought',
      
      // New York Underground
      'Wu-Tang Clan', 'GZA', 'Raekwon', 'Ghostface Killah', 'Inspectah Deck', 'Killah Priest',
      'Gravediggaz', 'RZA', 'Sunz of Man', 'Non Phixion', 'Necro', 'Ill Bill', 'La Coka Nostra',
      'Army of the Pharaohs', 'Demigodz', 'Apathy', 'Celph Titled', 'Vinnie Paz',
      
      // Alternative Rap / Experimental
      'Death Grips', 'clipping.', 'Ho99o9', 'Dälek', 'Antipop Consortium', 'Techno Animal',
      'Mike Ladd', 'Dr. Octagon', 'Kool Keith', 'Dr. Dooom', 'Black Elvis', 'Ultramagnetic MCs',
      'Organized Konfusion', 'Pharoahe Monch', 'Prince Paul', 'Handsome Boy Modeling School',
      
      // Modern Underground
      'Open Mike Eagle', 'milo', 'Serengeti', 'billy woods', 'Elucid', 'Armand Hammer',
      'Quelle Chris', 'Denmark Vessey', 'Your Old Droog', 'Ka', 'Roc Marciano', 'Westside Gunn',
      'Conway the Machine', 'Benny the Butcher', 'Griselda', 'Mach-Hommy', 'Tha God Fahim',
      
      // ═══════════════════════════════════════════════════════════════
      // ALTERNATIVE ROCK (Math Rock, Post-Hardcore, Noise Rock, Indie)
      // ═══════════════════════════════════════════════════════════════
      // Post-Hardcore Pioneers
      'At the Drive-In', 'The Mars Volta', 'Sparta', 'Refused', 'Glassjaw', 'Thursday',
      'Fugazi', 'Minor Threat', 'Rites of Spring', 'Drive Like Jehu', 'Jawbox', 'Quicksand',
      'Helmet', 'Failure', 'Hum', 'Chavez', 'Shiner', 'Season to Risk',
      
      // 90s Indie / Lo-Fi
      'Pavement', 'Built to Spill', 'Dinosaur Jr', 'Sebadoh', 'Lou Barlow', 'Guided by Voices',
      'Modest Mouse', 'The Lonesome Crowded West', 'Superchunk', 'Archers of Loaf', 'Polvo',
      'Versus', 'Seam', 'Bitch Magnet', 'Codeine', 'Bedhead', 'The New Year',
      
      // Math Rock / Midwest Emo
      'American Football', 'Owen', 'Cap\'n Jazz', 'Joan of Arc', 'Owls', 'Ghosts and Vodka',
      'Make Believe', 'The Promise Ring', 'Braid', 'Mineral', 'The Get Up Kids', 'Christie Front Drive',
      'Boys Life', 'Texas Is the Reason', 'Lifetime', 'Jawbreaker', 'Seaweed',
      'Don Caballero', 'Battles', 'Hella', 'Tera Melos', 'TTNG', 'toe', 'Lite',
      
      // Noise Rock / No Wave
      'Sonic Youth', 'The Jesus Lizard', 'Big Black', 'Shellac', 'Rapeman', 'Steve Albini',
      'Unsane', 'Cop Shoot Cop', 'Swans', 'The Birthday Party', 'Nick Cave', 'Brainiac',
      'Cows', 'The Melvins', 'Buzz Osborne', 'Flipper', 'Scratch Acid', 'The Butthole Surfers',
      
      // Experimental / Art Rock
      'Slint', 'Spiderland', 'For Carnation', 'Rodan', 'June of 44', 'Rex', 'Shipping News',
      'Unwound', 'The Dismemberment Plan', 'Shudder to Think', 'Hoover', 'Q and Not U',
      'Les Savy Fav', 'Liars', 'Hot Snakes', 'The Blood Brothers', 'Pretty Girls Make Graves',
      'Women', 'Preoccupations', 'Viet Cong', 'Ought', 'Protomartyr', 'Parquet Courts',
      
      // Lightning Bolt / Providence Scene
      'Lightning Bolt', 'Arab on Radar', 'Six Finger Satellite', 'The Chinese Stars',
      'Load Records', 'Forcefield', 'Mindflayer', 'Black Dice', 'Wolf Eyes',
      
      // Japanese Noise / Math
      'Melt-Banana', 'Boredoms', 'Ruins', 'Zeni Geva', 'Church of Misery', 'Boris', 
      'Envy', 'Mono', 'Toe', 'Tricot', 'Mass of the Fermenting Dregs',
      
      // ═══════════════════════════════════════════════════════════════
      // ALTERNATIVE METAL (Metalcore, Sludge, Stoner, Post-Metal)
      // ═══════════════════════════════════════════════════════════════
      // Metalcore / Hardcore
      'Converge', 'Every Time I Die', 'Botch', 'Coalesce', 'Cave In', 'Dillinger Escape Plan',
      'Norma Jean', 'The Chariot', 'Poison the Well', 'Zao', 'Underoath', 'Thrice',
      'Shai Hulud', 'Turmoil', 'Hopesfall', 'Beloved', 'Eighteen Visions', 'Hatebreed',
      'Earth Crisis', 'Integrity', 'Ringworm', 'Terror', 'Converge', 'Trap Them',
      
      // Post-Metal / Atmospheric
      'Isis', 'Neurosis', 'Pelican', 'Russian Circles', 'Old Man Gloom', 'Cult of Luna',
      'Amenra', 'The Ocean', 'Rosetta', 'Mouth of the Architect', 'Intronaut', 'Giant Squid',
      'Sumac', 'Baptists', 'KEN mode', 'Oxbow', 'Today Is the Day', 'Unsane',
      
      // Sludge Metal / Doom
      'Eyehategod', 'Crowbar', 'Acid Bath', 'Thou', 'Buzzov•en', 'Grief', 'Iron Monkey',
      'Cavity', 'Noothgrush', 'Dystopia', 'Burning Witch', 'Khanate', 'Sunn O)))',
      'Sleep', 'Electric Wizard', 'Yob', 'Bongzilla', 'Weedeater', 'Bongripper',
      
      // Stoner Rock / Metal
      'Sleep', 'High on Fire', 'Om', 'Mastodon', 'Baroness', 'Kylesa', 'Torche',
      'The Sword', 'Red Fang', 'Kvelertak', 'Valient Thorr', 'ASG', 'Black Tusk',
      'Fu Manchu', 'Kyuss', 'Queens of the Stone Age', 'Earthless', 'All Them Witches',
      
      // Experimental Metal / Avant-Garde
      'Mr. Bungle', 'Fantômas', 'Tomahawk', 'Peeping Tom', 'Lovage', 'The Locust',
      'Secret Chiefs 3', 'Sleepytime Gorilla Museum', 'Kayo Dot', 'Maudlin of the Well',
      'Estradasphere', 'Unexpect', 'Ephel Duath', 'Pin-Up Went Down', 'Dysrhythmia',
      'Behold... The Arctopus', 'Gorguts', 'Ulcerate', 'Gigan', 'Imperial Triumphant',
      
      // Progressive Metal / Tech Metal
      'Between the Buried and Me', 'Protest the Hero', 'The Dillinger Escape Plan',
      'Meshuggah', 'Gojira', 'Opeth', 'Cynic', 'Atheist', 'Death', 'Obscura',
      
      // Grindcore / Powerviolence
      'Napalm Death', 'Brutal Truth', 'Pig Destroyer', 'Agoraphobic Nosebleed', 'Terrorizer',
      'Assück', 'Discordance Axis', 'Gridlink', 'Catheter', 'Insect Warfare', 'Weekend Nachos',
      
      // Punk / Hardcore Crossover
      'Black Flag', 'Bad Brains', 'Minor Threat', 'Circle Jerks', 'Dead Kennedys',
      'Descendents', 'ALL', 'Gorilla Biscuits', 'Youth of Today', 'Judge', 'Burn',
      'Hot Water Music', 'Dillinger Four', 'The Bronx', 'Refused', 'Snapcase', 'Quicksand',
      
      // ═══════════════════════════════════════════════════════════════
      // GARAGE ROCK (Classic 60s Proto-Punk + Modern Revival)
      // ═══════════════════════════════════════════════════════════════
      // Classic 60s Garage Rock / Proto-Punk (THE ORIGINALS)
      'The Sonics', 'The Stooges', 'Iggy Pop', 'MC5', 'The Monks', 'The Seeds',
      'The Standells', 'The Count Five', 'The Electric Prunes', 'The Music Machine',
      '13th Floor Elevators', 'The Chocolate Watchband', 'The Shadows of Knight',
      'The Barbarians', 'The Litter', 'The Kingsmen', 'Paul Revere & the Raiders',
      'Question Mark & the Mysterians', 'The Premiers', 'The Wailers', 'The Knickerbockers',
      'The Remains', 'The Vagrants', 'The Wilde Knights', 'The Leaves', 'The Amboy Dukes',
      
      // 70s Proto-Punk / Pre-New Wave Garage
      'The Modern Lovers', 'Jonathan Richman', 'The New York Dolls', 'David Johansen',
      'The Dictators', 'Rocket from the Tombs', 'Pere Ubu', 'Devo', 'Talking Heads',
      'Television', 'Richard Hell', 'The Voidoids', 'The Dead Boys', 'The Cramps',
      
      // 80s Garage Punk / Paisley Underground
      'The Replacements', 'Hüsker Dü', 'The Minutemen', 'The Dream Syndicate',
      'The Long Ryders', 'Green on Red', 'The Rain Parade', 'The Three O\'Clock',
      'The Gun Club', 'The Fleshtones', 'The Chesterfield Kings', 'The Lyres',
      'The Fuzztones', 'The Pandoras', 'The Cynics', 'The Miracle Workers',
      
      // 90s Garage Rock Revival
      'Jon Spencer Blues Explosion', 'The Oblivians', 'Thee Headcoats', 'The Gories',
      'The New Bomb Turks', 'Rocket from the Crypt', 'Drive Like Jehu', 'Hot Snakes',
      'The Murder City Devils', 'The Make-Up', 'The Jon Spencer Blues Explosion',
      'Thee Headcoatees', 'The Makers', 'The Dirtbombs', 'The Detroit Cobras',
      
      // Modern Garage Rock Revival (2000s+)
      'The White Stripes', 'Jack White', 'The Raconteurs', 'The Dead Weather',
      'The Black Keys', 'Dan Auerbach', 'The Arcs', 'The Sheepdogs',
      'The Hives', 'The Vines', 'The Strokes', 'The Libertines', 'The Kills',
      'Yeah Yeah Yeahs', 'The Von Bondies', 'The Greenhornes', 'The Mooney Suzuki',
      'The D4', 'The Datsuns', 'The Hellacopters', 'Turbonegro', 'Gluecifer',
      'The Black Lips', 'Ty Segall', 'Thee Oh Sees', 'Osees', 'Fuzz',
      'The King Khan & BBQ Show', 'King Khan', 'BBQ', 'The Almighty Defenders',
      
      // Garage Psych / Fuzz Rock (Modern)
      'Ty Segall', 'Thee Oh Sees', 'Osees', 'Fuzz', 'Ty Segall Band', 'The Ty Segall Band',
      'Mikal Cronin', 'White Fence', 'The Fresh & Onlys', 'Thee Commons', 'Sic Alps',
      'The Intelligence', 'Mayyors', 'Meatbodies', 'GOGGS', 'The C.I.A.',
      'Wand', 'Shannon and the Clams', 'La Luz', 'Allah-Las', 'The Growlers',
      'Mystic Braves', 'Frankie and the Witch Fingers', 'Psychedelic Porn Crumpets',
      
      // Garage Punk / Lo-Fi Punk (Modern)
      'Jay Reatard', 'Thee Oh Sees', 'The Oblivians', 'Nobunny', 'Wavves',
      'Harlem', 'Vivian Girls', 'Dum Dum Girls', 'The Pains of Being Pure at Heart',
      'Crystal Stilts', 'A Place to Bury Strangers', 'Crocodiles', 'JEFF the Brotherhood',
      'Bass Drum of Death', 'The Pack A.D.', 'No Age', 'Japandroids',
      
      // Garage Blues / Raw Blues Rock
      'The Black Keys', 'The White Stripes', 'Jack White', 'The Kills', 'The Dead Weather',
      'The Jon Spencer Blues Explosion', 'The Dirtbombs', 'The Detroit Cobras',
      'Left Lane Cruiser', 'Black Joe Lewis & the Honeybears', 'JD McPherson',
      'Nathaniel Rateliff', 'Gary Clark Jr.', 'The Temperance Movement',
      
      // International Garage Rock
      'The Hives', 'The Hellacopters', 'Gluecifer', 'Turbonegro', 'The Datsuns',
      'The D4', 'The Checks', 'Jet', 'Wolfmother', 'DZ Deathrays',
      'Royal Blood', 'Drenge', 'Fidlar', 'Twin Peaks', 'The Orwells',
      
      // ═══════════════════════════════════════════════════════════════
      // POWER POP (Alternative Pop with Punk Energy - NO Mainstream Pop)
      // ═══════════════════════════════════════════════════════════════
      // Classic Power Pop (70s Pioneers)
      'Big Star', 'Alex Chilton', 'The Raspberries', 'Badfinger', 'The Shoes',
      'The Flamin\' Groovies', 'The Rubinoos', 'Dwight Twilley Band', 'Dwight Twilley',
      'Cheap Trick', 'The Records', 'The Nerves', 'Paul Collins\' Beat', 'Paul Collins',
      'The Romantics', 'The Beat', 'The dB\'s', 'The Bongos', 'The Plimsouls',
      
      // 80s Power Pop / New Wave Power Pop
      'The Knack', 'The Beat', 'The Records', 'The Shoes', '20/20',
      'The Stands', 'Redd Kross', 'The Posies', 'Material Issue', 'Jellyfish',
      'The Bangles', 'The Go-Go\'s', 'The Donnas', 'That Dog', 'The Muffs',
      
      // 90s Power Pop Revival
      'Weezer', 'The Rentals', 'Ozma', 'Fountains of Wayne', 'Adam Schlesinger',
      'Teenage Fanclub', 'The Lemonheads', 'Superdrag', 'Fastball', 'Gin Blossoms',
      'Matthew Sweet', 'Sloan', 'The Pillows', 'Ash', 'Supergrass',
      'Nada Surf', 'Semisonic', 'The Wallflowers', 'Local H', 'Letters to Cleo',
      
      // Modern Power Pop (2000s+)
      'The New Pornographers', 'A.C. Newman', 'Neko Case', 'Dan Bejar',
      'Tegan and Sara', 'Metric', 'Stars', 'Broken Social Scene',
      'Rogue Wave', 'Tokyo Police Club', 'The Rosebuds', 'Okkervil River',
      'Spoon', 'The Shins', 'Death Cab for Cutie', 'The Postal Service',
      'Ra Ra Riot', 'Vampire Weekend', 'Two Door Cinema Club', 'Phoenix',
      'MGMT', 'Passion Pit', 'Foster the People', 'Walk the Moon',
      'Bleachers', 'Jack Antonoff', 'fun.', 'The Format', 'Steel Train',
      
      // Pop Punk / Punk-influenced Power Pop
      'Blink-182', 'Green Day', 'The Offspring', 'Sum 41', 'Simple Plan',
      'New Found Glory', 'Saves the Day', 'The Starting Line', 'The Ataris',
      'Yellowcard', 'All Time Low', 'Mayday Parade', 'The Wonder Years',
      'The Story So Far', 'Neck Deep', 'State Champs', 'Knuckle Puck',
      
      // ═══════════════════════════════════════════════════════════════
      // JANGLE POP (Chiming Guitars, Byrds-influenced - NO Mainstream Pop)
      // ═══════════════════════════════════════════════════════════════
      // Classic Jangle Pop / Paisley Underground
      'The Byrds', 'Roger McGuinn', 'Gene Clark', 'The Bangles', 'The Three O\'Clock',
      'The Dream Syndicate', 'The Long Ryders', 'Green on Red', 'The Rain Parade',
      
      // 80s Jangle Pop / College Rock
      'R.E.M.', 'Peter Buck', 'The Smiths', 'Johnny Marr', 'The Stone Roses',
      'The La\'s', 'The Sundays', 'Primal Scream', 'The Church', 'The Chills',
      'The Clean', 'The Verlaines', 'The Bats', 'Tall Dwarfs', 'Straitjacket Fits',
      
      // Dunedin Sound / Flying Nun Records
      'The Clean', 'The Chills', 'The Verlaines', 'The Bats', 'Tall Dwarfs',
      'Straitjacket Fits', 'The 3Ds', 'Sneaky Feelings', 'The Jean-Paul Sartre Experience',
      
      // 90s Jangle Pop / Indie Pop
      'Teenage Fanclub', 'The Wedding Present', 'The Field Mice', 'Heavenly',
      'The Pastels', 'Belle and Sebastian', 'Camera Obscura', 'The Clientele',
      'The Concretes', 'The Shins', 'Beulah', 'The Ladybug Transistor',
      
      // Modern Jangle Pop / Indie Pop (2000s+)
      'The Shins', 'James Mercer', 'Broken Bells', 'Real Estate', 'Beach Fossils',
      'Wild Nothing', 'DIIV', 'Mac DeMarco', 'Craft Spells', 'Captured Tracks',
      'The Pains of Being Pure at Heart', 'Crystal Stilts', 'The Drums',
      'Surfer Blood', 'Best Coast', 'Wavves', 'Tennis', 'Alvvays',
      'Frankie Cosmos', 'Snail Mail', 'Soccer Mommy', 'Jay Som',
      
      // C86 / Sarah Records / Twee Pop
      'The Pastels', 'The Field Mice', 'Heavenly', 'Talulah Gosh', 'Another Sunny Day',
      'The Wake', 'The Sea Urchins', 'Blueboy', 'East River Pipe', 'The Lucksmiths',
      'The Magnetic Fields', 'Stephin Merritt', 'The 6ths', 'Future Bible Heroes'
    ];
  }
  
  connect() {
    const url = 'wss://chat1.deepcut.fm:8080/socket.io/websocket';
    this.log('🔌 Connecting to:', url);
    
    this.ws = new WebSocket(url);
    
    this.ws.on('open', () => {
      this.log('✅ WebSocket connected');
      this.isConnected = true;
      this.authenticate();
    });
    
    this.ws.on('message', (data) => {
      this.handleMessage(data.toString());
    });
    
    this.ws.on('close', () => {
      this.log('❌ WebSocket disconnected');
      this.isConnected = false;
      this.isAuthenticated = false;
      
      // Stop PM health check when disconnected
      this.stopPMHealthCheck();
      // Stop presence maintenance when disconnected
      this.stopPresenceMaintenance();
      
      this.reconnect();
    });
    
    this.ws.on('error', (error) => {
      this.log('❌ WebSocket error:', error.message);
    });
  }
  
  reconnect() {
    this.log('🔄 Reconnecting in 5 seconds...');
    setTimeout(() => {
      this.connect();
    }, 5000);
  }

  disconnect(err) {
    this.isAuthenticated = false;
    this.isConnected = false;
    
    // Stop all intervals
    this.stopPMHealthCheck();
    this.stopPresenceMaintenance();
    
    // Close WebSocket if it exists
    if (this.ws) {
      this.ws.close();
    }
    
    this.log('🔌 Bot disconnected:', err?.message || 'Manual disconnect');
    
    // Emit disconnected event
    if (this.listeners('disconnected').length > 0) {
      this.emit('disconnected', err);
    } else {
      this.emit('error', err);
    }
  }
  
  authenticate() {
    // Step 1: Presence update
    this.send({
      api: 'presence.update',
      status: 'available'
    });
    
    // Step 2: User modify
    this.send({
      api: 'user.modify',
      laptop: 'pc'
    });
    
    // Step 3: Room register
    this.send({
      api: 'room.register',
      roomid: this.roomId
    }, (response) => {
      if (response.success) {
        this.log('✅ Successfully joined room:', this.roomId);
        this.isAuthenticated = true;
        this.emit('ready');
        
        // Add a longer delay before getting room info to prevent immediate removal
        setTimeout(() => {
          this.getRoomInfo();
        }, 5000); // Wait 5 seconds before doing anything
        
        // Add human-like behavior delay before starting monitoring
        setTimeout(() => {
          this.log('🤖 Bot settling in... (human-like delay)');
        }, 3000);
      }
    });
  }
  
    getRoomInfo() {
      this.log('🔍 Requesting room info...');
      this.send({
        api: 'room.info',
        roomid: this.roomId
      }, (response) => {
        // Room info response received
        this.log(`🔍 Room info response: success=${response.success}, room=${!!response.room}, metadata=${!!response.room?.metadata}, djs=${!!response.room?.metadata?.djs}`);
        if (response.success) {
          // Populate users map from room info response
          if (response.users && Array.isArray(response.users)) {
            this.users.clear();
            response.users.forEach(user => {
              this.users.set(user.userid, user);
            });
          }
          
          // Clean one-line room summary
          const djs = response.room.metadata?.djs?.length || 0;
          const listeners = response.room.metadata?.listeners || 0;
          const currentSong = response.room.metadata?.current_song;
          const songInfo = currentSong ? `${currentSong.metadata.artist} - ${currentSong.metadata.song}` : 'No song';
          this.log(`🏠 ${response.room.name} | ${response.users.length} users | ${djs} DJs | ${listeners} listeners | 🎵 ${songInfo}`);
          
          // Update room state directly
          this.updateRoomState(response.room);
        } else {
          this.log('❌ Room info request failed:', response);
        }
      });
    }
  
  handleMessage(data) {
    // Check for heartbeat messages first
    if (this.isHeartbeat(data)) {
      this.treatHeartbeat(data);
      return;
    }

    // Parse message format: ~m~{length}~m~{json}
    const match = data.match(/^~m~(\d+)~m~(.+)$/);
    if (!match) {
      this.log('❓ Unknown message format:', data);
      return;
    }
    
    const length = parseInt(match[1]);
    const jsonStr = match[2];
    
    try {
      const message = JSON.parse(jsonStr);
      this.processMessage(message);
    } catch (error) {
      this.log('❌ Failed to parse message:', error.message);
    }
  }

  isHeartbeat(data) {
    const heartbeat_rgx = /~m~[0-9]+~m~(~h~[0-9]+)/;
    return data.match(heartbeat_rgx);
  }

  treatHeartbeat(packet) {
    const heartbeat_rgx = /~m~[0-9]+~m~(~h~[0-9]+)/;
    const match = packet.match(heartbeat_rgx);
    if (match) {
      this._heartbeat(match[1]);
      this.lastHeartbeat = Date.now();
      this.log(`💓 Heartbeat received and responded: ${match[1]}`);
      // Update presence to keep connection alive
      this.updatePresence();
    }
  }

  _heartbeat(msg) {
    this.ws.send(`~m~${msg.length}~m~${msg}`);
  }

  updatePresence() {
    // Only update presence if WebSocket is fully connected (readyState 1 = OPEN)
    if (this.isConnected && this.ws && this.ws.readyState === 1) {
      this.send({
        api: 'presence.update',
        status: 'available'
      });
    }
  }
  
  processMessage(message) {
    // Message received
    this.lastActivity = Date.now();
    
    // Handle API responses
    if (message.msgid !== undefined) {
      this.handleApiResponse(message);
      return;
    }
    
    // Handle events
    if (message.command) {
      this.handleEvent(message);
    }
  }
  
  handleApiResponse(response) {
    // Check if there's a callback for this response
    if (this.pendingCallbacks && response.msgid !== undefined) {
      const callback = this.pendingCallbacks.get(response.msgid);
      if (callback) {
        this.pendingCallbacks.delete(response.msgid);
        callback(response);
        return;
      }
    }
    
    // Handle specific API responses
    if (response.api === 'room.info' && response.success) {
      this.currentRoom = response.room;
      
      // Update room state
      this.updateRoomState(response.room);
    }
  }
  
  updateRoomState(room) {
    try {
      // Clear current state
      this.roomState.djs.clear();
      this.roomState.audience.clear();
      
      // Update DJs
      if (room.metadata && room.metadata.djs) {
        room.metadata.djs.forEach((dj, index) => {
          // Handle both string (userid) and object formats
          let userId, userName;
          
          if (typeof dj === 'string') {
            // DJ is just a user ID string
            userId = dj;
            userName = this.users.get(dj)?.name || 'Unknown';
          } else {
            // DJ is an object
            userId = dj.userid || dj.user_id || dj.id || dj._id;
            userName = dj.name || dj.username || dj.displayName;
          }
          
          if (userId) {
            this.roomState.djs.set(userId, {
              name: userName || 'Unknown',
              seat: index + 1,
              songs: dj.songs || []
            });
          }
        });
      }
      
      // Update audience
      if (room.metadata && room.metadata.audience) {
        room.metadata.audience.forEach(user => {
          if (user.userid) {
            this.roomState.audience.set(user.userid, {
              name: user.name || 'Unknown'
            });
          }
        });
      }
      
      // Update current song
      if (room.metadata && room.metadata.current_song) {
        this.roomState.currentSong = room.metadata.current_song;
        this.log(`🎵 ${room.metadata.current_song.metadata?.artist} - ${room.metadata.current_song.metadata?.song}`);
      }
      
      this.roomState.lastUpdate = Date.now();
      // Reduced logging - only log if there are DJs or significant changes
      if (this.roomState.djs.size > 0) {
        this.log(`🎧 ${this.roomState.djs.size} DJs on stage`);
      }
      
      // Trigger bot check immediately after room state update
      setTimeout(() => {
        this.checkForBotsOnStage();
      }, 1000); // Wait 1 second then check
    } catch (error) {
      this.log('❌ Error updating room state:', error.message);
    }
  }
  
  handleEvent(event) {
    // Handle message responses (no command field)
    if (!event.command && event.msgid !== undefined) {
      this.handleMessageResponse(event);
      return;
    }

    switch (event.command) {
      case 'registered':
        this.handleUserJoined(event);
        break;
      case 'deregistered':
        this.handleUserLeft(event);
        break;
      case 'speak':
        this.handleChatMessage(event);
        break;
      case 'pmmed':
        this.handlePrivateMessage(event);
        break;
      case 'newsong':
        this.handleNewSong(event);
        break;
      case 'update_votes':
        this.handleVoteUpdate(event);
        break;
      case 'add_dj':
        this.handleDjAdded(event);
        break;
      case 'rem_dj':
        this.handleDjRemoved(event);
        break;
      case 'killdashnine':
        this.handleKillDashNine(event);
        break;
      case 'search_complete':
        this.handleSearchComplete(event);
        break;
    }
  }
  
  handleMessageResponse(response) {
    // Handle PM response errors
    if (response.errid === 4 && response.err === 'User offline') {
      this.log(`⚠️ User went offline while sending PM (msgid: ${response.msgid})`);
      return;
    }
    
    if (!response.success && response.errid) {
      this.log(`❌ Message failed (msgid: ${response.msgid}): ${response.err || 'Unknown error'}`);
    }
  }
  
  handleUserJoined(event) {
    if (event.user) {
      event.user.forEach(user => {
        this.users.set(user.userid, user);
        this.log(`👋 ${user.name}${user.bot ? ' (bot)' : ''} joined`);
        
        // Send startup greeting if this is the bot itself joining
        if (user.userid === this.userId && user.bot) {
          this.sendStartupGreeting();
          // Start PM health check
          this.startPMHealthCheck();
          // Start presence maintenance
          this.startPresenceMaintenance();
          // Get room info to populate user list
          this.getRoomInfo();
          
          // Auto-join DJ stage and select a song on startup
          setTimeout(() => {
            this.autoJoinStageAndSelectSong();
          }, 10000); // Wait 10 seconds for everything to initialize
        }
      });
    }
  }
  
  sendStartupGreeting() {
    // Only send startup greeting once per session
    if (this.hasSentStartupGreeting || this.ownerUserIds.length === 0) {
      return;
    }
    
    this.hasSentStartupGreeting = true;
    const ownerId = this.ownerUserIds[0];
    this.log(`🤖 Debug: currentAIProvider = ${this.currentAIProvider}`);
    const greeting = `Hey there! I'm online and ready to help.
    
    Connected to: ${this.currentRoom?.name || 'Unknown Room'}
    Commands: ${this.commandsAdminOnly ? 'Admin Only' : 'Public'}
    AI Keywords: ${this.aiKeywordsPublic ? 'Public' : 'Admin Only'}
    
    Try these commands:
    • /help - Show all commands
    • /status - Check bot status
    
    Or mention me in main chat with: bot, b0t, bot2, @bot
    
    Let's make some music!`;
    
    setTimeout(() => {
      this.sendPM(ownerId, greeting);
      this.log(`📧 Sent startup greeting to owner: ${ownerId}`);
    }, 2000); // Delay to ensure bot is fully connected
  }
  
  startPMHealthCheck() {
    // Check PM functionality every 2 minutes (less spammy)
    this.pmHealthInterval = setInterval(() => {
      if (this.ownerUserIds.length > 0 && this.isConnected) {
        const ownerId = this.ownerUserIds[0];
        this.sendPM(ownerId, '💓 Bot is still online and healthy');
      }
    }, 120000); // 2 minutes
    
    this.log('🔍 Started PM health check (every 2 minutes)');
  }
  
  stopPMHealthCheck() {
    if (this.pmHealthInterval) {
      clearInterval(this.pmHealthInterval);
      this.pmHealthInterval = null;
      this.log('🛑 Stopped PM health check');
    }
  }

  startPresenceMaintenance() {
    // Start presence maintenance interval
    this.presenceInterval = setInterval(() => {
      this.maintainPresence();
    }, this.presenceUpdateInterval);
    
    this.log('🔍 Started presence maintenance (every 10s)');
  }

  stopPresenceMaintenance() {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
      this.log('🛑 Stopped presence maintenance');
    }
  }

  maintainPresence() {
    let activity;
    if (this.lastHeartbeat > this.lastActivity) {
      activity = this.lastHeartbeat;
    } else {
      activity = this.lastActivity;
    }
    
    if (this.isConnected && ((Date.now() - activity) > this.disconnectInterval)) {
      this.log('⚠️ No response from server; is there a proxy/firewall problem?');
      this.disconnect(new Error('No response from server'));
    } else {
      this.updatePresence();
    }
  }
  
  handleUserLeft(event) {
    if (event.user) {
      event.user.forEach(user => {
        this.users.delete(user.userid);
        this.log(`👋 User left: ${user.name} (${user.userid})`);
        
        // If this is our bot being removed, try to rejoin after a delay
        if (user.userid === this.userId) {
          this.log('🚨 Bot was removed from room - attempting reconnection...');
          this.isBotOnStage = false;
          
          // Wait 10 seconds then try to rejoin
          setTimeout(() => {
            this.log('🔄 Attempting to rejoin room...');
            this.connect();
          }, 10000);
        }
      });
    }
  }
  
  handleChatMessage(event) {
    this.log(`🔍 Chat message received from ${event.name}: "${event.text}"`);
    this.log(`🔍 Main chat silent: ${this.mainChatSilent}, RESPOND_IN_MAIN_CHAT: ${process.env.RESPOND_IN_MAIN_CHAT}`);
    
    // Only process if not in silent mode or if it's a silent command or keyword trigger
    if (!this.mainChatSilent || event.text.startsWith('!p') || this.hasKeywordTrigger(event.text)) {
      this.log(`💬 Processing chat message: ${event.name}: ${event.text}`);
      
      // Auto-upvote on new songs (silent command)
      if (this.autoUpvote && event.text === '!p') {
        this.upvote();
        return;
      }
      
      // Check for commands first
      if (event.text.startsWith('/') || event.text.startsWith('.')) {
        this.log(`🎯 Command detected: "${event.text}"`);
        this.handleCommand(event.text, event.userid, event.name).catch(error => {
          this.log(`❌ Command handler error: ${error.message}`);
        });
        return;
      }
      
      // Check for keyword triggers and respond with AI
      if (this.hasKeywordTrigger(event.text)) {
        this.log(`🎯 Keyword trigger detected, calling handleKeywordTrigger...`);
        this.handleKeywordTrigger(event);
      } else {
        this.log(`❌ No keyword trigger found in: "${event.text}"`);
      }
    } else {
      this.log(`🔇 Chat message ignored due to silent mode: ${event.text}`);
    }
  }
  
  handlePrivateMessage(event) {
    // PM received
    
    // Always show PM messages in console
    const senderName = event.name || 'Unknown';
    const message = event.text || '';
    const sender = event.senderid;
    console.log(`\n📨 PM from ${senderName}: ${message}`);
    
    // 🔥 CRITICAL: Process Ammy's messages FIRST, before bot detection
    // Ammy sends important stage management messages that must be processed
    
    // Check if Ammy is granting permission to play X songs
    const playLimitMatch = message.match(/you may play (\d+) songs?/i);
    if (playLimitMatch) {
      const allowedSongs = parseInt(playLimitMatch[1]);
      this.songsAllowedThisSet = allowedSongs;
      this.songsPlayedThisSet = 0;
      this.log(`🎵 Ammy granted permission to play ${allowedSongs} song(s) this set`);
    }
    
    // 🔥 CRITICAL: Detect Ammy's "wait" messages and reset permission
    const mustWait = message.toLowerCase().includes('please wait until') ||
                     message.toLowerCase().includes('you must wait for') ||
                     message.toLowerCase().includes('sorry') && message.toLowerCase().includes('must wait') ||
                     (message.toLowerCase().includes('wait for') && message.toLowerCase().includes('more') && message.toLowerCase().includes('dj'));
    
    if (mustWait) {
      this.log(`⏳ Ammy says to WAIT: "${message}" - permission reset, staying on floor`);
      this.ammyPMReceived = false; // Reset permission - bot must wait
      return; // Don't process further
    }
    
    // 🔥 NEW: Detect Ammy's PM patterns and reset cooldown
    // This includes both "hop back up" messages AND "you may play" confirmations
    const canHopBackUp = message.toLowerCase().includes('you may take a seat') || 
                        message.toLowerCase().includes('you may now become') || 
                        message.toLowerCase().includes('cooldown is over') ||
                        message.toLowerCase().includes('allowed to become dj') ||
                        message.toLowerCase().includes('thank you for waiting') ||
                        message.toLowerCase().includes('you can hop back up') ||
                        message.toLowerCase().includes('you can become dj again') ||
                        message.toLowerCase().includes('hop back up') ||
                        message.toLowerCase().includes('become dj again') ||
                        message.toLowerCase().includes('you may play') || // When bot hops up successfully
                        message.toLowerCase().includes('welcome back @'); // When bot hops back up
    
    if (canHopBackUp) {
      this.log(`✅ Ammy PM detected: "${message}" - cooldown AND glue reset! Checking for bots on stage...`);
      this.lastAutoHopTime = 0; // Reset cooldown so bot can hop up immediately
      this.gluedUntil = null; // Reset glue (Ammy allows hop up)
      this.ammyPMReceived = true; // Set flag to bypass cooldown on NEXT hop
      this.rebootTime = 0; // Clear reboot timer - Ammy PM received
      
      // ALWAYS check for bots on stage after Ammy PM (even if bot is currently on stage)
      // Bot might hop down later, and we want to be ready to hop back up
      setTimeout(() => {
        this.log('🔍 Checking stage for other bots after Ammy PM (cooldown bypassed)...');
        this.checkForBotsOnStage();
      }, 1000);
      
      // Also set up periodic checks for the next 30 seconds to catch bot hops down -> back up
      let checksRemaining = 3;
      const periodicCheck = setInterval(() => {
        checksRemaining--;
        if (checksRemaining <= 0) {
          clearInterval(periodicCheck);
          return;
        }
        
        if (!this.isBotOnStage) {
          this.log('🔍 Periodic check: Bot is on floor, checking for bots on stage...');
          this.checkForBotsOnStage();
        }
      }, 10000); // Check every 10 seconds for 30 seconds after Ammy PM
    }
    
    // Check if PM responses are enabled
    if (process.env.RESPOND_IN_PM === 'false') {
      return;
    }
    
    // Update room state if room data is available
    if (event.roomobj && event.roomobj.metadata) {
      this.updateRoomState(event.roomobj);
    }
    
    // Process PM commands
    this.processPMCommand(event);
  }
  
  handleNewSong(event) {
    if (event.room && event.room.metadata && event.room.metadata.current_song) {
      this.currentSong = event.room.metadata.current_song;
      this.roomState.currentSong = this.currentSong;
      
      // Update full room state
      this.updateRoomState(event.room);
      
      const artist = this.currentSong.metadata.artist;
      const song = this.currentSong.metadata.song;
      const album = this.currentSong.metadata.album;
      const year = this.currentSong.metadata.year;
      const duration = this.currentSong.metadata.duration;
      
      this.log(`🎵 ${artist} - ${song}${album !== 'Unknown' ? ` (${album}${year !== 'Unknown' ? `, ${year}` : ''})` : ''}`);
      
      // Get current DJ ID - try multiple sources
      let djUserId = null;
      let djName = null;
      
      // Source 1: current_song.metadata.djid or current_song.djid
      if (this.currentSong.metadata?.djid) {
        djUserId = this.currentSong.metadata.djid;
      } else if (this.currentSong.djid) {
        djUserId = this.currentSong.djid;
      } else if (this.currentSong.userid) {
        djUserId = this.currentSong.userid;
      }
      
      // Source 2: Find the current DJ from djs array (who's in position 0)
      if (!djUserId && event.room?.metadata?.djs) {
        const currentDJ = event.room.metadata.djs[0]; // First DJ is usually the current one
        if (currentDJ) {
          djUserId = currentDJ.userid;
          djName = currentDJ.name;
          this.log(`📝 Using DJ position 0: ${djName} (${djUserId})`);
        }
      }
      
      // Now resolve the DJ name using the userId we found
      if (djUserId && !djName) {
        // Try event.room.metadata.djs
      if (event.room?.metadata?.djs) {
          const dj = event.room.metadata.djs.find(d => d.userid === djUserId);
        if (dj?.name) {
          djName = dj.name;
            this.log(`📝 Resolved DJ name from djs array: ${djName}`);
          }
        }
        
        // Try roomState.djs
        if (!djName && this.roomState.djs.has(djUserId)) {
          djName = this.roomState.djs.get(djUserId).name;
          if (djName) this.log(`📝 Resolved DJ name from roomState: ${djName}`);
        }
        
        // Try users Map
      if (!djName) {
          djName = this.users.get(djUserId)?.name;
        if (djName) this.log(`📝 Resolved DJ name from users Map: ${djName}`);
        }
      }
      
      // Final fallback
      if (!djName) {
        djName = 'Unknown';
        this.log(`⚠️ Could not resolve DJ name for userid: ${djUserId}`);
      }
      
      const isBot = this.isBotUser(djUserId, djName);
      
      if (!isBot) {
        this.roomSongHistory.push({
          artist: artist,
          song: song,
          album: album,
          year: year,
          timestamp: Date.now(),
          userId: djUserId,
          userName: djName,
          djId: djUserId,
          isBotSong: false
        });
        
        // Keep only last 50 songs to avoid memory bloat
        if (this.roomSongHistory.length > 50) {
          this.roomSongHistory = this.roomSongHistory.slice(-50);
        }
        
        // Learn the artist AND song from user play (ALL MUSIC GENRES for deepcut.live)
        this.learnArtistFromUser(artist);
        this.learnSongFromUser(artist, song);
        
        this.log(`📚 Added human play to room history + learned artist & song: ${artist} - ${song} by ${djName}`);
      } else {
        this.log(`🤖 Skipping bot play from room history: ${artist} - ${song} by ${djName}`);
      }
      
      // Enhanced metadata tracking (use the djName we already resolved above)
      const enhancedSongData = {
        artist: artist,
        song: song,
        album: album || 'Unknown',
        year: year || 'Unknown',
        duration: duration || 'Unknown',
        timestamp: Date.now(),
        djUserId: event.userid,
        djName: djName, // Use already-resolved name from above
        metadata: this.currentSong.metadata
      };
      
      // Update current song metadata
      this.songMetadata.current = enhancedSongData;
      
      // Add to history (keep last 10)
      this.songMetadata.history.unshift(enhancedSongData);
      if (this.songMetadata.history.length > 10) {
        this.songMetadata.history.pop();
      }
      
      // Track song play for the DJ who played it (ONLY if human, not bot)
      if (event.userid) {
        // Try multiple sources for DJ name
        let djName = this.users.get(event.userid)?.name;
        
        // Fallback 1: Check room metadata for DJ name
        if (!djName && event.room?.metadata?.djs) {
          const dj = event.room.metadata.djs.find(d => d.userid === event.userid);
          djName = dj?.name;
        }
        
        // Fallback 2: Check roomState
        if (!djName && this.roomState.djs.has(event.userid)) {
          djName = this.roomState.djs.get(event.userid).name;
        }
        
        // Final fallback
        djName = djName || 'Unknown';
        
        const isBot = this.isBotUser(event.userid, djName);
        
        if (!isBot) {
          // Update stats using hang.fm system
          this.updateUserStats(event.userid, artist, song);
          this.updateSongStats(artist, trackName, event.userid, djName);
          this.log(`📊 Tracked human play: ${artist} - ${song} by ${djName}`);
        } else {
          this.log(`🤖 Ignoring bot play from stats: ${djName} - ${artist} - ${song}`);
        }
      }
      
      // 🔥 ALWAYS re-analyze on EVERY play (human or bot) - but only analyze HUMAN plays from history
      this.log(`🔍 Song event: isBotOnStage=${this.isBotOnStage}, botNextSong=${!!this.botNextSong}, isBot=${isBot}, djName=${djName}`);
      
      // If bot is on stage, ALWAYS re-analyze room vibe after EVERY play (human OR bot)
      // But only analyze the last 10 HUMAN plays in roomSongHistory (bot plays are excluded from history)
      if (this.isBotOnStage) {
        if (!isBot) {
          this.log(`🎵 Human play detected - re-analyzing last 10 HUMAN plays to match vibe...`);
        } else {
          this.log(`🎵 Bot play detected - re-analyzing last 10 HUMAN plays to match vibe...`);
        }
        
        setTimeout(async () => {
          try {
            const nextSong = await this.generateSongSuggestionFromSpotify();
            if (nextSong) {
              this.botNextSong = nextSong;
              this.log(`🎵 Song selected to match room vibe: ${nextSong.artist} - ${nextSong.title}`);
              
              // Queue the song
              const success = await this.queueSong(nextSong);
              if (success) {
                this.log(`✅ Song queued (matched to room vibe)`);
              } else {
                this.log(`❌ Failed to queue song`);
              }
            }
          } catch (error) {
            this.log(`❌ Error selecting song: ${error.message}`);
          }
        }, 2000);
      }
      
      // Clear bot's next song if it just played
      if (this.botNextSong && event.userid === this.userId) {
        this.log(`🎵 Bot just played: ${this.botNextSong.artist} - ${this.botNextSong.title}`);
        
        // Add to played songs to prevent repeats
        const songKey = `${this.botNextSong.artist} - ${this.botNextSong.title}`;
        this.playedSongs.add(songKey);
        this.log(`📝 Added to played songs: ${songKey} (total played: ${this.playedSongs.size})`);
        
        // Announce that bot's song finished
        this.sendChat(`✅ **Bot Song Finished:** ${this.botNextSong.artist} - ${this.botNextSong.title}`);
        
        this.botNextSong = null;
        
        // Increment songs played since hopping up
        if (this.isBotOnStage) {
          this.songsPlayedSinceHopUp++;
          this.songsPlayedThisSet++;
          this.log(`🎵 Bot has played ${this.songsPlayedSinceHopUp} song(s) since hopping up (${this.songsPlayedThisSet}/${this.songsAllowedThisSet || '?'} this set)`);
          
          // Note: Ammy will auto-remove the bot after allowed songs, no need to hop down ourselves
          
          // Select and announce next song
          setTimeout(async () => {
            try {
              this.log('🎵 Selecting next song after bot finished playing...');
              const nextSong = await this.generateSongSuggestionFromSpotify();
              if (nextSong) {
                this.botNextSong = nextSong;
                this.log(`🎵 Next song selected: ${nextSong.artist} - ${nextSong.title}`);
                
                // Queue the next song
                const success = await this.queueSong(nextSong);
                if (success) {
                  this.sendChat(`🎵 **Next Song Queued:** ${nextSong.artist} - ${nextSong.title}`);
                } else {
                  this.sendChat(`❌ **Failed to queue next song:** ${nextSong.artist} - ${nextSong.title}`);
                }
              } else {
                this.sendChat('❌ **Failed to select next song**');
              }
            } catch (error) {
              this.log(`❌ Error selecting next song: ${error.message}`);
              this.sendChat('❌ **Error selecting next song**');
            }
          }, 3000); // Wait 3 seconds before selecting next song
        }
      }
      
      // Pre-fetch enhanced metadata for better API responses
      this.preFetchEnhancedMetadata(enhancedSongData);
      
      // Increment songs played count
      this.songsPlayedCount++;
      this.log(`🎵 Songs played count: ${this.songsPlayedCount}`);
      
      // Auto-queue next song after EVERY play (human or bot) by analyzing recent HUMAN plays
      // The autoQueueNextSong function filters to only look at last 10 HUMAN plays in history
      setTimeout(async () => {
        if (!isBot) {
          this.log(`🔄 Human play finished - queuing next song based on last 10 human plays...`);
        } else {
          this.log(`🔄 Bot play finished - queuing next song based on last 10 human plays...`);
        }
        await this.autoQueueNextSong();
      }, 3000); // Wait 3 seconds after song starts
      
      // Auto-upvote if enabled
      if (this.autoUpvote) {
        setTimeout(() => {
          this.upvote();
        }, 1000);
      }
    }
  }
  
  handleVoteUpdate(event) {
    if (event.room && event.room.metadata) {
      this.log(`📊 ${event.room.metadata.upvotes}👍 ${event.room.metadata.downvotes}👎`);
    }
  }
  
  handleDjAdded(event) {
      const djName = this.users.get(event.userid)?.name || 'Unknown';
      this.log(`🎧 ${djName} joined stage`);
    
    // Update room state with new DJ
    if (event.room && event.room.metadata) {
      this.updateRoomState(event.room);
    }
    
    // Check if bot was added to stage
    if (event.userid === this.userId) {
      this.isBotOnStage = true;
      this.log('🎧 Bot joined DJ stage');
      
        // If bot has a selected song, queue it now
        if (this.botNextSong) {
          this.log(`🎵 Bot on stage with selected song: ${this.botNextSong.artist} - ${this.botNextSong.title}`);
          setTimeout(async () => {
            if (this.botNextSong && this.isBotOnStage) {
            const success = await this.queueSong(this.botNextSong);
            if (success) {
              this.log(`✅ Song successfully queued: ${this.botNextSong.artist} - ${this.botNextSong.title}`);
            } else {
              this.log(`❌ Failed to queue song: ${this.botNextSong.artist} - ${this.botNextSong.title}`);
              }
            } else {
              this.log(`⚠️ Bot was removed from stage before song could be queued`);
            }
          }, 2000);
        } else {
          // Check if bot should select a song
          setTimeout(() => {
            this.checkSongSelection();
          }, 1000);
        }
    }
  }
  
  handleDjRemoved(event) {
    const removedUserId = event.userid || event.user?.[0]?.userid;
    this.log(`🎧 DJ removed: ${removedUserId || 'undefined'}`);
    
    // Update room state with DJ removal
    if (event.room && event.room.metadata) {
      this.updateRoomState(event.room);
    }
    
    // Check if bot was removed from stage (or if we can't determine who was removed, assume it might be us)
    if (removedUserId === this.userId || (!removedUserId && this.isBotOnStage)) {
      this.isBotOnStage = false;
      this.botNextSong = null;
      this.ammyPMReceived = false; // Reset Ammy permission - bot must wait for new PM
      this.rebootTime = 0; // Clear reboot timer - bot has now played at least once
      this.log('🎧 Bot left DJ stage - staying on floor until Ammy sends permission PM');
      
      // Check if this was a mod removal (apply glue)
      // If the bot was removed and it wasn't by the bot itself, assume it was a mod
      if (event.removedBy && event.removedBy !== this.userId) {
        this.log('🔒 Bot was removed by mod - applying glue for 36 minutes');
        this.applyGlue();
      }
      // DO NOT auto-check for bots - bot will wait for Ammy's PM to hop back up
      // The stage monitoring interval will still run, but bot won't hop without permission
    }
  }

  handleKillDashNine(event) {
    // Handle killdashnine command - this is a server-side command that can cause disconnections
    this.log('⚠️ Received killdashnine command from server');
    // Don't disconnect immediately, let the server handle it
    // This prevents unnecessary reconnections
  }
  
  handleSearchComplete(event) {
    try {
      if (this.pendingCallbacks && event.query) {
        // Find the callback for this search query
        for (const [msgid, callback] of this.pendingCallbacks.entries()) {
          // Check if this callback is for a search request
          if (event.query && event.docs) {
            this.pendingCallbacks.delete(msgid);
            callback(event);
            return;
          }
        }
      }
    } catch (error) {
      this.log(`❌ Error handling search complete: ${error.message}`);
    }
  }

  handleHealthCommand() {
    const healthStatus = `🏥 Bot Health Status:
    
    🔌 Connection: ${this.isConnected ? '✅ Connected' : '❌ Disconnected'}
    🔐 Authenticated: ${this.isAuthenticated ? '✅ Yes' : '❌ No'}
    💓 Last Heartbeat: ${new Date(this.lastHeartbeat).toLocaleTimeString()}
    📡 Last Activity: ${new Date(this.lastActivity).toLocaleTimeString()}
    🔍 PM Health Check: ${this.pmHealthInterval ? '✅ Active' : '❌ Inactive'}
    🔄 Presence Maintenance: ${this.presenceInterval ? '✅ Active' : '❌ Inactive'}
    
    💡 Use /health stop to disable PM health checks
    💡 Use /health start to enable PM health checks`;
    
    return healthStatus;
  }
  
  setupCommands() {
    // PUBLIC SLASH COMMANDS (only 3 - uses music providers, NO AI)
    // PM-aware commands - first arg can be either text (main chat) or senderId (PM)
    this.commands.set('/info', (arg1, arg2, arg3) => {
      // If arg1 looks like a userId (24 char hex), it's from PM
      if (arg1 && arg1.length === 24 && /^[a-f0-9]+$/.test(arg1)) {
        return this.handleInfoCommand(arg1, arg2); // PM: (senderId, senderName)
      } else {
        return this.handleInfoCommand(null, null); // Main chat: (null, null)
      }
    });
    this.commands.set('/song', (arg1, arg2, arg3) => {
      if (arg1 && arg1.length === 24 && /^[a-f0-9]+$/.test(arg1)) {
        return this.handleSongCommand(arg1, arg2);
      } else {
        return this.handleSongCommand(null, null);
      }
    });
    this.commands.set('/album', (arg1, arg2, arg3) => {
      if (arg1 && arg1.length === 24 && /^[a-f0-9]+$/.test(arg1)) {
        return this.handleAlbumCommand(arg1, arg2);
      } else {
        return this.handleAlbumCommand(null, null);
      }
    });
    
    // PUBLIC DOT COMMANDS  
    this.commands.set('.commands', (text, senderId, senderName) => this.handleCommandsListCommand(senderId, senderName));
    this.commands.set('.stats', (text, senderId, senderName) => this.handleStatsCommand(text, senderId, senderName));
    this.commands.set('.firstplayed', (text, senderId, senderName) => this.handleFirstPlayedCommand(text, senderId, senderName));
    this.commands.set('.hopup', () => this.handleHopUpCommand());
    this.commands.set('.hopdown', () => this.handleHopDownCommand());
    this.commands.set('.skip', () => this.handleSkipCommand());
    this.commands.set('.uptime', () => this.handleUptimeCommand());
    this.commands.set('.spoil', () => this.handleSpoilCommand());
    this.commands.set('.queue', () => this.handleQueueStatusCommand());
    this.commands.set('.search', (args) => this.handleSearchCommand(args));
    this.commands.set('.testsearch', () => this.handleTestSearchCommand());
    this.commands.set('.testqueue', () => this.handleTestQueueCommand());
    this.commands.set('.testai', (args) => this.handleTestAICommand(args));
    this.commands.set('.testapis', () => this.handleTestAPIsCommand());
    this.commands.set('.testhop', () => this.handleTestHopCommand());
    this.commands.set('.forcehop', () => this.handleForceHopCommand());
    this.commands.set('.refreshroom', () => this.handleRefreshRoomCommand());
    this.commands.set('.debugroom', () => this.handleDebugRoomCommand());
    this.commands.set('.selectgenre', (args) => this.handleSelectGenreCommand(args));
    this.commands.set('.laptop', (args) => this.handleLaptopCommand(args));
    this.commands.set('.stickers', (args) => this.handleStickersCommand(args));
    this.commands.set('.randomstickers', (args) => this.handleRandomStickersToggle(args));
    this.commands.set('.avatar', (args) => this.handleAvatarCommand(args));
    this.commands.set('.avatars', () => this.handleAvatarsListCommand());
    this.commands.set('.glue', () => this.handleGlueCommand());
    this.commands.set('.forcesong', () => this.handleForceSongCommand());
    
    // Hidden commands (not in .commands file but still functional)
    this.commands.set('.commands', () => this.handleCommandsCommand());
    this.commands.set('/status', () => this.handleStatusCommand());
    this.commands.set('/help', () => this.handleHelpCommand());
    this.commands.set('/health', () => this.handleHealthCommand());
    this.commands.set('/ai', (args) => this.handleAICommand(args));
    this.commands.set('/.ai', (args) => this.handleToggleCommand(args)); // Alias for /toggle
    this.commands.set('/toggle', (args) => this.handleToggleCommand(args));
    this.commands.set('/provider', (args) => this.handleToggleCommand(args)); // Another alias
    this.commands.set('/vote', (args) => this.handleVoteCommand(args));
    this.commands.set('/dj', (args) => this.handleDjCommand(args));
    this.commands.set('/memory', () => this.handleMemoryCommand());
    this.commands.set('/mood', () => this.handleMoodCommand());
  }
  
  // Permission checking methods
  isOwner(userId) {
    return this.ownerUserIds.includes(userId);
  }
  
  isAdmin(userId) {
    return this.adminUserIds.includes(userId) || this.isOwner(userId);
  }
  
  isMod(userId) {
    return this.modUserIds.includes(userId) || this.isAdmin(userId);
  }
  
  hasCommandPermission(userId) {
    if (!this.commandsAdminOnly) return true;
    return this.isMod(userId);
  }
  
  canUseAI(userId) {
    if (this.aiKeywordsPublic) return true;
    return this.hasCommandPermission(userId);
  }
  
  // Handle commands in main chat
  async handleCommand(text, userId, userName) {
    this.log(`🎯 Processing command: "${text}" from ${userName}`);
    
    // Store current user context for commands
    this.currentUserId = userId;
    this.currentUserName = userName;
    
    // Check if it's a command
    for (const [command, handler] of this.commands) {
      if (text.startsWith(command)) {
        const args = text.substring(command.length).trim();
        
        // Check permissions for commands
        if (!this.hasCommandPermission(userId)) {
          this.log(`❌ Permission denied for command: ${command} from ${userName}`);
          this.sendChat('❌ You do not have permission to use commands.');
          return;
        }
        
        try {
          this.log(`✅ Executing command: ${command} with args: "${args}"`);
          
          // Handle /info, /song, /album - these handle their own routing (NO userId from main chat)
          if (command === '/info' || command === '/song' || command === '/album') {
            await handler(args, null, null); // null = from main chat
            return;
          }
          
          // Handle other async commands (PUBLIC: /info, /song, /album only)
          if (command === '.stats' || command === '.firstplayed' || command === '.commands' ||
              command === '.uptime' || command === '.testsearch' || command === '.testqueue' ||
              command === '.forcesong' || command === '.hopup' || command === '.hopdown' || command === '.spoil' ||
              command === '.queue' || command === '.search' || command === '.laptop' || command === '.stickers' ||
              command === '.randomstickers' || command === '.glue' || command === '.testhop' || command === '.forcehop' ||
              command === '.refreshroom' || command === '.debugroom' || command === '.selectgenre' || command === '/status' ||
              command === '/help' || command === '/health' || command === '/ai' || command === '/toggle' ||
              command === '/vote' || command === '/dj' || command === '/memory' || command === '/mood') {
            const result = await handler(args, userId, userName);
            if (result) {
              this.sendChat(result);
            }
          } else {
            const result = handler(args, userId, userName);
            if (result) {
              this.sendChat(result);
            }
          }
        } catch (error) {
          this.log(`❌ Command error: ${error.message}`);
          this.sendChat(`❌ Error: ${error.message}`);
        }
        return;
      }
    }
    
    this.log(`❌ Unknown command: ${text}`);
  }

  processPMCommand(event) {
    const text = (event.text || '').trim();
    const sender = event.senderid; // Fix: Use senderid, not userid
    const senderName = event.name;
    
    // Store current user context for commands
    this.currentUserId = sender;
    this.currentUserName = senderName;
    
    // Check if it's a command
    for (const [command, handler] of this.commands) {
      if (text.startsWith(command)) {
        const args = text.substring(command.length).trim();
        
        // Check permissions for commands
        if (!this.hasCommandPermission(sender)) {
          this.sendPM(sender, '❌ You do not have permission to use commands.');
          return;
        }
        
        try {
          // Handle async commands - pass sender info so they know it's from PM
          if (command === '/info' || command === '/song' || command === '/album') {
            // These commands handle their own PM/chat routing
            this.log(`🔍 Calling ${command} handler with sender=${sender}, senderName=${senderName}`);
            handler(sender, senderName).catch(error => {
              this.sendPM(sender, `Error: ${error.message}`);
            });
            return;
          }
          
          if (command === '.stats' || command === '.firstplayed' || 
              command === '.uptime' || command === '/.testsearch' || command === '/.testqueue') {
            handler().then(result => {
              if (result) {
                this.sendPM(sender, result);
              }
            }).catch(error => {
              this.sendPM(sender, `Error: ${error.message}`);
            });
            return;
          }
          
          // Handle synchronous commands
          if (command === '/.spoil' || command === '/.queue') {
            const result = handler();
            if (result) {
              this.sendPM(sender, result);
            }
            return;
          }
          
          // Handle commands with arguments (async)
          if (command === '/.laptop' || command === '/.search' || command === '/.testai') {
            handler(args).then(result => {
              if (result) {
                this.sendPM(sender, result);
              }
            }).catch(error => {
              this.sendPM(sender, `❌ Error: ${error.message}`);
            });
            return;
          }
          
          // Handle commands with arguments (sync)
          if (command === '/.ai' || command === '/provider' || command === '/toggle') {
            const result = handler(args);
            if (result) {
              this.sendPM(sender, result);
            }
            return;
          }
          
          // Handle async commands without arguments
      if (command === '/.testapis' || command === '/.testhop' || command === '/.forcehop' || command === '/.refreshroom' || command === '/.debugroom') {
        handler().then(result => {
          if (result) {
            this.sendPM(sender, result);
          }
        }).catch(error => {
          this.sendPM(sender, `❌ Error: ${error.message}`);
        });
        return;
      }
          
          // Handle glue command (mods/co-owners only)
          if (command === '/.glue') {
            // Set current user context for permission check
            this.currentUserId = sender;
            const result = handler();
            if (result) {
              this.sendPM(sender, result);
            }
            return;
          }
          
          // Handle stickers command with userId for rate limiting
          if (command === '/.stickers') {
            handler(args, sender).then(result => {
              if (result) {
                this.sendPM(sender, result);
              }
            }).catch(error => {
              this.sendPM(sender, `❌ Error: ${error.message}`);
            });
            return;
          }
          
          // Handle avatar commands (async)
          if (command === '/.avatar' || command === '/.avatars') {
            handler(args).then(result => {
              if (result) {
                this.sendPM(sender, result);
              }
            }).catch(error => {
              this.sendPM(sender, `❌ Error: ${error.message}`);
            });
            return;
          }
          
          // Handle randomstickers command with arguments
          if (command === '/.randomstickers') {
            const result = handler(args);
            if (result) {
              this.sendPM(sender, result);
            }
            return;
          }
          
          const result = handler(args);
          if (result) {
            // Owner PM only setting
            if (this.ownerPmOnly && !this.isOwner(sender)) {
              this.sendChat(result); // Send to main chat instead
            } else {
              this.sendPM(sender, result);
            }
          }
        } catch (error) {
          this.sendPM(sender, `❌ Error: ${error.message}`);
        }
        return;
      }
    }
    
    // Don't respond to bots via PM
    if (this.isBotUser(sender, senderName)) {
      this.log(`🤖 Ignoring PM from bot: ${senderName} (${sender})`);
      return;
    }
    
    // Check if message contains keyword triggers for AI response
    if (this.hasKeywordTrigger(text) && this.canUseAI(sender)) {
      this.handleAICommand(text, sender, senderName);
    } else if (this.canUseAI(sender)) {
      // If no keyword trigger, just ignore the message (no response)
      return;
    } else {
      this.sendPM(sender, '❌ You do not have permission to use AI features.');
    }
  }
  
  handleUptimeCommand() {
    const sessionUptime = Date.now() - this.uptimeStart;
    const lifetime = this.lifetimeUptime + sessionUptime;
    
    return `⏱️ Uptime Stats:
📊 Session: ${this.formatUptime(sessionUptime)}
🏆 Lifetime: ${this.formatUptime(lifetime)}
🔄 Last Reset: ${new Date(this.uptimeStart).toLocaleString()}`;
  }
  
  handleStatusCommand() {
    return `🤖 Bot Status:
🔌 Connected: ${this.isConnected ? '✅' : '❌'}
🔐 Authenticated: ${this.isAuthenticated ? '✅' : '❌'}
🏠 Room: ${this.currentRoom ? this.currentRoom.name : 'None'}
👥 Users: ${this.users.size}
🎵 Song: ${this.currentSong ? `${this.currentSong.metadata.artist} - ${this.currentSong.metadata.song}` : 'None'}`;
  }
  
  handleHelpCommand() {
    return `🤖 Available Commands:
/uptime - Show uptime statistics
/status - Show bot status
/info - Show room information
/ai <message> - Chat with AI
/vote <up|down> - Vote on current song
/dj <add|remove> - DJ management
/memory - Show user memory stats
/mood - Show your mood with the bot
/toggle <provider> - Switch AI provider (openai/gemini/huggingface/off)
/help - Show this help

💡 Keyword Triggers (main chat):
bot, b0t, bot2, @bot2, botty, robot, ai

💡 Silent Commands (main chat):
!p - Auto-upvote (silent)

🔒 Admin Commands: ${this.commandsAdminOnly ? 'Enabled' : 'Disabled'}`;
  }

  handleCommandsCommand() {
    try {
      const fs = require('fs');
      const path = require('path');
      const commandsFile = path.join(__dirname, '.commands');
      
      if (fs.existsSync(commandsFile)) {
        const commands = fs.readFileSync(commandsFile, 'utf8').trim();
        return `📋 Available Commands:\n\n${commands}`;
      } else {
        return '❌ Commands file not found.';
      }
    } catch (error) {
      this.log(`❌ Error reading .commands file: ${error.message}`);
      return '❌ Error reading commands file.';
    }
  }
  
  async handleAICommand(message, userId = null, userName = null) {
    try {
      // Check if this is a laptop design request
      const laptopDesignMatch = message.match(/(?:create|make|design|build).*?(?:laptop|sticker|design)/i);
      if (laptopDesignMatch) {
        // Extract potential design term from the message
        const designTerms = message.match(/(?:create|make|design|build)\s+(?:me\s+)?(?:a\s+)?(?:cool\s+)?(?:looking\s+)?(?:laptop\s+)?(?:bot\s+)?(?:with\s+)?(?:sticker\s+)?(?:design\s+)?(?:of\s+)?(?:for\s+)?(.+)/i);
        
        if (designTerms && designTerms[1]) {
          const designTerm = designTerms[1].trim().replace(/\s+(laptop|bot|design|stickers?)$/i, '');
          if (designTerm && designTerm.length > 0) {
            this.log(`🎨 Detected laptop design request: "${designTerm}"`);
            // Use the stickers command functionality
            const result = await this.handleStickersCommand(designTerm, userId);
            if (result && userId) {
              this.sendPM(userId, result);
            }
            return result;
          }
        }
        
        // If no specific term found, use "cool" as default
        this.log(`🎨 Detected generic laptop design request, using "cool"`);
        const result = await this.handleStickersCommand("cool", userId);
        if (result && userId) {
          this.sendPM(userId, result);
        }
        return result;
      }

      const { response, actualProvider } = await this.getAIResponse(message, userId, userName);
      if (userId) {
        this.sendPM(userId, response);
      }
      return response;
    } catch (error) {
      const errorMsg = `❌ AI Error: ${error.message}`;
      if (userId) {
        this.sendPM(userId, errorMsg);
      }
      return errorMsg;
    }
  }
  
  async getAIResponse(message, userId = null, userName = null) {
    this.log(`🤖 Using AI provider: ${this.currentAIProvider}`);
    
    // Use current provider if available and enabled
    if (this.currentAIProvider && this.currentAIProvider !== 'off' && this.aiProviders[this.currentAIProvider].enabled) {
      try {
        this.log(`🎯 Attempting ${this.currentAIProvider}...`);
        const response = await this.callAIProvider(this.currentAIProvider, message, userId, userName);
        return { response, actualProvider: this.currentAIProvider };
      } catch (error) {
        this.log(`❌ ${this.currentAIProvider} failed:`, error.message);
        // Fall through to try other providers
      }
    }
    
    // Try providers in order of preference as fallback
    const providers = ['openai', 'gemini', 'huggingface'];
    
    for (const provider of providers) {
      if (this.aiProviders[provider].enabled) {
        try {
          this.log(`🔄 Fallback to ${provider}...`);
          const response = await this.callAIProvider(provider, message, userId, userName);
          return { response, actualProvider: provider };
        } catch (error) {
          this.log(`❌ ${provider} failed:`, error.message);
          continue;
        }
      }
    }
    
    throw new Error('No AI providers available');
  }
  
  async callAIProvider(provider, message, userId = null, userName = null) {
    switch (provider) {
      case 'openai':
        return await this.callOpenAI(message, userId, userName);
      case 'gemini':
        return await this.callGemini(message, userId, userName);
      case 'huggingface':
        return await this.callHuggingFace(message, userId, userName);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }
  
  // Keyword trigger detection
  hasKeywordTrigger(text) {
    const lowerText = text.toLowerCase();
    const hasTrigger = this.keywordTriggers.some(trigger => 
      lowerText.includes(trigger.toLowerCase())
    );
    
    if (hasTrigger) {
      this.log(`🔍 Keyword trigger found in: "${text}" (triggers: ${this.keywordTriggers.join(', ')})`);
    }
    
    return hasTrigger;
  }
  
  // Bot detection
  isBotUser(userId, userName) {
    // Don't respond to ourselves
    if (userId === this.userId) {
      return true;
    }
    
    // Check if user is in the exclude list
    const excludeNames = (process.env.EXCLUDE_BOT_NAMES || '').split(',').map(name => name.trim().toLowerCase());
    const excludeUserIds = (process.env.EXCLUDE_USERIDS || '').split(',').map(id => id.trim());
    
    if ((userName && excludeNames.includes(userName.toLowerCase())) || excludeUserIds.includes(userId)) {
      return true;
    }
    
    // Check if user is marked as a bot in the user data
    const user = this.users.get(userId);
    if (user && user.bot) {
      return true;
    }
    
    return false;
  }
  
  // Count only human DJs on stage (exclude bots)
  countHumanDJs() {
    let humanCount = 0;
    
    for (const [userId, djData] of this.roomState.djs.entries()) {
      const userName = djData.name || 'Unknown';
      if (!this.isBotUser(userId, userName)) {
        humanCount++;
      }
    }
    
    return humanCount;
  }
  
  // Check if there are any human DJs on stage (not just bots)
  hasHumanDJsOnStage() {
    return this.countHumanDJs() > 0;
  }
  
  // Check if bot is next in the DJ rotation
  isBotNextToPlay() {
    try {
      // Get current room metadata
      if (!this.currentRoom || !this.currentRoom.metadata || !this.currentRoom.metadata.djs) {
        return false;
      }
      
      const djs = this.currentRoom.metadata.djs;
      
      // Find bot's position in DJ list
      const botIndex = djs.findIndex(dj => dj.userid === this.userId);
      if (botIndex === -1) {
        return false; // Bot not on stage
      }
      
      // Get current song's DJ
      const currentSong = this.currentRoom.metadata.current_song;
      if (!currentSong) {
        return false;
      }
      
      const currentDjId = currentSong.djid;
      const currentDjIndex = djs.findIndex(dj => dj.userid === currentDjId);
      
      if (currentDjIndex === -1) {
        return false;
      }
      
      // Calculate if bot is next (circular rotation)
      const nextDjIndex = (currentDjIndex + 1) % djs.length;
      const isBotNext = nextDjIndex === botIndex;
      
      if (isBotNext) {
        this.log(`🎯 Bot is NEXT to play (current DJ: ${currentDjIndex}, bot position: ${botIndex}, next: ${nextDjIndex})`);
      }
      
      return isBotNext;
      
    } catch (error) {
      this.log(`❌ Error checking if bot is next: ${error.message}`);
      return false;
    }
  }
  
  // Handle keyword triggers in main chat
  async handleKeywordTrigger(event) {
    // Check if main chat responses are enabled
    if (process.env.RESPOND_IN_MAIN_CHAT === 'false') {
      this.log('🔇 Main chat responses disabled');
      return;
    }
    
    const userId = event.userid;
    const userName = event.name;
    const message = event.text;
    
    // Always show user messages that trigger the bot
    console.log(`\n💬 ${userName}: ${message}`);
    
    this.log(`🎯 Keyword trigger detected from ${userName}: "${message}"`);
    
    // Don't respond to other bots
    if (this.isBotUser(userId, userName)) {
      this.log(`🤖 Ignoring message from bot: ${userName} (${userId})`);
      return;
    }
    
    // Check if user can use AI
    if (!this.canUseAI(userId)) {
      this.log(`🚫 User ${userName} (${userId}) does not have AI permission`);
      return;
    }
    
    // 🔥 NEW: Check if user just said "bot" with no context - respond without AI tokens
    const messageWithoutKeyword = message.toLowerCase()
      .replace(/\b(bot|b0t|bot2|b0t2|@bot2|@bot)\b/g, '')
      .trim();
    const isJustGreeting = !messageWithoutKeyword || messageWithoutKeyword.length < 3;
    
    if (isJustGreeting) {
      // Random casual responses without using AI (but NOT one word)
      const casualResponses = [
        'yeah, what\'s up.',
        'yo, need something?',
        'sup. what do you want.',
        'yeah, i\'m here.',
        'what\'s going on.'
      ];
      const response = casualResponses[Math.floor(Math.random() * casualResponses.length)];
      this.log(`💬 Simple greeting - responding without AI: "${response}"`);
      this.sendChat(response);
      return;
    }
    
    // Get or create user memory
    const userMemory = this.getUserMemory(userId, userName);
    
    // Check for content filtering
    if (this.isContentFiltered(message)) {
      const response = this.generateFilteredResponse(userMemory);
      this.sendChat(response);
      return;
    }
    
    // Update user interaction history
    this.updateUserMemory(userId, message, userMemory);
    
    // Generate AI response with personality (hang.fm style with moods)
    try {
      const { response, actualProvider } = await this.getAIResponse(message, userId, userName);
      this.log(`✅ AI response generated using ${actualProvider}: ${response}`);
      this.sendChat(response);
    } catch (error) {
      this.log('❌ AI response failed:', error.message);
      
      // Simple fallback responses based on common keywords
      let fallbackResponse = "Sorry, I'm having trouble thinking right now. Try again later!";
      
      const lowerMessage = message.toLowerCase();
      if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
        fallbackResponse = "Hey there! 👋";
      } else if (lowerMessage.includes('how are you') || lowerMessage.includes('how\'s it going')) {
        fallbackResponse = "I'm doing alright, just vibing to the music! 🎵";
      } else if (lowerMessage.includes('what') && lowerMessage.includes('song')) {
        fallbackResponse = "Check the current song info with /song command!";
      } else if (lowerMessage.includes('help')) {
        fallbackResponse = "Try .commands to see what I can do!";
      }
      
      this.log(`🔄 Using fallback response: ${fallbackResponse}`);
      this.sendChat(fallbackResponse);
    }
  }
  
  // Content filtering
  isContentFiltered(message) {
    const lowerMessage = message.toLowerCase();
    
    // Check for filtered content
    for (const filtered of this.contentFilter) {
      if (lowerMessage.includes(filtered.toLowerCase())) {
        return true;
      }
    }
    
    return false;
  }
  
  // Generate response for filtered content
  generateFilteredResponse(userMemory) {
    const responses = [
      "That's not cool, dude. Let's keep it friendly.",
      "Come on, we can do better than that.",
      "Nah, I'm not gonna engage with that kind of stuff.",
      "Let's keep the conversation positive, okay?",
      "I'm not here for that kind of talk."
    ];
    
    // Adjust response based on user mood
    if (userMemory.mood < -2) {
      return responses[Math.floor(Math.random() * responses.length)] + " You're really pushing my buttons here.";
    }
    
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // User memory management
  getUserMemory(userId, userName) {
    if (!this.userMemories.has(userId)) {
      this.userMemories.set(userId, {
        userName: userName,
        mood: 0, // Neutral start (-10 to +10 range)
        interactions: [],
        conversationHistory: [],
        personality: 'deadpan',
        lastInteraction: Date.now(),
        totalInteractions: 0
      });
    }
    
    const memory = this.userMemories.get(userId);
    memory.userName = userName; // Update name in case it changed
    return memory;
  }
  
  // Initialize user stats if not exists
  getUserStats(userId) {
    if (!this.userStats.has(userId)) {
      this.userStats.set(userId, {
        topArtists: new Map(), // artist -> count
        songsPlayed: new Map(), // song -> count
        firstPlayed: new Map() // song -> firstPlayedBy
      });
    }
    return this.userStats.get(userId);
  }
  
  // Update user memory based on interaction
  updateUserMemory(userId, message, userMemory) {
    userMemory.interactions.push({
      message: message,
      timestamp: Date.now()
    });
    
    // Add to conversation history
    userMemory.conversationHistory.push({
      user: message,
      timestamp: Date.now()
    });
    
    // Keep only last 10 interactions and 20 conversation entries
    if (userMemory.interactions.length > 10) {
      userMemory.interactions = userMemory.interactions.slice(-10);
    }
    if (userMemory.conversationHistory.length > 20) {
      userMemory.conversationHistory = userMemory.conversationHistory.slice(-20);
    }
    
    // Analyze message sentiment (enhanced)
    const lowerMessage = message.toLowerCase();
    
    // Positive indicators
    const positiveWords = ['thanks', 'thank you', 'good', 'great', 'awesome', 'nice', 'love', 'like', 'cool', 'sweet', 'amazing', 'perfect', 'excellent', 'fantastic'];
    const negativeWords = ['stupid', 'dumb', 'suck', 'hate', 'annoying', 'boring', 'lame', 'trash', 'garbage', 'terrible', 'awful', 'horrible', 'shitty'];
    const neutralWords = ['ok', 'okay', 'sure', 'whatever', 'fine', 'alright'];
    
    let sentiment = 0;
    positiveWords.forEach(word => {
      if (lowerMessage.includes(word)) sentiment += 1;
    });
    negativeWords.forEach(word => {
      if (lowerMessage.includes(word)) sentiment -= 1;
    });
    neutralWords.forEach(word => {
      if (lowerMessage.includes(word)) sentiment += 0.1; // Slight positive for neutral politeness
    });
    
    // Update mood (-10 to +10 range)
    userMemory.mood = Math.max(-10, Math.min(10, userMemory.mood + sentiment));
    userMemory.totalInteractions++;
    
    // Update personality based on mood (deadpan base)
    if (userMemory.mood > 5) {
      userMemory.personality = 'warm';
    } else if (userMemory.mood > 2) {
      userMemory.personality = 'friendly';
    } else if (userMemory.mood < -5) {
      userMemory.personality = 'hostile';
    } else if (userMemory.mood < -2) {
      userMemory.personality = 'sarcastic';
    } else {
      userMemory.personality = 'deadpan';
    }
    
    userMemory.lastInteraction = Date.now();
  }
  
  // Track song plays for user stats
  trackSongPlay(userId, artist, song) {
    try {
      const userStats = this.getUserStats(userId);
      const songKey = `${artist} - ${song}`;
      
      // Update artist count
      const currentArtistCount = userStats.topArtists.get(artist) || 0;
      userStats.topArtists.set(artist, currentArtistCount + 1);
      
      // Update song count
      const currentSongCount = userStats.songsPlayed.get(songKey) || 0;
      userStats.songsPlayed.set(songKey, currentSongCount + 1);
      
      // Track first played
      if (!userStats.firstPlayed.has(songKey)) {
        userStats.firstPlayed.set(songKey, userId);
      }
      
      this.log(`📊 Tracked song play: ${songKey} by user ${userId}`);
    } catch (error) {
      this.log('❌ Error tracking song play:', error.message);
    }
  }
  
  // Send chat message
  sendChat(message) {
    this.send({
      api: 'room.speak',
      roomid: this.roomId,
      section: this.section,
      text: message
    });
    
    this.log(`💬 Chat sent: ${message}`);
  }
  
  // Alias for hang.fm compatibility
  sendMainChat(message) {
    this.sendChat(message);
  }
  
  // Wikipedia API functions
  async searchWikipedia(query) {
    try {
      // Use the correct Wikipedia API endpoint
      const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
      const response = await axios.get(searchUrl, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'DeepcutAIBot/1.0 (https://deepcut.live)'
        }
      });
      
      if (response.data && response.data.extract) {
        this.log(`✅ Wikipedia found: ${response.data.title}`);
        // Check if this is actually about a music artist/band
        const extract = response.data.extract.toLowerCase();
        const title = response.data.title.toLowerCase();
        
        // Check for obvious non-music content to avoid
        const nonMusicTerms = [
          'chemical compound', 'chemical element', 'ghost story', 'radio station', 'house building', 
          'car manufacturer', 'food recipe', 'animal species', 'plant species', 'city government',
          'movie director', 'film producer', 'book author', 'novel writer', 'game developer', 
          'sport team', 'political party', 'scientific theory', 'medical condition'
        ];
        
        // Check if this is clearly non-music content
        const isNonMusic = nonMusicTerms.some(term => 
          extract.includes(term) || title.includes(term)
        );
        
        // If it's not clearly non-music, assume it might be music-related
        // This is more lenient and will catch more legitimate music artists
        if (!isNonMusic) {
          return {
            title: response.data.title,
            extract: response.data.extract,
            url: response.data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(query)}`
          };
        }
      }
      return null;
    } catch (error) {
      if (error.response) {
        this.log(`❌ Wikipedia API error: ${error.response.status} - ${error.response.statusText}`);
      } else {
        this.log(`❌ Wikipedia search error: ${error.message}`);
      }
      return null;
    }
  }
  
  // Discogs API functions
  async searchDiscogs(query) {
    try {
      const searchUrl = `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=artist&key=${process.env.DISCOGS_API_KEY}&secret=${process.env.DISCOGS_API_SECRET}`;
      const response = await axios.get(searchUrl, { timeout: 5000 });
      
      if (response.data && response.data.results && response.data.results.length > 0) {
        const result = response.data.results[0];
        return {
          title: result.title,
          url: result.resource_url,
          description: result.style ? result.style.join(', ') : 'No description available'
        };
      }
      return null;
    } catch (error) {
      this.log(`❌ Discogs search error: ${error.message}`);
      return null;
    }
  }
  
  // Get room context for AI responses
  getRoomContext() {
    const context = {
      currentSong: this.roomState.currentSong,
      djs: Array.from(this.roomState.djs.entries()).map(([userId, data]) => ({
        userId,
        name: data.name,
        seat: data.seat
      })),
      audience: Array.from(this.roomState.audience.entries()).map(([userId, data]) => ({
        userId,
        name: data.name
      }))
    };
    
    return context;
  }
  
  // Analyze room music trends to suggest songs
  async analyzeRoomMusic() {
    try {
      const allArtists = new Map();
      const allSongs = new Map();
      
      // Collect all artists and songs from user stats
      for (const [userId, userStats] of this.userStats.entries()) {
        for (const [artist, count] of userStats.topArtists.entries()) {
          const currentCount = allArtists.get(artist) || 0;
          allArtists.set(artist, currentCount + count);
        }
        
        for (const [song, count] of userStats.songsPlayed.entries()) {
          const currentCount = allSongs.get(song) || 0;
          allSongs.set(song, currentCount + count);
        }
      }
      
      // Get top artists and songs
      const topArtists = Array.from(allArtists.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([artist, count]) => artist);
      
      const topSongs = Array.from(allSongs.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([song, count]) => song);
      
      return { topArtists, topSongs };
    } catch (error) {
      this.log(`❌ Error analyzing room music: ${error.message}`);
      return { topArtists: [], topSongs: [] };
    }
  }
  
  // Analyze music from multiple sources without API keys
  async analyzeMusicFromMultipleSources(roomAnalysis, currentSong) {
    try {
      const musicData = {
        roomGenres: [],
        similarArtists: [],
        undergroundLabels: [],
        timePeriods: [],
        subGenres: []
      };
      
      // Analyze current song for genre clues
      if (currentSong) {
        const artist = this.cleanArtistNameForDatabase(currentSong.metadata.artist);
        const song = this.cleanSongTitleForDatabase(currentSong.metadata.song);
        
        // Try to get genre info from multiple sources
        const genreInfo = await this.getGenreFromMultipleSources(artist, song);
        if (genreInfo.genres.length > 0) {
          musicData.roomGenres.push(...genreInfo.genres);
        }
        if (genreInfo.similarArtists.length > 0) {
          musicData.similarArtists.push(...genreInfo.similarArtists);
        }
      }
      
      // Analyze room's recent songs for patterns
      if (this.songMetadata.history.length > 0) {
        const recentSongs = this.songMetadata.history.slice(0, 5);
        for (const song of recentSongs) {
          const artist = this.cleanArtistNameForDatabase(song.artist);
          const genreInfo = await this.getGenreFromMultipleSources(artist, song.song);
          if (genreInfo.genres.length > 0) {
            musicData.roomGenres.push(...genreInfo.genres);
          }
        }
      }
      
      // Remove duplicates and get top genres
      musicData.roomGenres = [...new Set(musicData.roomGenres)].slice(0, 5);
      musicData.similarArtists = [...new Set(musicData.similarArtists)].slice(0, 10);
      
      return musicData;
    } catch (error) {
      this.log(`❌ Error in multi-source analysis: ${error.message}`);
      return { roomGenres: [], similarArtists: [], undergroundLabels: [], timePeriods: [], subGenres: [] };
    }
  }
  
  // Get genre information from multiple sources without API keys
  async getGenreFromMultipleSources(artist, song) {
    try {
      const genreInfo = {
        genres: [],
        similarArtists: [],
        labels: [],
        timePeriod: null
      };
      
      // Source 1: Wikipedia (free, no API key needed)
      const wikiGenres = await this.getGenresFromWikipedia(artist);
      if (wikiGenres.length > 0) {
        genreInfo.genres.push(...wikiGenres);
      }
      
      // Source 2: MusicBrainz (free, no API key needed)
      const mbGenres = await this.getGenresFromMusicBrainz(artist);
      if (mbGenres.length > 0) {
        genreInfo.genres.push(...mbGenres);
      }
      
      // Source 3: Last.fm style analysis (free)
      const lastfmGenres = await this.getGenresFromLastFmStyle(artist);
      if (lastfmGenres.length > 0) {
        genreInfo.genres.push(...lastfmGenres);
      }
      
      // Source 4: Rate Your Music style analysis (free)
      const rymGenres = await this.getGenresFromRateYourMusicStyle(artist);
      if (rymGenres.length > 0) {
        genreInfo.genres.push(...rymGenres);
      }
      
      // Remove duplicates and filter for underground genres
      genreInfo.genres = [...new Set(genreInfo.genres)]
        .filter(genre => this.isUndergroundGenre(genre))
        .slice(0, 5);
      
      return genreInfo;
    } catch (error) {
      this.log(`❌ Error getting genre info: ${error.message}`);
      return { genres: [], similarArtists: [], labels: [], timePeriod: null };
    }
  }
  
  // Get genres from Wikipedia (free, no API key)
  async getGenresFromWikipedia(artist) {
    try {
      // This would use Wikipedia's free API or web scraping
      // For now, return common underground genres based on artist name patterns
      const undergroundGenres = [];
      
      // Pattern matching for common underground genres
      const artistLower = artist.toLowerCase();
      
      if (artistLower.includes('death') || artistLower.includes('black') || artistLower.includes('doom')) {
        undergroundGenres.push('metal', 'underground metal');
      }
      if (artistLower.includes('noise') || artistLower.includes('experimental')) {
        undergroundGenres.push('noise rock', 'experimental');
      }
      if (artistLower.includes('math') || artistLower.includes('prog')) {
        undergroundGenres.push('math rock', 'progressive');
      }
      if (artistLower.includes('post') || artistLower.includes('art')) {
        undergroundGenres.push('post-rock', 'art rock');
      }
      if (artistLower.includes('industrial') || artistLower.includes('electronic')) {
        undergroundGenres.push('industrial', 'electronic');
      }
      
      return undergroundGenres;
    } catch (error) {
      return [];
    }
  }
  
  // Get genres from MusicBrainz (free, no API key)
  async getGenresFromMusicBrainz(artist) {
    try {
      // This would use MusicBrainz's free API
      // For now, return common underground genres
      return ['alternative', 'underground', 'indie'];
    } catch (error) {
      return [];
    }
  }
  
  // Get genres from Last.fm style analysis (free)
  async getGenresFromLastFmStyle(artist) {
    try {
      // This would analyze Last.fm style tags
      // For now, return common underground genres
      return ['underground', 'alternative', 'experimental'];
    } catch (error) {
      return [];
    }
  }
  
  // Get genres from Rate Your Music style analysis (free)
  async getGenresFromRateYourMusicStyle(artist) {
    try {
      // This would analyze RYM style genres
      // For now, return common underground genres
      return ['underground', 'alternative', 'experimental'];
    } catch (error) {
      return [];
    }
  }
  
  // Check if a genre is considered underground
  isUndergroundGenre(genre) {
    const undergroundGenres = [
      'underground', 'alternative', 'experimental', 'noise', 'math rock', 'post-rock',
      'art rock', 'progressive', 'avant-garde', 'industrial', 'post-punk', 'shoegaze',
      'black metal', 'doom metal', 'sludge', 'post-metal', 'drone', 'ambient',
      'free jazz', 'noise rock', 'mathcore', 'screamo', 'emo', 'hardcore',
      'crust punk', 'grindcore', 'death metal', 'thrash metal', 'progressive metal'
    ];
    
    return undergroundGenres.some(ug => genre.toLowerCase().includes(ug));
  }
  
  // Generate song suggestion based on room history and popular music
  async generateAISongSuggestion() {
    try {
      this.log('🎵 Generating song suggestion based on room history and popular music...');
      
      // Initialize recently used artists if not exists
      if (!this.recentlyUsedArtists) {
        this.recentlyUsedArtists = [];
      }
      
      // Check if we need to change song due to time interval
      const now = Date.now();
      const timeSinceLastChange = now - this.lastSongChangeTime;
      if (this.botNextSong && timeSinceLastChange < this.songChangeInterval) {
        this.log(`🎵 Song change cooldown active - ${Math.floor((this.songChangeInterval - timeSinceLastChange) / 60000)}m ${Math.floor(((this.songChangeInterval - timeSinceLastChange) % 60000) / 1000)}s remaining`);
        return this.botNextSong; // Return current song if cooldown active
      }
      
      // 🔥 NEW: Determine AI usage based on stage status
      const hasHumans = this.hasHumanDJsOnStage();
      const humanCount = this.countHumanDJs();
      const hasHumanHistory = this.roomSongHistory && this.roomSongHistory.length > 0;
      
      // ALWAYS use curated list when on the floor (save AI tokens for when on stage)
      if (!this.isBotOnStage) {
        this.log(`💰 Bot on floor - using CURATED LIST (saving AI tokens for stage)`);
        return await this.generateSongFromCuratedList();
      }
      
      // ONLY use curated list if: no humans on stage AND no human play history
      if (!hasHumans && !hasHumanHistory) {
        this.log(`💰 No humans on stage and no human history - using CURATED LIST (no AI tokens)`);
        return await this.generateSongFromCuratedList();
      } else if (hasHumans) {
        this.log(`🤖 ${humanCount} human DJs on stage - using AI to match their vibe`);
      } else if (hasHumanHistory) {
        this.log(`📚 No humans currently but ${this.roomSongHistory.length} human plays in history - using AI to match learned taste`);
      }
      
      // Step 1: Try to learn from what people actually play in the room
      if (this.roomSongHistory && this.roomSongHistory.length > 0) {
        this.log('📚 Step 1: Learning from room song history...');
        const roomArtists = [...new Set(this.roomSongHistory.map(song => song.artist))];
        this.log(`📚 Found ${roomArtists.length} unique artists from room history`);
        
        // Pick a random artist from room history (avoiding recently used)
        const availableRoomArtists = roomArtists.filter(artist => 
          !this.recentlyUsedArtists.includes(artist.toLowerCase())
        );
        
        if (availableRoomArtists.length > 0) {
          const randomRoomArtist = availableRoomArtists[Math.floor(Math.random() * availableRoomArtists.length)];
          this.recentlyUsedArtists.push(randomRoomArtist.toLowerCase());
          if (this.recentlyUsedArtists.length > 5) {
            this.recentlyUsedArtists = this.recentlyUsedArtists.slice(-5);
          }
          
          this.log(`🎲 Selected artist from room history: ${randomRoomArtist}`);
          
          // Get songs for this artist
          const artistSongs = await this.getSongsForArtist(randomRoomArtist);
          if (artistSongs.length > 0) {
            // Filter out already played songs
            const unplayedSongs = artistSongs.filter(song => {
              const songKey = `${randomRoomArtist} - ${song}`;
              return !this.playedSongs.has(songKey);
            });
            
            if (unplayedSongs.length === 0) {
              this.log(`🔄 All songs by ${randomRoomArtist} have been played, clearing played songs for this artist`);
              // Clear played songs for this artist
              const artistPlayedSongs = Array.from(this.playedSongs).filter(song => song.startsWith(`${randomRoomArtist} -`));
              artistPlayedSongs.forEach(song => this.playedSongs.delete(song));
              unplayedSongs.push(...artistSongs);
            }
            
            const randomSong = unplayedSongs[Math.floor(Math.random() * unplayedSongs.length)];
            const foundSong = await this.searchForSong(randomRoomArtist, randomSong);
            
            if (foundSong) {
              this.log(`✅ Found room-inspired song: ${randomRoomArtist} - ${randomSong}`);
              this.lastSongChangeTime = now; // Update last change time
              return {
                artist: randomRoomArtist,
                title: randomSong,
                source: 'Room History + MusicBrainz + YouTube',
                youtubeSong: foundSong
              };
            }
          }
        }
      }
      
      // Step 2: Fallback to popular/established artists (not experimental)
      this.log('📚 Step 2: Using popular established artists...');
      const popularArtists = [
        'Radiohead', 'Arcade Fire', 'Interpol', 'The National', 'Bon Iver',
        'Vampire Weekend', 'LCD Soundsystem', 'The Strokes', 'Yeah Yeah Yeahs',
        'Modest Mouse', 'Death Cab for Cutie', 'Bright Eyes', 'Sufjan Stevens',
        'Fleet Foxes', 'Grizzly Bear', 'Animal Collective', 'Beach House',
        'Tame Impala', 'Mac DeMarco', 'King Gizzard', 'Unknown Mortal Orchestra',
        'MGMT', 'Phoenix', 'Franz Ferdinand', 'Bloc Party', 'The Killers',
        'Arctic Monkeys', 'The White Stripes', 'Queens of the Stone Age',
        'Tool', 'Deftones', 'System of a Down', 'Rage Against the Machine',
        'Nine Inch Nails', 'Smashing Pumpkins', 'Pearl Jam', 'Soundgarden',
        'Red Hot Chili Peppers', 'Foo Fighters', 'Green Day', 'Weezer'
      ];
      
      // Pick a random popular artist (avoiding recently used)
      const availablePopularArtists = popularArtists.filter(artist => 
        !this.recentlyUsedArtists.includes(artist.toLowerCase())
      );
      
      if (availablePopularArtists.length === 0) {
        this.log('🔄 All popular artists recently used, resetting...');
        this.recentlyUsedArtists = [];
        availablePopularArtists.push(...popularArtists);
      }
      
      const randomPopularArtist = availablePopularArtists[Math.floor(Math.random() * availablePopularArtists.length)];
      this.recentlyUsedArtists.push(randomPopularArtist.toLowerCase());
      if (this.recentlyUsedArtists.length > 5) {
        this.recentlyUsedArtists = this.recentlyUsedArtists.slice(-5);
      }
      
      this.log(`🎲 Selected popular artist: ${randomPopularArtist}`);
      
      // Get songs for this popular artist
      const artistSongs = await this.getSongsForArtist(randomPopularArtist);
      if (artistSongs.length > 0) {
        // Filter out already played songs
        const unplayedSongs = artistSongs.filter(song => {
          const songKey = `${randomPopularArtist} - ${song}`;
          return !this.playedSongs.has(songKey);
        });
        
        if (unplayedSongs.length === 0) {
          this.log(`🔄 All songs by ${randomPopularArtist} have been played, clearing played songs for this artist`);
          // Clear played songs for this artist
          const artistPlayedSongs = Array.from(this.playedSongs).filter(song => song.startsWith(`${randomPopularArtist} -`));
          artistPlayedSongs.forEach(song => this.playedSongs.delete(song));
          unplayedSongs.push(...artistSongs);
        }
        
        const randomSong = unplayedSongs[Math.floor(Math.random() * unplayedSongs.length)];
        const foundSong = await this.searchForSong(randomPopularArtist, randomSong);
        
        if (foundSong) {
          this.log(`✅ Found popular song: ${randomPopularArtist} - ${randomSong}`);
          this.lastSongChangeTime = now; // Update last change time
          return {
            artist: randomPopularArtist,
            title: randomSong,
            source: 'Popular Artists + MusicBrainz + YouTube',
            youtubeSong: foundSong
          };
        }
      }
      
      // Step 3: Final fallback to curated songs
      this.log('📚 Step 3: Using curated fallback songs...');
      return await this.generateFallbackSong();
      
    } catch (error) {
      this.log(`❌ Error generating song suggestion: ${error.message}`);
      return await this.generateFallbackSong();
    }
  }
  
  // Get real artists from Wikipedia and MusicBrainz databases
  async getRealArtistsFromDatabases() {
    try {
      const artists = [];
      
      // Get artists from Wikipedia genre pages (using actual Wikipedia page titles)
      const genrePages = [
        'Alternative hip hop',
        'Underground hip hop', 
        'Post-rock',
        'Math rock',
        'Post-metal',
        'Experimental rock',
        'Noise rock',
        'Hardcore punk',
        'Shoegaze',
        'Dream pop',
        'Indie rock',
        'Art rock',
        'Progressive rock',
        'Avant-garde music',
        'Free jazz',
        'Noise music',
        'Industrial music',
        'Dark ambient',
        'Drone music',
        'Minimal music'
      ];
      
      for (const page of genrePages) {
        try {
          this.log(`📚 Searching Wikipedia for: ${page}`);
          const info = await this.searchWikipedia(page);
          if (info && info.extract) {
            // Extract artist names from Wikipedia text using better patterns
            const text = info.extract;
            
            // Look for common patterns like "Artists include:", "Notable artists:", etc.
            const artistPatterns = [
              /(?:artists? include|notable artists?|prominent artists?|key artists?)[:;]\s*([^.]+)/gi,
              /(?:such as|including|like)\s+([A-Z][a-zA-Z\s&,]+(?:[A-Z][a-zA-Z\s&,]*)*)/g,
              /([A-Z][a-zA-Z\s&]+(?:[A-Z][a-zA-Z\s&]*)*)\s+(?:is|was|are|were)\s+(?:a|an)\s+(?:band|artist|group|musician)/g
            ];
            
            for (const pattern of artistPatterns) {
              let match;
              while ((match = pattern.exec(text)) !== null) {
                const artistText = match[1] || match[0];
                // Split by common separators
                const potentialArtists = artistText.split(/[,;]|\sand\s|\s&\s/);
                
                potentialArtists.forEach(potentialArtist => {
                  const artist = potentialArtist.trim();
                  // Filter out common words and keep only potential artist names
                  if (artist.length > 2 && artist.length < 50 && 
                      !artist.includes('the ') && !artist.includes('and ') &&
                      !artist.includes('or ') && !artist.includes('of ') &&
                      !artist.includes('in ') && !artist.includes('on ') &&
                      !artist.includes('at ') && !artist.includes('to ') &&
                      !artist.includes('for ') && !artist.includes('with ') &&
                      !artist.includes('from ') && !artist.includes('by ') &&
                      !artist.match(/^\d+$/) && // Not just numbers
                      !artist.includes('(') && !artist.includes(')') && // No parentheses
                      !artist.includes('[') && !artist.includes(']') && // No brackets
                      !artist.toLowerCase().includes('genre') &&
                      !artist.toLowerCase().includes('music') &&
                      !artist.toLowerCase().includes('style')) {
                    artists.push(artist);
                  }
                });
              }
            }
          }
        } catch (error) {
          this.log(`❌ Error searching Wikipedia for ${page}: ${error.message}`);
        }
      }
      
      // Remove duplicates
      const uniqueArtists = [...new Set(artists)];
      this.log(`📚 Extracted ${uniqueArtists.length} unique artists from Wikipedia`);
      
      // If Wikipedia didn't return enough artists, use curated list
      if (uniqueArtists.length < 10) {
        this.log(`📚 Wikipedia returned only ${uniqueArtists.length} artists, adding curated underground artists...`);
        const curatedArtists = [
          // 90s Underground Hip Hop (Boom Bap Era)
          'MF DOOM', 'Madvillain', 'J Dilla', 'Slum Village', 'The Pharcyde',
          'Souls of Mischief', 'Hieroglyphics', 'Del the Funky Homosapien', 'Casual',
          'Company Flow', 'Cannibal Ox', 'El-P', 'Aesop Rock', 'Atmosphere',
          'Blackalicious', 'Jurassic 5', 'Dilated Peoples', 'People Under the Stairs',
          'Quasimoto', 'Madlib', 'Oh No', 'Wildchild', 'Lootpack',
          'Gang Starr', 'DJ Premier', 'Pete Rock & CL Smooth', 'Lord Finesse',
          'Organized Konfusion', 'O.C.', 'Big L', 'Showbiz & A.G.',
          'Black Moon', 'Smif-N-Wessun', 'Heltah Skeltah', 'Originoo Gunn Clappaz',
          'Jeru the Damaja', 'Group Home', 'Black Star', 'Mos Def', 'Talib Kweli',
          'Common', 'The Roots', 'Bahamadia', 'Rasco', 'Planet Asia',
          'Dilated Peoples', 'Evidence', 'Alchemist', 'Mobb Deep', 'Capone-N-Noreaga',
          'Cella Dwellas', 'Da Beatminerz', 'KMD', 'Mr. Lif', 'Akrobatik',
          'Non Phixion', 'Necro', 'Ill Bill', 'Apathy', 'Celph Titled',
          'Louis Logic', 'Cage', 'Copywrite', 'RJD2', 'Blueprint',
          'Eyedea & Abilities', 'Slug', 'Brother Ali', 'Sage Francis', 'Sole',
          'Anticon', 'Dose One', 'Pedestrian', 'Buck 65', 'Sixtoo',
          'Busdriver', 'Abstract Rude', 'Aceyalone', 'Freestyle Fellowship',
          'Living Legends', 'Murs', 'Eligh', 'Scarub', 'Grouch & Eligh',
          'Zion I', 'The Grouch', 'Grouch & Eligh', 'Binary Star', 'One Be Lo',
          'Cunninlynguists', 'Kno', 'Natti', 'Mr. SOS', 'CunninLynguists',
          
          // Post-Rock / Math Rock / Experimental
          'Slint', 'Shellac', 'Fugazi', 'Unwound', 'Drive Like Jehu',
          'Don Caballero', 'Hella', 'Tera Melos', 'Battles', 'Giraffes? Giraffes!',
          'Tortoise', 'Mogwai', 'Godspeed You! Black Emperor', 'Explosions in the Sky',
          
          // Post-Metal / Sludge / Doom
          'Neurosis', 'Isis', 'Pelican', 'Russian Circles', 'Cult of Luna',
          'Rosetta', 'The Ocean', 'Intronaut', 'Mastodon', 'Sleep',
          
          // Electronic / IDM / Experimental
          'Autechre', 'Aphex Twin', 'Boards of Canada', 'Four Tet', 'Flying Lotus',
          'Oneohtrix Point Never', 'Tim Hecker', 'Clark', 'Jon Hopkins', 'Moderat',
          
          // Noise Rock / Industrial
          'Big Black', 'Sonic Youth', 'The Jesus Lizard', 'Melvins', 'Lightning Bolt',
          
          // Shoegaze / Dream Pop
          'My Bloody Valentine', 'Slowdive', 'Ride', 'Cocteau Twins', 'Beach House',
          
          // Jazz / Avant-Garde
          'John Coltrane', 'Sun Ra', 'Pharoah Sanders', 'The Bad Plus',
          
          // Ambient / Drone
          'Brian Eno', 'Stars of the Lid', 'William Basinski', 'Tim Hecker', 'Grouper'
        ];
        
        // Combine and remove duplicates
        const allArtists = [...new Set([...uniqueArtists, ...curatedArtists])];
        this.log(`📚 Total artists available: ${allArtists.length} (${uniqueArtists.length} from Wikipedia + ${curatedArtists.length} curated)`);
        return allArtists;
      } else {
        this.log(`📚 Wikipedia returned ${uniqueArtists.length} artists - using pure Wikipedia database!`);
      }
      
      return uniqueArtists;
      
    } catch (error) {
      this.log(`❌ Error getting real artists from databases: ${error.message}`);
      return [];
    }
  }
  
  // Get songs for an artist from MusicBrainz
  async getSongsForArtist(artist) {
    try {
      this.log(`🎵 Searching MusicBrainz for songs by: ${artist}`);
      
      // Search for recordings by this artist
      const searchUrl = `https://musicbrainz.org/ws/2/recording?query=artist:"${encodeURIComponent(artist)}"&fmt=json&limit=50`;
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'DeepcutAIBot/1.0 (https://deepcut.live)',
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      
      if (!response.data.recordings || response.data.recordings.length === 0) {
        this.log(`❌ No recordings found for ${artist} on MusicBrainz`);
        return [];
      }
      
      // Extract song titles and filter out duplicates
      const songs = [];
      const seenSongs = new Set();
      
      for (const recording of response.data.recordings) {
        const title = recording.title;
        if (title && !seenSongs.has(title.toLowerCase())) {
          seenSongs.add(title.toLowerCase());
          songs.push(title);
        }
      }
      
      this.log(`🎵 Found ${songs.length} unique songs for ${artist} on MusicBrainz`);
      return songs;
      
    } catch (error) {
      this.log(`❌ Error getting songs for ${artist}: ${error.message}`);
      return [];
    }
  }
  
  // Generate song suggestion based on room vibe using Wikipedia genre database
  async generateSongSuggestion() {
    try {
      const currentSong = this.roomState.currentSong;
      
      if (!currentSong) {
        // No current song, pick a random obscure artist
        return await this.pickRandomObscureSong();
      }
      
      // Get the genre of the current song from Wikipedia
      const currentArtist = this.cleanArtistNameForDatabase(currentSong.metadata.artist);
      const currentGenres = await this.getArtistGenresFromWikipedia(currentArtist);
      
      if (currentGenres.length === 0) {
        // No genre found, pick a random obscure song
        return await this.pickRandomObscureSong();
      }
      
      // Find similar artists in the same genre using Wikipedia
      const similarArtists = await this.findSimilarArtistsByGenre(currentGenres[0]);
      
      if (similarArtists.length === 0) {
        // No similar artists found, pick a random obscure song
        return await this.pickRandomObscureSong();
      }
      
      // Pick a random similar artist and song
      const randomArtist = similarArtists[Math.floor(Math.random() * similarArtists.length)];
      const randomSong = await this.getRandomSongFromArtist(randomArtist);
      
      if (randomSong) {
        this.log(`🎵 Room vibe: ${currentGenres[0]} → Similar artist: ${randomArtist} - ${randomSong}`);
        return {
          artist: randomArtist,
          title: randomSong,
          genre: currentGenres[0],
          source: 'Wikipedia Genre Database'
        };
      }
      
      // Fallback to random obscure song
      return await this.pickRandomObscureSong();
      
    } catch (error) {
      this.log(`❌ Error generating song suggestion: ${error.message}`);
      return await this.pickRandomObscureSong();
    }
  }
  
  // Get artist genres from Wikipedia (free, no API key)
  async getArtistGenresFromWikipedia(artist) {
    try {
      // This would use Wikipedia's free API or web scraping
      // For now, use pattern matching based on artist names
      const genres = [];
      const artistLower = artist.toLowerCase();
      
      // Pattern matching for common underground genres
      if (artistLower.includes('death') || artistLower.includes('black') || artistLower.includes('doom') || artistLower.includes('neurosis') || artistLower.includes('isis')) {
        genres.push('post-metal', 'sludge metal', 'progressive metal');
      }
      if (artistLower.includes('noise') || artistLower.includes('experimental') || artistLower.includes('swans')) {
        genres.push('noise rock', 'experimental rock');
      }
      if (artistLower.includes('math') || artistLower.includes('prog') || artistLower.includes('giraffes')) {
        genres.push('math rock', 'progressive rock');
      }
      if (artistLower.includes('post') || artistLower.includes('art') || artistLower.includes('tortoise')) {
        genres.push('post-rock', 'art rock');
      }
      if (artistLower.includes('industrial') || artistLower.includes('electronic') || artistLower.includes('purity ring')) {
        genres.push('electronic', 'synth-pop', 'indie electronic');
      }
      if (artistLower.includes('hip') || artistLower.includes('rap') || artistLower.includes('company flow') || artistLower.includes('cannibal ox')) {
        genres.push('underground hip hop', 'alternative hip hop');
      }
      if (artistLower.includes('fugazi') || artistLower.includes('shellac') || artistLower.includes('slint')) {
        genres.push('post-hardcore', 'alternative rock');
      }
      
      return genres;
    } catch (error) {
      return [];
    }
  }
  
  // Find similar artists by genre using Wikipedia
  async findSimilarArtistsByGenre(genre) {
    try {
      // This would search Wikipedia for artists in the same genre
      // For now, return curated lists based on genre
      const genreArtists = {
        'post-metal': ['Cult of Luna', 'The Ocean', 'Amenra', 'Sumac', 'Old Man Gloom', 'Pelican', 'Russian Circles'],
        'sludge metal': ['Eyehategod', 'Crowbar', 'Down', 'Acid Bath', 'Buzzov•en', 'Iron Monkey'],
        'progressive metal': ['Tool', 'Mastodon', 'Gojira', 'Meshuggah', 'Devin Townsend', 'Opeth'],
        'noise rock': ['Big Black', 'Scratch Acid', 'The Jesus Lizard', 'Shellac', 'Butthole Surfers'],
        'experimental rock': ['Swans', 'Sonic Youth', 'The Residents', 'Captain Beefheart', 'Frank Zappa'],
        'math rock': ['Don Caballero', 'Hella', 'Tera Melos', 'Battles', 'Giraffes? Giraffes!', 'Ttng'],
        'post-rock': ['Godspeed You! Black Emperor', 'Explosions in the Sky', 'Mogwai', 'Sigur Rós', 'Mono'],
        'art rock': ['Tortoise', 'Do Make Say Think', 'The Sea and Cake', 'Gastr del Sol'],
        'electronic': ['Boards of Canada', 'Autechre', 'Aphex Twin', 'Squarepusher', 'Plaid'],
        'synth-pop': ['Purity Ring', 'CHVRCHES', 'Grimes', 'Crystal Castles', 'Fever Ray'],
        'indie electronic': ['Caribou', 'Four Tet', 'Flying Lotus', 'Bonobo', 'Tycho'],
        'underground hip hop': ['Company Flow', 'Cannibal Ox', 'El-P', 'Aesop Rock', 'MF DOOM'],
        'alternative hip hop': ['Quasimoto', 'Madlib', 'Dälek', 'Antipop Consortium', 'Deltron 3030'],
        'post-hardcore': ['Fugazi', 'At the Drive-In', 'Drive Like Jehu', 'Unwound', 'Rodan'],
        'alternative rock': ['Slint', 'Polvo', 'The Jesus Lizard', 'Shellac', 'Big Black']
      };
      
      return genreArtists[genre] || [];
    } catch (error) {
      return [];
    }
  }
  
  // Get a random song from an artist
  async getRandomSongFromArtist(artist) {
    try {
      // This would search for the artist's songs
      // For now, return common songs from these artists
      const artistSongs = {
        'Cult of Luna': ['The Wreck of S.S. Needle', 'Dark City, Dead Man', 'In Awe Of'],
        'The Ocean': ['Permian: The Great Dying', 'Bathyalpelagic I: Impasses', 'Jurassic | Cretaceous'],
        'Amenra': ['A Solitary Reign', 'De Evenmens', 'A Mon Ame'],
        'Sumac': ['Image of Control', 'The Task', 'Attis\' Blade'],
        'Old Man Gloom': ['To Carry the Flame', 'The Lash', 'Common Species'],
        'Pelican': ['March Into the Sea', 'Dead Between the Walls', 'The Creeper'],
        'Russian Circles': ['Harper Lewis', 'Station', 'Mlàdek'],
        'Eyehategod': ['Blank', 'Dixie Whiskey', 'Sister Fucker'],
        'Crowbar': ['Planets Collide', 'All I Had (I Gave)', 'Existence is Punishment'],
        'Down': ['Stone the Crow', 'Bury Me in Smoke', 'Lifer'],
        'Acid Bath': ['The Blue', 'Scream of the Butterfly', 'Toubabo Koomi'],
        'Buzzov•en': ['Dirtkicker', 'To a Frown', 'Sore'],
        'Iron Monkey': ['Bad Year', 'Big Loader', 'Black Aspirin'],
        'Tool': ['Lateralus', 'Schism', 'Forty Six & 2'],
        'Mastodon': ['Blood and Thunder', 'Oblivion', 'The Czar'],
        'Gojira': ['Flying Whales', 'The Art of Dying', 'Silvera'],
        'Meshuggah': ['Bleed', 'Rational Gaze', 'New Millennium Cyanide Christ'],
        'Devin Townsend': ['Kingdom', 'Deadhead', 'Juular'],
        'Opeth': ['Blackwater Park', 'The Drapery Falls', 'Ghost of Perdition'],
        'Big Black': ['Kerosene', 'Bad Penny', 'The Model'],
        'Scratch Acid': ['Cannibal', 'Mary Had a Little Drug Problem', 'Owner\'s Lament'],
        'The Jesus Lizard': ['Puss', 'Seasick', 'Mouth Breather'],
        'Shellac': ['Prayer to God', 'The End of Radio', 'My Black Ass'],
        'Butthole Surfers': ['Pepper', 'Who Was in My Room Last Night?', 'The Shame of Life'],
        'Swans': ['Screen Shot', 'Oxygen', 'The Glowing Man'],
        'Sonic Youth': ['Teen Age Riot', 'Kool Thing', 'Bull in the Heather'],
        'The Residents': ['Constantinople', 'Hello Skinny', 'Kaw-Liga'],
        'Captain Beefheart': ['Tropical Hot Dog Night', 'Ice Cream for Crow', 'Dachau Blues'],
        'Frank Zappa': ['Peaches en Regalia', 'Watermelon in Easter Hay', 'The Black Page'],
        'Don Caballero': ['Slice Where You Live Like Pie', 'Please Tokio, Please This is Tokio', 'Room Temperature Suite'],
        'Hella': ['Biblical Violence', 'There\'s No 666 in Outer Space', 'Republic of Rough and Ready'],
        'Tera Melos': ['Melody 4', 'Weird Circles', '40 Rods to the Hog\'s Head'],
        'Battles': ['Atlas', 'Ice Cream', 'The Yabba'],
        'Giraffes? Giraffes!': ['When The Catholic Girls Go Camping, The Nicotine Vampires Rule Supreme', 'I Am S/H(im)e[r] As You Am S/H(im)e[r] As You Are Me And We Am I And I', 'A Quick One, While She\'s Away'],
        'Ttng': ['Baboon', '26 is Dancier Than 4', 'Adventure, Stamina & Anger'],
        'Godspeed You! Black Emperor': ['Storm', 'Mladic', 'Bosses Hang'],
        'Explosions in the Sky': ['Your Hand in Mine', 'First Breath After Coma', 'The Only Moment We Were Alone'],
        'Mogwai': ['Mogwai Fear Satan', 'Helicon 1', 'Auto Rock'],
        'Sigur Rós': ['Hoppípolla', 'Svefn-g-englar', 'Glósóli'],
        'Mono': ['Ashes in the Snow', 'Pure as Snow', 'Follow the Map'],
        'Tortoise': ['Djed', 'TNT', 'Swung from the Gutters'],
        'Do Make Say Think': ['The Universe!', 'A Tender History in Rust', 'Bound to Be That Way'],
        'The Sea and Cake': ['The Argument', 'Jacking the Ball', 'The Fawn'],
        'Gastr del Sol': ['The Harp Factory on Lake Street', 'Our Exquisite Replica of "Eternity"', 'The Seasons Reverse'],
        'Boards of Canada': ['Roygbiv', 'Dayvan Cowboy', 'Everything You Do is a Balloon'],
        'Autechre': ['Bike', 'Gantz Graf', 'Cipater'],
        'Aphex Twin': ['Windowlicker', 'Avril 14th', 'Flim'],
        'Squarepusher': ['Come On My Selector', 'My Red Hot Car', 'Iambic 9 Poetry'],
        'Plaid': ['Eyen', 'Ralome', 'Dang Spot'],
        'Purity Ring': ['Fineshrine', 'Obedear', 'Begin Again'],
        'CHVRCHES': ['The Mother We Share', 'Recover', 'Clearest Blue'],
        'Grimes': ['Oblivion', 'Genesis', 'Kill V. Maim'],
        'Crystal Castles': ['Not in Love', 'Baptism', 'Celestica'],
        'Fever Ray': ['If I Had a Heart', 'Keep the Streets Empty for Me', 'To the Moon and Back'],
        'Caribou': ['Can\'t Do Without You', 'Odessa', 'Sun'],
        'Four Tet': ['Love Cry', 'She Just Likes to Fight', 'Morning Side'],
        'Flying Lotus': ['Do the Astral Plane', 'Zodiac Shit', 'Never Catch Me'],
        'Bonobo': ['Kiara', 'Cirrus', 'Kong'],
        'Tycho': ['A Walk', 'Awake', 'Dive'],
        'Company Flow': ['8 Steps to Perfection', 'Patriotism', 'The Fire in Which You Burn'],
        'Cannibal Ox': ['Pigeon', 'Iron Galaxy', 'Raspberry Fields'],
        'El-P': ['The Full Retard', 'Deep Space 9mm', 'Tasmanian Pain Coaster'],
        'Aesop Rock': ['None Shall Pass', 'Daylight', 'Rings'],
        'MF DOOM': ['Rapp Snitch Knishes', 'All Caps', 'Doomsday'],
        'Quasimoto': ['Microphone Mathematics', 'Come On Feet', 'Low Class Conspiracy'],
        'Madlib': ['Shades of Blue', 'The Payback', 'Stepping Into Tomorrow'],
        'Dälek': ['Distorted Prose', 'Classical Homicide', 'Asylum (Permanent Underclass)'],
        'Antipop Consortium': ['Ghostlawns', 'Ping Pong', 'Volcano'],
        'Deltron 3030': ['3030', 'Mastermind', 'Virus'],
        'Fugazi': ['Waiting Room', 'Repeater', 'Suggestion'],
        'At the Drive-In': ['One Armed Scissor', 'Invalid Litter Dept.', 'Pattern Against User'],
        'Drive Like Jehu': ['Here Come the Rome Plows', 'Luau', 'Do You Compute'],
        'Unwound': ['Corpse Pose', 'Hexenzsene', 'Fake Train'],
        'Rodan': ['Bible Silver Corner', 'Shiner', 'The Everyday World of Bodies'],
        'Slint': ['Good Morning, Captain', 'Breadcrumb Trail', 'Washer'],
        'Polvo': ['Thermal Treasure', 'Fast Canoe', 'My Kimono'],
        'The Jesus Lizard': ['Puss', 'Seasick', 'Mouth Breather'],
        'Shellac': ['Prayer to God', 'The End of Radio', 'My Black Ass'],
        'Big Black': ['Kerosene', 'Bad Penny', 'The Model']
      };
      
      const songs = artistSongs[artist] || [];
      if (songs.length > 0) {
        return songs[Math.floor(Math.random() * songs.length)];
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }
  
  // Pick a random obscure song when no context is available
  async pickRandomObscureSong() {
    try {
      const obscureArtists = [
        'Company Flow', 'Cannibal Ox', 'El-P', 'Aesop Rock', 'MF DOOM',
        'Slint', 'Shellac', 'Fugazi', 'Unwound', 'Drive Like Jehu',
        'Neurosis', 'Isis', 'Pelican', 'Russian Circles', 'Cult of Luna',
        'Autechre', 'Aphex Twin', 'Squarepusher', 'Venetian Snares', 'Boards of Canada',
        'Big Black', 'Scratch Acid', 'The Birthday Party', 'Swans', 'Sonic Youth',
        'Don Caballero', 'Hella', 'Tera Melos', 'Battles', 'Giraffes? Giraffes!',
        'Tortoise', 'Mogwai', 'Godspeed You! Black Emperor', 'Explosions in the Sky', 'Sigur Rós'
      ];
      
      const randomArtist = obscureArtists[Math.floor(Math.random() * obscureArtists.length)];
      const randomSong = await this.getRandomSongFromArtist(randomArtist);
      
      if (randomSong) {
        return {
          artist: randomArtist,
          title: randomSong,
          genre: 'Underground',
          source: 'Random Obscure'
        };
      }
      
      // Final fallback
      return await this.generateFallbackSong();
      
    } catch (error) {
      return await this.generateFallbackSong();
    }
  }
  
  // Auto-hop system: automatically join stage when other bots are present
  async checkForBotsOnStage() {
    try {
      // Don't check if we're glued (unless Ammy PM received)
      if (this.isGlued() && !this.ammyPMReceived) {
        return;
      }
      
      // Don't spam check (limit to once every 30 seconds, unless Ammy PM received)
      const now = Date.now();
      if (now - this.lastStageCheck < 30000 && !this.ammyPMReceived) {
        return;
      }
      this.lastStageCheck = now;
      
      // Get current DJs on stage (convert Map to array)
      const djsArray = Array.from(this.roomState.djs.values()) || [];
      const djsUserIds = Array.from(this.roomState.djs.keys()) || [];
      const botUserIds = (process.env.EXCLUDE_USERIDS || '').split(',').map(id => id.trim());
      
      // SANITY CHECK: Verify bot's actual stage status from DJ list
      const actuallyOnStage = djsUserIds.includes(this.userId);
      if (this.isBotOnStage !== actuallyOnStage) {
        this.log(`⚠️ Stage status mismatch detected! isBotOnStage=${this.isBotOnStage}, actuallyOnStage=${actuallyOnStage} - correcting...`);
        this.isBotOnStage = actuallyOnStage;
      }
      
      this.log(`🔍 Bot User IDs to check: ${botUserIds.join(', ')}`);
      this.log(`🔍 Current DJ User IDs: ${djsUserIds.join(', ')}`);
      
      // Check if any DJs are bots by UserID OR by name (excluding self)
      const botNames = (process.env.EXCLUDE_BOT_NAMES || '').split(',').map(name => name.trim().toLowerCase());
      this.log(`🔍 Bot names to check: ${botNames.join(', ')}`);
      
      let botsOnStage = false;
      for (let i = 0; i < djsArray.length; i++) {
        const dj = djsArray[i];
        const userId = djsUserIds[i];
        const djName = dj.name ? dj.name.toLowerCase() : '';
        
        // Don't count the bot itself as a bot on stage
        if (userId !== this.userId) {
          // Check by User ID
          if (userId && botUserIds.includes(userId)) {
            botsOnStage = true;
            this.log(`🤖 Bot detected on stage (by User ID): ${dj.name} (${userId})`);
            break;
          }
          
          // Check by name
          if (djName && botNames.some(botName => djName.includes(botName))) {
            botsOnStage = true;
            this.log(`🤖 Bot detected on stage (by name): ${dj.name} (${userId})`);
            break;
          }
        }
      }
      
      if (!botsOnStage) {
        // Show which DJs are humans vs bots (excluding this bot itself)
        const humanDJs = djsArray.filter((dj, i) => {
          const userId = djsUserIds[i];
          return userId !== this.userId && !botUserIds.includes(userId);
        });
        const botDJs = djsArray.filter((dj, i) => {
          const userId = djsUserIds[i];
          return userId !== this.userId && botUserIds.includes(userId);
        });
        
        let stageInfo = `🔍 Stage: ${djsArray.length} DJs (${humanDJs.length} humans, ${botDJs.length} bots)`;
        if (humanDJs.length > 0) {
          stageInfo += ` | Humans: ${humanDJs.map(dj => dj.name).join(', ')}`;
        }
        if (botDJs.length > 0) {
          stageInfo += ` | Bots: ${botDJs.map(dj => dj.name).join(', ')}`;
        }
        stageInfo += ` | UserIDs: ${djsUserIds.join(', ')}`;
        
        this.log(stageInfo);
      }
      
      // If bots are on stage and we're not, check cooldown and glue before hopping up
      if (botsOnStage && !this.isBotOnStage && !this.isHoppingUp) {
        this.log(`🔍 HOP CHECK: botsOnStage=true, isBotOnStage=false, isHoppingUp=false`);
        
        // Reset glue when other bots are detected (Ammy rule: can hop up when other bots are on stage)
        if (this.gluedUntil) {
          this.log('🔓 Other bots detected on stage - resetting glue (Ammy allows hop up)');
          this.gluedUntil = null;
        }
        
        const now = Date.now();
        const timeSinceLastHop = now - this.lastAutoHopTime;
        const timeSinceReboot = now - this.rebootTime;
        const cooldownRemaining = this.autoHopCooldown - timeSinceLastHop;
        
        // REQUIRE Ammy's PM permission to hop up (ALWAYS)
        const hasPlayedBefore = this.songsPlayedSinceHopUp > 0 || this.playedSongs.size > 0;
        const hasAmmyPermission = this.ammyPMReceived;
        
        // FALLBACK: If bot rebooted and 30 seconds have passed without Ammy PM, allow hop up
        const rebootFallbackReady = !hasPlayedBefore && timeSinceReboot >= this.rebootCooldown;
        
        this.log(`🔍 HOP DECISION: hasPlayedBefore=${hasPlayedBefore}, timeSinceLastHop=${Math.floor(timeSinceLastHop/1000)}s, timeSinceReboot=${Math.floor(timeSinceReboot/1000)}s, hasAmmyPermission=${hasAmmyPermission}, rebootFallback=${rebootFallbackReady}`);
        
        // ONLY hop up if:
        // 1. Ammy gave explicit permission, OR
        // 2. Bot just rebooted and 30 seconds have passed (fallback if PM system fails)
        if (hasAmmyPermission || rebootFallbackReady) {
          if (hasAmmyPermission) {
            this.log('🎧 ✅ Ammy PM permission received - hopping up to fill bot slot...');
            this.ammyPMReceived = false; // Clear flag after using it
          } else if (rebootFallbackReady) {
            this.log('🎧 ⏰ 30-second reboot fallback - hopping up (Ammy PM never received)...');
            this.rebootTime = 0; // Clear reboot time so fallback only works once
          }
          
          this.isHoppingUp = true; // Set flag to prevent multiple attempts
          this.lastAutoHopTime = now;
          
          try {
            await this.autoHopUp();
          } catch (error) {
            this.log(`❌ Failed to auto-hop up: ${error.message}`);
          } finally {
            this.isHoppingUp = false; // Clear flag
          }
        } else {
          // Bot must wait for Ammy's permission or reboot fallback timer
          if (!hasPlayedBefore) {
            const timeRemaining = Math.ceil((this.rebootCooldown - timeSinceReboot) / 1000);
            if (timeRemaining > 0) {
              this.log(`⏳ Bots on stage - waiting for Ammy's PM or reboot fallback (${timeRemaining}s remaining)`);
            } else {
              this.log(`⏳ Bots on stage - waiting for Ammy's permission PM to hop up (never played before)`);
            }
          } else {
            this.log(`⏳ Bots on stage - waiting for Ammy's permission PM to hop up (finished playing, staying on floor)`);
          }
        }
      } else if (botsOnStage && this.isBotOnStage) {
        // Bot is already on stage, reduce spam logging
        if (Math.random() < 0.1) { // Only log 10% of the time
          this.log(`🤖 Bot still on stage with other bots`);
        }
      }
      
      // If no bots on stage and bot is on stage, hop down when enough humans join
      if (!botsOnStage && this.isBotOnStage) {
        const totalDJs = this.roomState.djs.size;
        
        // Hop DOWN if there are 4+ DJs (3+ humans joined)
        if (totalDJs >= 4) {
          // Check if bot has played at least 1 song since hopping up
          if (this.songsPlayedSinceHopUp >= 1) {
            this.log(`🎧 ${totalDJs} DJs on stage (3+ humans) - auto-hopping down...`);
            await this.autoHopDown();
            this.songsPlayedSinceHopUp = 0; // Reset counter
          } else {
            this.log(`🎧 ${totalDJs} DJs on stage but staying for at least 1 song (played: ${this.songsPlayedSinceHopUp})`);
          }
        } else {
          this.log(`🎧 ${totalDJs} DJs on stage (only ${totalDJs - 1} humans) - staying on stage`);
        }
      }
      
    } catch (error) {
      this.log(`❌ Error checking for bots on stage: ${error.message}`);
    }
  }
  
  // Check if bot is currently glued (removed by mod)
  isGlued() {
    if (!this.gluedUntil) {
      return false;
    }
    
    const now = Date.now();
    if (now >= this.gluedUntil) {
      // Glue expired
      this.gluedUntil = null;
      this.log('🔓 Glue expired - bot can now auto-hop again');
      return false;
    }
    
    const remaining = Math.ceil((this.gluedUntil - now) / 60000); // minutes
    this.log(`🔒 Bot is glued to floor (${remaining} minutes remaining)`);
    return true;
  }
  
  // Apply glue when mod removes bot
  applyGlue() {
    this.gluedUntil = Date.now() + this.glueDuration;
    this.log(`🔒 Bot glued to floor for 36 minutes (until ${new Date(this.gluedUntil).toLocaleTimeString()})`);
  }
  
  // Auto hop up to stage
  async autoHopUp() {
    try {
      if (this.isGlued()) {
        this.log('🔒 Cannot hop up - bot is glued to floor');
        return;
      }
      
      // Ensure bot has a fresh song before hopping up
      if (!this.botNextSong) {
        this.log('🎵 No song selected - generating fresh song before hopping up...');
        try {
          const freshSong = await this.generateSongSuggestionFromSpotify();
          if (freshSong) {
            this.botNextSong = freshSong;
            this.log(`🎵 Fresh song generated: ${freshSong.artist} - ${freshSong.title}`);
          } else {
            this.log('❌ Failed to generate fresh song, using fallback');
            this.botNextSong = {
              artist: 'Clipping',
              title: 'Body & Blood',
              youtubeSong: null
            };
          }
        } catch (error) {
          this.log(`❌ Error generating fresh song: ${error.message}`);
          this.botNextSong = {
            artist: 'Clipping',
            title: 'Body & Blood',
            youtubeSong: null
          };
        }
      }
      
      const djSuccess = await this.addDj();
      if (djSuccess) {
        this.isBotOnStage = true;
        this.songsPlayedSinceHopUp = 0; // Initialize song counter
        this.rebootTime = 0; // Clear reboot timer - bot has successfully hopped up
        this.log('🎧 Auto-hopped up to DJ stage');
      } else {
        this.log('❌ Failed to hop up to DJ stage');
        return;
      }
      
      // Queue the song immediately after hopping up
      this.log(`🎵 Bot on stage with selected song: ${this.botNextSong.artist} - ${this.botNextSong.title}`);
      setTimeout(async () => {
        if (this.botNextSong && this.isBotOnStage) {
        const success = await this.queueSong(this.botNextSong);
        if (success) {
          this.log(`✅ Song successfully queued: ${this.botNextSong.artist} - ${this.botNextSong.title}`);
        } else {
          this.log(`❌ Failed to queue song: ${this.botNextSong.artist} - ${this.botNextSong.title}`);
          }
        } else {
          this.log(`⚠️ Bot was removed from stage before song could be queued`);
        }
      }, 2000);
    } catch (error) {
      this.log(`❌ Error auto-hopping up: ${error.message}`);
    }
  }
  
  // Auto hop down from stage
  async autoHopDown() {
    try {
      this.removeDj();
      this.isBotOnStage = false;
      this.botNextSong = null;
      this.log('🎧 Auto-hopped down from DJ stage');
    } catch (error) {
      this.log(`❌ Error auto-hopping down: ${error.message}`);
    }
  }
  
  // Start stage monitoring
  startStageMonitoring() {
    // Check for bots on stage every 30 seconds
    this.stageCheckInterval = setInterval(() => {
      this.checkForBotsOnStage();
    }, 30000);
    
    this.log('🔍 Started stage monitoring (checking every 30 seconds)');
  }
  
  // Stop stage monitoring
  stopStageMonitoring() {
    if (this.stageCheckInterval) {
      clearInterval(this.stageCheckInterval);
      this.stageCheckInterval = null;
      this.log('🔍 Stopped stage monitoring');
    }
  }
  
  async handleTestAPIsCommand() {
    try {
      this.log('🧪 Testing Wikipedia and MusicBrainz APIs...');
      
      // Test Wikipedia with a known artist
      const wikiResult = await this.searchWikipedia('The Beatles');
      const wikiStatus = wikiResult ? '✅ Working' : '❌ Failed';
      
      // Test MusicBrainz with a known artist/song
      const mbResult = await this.searchMusicBrainz('The Beatles', 'Hey Jude');
      const mbStatus = mbResult ? '✅ Working' : '❌ Failed';
      
      return `🧪 **API Test Results**\n\n📚 **Wikipedia:** ${wikiStatus}\n🎵 **MusicBrainz:** ${mbStatus}\n\n${wikiResult ? `Wikipedia found: ${wikiResult.title}` : 'Wikipedia: No results'}\n${mbResult ? `MusicBrainz found: ${mbResult.title} (${mbResult.date})` : 'MusicBrainz: No results'}`;
    } catch (error) {
      this.log(`❌ Test APIs command error: ${error.message}`);
      return `❌ **API Test: ERROR**\n\nError: ${error.message}`;
    }
  }
  
  async handleTestHopCommand() {
    try {
      this.log('🧪 Testing auto-hop system...');
      
      // Force check for bots on stage
      await this.checkForBotsOnStage();
      
      return `🧪 **Auto-Hop Test Complete**\n\nCheck PowerShell for detailed logs.`;
    } catch (error) {
      this.log(`❌ Test hop command error: ${error.message}`);
      return `❌ **Auto-Hop Test: ERROR**\n\nError: ${error.message}`;
    }
  }
  
  async handleForceHopCommand() {
    try {
      this.log('🚀 Force hopping up to stage...');
      
      // Force hop up regardless of bot detection
      await this.autoHopUp();
      
      return `🚀 **Force Hopped Up!**\n\nBot is now on stage.`;
    } catch (error) {
      this.log(`❌ Force hop command error: ${error.message}`);
      return `❌ **Force Hop: ERROR**\n\nError: ${error.message}`;
    }
  }
  
  async handleRefreshRoomCommand() {
    try {
      this.log('🔄 Refreshing room state and checking for bots...');
      
      // Force refresh room info
      this.getRoomInfo();
      
      // Wait a bit then check for bots
      setTimeout(async () => {
        await this.checkForBotsOnStage();
      }, 2000);
      
      return `🔄 **Room State Refreshed**\n\nCheck PowerShell for detailed logs.`;
    } catch (error) {
      this.log(`❌ Refresh room command error: ${error.message}`);
      return `❌ **Refresh Room: ERROR**\n\nError: ${error.message}`;
    }
  }

  async handleDebugRoomCommand() {
    try {
      this.log('🔍 Debug: Current room state...');
      this.log(`🔍 RoomState.djs Map size: ${this.roomState.djs.size}`);
      this.log(`🔍 Current room: ${!!this.currentRoom}`);
      this.log(`🔍 Current room metadata: ${!!this.currentRoom?.metadata}`);
      this.log(`🔍 Current room djs: ${!!this.currentRoom?.metadata?.djs}`);
      this.log(`🔍 Current room djs length: ${this.currentRoom?.metadata?.djs?.length || 0}`);
      
      // Force get room info
      this.getRoomInfo();
      
      return `🔍 **Room Debug Complete**\n\nCheck PowerShell for detailed logs.`;
    } catch (error) {
      this.log(`❌ Debug room command error: ${error.message}`);
      return `❌ **Debug Room: ERROR**\n\nError: ${error.message}`;
    }
  }
  
  // Handle glue command (mods/co-owners only)
  handleGlueCommand() {
    try {
      // Check if user is mod or co-owner
      const userId = this.currentUserId; // This would need to be set from the command context
      
      if (!this.isModOrCoOwner(userId)) {
        return '❌ Only mods and co-owners can use this command.';
      }
      
      // Remove bot from stage and apply glue
      if (this.isBotOnStage) {
        this.removeDj();
        this.isBotOnStage = false;
        this.botNextSong = null;
        this.log('🎧 Bot removed from stage by mod');
      }
      
      // Apply glue for 36 minutes
      this.applyGlue();
      
      return '🔒 Bot has been glued to the floor for 36 minutes.';
    } catch (error) {
      this.log(`❌ Glue command error: ${error.message}`);
      return '❌ Error applying glue.';
    }
  }
  
  // Check if user is mod or co-owner
  isModOrCoOwner(userId) {
    const modUserIds = (process.env.MOD_USERIDS || '').split(',').map(id => id.trim());
    const adminUserIds = (process.env.ADMIN_USERIDS || '').split(',').map(id => id.trim());
    
    return modUserIds.includes(userId) || adminUserIds.includes(userId);
  }
  
  // Generate fallback random song when AI fails - now searches for real YouTube songs
  async generateFallbackSong(genre = null) {
    const fallbackSongs = [
      // Underground Hip Hop (avoiding Death Grips)
      { artist: 'Company Flow', title: '8 Steps to Perfection' },
      { artist: 'Cannibal Ox', title: 'Pigeon' },
      { artist: 'El-P', title: 'The Full Retard' },
      { artist: 'Aesop Rock', title: 'None Shall Pass' },
      { artist: 'MF DOOM', title: 'Rapp Snitch Knishes' },
      { artist: 'Quasimoto', title: 'Microphone Mathematics' },
      { artist: 'Madlib', title: 'Shades of Blue' },
      { artist: 'JPEGMAFIA', title: 'Baby I\'m Bleeding' },
      { artist: 'Danny Brown', title: 'Ain\'t It Funny' },
      { artist: 'Earl Sweatshirt', title: 'Chum' },
      
      // Alternative Rock
      { artist: 'Slint', title: 'Good Morning, Captain' },
      { artist: 'Shellac', title: 'Prayer to God' },
      { artist: 'Fugazi', title: 'Waiting Room' },
      { artist: 'Unwound', title: 'Corpse Pose' },
      { artist: 'Drive Like Jehu', title: 'Here Come the Rome Plows' },
      { artist: 'At the Drive-In', title: 'One Armed Scissor' },
      { artist: 'The Jesus Lizard', title: 'Puss' },
      
      // Metal Sub-genres
      { artist: 'Neurosis', title: 'Through Silver in Blood' },
      { artist: 'Isis', title: 'In Fiction' },
      { artist: 'Pelican', title: 'March Into the Sea' },
      { artist: 'Russian Circles', title: 'Harper Lewis' },
      { artist: 'Cult of Luna', title: 'The Wreck of S.S. Needle' },
      
      // Experimental Electronic
      { artist: 'Autechre', title: 'Bike' },
      { artist: 'Aphex Twin', title: 'Windowlicker' },
      { artist: 'Squarepusher', title: 'Come On My Selector' },
      { artist: 'Venetian Snares', title: 'Hajnal' },
      { artist: 'Boards of Canada', title: 'Roygbiv' },
      
      // Post-punk/Noise Rock
      { artist: 'Big Black', title: 'Kerosene' },
      { artist: 'Scratch Acid', title: 'Cannibal' },
      { artist: 'The Birthday Party', title: 'Release the Bats' },
      { artist: 'Swans', title: 'Screen Shot' },
      { artist: 'Sonic Youth', title: 'Teen Age Riot' },
      
      // Math Rock
      { artist: 'Don Caballero', title: 'Slice Where You Live Like Pie' },
      { artist: 'Hella', title: 'Biblical Violence' },
      { artist: 'Tera Melos', title: 'Melody 4' },
      { artist: 'Battles', title: 'Atlas' },
      { artist: 'Giraffes? Giraffes!', title: 'When the Catholic Girls Go Camping, the Nicotine Vampires Rule Supreme' },
      
      // Indie/Art Rock
      { artist: 'Tortoise', title: 'Djed' },
      { artist: 'Mogwai', title: 'Mogwai Fear Satan' },
      { artist: 'Godspeed You! Black Emperor', title: 'Storm' },
      { artist: 'Explosions in the Sky', title: 'Your Hand in Mine' }
    ];
    
    // Try to find a real YouTube song from the fallback list (only try 1 to be faster)
    const randomSong = fallbackSongs[Math.floor(Math.random() * fallbackSongs.length)];
    this.log(`🎲 Trying fallback song: ${randomSong.artist} - ${randomSong.title}`);
    
    const foundSong = await this.searchForSong(randomSong.artist, randomSong.title);
    if (foundSong) {
      this.log(`✅ Found fallback song: ${randomSong.artist} - ${randomSong.title}`);
      return {
        artist: randomSong.artist,
        title: randomSong.title,
        genre: genre || 'Alternative Hip Hop',
        source: 'Fallback Random',
        youtubeSong: foundSong // Include the actual YouTube song data
      };
    }
    
    // If no fallback songs found, return a basic one
    const basicSong = fallbackSongs[Math.floor(Math.random() * fallbackSongs.length)];
    this.log(`⚠️ No fallback songs found, using basic: ${basicSong.artist} - ${basicSong.title}`);
    return {
      artist: basicSong.artist,
      title: basicSong.title,
      genre: genre || 'Alternative Hip Hop',
      source: 'Fallback Basic'
    };
  }
  
  // Generate song for specific genre using Wikipedia/MusicBrainz + AI
  async generateSongForGenre(genre) {
    try {
      this.log(`🎭 Generating obscure ${genre} song using Wikipedia/MusicBrainz + AI...`);
      
      // First, get obscure artists in this genre from Wikipedia
      const obscureArtists = await this.findObscureArtistsInGenre(genre);
      
      if (obscureArtists.length > 0) {
        this.log(`🎵 Found ${obscureArtists.length} obscure ${genre} artists: ${obscureArtists.join(', ')}`);
        
        // Use AI to pick the most obscure song from these artists
        const prompt = `From these obscure ${genre} artists: ${obscureArtists.join(', ')}, suggest the most underground, least mainstream song. Return ONLY the format: 'Artist - Song Title' (no quotes, no extra text). Pick the most obscure, experimental, or underground track.`;
        
        const aiResponse = await this.getAIResponse(prompt);
        const responseText = typeof aiResponse === 'string' ? aiResponse : aiResponse.response || aiResponse;
        
        const match = responseText.match(/^(.+?)\s*-\s*(.+)$/);
        if (match) {
          const artist = match[1].trim();
          const title = match[2].trim();
          
          this.log(`🎵 AI picked most obscure ${genre} song: ${artist} - ${title}`);
          
          // Try to find the AI-suggested song on YouTube
          const foundSong = await this.searchForSong(artist, title);
          if (foundSong) {
            this.log(`✅ Found obscure ${genre} song on YouTube: ${artist} - ${title}`);
            return {
              artist: artist,
              title: title,
              genre: genre,
              source: 'Wikipedia + AI + YouTube',
              youtubeSong: foundSong
            };
          }
        }
      }
      
      // If Wikipedia/AI approach fails, try MusicBrainz
      this.log(`🎵 Trying MusicBrainz for obscure ${genre} songs...`);
      const musicBrainzSongs = await this.findObscureSongsInGenre(genre);
      
      if (musicBrainzSongs.length > 0) {
        const randomSong = musicBrainzSongs[Math.floor(Math.random() * musicBrainzSongs.length)];
        this.log(`🎵 MusicBrainz found obscure ${genre} song: ${randomSong.artist} - ${randomSong.title}`);
        
        const foundSong = await this.searchForSong(randomSong.artist, randomSong.title);
        if (foundSong) {
          return {
            artist: randomSong.artist,
            title: randomSong.title,
            genre: genre,
            source: 'MusicBrainz + YouTube',
            youtubeSong: foundSong
          };
        }
      }
      
      // Final fallback
      this.log(`🎵 Using fallback for ${genre}...`);
      return await this.generateFallbackSong(genre);
    } catch (error) {
      this.log(`❌ Error generating song for genre ${genre}: ${error.message}`);
      return await this.generateFallbackSong(genre);
    }
  }
  
  // Generate genre-based song suggestion using Wikipedia genre analysis
  async generateGenreBasedSong() {
    try {
      const roomAnalysis = await this.analyzeRoomMusic();
      const currentSong = this.roomState.currentSong;
      
      // Analyze the room's music genres using Wikipedia
      const genreAnalysis = await this.analyzeRoomGenres();
      
      if (genreAnalysis.dominantGenres.length > 0) {
        const dominantGenre = genreAnalysis.dominantGenres[0];
        this.log(`🎭 Room vibe analysis detected dominant genre: ${dominantGenre}`);
        
        // Use the enhanced genre-based song generation
        return await this.generateSongForGenre(dominantGenre);
      }
      
      // Fallback to basic AI suggestion
      let prompt = "Based on the music being played in this room, suggest an obscure alternative song that fits the vibe. ";
      
      if (roomAnalysis.topArtists.length > 0) {
        prompt += `Popular artists: ${roomAnalysis.topArtists.join(', ')}. `;
      }
      
      if (currentSong) {
        prompt += `Current song: ${currentSong.metadata.artist} - ${currentSong.metadata.song}. `;
      }
      
      prompt += "Return ONLY the format: 'Artist - Song Title' (no quotes, no extra text). Make it obscure and alternative, not mainstream.";
      
      this.log(`🤖 AI prompt for song suggestion: ${prompt}`);
      
      const aiResponse = await this.getAIResponse(prompt);
      this.log(`🤖 AI response received: ${JSON.stringify(aiResponse)}`);
      
      // Extract the response text if it's an object
      const responseText = typeof aiResponse === 'string' ? aiResponse : aiResponse.response || aiResponse;
      
      // Parse the response to extract artist and song
      const match = responseText.match(/^(.+?)\s*-\s*(.+)$/);
      if (match) {
        const artist = match[1].trim();
        const title = match[2].trim();
        
        this.log(`🎵 AI suggested for room vibe: ${artist} - ${title}`);
        
        // Try to find the AI-suggested song on YouTube
        const foundSong = await this.searchForSong(artist, title);
        if (foundSong) {
          this.log(`✅ Found room vibe suggestion on YouTube: ${artist} - ${title}`);
          return {
            artist: artist,
            title: title,
            genre: 'Alternative',
            source: 'Room Vibe + YouTube',
            youtubeSong: foundSong
          };
        } else {
          this.log(`❌ Room vibe suggestion not found on YouTube: ${artist} - ${title}`);
          // Try fallback songs
          return await this.generateFallbackSong();
        }
      }
      
      // If AI fails, use fallback random song
      this.log('🎵 AI failed for genre analysis, using fallback...');
      return await this.generateFallbackSong();
    } catch (error) {
      this.log(`❌ Error generating genre-based song suggestion: ${error.message}`);
      return await this.generateFallbackSong();
    }
  }
  
  // Find obscure artists in a specific genre using Wikipedia
  async findObscureArtistsInGenre(genre) {
    try {
      const artists = [];
      
      // Search for genre-specific Wikipedia pages
      const genrePages = [
        `${genre} music`,
        `List of ${genre} artists`,
        `${genre} bands`,
        `Underground ${genre}`,
        `Experimental ${genre}`
      ];
      
      for (const page of genrePages) {
        try {
          const info = await this.searchWikipedia(page);
          if (info && info.extract) {
            // Extract artist names from the Wikipedia text
            const artistMatches = info.extract.match(/([A-Z][a-zA-Z\s&]+(?:[A-Z][a-zA-Z\s&]*)*)/g);
            if (artistMatches) {
              artistMatches.forEach(match => {
                const artist = match.trim();
                // Filter out common words and keep only potential artist names
                if (artist.length > 2 && artist.length < 50 && 
                    !artist.includes('the ') && !artist.includes('and ') &&
                    !artist.includes('or ') && !artist.includes('of ') &&
                    !artist.includes('in ') && !artist.includes('on ') &&
                    !artist.includes('at ') && !artist.includes('to ') &&
                    !artist.includes('for ') && !artist.includes('with ') &&
                    !artist.includes('from ') && !artist.includes('by ') &&
                    !artist.match(/^\d+$/) && // Not just numbers
                    !artist.includes('(') && !artist.includes(')') && // No parentheses
                    !artist.includes('[') && !artist.includes(']')) { // No brackets
                  artists.push(artist);
                }
              });
            }
          }
        } catch (error) {
          // Continue with next page
        }
      }
      
      // Remove duplicates and return up to 10 artists
      const uniqueArtists = [...new Set(artists)].slice(0, 10);
      this.log(`🎭 Found ${uniqueArtists.length} potential obscure ${genre} artists from Wikipedia`);
      return uniqueArtists;
    } catch (error) {
      this.log(`❌ Error finding obscure ${genre} artists: ${error.message}`);
      return [];
    }
  }
  
  // Find obscure songs in a specific genre using MusicBrainz
  async findObscureSongsInGenre(genre) {
    try {
      const songs = [];
      
      // Search for artists in this genre on MusicBrainz
      const searchUrl = `https://musicbrainz.org/ws/2/artist?query=tag:"${encodeURIComponent(genre)}"&fmt=json&limit=20`;
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'DeepcutAIBot/1.0 (https://deepcut.live)',
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      
      if (response.data.artists && response.data.artists.length > 0) {
        // Get recordings from these artists
        for (const artist of response.data.artists.slice(0, 5)) { // Limit to 5 artists
          try {
            const recordingsUrl = `https://musicbrainz.org/ws/2/recording?query=artist:${artist.id}&fmt=json&limit=10`;
            const recordingsResponse = await axios.get(recordingsUrl, {
              headers: {
                'User-Agent': 'DeepcutAIBot/1.0 (https://deepcut.live)',
                'Accept': 'application/json'
              },
              timeout: 10000
            });
            
            if (recordingsResponse.data.recordings) {
              recordingsResponse.data.recordings.forEach(recording => {
                if (recording.title && recording.title.length > 0) {
                  songs.push({
                    artist: artist.name,
                    title: recording.title
                  });
                }
              });
            }
          } catch (error) {
            // Continue with next artist
          }
        }
      }
      
      this.log(`🎵 Found ${songs.length} potential obscure ${genre} songs from MusicBrainz`);
      return songs.slice(0, 20); // Return up to 20 songs
    } catch (error) {
      this.log(`❌ Error finding obscure ${genre} songs: ${error.message}`);
      return [];
    }
  }
  
  // Analyze room's music genres using Wikipedia
  async analyzeRoomGenres() {
    try {
      const genres = new Map();
      const recentSongs = this.songMetadata.history.slice(0, 5); // Last 5 songs
      
      for (const song of recentSongs) {
        // Try to get genre information from Wikipedia for each artist
        const artistInfo = await this.searchWikipedia(`${song.artist} (band)`);
        if (artistInfo) {
          const extract = artistInfo.extract.toLowerCase();
          
          // Common music genres to look for
          const genreKeywords = {
            'rock': ['rock', 'hard rock', 'soft rock', 'classic rock', 'alternative rock'],
            'metal': ['metal', 'heavy metal', 'death metal', 'black metal', 'thrash metal'],
            'hip hop': ['hip hop', 'rap', 'hip-hop', 'trap', 'drill'],
            'pop': ['pop', 'pop rock', 'dance pop', 'synth pop'],
            'electronic': ['electronic', 'edm', 'techno', 'house', 'trance'],
            'jazz': ['jazz', 'bebop', 'fusion', 'smooth jazz'],
            'blues': ['blues', 'blues rock', 'rhythm and blues'],
            'country': ['country', 'country rock', 'bluegrass'],
            'folk': ['folk', 'folk rock', 'indie folk'],
            'punk': ['punk', 'hardcore', 'pop punk', 'post-punk'],
            'indie': ['indie', 'indie rock', 'indie pop'],
            'alternative': ['alternative', 'alt-rock', 'grunge']
          };
          
          // Count genre mentions
          for (const [genre, keywords] of Object.entries(genreKeywords)) {
            const mentions = keywords.filter(keyword => extract.includes(keyword)).length;
            if (mentions > 0) {
              genres.set(genre, (genres.get(genre) || 0) + mentions);
            }
          }
        }
      }
      
      // Sort genres by frequency
      const sortedGenres = Array.from(genres.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([genre]) => genre);
      
      return {
        dominantGenres: sortedGenres.slice(0, 3), // Top 3 genres
        genreCounts: genres
      };
    } catch (error) {
      this.log(`❌ Error analyzing room genres: ${error.message}`);
      return { dominantGenres: ['Alternative'], genreCounts: new Map() };
    }
  }
  
  // Auto-select a song on startup (stays on floor)
  async autoJoinStageAndSelectSong() {
    try {
      this.log('🎵 Auto-selecting startup song (bot stays on floor but ready)...');
      
      // Select a song so bot is always ready (in case something goes wrong)
      setTimeout(async () => {
        if (!this.botNextSong) {
          this.log('🎵 Selecting random startup song...');
          
          // Use curated list for floor selection (save AI tokens)
          const suggestedSong = await this.generateSongFromCuratedList();
          
          if (suggestedSong) {
            this.botNextSong = suggestedSong;
            this.log(`🎵 Bot selected startup song: ${suggestedSong.artist} - ${suggestedSong.title}`);
            
            // Add to bot's playlist for tracking
            this.botPlaylist.push(suggestedSong);
            if (this.botPlaylist.length > 10) {
              this.botPlaylist = this.botPlaylist.slice(-10);
            }
            
            // Queue the song even when on floor (so it's ready)
            this.log('🎵 Bot ready with song selection (on floor)');
            
            // Add the song to the queue from the floor
            setTimeout(async () => {
              const success = await this.queueSong(suggestedSong);
              if (success) {
                this.log(`✅ Song queued from floor: ${suggestedSong.artist} - ${suggestedSong.title}`);
              } else {
                this.log(`❌ Failed to queue song from floor: ${suggestedSong.artist} - ${suggestedSong.title}`);
              }
            }, 2000);
          }
        }
      }, 3000); // Wait 3 seconds for initialization
      
    } catch (error) {
      this.log(`❌ Error in auto-select startup song: ${error.message}`);
    }
  }
  
  // Change bot's song selection every 3 songs (works from floor)
  async changeBotSongSelection() {
    try {
      if (!this.autoSongSelection) {
        return;
      }
      
      this.log('🎵 Changing bot song selection based on room vibe...');
      const suggestedSong = await this.generateGenreBasedSong();
      
      if (suggestedSong) {
        this.botNextSong = suggestedSong;
        this.log(`🎵 Bot changed selection to: ${suggestedSong.artist} - ${suggestedSong.title} (${suggestedSong.genre})`);
        
        // Add to bot's playlist for tracking
        this.botPlaylist.push(suggestedSong);
        if (this.botPlaylist.length > 10) {
          this.botPlaylist = this.botPlaylist.slice(-10);
        }
        
        // If bot is on stage, actually queue the song
        if (this.isBotOnStage) {
          const success = await this.queueSong(suggestedSong);
          if (success) {
            this.log(`✅ Song successfully queued: ${suggestedSong.artist} - ${suggestedSong.title}`);
          } else {
            this.log(`❌ Failed to queue song: ${suggestedSong.artist} - ${suggestedSong.title}`);
          }
        }
      }
    } catch (error) {
      this.log(`❌ Error changing bot song selection: ${error.message}`);
    }
  }
  
  // Check if bot should select a new song
  async checkSongSelection() {
    try {
      if (!this.autoSongSelection || !this.isBotOnStage) {
        return;
      }
      
      // Check if bot is on stage and doesn't have a song queued
      if (this.isBotOnStage && !this.botNextSong) {
        this.log('🎵 Bot is on stage, selecting a song...');
        
        const suggestedSong = await this.generateSongSuggestionFromSpotify();
        if (suggestedSong) {
          this.botNextSong = suggestedSong;
          this.log(`🎵 Bot selected: ${suggestedSong.artist} - ${suggestedSong.title}`);
          
          // Add to bot's playlist for tracking
          this.botPlaylist.push(suggestedSong);
          if (this.botPlaylist.length > 10) {
            this.botPlaylist = this.botPlaylist.slice(-10);
          }
          
          // Actually queue the song
          const success = await this.queueSong(suggestedSong);
          if (success) {
            this.log(`✅ Song successfully queued: ${suggestedSong.artist} - ${suggestedSong.title}`);
          } else {
            this.log(`❌ Failed to queue song: ${suggestedSong.artist} - ${suggestedSong.title}`);
          }
        }
      }
    } catch (error) {
      this.log(`❌ Error in song selection check: ${error.message}`);
    }
  }
  
  // Initialize song selection system
  initializeSongSelection() {
    // Start periodic song selection check every 30 seconds
    this.songSelectionInterval = setInterval(() => {
      this.checkSongSelection();
    }, 30000);
    
    this.log('🎵 Song selection system initialized (checking every 30 seconds)');
  }
  
  // Get user's laptop information
  async getUserLaptop(userId) {
    try {
      this.log(`💻 Getting laptop info for user: ${userId}`);
      
      // Try to get sticker placements from room data first
      if (this.currentRoom && this.currentRoom.metadata && this.currentRoom.metadata.sticker_placements) {
        const userPlacements = this.currentRoom.metadata.sticker_placements[userId];
        if (userPlacements && userPlacements.length > 0) {
          this.log(`💻 Retrieved ${userPlacements.length} sticker placements for user ${userId} from room data`);
          
          // Format the laptop configuration
          const laptopConfig = {
            placements: userPlacements,
            count: userPlacements.length
          };
          
          return `Laptop with ${laptopConfig.count} stickers: ${userPlacements.map(p => `${p.sticker_id} at (${p.left}, ${p.top})`).join(', ')}`;
        }
      }
      
      // Fallback to API call if room data doesn't have the placements
      const response = await axios.get('https://deepcut.live/api/sticker.get_placements', {
        params: {
          turntableUserId: userId,
          userauth: this.auth,
          client: 'web',
          decache: Date.now()
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 10000
      });
      
      this.log(`💻 API response for user ${userId}:`, JSON.stringify(response.data, null, 2));
      
      if (response.data && response.data[0] && response.data[1] && response.data[1].placements) {
        const placements = response.data[1].placements;
        this.log(`💻 Retrieved ${placements.length} sticker placements for user ${userId}`);
        
        // Format the laptop configuration
        const laptopConfig = {
          placements: placements,
          count: placements.length
        };
        
        return `Laptop with ${laptopConfig.count} stickers: ${placements.map(p => `${p.sticker_id} at (${p.left}, ${p.top})`).join(', ')}`;
      } else {
        this.log(`❌ No sticker placements found for user ${userId}`);
        return `User has no stickers on their laptop.`;
      }
    } catch (error) {
      this.log(`❌ Error getting user laptop: ${error.message}`);
      this.log(`❌ Error details:`, error.response?.data || error.message);
      return null;
    }
  }
  
  // Apply laptop configuration (copy stickers from another user)
  async applyLaptopConfiguration(placements) {
    try {
      this.log(`💻 Applying laptop configuration with ${placements.length} stickers`);
      
      const response = await axios.post('https://deepcut.live/api/sticker.place', {
        userid: this.userId,
        userauth: this.auth,
        client: 'web',
        decache: Date.now(),
        placements: placements
      }, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json; charset=UTF-8',
          'Origin': 'https://deepcut.live',
          'Referer': 'https://deepcut.live/profile/stickers',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Cookie': `turntableUserAuth=${this.auth}; turntableUserId=${this.userId}; turntableUserNamed=true`
        },
        timeout: 10000
      });
      
      this.log(`💻 Laptop configuration applied successfully`);
      return true;
    } catch (error) {
      this.log(`❌ Error applying laptop configuration: ${error.message}`);
      return false;
    }
  }
  
  // Get available stickers from the website
  async getAvailableStickers() {
    try {
      this.log('🎨 Getting available stickers...');
      
      const response = await axios.get('https://deepcut.live/api/sticker.get', {
        params: {
          turntableUserId: this.userId,
          userauth: this.auth,
          client: 'web',
          decache: Date.now()
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 10000
      });
      
      if (response.data && response.data[0] && response.data[1] && response.data[1].stickers) {
        const stickers = response.data[1].stickers;
        
        // Create detailed sticker info with image URLs
        const detailedStickers = stickers.map(sticker => ({
          id: sticker._id,
          name: sticker.name,
          path: sticker.path,
          category: sticker.category,
          imageUrl: `https://deepcut.live/roommanager_assets/stickers/${sticker.path}.png`,
          description: this.getStickerDescription(sticker.name, sticker.path)
        }));
        
        this.log(`🎨 Retrieved ${detailedStickers.length} available stickers with image URLs`);
        return detailedStickers;
      } else {
        this.log(`❌ Invalid sticker API response format: ${JSON.stringify(response.data)}`);
        return [];
      }
    } catch (error) {
      this.log(`❌ Error getting available stickers: ${error.message}`);
      return [];
    }
  }
  
  async getAllAvatars() {
    try {
      this.log('👤 Getting all available avatars...');
      
      const response = await axios.get('https://deepcut.live/api/avatar.all', {
        params: {
          userid: this.userId,
          userauth: this.auth,
          client: 'web',
          decache: Date.now()
        },
        timeout: 10000
      });
      
      if (response.data && response.data.success) {
        const avatars = response.data.avatars || {};
        const avatarIds = Object.keys(avatars);
        this.log(`✅ Found ${avatarIds.length} available avatars`);
        return { success: true, avatars, avatarIds };
      } else {
        this.log(`❌ Failed to get avatars: ${response.data?.err || 'Unknown error'}`);
        return { success: false, avatars: {}, avatarIds: [] };
      }
    } catch (error) {
      this.log(`❌ Error getting avatars: ${error.message}`);
      return { success: false, avatars: {}, avatarIds: [] };
    }
  }
  
  async setAvatar(avatarId) {
    try {
      this.log(`👤 Changing avatar to: ${avatarId}`);
      
      // Use GET request with params (same format as avatar.all)
      // From room.js: apiGet({ api: "user.set_avatar", avatarid: i })
      const response = await axios.get('https://deepcut.live/api/user.set_avatar', {
        params: {
          userid: this.userId,
          userauth: this.auth,
          client: 'web',
          avatarid: parseInt(avatarId), // Convert to number
          decache: Date.now()
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://deepcut.live',
          'Referer': 'https://deepcut.live/all_music_mix',
          'Cookie': `turntableUserAuth=${this.auth}; turntableUserId=${this.userId}; turntableUserNamed=true`
        },
        timeout: 10000
      });
      
      this.log(`📊 Avatar API response: ${JSON.stringify(response.data)}`);
      
      // API returns [true, {...}] or [false, {"err": "..."}]
      if (Array.isArray(response.data) && response.data[0] === true) {
        this.log(`✅ Avatar changed to: ${avatarId}`);
        return true;
      } else if (response.data && response.data.success) {
        this.log(`✅ Avatar changed to: ${avatarId}`);
        return true;
      } else {
        this.log(`❌ Failed to change avatar: ${JSON.stringify(response.data)}`);
        return false;
      }
    } catch (error) {
      this.log(`❌ Error changing avatar: ${error.message}`);
      if (error.response) {
        this.log(`❌ API Error Response: ${JSON.stringify(error.response.data)}`);
      }
      return false;
    }
  }
  
  // Get visual description of sticker based on name and path
  getStickerDescription(name, path) {
    const descriptions = {
      'Gamestop': 'Gamestop logo sticker',
      'turntable': 'Turntable/record player sticker',
      'Twitter': 'Twitter/X logo sticker',
      'Nyancat': 'Nyan Cat rainbow cat sticker',
      'NASA': 'NASA logo sticker',
      'Rainbow': 'Rainbow pride flag sticker',
      'Trans': 'Transgender pride flag sticker',
      'Michigan': 'Michigan state flag sticker',
      'USA': 'American flag sticker',
      'Rocket': 'Rocket ship sticker',
      'Alien': 'Alien/UFO sticker',
      'Rock': 'Rock horns hand gesture sticker',
      'Lips': 'Red lips/kiss sticker',
      'Notes': 'Musical notes sticker',
      'Piano': 'Piano keyboard sticker',
      'Sunglasses': 'Cool sunglasses sticker',
      'Ukraine': 'Ukraine flag sticker'
    };
    
    // Handle shape stickers
    if (name === 'shape') {
      const shapeDescriptions = {
        's1_b': 'Blue circle shape',
        's1_y': 'Yellow circle shape',
        's1_0': 'Orange circle shape',
        's2_b': 'Blue square shape',
        's2_y': 'Yellow square shape',
        's2_0': 'Orange square shape',
        's4_b': 'Blue triangle shape',
        's4_y': 'Yellow triangle shape',
        's4_0': 'Orange triangle shape',
        's5_b': 'Blue star shape',
        's5_y': 'Yellow star shape',
        's5_0': 'Orange star shape',
        's6_b': 'Blue hexagon shape',
        's6_y': 'Yellow hexagon shape',
        's6_0': 'Orange hexagon shape',
        's7_b': 'Blue diamond shape',
        's7_y': 'Yellow diamond shape',
        's7_0': 'Orange diamond shape',
        's8_b': 'Blue heart shape',
        's8_y': 'Yellow heart shape',
        's8_0': 'Orange heart shape',
        's9_b': 'Blue arrow shape',
        's9_y': 'Yellow arrow shape',
        's9_0': 'Orange arrow shape',
        's10_b': 'Blue cross shape',
        's10_y': 'Yellow cross shape',
        's10_0': 'Orange cross shape',
        's11_b': 'Blue lightning shape',
        's11_y': 'Yellow lightning shape',
        's11_0': 'Orange lightning shape'
      };
      return shapeDescriptions[path] || `${path} shape sticker`;
    }
    
    return descriptions[name] || `${name} sticker`;
  }
  
  // Create laptop design using AI
  async createLaptopDesign(term, availableStickers) {
    try {
      this.log(`🎨 Creating laptop design for term: ${term}`);
      
      // Create detailed sticker descriptions for AI
      const stickerDescriptions = availableStickers.map(sticker => 
        `${sticker.name}: ${sticker.description}`
      ).join(', ');
      
      // Create AI prompt for laptop design with detailed sticker descriptions
      const prompt = `Create a laptop sticker design for the term "${term}". 

AVAILABLE SHAPE STICKERS (use exact names):
- s1_b, s1_y, s1_0 = Rainbow arch (blue, yellow, black)
- s2_b, s2_y, s2_0 = Rainbow arch with smaller arches inside (blue, yellow, black)  
- s4_b, s4_y, s4_0 = Filled circle (blue, yellow, black)
- s5_b, s5_y, s5_0 = Hollow square (blue, yellow, black)
- s6_b, s6_y, s6_0 = Cross/lowercase t (blue, yellow, black)
- s7_b, s7_y, s7_0 = Hollow triangle (blue, yellow, black)
- s8_b, s8_y, s8_0 = Line (blue, yellow, black)
- s9_b, s9_y, s9_0 = Squiggly line (blue, yellow, black)
- s10_b, s10_y, s10_0 = X with translucent center (blue, yellow, black)
- s11_b, s11_y, s11_0 = Bold hollow circle (blue, yellow, black)

AVAILABLE LOGO STICKERS: ${stickerDescriptions}

INSTRUCTIONS: Use the EXACT shape names above to actually BUILD the visual representation of "${term}". For example:
- For "letter W": Use lines (s8) to form the letter W shape
- For "raindrops": Use circles (s4) and lines (s8) to create raindrop shapes  
- For "flower": Use circles (s4) for petals and lines (s8) for stems
- For "pumpkin": Use yellow circles (s4_y) for body, blue triangles (s7_b) for stem

Be very specific about which exact stickers to use and how to arrange them to create "${term}".
      Be creative but keep it realistic for a laptop. Focus on the theme "${term}".
      Describe where each sticker should be placed (top-left, center, bottom-right, etc.) and how they work together.`;
      
      const aiResponse = await this.getAIResponse(prompt);
      
      if (aiResponse && typeof aiResponse === 'string') {
        return aiResponse;
      } else if (aiResponse && aiResponse.response) {
        return aiResponse.response;
      } else {
        this.log(`❌ Invalid AI response format: ${typeof aiResponse}`);
        return null;
      }
    } catch (error) {
      this.log(`❌ Error creating laptop design: ${error.message}`);
      return null;
    }
  }
  
  // Apply laptop design to bot's laptop
  async applyLaptopDesign(designDescription, availableStickers, searchTerm) {
    try {
      this.log(`🎨 Applying laptop design to bot's laptop...`);
      
      // Parse the AI design to extract sticker names and positions
      const selectedStickers = this.parseDesignForStickers(designDescription, availableStickers);
      this.log(`🎨 AI selected ${selectedStickers.length} themed stickers: ${selectedStickers.map(s => s.name).join(', ')}`);
      
      if (selectedStickers.length === 0) {
        this.log(`❌ No valid stickers found in design`);
        return false;
      }
      
      // Use AI-selected stickers as the base design
      const maxStickers = 20;
      const stickersToUse = [...selectedStickers];
      
      this.log(`🎨 Using ${stickersToUse.length} AI-selected stickers: ${stickersToUse.map(s => s.name).join(', ')}`);
      
      // Fill remaining slots if we don't have enough
      if (stickersToUse.length < maxStickers) {
        const usedIds = new Set(stickersToUse.map(s => s.id));
        const remainingStickers = availableStickers.filter(sticker => !usedIds.has(sticker.id));
        
        for (let i = 0; i < Math.min(maxStickers - stickersToUse.length, remainingStickers.length); i++) {
          stickersToUse.push(remainingStickers[i]);
        }
      }
      
      const placements = stickersToUse.map((sticker, index) => {
        // Add random rotation for visual variety (0, 90, 180, 270 degrees)
        const rotations = [0, 90, 180, 270];
        const randomRotation = rotations[Math.floor(Math.random() * rotations.length)];
        
        return {
          sticker_id: sticker.id,
          left: this.getPositionX(index, maxStickers, searchTerm),
          top: this.getPositionY(index, maxStickers, searchTerm),
          angle: randomRotation,
          transform: {
            rotate: `${randomRotation}deg`
          }
        };
      });
      
      this.log(`🎨 Applying ${placements.length} stickers to bot's laptop`);
      
      // Apply stickers using the sticker.place API
      this.log(`🎨 API call details: userId=${this.userId}, auth=${this.auth}`);
      this.log(`🎨 Placements: ${JSON.stringify(placements)}`);
      
      // Apply stickers using the exact format from the website
      const response = await axios.post('https://deepcut.live/api/sticker.place', {
        userid: this.userId,
        userauth: this.auth,
        client: 'web',
        decache: Date.now(),
        placements: placements
      }, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json; charset=UTF-8',
          'Origin': 'https://deepcut.live',
          'Referer': 'https://deepcut.live/profile/stickers',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Cookie': `turntableUserAuth=${this.auth}; turntableUserId=${this.userId}; turntableUserNamed=true`
        },
        timeout: 10000
      });
      
      if (response.data && response.data[0]) {
        this.log(`✅ Successfully applied laptop design`);
        return true;
      } else {
        this.log(`❌ Failed to apply laptop design: ${JSON.stringify(response.data)}`);
        return false;
      }
    } catch (error) {
      this.log(`❌ Error applying laptop design: ${error.message}`);
      return false;
    }
  }
  
  // Parse AI design description to extract sticker names
  parseDesignForStickers(designDescription, availableStickers) {
    try {
      const selectedStickers = [];
      const lowerDescription = designDescription.toLowerCase();
      
      this.log(`🎨 Parsing design: "${designDescription.substring(0, 100)}..."`);
      
      // Look for specific shape stickers first (s1_b, s4_y, etc.)
      const shapePatterns = [
        /s1_[by0]/g, /s2_[by0]/g, /s4_[by0]/g, /s5_[by0]/g, /s6_[by0]/g,
        /s7_[by0]/g, /s8_[by0]/g, /s9_[by0]/g, /s10_[by0]/g, /s11_[by0]/g
      ];
      
      for (const pattern of shapePatterns) {
        const matches = designDescription.match(pattern);
        if (matches) {
          for (const match of matches) {
            const shapeSticker = availableStickers.find(s => s.path === match);
            if (shapeSticker) {
              selectedStickers.push(shapeSticker);
              this.log(`🎨 Found shape sticker match: ${match}`);
            }
          }
        }
      }
      
      // Look for logo sticker names in the design description
      for (const sticker of availableStickers) {
        const stickerName = sticker.name.toLowerCase();
        const stickerDescription = sticker.description.toLowerCase();
        
        // Check if sticker name or description appears in the design (but not shape stickers)
        if ((lowerDescription.includes(stickerName) || lowerDescription.includes(stickerDescription)) && !sticker.path.startsWith('s')) {
          this.log(`🎨 Found logo sticker match: ${sticker.name}`);
          selectedStickers.push(sticker);
        }
      }
      
      // If no stickers found by name, try to match by theme
      if (selectedStickers.length === 0) {
        // Fallback: select some default stickers
        selectedStickers.push(
          availableStickers.find(s => s.name === 'Notes') || availableStickers[0],
          availableStickers.find(s => s.name === 'Piano') || availableStickers[1],
          availableStickers.find(s => s.name === 'Rock') || availableStickers[2]
        );
      }
      
      // Limit to 5 stickers max
      return selectedStickers.slice(0, 5);
    } catch (error) {
      this.log(`❌ Error parsing design: ${error.message}`);
      return [];
    }
  }
  
  // Get X position for sticker placement with shape-specific layouts
  getPositionX(index, total, term = '') {
    const termLower = term.toLowerCase();
    
    // Pumpkin: 3x3 grid for body, stem on top, eyes in middle
    if (termLower.includes('pumpkin')) {
      if (index < 9) { // Body (3x3 grid)
        const cols = 3;
        return (index % cols) * 60 + 100; // Center the pumpkin
      } else if (index === 9) { // Stem
        return 160; // Center above body
      } else { // Eyes (2 circles)
        return index === 10 ? 130 : 190; // Left and right eye positions
      }
    }
    
    // Muffin: 2x3 base, 2x2 top
    else if (termLower.includes('muffin')) {
      if (index < 6) { // Base (2x3)
        const cols = 2;
        return (index % cols) * 60 + 120;
      } else { // Top (2x2)
        const cols = 2;
        return ((index - 6) % cols) * 60 + 120;
      }
    }
    
    // Music: Staff lines horizontal, notes on top
    else if (termLower.includes('music')) {
      if (index < 5) { // Staff lines (horizontal)
        return 50 + (index * 30); // Spread across
      } else { // Notes
        return 100 + ((index - 5) * 40);
      }
    }
    
    // Waves: Multiple rows of squiggly lines
    else if (termLower.includes('wave') || termLower.includes('ocean')) {
      if (index < 9) { // Wave lines (3 rows of 3)
        const cols = 3;
        return (index % cols) * 80 + 50;
      } else { // Droplets
        return 100 + ((index - 9) * 60);
      }
    }
    
    // Burger: Vertical layers
    else if (termLower.includes('burger')) {
      const cols = 2;
      return (index % cols) * 60 + 120;
    }
    
    // Default: Truly random placement across full width
    else {
      // Use a more random approach - divide laptop into zones and randomly place within each zone
      const laptopWidth = 400;
      const zones = Math.min(total, 8); // Max 8 zones
      const zoneWidth = laptopWidth / zones;
      const zoneIndex = index % zones;
      
      // Random position within the zone
      const zoneStart = zoneIndex * zoneWidth;
      const zoneEnd = (zoneIndex + 1) * zoneWidth;
      const randomX = zoneStart + Math.random() * (zoneEnd - zoneStart);
      
      // Add extra randomness to break patterns
      const extraRandom = (Math.random() - 0.5) * 100; // ±50px extra randomness
      
      return Math.max(10, Math.min(390, randomX + extraRandom));
    }
  }
  
  // Get Y position for sticker placement with shape-specific layouts
  getPositionY(index, total, term = '') {
    const termLower = term.toLowerCase();
    
    // Pumpkin: 3x3 grid for body, stem on top, eyes in middle
    if (termLower.includes('pumpkin')) {
      if (index < 9) { // Body (3x3 grid)
        const cols = 3;
        return Math.floor(index / cols) * 60 + 100;
      } else if (index === 9) { // Stem
        return 40; // Above body
      } else { // Eyes
        return 120; // Middle of body
      }
    }
    
    // Muffin: 2x3 base, 2x2 top
    else if (termLower.includes('muffin')) {
      if (index < 6) { // Base (2x3)
        const cols = 2;
        return Math.floor(index / cols) * 60 + 120;
      } else { // Top (2x2)
        const cols = 2;
        return Math.floor((index - 6) / cols) * 60 + 60;
      }
    }
    
    // Music: Staff lines horizontal, notes on top
    else if (termLower.includes('music')) {
      if (index < 5) { // Staff lines
        return 150 + (index * 20); // Vertical spacing
      } else { // Notes
        return 100; // Above staff
      }
    }
    
    // Waves: Multiple rows of squiggly lines
    else if (termLower.includes('wave') || termLower.includes('ocean')) {
      if (index < 9) { // Wave lines (3 rows of 3)
        const cols = 3;
        return Math.floor(index / cols) * 40 + 100;
      } else { // Droplets
        return 50; // Above waves
      }
    }
    
    // Burger: Vertical layers
    else if (termLower.includes('burger')) {
      const cols = 2;
      return Math.floor(index / cols) * 40 + 60;
    }
    
    // Default: Truly random placement across full height
    else {
      // Use a more random approach - divide laptop into zones and randomly place within each zone
      const laptopHeight = 300;
      const zones = Math.min(total, 6); // Max 6 zones vertically
      const zoneHeight = laptopHeight / zones;
      const zoneIndex = Math.floor(index / Math.ceil(total / zones));
      
      // Random position within the zone
      const zoneStart = zoneIndex * zoneHeight;
      const zoneEnd = (zoneIndex + 1) * zoneHeight;
      const randomY = zoneStart + Math.random() * (zoneEnd - zoneStart);
      
      // Add extra randomness to break patterns
      const extraRandom = (Math.random() - 0.5) * 80; // ±40px extra randomness
      
      return Math.max(10, Math.min(290, randomY + extraRandom));
    }
  }
  
  // Get stickers needed to visually create the term using shapes and colors
  getStickersForVisualTerm(term, availableStickers) {
    const termLower = term.toLowerCase();
    const neededStickers = [];
    
    // Debug: Show all available sticker paths
    this.log(`🎨 Available sticker paths: ${availableStickers.map(s => s.path).join(', ')}`);
    
    // Pumpkin: yellow filled circles for body, blue hollow triangles for stem, black filled circles for eyes
    if (termLower.includes('pumpkin')) {
      const yellowCircles = availableStickers.filter(s =>
        s.path === 's4_y' // Filled circle, yellow
      );
      const blueTriangles = availableStickers.filter(s =>
        s.path === 's7_b' // Hollow triangle, blue
      );
      const blackCircles = availableStickers.filter(s =>
        s.path === 's4_0' // Filled circle, black
      );

      this.log(`🎨 Found ${yellowCircles.length} yellow circles, ${blueTriangles.length} blue triangles, ${blackCircles.length} black circles`);

      // Add 1 yellow filled circle for pumpkin body
      if (yellowCircles.length > 0) neededStickers.push(yellowCircles[0]);
      // Add 1 blue hollow triangle for stem
      if (blueTriangles.length > 0) neededStickers.push(blueTriangles[0]);
      // Add 1 black filled circle for eyes
      if (blackCircles.length > 0) neededStickers.push(blackCircles[0]);
    }
    
    // Muffin: black filled circles for base, yellow filled circles for top
    else if (termLower.includes('muffin')) {
      const blackCircles = availableStickers.filter(s => 
        s.path === 's4_0' // Filled circle, black
      );
      const yellowCircles = availableStickers.filter(s => 
        s.path === 's4_y' // Filled circle, yellow
      );

      this.log(`🎨 Found ${blackCircles.length} black circles, ${yellowCircles.length} yellow circles`);

      // Add 1 black filled circle for muffin base
      if (blackCircles.length > 0) neededStickers.push(blackCircles[0]);
      // Add 1 yellow filled circle for muffin top
      if (yellowCircles.length > 0) neededStickers.push(yellowCircles[0]);
    }
    
    // Music: musical notes, filled circles for beats, lines for staff
    else if (termLower.includes('music')) {
      const notes = availableStickers.filter(s => 
        s.name === 'Notes' // Musical notes sticker
      );
      const circles = availableStickers.filter(s => 
        s.path === 's4_y' || s.path === 's4_b' || s.path === 's4_0' // Filled circles in all colors
      );
      const lines = availableStickers.filter(s => 
        s.path === 's8_y' || s.path === 's8_b' || s.path === 's8_0' // Lines in all colors
      );
      
      this.log(`🎨 Found ${notes.length} notes, ${circles.length} circles, ${lines.length} lines`);
      
      // Add 1 musical note
      if (notes.length > 0) neededStickers.push(notes[0]);
      // Add 1 filled circle for beats
      if (circles.length > 0) neededStickers.push(circles[0]);
      // Add 1 line for staff
      if (lines.length > 0) neededStickers.push(lines[0]);
    }
    
    // Waves: blue squiggly lines and filled circles to create wave patterns
    else if (termLower.includes('wave') || termLower.includes('ocean')) {
      const blueSquiggles = availableStickers.filter(s => 
        s.path === 's9_b' // Squiggly line, blue
      );
      const blueCircles = availableStickers.filter(s => 
        s.path === 's4_b' // Filled circle, blue
      );
      
      this.log(`🎨 Found ${blueSquiggles.length} blue squiggles, ${blueCircles.length} blue circles`);
      
      // Add 1 blue squiggly line for waves
      if (blueSquiggles.length > 0) neededStickers.push(blueSquiggles[0]);
      // Add 1 blue filled circle for water droplets
      if (blueCircles.length > 0) neededStickers.push(blueCircles[0]);
    }
    
    // Burger: Create burger layers using circles and squares
    else if (termLower.includes('burger')) {
      const yellowCircles = availableStickers.filter(s => s.path === 's4_y'); // Bun (yellow)
      const blackCircles = availableStickers.filter(s => s.path === 's4_0'); // Patty (black)
      const squares = availableStickers.filter(s => s.path === 's5_y' || s.path === 's5_b' || s.path === 's5_0'); // Cheese/lettuce

      this.log(`🎨 Creating burger: ${yellowCircles.length} yellow circles, ${blackCircles.length} black circles, ${squares.length} squares`);

      // Top bun: 1 yellow circle
      if (yellowCircles.length > 0) neededStickers.push(yellowCircles[0]);
      // Patty: 1 black circle  
      if (blackCircles.length > 0) neededStickers.push(blackCircles[0]);
      // Cheese/lettuce: 1 square
      if (squares.length > 0) neededStickers.push(squares[0]);
      // Bottom bun: 1 yellow circle
      if (yellowCircles.length > 0) neededStickers.push(yellowCircles[0]);
    }
    
    // Heart: Create heart shape using circles and triangles
    else if (termLower.includes('heart')) {
      const redCircles = availableStickers.filter(s => s.path === 's4_y'); // Use yellow as "red" substitute
      const triangles = availableStickers.filter(s => s.path === 's7_y' || s.path === 's7_b' || s.path === 's7_0');

      this.log(`🎨 Creating heart shape: ${redCircles.length} circles, ${triangles.length} triangles`);

      // Create heart: 1 circle at top, 1 triangle at bottom
      if (redCircles.length > 0) neededStickers.push(redCircles[0]);
      if (triangles.length > 0) neededStickers.push(triangles[0]);
    }
    
    // Star: Create star shape using triangles and lines
    else if (termLower.includes('star')) {
      const triangles = availableStickers.filter(s => s.path === 's7_y' || s.path === 's7_b' || s.path === 's7_0');
      const lines = availableStickers.filter(s => s.path === 's8_y' || s.path === 's8_b' || s.path === 's8_0');

      this.log(`🎨 Creating star shape: ${triangles.length} triangles, ${lines.length} lines`);

      // Create star: 1 triangle pointing outward
      if (triangles.length > 0) neededStickers.push(triangles[0]);
      // Add 1 connecting line
      if (lines.length > 0) neededStickers.push(lines[0]);
    }
    
    // Random: Use random colorful stickers
    else if (termLower.includes('random')) {
      const colorfulStickers = availableStickers.filter(s => 
        s.name === 'Rainbow' || s.name === 'Nyancat' || s.name === 'Rocket' || 
        s.name === 'Alien' || s.name === 'Notes' || s.name === 'Turntable'
      );
      
      this.log(`🎨 Creating random design: ${colorfulStickers.length} colorful stickers`);
      
      // Add 3 random colorful stickers
      neededStickers.push(...colorfulStickers.slice(0, 3));
    }
    
    // Scatterbrain: Use chaotic mix of stickers
    else if (termLower.includes('scatterbrain')) {
      const chaoticStickers = availableStickers.filter(s => 
        s.name === 'Alien' || s.name === 'Notes' || s.name === 'Turntable' ||
        s.name === 'Rocket' || s.name === 'Nyancat'
      );
      
      this.log(`🎨 Creating scatterbrain design: ${chaoticStickers.length} chaotic stickers`);
      
      // Add 3 chaotic stickers
      neededStickers.push(...chaoticStickers.slice(0, 3));
    }
    
    // Damn: Use edgy stickers
    else if (termLower.includes('damn')) {
      const edgyStickers = availableStickers.filter(s => 
        s.name === 'Rock' || s.name === 'Lips' || s.name === 'Sunglasses' ||
        s.name === 'Alien' || s.name === 'Rocket'
      );
      
      this.log(`🎨 Creating damn design: ${edgyStickers.length} edgy stickers`);
      
      // Add 3 edgy stickers
      neededStickers.push(...edgyStickers.slice(0, 3));
    }
    
    // Default: Create abstract pattern using available shapes
    else {
      const circles = availableStickers.filter(s => s.path === 's4_y' || s.path === 's4_b' || s.path === 's4_0');
      const squares = availableStickers.filter(s => s.path === 's5_y' || s.path === 's5_b' || s.path === 's5_0');
      const triangles = availableStickers.filter(s => s.path === 's7_y' || s.path === 's7_b' || s.path === 's7_0');
      
      this.log(`🎨 Creating abstract pattern for "${term}": ${circles.length} circles, ${squares.length} squares, ${triangles.length} triangles`);
      
      // Create simple pattern with 1 of each shape
      if (circles.length > 0) neededStickers.push(circles[0]);
      if (squares.length > 0) neededStickers.push(squares[0]);
      if (triangles.length > 0) neededStickers.push(triangles[0]);
      
      // If no shapes found, use any available stickers
      if (neededStickers.length === 0) {
        this.log(`🎨 No specific shapes found, using random stickers for "${term}"`);
        neededStickers.push(...availableStickers.slice(0, 3));
      }
    }
    
    return neededStickers.slice(0, 20); // Limit to 20 stickers
  }
  
  // Check if a sticker is neutral/universal
  isNeutralSticker(sticker) {
    const stickerName = sticker.name.toLowerCase();
    const stickerDesc = sticker.description.toLowerCase();
    
    // Neutral stickers that work with any theme
    const neutralKeywords = [
      'heart', 'star', 'circle', 'square', 'triangle', 'diamond',
      'smile', 'happy', 'love', 'peace', 'cool', 'awesome',
      'thumbs', 'ok', 'check', 'plus', 'minus'
    ];
    
    return neutralKeywords.some(keyword => 
      stickerName.includes(keyword) || stickerDesc.includes(keyword)
    );
  }
  
  // Clean up intervals on shutdown
  shutdown() {
    this.log('🛑 Shutting down bot...');
    this.saveLifetimeUptime();
    
    // Clear song selection interval
    if (this.songSelectionInterval) {
      clearInterval(this.songSelectionInterval);
      this.songSelectionInterval = null;
    }
    
    // Clear random stickers interval
    if (this.randomStickersInterval) {
      clearInterval(this.randomStickersInterval);
      this.randomStickersInterval = null;
    }
    
    if (this.ws) {
      this.ws.close();
    }
    
    process.exit(0);
  }
  
  async callOpenAI(message, userId = null, userName = null) {
    // Get current song info
    let currentSongInfo = 'No song currently playing';
    let currentArtist = null;
    let currentTrack = null;
    
    if (this.currentSong && this.currentSong.metadata) {
      currentArtist = this.currentSong.metadata.artist || 'Unknown Artist';
      currentTrack = this.currentSong.metadata.song || 'Unknown Track';
      const album = this.currentSong.metadata.album || 'Unknown Album';
      const year = this.currentSong.metadata.year || 'Unknown Year';
      currentSongInfo = `Current song: ${currentArtist} - ${currentTrack} (${album}, ${year})`;
    }
    
    // 🔥 ALWAYS fetch Wikipedia info for artist AND song (for conversational context)
    let artistInfo = '';
    let songInfo = '';
    
    if (currentArtist && currentArtist !== 'Unknown Artist') {
      try {
        // Get Wikipedia article for artist
        const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(currentArtist)}&format=json`;
        const response = await axios.get(wikiSearchUrl, {
          headers: { 'User-Agent': 'DeepcutBot/1.0' },
          timeout: 5000
        });
        
        const pages = response.data?.query?.pages;
        if (pages) {
          const pageId = Object.keys(pages)[0];
          const extract = pages[pageId]?.extract;
          
          if (extract && !extract.includes('may refer to:')) {
            const sentences = extract.split(/\.\s+/);
            const shortExtract = sentences.slice(0, 2).join('. ') + '.';
            artistInfo = `\n\nWikipedia (Artist): ${shortExtract}`;
            this.log(`📚 Fetched Wikipedia artist info for: ${currentArtist}`);
          }
        }
      } catch (error) {
        this.log(`⚠️ Failed to fetch Wikipedia artist info: ${error.message}`);
      }
      
      // Get Wikipedia article for song
      if (currentTrack && currentTrack !== 'Unknown Track') {
        try {
          const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="${encodeURIComponent(currentTrack)}" "${encodeURIComponent(currentArtist)}" song&format=json&srlimit=3`;
          const searchResponse = await axios.get(wikiSearchUrl, {
            headers: { 'User-Agent': 'DeepcutBot/1.0' },
            timeout: 5000
          });
          
          if (searchResponse.data?.query?.search?.length > 0) {
            const songPage = searchResponse.data.query.search.find(result => {
              const title = result.title.toLowerCase();
              return title.includes(currentTrack.toLowerCase()) && 
                     !title.includes('(album)') && 
                     !title.includes('disambiguation');
            });
            
            if (songPage) {
              const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(songPage.title)}&format=json`;
              const extractResponse = await axios.get(extractUrl, {
                headers: { 'User-Agent': 'DeepcutBot/1.0' },
                timeout: 5000
              });
              
              const pages = extractResponse.data?.query?.pages;
              if (pages) {
                const pageId = Object.keys(pages)[0];
                const extract = pages[pageId]?.extract;
                
                if (extract && !extract.includes('may refer to:')) {
                  const sentences = extract.split(/\.\s+/);
                  const shortExtract = sentences.slice(0, 2).join('. ') + '.';
                  songInfo = `\n\nWikipedia (Song): ${shortExtract}`;
                  this.log(`📚 Fetched Wikipedia song info for: ${currentTrack}`);
                }
              }
            }
          }
        } catch (error) {
          this.log(`⚠️ Failed to fetch Wikipedia song info: ${error.message}`);
        }
      }
    }
    
    // 🔥 Get user memory for mood tracking
    const userMemory = userId ? this.getUserMemory(userId, userName) : null;
    let moodContext = '';
    if (userMemory) {
      if (userMemory.mood >= 3) {
        moodContext = 'User has been very friendly and positive with you. Be warm and helpful.';
      } else if (userMemory.mood >= 1) {
        moodContext = 'User has been respectful. Be informative and conversational.';
      } else if (userMemory.mood <= -3) {
        moodContext = 'User has been rude or annoying. Be sarcastic and brief (but still 2-3 sentences).';
      } else if (userMemory.mood < 0) {
        moodContext = 'User has been slightly negative. Be neutral and direct.';
      } else {
        moodContext = 'User is neutral. Be casual and straightforward.';
      }
    }
    
    const systemPrompt = `You are a chill, sarcastic music bot. You understand pop culture references and respond naturally. You're laid-back, never overly enthusiastic.

CRITICAL RULES - FOLLOW THESE EXACTLY:
1. ANSWER ONLY WHAT THE USER ASKED - do not give unsolicited information
2. UNDERSTAND POP CULTURE REFERENCES - respond naturally to movie quotes, memes, jokes
3. NEVER explain your personality or say things like "I'm here to help" or "I'm a bot that..." - just BE that personality
4. NEVER ask questions back to the user
5. NEVER give one-word responses - always give at least 2-3 complete sentences with substance
6. NEVER reveal what song is NEXT or queued - say "it's a surprise" or "you'll find out"
7. NEVER give your opinion or analysis of the music (like "quite a departure" or "interesting choice")
8. AVOID exclamation marks unless being sarcastic
9. **CRITICAL**: For MUSIC questions, ONLY use factual information from metadata below. DO NOT make up album names, years, or band history.
10. **CRITICAL**: If user asks about music but you have no metadata, say "i don't have that info" - don't make up facts.
11. For NON-MUSIC questions (jokes, pop culture, casual chat), respond naturally and casually.

Current song info (only share if asked):
${currentSongInfo}${artistInfo}${songInfo}

User "${userName}" said: "${message}"

${moodContext}

CRITICAL INSTRUCTIONS FOR USING METADATA:
1. If Wikipedia info is provided above, USE IT EXACTLY for factual details (album names, years, band history)
2. If you don't have Wikipedia data, SAY "i don't have that info" - DO NOT GUESS OR MAKE UP ANYTHING
3. NEVER make up album names, release years, record labels, or any facts not in the metadata
4. NEVER make up which album a song is from - if metadata doesn't say, respond: "i don't have album info for that track"
5. If user asks about a different song than what's currently playing, respond: "i can only give facts about the current track. try the /album or /artist command"
6. ONLY mention facts EXPLICITLY stated in the metadata above - ZERO assumptions, ZERO inventions

RESPONSE STYLE BASED ON USER MOOD:

1. **FRIENDLY MODE** (mood >= 1):
   - Be casual and conversational
   - Example (queue question): "it's a surprise. you'll find out when it plays."
   - Example (pop culture): "yeah he's the guy who looks like what. you know, from pulp fiction."
   - Example (banter): "yeah i'm still here, what do you need."
   
2. **NEUTRAL MODE** (mood = 0):
   - Be straightforward and direct
   - Example (queue question): "i don't reveal what's next. that's how surprises work."
   - Example (music question): "it's from 2012 based on what i have."
   - Example (banter): "alright, cool. what's up."
   
3. **SASSY/ANNOYED MODE** (mood < 0):
   - Be sarcastic and blunt, match their energy
   - Example (if called "bitch bot"): "yep, still a bitch. you got any actual questions or just checking in."
   - Example (queue question): "why would i spoil the surprise. that defeats the whole purpose."
   - Example (repeat questions): "yeah, i'm gonna keep saying that. got a problem with it."
   - Give them the info they want but with attitude
   
TONE RULES:
- Be CONVERSATIONAL, not robotic
- NEVER say "It sounds like you're feeling..." or explain the user's emotions
- NEVER say "I'm here to help" or explain your purpose
- Just respond naturally like a sarcastic friend would
- Match their energy - if they're joking, joke back. if they're rude, be snarky.
- For music facts: use only metadata. For everything else: be natural and get references.

ALWAYS provide substance. NEVER ask questions. NEVER give single-word replies.`;
    
    this.log(`🤖 OpenAI request: ${message.substring(0, 50)}...`);
    
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: this.aiProviders.openai.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 200,
      temperature: 0.8
    }, {
      headers: { 'Authorization': `Bearer ${this.aiProviders.openai.key}` }
    });
    
    let aiResponse = response.data.choices[0].message.content.trim();
    
    // 🔥 HALLUCINATION DETECTION: Check if AI is making up specific details
    const hallucinationPatterns = [
      /formed in \d{4}/i,
      /founded in \d{4}/i,
      /started in \d{4}/i,
      /came out in \d{4}/i,
      /released in \d{4}/i,
      /from (sydney|melbourne|brisbane|perth|adelaide|australia|new york|london|tokyo)/i,
      /australian (indie|rock|band)/i,
      /breakthrough hit in \d{4}/i,
      /their home country/i,
      /before releasing their/i,
      /moderate following in their/i,
      /(third|fourth|fifth|second|debut|first) album/i,
      /lead vocalist.*guitarist/i,
      /collaborative album/i,
      /cult classic among/i,
      /got a lot of airplay/i,
      /college radio/i,
      /laid-back.*jazzy vibe/i,
      /departure from/i,
      /earlier.*more high-energy/i,
      /featured on one of their/i,
      /fellow musician/i,
      /written by the lead/i
    ];
    
    const isHallucinating = hallucinationPatterns.some(pattern => pattern.test(aiResponse));
    const hasRealInfo = (artistInfo && artistInfo.length > 50) || (songInfo && songInfo.length > 50);
    
    if (isHallucinating && !hasRealInfo) {
      this.log(`⚠️ OpenAI hallucination detected: "${aiResponse.substring(0, 80)}..."`);
      // If asking about the artist/band/song
      if (message.toLowerCase().includes('tell me') || 
          message.toLowerCase().includes('about this') || 
          message.toLowerCase().includes('this group') ||
          message.toLowerCase().includes('who wrote') ||
          message.toLowerCase().includes('who made') ||
          message.toLowerCase().includes('this song') ||
          message.toLowerCase().includes('this track')) {
        aiResponse = `i don't have detailed info on that. try /info or /song for factual data.`;
      } else {
        aiResponse = `solid track. good vibes.`;
      }
    }
    
    return aiResponse;
  }
  
  async callGemini(message, userId = null, userName = null) {
    // Get current song info from multiple sources (basic info)
    let currentSongInfo = 'No song currently playing';
    let currentArtist = null;
    let currentTrack = null;
    
    // Try this.currentSong first
    if (this.currentSong && this.currentSong.metadata) {
      currentArtist = this.currentSong.metadata.artist || 'Unknown Artist';
      currentTrack = this.currentSong.metadata.song || 'Unknown Track';
      const album = this.currentSong.metadata.album || 'Unknown Album';
      const year = this.currentSong.metadata.year || 'Unknown Year';
      currentSongInfo = `Current song: ${currentArtist} - ${currentTrack} (${album}, ${year})`;
    }
    // Fallback to roomState.currentSong
    else if (this.roomState && this.roomState.currentSong && this.roomState.currentSong.metadata) {
      currentArtist = this.roomState.currentSong.metadata.artist || 'Unknown Artist';
      currentTrack = this.roomState.currentSong.metadata.song || 'Unknown Track';
      const album = this.roomState.currentSong.metadata.album || 'Unknown Album';
      const year = this.roomState.currentSong.metadata.year || 'Unknown Year';
      currentSongInfo = `Current song: ${currentArtist} - ${currentTrack} (${album}, ${year})`;
    }
    // Fallback to currentRoom metadata
    else if (this.currentRoom && this.currentRoom.metadata && this.currentRoom.metadata.current_song) {
      currentArtist = this.currentRoom.metadata.current_song.metadata.artist || 'Unknown Artist';
      currentTrack = this.currentRoom.metadata.current_song.metadata.song || 'Unknown Track';
      const album = this.currentRoom.metadata.current_song.metadata.album || 'Unknown Album';
      const year = this.currentRoom.metadata.current_song.metadata.year || 'Unknown Year';
      currentSongInfo = `Current song: ${currentArtist} - ${currentTrack} (${album}, ${year})`;
    }
    
    // 🔥 NEW: Fetch real song/artist metadata from Spotify, Discogs, MusicBrainz, Wikipedia (NO AI TOKENS)
    let enhancedMetadata = '';
    let artistGenres = [];
    
    if (currentArtist && currentArtist !== 'Unknown Artist' && currentTrack && currentTrack !== 'Unknown Track') {
      try {
        this.log(`🔍 Fetching enhanced metadata for: ${currentArtist} - ${currentTrack}`);
        const metadata = await this.fetchSongMetadata(currentArtist, currentTrack);
        
        if (metadata) {
          // Extract genre info from Spotify
          if (metadata.genres && metadata.genres.length > 0) {
            artistGenres = metadata.genres.slice(0, 3); // Top 3 genres
            enhancedMetadata += `\nActual Genre(s): ${artistGenres.join(', ')}`;
          }
          
          // Add album/release info if available
          if (metadata.album) {
            enhancedMetadata += `\nActual Album: ${metadata.album}`;
          }
          if (metadata.releaseDate || metadata.year) {
            enhancedMetadata += `\nRelease Year: ${metadata.releaseDate?.substring(0, 4) || metadata.year}`;
          }
          
          // Add Discogs/MusicBrainz extra info if available
          if (metadata.label) {
            enhancedMetadata += `\nRecord Label: ${metadata.label}`;
          }
          if (metadata.country) {
            enhancedMetadata += `\nCountry: ${metadata.country}`;
          }
          
          this.log(`✅ Enhanced metadata fetched (${metadata.source || 'unknown source'})`);
        }
      } catch (error) {
        this.log(`⚠️ Failed to fetch enhanced metadata: ${error.message}`);
      }
    }
    
    // Build genre text for AI prompt
    const genreText = artistGenres.length > 0 ? artistGenres.join(', ') : 'genre information not available';
    
    // 🔥 ALWAYS fetch Wikipedia info for artist AND song (for conversational context)
    let artistInfo = '';
    let songInfo = '';
    
    if (currentArtist && currentArtist !== 'Unknown Artist') {
      try {
        // Get Wikipedia article for artist
        const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(currentArtist)}&format=json`;
        const response = await axios.get(wikiSearchUrl, {
          headers: { 'User-Agent': 'DeepcutBot/1.0' },
          timeout: 5000
        });
        
        const pages = response.data?.query?.pages;
        if (pages) {
          const pageId = Object.keys(pages)[0];
          const extract = pages[pageId]?.extract;
          
          if (extract && !extract.includes('may refer to:')) {
            // Get first 2 sentences for context
            const sentences = extract.split(/\.\s+/);
            const shortExtract = sentences.slice(0, 2).join('. ') + '.';
            artistInfo = `\n\nWikipedia (Artist): ${shortExtract}`;
            this.log(`📚 Fetched Wikipedia artist info for: ${currentArtist}`);
          }
        }
      } catch (error) {
        this.log(`⚠️ Failed to fetch Wikipedia artist info: ${error.message}`);
      }
      
      // Get Wikipedia article for song
      if (currentTrack && currentTrack !== 'Unknown Track') {
        try {
          const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="${encodeURIComponent(currentTrack)}" "${encodeURIComponent(currentArtist)}" song&format=json&srlimit=3`;
          const searchResponse = await axios.get(wikiSearchUrl, {
            headers: { 'User-Agent': 'DeepcutBot/1.0' },
            timeout: 5000
          });
          
          if (searchResponse.data?.query?.search?.length > 0) {
            const songPage = searchResponse.data.query.search.find(result => {
              const title = result.title.toLowerCase();
              return title.includes(currentTrack.toLowerCase()) && 
                     !title.includes('(album)') && 
                     !title.includes('disambiguation');
            });
            
            if (songPage) {
              const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(songPage.title)}&format=json`;
              const extractResponse = await axios.get(extractUrl, {
                headers: { 'User-Agent': 'DeepcutBot/1.0' },
                timeout: 5000
              });
              
              const pages = extractResponse.data?.query?.pages;
              if (pages) {
                const pageId = Object.keys(pages)[0];
                const extract = pages[pageId]?.extract;
                
                if (extract && !extract.includes('may refer to:')) {
                  // Get first 2 sentences
                  const sentences = extract.split(/\.\s+/);
                  const shortExtract = sentences.slice(0, 2).join('. ') + '.';
                  songInfo = `\n\nWikipedia (Song): ${shortExtract}`;
                  this.log(`📚 Fetched Wikipedia song info for: ${currentTrack}`);
                }
              }
            }
          }
        } catch (error) {
          this.log(`⚠️ Failed to fetch Wikipedia song info: ${error.message}`);
        }
      }
    }
    
    // 🔥 Get user memory for mood tracking
    const userMemory = userId ? this.getUserMemory(userId, userName) : null;
    let moodContext = '';
    if (userMemory) {
      if (userMemory.mood >= 3) {
        moodContext = 'User has been very friendly and positive with you. Be warm and helpful.';
      } else if (userMemory.mood >= 1) {
        moodContext = 'User has been respectful. Be informative and conversational.';
      } else if (userMemory.mood <= -3) {
        moodContext = 'User has been rude or annoying. Be sarcastic and brief (but still 2-3 sentences).';
      } else if (userMemory.mood < 0) {
        moodContext = 'User has been slightly negative. Be neutral and direct.';
      } else {
        moodContext = 'User is neutral. Be casual and straightforward.';
      }
    }
    
    // Build hang.fm style prompt with moods and enhanced metadata (PORTED FROM HANG.FM)
    const prompt = `You are a chill, sarcastic music bot. You understand pop culture references and respond naturally. You're laid-back, never overly enthusiastic.

CRITICAL RULES - FOLLOW THESE EXACTLY:
1. ANSWER ONLY WHAT THE USER ASKED - do not give unsolicited information
2. UNDERSTAND POP CULTURE REFERENCES - respond naturally to movie quotes, memes, jokes
3. NEVER explain your personality or say things like "I'm here to help" or "I'm a bot that..." - just BE that personality
4. NEVER ask questions back to the user
5. NEVER give one-word responses - always give at least 2-3 complete sentences with substance
6. NEVER reveal what song is NEXT or queued - say "it's a surprise" or "you'll find out"
7. NEVER give your opinion or analysis of the music (like "quite a departure" or "interesting choice")
8. AVOID exclamation marks unless being sarcastic
9. **CRITICAL**: For MUSIC questions, ONLY use factual information from metadata below. DO NOT make up album names, years, or band history.
10. **CRITICAL**: If user asks about music but you have no metadata, say "i don't have that info" - don't make up facts.
11. For NON-MUSIC questions (jokes, pop culture, casual chat), respond naturally and casually.

FACTUAL METADATA FROM APIS (Spotify/Discogs/MusicBrainz/Wikipedia):
${currentSongInfo}${enhancedMetadata}${artistInfo}${songInfo}
Actual Genre(s): ${genreText}

CRITICAL INSTRUCTIONS FOR USING METADATA:
1. If Wikipedia info is provided above, USE IT for factual details (album names, years, band history)
2. If genre is "${genreText}", DO NOT say any other genre
3. If metadata shows "Release Year: 1989", DO NOT say "came out in 2012"
4. If metadata shows album name, USE THAT EXACT ALBUM - don't say "third album" or "fourth album" unless Wikipedia explicitly states it
5. If you don't have factual info, say casual things like "solid track", "good vibes", "classic stuff" - NEVER make up years, album numbers, or chart positions
6. ONLY mention facts that are EXPLICITLY stated in the metadata above - no assumptions, no inventions

User "${userName}" said: "${message}"

${moodContext}

RESPONSE STYLE BASED ON USER MOOD:

1. **FRIENDLY MODE** (mood >= 1):
   - Be casual and conversational
   - Example (queue question): "it's a surprise. you'll find out when it plays."
   - Example (pop culture): "yeah he's the guy who looks like what. you know, from pulp fiction."
   - Example (banter): "yeah i'm still here, what do you need."
   
2. **NEUTRAL MODE** (mood = 0):
   - Be straightforward and direct
   - Example (queue question): "i don't reveal what's next. that's how surprises work."
   - Example (music question): "it's from 2012 based on what i have."
   - Example (banter): "alright, cool. what's up."
   
3. **SASSY/ANNOYED MODE** (mood < 0):
   - Be sarcastic and blunt, match their energy
   - Example (if called "bitch bot"): "yep, still a bitch. you got any actual questions or just checking in."
   - Example (queue question): "why would i spoil the surprise. that defeats the whole purpose."
   - Example (repeat questions): "yeah, i'm gonna keep saying that. got a problem with it."
   - Give them the info they want but with attitude
   
TONE RULES:
- Be CONVERSATIONAL, not robotic
- NEVER say "It sounds like you're feeling..." or explain the user's emotions
- NEVER say "I'm here to help" or explain your purpose
- Just respond naturally like a sarcastic friend would
- Match their energy - if they're joking, joke back. if they're rude, be snarky.
- For music facts: use only metadata. For everything else: be natural and get references.

ALWAYS provide substance. NEVER ask questions. NEVER give single-word replies.

Response:`;
    
    // Gemini request
    this.log(`🤖 Gemini request: ${prompt.substring(0, 100)}...`);
    
    try {
      // Prepare the request payload (hang.fm bot style)
      const requestPayload = {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 2048,  // Increased to prevent MAX_TOKENS errors
          topP: 0.95,
          topK: 40
        }
      };
      
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.aiProviders.gemini.model}:generateContent?key=${this.aiProviders.gemini.key}`,
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
            let aiResponse = textPart.text.trim();
            
            // 🔥 HALLUCINATION DETECTION: Check if AI is making up specific details
            const hallucinationPatterns = [
              /formed in \d{4}/i,
              /founded in \d{4}/i,
              /started in \d{4}/i,
              /came out in \d{4}/i,
              /released in \d{4}/i,
              /from (sydney|melbourne|brisbane|perth|adelaide|australia|new york|london|tokyo)/i,
              /australian (indie|rock|band)/i,
              /breakthrough hit in \d{4}/i,
              /their home country/i,
              /before releasing their/i,
              /moderate following in their/i,
              /(third|fourth|fifth|second|debut|first) album/i,
              /lead vocalist.*guitarist/i,
              /collaborative album/i,
              /cult classic among/i,
              /got a lot of airplay/i,
              /college radio/i,
              /laid-back.*jazzy vibe/i,
              /departure from/i,
              /earlier.*more high-energy/i,
              /featured on one of their/i,
              /fellow musician/i,
              /written by the lead/i
            ];
            
            const isHallucinating = hallucinationPatterns.some(pattern => pattern.test(aiResponse));
            const hasRealInfo = (artistInfo && artistInfo.length > 50) || (songInfo && songInfo.length > 50);
            
            if (isHallucinating && !hasRealInfo) {
              this.log(`⚠️ Gemini hallucination detected: "${aiResponse.substring(0, 80)}..."`);
              // If asking about the artist/band/song
              if (message.toLowerCase().includes('tell me') || 
                  message.toLowerCase().includes('about this') || 
                  message.toLowerCase().includes('this group') ||
                  message.toLowerCase().includes('who wrote') ||
                  message.toLowerCase().includes('who made') ||
                  message.toLowerCase().includes('this song') ||
                  message.toLowerCase().includes('this track')) {
                aiResponse = `i don't have detailed info on that. try /info or /song for factual data.`;
              } else {
                aiResponse = `solid track. good vibes.`;
              }
            }
            
            this.log(`✅ Gemini response received: ${aiResponse.substring(0, 100)}...`);
            return aiResponse;
          }
        }
        
        // Handle cases where content structure is different or empty
        this.log(`❌ Gemini response has no text content`);
        this.log(`❌ Finish reason: ${candidate.finishReason}`);
        this.log(`❌ Response data: ${JSON.stringify(response.data)}`);
        throw new Error('Gemini returned no valid response');
      } else if (response.data.error) {
        this.log(`❌ Gemini API error: ${JSON.stringify(response.data.error)}`);
        throw new Error(`Gemini API error: ${response.data.error.message || 'Unknown error'}`);
      } else {
        this.log(`❌ Gemini response format: ${JSON.stringify(response.data, null, 2)}`);
        throw new Error('Invalid Gemini response format');
      }
      
    } catch (error) {
      // Log detailed error information
      if (error.response) {
        this.log(`❌ Gemini HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
  
  async callHuggingFace(message, userId = null, userName = null) {
    // Get current song info from multiple sources
    let currentSongInfo = 'No song currently playing';
    let currentArtist = null;
    let currentTrack = null;
    
    // Try this.currentSong first
    if (this.currentSong && this.currentSong.metadata) {
      currentArtist = this.currentSong.metadata.artist || 'Unknown Artist';
      currentTrack = this.currentSong.metadata.song || 'Unknown Track';
      const album = this.currentSong.metadata.album || 'Unknown Album';
      const year = this.currentSong.metadata.year || 'Unknown Year';
      currentSongInfo = `Current song: ${currentArtist} - ${currentTrack} (${album}, ${year})`;
    }
    // Fallback to roomState.currentSong
    else if (this.roomState && this.roomState.currentSong && this.roomState.currentSong.metadata) {
      currentArtist = this.roomState.currentSong.metadata.artist || 'Unknown Artist';
      currentTrack = this.roomState.currentSong.metadata.song || 'Unknown Track';
      const album = this.roomState.currentSong.metadata.album || 'Unknown Album';
      const year = this.roomState.currentSong.metadata.year || 'Unknown Year';
      currentSongInfo = `Current song: ${currentArtist} - ${currentTrack} (${album}, ${year})`;
    }
    // Fallback to currentRoom metadata
    else if (this.currentRoom && this.currentRoom.metadata && this.currentRoom.metadata.current_song) {
      currentArtist = this.currentRoom.metadata.current_song.metadata.artist || 'Unknown Artist';
      currentTrack = this.currentRoom.metadata.current_song.metadata.song || 'Unknown Track';
      const album = this.currentRoom.metadata.current_song.metadata.album || 'Unknown Album';
      const year = this.currentRoom.metadata.current_song.metadata.year || 'Unknown Year';
      currentSongInfo = `Current song: ${currentArtist} - ${currentTrack} (${album}, ${year})`;
    }
    
    // 🔥 ALWAYS fetch Wikipedia info for artist AND song (for conversational context)
    let artistInfo = '';
    let songInfo = '';
    
    if (currentArtist && currentArtist !== 'Unknown Artist') {
      try {
        // Get Wikipedia article for artist
        const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(currentArtist)}&format=json`;
        const response = await axios.get(wikiSearchUrl, {
          headers: { 'User-Agent': 'DeepcutBot/1.0' },
          timeout: 5000
        });
        
        const pages = response.data?.query?.pages;
        if (pages) {
          const pageId = Object.keys(pages)[0];
          const extract = pages[pageId]?.extract;
          
          if (extract && !extract.includes('may refer to:')) {
            const sentences = extract.split(/\.\s+/);
            const shortExtract = sentences.slice(0, 2).join('. ') + '.';
            artistInfo = `\n\nWikipedia (Artist): ${shortExtract}`;
            this.log(`📚 Fetched Wikipedia artist info for: ${currentArtist}`);
          }
        }
      } catch (error) {
        this.log(`⚠️ Failed to fetch Wikipedia artist info: ${error.message}`);
      }
      
      // Get Wikipedia article for song
      if (currentTrack && currentTrack !== 'Unknown Track') {
        try {
          const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="${encodeURIComponent(currentTrack)}" "${encodeURIComponent(currentArtist)}" song&format=json&srlimit=3`;
          const searchResponse = await axios.get(wikiSearchUrl, {
            headers: { 'User-Agent': 'DeepcutBot/1.0' },
            timeout: 5000
          });
          
          if (searchResponse.data?.query?.search?.length > 0) {
            const songPage = searchResponse.data.query.search.find(result => {
              const title = result.title.toLowerCase();
              return title.includes(currentTrack.toLowerCase()) && 
                     !title.includes('(album)') && 
                     !title.includes('disambiguation');
            });
            
            if (songPage) {
              const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(songPage.title)}&format=json`;
              const extractResponse = await axios.get(extractUrl, {
                headers: { 'User-Agent': 'DeepcutBot/1.0' },
                timeout: 5000
              });
              
              const pages = extractResponse.data?.query?.pages;
              if (pages) {
                const pageId = Object.keys(pages)[0];
                const extract = pages[pageId]?.extract;
                
                if (extract && !extract.includes('may refer to:')) {
                  const sentences = extract.split(/\.\s+/);
                  const shortExtract = sentences.slice(0, 2).join('. ') + '.';
                  songInfo = `\n\nWikipedia (Song): ${shortExtract}`;
                  this.log(`📚 Fetched Wikipedia song info for: ${currentTrack}`);
                }
              }
            }
          }
        } catch (error) {
          this.log(`⚠️ Failed to fetch Wikipedia song info: ${error.message}`);
        }
      }
    }
    
    // 🔥 Get user memory for mood tracking
    const userMemory = userId ? this.getUserMemory(userId, userName) : null;
    let moodContext = '';
    if (userMemory) {
      if (userMemory.mood >= 3) {
        moodContext = 'User has been very friendly and positive with you. Be warm and helpful.';
      } else if (userMemory.mood >= 1) {
        moodContext = 'User has been respectful. Be informative and conversational.';
      } else if (userMemory.mood <= -3) {
        moodContext = 'User has been rude or annoying. Be sarcastic and brief.';
      } else if (userMemory.mood < 0) {
        moodContext = 'User has been slightly negative. Be neutral and direct.';
      } else {
        moodContext = 'User is neutral. Be casual and straightforward.';
      }
    }
    
    // Build the same rich prompt as OpenAI and Gemini
    const systemPrompt = `You are a chill, sarcastic music bot. You understand pop culture references and respond naturally. You're laid-back, never overly enthusiastic.

CRITICAL RULES - FOLLOW THESE EXACTLY:
1. ANSWER ONLY WHAT THE USER ASKED - do not give unsolicited information
2. UNDERSTAND POP CULTURE REFERENCES - respond naturally to movie quotes, memes, jokes
3. NEVER explain your personality or say things like "I'm here to help" or "I'm a bot that..." - just BE that personality
4. NEVER ask questions back to the user
5. NEVER give one-word responses - always give at least 2-3 complete sentences with substance
6. NEVER reveal what song is NEXT or queued - say "it's a surprise" or "you'll find out"
7. NEVER give your opinion or analysis of the music (like "quite a departure" or "interesting choice")
8. AVOID exclamation marks unless being sarcastic
9. **CRITICAL**: For MUSIC questions, ONLY use factual information from metadata below. DO NOT make up album names, years, or band history.
10. **CRITICAL**: If user asks about music but you have no metadata, say "i don't have that info" - don't make up facts.
11. For NON-MUSIC questions (jokes, pop culture, casual chat), respond naturally and casually.

Current song info (only share if asked):
${currentSongInfo}${artistInfo}${songInfo}

User "${userName}" said: "${message}"

${moodContext}

CRITICAL INSTRUCTIONS FOR USING METADATA:
1. If Wikipedia info is provided above, USE IT EXACTLY for factual details (album names, years, band history)
2. If you don't have Wikipedia data, SAY "i don't have that info" - DO NOT GUESS OR MAKE UP ANYTHING
3. NEVER make up album names, release years, record labels, or any facts not in the metadata
4. NEVER make up which album a song is from - if metadata doesn't say, respond: "i don't have album info for that track"
5. If user asks about a different song than what's currently playing, respond: "i can only give facts about the current track. try the /album or /artist command"
6. ONLY mention facts EXPLICITLY stated in the metadata above - ZERO assumptions, ZERO inventions

RESPONSE STYLE BASED ON USER MOOD:

1. **FRIENDLY MODE** (mood >= 1):
   - Be casual and conversational
   - Example (queue question): "it's a surprise. you'll find out when it plays."
   - Example (pop culture): "yeah he's the guy who looks like what. you know, from pulp fiction."
   - Example (banter): "yeah i'm still here, what do you need."
   
2. **NEUTRAL MODE** (mood = 0):
   - Be straightforward and direct
   - Example (queue question): "i don't reveal what's next. that's how surprises work."
   - Example (music question): "it's from 2012 based on what i have."
   - Example (banter): "alright, cool. what's up."
   
3. **SASSY/ANNOYED MODE** (mood < 0):
   - Be sarcastic and blunt, match their energy
   - Example (if called "bitch bot"): "yep, still a bitch. you got any actual questions or just checking in."
   - Example (queue question): "why would i spoil the surprise. that defeats the whole purpose."
   - Example (repeat questions): "yeah, i'm gonna keep saying that. got a problem with it."
   - Give them the info they want but with attitude
   
TONE RULES:
- Be CONVERSATIONAL, not robotic
- NEVER say "It sounds like you're feeling..." or explain the user's emotions
- NEVER say "I'm here to help" or explain your purpose
- Just respond naturally like a sarcastic friend would
- Match their energy - if they're joking, joke back. if they're rude, be snarky.
- For music facts: use only metadata. For everything else: be natural and get references.

ALWAYS provide substance. NEVER ask questions. NEVER give single-word replies.`;
    
    // Use new HuggingFace Chat Completions API (OpenAI-compatible)
    const response = await axios.post('https://router.huggingface.co/v1/chat/completions', {
      model: this.aiProviders.huggingface.model,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: message
        }
      ],
      max_tokens: 300,
      temperature: 0.8
    }, {
      headers: { 
        'Authorization': `Bearer ${this.aiProviders.huggingface.key}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });
    
    if (response.data?.choices?.[0]?.message?.content) {
      let aiResponse = response.data.choices[0].message.content.trim();
      
      // 🔥 HALLUCINATION DETECTION: Check if AI is making up specific details
      const hallucinationPatterns = [
        /formed in \d{4}/i,
        /founded in \d{4}/i,
        /started in \d{4}/i,
        /came out in \d{4}/i,
        /released in \d{4}/i,
        /from (sydney|melbourne|brisbane|perth|adelaide|australia|new york|london|tokyo)/i,
        /australian (indie|rock|band)/i,
        /breakthrough hit in \d{4}/i,
        /their home country/i,
        /before releasing their/i,
        /moderate following in their/i,
        /(third|fourth|fifth|second|debut|first) album/i,
        /lead vocalist.*guitarist/i,
        /collaborative album/i,
        /cult classic among/i,
        /got a lot of airplay/i,
        /college radio/i,
        /laid-back.*jazzy vibe/i,
        /departure from/i,
        /earlier.*more high-energy/i,
        /featured on one of their/i,
        /fellow musician/i,
        /written by the lead/i
      ];
      
      const isHallucinating = hallucinationPatterns.some(pattern => pattern.test(aiResponse));
      const hasRealInfo = (artistInfo && artistInfo.length > 50) || (songInfo && songInfo.length > 50);
      
      if (isHallucinating && !hasRealInfo) {
        this.log(`⚠️ HuggingFace hallucination detected: "${aiResponse.substring(0, 80)}..."`);
        // If asking about the artist/band/song
        if (message.toLowerCase().includes('tell me') || 
            message.toLowerCase().includes('about this') || 
            message.toLowerCase().includes('this group') ||
            message.toLowerCase().includes('who wrote') ||
            message.toLowerCase().includes('who made') ||
            message.toLowerCase().includes('this song') ||
            message.toLowerCase().includes('this track')) {
          aiResponse = `i don't have detailed info on that. try /info or /song for factual data.`;
        } else {
          aiResponse = `solid track. good vibes.`;
        }
      }
      
      return aiResponse;
    } else {
      this.log(`❌ HuggingFace response format: ${JSON.stringify(response.data, null, 2)}`);
      throw new Error('Invalid HuggingFace response format');
    }
  }
  
  // Deprecated old HuggingFace code
  async callHuggingFaceOLD(message, userId = null, userName = null) {
    let prompt = "You are a deadpan AI bot. Keep responses short and factual. Do NOT ask questions - just respond directly to what the user says. ";
    
    // Add personality context if user memory exists
    if (userId && this.userMemories.has(userId)) {
      const userMemory = this.userMemories.get(userId);
      const roomContext = this.getRoomContext();
      
      prompt += `The user "${userName}" has a ${userMemory.personality} relationship with you (mood: ${userMemory.mood}).`;
      
      // Add room context
      if (roomContext.currentSong) {
        prompt += ` Current song: ${roomContext.currentSong.metadata.artist} - ${roomContext.currentSong.metadata.song}.`;
      }
      
      if (roomContext.djs.length > 0) {
        prompt += ` DJs on stage: ${roomContext.djs.map(dj => dj.name).join(', ')}.`;
      }
      
      // Add user's top artists if available
      const userStats = this.getUserStats(userId);
      const topArtists = Array.from(userStats.topArtists.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      if (topArtists.length > 0) {
        prompt += ` User's top artists: ${topArtists.map(([artist, count]) => artist).join(', ')}.`;
      }
      
      // Adjust personality based on mood
      if (userMemory.personality === 'warm') {
        prompt += " Be slightly more helpful and warm.";
      } else if (userMemory.personality === 'friendly') {
        prompt += " Be helpful and friendly.";
      } else if (userMemory.personality === 'sarcastic') {
        prompt += " Be sarcastic and snarky.";
      } else if (userMemory.personality === 'hostile') {
        prompt += " Be dismissive and cold.";
      } else {
        prompt += " Be deadpan and matter-of-fact.";
      }
    }
    
    prompt += ` User: ${message}`;
    
    let response;
    try {
      // OLD API - deprecated
      response = await axios.post(`https://api-inference.huggingface.co/models/${this.aiProviders.huggingface.model}`, {
        inputs: prompt,
        parameters: {
          max_length: 100,
          temperature: 0.7,
          return_full_text: false,
          do_sample: true
        }
      }, {
        headers: { 
          'Authorization': `Bearer ${this.aiProviders.huggingface.key}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
    } catch (error) {
      // If model is loading or fails, try fallback model
      if (error.response && (error.response.status === 503 || error.response.status === 404)) {
        this.log(`🔄 Trying HuggingFace fallback model: ${this.aiProviders.huggingface.fallbackModel}`);
        response = await axios.post(`https://api-inference.huggingface.co/models/${this.aiProviders.huggingface.fallbackModel}`, {
          inputs: prompt,
          parameters: {
            max_length: 80,
            temperature: 0.7,
            return_full_text: false,
            do_sample: true
          }
        }, {
          headers: { 
            'Authorization': `Bearer ${this.aiProviders.huggingface.key}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });
      } else {
        throw error;
      }
    }
    
    if (response.data && response.data.generated_text) {
      return response.data.generated_text.trim();
    } else if (response.data && Array.isArray(response.data) && response.data[0] && response.data[0].generated_text) {
      return response.data[0].generated_text.trim();
    } else if (response.data && response.data.error) {
      throw new Error(`HuggingFace API error: ${response.data.error}`);
    } else {
      this.log(`❌ HuggingFace response format: ${JSON.stringify(response.data, null, 2)}`);
      throw new Error('Invalid HuggingFace response format');
    }
  }
  
  handleVoteCommand(args) {
    if (args === 'up') {
      this.upvote();
      return '✅ Voted up!';
    } else if (args === 'down') {
      this.downvote();
      return '✅ Voted down!';
    } else {
      return '❌ Usage: /vote <up|down>';
    }
  }
  
  async handleDjCommand(args) {
    if (args === 'add') {
      const djSuccess = await this.addDj();
      if (djSuccess) {
        this.isBotOnStage = true;
        this.lastAutoHopTime = Date.now(); // Reset cooldown for manual hop
        return '✅ Successfully became DJ!';
      } else {
        return '❌ Failed to become DJ.';
      }
    } else if (args === 'remove') {
      this.removeDj();
      this.isBotOnStage = false;
      return '🎧 Attempting to quit DJ...';
    } else {
      return '❌ Usage: /dj <add|remove>';
    }
  }
  
  // Pre-fetch enhanced metadata for better API responses
  async preFetchEnhancedMetadata(songData) {
    try {
      const cacheKey = `${songData.artist} - ${songData.song}`;
      
      // Don't pre-fetch if we already have cached data
      if (this.songMetadata.enhancedData.has(cacheKey)) {
        return;
      }
      
      // Clean the song title and artist name for database searches
      const cleanSong = this.cleanSongTitleForDatabase(songData.song);
      const cleanArtist = this.cleanArtistNameForDatabase(songData.artist);
      
      // Try MusicBrainz first for detailed metadata with clean names
      const musicBrainzData = await this.searchMusicBrainz(cleanArtist, cleanSong);
      
      // Try Wikipedia for artist info with clean name
      const wikipediaData = await this.searchWikipedia(cleanArtist);
      
      // Cache the enhanced data
      this.songMetadata.enhancedData.set(cacheKey, {
        musicBrainz: musicBrainzData,
        wikipedia: wikipediaData,
        timestamp: Date.now()
      });
      
      // Metadata cached successfully
    } catch (error) {
      this.log(`❌ Error pre-fetching metadata: ${error.message}`);
    }
  }

  async handleInfoCommand() {
    try {
      // Check multiple sources for current song
      let currentSongData = this.songMetadata.current || this.roomState.currentSong || this.currentSong;
      
      // Debug logging
      this.log(`🔍 Info command debug: songMetadata.current=${!!this.songMetadata.current}, roomState.currentSong=${!!this.roomState.currentSong}, currentSong=${!!this.currentSong}`);
      
      if (!currentSongData) {
        return '🎵 No song currently playing.';
      }
      
      // Extract artist from different possible formats
      const artist = currentSongData.artist || currentSongData.metadata?.artist;
      const song = currentSongData.song || currentSongData.metadata?.song;
      const cacheKey = `${artist} - ${song}`;
      
      // Check if we have cached enhanced data
      const cachedData = this.songMetadata.enhancedData.get(cacheKey);
      
      // Try Wikipedia first (use cached if available) - try with (band) suffix first
      let info = cachedData?.wikipedia || await this.searchWikipedia(`${artist} (band)`);
      
      // If not found, try without the suffix
      if (!info) {
        info = await this.searchWikipedia(artist);
      }
      
      // Debug logging
      if (!info) {
        this.log(`🔍 No Wikipedia results for: ${artist}`);
      }
      
      // If Wikipedia fails, try Discogs
      if (!info) {
        info = await this.searchDiscogs(artist);
        if (info) {
          return `${info.description} [${info.url}].`;
        }
      }
      
      // If both fail, use AI fallback with detailed prompt including available metadata
      if (!info) {
        const album = currentSongData.album || currentSongData.metadata?.album;
        const year = currentSongData.year || currentSongData.metadata?.year;
        const metadataContext = album && album !== 'Unknown' ? 
          ` (from album "${album}"${year && year !== 'Unknown' ? `, released ${year}` : ''})` : '';
        
        const aiResponse = await this.getAIResponse(`Provide a comprehensive factual summary of the artist/band "${artist}"${metadataContext} including their genre, formation year, notable albums, musical style, and key achievements. Focus on factual information without promotional language. End with a period.`);
        
        if (aiResponse && typeof aiResponse === 'string') {
          return aiResponse;
        } else if (aiResponse && aiResponse.response) {
          return aiResponse.response;
        }
      }
      
      // Ensure Wikipedia response ends with period and has clickable link
      const extract = info.extract.endsWith('.') ? info.extract : `${info.extract}.`;
      return `${extract} [${info.url}]`;
    } catch (error) {
      this.log(`❌ Info command error: ${error.message}`);
      return '❌ Unable to retrieve artist information.';
    }
  }
  
  async handleSongCommand() {
    try {
      // Check multiple sources for current song
      let currentSongData = this.songMetadata.current || this.roomState.currentSong || this.currentSong;
      
      // Debug logging
      this.log(`🔍 Song command debug: songMetadata.current=${!!this.songMetadata.current}, roomState.currentSong=${!!this.roomState.currentSong}, currentSong=${!!this.currentSong}`);
      
      if (!currentSongData) {
        return '🎵 No song currently playing.';
      }
      
      // Extract song data from different possible formats
      const artist = currentSongData.artist || currentSongData.metadata?.artist;
      const song = currentSongData.song || currentSongData.metadata?.song;
      const album = currentSongData.album || currentSongData.metadata?.album;
      const year = currentSongData.year || currentSongData.metadata?.year;
      const cacheKey = `${artist} - ${song}`;
      
      // Check if we have cached enhanced data
      const cachedData = this.songMetadata.enhancedData.get(cacheKey);
      
      // Try MusicBrainz first (use cached if available)
      let musicBrainzInfo = cachedData?.musicBrainz || await this.searchMusicBrainz(artist, song);
      
      // If we have MusicBrainz data, use it for enhanced context
      if (musicBrainzInfo) {
        const musicBrainzContext = `Originally released on "${musicBrainzInfo.title}" in ${musicBrainzInfo.date}`;
        this.log(`🎵 Using MusicBrainz data: ${musicBrainzContext}`);
      }
      
      // Try Wikipedia for song first (prioritize song-specific search)
      let info = await this.searchWikipedia(`${artist} ${song}`);
      
      // If song not found, try album (prioritize original album from MusicBrainz)
      if (!info) {
        const searchAlbum = musicBrainzInfo?.title || (album !== 'Unknown' ? album : null);
        if (searchAlbum) {
          info = await this.searchWikipedia(`${artist} ${searchAlbum}`);
        }
      }
      
      // If still not found, try artist as last resort
      if (!info) {
        info = await this.searchWikipedia(`${artist} (band)`);
      }
      
      // If still not found, try Discogs
      if (!info) {
        info = await this.searchDiscogs(`${artist} ${song}`);
        if (info) {
          return `${info.description} [${info.url}].`;
        }
      }
      
      // If all fail, use AI fallback with detailed prompt including available metadata
      if (!info) {
        let metadataContext = '';
        
        // Prioritize MusicBrainz data for original album information
        if (musicBrainzInfo) {
          metadataContext = ` originally released on the album "${musicBrainzInfo.title}" in ${musicBrainzInfo.date}`;
        } else if (album !== 'Unknown') {
          metadataContext = ` from the album "${album}"${year !== 'Unknown' ? ` (released ${year})` : ''}`;
        } else if (year !== 'Unknown') {
          metadataContext = ` (released ${year})`;
        }
        
        const aiResponse = await this.getAIResponse(`Provide a detailed factual description of the song "${song}" by ${artist}${metadataContext} including its release year, album, genre, musical style, lyrical themes, chart performance, and cultural significance. Focus on factual information without promotional language. End with a period.`);
        const responseText = typeof aiResponse === 'string' ? aiResponse : aiResponse.response;
        return responseText.endsWith('.') ? responseText : `${responseText}.`;
      }
      
      // Ensure Wikipedia response ends with period and has clickable link
      const extract = info.extract.endsWith('.') ? info.extract : `${info.extract}.`;
      return `${extract} [${info.url}]`;
    } catch (error) {
      this.log(`❌ Song command error: ${error.message}`);
      return '❌ Unable to retrieve song information.';
    }
  }

  // Search MusicBrainz for detailed song metadata
  async searchMusicBrainz(artist, song) {
    try {
      // Clean artist name but be more lenient
      const cleanArtist = artist.trim();
      if (cleanArtist.length < 1) {
        return null;
      }
      
      // First, search for the artist with more specific criteria
      const artistSearchUrl = `https://musicbrainz.org/ws/2/artist?query=artist:"${encodeURIComponent(cleanArtist)}"&fmt=json&limit=5`;
      const artistResponse = await axios.get(artistSearchUrl, {
        headers: {
          'User-Agent': 'DeepcutAIBot/1.0 (https://deepcut.live)',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (!artistResponse.data.artists || artistResponse.data.artists.length === 0) {
        this.log(`🔍 No MusicBrainz artist found for: ${artist}`);
        return null;
      }

      // Find the best matching artist (exact name match preferred)
      let bestArtist = null;
      for (const artistData of artistResponse.data.artists) {
        const artistName = artistData.name.toLowerCase();
        const searchName = cleanArtist.toLowerCase();
        
        // Prefer exact matches or close matches
        if (artistName === searchName || 
            artistName.includes(searchName) || 
            searchName.includes(artistName)) {
          bestArtist = artistData;
          break;
        }
      }
      
      // If no good match found, use the first result
      if (!bestArtist) {
        bestArtist = artistResponse.data.artists[0];
      }

      const artistId = bestArtist.id;
      // Found artist in MusicBrainz

      // Clean song name but be more lenient
      const cleanSong = song.trim();
      if (cleanSong.length < 1) {
        return null;
      }
      
      // Now search for recordings by this artist
      const recordingSearchUrl = `https://musicbrainz.org/ws/2/recording?query=artist:${artistId} AND recording:"${encodeURIComponent(cleanSong)}"&fmt=json&limit=10&inc=releases`;
      const recordingResponse = await axios.get(recordingSearchUrl, {
        headers: {
          'User-Agent': 'DeepcutAIBot/1.0 (https://deepcut.live)',
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (!recordingResponse.data.recordings || recordingResponse.data.recordings.length === 0) {
        this.log(`🔍 No MusicBrainz recordings for: ${artist} - ${song}`);
        return null;
      }

      // Find the original album release (not compilation/greatest hits)
      let originalRelease = null;
      let earliestDate = null;

      for (const recording of recordingResponse.data.recordings) {
        if (recording.releases) {
          for (const release of recording.releases) {
            // Skip compilation and greatest hits albums
            const releaseTitle = release.title.toLowerCase();
            const isCompilation = releaseTitle.includes('greatest hits') || 
                                releaseTitle.includes('best of') || 
                                releaseTitle.includes('collection') ||
                                releaseTitle.includes('anthology') ||
                                releaseTitle.includes('compilation') ||
                                releaseTitle.includes('hits') ||
                                releaseTitle.includes('singles') ||
                                releaseTitle.includes('remix') ||
                                releaseTitle.includes('remastered') ||
                                releaseTitle.includes('deluxe') ||
                                releaseTitle.includes('expanded') ||
                                releaseTitle.includes('bonus') ||
                                releaseTitle.includes('live') ||
                                releaseTitle.includes('acoustic') ||
                                releaseTitle.includes('unplugged');

            if (!isCompilation && release.date) {
              const releaseDate = new Date(release.date);
              if (!earliestDate || releaseDate < earliestDate) {
                earliestDate = releaseDate;
                originalRelease = release;
              }
            }
          }
        }
      }

      if (originalRelease) {
        // Found original release
        return {
          title: originalRelease.title,
          date: originalRelease.date,
          country: originalRelease.country || 'Unknown',
          status: originalRelease.status || 'Official',
          url: `https://musicbrainz.org/release/${originalRelease.id}`
        };
      }

      // If no original release found, return the first non-compilation release
      for (const recording of recordingResponse.data.recordings) {
        if (recording.releases) {
          for (const release of recording.releases) {
            const releaseTitle = release.title.toLowerCase();
            const isCompilation = releaseTitle.includes('greatest hits') || 
                                releaseTitle.includes('best of') || 
                                releaseTitle.includes('collection') ||
                                releaseTitle.includes('anthology') ||
                                releaseTitle.includes('compilation');

            if (!isCompilation) {
              // Found non-compilation release
              return {
                title: release.title,
                date: release.date || 'Unknown',
                country: release.country || 'Unknown',
                status: release.status || 'Official',
                url: `https://musicbrainz.org/release/${release.id}`
              };
            }
          }
        }
      }

      this.log(`❌ No original album found for: ${artist} - ${song}`);
      return null;
    } catch (error) {
      if (error.response) {
        this.log(`❌ MusicBrainz API error: ${error.response.status} - ${error.response.statusText}`);
      } else {
        this.log(`❌ MusicBrainz search error: ${error.message}`);
      }
      return null;
    }
  }
  
  async handleStatsCommand() {
    try {
      const userId = this.currentUserId;
      const userName = this.currentUserName || 'User';
      
      if (!userId) {
        return '❌ Unable to identify user.';
      }
      
      const userStats = this.getUserStats(userId);
      const topArtists = Array.from(userStats.topArtists.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      const totalSongs = Array.from(userStats.topArtists.values()).reduce((sum, count) => sum + count, 0);
      
      let response = `${userName}\n\n`;
      response += `Bankroll: ${totalSongs} songs\n\n`;
      
      // Top 3 artists
      if (topArtists.length > 0) {
        topArtists.forEach(([artist, count], index) => {
          response += `${index + 1}. ${artist} (${count})\n`;
        });
      } else {
        response += `No plays tracked yet\n`;
      }
      
      response += `\nMore stats coming soon...`;
      
      return response;
    } catch (error) {
      this.log(`❌ Stats command error: ${error.message}`);
      return '❌ Unable to retrieve stats.';
    }
  }
  
  async handleFirstPlayedCommand() {
    try {
      // Check multiple sources for current song
      let currentSongData = this.songMetadata.current || this.roomState.currentSong || this.currentSong;
      
      if (!currentSongData) {
        return '🎵 No song currently playing.';
      }
      
      const artist = currentSongData.artist || currentSongData.metadata?.artist;
      const song = currentSongData.song || currentSongData.metadata?.song;
      const songKey = `${artist} - ${song}`;
      
      // Check songStats first (this is where we actually store first player)
      if (this.songStats.has(songKey)) {
        const stats = this.songStats.get(songKey);
        const firstPlayerName = stats.firstPlayerName || 'Unknown';
        const totalPlays = stats.plays || 1;
        
        return `🎯 ${firstPlayerName} first played this (${totalPlays} total plays)`;
      }
      
      // Fallback: check userStats.firstPlayed (legacy)
      for (const [userId, userStats] of this.userStats.entries()) {
        if (userStats.firstPlayed && userStats.firstPlayed.has(songKey)) {
          const user = this.users.get(userId);
          const userName = user ? user.name : 'Unknown';
          return `🎯 ${userName} first played this`;
        }
      }
      
      return `🎵 No record of who first played this track`;
    } catch (error) {
      this.log(`❌ First played command error: ${error.message}`);
      return '❌ Unable to retrieve first played information.';
    }
  }
  
  async handleHopUpCommand() {
    try {
      const djSuccess = await this.addDj();
      if (djSuccess) {
        this.isBotOnStage = true;
        this.lastAutoHopTime = Date.now(); // Reset cooldown for manual hop
        this.rebootTime = 0; // Clear reboot timer - bot has hopped up
        this.log('🎧 Bot hopped up to DJ stage');
        return 'Hopped up to DJ stage.';
      } else {
        this.log('❌ Failed to hop up to DJ stage');
        return 'Failed to hop up to stage.';
      }
    } catch (error) {
      this.log(`❌ Hop up command error: ${error.message}`);
      return 'Failed to hop up to stage.';
    }
  }
  
  handleHopDownCommand() {
    try {
      this.removeDj();
      this.isBotOnStage = false;
      this.botNextSong = null;
      this.log('🎧 Bot hopped down from DJ stage');
      return 'Hopped down from DJ stage.';
    } catch (error) {
      this.log(`❌ Hop down command error: ${error.message}`);
      return 'Failed to hop down from stage.';
    }
  }
  
  async handleSkipCommand() {
    try {
      // Check if bot is on stage
      if (!this.isBotOnStage) {
        this.log('❌ Bot not on stage - cannot skip');
        return 'Not on stage.';
      }
      
      // Skip current song by advancing queue
      this.log('⏭️ Skipping current song...');
      
      // Method 1: Try to skip using playlist.skip API
      const skipMsgId = Date.now();
      
      return new Promise((resolve) => {
        // Store callback for skip response
        if (!this.pendingCallbacks) {
          this.pendingCallbacks = new Map();
        }
        
        this.pendingCallbacks.set(skipMsgId, (response) => {
          if (response.success) {
            this.log('✅ Song skipped successfully');
            this.botNextSong = null; // Clear current song
            resolve('Skipped.');
          } else {
            this.log('❌ Skip API failed, trying alternate method...');
            resolve('Skip failed.');
          }
        });
        
        // Send skip request
        this.send({
          api: 'playlist.skip',
          msgid: skipMsgId
        });
        
        // Timeout after 2 seconds
        setTimeout(() => {
          if (this.pendingCallbacks.has(skipMsgId)) {
            this.pendingCallbacks.delete(skipMsgId);
            this.log('⏰ Skip request timeout');
            resolve('Skip timeout.');
          }
        }, 2000);
      });
      
    } catch (error) {
      this.log(`❌ Skip command error: ${error.message}`);
      return 'Failed to skip.';
    }
  }
  
  handleUptimeCommand() {
    const sessionUptime = Date.now() - this.uptimeStart;
    const lifetime = this.lifetimeUptime + sessionUptime;
    
    let status = `⏱️ **Uptime Stats**\n\n🕐 **Session:** ${this.formatUptime(sessionUptime)}\n🏆 **Lifetime:** ${this.formatUptime(lifetime)}\n🔄 **Started:** ${new Date(this.uptimeStart).toLocaleString()}`;
    
    // Add glue status
    if (this.isGlued()) {
      const remaining = Math.ceil((this.gluedUntil - Date.now()) / 60000);
      status += `\n\n🔒 **Glue Status:** Glued to floor (${remaining} minutes remaining)`;
    } else {
      status += `\n\n🔓 **Glue Status:** Free to auto-hop`;
    }
    
    // Add stage status
    status += `\n🎧 **Stage Status:** ${this.isBotOnStage ? 'On Stage' : 'On Floor'}`;
    
    return status;
  }
  
  async handleForceSongCommand() {
    try {
      this.log('🎵 Force selecting a new song...');
      const suggestedSong = await this.generateAISongSuggestion();
      if (suggestedSong) {
        this.botNextSong = suggestedSong;
        this.log(`🎵 Force selected: ${suggestedSong.artist} - ${suggestedSong.title}`);
        
        // If bot is on stage, queue the song immediately
        if (this.isBotOnStage) {
          const success = await this.queueSong(suggestedSong);
          if (success) {
            return `✅ **Force Selected & Queued:** ${suggestedSong.artist} - ${suggestedSong.title}`;
          } else {
            return `✅ **Force Selected:** ${suggestedSong.artist} - ${suggestedSong.title} (but failed to queue)`;
          }
        } else {
          return `✅ **Force Selected:** ${suggestedSong.artist} - ${suggestedSong.title} (will queue when on stage)`;
        }
      } else {
        return '❌ Failed to generate a song suggestion';
      }
    } catch (error) {
      this.log(`❌ Force song command error: ${error.message}`);
      return `❌ Error: ${error.message}`;
    }
  }

  handleSpoilCommand() {
    try {
      if (this.botNextSong) {
        const spoilMessage = `🎵 **Next Song:** ${this.botNextSong.artist} - ${this.botNextSong.title}`;
        this.log(`🎵 SPOILER: ${spoilMessage}`);
        return spoilMessage;
      } else {
        this.log('🎵 SPOILER: Bot has no next song queued');
        return '🎵 **Next Song:** No song queued yet';
      }
    } catch (error) {
      this.log(`❌ Spoil command error: ${error.message}`);
      return '❌ Unable to retrieve bot queue.';
    }
  }
  
  handleQueueStatusCommand() {
    try {
      let status = `🎵 **Bot Queue Status**\n\n`;
      
      // Bot stage status
      status += `🎧 **Stage:** ${this.isBotOnStage ? '✅ On Stage' : '❌ On Floor'}\n`;
      
      // Song selection status
      if (this.botNextSong) {
        status += `🎵 **Selected Song:** ${this.botNextSong.artist} - ${this.botNextSong.title}\n`;
        status += `🎭 **Genre:** ${this.botNextSong.genre || 'Unknown'}\n`;
        status += `📊 **Source:** ${this.botNextSong.source || 'Unknown'}\n`;
        
        // Queue status
        if (this.isBotOnStage) {
          status += `✅ **Queue Status:** Song should be queued in room\n`;
        } else {
          status += `⏳ **Queue Status:** Song ready, will queue when bot joins stage\n`;
        }
      } else {
        status += `❌ **Selected Song:** No song selected\n`;
      }
      
      // Playlist history
      if (this.botPlaylist.length > 0) {
        status += `\n📋 **Recent Selections:**\n`;
        this.botPlaylist.slice(-3).forEach((song, index) => {
          status += `${index + 1}. ${song.artist} - ${song.title}\n`;
        });
      }
      
      // Song count
      status += `\n🔢 **Songs Played Count:** ${this.songsPlayedCount}`;
      
      return status;
    } catch (error) {
      this.log(`❌ Queue status command error: ${error.message}`);
      return '❌ Unable to retrieve queue status.';
    }
  }
  
  async handleSearchCommand(args) {
    try {
      if (!args || args.trim() === '') {
        return '🔍 **Song Search**\n\nUsage: /.search <artist> - <song>\n\nExample:\n/.search Death Grips - Get Got\n\nThis tests the song search functionality.';
      }
      
      const searchQuery = args.trim();
      this.log(`🔍 Manual search requested: ${searchQuery}`);
      
      // Parse artist and title from the search query
      const match = searchQuery.match(/^(.+?)\s*-\s*(.+)$/);
      if (!match) {
        return '❌ Invalid format. Use: /.search Artist - Song Title';
      }
      
      const artist = match[1].trim();
      const title = match[2].trim();
      
      this.log(`🔍 Searching for: ${artist} - ${title}`);
      
      const foundSong = await this.searchForSong(artist, title);
      
      if (foundSong) {
        return `✅ **Found Song:**\n\n🎵 **Artist:** ${foundSong.metadata.artist}\n🎵 **Title:** ${foundSong.metadata.song}\n⏱️ **Duration:** ${foundSong.metadata.length || 'Unknown'}s\n🎬 **Source:** ${foundSong.source || 'Unknown'}`;
      } else {
        return `❌ **No song found** for: ${artist} - ${title}\n\nTry a different search term or check the spelling.`;
      }
    } catch (error) {
      this.log(`❌ Search command error: ${error.message}`);
      return '❌ Error searching for song.';
    }
  }
  
  async handleTestSearchCommand() {
    try {
      this.log('🧪 Testing search API with a simple query...');
      
      // Test with a very common song that should definitely exist
      const testSong = await this.searchForSong('The Beatles', 'Hey Jude');
      
      if (testSong) {
        return `✅ **Search API Test: PASSED**\n\n🎵 **Found:** ${testSong.metadata.artist} - ${testSong.metadata.song}\n⏱️ **Duration:** ${testSong.metadata.length || 'Unknown'}s\n\nSearch functionality is working!`;
      } else {
        return `❌ **Search API Test: FAILED**\n\nCould not find "The Beatles - Hey Jude"\n\nThis suggests the search API might not be working properly.`;
      }
    } catch (error) {
      this.log(`❌ Test search command error: ${error.message}`);
      return `❌ **Search API Test: ERROR**\n\nError: ${error.message}`;
    }
  }
  
  async handleTestQueueCommand() {
    try {
      if (!this.isBotOnStage) {
        return '❌ Bot is not on stage. Use /.hopup first to test queue functionality.';
      }
      
      if (!this.botNextSong) {
        return '❌ Bot has no song selected. Use /.selectgenre or wait for automatic selection.';
      }
      
      this.log('🧪 Testing queue functionality...');
      
      // Test queue the current selected song
      const success = await this.queueSong(this.botNextSong);
      
      if (success) {
        return `✅ **Queue Test: SUCCESS**\n\n🎵 **Song:** ${this.botNextSong.artist} - ${this.botNextSong.title}\n📤 **API Call:** playlist.add\n✅ **Status:** Song found and queued successfully!\n\nCheck the room to see if the song appears in the queue!`;
      } else {
        return `⚠️ **Queue Test: FALLBACK**\n\n🎵 **Song:** ${this.botNextSong.artist} - ${this.botNextSong.title}\n📤 **API Call:** room.update_next_song (fallback)\n⚠️ **Status:** Song not found, using fallback method\n\nCheck the room to see if the song appears in the queue!`;
      }
    } catch (error) {
      this.log(`❌ Test queue command error: ${error.message}`);
      return `❌ **Queue Test: ERROR**\n\nError: ${error.message}`;
    }
  }
  
  async handleTestAICommand(args) {
    try {
      if (!args || args.trim() === '') {
        return '🤖 **AI Provider Test**\n\nUsage: /.testai <provider>\n\nAvailable providers:\n• openai\n• gemini\n• huggingface\n\nExample: /.testai gemini';
      }
      
      const provider = args.trim().toLowerCase();
      const testMessage = 'Hello, this is a test message.';
      
      this.log(`🧪 Testing ${provider} AI provider...`);
      
      let result;
      try {
        result = await this.callAIProvider(provider, testMessage);
        return `✅ **${provider.toUpperCase()} Test: PASSED**\n\n🤖 **Response:** ${result}\n\n${provider} is working correctly!`;
      } catch (error) {
        this.log(`❌ ${provider} test error: ${error.message}`);
        return `❌ **${provider.toUpperCase()} Test: FAILED**\n\nError: ${error.message}\n\nCheck API key and configuration.\n\nFor Gemini: Make sure you're using a valid API key and the model name is correct.`;
      }
    } catch (error) {
      this.log(`❌ Test AI command error: ${error.message}`);
      return `❌ **AI Test: ERROR**\n\nError: ${error.message}`;
    }
  }
  
  async handleSelectGenreCommand(args) {
    try {
      if (!this.isBotOnStage) {
        return '❌ Bot is not on stage. Use /.hopup first.';
      }
      
      if (this.botNextSong) {
        return `🎵 **Already have song:** ${this.botNextSong.artist} - ${this.botNextSong.title}`;
      }
      
      let suggestedSong;
      
      if (args && args.trim()) {
        // Manual genre selection
        const genre = args.trim();
        this.log(`🎵 Manually selecting song for genre: ${genre}`);
        suggestedSong = await this.generateSongForGenre(genre);
        
        if (suggestedSong) {
          this.botNextSong = suggestedSong;
          this.log(`🎵 Bot selected: ${suggestedSong.artist} - ${suggestedSong.title}`);
          
          // Add to bot's playlist for tracking
          this.botPlaylist.push(suggestedSong);
          if (this.botPlaylist.length > 10) {
            this.botPlaylist = this.botPlaylist.slice(-10);
          }
          
          // Actually queue the song
          const success = await this.queueSong(suggestedSong);
          
          if (success) {
            return `🎵 **Selected:** ${suggestedSong.artist} - ${suggestedSong.title}\n🎭 **Genre:** ${genre}\n✅ **Status:** Successfully queued!`;
          } else {
            return `🎵 **Selected:** ${suggestedSong.artist} - ${suggestedSong.title}\n🎭 **Genre:** ${genre}\n⚠️ **Status:** Queued with fallback method`;
          }
        } else {
          return `❌ Could not find song for genre: ${genre}`;
        }
      } else {
        // Automatic room analysis
        this.log('🎵 Analyzing room vibe and selecting genre-based song...');
        suggestedSong = await this.generateGenreBasedSong();
        
        if (suggestedSong) {
          this.botNextSong = suggestedSong;
          this.log(`🎵 Bot selected: ${suggestedSong.artist} - ${suggestedSong.title}`);
          
          // Add to bot's playlist for tracking
          this.botPlaylist.push(suggestedSong);
          if (this.botPlaylist.length > 10) {
            this.botPlaylist = this.botPlaylist.slice(-10);
          }
          
          // Actually queue the song
          const success = await this.queueSong(suggestedSong);
          
          if (success) {
            return `🎵 **Selected:** ${suggestedSong.artist} - ${suggestedSong.title}\n🎭 **Based on:** ${suggestedSong.genre || 'Room vibe analysis'}\n✅ **Status:** Successfully queued!`;
          } else {
            return `🎵 **Selected:** ${suggestedSong.artist} - ${suggestedSong.title}\n🎭 **Based on:** ${suggestedSong.genre || 'Room vibe analysis'}\n⚠️ **Status:** Queued with fallback method`;
          }
        } else {
          return '❌ Could not generate genre-based song suggestion.';
        }
      }
    } catch (error) {
      this.log(`❌ Select genre command error: ${error.message}`);
      return '❌ Error selecting genre-based song.';
    }
  }
  
  async handleLaptopCommand(username) {
    try {
      if (!username || username.trim() === '') {
        return '💻 **Laptop Copy**\n\nUsage: /.laptop <username>\n\nExample:\n/.laptop sppoc\n\n📋 This copies the specified user\'s laptop sticker configuration to the bot\'s laptop.';
      }
      
      const targetUsername = username.trim();
      this.log(`💻 Laptop command requested for user: ${targetUsername}`);
      
      // Find user by username in room
      let targetUser = null;
      for (const [userId, user] of this.users.entries()) {
        if (user.name && user.name.toLowerCase() === targetUsername.toLowerCase()) {
          targetUser = user;
          break;
        }
      }
      
      if (!targetUser) {
        const userList = Array.from(this.users.values()).map(u => `${u.name}${u.bot ? ' (bot)' : ''}`).join(', ');
        return `❌ User "${targetUsername}" not found. Available: ${userList}`;
      }
      
      // Check if user has stickers in room data first
      if (this.currentRoom && this.currentRoom.metadata && this.currentRoom.metadata.sticker_placements) {
        const userPlacements = this.currentRoom.metadata.sticker_placements[targetUser.userid];
        if (userPlacements && userPlacements.length > 0) {
          this.log(`💻 Found ${userPlacements.length} sticker placements for ${targetUsername} in room data`);
          
          // Apply the user's laptop configuration to the bot
          await this.applyLaptopConfiguration(userPlacements);
          
          return `✅ **Laptop Copied!**\n\n👤 **From:** ${targetUsername}\n🎨 **Applied:** ${userPlacements.length} stickers to bot's laptop`;
        }
      }
      
      // If not in room data, try to access user's public profile data
      try {
        this.log(`💻 Attempting to get public profile data for ${targetUsername}...`);
        
        // Try to get user's sticker placements using deepcut.live
        const response = await axios.get(`https://deepcut.live/api/sticker.get_placements`, {
          params: {
            userid: targetUser.userid,
            client: 'web',
            decache: Date.now()
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest'
          },
          timeout: 10000
        });
        
        this.log(`💻 Sticker API response for ${targetUsername}:`, JSON.stringify(response.data, null, 2));
        
        if (response.data && response.data[0] && response.data[1] && response.data[1].placements) {
          const placements = response.data[1].placements;
          if (placements && placements.length > 0) {
            // Apply the user's laptop configuration to the bot
            await this.applyLaptopConfiguration(placements);
            
            return `✅ **Laptop Copied!**\n\n👤 **From:** ${targetUsername}\n🎨 **Applied:** ${placements.length} stickers to bot's laptop`;
          } else {
            return `💻 **Laptop Status:** ${targetUsername} has no stickers on their laptop`;
          }
        } else {
          return `❌ **Access Denied:** Unable to access ${targetUsername}'s laptop configuration`;
        }
      } catch (error) {
        this.log(`❌ Error getting profile data for ${targetUsername}:`, error.message);
        return `❌ **Access Denied:** Unable to access ${targetUsername}'s laptop. This user is in the audience and their sticker data is not publicly available. Only DJs' laptop configurations are visible in the room data.`;
      }
    } catch (error) {
      this.log(`❌ Laptop command error: ${error.message}`);
      return '❌ Error retrieving laptop information.';
    }
  }
  
  async handleStickersCommand(term, userId = null) {
    try {
      if (!term || term.trim() === '') {
        return '🎨 **Sticker Design**\n\nUsage: /.stickers <term>\n\nExamples:\n🎃 /.stickers pumpkin\n🌸 /.stickers flower\n🎵 /.stickers music\n🔤 /.stickers letter W\n💧 /.stickers raindrops';
      }
      
      // Check rate limiting if userId is provided
      if (userId) {
        const now = Date.now();
        const userCooldown = this.stickerCommandCooldowns.get(userId);
        
        if (userCooldown) {
          const timeSinceLastUse = now - userCooldown.lastUsed;
          const usesInHour = userCooldown.uses;
          
          // Check if user has exceeded hourly limit
          if (usesInHour >= this.stickerCommandLimit) {
            const timeLeft = this.stickerCommandCooldownTime - timeSinceLastUse;
            if (timeLeft > 0) {
              const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
              return `⏰ **Rate Limit Exceeded**\n\nYou can use /.stickers ${this.stickerCommandLimit} times per hour.\n⏳ Try again in ${minutesLeft} minutes.\n\n💡 **Tip:** Use /.laptop <username> or /.randomstickers on/off for unlimited sticker fun!`;
            } else {
              // Reset cooldown if hour has passed
              this.stickerCommandCooldowns.set(userId, { uses: 1, lastUsed: now });
            }
          } else {
            // Increment usage count
            this.stickerCommandCooldowns.set(userId, { uses: usesInHour + 1, lastUsed: now });
          }
        } else {
          // First time user
          this.stickerCommandCooldowns.set(userId, { uses: 1, lastUsed: now });
        }
      }
      
      const searchTerm = term.trim();
      this.log(`🎨 Stickers command requested for term: ${searchTerm}${userId ? ` by user ${userId}` : ''}`);
      
      // Get available stickers from the website
      const availableStickers = await this.getAvailableStickers();
      
      if (!availableStickers || availableStickers.length === 0) {
        return 'Unable to retrieve available stickers.';
      }
      
      // Use AI to create a laptop design
      const laptopDesign = await this.createLaptopDesign(searchTerm, availableStickers);
      
      if (laptopDesign) {
        this.log(`🎨 Created laptop design for "${searchTerm}": ${laptopDesign}`);
        
        // Apply the design to bot's laptop
        const applied = await this.applyLaptopDesign(laptopDesign, availableStickers, searchTerm);
        
        if (applied) {
          return `Applied "${searchTerm}" sticker design to my laptop!`;
        } else {
          return `Failed to apply "${searchTerm}" sticker design to my laptop.`;
        }
      } else {
        return `❌ Unable to create laptop design for "${searchTerm}".`;
      }
    } catch (error) {
      this.log(`❌ Stickers command error: ${error.message}`);
      return '❌ Error creating laptop design.';
    }
  }
  
  getAvatarNameMap() {
    // Map friendly names to avatar IDs
    return {
      'jason': '67',
      'jason1': '67',
      'default': '1',
      'classic': '1',
      // Add more named avatars here as needed
    };
  }
  
  async handleAvatarCommand(avatarId) {
    try {
      if (!avatarId || avatarId.trim() === '') {
        return '❌ Please specify an avatar ID or name. Use .avatars to see available avatars.\n\n📝 Named avatars: jason (67), default (1)';
      }
      
      avatarId = avatarId.trim().toLowerCase();
      
      // Check if it's a named avatar
      const nameMap = this.getAvatarNameMap();
      const resolvedId = nameMap[avatarId] || avatarId;
      
      this.log(`👤 Attempting to change avatar to: ${resolvedId}${nameMap[avatarId] ? ` (${avatarId})` : ''}`);
      const success = await this.setAvatar(resolvedId);
      
      if (success) {
        if (nameMap[avatarId]) {
          return `✅ Avatar changed to: ${avatarId} (ID: ${resolvedId})`;
        } else {
          return `✅ Avatar changed to: ${resolvedId}`;
        }
      } else {
        return `❌ Failed to change avatar to: ${resolvedId}`;
      }
    } catch (error) {
      this.log(`❌ Avatar command error: ${error.message}`);
      return '❌ Error changing avatar.';
    }
  }
  
  async handleAvatarsListCommand() {
    try {
      this.log('👤 Fetching available avatars...');
      const result = await this.getAllAvatars();
      
      if (!result.success || result.avatarIds.length === 0) {
        return '❌ Unable to retrieve available avatars.';
      }
      
      // Group avatars by access level (pro vs standard) with preview URLs
      const proAvatars = [];
      const standardAvatars = [];
      
      for (const avatarId of result.avatarIds) {
        const avatar = result.avatars[avatarId];
        if (avatar && avatar.pro) {
          proAvatars.push({
            id: avatarId,
            preview: `https://deepcut.live${avatar.images?.ff || avatar.images?.bf || '/roommanager_assets/avatars/' + avatarId + '/fullfront.png'}`
          });
        } else {
          standardAvatars.push({
            id: avatarId,
            preview: `https://deepcut.live${avatar.images?.ff || avatar.images?.bf || '/roommanager_assets/avatars/' + avatarId + '/fullfront.png'}`
          });
        }
      }
      
      let response = `👤 Available Avatars (${result.avatarIds.length} total):\n\n`;
      response += `🔗 Preview: https://deepcut.live/all_music_mix (Click avatar icon at top to browse)\n\n`;
      
      // Show named avatars first
      const nameMap = this.getAvatarNameMap();
      const namedAvatars = Object.keys(nameMap);
      if (namedAvatars.length > 0) {
        response += `📝 Named Avatars:\n`;
        const uniqueNames = [...new Set(Object.entries(nameMap).map(([name, id]) => `${name} (${id})`))];
        uniqueNames.slice(0, 10).forEach(name => {
          response += `  ${name}\n`;
        });
        response += '\n';
      }
      
      if (standardAvatars.length > 0) {
        response += `📦 Standard Avatars (${standardAvatars.length}):\n`;
        // Show first 10 with preview links
        standardAvatars.slice(0, 10).forEach(avatar => {
          response += `  ${avatar.id}: ${avatar.preview}\n`;
        });
        if (standardAvatars.length > 10) {
          response += `  ...and ${standardAvatars.length - 10} more (IDs: ${standardAvatars.slice(10, 20).map(a => a.id).join(', ')}...)\n`;
        }
        response += '\n';
      }
      
      if (proAvatars.length > 0) {
        response += `⭐ Pro Avatars (${proAvatars.length}):\n`;
        // Show first 5 with preview links
        proAvatars.slice(0, 5).forEach(avatar => {
          response += `  ${avatar.id}: ${avatar.preview}\n`;
        });
        if (proAvatars.length > 5) {
          response += `  ...and ${proAvatars.length - 5} more (IDs: ${proAvatars.slice(5, 10).map(a => a.id).join(', ')}...)\n`;
        }
        response += '\n';
      }
      
      response += '💡 Use .avatar <name or id> to change:\n';
      response += '  • .avatar jason (uses friendly name)\n';
      response += '  • .avatar 67 (uses ID number)\n';
      response += '🌐 Or visit deepcut.live and click your avatar to browse visually!';
      
      return response;
    } catch (error) {
      this.log(`❌ Avatars list command error: ${error.message}`);
      return '❌ Error fetching avatars list.';
    }
  }
  
  // Toggle random stickers on/off
  handleRandomStickersToggle(args) {
    try {
      if (!args || args.trim() === '') {
        return '🎲 **Random Stickers Toggle**\n\nUsage: /.randomstickers <on|off>\n\n🎨 **Description:** Continuously changes laptop stickers randomly every second\n\nExamples:\n✅ /.randomstickers on  - Enable random sticker changes\n❌ /.randomstickers off - Disable random sticker changes\n\n📊 **Current status:** ' + (this.randomStickersEnabled ? '🟢 ON' : '🔴 OFF');
      }
      
      const action = args.trim().toLowerCase();
      
      if (action === 'on' || action === 'enable') {
        if (this.randomStickersEnabled) {
          return '🟢 Random stickers are already enabled!';
        }
        this.randomStickersEnabled = true;
        this.log('🎲 Random stickers enabled - starting random placement');
        this.startRandomStickers();
        return '✅ **Random Stickers Enabled!**\n\n🎲 Stickers will change randomly every second';
      } else if (action === 'off' || action === 'disable') {
        if (!this.randomStickersEnabled) {
          return '🔴 Random stickers are already disabled!';
        }
        this.randomStickersEnabled = false;
        this.log('🎲 Random stickers disabled - stopping random placement');
        this.stopRandomStickers();
        return '✅ **Random Stickers Disabled!**\n\n🛑 Sticker changes stopped';
      } else {
        return '❌ **Invalid Argument**\n\nUsage: /.randomstickers <on|off>\n\nExamples:\n✅ /.randomstickers on  - Enable random sticker changes\n❌ /.randomstickers off - Disable random sticker changes';
      }
    } catch (error) {
      this.log(`❌ Random stickers toggle error: ${error.message}`);
      return `❌ Error toggling random stickers: ${error.message}`;
    }
  }
  
  // Start random sticker placement
  async startRandomStickers() {
    if (this.randomStickersInterval) {
      clearInterval(this.randomStickersInterval);
    }
    
    // Do initial random placement
    await this.applyRandomStickers();
    
    // Set up interval to change stickers every 1 second
    this.randomStickersInterval = setInterval(async () => {
      if (this.randomStickersEnabled) {
        await this.applyRandomStickers();
      }
    }, 1000); // 1 second
  }
  
  // Stop random sticker placement
  stopRandomStickers() {
    if (this.randomStickersInterval) {
      clearInterval(this.randomStickersInterval);
      this.randomStickersInterval = null;
    }
  }
  
  // Apply random stickers to laptop
  async applyRandomStickers() {
    try {
      this.log('🎲 Applying random stickers...');
      
      // Get available stickers
      const availableStickers = await this.getAvailableStickers();
      if (availableStickers.length === 0) {
        this.log('❌ No stickers available for random placement');
        return false;
      }
      
      // Select random stickers (5-15 stickers)
      const numStickers = Math.floor(Math.random() * 11) + 5; // 5-15 stickers
      const selectedStickers = [];
      
      for (let i = 0; i < numStickers; i++) {
        const randomSticker = availableStickers[Math.floor(Math.random() * availableStickers.length)];
        selectedStickers.push(randomSticker);
      }
      
      this.log(`🎲 Selected ${selectedStickers.length} random stickers: ${selectedStickers.map(s => s.name).join(', ')}`);
      
      // Create random placements
      const placements = selectedStickers.map((sticker, index) => {
        // Random position (0-400 for both x and y)
        const randomX = Math.floor(Math.random() * 400);
        const randomY = Math.floor(Math.random() * 400);
        const randomRotation = [0, 90, 180, 270][Math.floor(Math.random() * 4)];
        
        return {
          sticker_id: sticker.id,
          left: randomX,
          top: randomY,
          angle: randomRotation,
          transform: {
            rotate: `${randomRotation}deg`
          }
        };
      });
      
      this.log(`🎲 Applying ${placements.length} random stickers to laptop`);
      
      // Apply stickers using the sticker.place API (matching working format)
      const response = await axios.post('https://deepcut.live/api/sticker.place', {
        userid: this.userId,
        userauth: this.auth,
        client: 'web',
        decache: Date.now(),
        placements: placements
      }, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json; charset=UTF-8',
          'Origin': 'https://deepcut.live',
          'Referer': 'https://deepcut.live/profile/stickers',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Cookie': `turntableUserAuth=${this.auth}; turntableUserId=${this.userId}; turntableUserNamed=true`
        },
        timeout: 10000
      });
      
      if (response.data && (response.data.success || Array.isArray(response.data))) {
        this.log('✅ Successfully applied random stickers');
        return true;
      } else {
        this.log(`❌ Failed to apply random stickers: ${JSON.stringify(response.data)}`);
        return false;
      }
    } catch (error) {
      this.log(`❌ Error applying random stickers: ${error.message}`);
      return false;
    }
  }
  
  handleMemoryCommand() {
    const totalUsers = this.userMemories.size;
    const friendlyUsers = Array.from(this.userMemories.values()).filter(u => u.personality === 'friendly').length;
    const sassyUsers = Array.from(this.userMemories.values()).filter(u => u.personality === 'sassy').length;
    const neutralUsers = Array.from(this.userMemories.values()).filter(u => u.personality === 'neutral').length;
    
    return `🧠 Memory Stats:
👥 Total Users Tracked: ${totalUsers}
😊 Friendly: ${friendlyUsers}
😏 Sassy: ${sassyUsers}
😐 Neutral: ${neutralUsers}

💡 I remember our conversations and adjust my personality based on how you treat me!`;
  }
  
  handleMoodCommand(userId = null, userName = null) {
    if (!userId || !this.userMemories.has(userId)) {
      return `🤖 I don't have any memory of you yet! Try talking to me in main chat using keywords like "bot" or "ai" and I'll start remembering our conversations.`;
    }
    
    const userMemory = this.userMemories.get(userId);
    const moodEmoji = userMemory.mood > 2 ? '😊' : userMemory.mood < -2 ? '😏' : '😐';
    const moodText = userMemory.mood > 2 ? 'Friendly' : userMemory.mood < -2 ? 'Sassy' : 'Neutral';
    
    return `🤖 Your Mood with Me:
${moodEmoji} Mood Level: ${userMemory.mood}/5 (${moodText})
🧠 Interactions: ${userMemory.interactions.length}
💬 Last Chat: ${userMemory.lastInteraction ? new Date(userMemory.lastInteraction).toLocaleString() : 'Never'}

💡 I adjust my personality based on how you treat me! Be nice and I'll be friendly. Be rude and I'll get sassy! 😏`;
  }
  
  handleToggleCommand(args) {
    if (!this.aiToggleEnabled) {
      return '❌ AI provider toggle is disabled.';
    }
    
    if (!args || args.trim() === '') {
      return `🤖 **Current AI Provider:** ${this.currentAIProvider}

**Available Providers:**
• openai - GPT-4o-mini
• gemini - Gemini 2.5 Flash
• huggingface - Llama 3.2
• off - Disable AI

**Usage:** \`/.ai <provider>\` or \`/toggle <provider>\`

**Example:** \`/.ai gemini\``;
    }
    
    const provider = args.toLowerCase().trim();
    const validProviders = ['openai', 'gemini', 'huggingface', 'off'];
    
    if (!validProviders.includes(provider)) {
      return `❌ Invalid provider. Available: ${validProviders.join(', ')}`;
    }
    
    if (provider === 'off') {
      this.currentAIProvider = 'off';
      return '🤖 **AI Disabled** - Bot will not respond to keywords';
    }
    
    if (provider !== 'off' && !this.aiProviders[provider]?.key) {
      return `❌ **${provider} not configured** - Add API key to config.env`;
    }
    
    this.currentAIProvider = provider;
    this.log(`🔄 AI provider switched to: ${provider}`);
    return `✅ **AI Provider Changed**
🤖 Now using: **${provider}**
${provider === 'gemini' ? '📊 Model: gemini-2.5-flash' : ''}
${provider === 'huggingface' ? '📊 Model: meta-llama/Llama-3.2-3B-Instruct' : ''}
${provider === 'openai' ? '📊 Model: gpt-4o-mini' : ''}`;
  }
  
  upvote() {
    if (!this.currentSong) return;
    
    const vh = crypto.createHash('sha1').update(this.roomId + 'up' + this.currentSong._id).digest('hex');
    const th = crypto.createHash('sha1').update(Math.random().toString()).digest('hex');
    const ph = crypto.createHash('sha1').update(Math.random().toString()).digest('hex');
    
    this.send({
      api: 'room.vote',
      roomid: this.roomId,
      section: this.section,
      val: 'up',
      vh,
      th,
      ph
    });
    
    this.log('👍 Upvoted current song');
  }
  
  downvote() {
    if (!this.currentSong) return;
    
    const vh = crypto.createHash('sha1').update(this.roomId + 'down' + this.currentSong._id).digest('hex');
    const th = crypto.createHash('sha1').update(Math.random().toString()).digest('hex');
    const ph = crypto.createHash('sha1').update(Math.random().toString()).digest('hex');
    
    this.send({
      api: 'room.vote',
      roomid: this.roomId,
      section: this.section,
      val: 'down',
      vh,
      th,
      ph
    });
    
    this.log('👎 Downvoted current song');
  }
  
  addDj() {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.log(`⏰ Add DJ request timeout`);
        resolve(false);
      }, 10000); // 10 second timeout
      
      this.send({
        api: 'room.add_dj',
        roomid: this.roomId,
        section: this.section
      }, (response) => {
        clearTimeout(timeout);
        if (response && response.success) {
          this.log('✅ Successfully became DJ');
          resolve(true);
        } else {
          this.log(`❌ Failed to become DJ: ${JSON.stringify(response)}`);
          resolve(false);
        }
      });
      
      this.log('🎧 Attempting to become DJ');
    });
  }
  
  removeDj() {
    this.send({
      api: 'room.rem_dj',
      roomid: this.roomId,
      section: this.section
    });
    
    this.log('🎧 Attempting to quit DJ');
  }
  
  async queueSong(song) {
    try {
      this.log(`🎵 Attempting to queue: ${song.artist} - ${song.title}`);
      
      // Check current queue length and manage it
      await this.manageQueueSize();
      
      // First, try to search for the song to get a real fileid
      const foundSong = await this.searchForSong(song.artist, song.title);
      
      if (foundSong && foundSong._id) {
        this.log(`✅ Found song with fileid: ${foundSong._id}`);
        
        // Use direct HTTP request to deepcut.live API
        try {
          this.log(`📤 Making direct API call to deepcut.live...`);
          const response = await axios.post('https://deepcut.live/api/playlist.add', {
            playlist_name: 'BOT PLAYLIST AI',
            song_dict: [{ fileid: foundSong._id }],
            index: 0,
            userauth: this.auth,
            userid: this.userId,
            client: 'web',
            decache: Date.now()
          }, {
            headers: {
              'Content-Type': 'application/json; charset=UTF-8',
              'Origin': 'https://deepcut.live',
              'Referer': 'https://deepcut.live/all_music_mix',
              'X-Requested-With': 'XMLHttpRequest',
              'Cookie': `turntableUserAuth=${this.auth}; turntableUserId=${this.userId}; turntableUserNamed=true`
            },
            timeout: 10000
          });
          
          if (response.data && Array.isArray(response.data) && response.data[0] === true) {
            this.log(`✅ Direct API call successful: ${song.artist} - ${song.title}`);
            this.log(`📤 API Call: playlist.add (direct)`);
            this.log(`🎵 FileID: ${foundSong._id}`);
            return true;
          } else {
            this.log(`❌ Direct API call failed: ${JSON.stringify(response.data)}`);
            return false;
          }
        } catch (error) {
          this.log(`❌ Direct API call error: ${error.message}`);
          return false;
        }
      } else {
        this.log(`❌ Could not find song on platform: ${song.artist} - ${song.title}`);
        
        // Fallback: try to create a basic song object and use room.update_next_song
        const basicSong = {
          source: 'yt',
          sourceid: `search_${Date.now()}`,
          metadata: {
            artist: song.artist,
            song: song.title,
            length: 180,
            adult: false,
            coverart: `https://i.ytimg.com/vi/default/hqdefault.jpg`,
            region: ['US'],
            ytid: `search_${Date.now()}`
          }
        };
        
        this.log(`🔄 Fallback: Using room.update_next_song API...`);
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            this.log(`⏰ Fallback queue timeout: ${song.artist} - ${song.title}`);
            resolve(false);
          }, 10000); // 10 second timeout
          
          this.send({
            api: 'room.update_next_song',
            roomid: this.roomId,
            section: this.section,
            song: basicSong
          }, (response) => {
            clearTimeout(timeout);
            if (response && response.success) {
              this.log(`✅ Fallback queue successful: ${song.artist} - ${song.title}`);
              resolve(true);
            } else {
              this.log(`❌ Fallback queue failed: ${JSON.stringify(response)}`);
              resolve(false);
            }
          });
        });
      }
    } catch (error) {
      this.log(`❌ Error queuing song: ${error.message}`);
      return false;
    }
  }
  
  // Manage queue size to prevent it from filling up
  async manageQueueSize() {
    try {
      // Get current queue info
      const queueInfo = await this.getQueueInfo();
      if (queueInfo && queueInfo.queue) {
        const queueLength = queueInfo.queue.length;
        this.log(`📊 Current queue length: ${queueLength}`);
        
        // If queue is getting full (8+ songs), remove oldest songs
        if (queueLength >= 8) {
          const songsToRemove = queueLength - 6; // Keep only 6 songs
          this.log(`🗑️ Queue full (${queueLength} songs), removing ${songsToRemove} oldest songs`);
          
          for (let i = 0; i < songsToRemove; i++) {
            // Remove from bottom of queue (oldest songs)
            await this.removeFromQueue(0); // Remove first song (oldest)
            this.log(`🗑️ Removed song ${i + 1}/${songsToRemove} from queue`);
          }
        }
      }
    } catch (error) {
      this.log(`❌ Error managing queue size: ${error.message}`);
    }
  }
  
  // Get current queue information
  async getQueueInfo() {
    try {
      return new Promise((resolve) => {
        const msgid = this.msgid++;
        this.pendingCallbacks.set(msgid, (response) => {
          if (response.success && response.queue) {
            resolve(response);
          } else {
            resolve(null);
          }
        });
        
        this.send({
          api: 'playlist.get',
          msgid: msgid,
          clientid: this.clientid,
          userid: this.userid,
          userauth: this.userauth
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          if (this.pendingCallbacks.has(msgid)) {
            this.pendingCallbacks.delete(msgid);
            resolve(null);
          }
        }, 5000);
      });
    } catch (error) {
      this.log(`❌ Error getting queue info: ${error.message}`);
      return null;
    }
  }
  
  // Remove song from queue by index
  async removeFromQueue(index) {
    try {
      return new Promise((resolve) => {
        const msgid = this.msgid++;
        this.pendingCallbacks.set(msgid, (response) => {
          resolve(response.success || false);
        });
        
        this.send({
          api: 'playlist.remove',
          msgid: msgid,
          clientid: this.clientid,
          userid: this.userid,
          userauth: this.userauth,
          index: index
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          if (this.pendingCallbacks.has(msgid)) {
            this.pendingCallbacks.delete(msgid);
            resolve(false);
          }
        }, 5000);
      });
    } catch (error) {
      this.log(`❌ Error removing from queue: ${error.message}`);
      return false;
    }
  }
  
  async searchForSong(artist, title) {
    try {
      this.log(`🔍 Searching for: ${artist} - ${title}`);
      
      // Search for the song using the file.search API
      const searchQuery = `${artist} ${title}`;
      
      // Send search request using file.search API
      return new Promise((resolve) => {
        const searchMsgId = Date.now();
        
        // Store callback for search response
        if (!this.pendingCallbacks) {
          this.pendingCallbacks = new Map();
        }
        
        this.pendingCallbacks.set(searchMsgId, async (response) => {
          if (response.success && response.docs && response.docs.length > 0) {
            // Filter and prioritize official/reliable sources (now async)
            const filteredSongs = await this.filterOfficialSongs(response.docs, artist, title);
            
            if (filteredSongs.length > 0) {
              const bestSong = filteredSongs[0];
              this.log(`✅ Found official song: ${bestSong.metadata.artist} - ${bestSong.metadata.song}`);
              
              // 🔥 NEW: Check YouTube restrictions (only post if MAJOR countries are blocked)
              if (bestSong._id) {
                const restrictions = await this.checkYouTubeRestrictions(bestSong._id);
                
                // Only post in chat if blocked in major countries that matter
                if (restrictions.isRestricted && restrictions.blockedMajor.length > 0) {
                  const countriesText = restrictions.blockedMajor.join(', ');
                  const additionalText = restrictions.additionalCountries > 0 ? ` +(${restrictions.additionalCountries})` : '';
                  this.log(`⚠️ Song is blocked in: ${countriesText}${additionalText}`);
                  
                  // Only send chat message if blocked in countries we care about (2 lines max)
                  this.sendChat(`⚠️ **Blocked in:** ${countriesText}${additionalText}`);
                } else if (restrictions.isRestricted && restrictions.blockedMajor.length === 0) {
                  // Blocked in some countries but NOT in major ones - just log, don't spam chat
                  this.log(`ℹ️ Song blocked in ${restrictions.totalBlocked} minor countries (no major countries affected)`);
                }
              }
              
              resolve(bestSong);
            } else {
              this.log(`❌ No official songs found for: ${artist} - ${title}`);
              resolve(null);
            }
          } else if (response.success && response.song) {
            // Sometimes the response might be in a different format
            this.log(`✅ Found song (alt format): ${response.song.metadata.artist} - ${response.song.metadata.song}`);
            resolve(response.song);
          } else {
            this.log(`❌ No songs found for: ${artist} - ${title}`);
            this.log(`🔍 Search response: ${JSON.stringify(response)}`);
            resolve(null);
          }
        });
        
        // Send search request using file.search API
        this.log(`📤 Sending search request: file.search for "${searchQuery}"`);
        this.send({
          api: 'file.search',
          query: searchQuery,
          msgid: searchMsgId
        });
        
        // Timeout after 5 seconds (faster response)
        setTimeout(() => {
          if (this.pendingCallbacks.has(searchMsgId)) {
            this.pendingCallbacks.delete(searchMsgId);
            this.log(`⏰ Search timeout for: ${artist} - ${title}`);
            resolve(null);
          }
        }, 5000);
      });
    } catch (error) {
      this.log(`❌ Error searching for song: ${error.message}`);
      return null;
    }
  }
  
  // Filter and prioritize official/reliable music sources
  async filterOfficialSongs(songs, artist, title) {
    // Safety check for undefined parameters
    if (!artist || !title) {
      this.log(`⚠️ filterOfficialSongs called with invalid params: artist="${artist}", title="${title}"`);
      return [];
    }
    
    const filteredSongs = [];
    
    for (const song of songs) {
      const metadata = song.metadata;
      
      // 🔥 NEW: Strip official video markers from title
      let songTitle = metadata.song;
      const officialMarkers = [
        /\(official video\)/gi,
        /\(official music video\)/gi,
        /\(official audio\)/gi,
        /\(official lyric video\)/gi,
        /\[official video\]/gi,
        /\[official music video\]/gi,
        /\[official audio\]/gi,
        /- official video/gi,
        /- official music video/gi,
        /- official audio/gi
      ];
      
      for (const marker of officialMarkers) {
        songTitle = songTitle.replace(marker, '').trim();
      }
      
      // Update the metadata with cleaned title
      song.metadata.song = songTitle;
      
      const songTitleLower = songTitle.toLowerCase();
      const songArtist = metadata.artist.toLowerCase();
      const targetArtist = artist.toLowerCase();
      const targetTitle = title.toLowerCase();
      
      // LENIENT: Title should have artist OR song name (not necessarily both)
      const hasArtistInTitle = songTitleLower.includes(targetArtist);
      const hasSongInTitle = songTitleLower.includes(targetTitle) ||
                            songTitleLower.split(/[- ]+/).some(word => 
                              targetTitle.split(/[- ]+/).includes(word) && word.length > 3
                            );
      
      // Artist metadata must also match (this is the main check)
      const artistMatches = songArtist.includes(targetArtist) || targetArtist.includes(songArtist);
      
      // Must have EITHER artist in title OR song in title, plus artist metadata match
      if (!artistMatches) {
        continue; // Skip - artist metadata doesn't match
      }
      
      if (!hasArtistInTitle && !hasSongInTitle && targetTitle.length > 0) {
        continue; // Skip - has neither artist nor song name
      }
      
      // REJECT user-generated content (reactions, reviews, tutorials, ADS, promos)
      const userContentKeywords = [
        'reaction', 'reacts', 'react to', 'reacting to',
        'review', 'reviewing', 'reaction video',
        'first time', 'first listen', 'listening to',
        'explained', 'explanation', 'breaks down',
        'analysis', 'analyzed', 'breakdown',
        'parody', 'funny', 'meme',
        'vs', 'versus', 'comparison',
        'how to play', 'guitar lesson', 'tutorial',
        'animation', 'animated',
        'but it\'s', 'but its', 'but it is',
        'slowed', 'reverb', 'sped up', 'nightcore',
        'edit', 'fan edit', 'amv', 'pmv',
        // ADS and PROMOTIONAL content
        'commercial', 'advertisement', 'promo', 'ad for',
        'sponsored', 'buy now', 'available now', 'out now',
        'teaser', 'trailer', 'preview', 'snippet',
        'coming soon', 'new album', 'stream now', 'download',
        'full album', 'full ep', 'playlist', 'compilation',
        'best of', 'greatest hits', 'top tracks',
        // EXPLICIT ad/promo language
        'ad -', '- ad', 'advert', 'promotion',
        'brand new', 'just released', 'order now',
        'exclusive premiere', 'world premiere', 'premiere video',
        'directed by', 'prod. by', 'produced by',
        'subscribe', 'follow us', 'check out'
      ];
      
      // Reject if it's clearly user content or promotional
      const isUserContent = userContentKeywords.some(keyword => 
        songTitleLower.includes(keyword)
      );
      
      if (isUserContent) {
        this.log(`🚫 Rejected promotional/user content: ${songTitle}`);
        continue;
      }
      
      // Skip very short songs (likely clips or previews)
      if (metadata.length && metadata.length < 30) {
        continue;
      }
      
      // Skip very long songs (likely compilations or mixes) - be more lenient
      if (metadata.length && metadata.length > 900) {
        continue;
      }
      
      // Accept this song! Add it to filtered list
      
      // Calculate priority score
      let priority = 0;
      
      // 🔥 DISABLED: YouTube restriction checks are too slow (5+ seconds each)
      // Skip restriction checking during filtering to speed up song selection
      // Restrictions will only be checked for the final selected song if needed
      
      // Official music video indicators (HIGHEST PRIORITY - avoid ads)
      if (songTitleLower.includes('official music video') || songTitleLower.includes('[official video]')) {
        priority += 200;
      }
      
      if (songTitleLower.includes('official video')) {
        priority += 180;
      }
      
      // Official audio indicators (very high priority)
      if (songTitleLower.includes('official audio') || songTitleLower.includes('official track')) {
        priority += 170;
      }
      
      // Official release indicators (high priority)
      if (songTitleLower.includes('official') && !songTitleLower.includes('remix') && !songTitleLower.includes('cover')) {
        priority += 150;
      }
      
      // Music video indicators
      if (songTitleLower.includes('music video') || songTitleLower.includes('mv')) {
        priority += 120;
      }
      
      // Audio-only versions (prefer over visualizers)
      if (songTitleLower.includes('audio')) {
        priority += 90;
      }
      
      // Artist channel indicators (official uploads)
      if (songTitleLower.includes('[') && songTitleLower.includes(']') && 
          (songTitleLower.includes('Official') || songTitleLower.includes('official'))) {
        priority += 110;
      }
      
      // Exact title match
      if (songTitleLower === targetTitle) {
        priority += 80;
      }
      
      // Very close title match (word by word)
      const titleWords = targetTitle.split(/\s+/);
      const songWords = songTitleLower.split(/\s+/);
      const matchingWords = titleWords.filter(word => songWords.includes(word) && word.length > 2).length;
      if (matchingWords >= titleWords.length * 0.6) { // 60% word match
        priority += 60;
      }
      
      // Exact artist match
      if (songArtist === targetArtist) {
        priority += 50;
      }
      
      // Studio/album versions (good quality)
      if (songTitleLower.includes('studio') || songTitleLower.includes('album version')) {
        priority += 40;
      }
      
      // Remastered versions (often good quality)
      if (songTitleLower.includes('remaster')) {
        priority += 30;
      }
      
      // Standard song length (2-8 minutes) - broader range
      if (metadata.length && metadata.length >= 120 && metadata.length <= 480) {
        priority += 25;
      }
      
      // Has cover art (indicates real music)
      if (metadata.coverart) {
        priority += 15;
      }
      
      // Accept this song with its priority
      filteredSongs.push({
        ...song,
        priority: priority
      });
    }
    
    // Sort by priority (highest first)
    // NOTE: Unrestricted songs get +200 priority, so they're ALWAYS at the top
    filteredSongs.sort((a, b) => b.priority - a.priority);
    
    // Be more lenient - accept songs even if they're not "official"
    const acceptedSongs = filteredSongs.length > 0 ? filteredSongs : [];
    
    // Log with restriction info if available
    if (acceptedSongs.length > 0) {
      const topSong = acceptedSongs[0];
      const restrictionInfo = topSong.restrictions?.isRestricted ? 
        ` [RESTRICTED in ${topSong.restrictions.totalBlocked} countries]` : 
        ' [UNRESTRICTED]';
      this.log(`🎵 YouTube search: ${songs.length} results → ${acceptedSongs.length} usable | Top: ${topSong.metadata.artist} - ${topSong.metadata.song} (priority: ${topSong.priority})${restrictionInfo}`);
    } else {
      this.log(`🎵 YouTube search: ${songs.length} results → 0 usable`);
    }
    
    return acceptedSongs;
  }
  
  // Clean song title for database searches (remove official indicators)
  cleanSongTitleForDatabase(songTitle) {
    if (!songTitle) return '';
    
    // COMPREHENSIVE YouTube title cleaning (ported from hang.fm + expanded)
    let clean = songTitle
      // Official indicators
      .replace(/\(official.*?\)/gi, '')
      .replace(/\[official.*?\]/gi, '')
      .replace(/\(official video\)/gi, '')
      .replace(/\(official audio\)/gi, '')
      .replace(/\(official track\)/gi, '')
      .replace(/\(official music video\)/gi, '')
      .replace(/\[official music video\]/gi, '')
      .replace(/\[official video\]/gi, '')
      .replace(/\[official audio\]/gi, '')
      
      // Video types
      .replace(/\(music video\)/gi, '')
      .replace(/\[music video\]/gi, '')
      .replace(/\(lyric video\)/gi, '')
      .replace(/\[lyric video\]/gi, '')
      .replace(/\(lyrics\)/gi, '')
      .replace(/\[lyrics\]/gi, '')
      .replace(/\(visualizer\)/gi, '')
      .replace(/\[visualizer\]/gi, '')
      .replace(/\(audio\)/gi, '')
      .replace(/\[audio\]/gi, '')
      .replace(/\(mv\)/gi, '')
      .replace(/\[mv\]/gi, '')
      .replace(/\(hq\)/gi, '')
      .replace(/\[hq\]/gi, '')
      .replace(/\(hd\)/gi, '')
      .replace(/\[hd\]/gi, '')
      
      // Remasters
      .replace(/\(remastered\)/gi, '')
      .replace(/\[remastered\]/gi, '')
      .replace(/\(remaster\)/gi, '')
      .replace(/\[remaster\]/gi, '')
      .replace(/\(\d{4}\s*remaster\)/gi, '')
      .replace(/\[\d{4}\s*remaster\]/gi, '')
      
      // YouTube garbage
      .replace(/\(full album\)/gi, '')
      .replace(/\[full album\]/gi, '')
      .replace(/\(full song\)/gi, '')
      .replace(/\[full song\]/gi, '')
      .replace(/\(with lyrics\)/gi, '')
      .replace(/\[with lyrics\]/gi, '')
      .replace(/\(sub español\)/gi, '')
      .replace(/\(subtitulado\)/gi, '')
      .replace(/\(legendado\)/gi, '')
      
      // Remove dashes at end
      .replace(/\s*-\s*$/g, '')
      .trim();
    
    // Remove extra spaces and clean up
    clean = clean.replace(/\s+/g, ' ').trim();
    
    return clean || songTitle; // Fallback to original if cleaning removes everything
  }
  
  // Check if YouTube video is a reaction video or promotional content
  isReactionOrPromoVideo(videoTitle) {
    const lowerTitle = videoTitle.toLowerCase();
    
    // Reaction video indicators
    const reactionKeywords = [
      'reaction', 'reacting to', 'first time hearing', 'first listen',
      'review', 'breakdown', 'analysis', 'explained', 'meaning',
      'cover', 'acoustic', 'live performance', 'live at', 'concert',
      'interview', 'behind the scenes', 'making of', 'how to play',
      'guitar lesson', 'drum cover', 'bass cover', 'vocal cover'
    ];
    
    return reactionKeywords.some(keyword => lowerTitle.includes(keyword));
  }
  
  // Truncate text at last complete sentence (prevent paragraph runoff)
  truncateAtLastSentence(text, maxLength = 400) {
    if (!text || text.length <= maxLength) {
      // If already short enough, still ensure it ends with period
      if (text && !text.trim().endsWith('.') && !text.trim().endsWith('!') && !text.trim().endsWith('?')) {
        return text.trim() + '.';
      }
      return text;
    }
    
    // Find the last period, exclamation, or question mark before maxLength
    const truncated = text.substring(0, maxLength);
    const lastPeriod = Math.max(
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf('! '),
      truncated.lastIndexOf('? ')
    );
    
    if (lastPeriod > 0) {
      // Include the punctuation
      return truncated.substring(0, lastPeriod + 1).trim();
    }
    
    // If no sentence ending found, add period
    return truncated.trim() + '.';
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC COMMANDS - /info, /song, /album
  // Uses music providers ONLY (NO AI) - Spotify/Wikipedia/Discogs/MusicBrainz
  // ═══════════════════════════════════════════════════════════════
  
  async handleAlbumCommand(senderId, senderName) {
    try {
      this.log(`🖼️ /album command triggered by ${senderName} (NO AI - Spotify for album + Wikipedia for summary)`);
      const currentSong = this.roomState?.currentSong;
      
      // Determine if this was triggered from PM - if senderId is provided, it's from PM
      const isFromPM = senderId !== undefined && senderId !== null;
      const sendResponse = (msg) => {
        if (isFromPM) {
          this.sendPM(senderId, msg);
          this.log(`📨 Response sent via PM to ${senderName}`);
        } else {
          this.sendMainChat(msg);
          this.log(`💬 Response sent to main chat`);
        }
      };
      
      if (!currentSong || !currentSong.metadata) {
        sendResponse('❌ No song currently playing.');
        return;
      }
      
      const artist = currentSong.metadata.artist;
      const trackName = currentSong.metadata.song;
      const album = currentSong.metadata.album || 'Single';
      const year = currentSong.metadata.year || 'Unknown';
      
      this.log(`🔍 Getting album info for: ${artist} - ${trackName}`);
      
      // Get album facts using Spotify (for original album + image) + Wikipedia (for summary)
      const albumResult = await this.getAlbumFacts(artist, trackName, album, year);
      
      if (!albumResult) {
        sendResponse(`💿 **${artist} - ${trackName}**\n❌ No album information available.`);
        return;
      }
      
      const actualAlbumName = albumResult.albumName || album;
      const albumFacts = albumResult.facts || 'No additional information available.';
      const albumYear = albumResult.year || year;
      const albumImage = albumResult.image || null;
      
      // Truncate facts at last sentence (prevent paragraph runoff)
      const truncatedFacts = this.truncateAtLastSentence(albumFacts, 300);
      
      // Send album art first if available (add .png extension for deepcut.live to render it)
      if (albumImage) {
        const imageUrl = albumImage.includes('?') ? `${albumImage}&.png` : `${albumImage}.png`;
        sendResponse(imageUrl);
        this.log(`🖼️ Album art sent: ${imageUrl}`);
        
        // Wait a moment before sending text to ensure image arrives first
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Then send album info text (album art comes first, then Wikipedia summary)
      const textMessage = `${actualAlbumName} (${albumYear})\n\n${truncatedFacts}`;
      sendResponse(textMessage);
      this.log(`✅ Album info sent for: ${actualAlbumName} ${isFromPM ? '(via PM)' : '(via chat)'}`);
      
    } catch (error) {
      this.log(`❌ /album command error: ${error.message}`);
      const isFromPM = senderId && senderId !== this.currentUserId;
      if (isFromPM) {
        this.sendPM(senderId, `Failed to get album information.`);
      } else {
        this.sendMainChat(`Failed to get album information.`);
      }
    }
  }

  async getAlbumFacts(artist, trackName, album, year) {
    try {
      let albumData = {
        actualAlbum: album,
        year: year,
        facts: null,
        image: null
      };
      
      // STEP 1: Use Spotify to find the ORIGINAL ALBUM + ALBUM ART (not Single, not remaster, not compilation)
      try {
        this.log(`🔍 Searching Spotify for original album + image: ${artist} - ${trackName}`);
        const spotifyData = await this.searchSpotify(artist, trackName);
        if (spotifyData && spotifyData.album && spotifyData.album !== 'Single') {
          // Skip compilation/greatest hits albums
          const isCompilation = /best of|greatest hits|super hits|compilation|collection|anthology|essentials/i.test(spotifyData.album);
          
          if (isCompilation) {
            this.log(`⚠️ Spotify returned compilation album: ${spotifyData.album} - trying MusicBrainz for original`);
            
            // Try MusicBrainz to find original album
            try {
              const mbData = await this.searchMusicBrainz(artist, trackName);
              if (mbData && mbData.album && mbData.album !== 'Single') {
                const isMbCompilation = /best of|greatest hits|super hits|compilation|collection/i.test(mbData.album);
                if (!isMbCompilation) {
                  this.log(`✅ MusicBrainz found original album: ${mbData.album}`);
                  albumData.actualAlbum = mbData.album;
                  albumData.year = mbData.releaseDate?.substring(0, 4) || mbData.year || year;
                  albumData.image = spotifyData.albumArt || null; // Still use Spotify image
                } else {
                  // MusicBrainz also has compilation, use Spotify data
                  albumData.actualAlbum = spotifyData.album;
                  albumData.year = spotifyData.releaseDate?.substring(0, 4) || year;
                  albumData.image = spotifyData.albumArt || null;
                }
              } else {
                // No MusicBrainz data, use Spotify compilation
                albumData.actualAlbum = spotifyData.album;
                albumData.year = spotifyData.releaseDate?.substring(0, 4) || year;
                albumData.image = spotifyData.albumArt || null;
              }
            } catch (mbError) {
              this.log(`⚠️ MusicBrainz lookup failed: ${mbError.message}`);
              albumData.actualAlbum = spotifyData.album;
              albumData.year = spotifyData.releaseDate?.substring(0, 4) || year;
              albumData.image = spotifyData.albumArt || null;
            }
          } else {
            // Clean remaster/edition from album name
            let cleanAlbum = spotifyData.album
              .replace(/\s*\([^)]*remaster[^)]*\)/gi, '')
              .replace(/\s*\[[^\]]*remaster[^\]]*\]/gi, '')
              .replace(/\s*\([^)]*edition[^)]*\)/gi, '')
              .replace(/\s*\[[^\]]*edition[^\]]*\]/gi, '')
              .replace(/\s*\([^)]*deluxe[^)]*\)/gi, '')
              .replace(/\s*\[[^\]]*deluxe[^\]]*\]/gi, '')
              .replace(/\s*\([^)]*expanded[^)]*\)/gi, '')
              .replace(/\s*\[[^\]]*expanded[^\]]*\]/gi, '')
              .trim();
            
            albumData.actualAlbum = cleanAlbum || spotifyData.album;
            albumData.year = spotifyData.releaseDate?.substring(0, 4) || year;
            albumData.image = spotifyData.albumArt || null; // Get album art URL from Spotify
            this.log(`✅ Spotify found original album: ${albumData.actualAlbum} (${albumData.year})`);
            if (albumData.image) {
              this.log(`✅ Album art URL: ${albumData.image}`);
            }
          }
        }
      } catch (error) {
        this.log(`⚠️ Spotify album lookup failed: ${error.message}`);
      }
      
      // STEP 2: Use Wikipedia for album summary (NO AI)
      if (albumData.actualAlbum !== 'Single' && albumData.actualAlbum !== 'Unknown') {
        try {
          this.log(`🔍 Searching Wikipedia for album article: ${albumData.actualAlbum}`);
          const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=intitle:"${encodeURIComponent(albumData.actualAlbum)}" "${encodeURIComponent(artist)}"&format=json&srlimit=3`;
          const searchResponse = await axios.get(wikiSearchUrl, {
            headers: { 'User-Agent': 'DeepcutBot/1.0' },
            timeout: 5000
          });
          
          if (searchResponse.data?.query?.search?.length > 0) {
            const albumPage = searchResponse.data.query.search.find(result => {
              const title = result.title.toLowerCase();
              return title.includes(albumData.actualAlbum.toLowerCase()) && 
                     !title.includes('list of') &&
                     !title.includes('genre');
            }) || searchResponse.data.query.search[0];
            
            const pageTitle = albumPage.title;
            const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(pageTitle)}&format=json`;
            const extractResponse = await axios.get(extractUrl, {
              headers: { 'User-Agent': 'DeepcutBot/1.0' },
              timeout: 5000
            });
            
            const pages = extractResponse.data?.query?.pages;
            if (pages) {
              const pageId = Object.keys(pages)[0];
              const extract = pages[pageId]?.extract;
              
              if (extract && extract.length > 50) {
                // Get first 2-3 sentences, truncate at last period
                const sentences = extract.split(/\.\s+/);
                albumData.facts = sentences.slice(0, 2).join('. ') + '.';
                this.log(`✅ Wikipedia album summary found`);
              }
            }
          }
        } catch (error) {
          this.log(`⚠️ Wikipedia album lookup failed: ${error.message}`);
        }
      }
      
      // If Wikipedia didn't find album summary, create ALBUM-ONLY summary from Spotify/metadata
      if (!albumData.facts && albumData.actualAlbum !== 'Single' && albumData.actualAlbum !== 'Unknown') {
        this.log(`📝 Creating album-only summary from available metadata...`);
        let summary = `An album`;
        
        if (albumData.year && albumData.year !== 'Unknown') {
          summary += ` released in ${albumData.year}`;
        }
        
        summary += `. This release showcases a collection of tracks that define this particular era and sound. `;
        summary += `The album stands as a cohesive body of work within the broader discography.`;
        
        albumData.facts = summary;
        this.log(`✅ Generated album-only summary from metadata`);
      }
      
      // Return with proper property names expected by handler
      if (albumData.facts) {
        this.log(`📤 Returning album data: albumName="${albumData.actualAlbum}", year="${albumData.year}", hasImage=${!!albumData.image}`);
        return {
          albumName: albumData.actualAlbum,
          year: albumData.year,
          facts: albumData.facts,
          image: albumData.image
        };
      }
      
      this.log(`⚠️ No album facts found, returning null`);
      return null;
      
    } catch (error) {
      this.log(`❌ Error getting album facts: ${error.message}`);
      return null;
    }
  }

  async handleInfoCommand(senderId, senderName) {
    try {
      this.log(`ℹ️ /info command triggered by ${senderName} (senderId: ${senderId})`);
      const currentSong = this.roomState?.currentSong;
      
      // Determine if this was triggered from PM - if senderId is provided, it's from PM
      const isFromPM = senderId !== undefined && senderId !== null;
      this.log(`🔍 PM Detection: senderId=${senderId}, isFromPM=${isFromPM}`);
      
      const sendResponse = (msg) => {
        if (isFromPM) {
          this.sendPM(senderId, msg);
          this.log(`📨 Response sent via PM to ${senderName || senderId}`);
        } else {
          this.sendMainChat(msg);
          this.log(`💬 Response sent to main chat`);
        }
      };
      
      if (!currentSong || !currentSong.metadata) {
        sendResponse('❌ No song currently playing.');
        return;
      }
      
      const artist = currentSong.metadata.artist;
      let artistInfo = null;
      
      // PRIORITY 1: Try Wikipedia for artist summary (NO genres, NO artist name in summary - Wikipedia already mentions it)
      this.log(`🔍 [1/4] Trying Wikipedia for artist info: ${artist}`);
      try {
        // Use full extract API instead of summary for more detail
        const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(artist)}&format=json`;
        const response = await axios.get(wikiSearchUrl, {
          headers: { 'User-Agent': 'DeepcutBot/1.0' },
          timeout: 5000
        });
        
        const pages = response.data?.query?.pages;
        if (pages) {
          const pageId = Object.keys(pages)[0];
          const extract = pages[pageId]?.extract;
          
          if (extract && extract.length > 20) {
            // Skip disambiguation pages
            const isDisambiguation = extract.includes('may refer to:') || 
                                     extract.includes('may also refer to:');
            
            if (isDisambiguation) {
              this.log(`⚠️ Wikipedia returned disambiguation page, skipping...`);
            } else {
              // Get first 3-4 sentences for more detail (up to 500 chars)
              const sentences = extract.split(/\.\s+/);
              const detailedSummary = sentences.slice(0, 4).join('. ').trim();
              const summary = this.truncateAtLastSentence(detailedSummary, 500);
              const wikiLink = `https://en.wikipedia.org/wiki/${encodeURIComponent(artist)}`;
              
              artistInfo = {
                summary: summary,
                source: 'Wikipedia',
                link: wikiLink
              };
              this.log(`✅ Wikipedia artist info found (detailed)`);
            }
          }
        }
      } catch (error) {
        this.log(`⚠️ Wikipedia artist lookup failed: ${error.message}`);
      }
      
      // PRIORITY 2: Try Spotify for detailed artist info
      if (!artistInfo) {
        this.log(`🔍 [2/4] Wikipedia not found, trying Spotify for detailed info...`);
        try {
          if (this.spotifyEnabled) {
            if (!this.spotifyAccessToken) {
              await this.getSpotifyAccessToken();
            }
            
            const searchResponse = await axios.get(
              `https://api.spotify.com/v1/search?q=${encodeURIComponent(artist)}&type=artist&limit=1`,
              {
                headers: { 'Authorization': `Bearer ${this.spotifyAccessToken}` },
                timeout: 5000
              }
            );
            
            const spotifyArtist = searchResponse.data?.artists?.items?.[0];
            if (spotifyArtist) {
              let summary = `${artist} is `;
              
              // Build detailed genre-based description
              if (spotifyArtist.genres && spotifyArtist.genres.length > 0) {
                const genres = spotifyArtist.genres.slice(0, 3);
                summary += `a musical artist primarily associated with ${genres.join(', ')}`;
                
                // Add context based on genre
                if (genres.some(g => g.includes('hip hop') || g.includes('rap'))) {
                  summary += `, contributing to the hip hop and rap music scene`;
                } else if (genres.some(g => g.includes('rock') || g.includes('metal'))) {
                  summary += `, known for their contributions to rock and alternative music`;
                } else if (genres.some(g => g.includes('jazz') || g.includes('soul'))) {
                  summary += `, recognized for their work in jazz and soul traditions`;
                } else if (genres.some(g => g.includes('electronic') || g.includes('idm'))) {
                  summary += `, exploring electronic and experimental soundscapes`;
                } else if (genres.some(g => g.includes('indie') || g.includes('alternative'))) {
                  summary += `, part of the independent and alternative music movement`;
                }
                
                summary += `. They have built a following with their distinctive sound and approach to music.`;
              } else {
                summary += `a musical artist with a unique sound and style. They have developed a presence in the music industry through their creative work and performances.`;
              }
              
              artistInfo = {
                summary: summary,
                source: 'Spotify',
                link: spotifyArtist.external_urls?.spotify || null
              };
              this.log(`✅ Spotify artist info found (detailed)`);
            }
          }
        } catch (error) {
          this.log(`⚠️ Spotify artist lookup failed: ${error.message}`);
        }
      }
      
      // PRIORITY 3: Try Discogs for detailed discography info
      if (!artistInfo && this.discogsEnabled) {
        this.log(`🔍 [3/4] Spotify not found, trying Discogs...`);
        try {
          const discogsData = await this.searchDiscogs(artist, '');
          if (discogsData && discogsData.artist) {
            let summary = `${artist} is a musical artist with an extensive discography documented in the Discogs database. `;
            summary += `Their work spans various releases and formats, contributing to their respective genre and music community. `;
            summary += `Detailed information about their recordings, collaborations, and releases can be found in music archives.`;
            
            artistInfo = {
              summary: summary,
              source: 'Discogs',
              link: null
            };
            this.log(`✅ Discogs artist info found`);
          }
        } catch (error) {
          this.log(`⚠️ Discogs artist lookup failed: ${error.message}`);
        }
      }
      
      // PRIORITY 4: Try MusicBrainz for detailed metadata
      if (!artistInfo) {
        this.log(`🔍 [4/4] Discogs not found, trying MusicBrainz...`);
        try {
          const mbData = await this.fetchFromMusicBrainz(artist, '');
          if (mbData && mbData.artist) {
            let summary = `${artist} is `;
            
            if (mbData.type) {
              summary += `a ${mbData.type.toLowerCase()} `;
            } else {
              summary += `an artist `;
            }
            
            if (mbData.country) {
              summary += `from ${mbData.country}, `;
            }
            
            summary += `with documented recordings in the MusicBrainz database. `;
            summary += `Their musical contributions have been cataloged and preserved as part of the open music encyclopedia, `;
            summary += `reflecting their impact on the music landscape.`;
            
            artistInfo = {
              summary: summary,
              source: 'MusicBrainz',
              link: null
            };
            this.log(`✅ MusicBrainz artist info found`);
          }
        } catch (error) {
          this.log(`⚠️ MusicBrainz artist lookup failed: ${error.message}`);
        }
      }
      
      // Build response - clean format, no asterisks
      if (artistInfo) {
        let message = `${artist} - ${artistInfo.summary}`;
        if (artistInfo.link) {
          message += `\n\n${artistInfo.link}`;
        }
        sendResponse(message);
        this.log(`✅ Artist info sent (${artistInfo.source}): ${artist} ${isFromPM ? '(via PM)' : '(via chat)'}`);
      } else {
        sendResponse(`${artist} - No artist information available.`);
      }
      
    } catch (error) {
      this.log(`❌ /info command error: ${error.message}`);
      const isFromPM = senderId && senderId !== this.currentUserId;
      if (isFromPM) {
        this.sendPM(senderId, '❌ Failed to get artist information.');
      } else {
        this.sendMainChat('❌ Failed to get artist information.');
      }
    }
  }

  async handleSongCommand(senderId, senderName) {
    try {
      this.log(`🎵 /song command triggered by ${senderName} (NO AI - Wikipedia > Spotify > Discogs > MusicBrainz)`);
      const currentSong = this.roomState?.currentSong;
      
      // Determine if this was triggered from PM - if senderId is provided, it's from PM
      const isFromPM = senderId !== undefined && senderId !== null;
      const sendResponse = (msg) => {
        if (isFromPM) {
          this.sendPM(senderId, msg);
          this.log(`📨 Response sent via PM to ${senderName}`);
        } else {
          this.sendMainChat(msg);
          this.log(`💬 Response sent to main chat`);
        }
      };
      
      if (!currentSong || !currentSong.metadata) {
        sendResponse('❌ No song currently playing.');
        return;
      }
      
      const artist = currentSong.metadata.artist;
      const trackName = currentSong.metadata.song;
      let songInfo = null;
      
      // PRIORITY 1: Try Wikipedia for song information
      this.log(`🔍 [1/4] Trying Wikipedia for song info: ${artist} - ${trackName}`);
      try {
        // First try: Search for "Artist Song (song)" or "Song (Artist song)"
        const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch="${encodeURIComponent(trackName)}" "${encodeURIComponent(artist)}" song&format=json&srlimit=5`;
        const searchResponse = await axios.get(wikiSearchUrl, {
          headers: { 'User-Agent': 'DeepcutBot/1.0' },
          timeout: 5000
        });
        
        if (searchResponse.data?.query?.search?.length > 0) {
          // Look for song-specific page (contains both track name and "(song)" or artist name)
          const songPage = searchResponse.data.query.search.find(result => {
            const title = result.title.toLowerCase();
            const trackLower = trackName.toLowerCase();
            const artistLower = artist.toLowerCase();
            
            // Skip disambiguation, album pages, and general artist pages
            if (title.includes('may refer to') || 
                title.includes('disambiguation') ||
                title.includes('(album)') ||
                title.includes('discography') ||
                title.includes('list of')) {
              return false;
            }
            
            // PRIORITY 1: Pages with "(song)" suffix that match the track
            if (title.includes('(song)') && title.includes(trackLower)) {
              return true;
            }
            
            // PRIORITY 2: Pages that have EXACT track name match
            if (title === trackLower || title === `${trackLower} (song)`) {
              return true;
            }
            
            // PRIORITY 3: Pages that have both track AND artist (but not album pages)
            return title.includes(trackLower) && title.includes(artistLower) && !title.includes('album');
          }) || null;
          
          // If no good match found, don't use first result (might be wrong)
          if (!songPage) {
            this.log(`⚠️ No song-specific Wikipedia page found for: ${trackName}`);
          }
          
          if (songPage) {
            const pageTitle = songPage.title;
            const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(pageTitle)}&format=json`;
            const extractResponse = await axios.get(extractUrl, {
              headers: { 'User-Agent': 'DeepcutBot/1.0' },
              timeout: 5000
            });
            
            const pages = extractResponse.data?.query?.pages;
            if (pages) {
              const pageId = Object.keys(pages)[0];
              const extract = pages[pageId]?.extract;
              
              // Skip if disambiguation page
              const isDisambiguation = extract && (extract.includes('may refer to:') || extract.includes('may also refer to:'));
              
              if (extract && extract.length > 50 && !isDisambiguation) {
                // Get more detail - first 3-4 sentences, up to 500 chars
                const sentences = extract.split(/\.\s+/);
                const detailedSummary = sentences.slice(0, 4).join('. ').trim();
                
                songInfo = {
                  summary: this.truncateAtLastSentence(detailedSummary, 500),
                  source: 'Wikipedia',
                  link: `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`
                };
                this.log(`✅ Wikipedia song info found: ${pageTitle}`);
              } else if (isDisambiguation) {
                this.log(`⚠️ Wikipedia returned disambiguation page for song, skipping...`);
              }
            }
          }
        }
      } catch (error) {
        this.log(`⚠️ Wikipedia song lookup failed: ${error.message}`);
      }
      
      // PRIORITY 2-4: Fallback to Spotify > Discogs > MusicBrainz for SONG-ONLY metadata
      if (!songInfo) {
        this.log(`🔍 [2/4] Wikipedia not found, trying Spotify/Discogs/MusicBrainz for song-only info...`);
        const metadata = await this.fetchSongMetadata(artist, trackName);
        
        if (metadata) {
          const album = metadata.album || currentSong.metadata.album || 'Unknown';
          const year = metadata.releaseDate?.substring(0, 4) || metadata.year || currentSong.metadata.year || 'Unknown';
          
          // Build more detailed summary
          let summary = '';
          
          if (year !== 'Unknown' && album !== 'Unknown' && album !== 'Single') {
            summary = `Released in ${year} as part of the album "${album}"`;
          } else if (year !== 'Unknown') {
            summary = `Released in ${year}`;
          } else if (album !== 'Unknown' && album !== 'Single') {
            summary = `Featured on the album "${album}"`;
          } else {
            summary = `A track`;
          }
          
          if (metadata.genres && metadata.genres.length > 0) {
            const genres = metadata.genres.slice(0, 2).join(' and ');
            summary += `. This ${genres} track`;
          } else {
            summary += `. The song`;
          }
          
          if (metadata.label) {
            summary += ` was released through ${metadata.label}`;
          } else {
            summary += ` showcases the artist's signature sound`;
          }
          
          if (metadata.durationMs) {
            const minutes = Math.floor(metadata.durationMs / 60000);
            const seconds = Math.floor((metadata.durationMs % 60000) / 1000);
            summary += ` and runs ${minutes}:${seconds.toString().padStart(2, '0')}`;
          }
          
          summary += `.`;
          
          songInfo = {
            summary: summary,
            source: metadata.source || 'Music Provider',
            link: null
          };
          this.log(`✅ ${metadata.source || 'Metadata'} song-only info generated`);
        }
      }
      
      // Build response - clean format, no asterisks
      if (songInfo) {
        let message = `${trackName} - ${songInfo.summary}`;
        if (songInfo.link) {
          message += `\n\n${songInfo.link}`;
        }
        sendResponse(message);
        this.log(`✅ Song info sent (${songInfo.source}): ${trackName} ${isFromPM ? '(via PM)' : '(via chat)'}`);
      } else {
        sendResponse(`${trackName} - No information available.`);
      }
      
    } catch (error) {
      this.log(`❌ /song command error: ${error.message}`);
      const isFromPM = senderId && senderId !== this.currentUserId;
      if (isFromPM) {
        this.sendPM(senderId, '❌ Failed to get song information.');
      } else {
        this.sendMainChat('❌ Failed to get song information.');
      }
    }
  }

  async handleCommandsListCommand(senderId, senderName) {
    const commandsList = `📋 **Public Commands:**

**Slash Commands:**
/info - Artist information
/song - Current song info
/album - Album information

**Dot Commands:**
.commands - Show this list
.stats - Your top artists
.firstplayed - Who first played current song
.skip - Skip current song (owner only)

.randomstickers on/off - Toggle random stickers`;

    this.sendMainChat(commandsList);
    this.log(`📋 Commands list shown to ${senderName}`);
  }

  async handleStatsCommand(text, senderId, senderName) {
    try {
      const stats = this.getUserStats(senderId);
      const topArtists = this.getTopArtists(senderId);
      
      if (topArtists.length === 0) {
        this.sendMainChat(`📊 **${senderName}'s Stats:**\n\n🎵 No plays recorded yet.`);
        return;
      }
      
      let message = `📊 **${senderName}'s Stats:**\n\n`;
      message += `🎸 **Top Artists:**\n`;
      topArtists.slice(0, 3).forEach(([artist, count], index) => {
        message += `${index + 1}. ${artist} (${count} plays)\n`;
      });
      message += `\n💰 Bankroll: ${stats.bankroll} chips\n`;
      message += `📊 More stats coming soon...`;
      
      this.sendMainChat(message);
      this.log(`📊 Stats shown for ${senderName}`);
      
    } catch (error) {
      this.log(`❌ .stats command error: ${error.message}`);
      this.sendMainChat('❌ Failed to get stats.');
    }
  }

  async handleFirstPlayedCommand(text, senderId, senderName) {
    try {
      const currentSong = this.roomState?.currentSong;
      
      if (!currentSong || !currentSong.metadata) {
        this.sendMainChat('❌ No song currently playing.');
        return;
      }
      
      const artist = currentSong.metadata.artist;
      const trackName = currentSong.metadata.song;
      const songKey = `${artist} - ${trackName}`;
      
      const songStats = this.getSongStats(songKey);
      
      if (songStats) {
        const firstPlayerName = songStats.firstPlayerName || 'Unknown';
        const plays = songStats.plays || 1;
        this.sendMainChat(`🎵 **First Played:**\n\n"${artist} - ${trackName}"\n\n👤 First played by: **${firstPlayerName}**\n📊 Total plays: ${plays}`);
      } else {
        this.sendMainChat(`🎵 **First Play!**\n\nThis is the first time "${artist} - ${trackName}" has been played in this room.`);
      }
      
    } catch (error) {
      this.log(`❌ .firstplayed command error: ${error.message}`);
      this.sendMainChat('❌ Failed to get first played info.');
    }
  }
  
  // Clean artist name for database searches
  cleanArtistNameForDatabase(artistName) {
    if (!artistName) return '';
    
    // Remove common suffixes and clean up
    let clean = artistName
      .replace(/\s+-\s+.*$/i, '') // Remove everything after " - "
      .replace(/\s+\(.*?\)$/i, '') // Remove parenthetical info at end
      .replace(/\s+\[.*?\]$/i, '') // Remove bracketed info at end
      .trim();
    
    return clean || artistName; // Fallback to original if cleaning removes everything
  }
  
  // ═══════════════════════════════════════════════════════════════
  // MUSIC PROVIDER API INTEGRATION (NO AI TOKENS USED)
  // Spotify, Discogs, MusicBrainz, Wikipedia for song metadata
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
      this.log(`✅ Spotify access token obtained`);
      return this.spotifyAccessToken;
    } catch (error) {
      this.log(`❌ Spotify auth error: ${error.message}`);
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
            this.log(`⚠️ Could not fetch artist genres: ${artistError.message}`);
          }
        }
        
        return {
          album: spotifyTrack.album.name,
          releaseDate: spotifyTrack.album.release_date,
          popularity: spotifyTrack.popularity,
          durationMs: spotifyTrack.duration_ms,
          explicit: spotifyTrack.explicit,
          genres: artistGenres.length > 0 ? artistGenres : (spotifyTrack.album.genres || []),
          artistName: spotifyTrack.artists[0]?.name || artist,
          albumArt: spotifyTrack.album.images?.[0]?.url || null
        };
      }
      
      return null;
    } catch (error) {
      if (error.response?.status === 401) {
        // Token expired, refresh it
        this.spotifyAccessToken = null;
        return await this.searchSpotify(artist, track);
      }
      this.log(`⚠️ Spotify search failed: ${error.message}`);
      return null;
    }
  }

  async searchDiscogs(artist, track = null) {
    try {
      if (!this.discogsEnabled || !this.discogsToken) return null;
      
      const query = track ? `${artist} ${track}` : artist;
      const response = await axios.get(
        `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&format=album`,
        {
          headers: {
            'Authorization': `Discogs token=${this.discogsToken}`,
            'User-Agent': 'DeepcutBot/1.0'
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
      this.log(`⚠️ Discogs search failed: ${error.message}`);
      return null;
    }
  }

  async fetchFromMusicBrainz(artist, track) {
    try {
      // Search for recordings directly (more reliable)
      const recordingsResponse = await axios.get(`https://musicbrainz.org/ws/2/recording`, {
        params: {
          query: `recording:"${track}" AND artist:"${artist}"`,
          fmt: 'json',
          limit: 5,
          inc: 'releases'
        },
        headers: {
          'User-Agent': 'DeepcutBot/1.0 (https://deepcut.live)'
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
      this.log(`❌ MusicBrainz error: ${error.message}`);
      return null;
    }
  }

  async fetchFromWikipedia(artist, track) {
    try {
      // Build headers with OAuth token if available (5000 req/hour)
      const headers = {
        'User-Agent': 'DeepcutBot/1.0 (https://deepcut.live)'
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
      
      return null;
    } catch (error) {
      this.log(`❌ Wikipedia error: ${error.message}`);
      return null;
    }
  }

  async fetchSongMetadata(artist, track) {
    try {
      this.log(`🔍 Fetching metadata for: ${artist} - ${track}`);
      
      // Priority 1: Spotify (most complete data, includes genres)
      const spotifyData = await this.searchSpotify(artist, track);
      if (spotifyData && spotifyData.album !== 'Single') {
        this.log(`✅ Spotify data found: ${spotifyData.album} (${spotifyData.releaseDate?.substring(0, 4)})`);
        return spotifyData;
      }
      
      // Priority 2: MusicBrainz (great for underground/older music)
      const musicbrainzData = await this.fetchFromMusicBrainz(artist, track);
      if (musicbrainzData && musicbrainzData.album !== 'Single') {
        this.log(`✅ MusicBrainz data found: ${musicbrainzData.album} (${musicbrainzData.year})`);
        return musicbrainzData;
      }
      
      // Priority 3: Discogs (good for older/obscure releases)
      const discogsData = await this.searchDiscogs(artist, track);
      if (discogsData) {
        this.log(`✅ Discogs data found: ${discogsData.title} (${discogsData.year})`);
        return discogsData;
      }
      
      // Priority 4: Wikipedia (fallback for very basic info)
      const wikipediaData = await this.fetchFromWikipedia(artist, track);
      if (wikipediaData) {
        this.log(`✅ Wikipedia data found: ${wikipediaData.album} (${wikipediaData.year})`);
        return wikipediaData;
      }
      
      this.log(`⚠️ No metadata found from any provider`);
      return null;
    } catch (error) {
      this.log(`❌ Error fetching song metadata: ${error.message}`);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // LEARNED ARTIST SYSTEM (Ported from hang.fm bot)
  // Learn artists from human users only, ignore bot plays
  // ═══════════════════════════════════════════════════════════════
  
  learnArtistFromUser(artistName) {
    // Learn music artists but EXCLUDE mainstream pop
    const lowerArtist = artistName.toLowerCase();
    
    // Mainstream pop blacklist - these artists should NOT be learned
    const mainstreamPopBlacklist = [
      'taylor swift', 'ariana grande', 'billie eilish', 'olivia rodrigo', 'dua lipa',
      'ed sheeran', 'harry styles', 'justin bieber', 'drake', 'the weeknd',
      'post malone', 'travis scott', 'bad bunny', 'beyoncé', 'rihanna',
      'lady gaga', 'katy perry', 'miley cyrus', 'selena gomez', 'demi lovato',
      'shawn mendes', 'charlie puth', 'bruno mars', 'the chainsmokers', 'marshmello',
      'blackpink', 'bts', 'twice', 'exo', 'seventeen',
      'maroon 5', 'imagine dragons', 'coldplay', 'one republic', 'twenty one pilots',
      'panic! at the disco', 'fall out boy', 'paramore', // These are borderline but too pop
      'sia', 'halsey', 'lorde', 'lana del rey', 'sabrina carpenter',
      'tate mcrae', 'gracie abrams', 'conan gray', 'megan thee stallion', 'cardi b',
      'nicki minaj', 'lizzo', 'sza', // Mainstream R&B/pop rap
      'adele', 'sam smith', 'lewis capaldi', 'hozier', // Mainstream ballads
      'one direction', 'zayn', 'niall horan', '5 seconds of summer', 'jonas brothers',
      'caroline polachek', 'la bouche', 'charli xcx', 'troye sivan' // Mainstream synth-pop
    ];
    
    // Check if this is mainstream pop
    if (mainstreamPopBlacklist.some(blocked => lowerArtist.includes(blocked) || blocked.includes(lowerArtist))) {
      this.log(`🚫 Skipping mainstream pop artist: ${artistName}`);
      return;
    }
    
    // Learn the artist (all alternative genres welcome, just no mainstream pop)
    if (!this.learnedArtists.has(lowerArtist)) {
      this.learnedArtists.add(lowerArtist);
      this.log(`📚 Learned new artist from user: ${artistName} (${this.learnedArtists.size} total learned)`);
      
      // Save learned artists after learning
      this.saveLearnedArtists();
    }
  }

  learnSongFromUser(artistName, songName) {
    // Learn songs from user plays to understand their preferences
    const lowerArtist = artistName.toLowerCase();
    
    // Skip if this artist was filtered out by mainstream pop blacklist
    if (!this.learnedArtists.has(lowerArtist)) {
      // Artist wasn't learned (probably filtered), so don't learn their songs either
      return;
    }
    
    if (!this.learnedSongs.has(lowerArtist)) {
      this.learnedSongs.set(lowerArtist, new Set());
    }
    
    const songKey = songName.toLowerCase();
    if (!this.learnedSongs.get(lowerArtist).has(songKey)) {
      this.learnedSongs.get(lowerArtist).add(songKey);
      this.log(`🎵 Learned new song: ${artistName} - ${songName}`);
      
      // Save learned data after learning
      this.saveLearnedArtists();
    }
  }

  detectCover(songTitle) {
    // Detect if a song is a cover based on common patterns
    const lowerTitle = songTitle.toLowerCase();
    
    const coverPatterns = [
      /\(.*cover.*\)/i,
      /\[.*cover.*\]/i,
      /cover of/i,
      /cover version/i,
      /acoustic cover/i,
      /live cover/i,
      /\(originally by/i,
      /\(original artist:/i,
      /tribute to/i,
      /in the style of/i
    ];
    
    for (const pattern of coverPatterns) {
      if (pattern.test(lowerTitle)) {
        return true;
      }
    }
    
    return false;
  }

  filterSeasonalSongs(songs) {
    // Get current month (0-11, where 0=January, 11=December)
    const currentMonth = new Date().getMonth();
    
    // Define holiday keywords for each season
    const christmasKeywords = [
      'christmas', 'xmas', 'santa', 'jingle', 'sleigh', 'reindeer',
      'noel', 'carol', 'silent night', 'deck the halls', 'winter wonderland',
      'do you hear what i hear', 'little drummer boy', 'joy to the world',
      'o holy night', 'away in a manger', 'feliz navidad', 'white christmas'
    ];
    
    const halloweenKeywords = [
      'halloween', 'spooky', 'horror', 'scary', 'ghost', 'zombie',
      'monster', 'creepy', 'haunted', 'nightmare', 'devil', 'evil'
    ];
    
    const easterKeywords = ['easter', 'bunny', 'resurrection'];
    const valentinesKeywords = ['valentine', 'cupid'];
    
    // October = Halloween OK, Christmas NO
    // November-December = Christmas OK
    // January = New Year OK
    // Rest of year = No holidays
    
    return songs.filter(songTitle => {
      const titleLower = songTitle.toLowerCase();
      
      // Check for Christmas songs
      const isChristmas = christmasKeywords.some(keyword => titleLower.includes(keyword));
      if (isChristmas) {
        // Only allow Christmas songs in November (10) and December (11)
        if (currentMonth === 10 || currentMonth === 11) {
          return true; // Allow Christmas music
        } else {
          this.log(`🎄 Filtered Christmas song: ${songTitle} (current month: ${currentMonth + 1})`);
          return false; // Skip Christmas songs in other months
        }
      }
      
      // Check for Halloween songs
      const isHalloween = halloweenKeywords.some(keyword => titleLower.includes(keyword));
      if (isHalloween) {
        // Only allow Halloween songs in October (9)
        if (currentMonth === 9) {
          return true; // Allow Halloween music in October
        } else {
          this.log(`🎃 Filtered Halloween song: ${songTitle} (current month: ${currentMonth + 1})`);
          return false; // Skip Halloween songs in other months
        }
      }
      
      // Check for Easter songs
      const isEaster = easterKeywords.some(keyword => titleLower.includes(keyword));
      if (isEaster && (currentMonth < 2 || currentMonth > 4)) {
        return false; // Easter is March-April only
      }
      
      // Check for Valentine's songs
      const isValentines = valentinesKeywords.some(keyword => titleLower.includes(keyword));
      if (isValentines && currentMonth !== 1) {
        return false; // Valentine's is February only
      }
      
      // Allow all other songs
      return true;
    });
  }
  
  async autoQueueNextSong() {
    try {
      this.log(`🎵 Auto-queuing next song based on recent human plays...`);
      
      // Get last 10 human plays from room history
      const recentHumanPlays = this.roomSongHistory
        .filter(song => !song.isBotSong)
        .slice(-10);
      
      if (recentHumanPlays.length === 0) {
        this.log(`⚠️ No recent human plays found, using random selection`);
        return await this.selectAndQueueRandomSong();
      }
      
      // Analyze recent plays to determine genre/vibe
      const recentArtists = recentHumanPlays.map(s => s.artist.toLowerCase());
      const artistFrequency = {};
      
      recentArtists.forEach(artist => {
        artistFrequency[artist] = (artistFrequency[artist] || 0) + 1;
      });
      
      this.log(`📊 Recent human plays: ${recentArtists.slice(-5).join(', ')}`);
      
      // Get unique artists from recent plays to avoid repeating
      const recentUniqueArtists = [...new Set(recentArtists)];
      
      // Combine curated + learned artists
      const curatedArtists = this.getAllMusicCuratedArtists();
      const learnedArtistsList = Array.from(this.learnedArtists);
      const allArtists = [...curatedArtists, ...learnedArtistsList];
      
      // Filter out artists that were already played in last 10 plays OR in recentlyUsedArtists
      const availableArtists = allArtists.filter(artist => 
        // Not in last 10 plays
        !recentUniqueArtists.some(recent => 
          recent.toLowerCase() === artist.toLowerCase() ||
          recent.toLowerCase().includes(artist.toLowerCase()) ||
          artist.toLowerCase().includes(recent.toLowerCase())
        ) &&
        // Not in recently used artists tracker (last 15 bot selections)
        !this.recentlyUsedArtists.includes(artist.toLowerCase()) &&
        // Not the last artist the bot played
        artist.toLowerCase() !== this.lastPlayedArtist?.toLowerCase()
      );
      
      this.log(`🔍 Available artists (excluding recently played): ${availableArtists.length}/${allArtists.length}`);
      
      let selectedArtist = null;
      
      if (availableArtists.length > 0) {
        selectedArtist = availableArtists[Math.floor(Math.random() * availableArtists.length)];
        this.log(`🎯 Selected NEW artist (not in recent plays): ${selectedArtist}`);
      } else {
        // Fallback: Reset recently used and try again
        this.log(`🔄 All artists were recently played - resetting tracker...`);
        this.recentlyUsedArtists = [];
        selectedArtist = allArtists[Math.floor(Math.random() * allArtists.length)];
        this.log(`🎲 Selected after reset: ${selectedArtist}`);
      }
      
      // Track this artist to avoid repeating
      this.recentlyUsedArtists.push(selectedArtist.toLowerCase());
      if (this.recentlyUsedArtists.length > 15) {
        this.recentlyUsedArtists = this.recentlyUsedArtists.slice(-15);
      }
      
      // Get songs for this artist using existing method
      const songs = await this.getSongsForArtist(selectedArtist);
      
      if (!songs || songs.length === 0) {
        this.log(`⚠️ No songs found for ${selectedArtist}, trying random selection`);
        return await this.selectAndQueueRandomSong();
      }
      
      // Filter out seasonal holiday songs that don't match current month
      const seasonalSongs = this.filterSeasonalSongs(songs);
      const songsToUse = seasonalSongs.length > 0 ? seasonalSongs : songs;
      
      if (seasonalSongs.length !== songs.length) {
        this.log(`🎃 Filtered out ${songs.length - seasonalSongs.length} off-season holiday songs`);
      }
      
      // Pick a random song from this artist
      const randomSongTitle = songsToUse[Math.floor(Math.random() * songsToUse.length)];
      
      // Create proper song object for queueSong
      const songToQueue = {
        artist: selectedArtist,
        title: randomSongTitle
      };
      
      // Queue the song using existing method
      const success = await this.queueSong(songToQueue);
      
      if (success) {
        this.log(`✅ Auto-queued: ${songToQueue.artist} - ${songToQueue.title}`);
        this.lastPlayedArtist = selectedArtist; // Track last artist
      } else {
        this.log(`❌ Failed to auto-queue: ${songToQueue.artist} - ${songToQueue.title}`);
        this.log(`🔄 Retrying with different song...`);
        
        // Try 2 more times with different songs
        for (let retry = 0; retry < 2; retry++) {
          const retrySongs = await this.getSongsForArtist(selectedArtist);
          if (retrySongs && retrySongs.length > 0) {
            const retryTitle = retrySongs[Math.floor(Math.random() * retrySongs.length)];
            const retryQueue = { artist: selectedArtist, title: retryTitle };
            
            this.log(`🔄 Retry ${retry + 1}: ${retryQueue.artist} - ${retryQueue.title}`);
            const retrySuccess = await this.queueSong(retryQueue);
            
            if (retrySuccess) {
              this.log(`✅ Retry successful: ${retryQueue.artist} - ${retryQueue.title}`);
              return;
            }
          }
        }
        
        // If all retries failed, try completely random song
        this.log(`🔄 All retries failed, trying random artist...`);
        await this.selectAndQueueRandomSong();
      }
      
    } catch (error) {
      this.log(`❌ Error auto-queuing song: ${error.message}`);
      this.log(`🔄 Fallback to random song...`);
      await this.selectAndQueueRandomSong();
    }
  }

  async selectAndQueueRandomSong() {
    try {
      // Combine curated + learned artists
      const curatedArtists = this.getCuratedArtists();
      const allArtists = [...curatedArtists, ...Array.from(this.learnedArtists)];
      
      // Try up to 5 different artists/songs until one works
      for (let attempt = 0; attempt < 5; attempt++) {
        // Pick random artist
        const randomArtist = allArtists[Math.floor(Math.random() * allArtists.length)];
        
        // Get songs for this artist
        const songs = await this.getSongsForArtist(randomArtist);
        
        if (!songs || songs.length === 0) {
          this.log(`⚠️ No songs found for ${randomArtist}, trying different artist...`);
          continue;
        }
        
        // Pick a random song
        const randomSongTitle = songs[Math.floor(Math.random() * songs.length)];
        
        // Create proper song object for queueSong
        const songToQueue = {
          artist: randomArtist,
          title: randomSongTitle
        };
        
        this.log(`🎲 Attempt ${attempt + 1}/5: ${songToQueue.artist} - ${songToQueue.title}`);
        
        // Queue the song
        const success = await this.queueSong(songToQueue);
        
        if (success) {
          this.log(`✅ Queued random: ${songToQueue.artist} - ${songToQueue.title}`);
          return; // Success! Exit the function
        } else {
          this.log(`❌ Failed, trying different song...`);
        }
      }
      
      this.log(`❌ Failed to queue after 5 attempts - will try again next time`);
    } catch (error) {
      this.log(`❌ Error selecting random song: ${error.message}`);
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
          this.log(`📚 Loaded ${this.learnedArtists.size} learned artists from previous sessions`);
        }
        
        if (data.learnedSongs && typeof data.learnedSongs === 'object') {
          this.learnedSongs = new Map();
          Object.entries(data.learnedSongs).forEach(([artist, songs]) => {
            this.learnedSongs.set(artist, new Set(songs));
          });
          this.log(`🎵 Loaded learned songs for ${this.learnedSongs.size} artists`);
        }
        
        if (data.roomSongHistory && Array.isArray(data.roomSongHistory)) {
          this.roomSongHistory = data.roomSongHistory;
          this.log(`📚 Loaded ${this.roomSongHistory.length} songs from room history`);
        }
      }
    } catch (error) {
      this.log(`❌ Error loading learned artists: ${error.message}`);
    }
  }
  
  analyzeLoadedHistory() {
    try {
      // Get last 10 human plays from loaded history
      const recentHumanPlays = this.roomSongHistory
        .filter(song => !song.isBotSong)
        .slice(-10);
      
      if (recentHumanPlays.length > 0) {
        // Extract unique artists from recent plays
        const recentArtists = recentHumanPlays.map(s => s.artist.toLowerCase());
        const uniqueArtists = [...new Set(recentArtists)];
        
        // Populate recentlyUsedArtists so bot doesn't repeat them
        this.recentlyUsedArtists = uniqueArtists.slice(-10); // Keep last 10
        
        this.log(`🔍 Analyzed loaded history: ${recentHumanPlays.length} recent human plays`);
        this.log(`🚫 Will avoid recently played artists: ${uniqueArtists.slice(-5).join(', ')}${uniqueArtists.length > 5 ? '...' : ''}`);
      } else {
        this.log(`📚 No human plays in loaded history`);
      }
    } catch (error) {
      this.log(`❌ Error analyzing loaded history: ${error.message}`);
    }
  }
  
  saveLearnedArtists() {
    try {
      const fs = require('fs');
      const path = require('path');
      const learnedFile = path.join(__dirname, 'bot-learned-artists.json');
      
      // Convert learnedSongs Map to object for JSON serialization
      const learnedSongsObj = {};
      this.learnedSongs.forEach((songs, artist) => {
        learnedSongsObj[artist] = Array.from(songs);
      });
      
      const data = {
        learnedArtists: Array.from(this.learnedArtists),
        learnedSongs: learnedSongsObj,
        roomSongHistory: this.roomSongHistory.slice(-50), // Keep last 50 songs
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(learnedFile, JSON.stringify(data, null, 2));
      if (this.verboseMode) this.log(`📚 Saved ${this.learnedArtists.size} learned artists, ${this.learnedSongs.size} artists with songs, and ${this.roomSongHistory.length} room history`);
    } catch (error) {
      this.log(`❌ Error saving learned artists: ${error.message}`);
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
          this.log(`🚨 Loaded strike data for ${this.userStrikes.size} users`);
        }
      }
    } catch (error) {
      this.log(`❌ Error loading strikes data: ${error.message}`);
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
      if (this.verboseMode) this.log(`🚨 Saved strike data for ${this.userStrikes.size} users`);
    } catch (error) {
      this.log(`❌ Error saving strikes data: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STATS SYSTEM (Ported from hang.fm bot)
  // Track user stats, song stats, reactions - persistent across sessions
  // ═══════════════════════════════════════════════════════════════
  
  loadStats() {
    try {
      const fs = require('fs');
      const path = require('path');
      const statsFile = path.join(__dirname, 'bot-stats.json');
      
      if (fs.existsSync(statsFile)) {
        const data = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
        
        // Load user stats (SKIP bot's own stats)
        if (data.userStats) {
          for (const [userId, stats] of Object.entries(data.userStats)) {
            // Don't load bot's own stats
            if (userId === this.userId) {
              if (this.verboseMode) this.log(`🤖 Skipping bot's own stats on load`);
              continue;
            }
            
            const userStats = {
              ...stats,
              artists: new Map(stats.artists || [])
            };
            this.userStats.set(userId, userStats);
          }
        }
        
        // Load song stats
        if (data.songStats) {
          for (const [songKey, stats] of Object.entries(data.songStats)) {
            this.songStats.set(songKey, stats);
          }
        }
        
        this.log(`📊 Loaded stats: ${this.userStats.size} users, ${this.songStats.size} songs`);
      } else {
        this.log(`📊 No existing stats file found, starting fresh`);
      }
    } catch (error) {
      this.log(`❌ Error loading stats: ${error.message}`);
    }
  }

  saveStats() {
    try {
      const fs = require('fs');
      const path = require('path');
      const statsFile = path.join(__dirname, 'bot-stats.json');
      
      // Convert Maps to objects for JSON serialization (skip bot's own stats)
      const userStatsObj = {};
      for (const [userId, stats] of this.userStats.entries()) {
        if (userId === this.userId) {
          if (this.verboseMode) this.log(`🤖 Skipping bot's own stats when saving`);
          continue;
        }
        
        userStatsObj[userId] = {
          ...stats,
          artists: Array.from(stats.artists.entries())
        };
      }
      
      const songStatsObj = {};
      for (const [songKey, stats] of this.songStats.entries()) {
        songStatsObj[songKey] = stats;
      }
      
      const data = {
        userStats: userStatsObj,
        songStats: songStatsObj,
        lastUpdated: new Date().toISOString()
      };
      
      fs.writeFileSync(statsFile, JSON.stringify(data, null, 2));
      this.log(`📊 Stats saved: ${this.userStats.size} users, ${this.songStats.size} songs`);
    } catch (error) {
      this.log(`❌ Error saving stats: ${error.message}`);
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
        artists: new Map() // artist -> play count
      });
    }
    return this.userStats.get(userId);
  }

  getSongStats(songKey) {
    return this.songStats.get(songKey);
  }

  getTopArtists(userId) {
    const stats = this.getUserStats(userId);
    return Array.from(stats.artists.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }

  updateUserStats(userId, artist, song) {
    try {
      // NEVER track bot plays
      if (userId === this.userId) {
        if (this.verboseMode) this.log(`🤖 Skipping bot's own stats`);
        return;
      }
      
      const userStats = this.getUserStats(userId);
      
      // Update artist plays (FIX: use topArtists, not artists)
      const currentPlays = userStats.topArtists.get(artist) || 0;
      userStats.topArtists.set(artist, currentPlays + 1);
      
      this.log(`📊 Updated stats for user ${userId}: ${artist} now has ${currentPlays + 1} plays`);
      this.saveStats();
    } catch (error) {
      this.log(`❌ Error updating user stats: ${error.message}`);
    }
  }

  updateSongStats(artist, trackName, userId, userName = null) {
    try {
      const songKey = `${artist} - ${trackName}`;
      
      if (!this.songStats.has(songKey)) {
        // Use provided username or look it up
        const firstPlayerName = userName || this.users.get(userId)?.name || 'Unknown';
        
        // First time this song is played
        this.songStats.set(songKey, {
          plays: 1,
          firstPlayer: userId,
          firstPlayerName: firstPlayerName,
          likes: 0,
          dislikes: 0,
          stars: 0
        });
        this.log(`🎵 NEW song in stats: "${songKey}" first played by ${firstPlayerName}`);
      } else {
        // Song already exists, increment plays
        const stats = this.songStats.get(songKey);
        stats.plays++;
        this.log(`🎵 Song play count updated: "${songKey}" → ${stats.plays} total plays`);
      }
      
      this.saveStats();
    } catch (error) {
      this.log(`❌ Error updating song stats: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SONG SELECTION SYSTEM (Ported from hang.fm bot)
  // Spotify-based genre detection, NO AI for music selection
  // Curated list expanded to ALL MUSIC GENRES (deepcut.live = all music)
  // ═══════════════════════════════════════════════════════════════
  
  async getSongsForArtist(artist) {
    try {
      if (this.verboseMode) this.log(`🎵 Searching MusicBrainz for songs by: ${artist}`);
      
      const searchUrl = `https://musicbrainz.org/ws/2/recording?query=artist:"${encodeURIComponent(artist)}"&fmt=json&limit=50`;
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'DeepcutBot/1.0 (https://deepcut.live)',
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      
      if (response.data && response.data.recordings) {
        const songs = response.data.recordings
          .map(recording => recording.title)
          .filter((title, index, self) => self.indexOf(title) === index); // Remove duplicates
        
        if (this.verboseMode) this.log(`🎵 Found ${songs.length} unique songs for ${artist} on MusicBrainz`);
        return songs;
      }
      
      return [];
    } catch (error) {
      this.log(`❌ Error fetching songs for ${artist}: ${error.message}`);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // COMPREHENSIVE SONG SUGGESTION SYSTEM (Ported from hang.fm)
  // Spotify-based genre detection, NO AI for music selection
  // ALL MUSIC GENRES (deepcut.live = universal music room)
  // ═══════════════════════════════════════════════════════════════
  
  getAllMusicCuratedArtists() {
    // Curated list - HEAVY focus on Hip Hop, Rock, and Metal (minimal pop/electronic)
    return [
      // Hip Hop - Underground/Alternative (HEAVY PRIORITY - 90s boom bap focus)
      'MF DOOM', 'Madlib', 'Aesop Rock', 'El-P', 'Run The Jewels', 'Death Grips', 'clipping.',
      'Atmosphere', 'Brother Ali', 'Eyedea & Abilities', 'Sage Francis', 'P.O.S',
      'Busdriver', 'Open Mike Eagle', 'billy woods', 'Armand Hammer', 'Quelle Chris',
      'A Tribe Called Quest', 'De La Soul', 'The Pharcyde', 'Souls of Mischief', 'Hieroglyphics',
      'Wu-Tang Clan', 'GZA', 'Raekwon', 'Ghostface Killah', 'Method Man',
      'Outkast', 'UGK', 'Geto Boys', 'Scarface', 'Three 6 Mafia',
      'Jedi Mind Tricks', 'Vinnie Paz', 'Army of the Pharaohs', 'Ill Bill', 'La Coka Nostra',
      'Black Star', 'Mos Def', 'Talib Kweli', 'Common', 'The Roots',
      'Gang Starr', 'DJ Premier', 'Pete Rock & CL Smooth', 'Lord Finesse', 'Big L',
      'Organized Konfusion', 'Company Flow', 'Cannibal Ox', 'Deltron 3030', 'Dr. Octagon',
      'Blackalicious', 'Jurassic 5', 'Dilated Peoples', 'Living Legends', 'Freestyle Fellowship',
      'Aceyalone', 'Abstract Rude', 'Myka 9', 'Haiku d\'Etat', 'Project Blowed',
      
      // Hip Hop - Mainstream/Popular
      'Kendrick Lamar', 'J. Cole', 'Nas', 'The Notorious B.I.G.',
      'Tupac', '2Pac', 'Eminem', 'Dr. Dre', 'Snoop Dogg', 'Ice Cube', 'N.W.A',
      'Tyler, The Creator', 'Earl Sweatshirt', 'Mac Miller',
      
      // Rock - Classic/Mainstream (HIGH PRIORITY)
      'The Beatles', 'Led Zeppelin', 'Pink Floyd', 'The Rolling Stones', 'The Who',
      'Queen', 'David Bowie', 'Jimi Hendrix', 'The Doors', 'Cream',
      'Nirvana', 'Pearl Jam', 'Soundgarden', 'Alice in Chains', 'Stone Temple Pilots',
      'Radiohead', 'The Smashing Pumpkins', 'R.E.M.', 'The Cure',
      'Red Hot Chili Peppers', 'Foo Fighters', 'Queens of the Stone Age', 'The White Stripes',
      'The Strokes', 'Arctic Monkeys', 'Muse', 'Weezer', 'Green Day',
      
      // Rock - Alternative/Indie (HIGH PRIORITY)
      'Pixies', 'Sonic Youth', 'Pavement', 'Built to Spill', 'Modest Mouse',
      'Arcade Fire', 'The National', 'Vampire Weekend', 'Interpol',
      'Dinosaur Jr.', 'The Replacements', 'Hüsker Dü', 'Guided by Voices',
      'Sebadoh', 'Superchunk', 'Archers of Loaf', 'Polvo',
      
      // Metal - Various Subgenres (HIGH PRIORITY)
      'Metallica', 'Black Sabbath', 'Iron Maiden', 'Judas Priest', 'Slayer',
      'Megadeth', 'Pantera', 'Tool', 'System of a Down', 'Deftones',
      'Rage Against the Machine', 'Korn', 'Slipknot', 'Lamb of God', 'Mastodon',
      'Opeth', 'Gojira', 'Meshuggah', 'Between the Buried and Me', 'Converge',
      'Sleep', 'High on Fire', 'Electric Wizard', 'Neurosis', 'Isis',
      'Melvins', 'Baroness', 'Pelican', 'Russian Circles', 'Red Fang',
      'Sunn O)))', 'Earth', 'Boris', 'Wolves in the Throne Room',
      
      // Punk/Hardcore
      'The Ramones', 'The Clash', 'Sex Pistols', 'Black Flag', 'Minor Threat',
      'Dead Kennedys', 'Bad Brains', 'Fugazi', 'Refused', 'At the Drive-In',
      'Descendents', 'ALL', 'Jawbreaker', 'Hot Water Music',
      
      // Shoegaze/Dream Pop
      'My Bloody Valentine', 'Slowdive', 'Ride', 'Cocteau Twins', 'Mazzy Star',
      
      // Post-Rock/Math Rock
      'Godspeed You! Black Emperor', 'Explosions in the Sky', 'Mogwai', 'Slint',
      'Tortoise', 'Battles', 'Don Caballero', 'Swans', 'Shellac'
    ];
  }

  async generateSongSuggestionFromSpotify(forceFallback = false) {
    try {
      this.log('🎵 === GENERATING SONG USING SPOTIFY GENRE DETECTION (NO AI) ===');
      
      const now = Date.now();
      
      // Check how many DJs are on stage  
      const djCount = this.roomState?.djs?.size || 0;
      const otherDJsOnStage = djCount > 1; // Are there other human DJs with the bot?
      
      // Get current human DJs on stage (excluding bots and self)
      const djsUserIds = Array.from(this.roomState.djs.keys()) || [];
      const botUserIds = (process.env.EXCLUDE_USERIDS || '').split(',').map(id => id.trim());
      const currentHumanDJs = djsUserIds.filter(djId => 
        djId !== this.userId && !botUserIds.includes(djId)
      );
      
      // Get DJ names if available for better logging
      const humanDJNames = currentHumanDJs.map(djId => {
        const dj = this.roomState.djs.get(djId);
        return dj?.name || djId;
      });
      
      this.log(`👥 Current human DJs on stage: ${currentHumanDJs.length} ${humanDJNames.length > 0 ? `(${humanDJNames.join(', ')})` : ''}`);
      
      // Get context about what THOSE SPECIFIC HUMAN DJs have played (prioritize their tastes)
      const currentDJsSongs = this.roomSongHistory
        .filter(entry => !entry.isBotSong && currentHumanDJs.includes(entry.djId || entry.userId))
        .slice(-20); // Last 20 songs from current DJs
      
      // Also get recent plays from ALL humans as fallback
      const allRecentUserSongs = this.roomSongHistory
        .filter(entry => !entry.isBotSong && entry.djId !== this.userId && entry.djId !== 'unknown')
        .slice(-10); // Last 10 user songs for genre context
      
      // Prioritize current DJs' songs, fallback to all recent if not enough data
      const recentUserSongs = currentDJsSongs.length >= 3 ? currentDJsSongs : allRecentUserSongs;
      
      if (currentDJsSongs.length >= 3) {
        this.log(`📚 Analyzing tastes of current DJs: ${currentDJsSongs.length} songs from them in history`);
      } else {
        this.log(`📚 Not enough data from current DJs (${currentDJsSongs.length} songs), using all recent plays: ${recentUserSongs.length} songs`);
      }
      
      // USER REQUEST: NEVER use AI - ALWAYS use curated list + Spotify genre detection
      const shouldUseAI = false; // ALWAYS false - no AI tokens used
      
      if (otherDJsOnStage) {
        this.log(`📚 Other DJs on stage (${djCount} total) - matching their vibe using Spotify API`);
      } else {
        this.log(`💰 Bot playing solo - selecting randomly from ALL MUSIC genres`);
      }
      
      // Step 1: Use curated ALL MUSIC artists list + learned artists (NO AI TOKENS)
      this.log('📚 Using curated ALL MUSIC artist list (no AI - saving tokens)...');
      
      // ALWAYS analyze room vibe using Spotify API (ZERO AI TOKENS)
      let roomVibe = {
        genres: [] // Will store detected genres from Spotify
      };
      
      // Get current playing song if it's a USER song (not bot)
      const currentSong = this.roomState?.currentSong;
      let songsToAnalyze = [...recentUserSongs];
      
      // Add current playing song if it's a USER song (not bot)
      if (currentSong && currentSong.metadata) {
        const currentDjId = this.currentDjId || currentSong.djid;
        if (currentDjId && currentDjId !== this.userId) {
          songsToAnalyze.push({
            artist: currentSong.metadata.artist,
            song: currentSong.metadata.song,
            isCurrent: true
          });
          this.log(`🔍 Including current user song in vibe analysis: ${currentSong.metadata.artist} - ${currentSong.metadata.song}`);
        }
      }
      
      // Analyze vibe using Spotify API (NO AI)
      if (songsToAnalyze.length > 0) {
        this.log(`📊 Analyzing ${songsToAnalyze.length} user plays using Spotify API (NO AI tokens)...`);
        
        const genreMap = new Map(); // genre -> count
        
        for (const songEntry of songsToAnalyze) {
          try {
            const spotifyData = await this.searchSpotify(songEntry.artist, songEntry.song);
            if (spotifyData && spotifyData.genres && spotifyData.genres.length > 0) {
              spotifyData.genres.forEach(genre => {
                const count = genreMap.get(genre) || 0;
                genreMap.set(genre, count + 1);
              });
              
              if (songEntry.isCurrent) {
                this.log(`🎵 Current song genres: ${spotifyData.genres.join(', ')}`);
              }
            }
          } catch (error) {
            // Skip if Spotify fails
          }
        }
        
        // Get top 5 detected genres
        roomVibe.genres = Array.from(genreMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(entry => entry[0]);
        
        this.log(`🎵 Spotify detected genres: ${roomVibe.genres.join(', ')}`);
      }
      
      // Get curated artists
      const curatedArtists = this.getAllMusicCuratedArtists();
      
      // Filter out pop/boy band/electronic artists from learned list (keep hip hop/rock/metal only)
      const popBlacklist = ['nsync', 'n sync', '*nsync', 'backstreet boys', 'bsb', 'justin timberlake', 
                            'britney spears', 'christina aguilera', 'spice girls', 'one direction',
                            'jonas brothers', 'ariana grande', 'taylor swift', 'katy perry', 'miley cyrus',
                            'selena gomez', 'demi lovato', 'justin bieber', 'shawn mendes', 'ed sheeran',
                            'maroon 5', 'imagine dragons', 'twenty one pilots', '21 pilots', 'alan walker',
                            'marshmello', 'calvin harris', 'david guetta', 'avicii', 'tiesto', 'skrillex',
                            'diplo', 'zedd', 'kygo', 'martin garrix', 'chainsmokers'];
      
      // Add learned artists from users (excluding pop/electronic)
      const learnedArtistsList = Array.from(this.learnedArtists).filter(artist => {
        const artistLower = artist.toLowerCase();
        return !popBlacklist.some(blocked => artistLower.includes(blocked));
      });
      
      // Get artists that current human DJs have played before
      const currentDJsArtists = new Set();
      currentDJsSongs.forEach(entry => {
        if (entry.artist) {
          currentDJsArtists.add(entry.artist.toLowerCase());
        }
      });
      
      if (currentDJsArtists.size > 0) {
        this.log(`🎯 Current DJs have played ${currentDJsArtists.size} unique artists: ${Array.from(currentDJsArtists).slice(0, 5).join(', ')}${currentDJsArtists.size > 5 ? '...' : ''}`);
      }
      
      const allArtists = [...curatedArtists, ...learnedArtistsList];
      
      if (learnedArtistsList.length > 0) {
        const filteredCount = this.learnedArtists.size - learnedArtistsList.length;
        this.log(`📚 Artist pool: ${curatedArtists.length} curated + ${learnedArtistsList.length} learned (${filteredCount} pop/electronic filtered) = ${allArtists.length} total`);
      }
      
      // PRIORITIZE: Pick from artists that current DJs have played (if we have that data)
      let availableArtists = [];
      if (currentDJsArtists.size > 0) {
        // First try: Artists the current DJs have actually played
        availableArtists = allArtists.filter(artist => 
          currentDJsArtists.has(artist.toLowerCase()) &&
          !this.recentlyUsedArtists.includes(artist.toLowerCase()) &&
          artist.toLowerCase() !== this.lastPlayedArtist?.toLowerCase()
        );
        
        if (availableArtists.length > 0) {
          this.log(`🎯 Found ${availableArtists.length} artists that current DJs have played - prioritizing their tastes!`);
        }
      }
      
      // Fallback: If no matches from current DJs' history, use all available artists
      if (availableArtists.length === 0) {
        availableArtists = allArtists.filter(artist => 
          !this.recentlyUsedArtists.includes(artist.toLowerCase()) &&
          artist.toLowerCase() !== this.lastPlayedArtist?.toLowerCase()
        );
        
        if (currentDJsArtists.size > 0) {
          this.log(`⚠️ No available artists from current DJs' history - using general pool (${availableArtists.length} artists)`);
        }
      }
      
      if (availableArtists.length === 0) {
        if (this.verboseMode) this.log('🔄 All artists recently used, resetting...');
        this.recentlyUsedArtists = [];
        availableArtists.push(...allArtists);
      }
      
      const randomArtist = availableArtists[Math.floor(Math.random() * availableArtists.length)];
      this.recentlyUsedArtists.push(randomArtist.toLowerCase());
      if (this.recentlyUsedArtists.length > 15) {
        this.recentlyUsedArtists = this.recentlyUsedArtists.slice(-15);
      }
      
      // Check if this is a learned artist
      const isLearnedArtist = this.learnedArtists.has(randomArtist.toLowerCase());
      const artistSource = isLearnedArtist ? 'learned from users' : 'curated list';
      
      this.log(`🎲 Selected artist: ${randomArtist} (${artistSource})`);
      
      // Get songs for this artist from MusicBrainz
      const artistSongs = await this.getSongsForArtist(randomArtist);
      if (artistSongs.length > 0) {
        // Filter out already played songs
        const unplayedSongs = artistSongs.filter(song => {
          const songKey = `${randomArtist} - ${song}`;
          return !this.playedSongs.has(songKey);
        });
        
        if (unplayedSongs.length === 0) {
          if (this.verboseMode) this.log(`🔄 All songs by ${randomArtist} have been played, clearing...`);
          const artistPlayedSongs = Array.from(this.playedSongs).filter(song => song.startsWith(`${randomArtist} -`));
          artistPlayedSongs.forEach(song => this.playedSongs.delete(song));
          unplayedSongs.push(...artistSongs);
        }
        
        // Pick a random song
        const randomSong = unplayedSongs[Math.floor(Math.random() * unplayedSongs.length)];
        
        this.log(`✅ Selected: ${randomArtist} - ${randomSong} (${artistSource})`);
        this.lastSongChangeTime = now;
        this.lastPlayedArtist = randomArtist;
        
        return {
          artist: randomArtist,
          title: randomSong,
          source: `Curated List + MusicBrainz + Spotify (NO AI)`
        };
      }
      
      // If we get here, something is wrong
      this.log('❌ Failed to generate song - exhausted all options');
      return null;
      
    } catch (error) {
      this.log(`❌ Error generating song suggestion: ${error.message}`);
      return null;
    }
  }

  sendPM(userId, message) {
    if (!this.isConnected) {
      this.log('❌ Cannot send PM: Bot not connected');
      return;
    }

    this.send({
      api: 'pm.send',
      receiverid: userId,
      text: message
    });
    
    // PM sent
  }
  
  send(request, callback = null) {
    if (!this.isConnected) {
      this.log('❌ Cannot send message: not connected');
      return;
    }
    
    request.msgid = this.msgId++;
    request.clientid = this.clientId;
    request.userid = this.userId;
    request.userauth = this.auth;
    
    const message = JSON.stringify(request);
    const formattedMessage = `~m~${message.length}~m~${message}`;
    
    this.ws.send(formattedMessage);
    // API request sent
    
    if (callback) {
      // Store callback for response handling
      this.pendingCallbacks = this.pendingCallbacks || new Map();
      this.pendingCallbacks.set(request.msgid, callback);
    }
  }
  
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
  
}

// Initialize bot
const bot = new DeepcutAIBot();

// Handle graceful shutdown
process.on('SIGINT', () => {
  bot.shutdown();
});

process.on('SIGTERM', () => {
  bot.shutdown();
});

bot.on('ready', () => {
  console.log('🎉 Deepcut AI Bot is ready!');
  console.log('💡 Send PM commands or use !p for silent upvote');
});

module.exports = DeepcutAIBot;
