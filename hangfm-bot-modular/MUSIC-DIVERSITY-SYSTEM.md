# 🎵 Music Diversity System - Maximum Variety, No Repeats

## 🎯 **Goal:**
**Never play the same song twice** (or at least track 5000+ plays before resetting)

---

## ✨ **Diversity Features Implemented:**

### 1. **Persistent Played Songs Tracking**
- ✅ Tracks every song ever played across bot restarts
- ✅ Stored in: `bot-played-songs.json`
- ✅ Auto-resets at 5000 songs to prevent infinite growth
- ✅ Normalized song keys prevent duplicates from minor title variations

```javascript
// Example: "wu tang clan - cream" === "Wu-Tang Clan - C.R.E.A.M."
```

### 2. **Artist Rotation System**
- ✅ Prevents same artist within last **25 plays**
- ✅ 1300+ curated artists = huge variety pool
- ✅ Auto-resets rotation when all artists exhausted

### 3. **Song Caching**
- ✅ Caches up to **100 songs per artist**
- ✅ Stored in: `bot-artist-cache.json`
- ✅ Reduces API calls to MusicBrainz
- ✅ Persistent across restarts

### 4. **Smart Filtering**
- ✅ Filters out live versions: `(live)`, `[live]`, `- live`
- ✅ Filters out demos: `(demo)`, `[demo]`, `- demo`
- ✅ Deduplicates similar song titles
- ✅ Only uses unplayed songs when available

### 5. **Transparency**
- ✅ Logs how many unplayed songs available
- ✅ Shows artist pool availability
- ✅ Warns when repeating (rare case)

---

## 📊 **How It Works:**

### **Song Selection Flow:**
```
1. Get all curated artists (1300+)
2. Filter out last 25 artists → ~1275 available
3. Pick random artist from available pool
4. Fetch/cache 100 songs for that artist
5. Filter for UNPLAYED songs
6. Pick random unplayed song
7. Mark as played → save to disk
8. Never play that exact song again!
```

### **Artist Rotation:**
```
Play 1: Wu-Tang Clan
Play 2: MF DOOM
Play 3: Radiohead
...
Play 25: Sleep
Play 26: [Wu-Tang available again]
```

### **Played Songs Tracking:**
```json
{
  "songs": [
    "wu tang clan - cream",
    "mf doom - accordion",
    "radiohead - paranoid android",
    ... 4997 more
  ],
  "recentArtists": [
    "Wu-Tang Clan",
    "MF DOOM",
    ... last 25
  ],
  "lastUpdated": "2025-10-14T12:34:56.789Z"
}
```

---

## 🎯 **Diversity Math:**

With **1300 artists** and **100 songs per artist**:

**Theoretical Max:**
- 1300 artists × 100 songs = **130,000 unique songs**
- Even with 50% availability = **65,000 unique plays**

**Practical Reality:**
- Not all artists have 100 songs on MusicBrainz
- Conservative estimate: **~30,000-50,000 unique songs**

**Before First Repeat:**
- You'd need to play **thousands of songs**
- With 5-minute songs = **250+ hours of unique music**

---

## 📝 **Console Output Examples:**

### **Fresh Start:**
```
🎵 Loaded 1300 curated artists
📀 No played songs history found - starting fresh
💾 Loaded song cache for 0 artists

🎲 Selected artist: Wu-Tang Clan (1299/1300 artists available)
🎵 Cached 97 songs for Wu-Tang Clan
✨ 97/97 unplayed songs for Wu-Tang Clan
```

### **After Playing 100 Songs:**
```
📀 Loaded 100 played songs from history
💾 Loaded song cache for 42 artists

🎲 Selected artist: Madvillain (1258/1300 artists available)
💾 Using cached 85 songs for Madvillain
✨ 81/85 unplayed songs for Madvillain
```

### **All Songs for Artist Played (Rare):**
```
🎲 Selected artist: Some Obscure Band (1275/1300 artists available)
🎵 Cached 8 songs for Some Obscure Band
⚠️  All songs by Some Obscure Band have been played - repeating
```

### **Artist Pool Reset:**
```
🔄 Artist pool exhausted - resetting rotation
🎲 Selected artist: Sleep (1300/1300 artists available)
```

---

## 🔧 **Configuration:**

Edit in `MusicSelector.js` constructor:

```javascript
// Diversity settings
this.maxRecentArtists = 25;      // Artist rotation window
this.maxSongsToCache = 100;      // Songs to fetch per artist
this.minSongsBeforeRepeat = 50;  // Not yet used (future)
```

**Recommendations:**
- **Tight rotation:** `maxRecentArtists = 15` (more repeats, less API calls)
- **Wide rotation:** `maxRecentArtists = 50` (maximum diversity)
- **Default:** `maxRecentArtists = 25` (balanced)

---

## 🛠️ **Utility Methods:**

```javascript
// Manual control
musicSelector.clearPlayedSongs();        // Reset all history
musicSelector.getPlayedSongsCount();     // How many played?
musicSelector.getRecentArtists();        // Last 10 artists
musicSelector.markSongPlayed(artist, title); // Manually mark played
```

---

## 📂 **Files:**

| File | Purpose | Gitignored |
|------|---------|------------|
| `bot-played-songs.json` | Persistent played songs history | ✅ Yes |
| `bot-artist-cache.json` | Cached songs per artist | ✅ Yes |
| `MusicSelector.js` | Diversity logic implementation | ❌ No (code) |

---

## 🎯 **Results:**

With this system, you'll experience:
- ✅ **Maximum variety** - 1300+ artists rotating
- ✅ **No song repeats** - tracks every play persistently
- ✅ **Smart caching** - fast, efficient API usage
- ✅ **Transparent** - logs show diversity stats
- ✅ **Resilient** - auto-resets at 5000 songs

**The bot will play thousands of unique songs before ever repeating!** 🎉

---

## 🚀 **Testing:**

```powershell
node "c:\Users\markq\Ultimate bot project\hangfm-bot-modular\hang-fm-bot.js"
```

Watch the console for:
- `🎲 Selected artist:` - Shows available artist pool
- `✨ X/Y unplayed songs` - Shows diversity working
- `📀 Loaded N played songs` - Shows persistent tracking

---

**Status:** Fully implemented and ready for testing ✅

