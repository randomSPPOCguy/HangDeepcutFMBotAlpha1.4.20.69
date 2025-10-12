/**
 * HangFmBot - main orchestrator that wires modules together
 */
const Config = require('./Config');
const Logger = require('../utils/Logger');
const Helpers = require('../utils/Helpers');
const SpamProtection = require('../utils/SpamProtection');
const SocketManager = require('../connection/SocketManager');
const CometChatManager = require('../connection/CometChatManager');
const StatsManager = require('../stats/StatsManager');
const MusicSelector = require('../music/MusicSelector');
const MetadataFetcher = require('../music/MetadataFetcher');
const CatalogSearcher = require('../music/CatalogSearcher');
const AIManager = require('../ai/AIManager');
const EventHandler = require('../handlers/EventHandler');
const WeatherService = require('../features/WeatherService');
const HolidayDecorator = require('../features/HolidayDecorator');
const ContentFilter = require('../features/ContentFilter');
const AFKDetector = require('../features/AFKDetector');

class HangFmBot {
  constructor() {
    // Initialize configuration
    this.config = new Config();
    this.config.validate();
    
    // Initialize utilities
    this.logger = new Logger(this.config.verboseMode);
    this.helpers = Helpers;
    this.spam = new SpamProtection(this.logger);
    
    // Initialize connections
    this.socket = new SocketManager(this.config, this.logger);
    this.chat = new CometChatManager(this.config, this.logger);
    
    // Initialize stats and data
    this.stats = new StatsManager(this.config, this.logger);
    
    // Initialize music services
    this.meta = new MetadataFetcher(this.config, this.logger);
    this.catalog = new CatalogSearcher(this.config, this.logger);
    this.music = new MusicSelector(this.config, this.logger, this.stats);
    
    // Initialize AI
    this.ai = new AIManager(this.config, this.logger, this.spam);
    
    // Initialize features
    this.decor = new HolidayDecorator(this.logger);
    this.filter = new ContentFilter(this.ai, this.logger);
    this.weather = new WeatherService(this.config, this.logger);
    
    // Initialize handlers
    this.events = new EventHandler(this, this.logger);
    
    // Initialize AFK detector (starts monitoring automatically)
    this.afk = new AFKDetector(this, this.logger);
  }

  async connect() {
    this.logger.log('🤖 Starting Hang.fm Bot (Modular)...');
    this.logger.log('');
    
    // Setup event listeners BEFORE connecting
    this.setupEventListeners();
    
    // Now connect
    await this.socket.connect();
    await this.chat.connect();
    this.stats.load();
  }

  setupEventListeners() {
    this.logger.log('🔧 Setting up socket event listeners...');
    
    this.socket.on('statefulMessage', (message) => {
      this.events.handleStatefulMessage(message);
    });
    
    this.socket.on('statelessMessage', (message) => {
      this.events.handleStatelessMessage(message);
    });
    
    this.socket.on('serverMessage', (message) => {
      this.events.handleServerMessage(message);
    });
    
    this.logger.log('✅ Event listeners registered');
  }

  async start() {
    await this.connect();
    
    // Send boot greeting if enabled (HTTP API works even if WebSocket failed)
    if (this.config.bootGreet && this.config.bootGreetMessage) {
      setTimeout(async () => {
        const decoratedMessage = this.decor.holidayEmojis.icon + ' ' + this.config.bootGreetMessage + ' ' + this.decor.holidayEmojis.icon;
        this.logger.log('📤 Sending boot greeting...');
        const sent = await this.chat.sendMessage(this.config.roomId, decoratedMessage);
        if (sent) {
          this.logger.log('✅ Boot greeting sent successfully!');
        }
      }, 3000);
    }
    
    this.logger.log('');
    this.logger.log('✅ Bot started successfully (Modular)');
    this.logger.log('🎵 Listening for events...');
  }
}

module.exports = HangFmBot;
