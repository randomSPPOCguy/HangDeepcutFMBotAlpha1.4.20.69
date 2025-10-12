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
    
    // Initialize socket immediately
    this.logger.log('📡 Creating SocketClient...');
    this.socket = new SocketClient('https://socket.prod.tt.fm');
    this.logger.log('✅ SocketClient created');
  }

  async connect() {
    try {
      this.logger.log('🔌 Connecting to Hang.fm...');
      
      if (!this.config.botUserToken) {
        throw new Error('BOT_USER_TOKEN is required');
      }
      
      if (!this.config.roomId) {
        throw new Error('ROOM_ID is required');
      }
      
      this.logger.log('🔑 Authenticating with token...');
      this.logger.log(`📍 Joining room: ${this.config.roomId}`);
      
      // Add timeout to prevent hanging
      const connectionPromise = this.socket.joinRoom(this.config.botUserToken, {
        roomUuid: this.config.roomId
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout after 30 seconds')), 30000);
      });
      
      const connection = await Promise.race([connectionPromise, timeoutPromise]);
      
      this.state = connection.state;
      this.isConnected = true;
      
      this.logger.log(`✅ Connected to Hang.fm`);
      this.logger.log(`📍 Room: ${this.state.room?.name || 'Unknown Room'}`);
      this.logger.log(`🎭 Bot: ${this.state.selfProfile?.name || 'Unknown'}`);
      this.logger.log(`👥 Users in room: ${this.state.users?.length || 0}`);
      this.logger.log(`🎧 DJs on stage: ${this.state.djs?.length || 0}`);
      
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
    this.socket.on(event, callback);
  }

  getState() {
    return this.state;
  }

  updateState(newState) {
    this.state = newState;
  }
}

module.exports = SocketManager;
