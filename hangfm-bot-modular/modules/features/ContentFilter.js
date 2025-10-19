/**
 * ContentFilter - AI-based hate speech and content moderation
 */
class ContentFilter {
  constructor(aiManager, logger) {
    this.ai = aiManager;
    this.logger = logger;
    this.enabled = true;
  }

  _normalizeUnsafe(res) {
    if (typeof res === 'string') return res.trim().toUpperCase() === 'UNSAFE';
    return Boolean(res); // if provider returns boolean: true means UNSAFE
  }

  async checkHatefulContent(message) {
    if (!this.enabled) return false; // treat disabled as SAFE (not unsafe)
    
    try {
      const res = await this.ai.checkHatefulContent(message);
      return this._normalizeUnsafe(res); // true => UNSAFE
    } catch (error) {
      this.logger.error(`Content check error: ${error.message}`);
      return false; // Default to safe on error
    }
  }

  async checkSongContent(artist, track) {
    if (!this.enabled) return true; // SAFE when disabled
    
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

      const res = await this.ai.checkHatefulContent(prompt);
      const isUnsafe = this._normalizeUnsafe(res);
      return !isUnsafe; // true => SAFE
    } catch (error) {
      this.logger.error(`Song content check error: ${error.message}`);
      return true; // Default to safe
    }
  }

  async checkLinkSafety(url) {
    try {
      const allowedSchemes = new Set(['http:', 'https:']);
      const safeDomains = [
        'youtube.com', 'youtu.be', 'spotify.com', 'soundcloud.com',
        'bandcamp.com', 'giphy.com', 'tenor.com', 'twitter.com', 'x.com',
        'instagram.com', 'reddit.com', 'discogs.com', 'last.fm',
        'wikipedia.org', 'hang.fm', 'tt.fm'
      ];
      const suspiciousPatterns = [
        /bit\.ly|tinyurl|goo\.gl/i,
        /\.ru\b|\.cn\b/i,
        /discord\.gg/i,
        /\.(exe|dmg|apk|zip|scr|bat|ps1)(\b|$)/i
      ];

      const u = new URL(url);

      // 1) scheme allow-list
      if (!allowedSchemes.has(u.protocol)) return true; // suspicious

      // 2) strict domain match: exact or subdomain of safelist
      const domain = u.hostname.replace(/^www\./, '').toLowerCase();
      const isWhitelisted = safeDomains.some(sd =>
        domain === sd || domain.endsWith('.' + sd)
      );
      if (isWhitelisted) return false; // safe

      // 3) obvious suspicious patterns
      if (suspiciousPatterns.some(rx => rx.test(url))) return true;

      // 4) data/javascript guards (belt-and-suspenders)
      if (/^(javascript:|data:)/i.test(url)) return true;

      return false; // default: not obviously suspicious
    } catch (error) {
      this.logger.error(`Link safety check error: ${error.message}`);
      return false; // Default to safe on parse error
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

module.exports = ContentFilter;
