// hangfm-bot-modular/modules/utils/ContentFilter.js
// Simple content filter

class ContentFilter {
  static isAllowed(text) {
    if (!text || typeof text !== 'string') return false;
    
    // Block very obvious slurs/hate speech keywords
    const bannedWords = ['nigger', 'nigga', 'faggot', 'retard'];
    const lowerText = text.toLowerCase();
    
    for (const word of bannedWords) {
      if (lowerText.includes(word)) {
        console.log(`🚫 [ContentFilter] Blocked message containing: ${word}`);
        return false;
      }
    }
    
    return true;
  }
}

module.exports = ContentFilter;

