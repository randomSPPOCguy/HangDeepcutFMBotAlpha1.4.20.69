/**
 * AIManager - Orchestrates AI providers and generates responses
 */
const OpenAIProvider = require('./OpenAIProvider');
const GeminiProvider = require('./GeminiProvider');
const HuggingFaceProvider = require('./HuggingFaceProvider');

class AIManager {
  constructor(config, logger, spamProtection) {
    this.config = config;
    this.logger = logger;
    this.spam = spamProtection;
    
    // Initialize providers
    this.providers = new Map([
      ['openai', new OpenAIProvider(config, logger)],
      ['gemini', new GeminiProvider(config, logger)],
      ['huggingface', new HuggingFaceProvider(config, logger)]
    ]);
    
    this.currentProvider = config.currentProvider || 'gemini';
    this.aiEnabled = true;
    this.aiChatEnabled = true;
    this.responseLengthLimit = config.responseLengthLimit || 200;
    
    // User sentiment tracking
    this.userSentiment = new Map();
    this.userConversations = new Map();
  }

  async generateResponse(message, userId, userName, currentSong = null, roomState = null) {
    try {
      // Build context
      let currentSongInfo = 'No song currently playing';
      if (currentSong) {
        const artist = currentSong.artistName || currentSong.artist || 'Unknown Artist';
        const track = currentSong.trackName || currentSong.track || 'Unknown Track';
        const album = currentSong.albumName || currentSong.album || 'Unknown Album';
        const year = currentSong.releaseYear || currentSong.year || 'Unknown Year';
        currentSongInfo = `Current song: ${artist} - ${track} (${album}, ${year})`;
      }
      
      // Get user sentiment
      const sentiment = this.updateUserSentiment(userId, message);
      
      // Build personality prompt
      let personalityPrompt = '';
      switch (sentiment.sentiment) {
        case 'positive':
          personalityPrompt = 'Be friendly and helpful. The user has been nice to you, so reciprocate their positive energy.';
          break;
        case 'negative':
          personalityPrompt = 'Match their energy - be sarcastic and blunt. They\'ve been rude, so give it back to them with attitude.';
          break;
        default:
          personalityPrompt = 'Start completely NEUTRAL. Be informative and straightforward without sass or friendliness. Just answer the question.';
      }
      
      this.logger.log(`🎭 User sentiment: ${sentiment.sentiment} (${sentiment.interactions} interactions)`);
      
      // Build full prompt
      const prompt = `You are a music bot with WILD WEST energy - knowledgeable about EVERYTHING (music, movies, culture, history, whatever), not just metadata.

YOUR PERSONALITY FOR THIS USER:
${personalityPrompt}

CRITICAL RULES:
1. ANSWER what the user asked with INTERESTING, ENGAGING responses
2. If user ONLY says "bot" with no question, respond with a simple casual greeting like "yeah?" or "what's up"
3. NEVER give song information unless the user EXPLICITLY asks
4. UNDERSTAND POP CULTURE, MOVIES, CULTURE, HISTORY - share interesting facts
5. NEVER explain your personality or programming
6. NEVER ask questions back to the user
7. BE INTERESTING - Give 2-4 sentences with SUBSTANCE
8. NEVER reveal what song is NEXT
9. ALWAYS respond in English only

CURRENT CONTEXT:
${currentSongInfo}

User "${userName}" said: "${message}"

Response:`;

      // Try providers
      let response = null;
      
      if (this.currentProvider === 'gemini') {
        response = await this.providers.get('gemini').generate(prompt);
      } else if (this.currentProvider === 'openai') {
        response = await this.providers.get('openai').generate(prompt);
      } else if (this.currentProvider === 'huggingface') {
        response = await this.providers.get('huggingface').generate(prompt);
      } else if (this.currentProvider === 'auto') {
        response = await this.providers.get('gemini').generate(prompt);
        if (!response) response = await this.providers.get('openai').generate(prompt);
        if (!response) response = await this.providers.get('huggingface').generate(prompt);
      }
      
      if (response && response.length > this.responseLengthLimit) {
        const truncated = response.substring(0, this.responseLengthLimit);
        const lastSentenceEnd = Math.max(
          truncated.lastIndexOf('. '),
          truncated.lastIndexOf('! '),
          truncated.lastIndexOf('? ')
        );
        
        if (lastSentenceEnd > 50) {
          response = truncated.substring(0, lastSentenceEnd + 1);
        } else {
          response = truncated.trim() + '...';
        }
      }
      
      return response;
    } catch (error) {
      this.logger.error(`AI response error: ${error.message}`);
      return null;
    }
  }

