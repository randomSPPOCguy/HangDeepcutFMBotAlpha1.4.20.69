// EventHandler.js
const AIManager = require('../ai/AIManager');
const SpamProtection = require('../utils/SpamProtection');
const ContentFilter = require('../features/ContentFilter');

const AI_KEYWORDS = [
  'bot',
  'b0t',
  'bot2',
  'b0+',
  'bοt',
];

function hasKeyword(text) {
  const normalizedText = text.toLowerCase();
  return AI_KEYWORDS.some((keyword) => normalizedText.includes(keyword));
}

class EventHandler {
  constructor(socketManager, cometchatManager) {
    this.socketManager = socketManager;
    this.cometchatManager = cometchatManager;
  }

  async handleChatMessage(message) {
    const text = message.text || '';

    if (!text.trim()) return;

    if (SpamProtection.isSpam(text)) {
      console.log('Spam detected, skipping message.');
      return;
    }

    const filteredText = ContentFilter.filter(text);

    if (hasKeyword(filteredText)) {
      console.log('🎯 AI keyword detected');
      const response = await AIManager.generateResponse(filteredText, message);
      if (response) {
        this.socketManager.sendMessage(response);
      }
    }
  }
}

module.exports = EventHandler;




