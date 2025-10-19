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
    this.subscribed = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.messageCallback = null; // Callback for chat messages
    
    // HTTP polling for receiving messages (since WebSocket auth fails)
    this.pollingInterval = null;
    this.processedMessages = new Set(); // Track processed message IDs
    this.pollingStartTime = Date.now(); // Only process messages after bot starts
    this.groupJoined = false; // Track if we've successfully joined the group
  }
  
  onMessage(callback) {
    this.messageCallback = callback;
  }

  // Optional init entrypoint used by modular launcher
  async init() {
    await this.connect();
  }

  async connect() {
    return new Promise((resolve) => {
      try {
        this.logger.log('💬 Connecting to CometChat...');
        
        // Try WebSocket, but fallback to HTTP polling if it fails
        this.connectWebSocket();
        
        // Join group via HTTP (for sending messages) - MUST be done before sending/polling
        setTimeout(() => {
          if (this.config?.roomId) {
            this.joinGroup(this.config.roomId).catch(() => {
              this.logger.warn('⚠️  Failed to join CometChat group - may not be able to send/receive');
            });
          }
        }, 1000); // Give WebSocket time to connect first
        
        // DON'T subscribe yet - wait for auth to complete first
        // subscribeToGroup will be called automatically after auth succeeds
        
        // Always resolve after timeout - HTTP API works for sending
        setTimeout(() => {
          if (!this.authenticated) {
            this.logger.warn('⚠️  CometChat WebSocket auth failed - starting HTTP polling instead');
            // Start HTTP polling since WebSocket doesn't work
            this.startPolling();
          }
          resolve();
        }, 5000); // Reduced timeout since we know WebSocket won't work
        
      } catch (error) {
        this.logger.error(`❌ CometChat connection error: ${error.message}`);
        resolve(); // Allow bot to continue
      }
    });
  }

  startPolling() {
    if (this.pollingInterval) return; // Already polling
    
    // Start polling even if group join failed - we can still read messages
    this.logger.log('🔄 Starting CometChat HTTP polling for messages...');
    
    // Poll every 2 seconds for new messages
    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollMessages();
      } catch (error) {
        this.logger.debug(`Polling error: ${error.message}`);
      }
    }, 2000);
  }

  async pollMessages() {
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

      // Use EXACT endpoint from original bot: /v3/groups/{roomId}/messages
      const response = await axios.get(
        `${baseUrl}/v3/groups/${this.config.roomId}/messages?limit=5`,
        { headers, timeout: 5000 }
      );

      this.logger.debug(`📊 Poll response: status=${response.status}, hasData=${!!response.data}`);
      
      if (response.data && response.data.data && Array.isArray(response.data.data)) {
        const messages = response.data.data;
        this.logger.debug(`📊 Received ${messages.length} messages from CometChat API`);
        
        messages.forEach((message, index) => {
          this.logger.debug(`📨 Message ${index}: type=${message.type}, sender=${message.sender}, text=${message.data?.text?.substring(0, 50)}`);
          
          // Only process text messages from others that are recent
          if (message.type === 'text' && message.sender && message.sender !== this.config.userId) {
            const text = message.data?.text || message.text || '';
            const messageTime = message.sentAt ? new Date(message.sentAt * 1000).getTime() : Date.now();
            const isRecent = messageTime > this.pollingStartTime;
            // Use ONLY message ID for deduplication (message.id is unique)
            const messageKey = `${message.id}`;
            
            this.logger.debug(`📋 Message check: text="${text}", isRecent=${isRecent}, alreadyProcessed=${this.processedMessages.has(messageKey)}`);
            
            // Only process new messages (not already processed)
            if (text && isRecent && !this.processedMessages.has(messageKey)) {
              this.processedMessages.add(messageKey);
              
              // Get sender info (EXACT format from original bot)
              const senderId = message.data?.entities?.sender?.entity?.id || message.sender;
              const senderName = message.data?.entities?.sender?.entity?.name || 'Unknown';
              
              // Log the message
              this.logger.log(`💬 ${senderName}: ${text}`);
              
              // Call the message callback
              if (this.messageCallback) {
                this.messageCallback({
                  text,
                  sender: { uid: senderId, name: senderName },
                  data: { text, userId: senderId, userName: senderName }
                });
              }
            }
          }
        });
        
        // Clean up old processed messages (keep last 100)
        if (this.processedMessages.size > 100) {
          const arr = Array.from(this.processedMessages);
          this.processedMessages = new Set(arr.slice(-100));
        }
      }
    } catch (error) {
      // Log ALL errors for now to debug
      this.logger.error(`❌ Poll error: ${error.response?.status || error.message}`);
      if (error.response?.data) {
        this.logger.error(`❌ Poll response: ${JSON.stringify(error.response.data).substring(0, 200)}`);
      }
    }
  }
  
  connectWebSocket() {
    try {
      // Use the correct CometChat WebSocket URL (from original bot)
      const wsUrl = `wss://${this.config.cometChatApiKey}.websocket-us.cometchat.io/v3.0/`;
      this.logger.log(`🔗 CometChat URL: ${wsUrl}`);
      
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.logger.log('✅ CometChat WebSocket opened');
        
        // Send authentication message - Use EXACT format from working original bot
        const authMessage = {
          appId: this.config.cometChatApiKey,
          type: "auth",
          sender: this.config.userId,
          body: {
            auth: this.config.cometChatAuth, // Use full auth string (original bot format)
            deviceId: `WEB-4_0_10-${this.config.userId}-${Date.now()}`,
            presenceSubscription: "ALL_USERS"
          }
        };
        
        this.logger.log(`🔐 Sending CometChat auth for user: ${this.config.userId}`);
        this.logger.debug(`🔍 Auth: appId=${this.config.cometChatApiKey}, sender=${this.config.userId}`);
        this.logger.debug(`🔍 Full auth message: ${JSON.stringify(authMessage).substring(0, 200)}`);
        this.ws.send(JSON.stringify(authMessage));
        this.logger.log('📤 CometChat auth message sent - waiting for response...');
        
        // Check WebSocket state after sending
        setTimeout(() => {
          const state = this.ws.readyState;
          const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
          this.logger.debug(`🔍 WebSocket state after 2s: ${states[state] || state} (${state})`);
          if (state !== 1) { // 1 = OPEN
            this.logger.warn(`⚠️  WebSocket not OPEN after sending auth!`);
          }
        }, 2000);
      });

      this.ws.on('message', (data) => {
        try {
          this.logger.debug(`📨 RAW WebSocket data received: ${data.toString().substring(0, 300)}`);
          const message = JSON.parse(data.toString());
          
          // Log ALL messages during startup to debug auth issues
          if (!this.authenticated) {
            this.logger.debug(`📨 CometChat message received: ${JSON.stringify(message).substring(0, 300)}`);
          }
          
          // Check for auth error - if WebSocket fails, HTTP API still works
          if (message.error) {
            this.logger.warn(`⚠️  CometChat WebSocket error: ${message.error}`);
            if (message.error === 'Unauthorized' || message.error.includes('auth')) {
              this.logger.warn(`⚠️  CometChat WebSocket auth failed - falling back to HTTP API only`);
              this.ws.close();
              return;
            }
          }
          
          // Check for authentication success - CometChat sends different response formats
          if (!this.authenticated) {
            if (message.type === 'auth' || 
                message.type === 'authSuccess' || 
                (message.body && (message.body.code === '200' || message.body.success)) ||
                message.status === 'success' || 
                message.code === '200') {
              this.authenticated = true;
              this.logger.log('✅ CometChat WebSocket authenticated - can receive commands!');
              
              // NOW subscribe to the room after auth succeeds
              if (this.config?.roomId) {
                setTimeout(() => this.subscribeToGroup(this.config.roomId), 500);
              }
            }
          }
          
          // Handle the message
          this.handleMessage(message);
        } catch (error) {
          this.logger.error(`CometChat message parse error: ${error.message}`);
        }
      });

      this.ws.on('ping', (data) => {
        this.logger.debug(`📨 CometChat WebSocket PING received: ${data.toString().substring(0, 100)}`);
        this.ws.pong();
      });

      this.ws.on('pong', (data) => {
        this.logger.debug(`📨 CometChat WebSocket PONG received`);
      });

      this.ws.on('error', (error) => {
        this.logger.error(`❌ CometChat WebSocket error: ${error.message}`);
      });

      this.ws.on('close', (code, reason) => {
        this.logger.warn(`⚠️  CometChat WebSocket closed: code=${code}, reason=${reason || 'none'}`);
        this.authenticated = false;
      });

    } catch (error) {
      this.logger.error(`❌ CometChat WebSocket connect error: ${error.message}`);
    }
  }

  handleMessage(data) {
    try {
      // Log all messages for debugging (per original bot)
      this.logger.debug(`📨 CometChat: ${JSON.stringify(data).substring(0, 200)}`);
      
      // Check for authentication success
      if (data.type === 'auth' || data.type === 'authSuccess' || 
          (data.body && (data.body.code === '200' || data.body.success)) ||
          data.status === 'success' || data.code === '200') {
    this.authenticated = true;
        this.logger.log('✅ CometChat authenticated - receiving messages');
      }
      
      // Handle incoming chat messages (per original bot format)
      if (data.type === 'message' && data.body?.type === 'text') {
        const sender = data.body.sender;
        const senderName = data.body.senderName || 'Unknown';
        const senderId = sender;
        const text = data.body.data?.text || '';

        // Don't show bot's own messages
        if (sender === this.config.userId || senderId === this.config.userId) {
          return;
        }

        // Display in PowerShell
        this.logger.log(`💬 ${senderName}: ${text}`);

        // Call registered callback if exists (for command handling, AI, etc.)
        if (this.messageCallback) {
          // Provide a CometChat-like shape so downstream parsers succeed
          this.messageCallback({
            text,
            sender: { uid: senderId, name: senderName },
            data: { text },
          });
        }
      }
    } catch (error) {
      this.logger.error(`Error handling CometChat message: ${error.message}`);
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
      this.groupJoined = true;
      this.logger.log('✅ Joined CometChat group');
      return true;
    } catch (error) {
      // Ignore "already a member" errors
      if (error.response?.status === 409) {
        this.groupJoined = true;
        this.logger.log('✅ Already a member of CometChat group');
        return true;
      }
      // 417 might mean "Expectation Failed" - try without the 'dnt' header or different payload
      if (error.response?.status === 417) {
        this.logger.debug(`⚠️  Group join returned 417 - trying alternate format...`);
        try {
          // Try without participants payload
          await axios.post(`${baseUrl}/v3/groups/${roomId}/members`, {}, { headers, timeout: 10000 });
          this.groupJoined = true;
          this.logger.log('✅ Joined CometChat group (alternate method)');
          return true;
        } catch (retryError) {
          // Ignore - we can still poll for messages
          this.logger.debug(`Group join failed - will rely on polling only`);
          return false;
        }
      }
      this.logger.error(`❌ Failed to join group: ${error.response?.status} ${error.message}`);
      return false;
    }
  }

  async sendMessage(roomId, text) {
    const baseUrl = `https://${this.config.cometChatApiKey}.apiclient-us.cometchat.io`;
    
    try {
      // Join group first if not already joined
      if (!this.groupJoined) {
        const joined = await this.joinGroup(roomId);
        if (!joined) {
          this.logger.warn('⚠️  Could not join group, message may fail');
        }
      }
      
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

  // Subscribe to room messages on the CometChat WebSocket
  subscribeToGroup(roomId) {
    try {
      if (!this.ws || this.ws.readyState !== 1) return; // 1 = OPEN
      if (this.subscribed) return;
      if (!roomId) return;

      const payload = {
        appId: this.config.cometChatApiKey,
        type: 'subscribe',
        sender: this.config.userId,
        body: { type: 'group', guid: roomId, scope: 'messages' }
      };

      this.ws.send(JSON.stringify(payload));
      this.subscribed = true;
      this.logger.log('✅ CometChat room subscription sent');
    } catch (e) {
      this.logger.debug(`CometChat subscribe error: ${e?.message || e}`);
    }
  }
}

module.exports = CometChatManager;
