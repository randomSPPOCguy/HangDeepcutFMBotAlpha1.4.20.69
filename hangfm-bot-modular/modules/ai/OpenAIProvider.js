/**
 * OpenAIProvider - OpenAI API integration
 */
const axios = require('axios');

class OpenAIProvider {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.apiKey = config.openaiApiKey;
    this.model = config.openaiModel || 'gpt-4o-mini';
    this.enabled = config.openaiEnabled && this.apiKey && this.apiKey !== 'sk-proj-your_openai_key_here';
  }

  async generate(prompt, context = {}) {
    if (!this.enabled) {
      this.logger.debug('OpenAI not enabled or configured');
      return null;
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
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
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      
      const text = response.data.choices[0].message.content.trim();
      this.logger.debug(`OpenAI response: ${text.substring(0, 50)}...`);
      return text;
    } catch (error) {
      this.logger.error(`OpenAI error: ${error.response?.status} ${error.message}`);
      return null;
    }
  }

  async checkContent(prompt) {
    if (!this.enabled) return null;
    
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
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
      this.logger.debug(`OpenAI content check error: ${error.message}`);
      return null;
    }
  }
}

module.exports = OpenAIProvider;
