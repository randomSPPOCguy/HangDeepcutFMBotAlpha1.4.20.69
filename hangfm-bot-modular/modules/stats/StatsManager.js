/**
 * StatsManager - Manages user stats, song stats, and learned artists
 * Loads/saves data from project root (shared with original bot)
 */
const fs = require('fs');
const path = require('path');

class StatsManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    
    // Stats maps
    this.userStats = new Map();
    this.songStats = new Map();
    this.learnedArtists = new Set();
    this.userStrikes = new Map();
    this.roomSongHistory = [];
    
    // Config
    this.defaultBankroll = 1000;
    this.maxStrikes = 3;
    
    // Data file paths (in project root, shared with original bot)
    const projectRoot = config.projectRoot || path.resolve(__dirname, '../../..');
    this.userStatsPath = path.join(projectRoot, 'user-stats.json');
    this.songStatsPath = path.join(projectRoot, 'song-stats.json');
    this.userArtistsPath = path.join(projectRoot, 'user-artists.json');
    this.learnedArtistsPath = path.join(projectRoot, 'bot-learned-artists.json');
    this.strikesPath = path.join(projectRoot, 'bot-strikes.json');
  }

  load() {
    try {
      // Load user stats
      if (fs.existsSync(this.userStatsPath)) {
        const data = JSON.parse(fs.readFileSync(this.userStatsPath, 'utf8'));
        Object.entries(data).forEach(([userId, stats]) => {
          // Skip bot's own stats
          if (userId === this.config.userId) return;
          
          this.userStats.set(userId, {
            bankroll: stats.bankroll || this.defaultBankroll,
            pokerWins: stats.pokerWins || 0,
            pokerTotal: stats.pokerTotal || 0,
            upvotes: stats.upvotes || 0,
            downvotes: stats.downvotes || 0,
            stars: stats.stars || 0,
            artists: new Map()
          });
        });
        this.logger.info(`✅ Loaded ${this.userStats.size} user stats`);
      }
      
      // Load song stats
      if (fs.existsSync(this.songStatsPath)) {
        const data = JSON.parse(fs.readFileSync(this.songStatsPath, 'utf8'));
        Object.entries(data).forEach(([songKey, stats]) => {
          // Skip bot songs
          if (stats.firstPlayer === this.config.userId) return;
          this.songStats.set(songKey, stats);
        });
        this.logger.info(`✅ Loaded ${this.songStats.size} song stats`);
      }
      
      // Load user artists (top 3 per user)
      if (fs.existsSync(this.userArtistsPath)) {
        const data = JSON.parse(fs.readFileSync(this.userArtistsPath, 'utf8'));
        Object.entries(data).forEach(([userId, artistCounts]) => {
          // Skip bot's artists
          if (userId === this.config.userId) return;
          
          const userStats = this.userStats.get(userId);
          if (userStats) {
            userStats.artists = new Map(Object.entries(artistCounts));
          }
        });
        this.logger.info(`✅ Loaded user artist lists`);
      }
      
      // Load learned artists
      if (fs.existsSync(this.learnedArtistsPath)) {
        const data = JSON.parse(fs.readFileSync(this.learnedArtistsPath, 'utf8'));
        if (data.learnedArtists && Array.isArray(data.learnedArtists)) {
          data.learnedArtists.forEach(artist => this.learnedArtists.add(artist));
        }
        if (data.roomSongHistory && Array.isArray(data.roomSongHistory)) {
          this.roomSongHistory = data.roomSongHistory;
        }
        this.logger.info(`✅ Loaded ${this.learnedArtists.size} learned artists`);
      }
      
      // Load strikes data
      if (fs.existsSync(this.strikesPath)) {
        const data = JSON.parse(fs.readFileSync(this.strikesPath, 'utf8'));
        if (data.userStrikes) {
          Object.entries(data.userStrikes).forEach(([k, v]) => this.userStrikes.set(k, v));
        }
        this.logger.info(`✅ Loaded ${this.userStrikes.size} strike records`);
      }
      
      this.logger.info('📊 All stats loaded successfully');
    } catch (e) {
      this.logger.error(`Failed to load stats: ${e.message}`);
    }
  }

  save() {
    try {
      // Save user stats (skip bot)
      const userStatsObj = {};
      for (const [userId, stats] of this.userStats.entries()) {
        if (userId === this.config.userId) continue;
        userStatsObj[userId] = {
          bankroll: stats.bankroll || this.defaultBankroll,
          pokerWins: stats.pokerWins || 0,
          pokerTotal: stats.pokerTotal || 0,
          upvotes: stats.upvotes || 0,
          downvotes: stats.downvotes || 0,
          stars: stats.stars || 0
        };
      }
      fs.writeFileSync(this.userStatsPath, JSON.stringify(userStatsObj, null, 2));
      
      // Save song stats (skip bot songs)
      const songStatsObj = {};
      for (const [songKey, stats] of this.songStats.entries()) {
        if (stats.firstPlayer === this.config.userId) continue;
        songStatsObj[songKey] = stats;
      }
      fs.writeFileSync(this.songStatsPath, JSON.stringify(songStatsObj, null, 2));
      
      // Save user artists (skip bot)
      const userArtistsObj = {};
      for (const [userId, stats] of this.userStats.entries()) {
        if (userId === this.config.userId) continue;
        if (stats.artists && stats.artists.size > 0) {
          userArtistsObj[userId] = Object.fromEntries(stats.artists);
        }
      }
      fs.writeFileSync(this.userArtistsPath, JSON.stringify(userArtistsObj, null, 2));
      
      // Save learned artists
      fs.writeFileSync(this.learnedArtistsPath, JSON.stringify({
        learnedArtists: Array.from(this.learnedArtists),
        roomSongHistory: this.roomSongHistory.slice(-50),
        lastUpdated: new Date().toISOString()
      }, null, 2));
      
      // Save strikes
      fs.writeFileSync(this.strikesPath, JSON.stringify({
        userStrikes: Object.fromEntries(this.userStrikes),
        lastUpdated: new Date().toISOString()
      }, null, 2));
      
      this.logger.debug('💾 Stats saved');
    } catch (e) {
      this.logger.error(`Failed to save stats: ${e.message}`);
    }
  }

  getUserStats(userId) {
    if (!this.userStats.has(userId)) {
      this.userStats.set(userId, {
        bankroll: this.defaultBankroll,
        pokerWins: 0,
        pokerTotal: 0,
        upvotes: 0,
        downvotes: 0,
        stars: 0,
        artists: new Map()
      });
    }
    return this.userStats.get(userId);
  }

  getSongStats(songKey) {
    return this.songStats.get(songKey);
  }

  getTopArtists(userId, limit = 3) {
    const userStats = this.getUserStats(userId);
    if (!userStats.artists || userStats.artists.size === 0) {
      return [];
    }
    
    return Array.from(userStats.artists.entries())
      .map(([name, plays]) => ({ name, plays }))
      .filter(artist => artist.name && artist.name.trim() !== '')
      .sort((a, b) => b.plays - a.plays)
      .slice(0, limit);
  }

  updateUserStats(userId, artistName) {
    const userStats = this.getUserStats(userId);
    const currentPlays = userStats.artists.get(artistName) || 0;
    userStats.artists.set(artistName, currentPlays + 1);
  }

  updateSongStats(songKey, userId, userName) {
    if (!this.songStats.has(songKey)) {
      this.songStats.set(songKey, {
        plays: 1,
        firstPlayer: userId,
        firstPlayerName: userName,
        likes: 0,
        dislikes: 0,
        stars: 0
      });
      this.logger.log(`🎵 NEW song: "${songKey}" first played by ${userName}`);
    } else {
      const stats = this.songStats.get(songKey);
      stats.plays++;
    }
  }

  updateReactionStats(userId, allVotes) {
    const userStats = this.getUserStats(userId);
    
    if (allVotes.like && Array.isArray(allVotes.like)) {
      const upvotes = allVotes.like.length;
      userStats.upvotes = (userStats.upvotes || 0) + upvotes;
    }
    
    if (allVotes.star && Array.isArray(allVotes.star)) {
      const stars = allVotes.star.length;
      userStats.stars = (userStats.stars || 0) + stars;
    }
  }

  updateSongReactionStats(songKey, allVotes) {
    const stats = this.songStats.get(songKey);
    if (!stats) return;
    
    if (allVotes.like && Array.isArray(allVotes.like)) {
      stats.likes = allVotes.like.length;
    }
    
    if (allVotes.star && Array.isArray(allVotes.star)) {
      stats.stars = allVotes.star.length;
    }
  }

  addStrike(userId, offense) {
    let strikeData = this.userStrikes.get(userId);
    if (!strikeData) {
      strikeData = { strikes: 0, offenses: [] };
    }
    
    strikeData.strikes++;
    strikeData.offenses.push(offense);
    this.userStrikes.set(userId, strikeData);
    
    return strikeData.strikes;
  }

  getStrikes(userId) {
    return this.userStrikes.get(userId) || { strikes: 0, offenses: [] };
  }

  addSongToHistory(entry) {
    this.roomSongHistory.push(entry);
    if (this.roomSongHistory.length > 50) {
      this.roomSongHistory = this.roomSongHistory.slice(-50);
    }
  }

  getRecentUserSongs(limit = 10) {
    return this.roomSongHistory
      .filter(entry => !entry.isBotSong && entry.djId !== this.config.userId)
      .slice(-limit);
  }
}

module.exports = StatsManager;
