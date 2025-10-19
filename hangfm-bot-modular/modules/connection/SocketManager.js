/**
 * SocketManager - manages TTFM socket connection
 */
const { SocketClient } = require('ttfm-socket');

class SocketManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.socket = null;
    this.state = null;
    this.isConnected = false;
    this.eventHandlers = new Map(); // Store event handlers to propagate to inner socket
    
    // Initialize socket with the configured URL
    const socketUrl = this.config.url || this.config.websocketUrl || 'https://socket.prod.tt.fm';
    this.logger.log(`📡 Creating SocketClient (${socketUrl})...`);
    this.socket = new SocketClient(socketUrl);
    this.logger.log('✅ SocketClient created');
    
    // Propagate ALL events from inner socket to this manager
    // This makes the manager act like an EventEmitter proxy
    this.propagateEvents();
  }

  propagateEvents() {
    // Event propagation will be set up in connect() after socket is ready
    // This method is kept for future use
  }

  getState() {
    return this.state || this.socket?.state || {};
  }

  async connect() {
    try {
      this.logger.log('🔌 Connecting to Hang.fm...');
      
      // Support both "token" and "botUserToken" property names
      const botToken = this.config.token || this.config.botUserToken;
      
      if (!botToken) {
        throw new Error('BOT_USER_TOKEN is required');
      }
      
      if (!this.config.roomId) {
        throw new Error('ROOM_ID is required');
      }
      
      this.logger.log('🔑 Authenticating with token...');
      this.logger.log(`📍 Joining room: ${this.config.roomId}`);
      
      // Add timeout to prevent hanging
      const connectionPromise = this.socket.joinRoom(botToken, {
        roomUuid: this.config.roomId
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout after 30 seconds')), 30000);
      });
      
      const connection = await Promise.race([connectionPromise, timeoutPromise]);
      
      this.state = connection.state;
      this.isConnected = true;
      
      // Wait a moment for state to fully populate
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try to get more complete state
      if (this.socket && typeof this.socket.getState === 'function') {
        const fullState = this.socket.getState();
        if (fullState) this.state = fullState;
      }
      
      this.logger.log(`✅ Connected to Hang.fm`);
      this.logger.log(`📍 Room: ${this.state.room?.name || this.state.room?.metadata?.name || 'Unknown Room'}`);
      this.logger.log(`🎭 Bot: ${this.state.selfProfile?.name || this.state.self?.name || 'BOT'}`);
      this.logger.log(`👥 Users in room: ${Object.keys(this.state.users || {}).length || this.state.room?.userCount || 0}`);
      this.logger.log(`🎧 DJs on stage: ${(this.state.room?.djs || []).length || 0}`);
      
      // DEBUG: Test that socket is working
      this.logger.debug(`🔍 Socket connection state: ${this.socket?.state}`);
      this.logger.debug(`🔍 Socket has 'on' method: ${typeof this.socket?.on === 'function'}`);
      this.logger.debug(`🔍 Socket event names: ${this.socket?.eventNames?.() || 'N/A'}`);
      
      // DEBUG: Log ALL socket events to see what's actually being emitted
      if (this.socket) {
        this.logger.debug('🔍 Setting up debug event logger...');
        
        // Intercept emit calls to propagate events AND add debug logging
        const originalEmit = this.socket.emit.bind(this.socket);
        const eventHandlers = this.eventHandlers;
        const logger = this.logger;
        
        this.socket.emit = function(...args) {
          const eventName = args[0];
          const eventData = args.slice(1);
          
          // Debug logging (skip heartbeat/ping spam)
          if (eventName && !eventName.includes('heartbeat') && !eventName.includes('ping')) {
            logger?.debug?.(`🔍 [SOCKET EMIT] ${eventName}: ${JSON.stringify(args[1])?.substring(0, 150)}`);
          }
          
          // Propagate to our registered handlers
          if (eventHandlers.has(eventName)) {
            const handlers = eventHandlers.get(eventName);
            handlers.forEach(handler => {
              try {
                handler(...eventData);
              } catch (e) {
                logger?.error?.(`Event handler error for ${eventName}: ${e.message}`);
              }
            });
          }
          
          // Call original emit
          return originalEmit(...args);
        };
        
        // Listen to common events for debugging
        const debugEvents = ['statefulMessage', 'statelessMessage', 'serverMessage', 'message', 'data'];
        debugEvents.forEach(evt => {
          try {
            this.socket.on(evt, (data) => {
              // Show FULL message if it's a chat message
              if (data && (data.name === 'chatMessage' || data.name === 'userSpoke')) {
                this.logger.debug(`🔍 [SOCKET EVENT] ${evt} - CHAT MESSAGE: ${JSON.stringify(data)?.substring(0, 500)}`);
              } else {
                this.logger.debug(`🔍 [SOCKET EVENT] ${evt}: ${JSON.stringify(data)?.substring(0, 200)}`);
              }
            });
          } catch {}
        });
      }
      
      return connection;
    } catch (error) {
      this.logger.error(`❌ Failed to connect to Hang.fm: ${error.message}`);
      this.logger.error(`   Check your BOT_USER_TOKEN and ROOM_ID in hang-fm-config.env`);
      throw error;
    }
  }

  action(name, params) {
    if (!this.socket || !this.isConnected) {
      throw new Error('Socket not connected');
    }
    return this.socket.action(name, params);
  }

  on(event, callback) {
    if (!this.socket) {
      throw new Error('Socket not initialized');
    }
    
    // Store handler in our map for propagation
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(callback);
    
    // Also bind directly to inner socket as backup
    this.socket.on(event, callback);
  }

  // Emit method for EventEmitter compatibility
  emit(event, ...args) {
    if (this.socket && typeof this.socket.emit === 'function') {
      this.socket.emit(event, ...args);
    }
  }

  // AddListener alias for on()
  addListener(event, callback) {
    return this.on(event, callback);
  }

  getState() {
    return this.state;
  }

  updateState(newState) {
    this.state = newState;
  }
}

module.exports = SocketManager;
