/**
 * GeminiProvider - Google Gemini API integration
 */
const axios = require('axios');

class GeminiProvider {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.apiKey = config.geminiApiKey;
    this.model = config.geminiModel || 'gemini-2.5-flash';
    this.enabled = config.geminiEnabled && this.apiKey && this.apiKey !== 'your_gemini_key_here';
  }

  async generate(prompt, context = {}) {
    if (!this.enabled) {
      this.logger.debug('Gemini not enabled or configured');
      return null;
    }

    try {
      // Build system instructions with mood awareness
      const moodContext = context.mood ? `Current user mood: ${context.mood}. ` : '';
      const interactionContext = context.interactions > 0 ? `You've talked to this user ${context.interactions} times before. ` : '';
      
      const systemInstructions = `You are a chill, sarcastic music bot. ${moodContext}${interactionContext}You understand pop culture references and respond naturally. NEVER explain your personality or say 'I'm here to help'. Just BE sarcastic. Match user energy - joke back if joking, be snarky if rude. For music facts: use only metadata. For everything else: be natural and get references. NEVER give one-word responses. NEVER ask questions. Give 2-3 sentences.\n\n`;
      
      // Build conversation history for Gemini format
      const contents = [];
      
      // Add conversation history if available
      if (context.conversationHistory && context.conversationHistory.length > 0) {
        for (const msg of context.conversationHistory) {
          contents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          });
        }
      }
      
      // Add current prompt
      contents.push({
        role: 'user',
        parts: [{ text: systemInstructions + prompt }]
      });
      
      const requestPayload = {
        contents: contents,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1024
        }
      };
      
      // Disable thinking for faster responses
      if (this.model.includes('2.5-flash') || this.model.includes('2.0-flash')) {
        requestPayload.generationConfig.thinkingConfig = {
          thinkingBudget: 0
        };
      }
      
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        requestPayload,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );
      
      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const text = response.data.candidates[0].content.parts[0].text.trim();
        this.logger.debug(`Gemini response: ${text.substring(0, 50)}...`);
        return text;
      }
      
      this.logger.warn('Gemini returned no valid response');
      return null;
    } catch (error) {
      this.logger.error(`Gemini error: ${error.response?.status} ${error.message}`);
      return null;
    }
  }

  async checkContent(prompt) {
    if (!this.enabled) return null;
    
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
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
      this.logger.debug(`Gemini content check error: ${error.message}`);
      return null;
    }
  }
}

module.exports = GeminiProvider;
