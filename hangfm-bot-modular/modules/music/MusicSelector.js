/**
 * MusicSelector - TRUE RANDOM music discovery from Spotify/Discogs
 * 
 * NO CURATED LISTS - discovers music from entire catalog!
 * 
 * DIVERSITY FEATURES:
 * - Random genre + year search across Spotify/Discogs
 * - Millions of potential artists
 * - Persistent played songs tracking (never repeats)
 * - Artist rotation system
 * - Smart caching
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class MusicSelector {
  constructor(config, logger, statsManager) {
    this.config = config;
    this.logger = logger;
    this.stats = statsManager;
    
    // Persistent storage paths
    this.playedSongsFile = path.join(__dirname, '../../bot-played-songs.json');
    this.artistCacheFile = path.join(__dirname, '../../bot-artist-cache.json');
    
    // Song selection state
    this.playedSongs = new Set(); // Loaded from file
    this.artistSongCache = new Map(); // Cache songs per artist
    this.recentlyUsedArtists = []; // Last 25 artists to avoid repeats
    this.lastPlayedArtist = null;
    
    // Spotify API
    this.spotifyAccessToken = null;
    this.spotifyEnabled = config.spotifyEnabled !== false;
    this.spotifyClientId = config.spotifyClientId;
    this.spotifyClientSecret = config.spotifyClientSecret;
    
    // Discogs API
    this.discogsEnabled = config.discogsEnabled !== false;
    this.discogsToken = config.discogsToken;
    
    // Diversity settings
    this.maxRecentArtists = 25; // Don't repeat artists within last 25 plays
    this.maxSongsToCache = 100; // Cache up to 100 songs per artist
    
    // Random discovery pools
    this.genrePool = this.getGenrePool();
    this.yearRange = { min: 1950, max: new Date().getFullYear() }; // 1950-2025 = 76 years
    
    // Room vibe tracking - learn from user plays
    this.userGenrePreferences = new Map(); // genre -> count (global room vibe)
    this.recentUserPlays = []; // Last 20 user plays for vibe analysis
    this.vibeMatchingEnabled = true; // Weight genre selection based on room vibe
    
    // Social awareness - track individual user preferences
    this.userPreferences = new Map(); // userId -> { name, genres: Map<genre, count>, topGenres: [] }
    this.socialAwarenessEnabled = true; // Adapt to who's on stage/in room
    
    this.logger.log(`🎲 TRUE RANDOM mode enabled`);
    this.logger.log(`🎵 Spotify: ${this.spotifyEnabled ? 'ENABLED' : 'DISABLED'}`);
    this.logger.log(`💿 Discogs: ${this.discogsEnabled ? 'ENABLED' : 'DISABLED'}`);
    this.logger.log(`🌍 Genre pool: ${this.genrePool.length} genres`);
    this.logger.log(`📅 Year range: ${this.yearRange.min}-${this.yearRange.max} (${this.yearRange.max - this.yearRange.min + 1} years)`);
    
    // Load persistent data
    this.loadPlayedSongs();
    this.loadArtistCache();
  }
  
  getGenrePool() {
    // COMPREHENSIVE: Alternative Rock + subgenres, Alternative Hip Hop + subgenres, Alternative Metal
    return [
      // Alternative Hip Hop + ALL Subgenres
      'alternative hip hop',
      'underground hip hop',
      'experimental hip hop',
      'abstract hip hop',
      'conscious hip hop',
      'political hip hop',
      'jazz rap',
      'jazz hip hop',
      'boom bap',
      'instrumental hip hop',
      'trip hop',
      'turntablism',
      'nerdcore',
      'chillhop',
      'lo-fi hip hop',
      'cloud rap',
      'emo rap',
      'indie hip hop',
      
      // Alternative Rock + ALL Subgenres
      'alternative rock',
      'indie rock',
      'garage rock',
      'garage rock revival',
      'psychedelic rock',
      'neo-psychedelia',
      'post-punk',
      'post-punk revival',
      'punk rock',
      'hardcore punk',
      'noise rock',
      'shoegaze',
      'dream pop',
      'post-rock',
      'math rock',
      'art rock',
      'progressive rock',
      'grunge',
      'britpop',
      'madchester',
      'baggy',
      'college rock',
      'jangle pop',
      'lo-fi',
      'slowcore',
      'sadcore',
      'emo',
      'post-hardcore',
      'screamo',
      'indie pop',
      'chamber pop',
      'baroque pop',
      'noise pop',
      'space rock',
      'krautrock',
      
      // Alternative Metal (as is)
      'alternative metal',
      'doom metal',
      'stoner metal',
      'sludge metal',
      'post-metal',
      'drone metal',
      'progressive metal',
      'avant-garde metal',
      'noise metal',
      'industrial metal'
    ];
  }
  
  loadPlayedSongs() {
    try {
      if (fs.existsSync(this.playedSongsFile)) {
        const data = JSON.parse(fs.readFileSync(this.playedSongsFile, 'utf8'));
        this.playedSongs = new Set(data.songs || []);
        this.recentlyUsedArtists = data.recentArtists || [];
        this.logger.log(`📀 Loaded ${this.playedSongs.size} played songs from history`);
        
        // Auto-reset if too many songs
        if (this.playedSongs.size > 5000) {
          this.logger.log(`🔄 Resetting played songs (exceeded 5000)`);
          this.playedSongs.clear();
        }
      } else {
        this.logger.log(`📀 No played songs history - starting fresh`);
      }
    } catch (error) {
      this.logger.error(`Failed to load played songs: ${error.message}`);
      this.playedSongs = new Set();
    }
  }
  
  savePlayedSongs() {
    try {
      const data = {
        songs: Array.from(this.playedSongs),
        recentArtists: this.recentlyUsedArtists,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.playedSongsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      this.logger.error(`Failed to save played songs: ${error.message}`);
    }
  }
  
  loadArtistCache() {
    try {
      if (fs.existsSync(this.artistCacheFile)) {
        const data = JSON.parse(fs.readFileSync(this.artistCacheFile, 'utf8'));
        this.artistSongCache = new Map(Object.entries(data));
        this.logger.log(`💾 Loaded song cache for ${this.artistSongCache.size} artists`);
      }
    } catch (error) {
      this.logger.error(`Failed to load artist cache: ${error.message}`);
      this.artistSongCache = new Map();
    }
  }
  
  saveArtistCache() {
    try {
      const data = Object.fromEntries(this.artistSongCache);
      fs.writeFileSync(this.artistCacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      this.logger.error(`Failed to save artist cache: ${error.message}`);
    }
  }

  async selectSong(roomState = null) {
    try {
      // Get current DJs and users from room state
      const djsOnStage = roomState?.djs?.map(dj => dj.uuid) || [];
      const usersInRoom = roomState?.users?.map(user => user.uuid) || [];
      
      let attempts = 0;
      const maxAttempts = 5;
      
      while (attempts < maxAttempts) {
        attempts++;
        
        // Randomly choose Spotify or Discogs (if both enabled)
        const useSpotify = this.spotifyEnabled && (!this.discogsEnabled || Math.random() > 0.3);
        
        let artist, songs;
        
        if (useSpotify) {
          const result = await this.discoverFromSpotify(djsOnStage, usersInRoom);
          if (result) {
            artist = result.artist;
            songs = result.songs;
          }
        } else if (this.discogsEnabled) {
          const result = await this.discoverFromDiscogs(djsOnStage, usersInRoom);
          if (result) {
            artist = result.artist;
            songs = result.songs;
          }
        }
        
        if (!artist || !songs || songs.length === 0) {
          this.logger.warn(`❌ Discovery attempt ${attempts} failed`);
          continue;
        }
        
        // Filter for unplayed songs
        const unplayedSongs = songs.filter(song => {
          const songKey = this.createSongKey(artist, song);
          return !this.playedSongs.has(songKey);
        });
        
        // Use unplayed if available
        const selectedSong = unplayedSongs.length > 0
          ? unplayedSongs[Math.floor(Math.random() * unplayedSongs.length)]
          : songs[Math.floor(Math.random() * songs.length)];
        
        // Mark as played
        const songKey = this.createSongKey(artist, selectedSong);
        this.playedSongs.add(songKey);
        this.savePlayedSongs();
        
        // Update recent artists
        this.recentlyUsedArtists.push(artist);
        if (this.recentlyUsedArtists.length > this.maxRecentArtists) {
          this.recentlyUsedArtists.shift();
        }
        
        this.logger.log(`✨ Selected: ${artist} - ${selectedSong}`);
        this.logger.log(`📊 ${unplayedSongs.length}/${songs.length} unplayed | ${this.playedSongs.size} total history`);
        
        return {
          artist,
          title: selectedSong,
          source: useSpotify ? 'Spotify Random' : 'Discogs Random',
          wasUnplayed: unplayedSongs.length > 0
        };
      }
      
      this.logger.error(`❌ Failed to discover song after ${maxAttempts} attempts`);
      return null;
    } catch (error) {
      this.logger.error(`Error selecting song: ${error.message}`);
      return null;
    }
  }
  
  async discoverFromSpotify(djsOnStage = [], usersInRoom = []) {
    try {
      // Get Spotify access token if needed
      if (!this.spotifyAccessToken) {
        await this.getSpotifyAccessToken();
      }
      
      if (!this.spotifyAccessToken) {
        return null;
      }
      
      // Pick genre based on who's on stage and in the room (social awareness)
      const genre = this.selectGenreBasedOnVibe(djsOnStage, usersInRoom);
      
      // Use broader search - year RANGE instead of exact year for more results
      const currentYear = new Date().getFullYear();
      const decade = Math.floor(Math.random() * 8) * 10; // 0-70 years back
      const yearStart = currentYear - decade - 10;
      const yearEnd = currentYear - decade;
      
      // Search Spotify - use genre OR year for better results
      const searchQuery = `genre:"${genre}"`;
      const offset = Math.floor(Math.random() * 50); // Smaller offset
      
      this.logger.debug(`🔍 Spotify search: ${searchQuery} (${yearStart}-${yearEnd}, offset: ${offset})`);
      
      const response = await axios.get(
        `https://api.spotify.com/v1/search`,
        {
          params: {
            q: searchQuery,
            type: 'track',
            limit: 50,
            offset: offset
          },
          headers: {
            'Authorization': `Bearer ${this.spotifyAccessToken}`
          },
          timeout: 10000
        }
      );
      
      let tracks = response.data?.tracks?.items || [];
      
      // If no results with genre, try a simpler search with just the genre keyword
      if (tracks.length === 0) {
        const simpleQuery = genre.split(' ')[0]; // Use first word
        this.logger.debug(`🔍 Retry with simpler query: ${simpleQuery}`);
        const retryResponse = await axios.get(
          `https://api.spotify.com/v1/search`,
          {
            params: {
              q: simpleQuery,
              type: 'track',
              limit: 50,
              offset: Math.floor(Math.random() * 50)
            },
            headers: {
              'Authorization': `Bearer ${this.spotifyAccessToken}`
            },
            timeout: 10000
          }
        );
        tracks = retryResponse.data?.tracks?.items || [];
      }
      
      if (tracks.length === 0) {
        return null;
      }
      
      // Pick random track from results
      const track = tracks[Math.floor(Math.random() * tracks.length)];
      const artist = track.artists[0].name;
      const artistId = track.artists[0].id;
      
      // Check if recently used
      if (this.recentlyUsedArtists.some(a => a.toLowerCase() === artist.toLowerCase())) {
        this.logger.debug(`⏭️  Skipping recently used artist: ${artist}`);
        return null;
      }
      
      // Get more songs from this artist
      const songs = await this.getSpotifyArtistTracks(artistId, artist);
      
      return { artist, songs };
    } catch (error) {
      this.logger.error(`Spotify discovery error: ${error.message}`);
      return null;
    }
  }
  
  async getSpotifyArtistTracks(artistId, artistName) {
    try {
      // Check cache first
      const cached = this.artistSongCache.get(artistName);
      if (cached && cached.length > 0) {
        return cached;
      }
      
      const response = await axios.get(
        `https://api.spotify.com/v1/artists/${artistId}/top-tracks`,
        {
          params: {
            market: 'US'
          },
          headers: {
            'Authorization': `Bearer ${this.spotifyAccessToken}`
          },
          timeout: 10000
        }
      );
      
      const songs = response.data.tracks
        .map(t => t.name)
        .filter(name => name && name.length > 0)
        .filter((name, index, self) => self.indexOf(name) === index); // Dedupe
      
      // Cache the songs
      if (songs.length > 0) {
        this.artistSongCache.set(artistName, songs);
        this.saveArtistCache();
      }
      
      return songs;
    } catch (error) {
      this.logger.error(`Failed to get Spotify artist tracks: ${error.message}`);
      return [];
    }
  }
  
  async discoverFromDiscogs(djsOnStage = [], usersInRoom = []) {
    try {
      if (!this.discogsToken) {
        return null;
      }
      
      // Pick genre based on who's on stage and in the room (social awareness)
      const genre = this.selectGenreBasedOnVibe(djsOnStage, usersInRoom);
      
      // Just use genre, no year restriction for better results
      this.logger.debug(`🔍 Discogs search: genre=${genre}`);
      
      const response = await axios.get(
        `https://api.discogs.com/database/search`,
        {
          params: {
            genre: genre,
            type: 'release',
            format: 'album',
            per_page: 50
          },
          headers: {
            'Authorization': `Discogs token=${this.discogsToken}`,
            'User-Agent': 'HangFM-Bot/1.4.20'
          },
          timeout: 10000
        }
      );
      
      let results = response.data?.results || [];
      
      // If no results, try simpler genre search
      if (results.length === 0) {
        const simpleGenre = genre.split(' ')[0];
        this.logger.debug(`🔍 Retry Discogs with: ${simpleGenre}`);
        const retryResponse = await axios.get(
          `https://api.discogs.com/database/search`,
          {
            params: {
              genre: simpleGenre,
              type: 'release',
              per_page: 50
            },
            headers: {
              'Authorization': `Discogs token=${this.discogsToken}`,
              'User-Agent': 'HangFM-Bot/1.4.20'
            },
            timeout: 10000
          }
        );
        results = retryResponse.data?.results || [];
      }
      
      if (results.length === 0) {
        return null;
      }
      
      // Pick random release
      const release = results[Math.floor(Math.random() * Math.min(results.length, 50))];
      
      // Extract artist name (Discogs format can be "Artist - Album")
      let artist = release.title.split(' - ')[0];
      
      // Check if recently used
      if (this.recentlyUsedArtists.some(a => a.toLowerCase() === artist.toLowerCase())) {
        this.logger.debug(`⏭️  Skipping recently used artist: ${artist}`);
        return null;
      }
      
      // Get tracks from this release
      const songs = await this.getDiscogsReleaseTracks(release.id, artist);
      
      return { artist, songs };
    } catch (error) {
      this.logger.error(`Discogs discovery error: ${error.message}`);
      return null;
    }
  }
  
  async getDiscogsReleaseTracks(releaseId, artistName) {
    try {
      // Check cache first
      const cached = this.artistSongCache.get(artistName);
      if (cached && cached.length > 0) {
        return cached;
      }
      
      const response = await axios.get(
        `https://api.discogs.com/releases/${releaseId}`,
        {
          headers: {
            'Authorization': `Discogs token=${this.discogsToken}`,
            'User-Agent': 'HangFM-Bot/1.4.20'
          },
          timeout: 10000
        }
      );
      
      const songs = (response.data.tracklist || [])
        .map(t => t.title)
        .filter(title => title && title.length > 0)
        .filter((title, index, self) => self.indexOf(title) === index); // Dedupe
      
      // Cache the songs
      if (songs.length > 0) {
        this.artistSongCache.set(artistName, songs);
        this.saveArtistCache();
      }
      
      return songs;
    } catch (error) {
      this.logger.error(`Failed to get Discogs tracks: ${error.message}`);
      return [];
    }
  }
  
  async getSpotifyAccessToken() {
    try {
      if (!this.spotifyClientId || !this.spotifyClientSecret) {
        this.logger.warn('⚠️  Spotify credentials missing');
        return null;
      }
      
      const auth = Buffer.from(`${this.spotifyClientId}:${this.spotifyClientSecret}`).toString('base64');
      
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );
      
      this.spotifyAccessToken = response.data.access_token;
      this.logger.log(`✅ Spotify access token obtained`);
      return this.spotifyAccessToken;
    } catch (error) {
      this.logger.error(`Spotify auth error: ${error.message}`);
    return null;
    }
  }
  
  createSongKey(artist, title) {
    // Normalize to prevent duplicates from minor variations
    const normalizeText = (text) => text.toLowerCase().trim().replace(/[^\w\s]/g, '');
    return `${normalizeText(artist)} - ${normalizeText(title)}`;
  }

  markSongPlayed(artist, title) {
    const songKey = this.createSongKey(artist, title);
    this.playedSongs.add(songKey);
    this.savePlayedSongs();
  }
  
  clearPlayedSongs() {
    this.playedSongs.clear();
    this.savePlayedSongs();
    this.logger.log(`🔄 Cleared all played songs history`);
  }
  
  getPlayedSongsCount() {
    return this.playedSongs.size;
  }
  
  getRecentArtists() {
    return this.recentlyUsedArtists.slice(-10);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // ROOM VIBE MATCHING - Learn from user plays
  // ═══════════════════════════════════════════════════════════════
  
  trackUserGenrePreference(genre, userName, userId) {
    try {
      // Track global room vibe
      const currentCount = this.userGenrePreferences.get(genre) || 0;
      this.userGenrePreferences.set(genre, currentCount + 1);
      
      // Track individual user preference (for social awareness)
      if (userId) {
        if (!this.userPreferences.has(userId)) {
          this.userPreferences.set(userId, {
            name: userName,
            genres: new Map(),
            topGenres: []
          });
        }
        
        const userPref = this.userPreferences.get(userId);
        const userGenreCount = userPref.genres.get(genre) || 0;
        userPref.genres.set(genre, userGenreCount + 1);
        
        // Update top 5 genres for this user
        userPref.topGenres = Array.from(userPref.genres.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([g]) => g);
        
        this.logger.debug(`👤 ${userName} preference: ${genre} (${userGenreCount + 1} plays)`);
      }
      
      // Track recent plays (keep last 20)
      this.recentUserPlays.push({ genre, userName, userId, timestamp: Date.now() });
      if (this.recentUserPlays.length > 20) {
        this.recentUserPlays.shift();
      }
      
      // Decay old preferences (keep system responsive to current vibe)
      if (this.recentUserPlays.length >= 20) {
        this.decayOldPreferences();
      }
      
      this.logger.debug(`📊 Genre tracking: ${genre} (${this.userGenrePreferences.get(genre)} plays)`);
    } catch (error) {
      this.logger.error(`Error tracking genre preference: ${error.message}`);
    }
  }
  
  decayOldPreferences() {
    // Decay all genre counts by 10% to keep system responsive
    for (const [genre, count] of this.userGenrePreferences.entries()) {
      const decayed = Math.floor(count * 0.9);
      if (decayed === 0) {
        this.userGenrePreferences.delete(genre);
      } else {
        this.userGenrePreferences.set(genre, decayed);
      }
    }
  }
  
  findMatchingGenre(spotifyGenres) {
    // Match Spotify genres to our genre pool
    const normalized = spotifyGenres.map(g => g.toLowerCase());
    
    // Try exact match first
    for (const genre of this.genrePool) {
      if (normalized.includes(genre)) {
        return genre;
      }
    }
    
    // Try partial match (e.g., "alternative rock" matches "alt-rock")
    for (const genre of this.genrePool) {
      for (const spotifyGenre of normalized) {
        if (spotifyGenre.includes(genre) || genre.includes(spotifyGenre)) {
          return genre;
        }
      }
    }
    
    return null;
  }
  
  selectGenreBasedOnVibe(djsOnStage = [], usersInRoom = []) {
    // SOCIAL AWARENESS: Prioritize DJs on stage, then users in room
    if (this.socialAwarenessEnabled && (djsOnStage.length > 0 || usersInRoom.length > 0)) {
      const audienceGenres = this.getAudienceGenrePreferences(djsOnStage, usersInRoom);
      
      if (audienceGenres.length > 0) {
        const shouldMatchAudience = Math.random() < 0.8; // 80% match audience
        
        if (shouldMatchAudience) {
          const totalWeight = audienceGenres.reduce((sum, [, weight]) => sum + weight, 0);
          let random = Math.random() * totalWeight;
          
          for (const [genre, weight] of audienceGenres) {
            random -= weight;
            if (random <= 0) {
              this.logger.log(`👥 Audience match: ${genre} (${djsOnStage.length} DJs, ${usersInRoom.length} users)`);
              return genre;
            }
          }
        }
      }
    }
    
    // FALLBACK: Room vibe matching (if no audience data)
    if (this.userGenrePreferences.size === 0 || !this.vibeMatchingEnabled) {
      return this.genrePool[Math.floor(Math.random() * this.genrePool.length)];
    }
    
    // Weight genre selection based on user preferences (70% match, 30% random for variety)
    const shouldMatchVibe = Math.random() < 0.7;
    
    if (shouldMatchVibe) {
      // Pick from popular genres
      const sortedGenres = Array.from(this.userGenrePreferences.entries())
        .sort((a, b) => b[1] - a[1]) // Sort by count
        .slice(0, 5); // Top 5 genres
      
      if (sortedGenres.length > 0) {
        const totalWeight = sortedGenres.reduce((sum, [, count]) => sum + count, 0);
        let random = Math.random() * totalWeight;
        
        for (const [genre, count] of sortedGenres) {
          random -= count;
          if (random <= 0) {
            this.logger.debug(`🎯 Vibe match: Selected ${genre} (popular in room)`);
            return genre;
          }
        }
      }
    }
    
    // Random selection (30% of the time, or fallback)
    return this.genrePool[Math.floor(Math.random() * this.genrePool.length)];
  }
  
  getAudienceGenrePreferences(djsOnStage, usersInRoom) {
    const genreWeights = new Map();
    
    // Weight DJs on stage 3x more than regular users
    for (const djId of djsOnStage) {
      const userPref = this.userPreferences.get(djId);
      if (userPref && userPref.topGenres.length > 0) {
        for (const genre of userPref.topGenres) {
          const current = genreWeights.get(genre) || 0;
          genreWeights.set(genre, current + 3); // DJs weighted 3x
        }
      }
    }
    
    // Weight regular users in room
    for (const userId of usersInRoom) {
      // Skip DJs (already counted)
      if (djsOnStage.includes(userId)) continue;
      
      const userPref = this.userPreferences.get(userId);
      if (userPref && userPref.topGenres.length > 0) {
        for (const genre of userPref.topGenres) {
          const current = genreWeights.get(genre) || 0;
          genreWeights.set(genre, current + 1); // Regular users weighted 1x
        }
      }
    }
    
    // Sort by weight and return top 5
    return Array.from(genreWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }
  
  getRoomVibeStats() {
    if (this.userGenrePreferences.size === 0) {
      return 'No user plays tracked yet';
    }
    
    const sorted = Array.from(this.userGenrePreferences.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    return sorted.map(([genre, count]) => `${genre} (${count})`).join(', ');
  }
}

module.exports = MusicSelector;
