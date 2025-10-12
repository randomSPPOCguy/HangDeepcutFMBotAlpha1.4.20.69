/**
 * CometChatManager - CometChat WebSocket and HTTP API for chat messages
 */
const WebSocket = require('ws');
const axios = require('axios');

class CometChatManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.ws = null;
    this.authenticated = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }

  async connect() {
    return new Promise((resolve) => {
      try {
        this.logger.log('💬 Connecting to CometChat...');
        
        // Use the correct CometChat WebSocket URL (from original bot)
        const wsUrl = `wss://${this.config.cometChatApiKey}.websocket-us.cometchat.io/v3.0/`;
        this.logger.log(`🔗 CometChat URL: ${wsUrl}`);
        
        this.ws = new WebSocket(wsUrl);

        // Set timeout
        const connectionTimeout = setTimeout(() => {
          if (!this.authenticated) {
            this.logger.log('ℹ️  CometChat WebSocket timeout - HTTP API will be used instead');
            this.ws?.close();
            resolve(); // Resolve anyway to allow bot to continue
          }
        }, 10000);

        this.ws.on('open', () => {
          this.logger.log('✅ CometChat WebSocket opened');
          
          // Send authentication message
          const authMessage = {
            appId: this.config.cometChatApiKey,
            type: "auth",
            sender: this.config.userId,
            body: {
              auth: this.config.cometChatAuth,
              deviceId: `WEB-4_0_10-${this.config.userId}-${Date.now()}`,
              presenceSubscription: "ALL_USERS"
            }
          };
          
          this.ws.send(JSON.stringify(authMessage));
          this.logger.debug('CometChat auth sent');
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
            
            // Check for authentication success - CometChat sends different response formats
            if (!this.authenticated && (
              message.type === 'auth' || 
              message.type === 'authSuccess' || 
              (message.body && (message.body.code === '200' || message.body.success)) ||
              message.status === 'success' || 
              message.code === '200'
            )) {
              this.authenticated = true;
              clearTimeout(connectionTimeout);
              this.logger.log('✅ CometChat authenticated');
              resolve();
            }
          } catch (error) {
            this.logger.error(`CometChat message parse error: ${error.message}`);
          }
        });

        this.ws.on('error', (error) => {
          this.logger.debug(`CometChat WebSocket error: ${error.message}`);
          clearTimeout(connectionTimeout);
          resolve(); // Allow bot to continue
        });

        this.ws.on('close', () => {
          this.logger.debug('CometChat WebSocket closed - HTTP API active');
          this.authenticated = false;
        });

      } catch (error) {
        this.logger.error(`❌ CometChat connection error: ${error.message}`);
        resolve(); // Allow bot to continue
      }
    });
  }

  handleMessage(data) {
    // Handle incoming CometChat messages
    if (data.type === 'message') {
      this.logger.debug(`CometChat message: ${JSON.stringify(data).substring(0, 100)}`);
    }
  }

  async joinGroup(roomId) {
    try {
      const baseUrl = `https://${this.config.cometChatApiKey}.apiclient-us.cometchat.io`;
      const headers = {
        'Content-Type': 'application/json',
        'authtoken': this.config.cometChatAuth,
        'appid': this.config.cometChatApiKey,
        'onBehalfOf': this.config.userId,
        'dnt': 1,
        'origin': 'https://tt.live',
        'referer': 'https://tt.live/',
        'sdk': 'javascript@3.0.10'
      };

      const requestData = {
        participants: [this.config.userId]
      };

      await axios.post(`${baseUrl}/v3/groups/${roomId}/members`, requestData, { headers, timeout: 10000 });
      this.logger.log('✅ Joined CometChat group');
      return true;
    } catch (error) {
      // Ignore "already a member" errors
      if (error.response?.status === 409) {
        this.logger.log('✅ Already a member of CometChat group');
        return true;
      }
      this.logger.error(`❌ Failed to join group: ${error.response?.status} ${error.message}`);
      return false;
    }
  }

  async sendMessage(roomId, text) {
    const baseUrl = `https://${this.config.cometChatApiKey}.apiclient-us.cometchat.io`;
    
    try {
      // Join group first if not already joined
      await this.joinGroup(roomId);
      
      const headers = {
        'Content-Type': 'application/json',
        'authtoken': this.config.cometChatAuth,
        'appid': this.config.cometChatApiKey,
        'onBehalfOf': this.config.userId,
        'dnt': 1,
        'origin': 'https://tt.live',
        'referer': 'https://tt.live/',
        'sdk': 'javascript@3.0.10'
      };

      const payload = {
        receiver: roomId,
        receiverType: 'group',
        category: 'message',
        type: 'text',
        data: {
          text: text,
          metadata: {
            chatMessage: {
              message: text,
              avatarId: this.config.chatAvatarId || this.config.botAvatar || 'bot-01',
              userName: this.config.botName || 'BOT',
              color: '#9E4ADF',
              mentions: [],
              userUuid: this.config.userId,
              badges: ['VERIFIED', 'STAFF'],
              id: Date.now().toString()
            }
          }
        }
      };
      
      await axios.post(`${baseUrl}/v3.0/messages`, payload, { headers, timeout: 10000 });
      
      this.logger.log(`💬 Sent: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to send message: ${error.response?.status} ${error.message}`);
      if (error.response?.data) {
        this.logger.error(`❌ Response data: ${JSON.stringify(error.response.data)}`);
      }
      return false;
    }
  }

  async sendImage(roomId, imageUrl) {
    if (!this.authenticated) {
      this.logger.warn('⚠️ Cannot send image - CometChat not authenticated');
      return false;
    }

    try {
      const response = await axios.post(
        `https://api-us.cometchat.io/v3/messages`,
        {
          category: 'message',
          type: 'image',
          data: { url: imageUrl },
          receiver: roomId,
          receiverType: 'group'
        },
        {
          headers: {
            'apikey': this.config.cometChatApiKey,
            'authToken': this.config.botUserToken,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );
      
      this.logger.debug(`✅ Image sent: ${imageUrl}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send image: ${error.response?.status} ${error.message}`);
      return false;
    }
  }
}

module.exports = CometChatManager;