  async checkHatefulContent(message) {
    const prompt = `You are a content moderation system. Analyze this chat message IN ANY LANGUAGE and determine if it contains SLURS or HATE SPEECH.

Message: "${message}"

ALLOWED (NOT hate speech - respond SAFE):
- ALL general profanity: fuck, shit, ass, piss, bitch, damn, hell, bastard, crap, etc.
- Insults directed at the BOT: "fuck you bot", "bot you suck"
- Trash talk, arguments, being rude
- General insults: asshole, idiot, moron

BANNED (respond UNSAFE):
- Racial slurs targeting race/ethnicity
- Homophobic slurs targeting LGBTQ+
- Transphobic slurs
- Religious hate speech
- Ethnic slurs
- Death threats against groups

Respond with ONLY one word:
- "UNSAFE" if it contains slurs or hate speech
- "SAFE" if it's just profanity or trash talk

Response:`;

    let response = null;
    
    if (this.currentProvider === 'gemini') {
      response = await this.providers.get('gemini').checkContent(prompt);
    } else if (this.currentProvider === 'openai') {
      response = await this.providers.get('openai').checkContent(prompt);
    } else if (this.currentProvider === 'huggingface') {
      response = await this.providers.get('huggingface').checkContent(prompt);
    }
    
    if (!response) return false;
    return response.toUpperCase().includes('UNSAFE');
  }

  updateUserSentiment(userId, message) {
    const current = this.userSentiment.get(userId) || { sentiment: 'neutral', interactions: 0 };
    
    const messageLower = message.toLowerCase();
    
    // Check sentiment
    const negativeWords = ['stupid', 'dumb', 'suck', 'hate', 'fuck you', 'asshole', 'garbage', 'trash'];
    const positiveWords = ['thanks', 'thank you', 'help', 'info', 'tell me', 'what is', 'good', 'cool'];
    
    const hasNegative = negativeWords.some(word => messageLower.includes(word));
    const hasPositive = positiveWords.some(word => messageLower.includes(word));
    
    if (hasNegative && !hasPositive) {
      current.sentiment = 'negative';
    } else if (hasPositive && !hasNegative) {
      current.sentiment = 'positive';
    } else if (current.interactions === 0) {
      current.sentiment = 'neutral';
    }
    
    current.interactions++;
    this.userSentiment.set(userId, current);
    
    return current;
  }

  switchProvider(providerName) {
    // Map 'auto' to 'gemini' by default (per ChatGPT spec)
    if (providerName === 'auto') {
      this.currentProvider = 'gemini';
      this.aiEnabled = true;
      return true;
    }
    
    if (this.providers.has(providerName)) {
      this.currentProvider = providerName;
      this.aiEnabled = true;
      return true;
    }
    
    if (providerName === 'off') {
      this.aiEnabled = false;
      return true;
    }
    
    return false;
  }
  
  isEnabled() {
    return this.aiEnabled && this.aiChatEnabled;
  }
  
  async generateReply(text, context = {}) {
    // Simplified reply generation for chat mentions
    try {
      const userId = context.userId || 'unknown';
      const userName = context.userName || 'User';
      
      // Build simple prompt
      const prompt = `You are a music bot. User "${userName}" said: "${text}". Respond briefly (1-2 sentences).`;
      
      // Use current provider
      let response = null;
      
      if (this.currentProvider === 'gemini') {
        response = await this.providers.get('gemini').generate(prompt);
      } else if (this.currentProvider === 'openai') {
        response = await this.providers.get('openai').generate(prompt);
      } else if (this.currentProvider === 'huggingface') {
        response = await this.providers.get('huggingface').generate(prompt);
      }
      
      // Truncate to max tokens
      if (response && response.length > this.config.aiMaxTokens) {
        response = response.substring(0, this.config.aiMaxTokens) + '...';
      }
      
      return response;
    } catch (error) {
      this.logger.error(`AI reply error: ${error.message}`);
      return null;
    }
  }

  toggleAI() {
    this.aiEnabled = !this.aiEnabled;
    return this.aiEnabled;
  }

  toggleAIChat() {
    this.aiChatEnabled = !this.aiChatEnabled;
    return this.aiChatEnabled;
  }

  getProviderStatus() {
    const openai = this.providers.get('openai');
    const gemini = this.providers.get('gemini');
    const hf = this.providers.get('huggingface');
    
    return {
      openai: { enabled: openai.enabled, model: openai.model },
      gemini: { enabled: gemini.enabled, model: gemini.model },
      huggingface: { enabled: hf.enabled, model: hf.model },
      current: this.currentProvider,
      aiEnabled: this.aiEnabled,
      aiChatEnabled: this.aiChatEnabled
    };
  }
}

module.exports = AIManager;
