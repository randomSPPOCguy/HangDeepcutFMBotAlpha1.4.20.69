/**
 * CatalogSearcher - Searches hang.fm catalog for songs
 */
const axios = require('axios');

class CatalogSearcher {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
  }

  async search(artist, track) {
    try {
      const query = `${artist} - ${track}`;
      this.logger.debug(`🔍 Searching hang.fm catalog: ${query}`);
      
      const response = await axios.get('https://gateway.prod.tt.fm/api/playlist-service/search/v2', {
        params: {
          q: query,
          limit: 20,
          explicit: true
        },
        headers: {
          'Authorization': `Bearer ${this.config.botUserToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      
      if (response.data?.songs?.length > 0) {
        const validSongs = this.filterSongs(response.data.songs, artist, track, true);
        
        if (validSongs.length > 0) {
          const explicitSongs = validSongs.filter(s => s.explicit === true);
          const song = explicitSongs.length > 0 ? explicitSongs[0] : validSongs[0];
          
          this.logger.log(`✅ Found: ${song.artistName} - ${song.trackName}${song.explicit ? ' [EXPLICIT]' : ''}`);
          return song;
        }
      }
      
      // Try artist-only search
      this.logger.debug(`🔍 Trying artist-only search: ${artist}`);
      const artistResponse = await axios.get('https://gateway.prod.tt.fm/api/playlist-service/search/v2', {
        params: {
          q: artist,
          limit: 30,
          explicit: true
        },
        headers: {
          'Authorization': `Bearer ${this.config.botUserToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      
      if (artistResponse.data?.songs?.length > 0) {
        const validSongs = this.filterSongs(artistResponse.data.songs, artist, track, false);
        
        if (validSongs.length > 0) {
          const explicitSongs = validSongs.filter(s => s.explicit === true);
          const songsToChooseFrom = explicitSongs.length > 0 ? explicitSongs : validSongs;
          const randomIndex = Math.floor(Math.random() * Math.min(songsToChooseFrom.length, 10));
          const song = songsToChooseFrom[randomIndex];
          
          this.logger.log(`✅ Found artist: ${song.artistName} - ${song.trackName}`);
          return song;
        }
      }
      
      this.logger.warn(`❌ Not found in catalog: ${artist} - ${track}`);
      return null;
    } catch (error) {
      this.logger.error(`Catalog search error: ${error.message}`);
      return null;
    }
  }

  filterSongs(songs, artist, track, requireTrackMatch) {
    return songs.filter(song => {
      const providers = song.musicProviders || {};
      const providerIds = song.musicProvidersIds || {};
      
      // Reject SoundCloud
      if (providers.soundCloudPublic || providers.soundcloud || providers.soundCloud ||
          providerIds.soundCloudPublic || providerIds.soundcloud || providerIds.soundCloud) {
        return false;
      }
      
      // Reject edited/clean versions
      const trackName = (song.trackName || '').toLowerCase();
      if (trackName.includes('edited') || trackName.includes('clean') ||
          trackName.includes('radio edit') || trackName.includes('acapella') ||
          trackName.includes('instrumental')) {
        return false;
      }
      
      // Reject compilations
      const albumName = (song.albumName || song.album?.name || '').toLowerCase();
      if (albumName.includes('greatest hits') || albumName.includes('best of') ||
          albumName.includes('compilation') || albumName.includes('soundtrack') ||
          albumName.includes('tribute')) {
        return false;
      }
      
      // Must have real provider
      const hasRealProvider = providers.spotify || providers.apple || 
                             providers.youtube || providers.deezer || 
                             providers.tidal || providers.amazonMusic;
      if (!hasRealProvider) return false;
      
      // Check artist match
      const songArtist = (song.artistName || '').toLowerCase().trim();
      const searchArtist = artist.toLowerCase().trim();
      
      let artistMatches = false;
      if (requireTrackMatch) {
        artistMatches = songArtist.includes(searchArtist) || searchArtist.includes(songArtist);
      } else {
        artistMatches = songArtist === searchArtist || 
                       songArtist.split(',')[0].trim() === searchArtist ||
                       songArtist.split('&')[0].trim() === searchArtist;
      }
      
      if (!artistMatches) return false;
      
      // Check track match if required
      if (requireTrackMatch) {
        const songTrack = (song.trackName || '').toLowerCase().trim();
        const searchTrack = track.toLowerCase().trim();
        const normalizeString = (str) => str.replace(/[^\w\s]/g, '').trim();
        const trackMatches = normalizeString(songTrack).includes(normalizeString(searchTrack)) ||
                            normalizeString(searchTrack).includes(normalizeString(songTrack));
        return trackMatches;
      }
      
      return true;
    });
  }
}

module.exports = CatalogSearcher;
