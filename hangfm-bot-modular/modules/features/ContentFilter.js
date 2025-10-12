/**
 * ContentFilter - AI-based hate speech and content moderation
 */
class ContentFilter {
  constructor(aiManager, logger) {
    this.ai = aiManager;
    this.logger = logger;
    this.enabled = true;
  }

  async checkHatefulContent(message) {
    if (!this.enabled) return false;
    
    try {
      return await this.ai.checkHatefulContent(message);
    } catch (error) {
      this.logger.error(`Content check error: ${error.message}`);
      return false; // Default to safe on error
    }
  }

  async checkSongContent(artist, track) {
    if (!this.enabled) return true;
    
    try {
      const prompt = `You are a content moderation system. Analyze this song and determine if it contains hateful, discriminatory, or offensive content.

Song: "${artist} - ${track}"

Check if this song is known to contain:
- Homophobic content or slurs
- Racist content or slurs
- Sexist content or slurs
- Other hateful or discriminatory content
- Extreme violence glorification

Respond with ONLY one word:
- "SAFE" if the song is appropriate
- "UNSAFE" if the song contains hateful content

If you're unsure, respond with "SAFE".

Response:`;

      const response = await this.ai.checkHatefulContent(prompt);
      return !response; // Returns true if safe, false if unsafe
    } catch (error) {
      this.logger.error(`Song content check error: ${error.message}`);
      return true; // Default to safe
    }
  }

  async checkLinkSafety(url) {
    try {
      const safeDomains = [
        'youtube.com', 'youtu.be', 'spotify.com', 'soundcloud.com',
        'bandcamp.com', 'giphy.com', 'tenor.com', 'twitter.com',
        'instagram.com', 'reddit.com', 'discogs.com', 'last.fm',
        'wikipedia.org', 'hang.fm', 'tt.fm'
      ];
      
      const suspiciousPatterns = [
        /bit\.ly|tinyurl|goo\.gl/i,
        /\.ru\b|\.cn\b/i,
        /discord\.gg/i,
        /\.exe|\.dmg|\.apk|\.zip/i
      ];
      
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      
      const isWhitelisted = safeDomains.some(safeDomain => domain.includes(safeDomain));
      if (isWhitelisted) return false;
      
      const hasSuspicious = suspiciousPatterns.some(pattern => pattern.test(url));
      return hasSuspicious;
    } catch (error) {
      this.logger.error(`Link safety check error: ${error.message}`);
      return false;
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

module.exports = ContentFilter;
