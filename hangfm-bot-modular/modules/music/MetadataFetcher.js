/**
 * MetadataFetcher - Fetches song metadata from Spotify, MusicBrainz, Wikipedia, Discogs
 */
const axios = require('axios');

class MetadataFetcher {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.spotifyAccessToken = null;
  }

  async getSpotifyAccessToken() {
    try {
      if (!this.config.spotifyEnabled || !this.config.spotifyClientId) return null;
      
      const auth = Buffer.from(`${this.config.spotifyClientId}:${this.config.spotifyClientSecret}`).toString('base64');
      const response = await axios.post(
        'https://accounts.spotify.com/api/token',
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 5000
        }
      );
      
      this.spotifyAccessToken = response.data.access_token;
      this.logger.debug('✅ Spotify access token obtained');
      return this.spotifyAccessToken;
    } catch (error) {
      this.logger.error(`Spotify auth error: ${error.message}`);
      return null;
    }
  }

  async searchSpotify(artist, track) {
    try {
      if (!this.config.spotifyEnabled) return null;
      
      if (!this.spotifyAccessToken) {
        await this.getSpotifyAccessToken();
      }
      
      if (!this.spotifyAccessToken) return null;
      
      const query = `artist:${artist} track:${track}`;
      const response = await axios.get(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
        {
          headers: {
            'Authorization': `Bearer ${this.spotifyAccessToken}`
          },
          timeout: 5000
        }
      );
      
      if (response.data?.tracks?.items?.[0]) {
        const spotifyTrack = response.data.tracks.items[0];
        
        // Get artist genres
        let artistGenres = [];
        if (spotifyTrack.artists?.[0]?.id) {
          try {
            const artistId = spotifyTrack.artists[0].id;
            const artistResponse = await axios.get(
              `https://api.spotify.com/v1/artists/${artistId}`,
              {
                headers: { 'Authorization': `Bearer ${this.spotifyAccessToken}` },
                timeout: 5000
              }
            );
            artistGenres = artistResponse.data?.genres || [];
          } catch (e) {
            this.logger.debug(`Could not fetch artist genres: ${e.message}`);
          }
        }
        
        return {
          album: spotifyTrack.album.name,
          releaseDate: spotifyTrack.album.release_date,
          year: spotifyTrack.album.release_date?.substring(0, 4),
          popularity: spotifyTrack.popularity,
          genres: artistGenres.length > 0 ? artistGenres : (spotifyTrack.album.genres || []),
          artistName: spotifyTrack.artists[0]?.name || artist
        };
      }
      
      return null;
    } catch (error) {
      if (error.response?.status === 401) {
        this.spotifyAccessToken = null;
        return await this.searchSpotify(artist, track);
      }
      this.logger.debug(`Spotify search failed: ${error.message}`);
      return null;
    }
  }

  async searchMusicBrainz(artist, track) {
    try {
      const response = await axios.get(`https://musicbrainz.org/ws/2/recording`, {
        params: {
          query: `recording:"${track}" AND artist:"${artist}"`,
          fmt: 'json',
          limit: 5,
          inc: 'releases'
        },
        headers: {
          'User-Agent': this.config.musicbrainzUserAgent || 'HangBot/1.0'
        },
        timeout: 10000
      });
      
      if (response.data?.recordings?.[0]?.releases?.[0]) {
        const release = response.data.recordings[0].releases[0];
        return {
          album: release.title,
          year: release.date?.substring(0, 4),
          source: 'MusicBrainz'
        };
      }
      
      return null;
    } catch (error) {
      this.logger.debug(`MusicBrainz error: ${error.message}`);
      return null;
    }
  }

  async searchWikipedia(artist, track) {
    try {
      const headers = {
        'User-Agent': this.config.wikipediaUserAgent || 'HangBot/1.0'
      };
      
      if (this.config.wikipediaAccessToken) {
        headers['Authorization'] = `Bearer ${this.config.wikipediaAccessToken}`;
      }
      
      const response = await axios.get(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artist)}`,
        { headers, timeout: 10000 }
      );
      
      if (response.data?.extract) {
        const extract = response.data.extract;
        return {
          summary: extract,
          source: 'Wikipedia'
        };
      }
      
      return null;
    } catch (error) {
      this.logger.debug(`Wikipedia error: ${error.message}`);
      return null;
    }
  }

  async searchDiscogs(artist, track = null) {
    try {
      if (!this.config.discogsEnabled || !this.config.discogsToken) return null;
      
      const query = track ? `${artist} ${track}` : artist;
      const response = await axios.get(
        `https://api.discogs.com/database/search?q=${encodeURIComponent(query)}&type=release&format=album`,
        {
          headers: {
            'Authorization': `Discogs token=${this.config.discogsToken}`,
            'User-Agent': 'HangBot/1.0'
          },
          timeout: 5000
        }
      );
      
      if (response.data?.results?.[0]) {
        const release = response.data.results[0];
        return {
          title: release.title,
          year: release.year,
          label: release.label?.[0],
          genre: release.genre?.[0],
          style: release.style?.[0],
          country: release.country
        };
      }
      
      return null;
    } catch (error) {
      this.logger.debug(`Discogs search failed: ${error.message}`);
      return null;
    }
  }

  async fetchSongMetadata(artist, track) {
    try {
      // Try Spotify first
      if (this.config.spotifyEnabled) {
        const spotifyData = await this.searchSpotify(artist, track);
        if (spotifyData && spotifyData.album !== 'Single') {
          return {
            album: spotifyData.album,
            year: spotifyData.year || 'Unknown Year',
            source: 'Spotify'
          };
        }
      }
      
      // Try MusicBrainz
      const mbData = await this.searchMusicBrainz(artist, track);
      if (mbData && mbData.album !== 'Single') {
        return mbData;
      }
      
      // Try Discogs
      if (this.config.discogsEnabled) {
        const discogsData = await this.searchDiscogs(artist, track);
        if (discogsData?.title) {
          return {
            album: discogsData.title,
            year: discogsData.year || 'Unknown Year',
            source: 'Discogs'
          };
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error fetching metadata: ${error.message}`);
      return null;
    }
  }
}

module.exports = MetadataFetcher;
