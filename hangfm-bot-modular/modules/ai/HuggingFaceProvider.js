/**
 * HuggingFaceProvider - HuggingFace API integration
 */
const axios = require('axios');

class HuggingFaceProvider {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.apiKey = config.huggingfaceApiKey;
    this.model = config.huggingfaceModel || 'meta-llama/Llama-3.2-3B-Instruct';
    this.fallbackModel = config.huggingfaceFallbackModel || 'mistralai/Mistral-7B-Instruct-v0.2';
    this.enabled = config.huggingfaceEnabled && this.apiKey && this.apiKey !== 'your_huggingface_key_here';
  }

  async generate(prompt, context = {}) {
    if (!this.enabled) {
      this.logger.debug('HuggingFace not enabled or configured');
      return null;
    }

    try {
      const response = await this._callModel(this.model, prompt, context);
      if (response) return response;
      
      // Try fallback model
      this.logger.log(`🔄 Trying HuggingFace fallback model: ${this.fallbackModel}`);
      return await this._callModel(this.fallbackModel, prompt, context);
    } catch (error) {
      this.logger.error(`HuggingFace error: ${error.message}`);
      return null;
    }
  }

  async _callModel(model, prompt, context = {}) {
    try {
      // Build system instructions aligned with current mood
      const moodContext = context.mood ? `Current user mood: ${context.mood}. ` : '';
      const interactionContext = context.interactions > 0 ? `You've talked to this user ${context.interactions} times before. ` : '';
      
      // Personality adapts based on nuanced mood tiers
      let basePersona = 'helpful and straightforward';
      if (context.mood === 'enthusiastic') basePersona = 'extra friendly, playful, and warm';
      else if (context.mood === 'positive') basePersona = 'friendly and witty';
      else if (context.mood === 'annoyed') basePersona = 'moderately sarcastic and cheeky';
      else if (context.mood === 'hostile') basePersona = 'very sarcastic, blunt, and dismissive';
      else if (context.mood === 'negative') basePersona = 'sarcastic and blunt';
      
      const systemInstructions = `You are a ${basePersona} music bot. ${moodContext}${interactionContext}You understand pop culture references and respond naturally. NEVER explain your personality. Match user energy. For music facts: use only metadata from the prompt. For everything else: be natural and get references. NEVER give one-word responses. NEVER ask questions. Give 2-3 sentences.`;
      
      // Build messages array with conversation history
      const messages = [
        {
          role: "system",
          content: systemInstructions
        }
      ];
      
      // Add conversation history if available
      if (context.conversationHistory && context.conversationHistory.length > 0) {
        for (const msg of context.conversationHistory) {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        }
      }
      
      // Add current prompt
      messages.push({
        role: "user",
        content: prompt
      });
      
      const response = await axios.post(
        'https://router.huggingface.co/v1/chat/completions',
        {
          model: model,
          messages: messages,
          max_tokens: 200,
          temperature: 0.7,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 20000
        }
      );
      
      const text = response.data?.choices?.[0]?.message?.content?.trim();
      if (text) {
        this.logger.debug(`HuggingFace response: ${text.substring(0, 50)}...`);
        return text;
      }
      
      return null;
    } catch (error) {
      this.logger.debug(`HuggingFace model ${model} error: ${error.message}`);
      return null;
    }
  }

  async checkContent(prompt) {
    if (!this.enabled) return null;
    
    try {
      const response = await axios.post(
        'https://router.huggingface.co/v1/chat/completions',
        {
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 10
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      return response.data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
      this.logger.debug(`HuggingFace content check error: ${error.message}`);
      return null;
    }
  }
}

module.exports = HuggingFaceProvider;
