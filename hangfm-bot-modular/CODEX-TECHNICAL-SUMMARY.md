# 🤖 Hang.fm Modular Bot - Technical Summary for Codex

## 📅 **Date:** October 14, 2025

---

## 🎯 **Project Overview:**

This is a **modular refactor** of the Hang.fm bot, designed with:
- Clean separation of concerns
- Modular architecture
- Enhanced music discovery (Spotify/Discogs API)
- Social awareness features
- Room vibe matching

---

## 📂 **Architecture:**

```
hangfm-bot-modular/
├── hang-fm-bot.js                    ← Entry point (imports & starts Bot.js)
├── modules/
│   ├── core/
│   │   ├── Bot.js                    ← Main orchestrator (wires all modules)
│   │   └── Config.js                 ← Environment variables loader
│   ├── connection/
│   │   ├── SocketManager.js          ← TTFM socket connection
│   │   └── CometChatManager.js       ← CometChat WebSocket + HTTP API
│   ├── handlers/
│   │   ├── EventHandler.js           ← Routes all events (songs, chat, votes)
│   │   ├── CommandHandler.js         ← User commands (/stats, /poker, etc.)
│   │   └── AdminCommandHandler.js    ← Admin commands (/.ai, /.grant, /glue)
│   ├── stats/
│   │   └── StatsManager.js           ← User & song stats (persistent JSON)
│   ├── music/
│   │   ├── MusicSelector.js          ← TRUE RANDOM discovery (Spotify/Discogs)
│   │   ├── CatalogSearcher.js        ← Hang.fm catalog search
│   │   └── MetadataFetcher.js        ← Metadata from various sources
│   ├── ai/
│   │   ├── AIManager.js              ← AI orchestrator
│   │   ├── OpenAIProvider.js         ← OpenAI integration
│   │   ├── GeminiProvider.js         ← Gemini integration
│   │   └── HuggingFaceProvider.js    ← HuggingFace integration
│   ├── features/
│   │   ├── StageManager.js           ← Auto-hop logic & glue control
│   │   ├── AFKDetector.js            ← 36-min AFK detection
│   │   ├── WeatherService.js         ← Weather API
│   │   ├── HolidayDecorator.js       ← Seasonal emojis
│   │   └── ContentFilter.js          ← Chat content filtering
│   └── utils/
│       ├── Logger.js                 ← Logging utilities
│       ├── SpamProtection.js         ← Cooldowns (3s commands, 10s AI)
│       └── Helpers.js                ← Utility functions
└── Data Files (auto-generated):
    ├── bot-played-songs.json         ← Persistent played songs history
    ├── bot-artist-cache.json         ← Cached songs per artist
    ├── user-stats.json               ← User stats (shared with original bot)
    └── song-stats.json               ← Song stats (shared with original bot)
```

---

## ✅ **What's Working:**

### **1. TTFM Socket Connection** ✅
- Connects to `https://socket.prod.tt.fm`
- Joins room successfully
- Receives all room events:
  - `playedSong`, `votedOnSong`, `addedDj`, `removedDj`
  - `userJoined`, `userLeft`, `updatedNextSong`
  - `playedOneTimeAnimation`, `kickedFromRoom`, `roomReset`
  - Connection states: `connected`, `disconnected`, `reconnecting`, `timeout`, `error`

**File:** `modules/connection/SocketManager.js`

### **2. Stats Tracking** ✅
- Loads/saves user stats (bankroll, poker W/L%, upvotes, stars, top artists)
- Loads/saves song stats (plays, likes, dislikes, stars)
- Persistent to JSON files (shared with original bot)
- Top artists via `getTopArtists(userId, limit)`

**File:** `modules/stats/StatsManager.js`

### **3. Music Selection (TRUE RANDOM)** ✅
- **NO curated lists** - discovers from millions of artists
- Spotify API integration (random genre + year search)
- Discogs API integration (underground music)
- **63 genres** (alt hip hop, alt rock, alt metal + all subgenres)
- **76 years** (1950-2025)
- **4,788 search combinations**
- Persistent tracking (never repeats songs across restarts)
- Artist rotation (last 25 artists blocked)
- Song caching (100 songs per artist)

**File:** `modules/music/MusicSelector.js`

### **4. Social Awareness** ✅
- Tracks individual user genre preferences
- Reads who's on stage (DJs) vs dancefloor (users)
- Weights DJs 3x more than users
- 80% audience match, 20% random
- Adapts in real-time when people hop on/off stage
- Genre detection via Spotify API

**File:** `modules/music/MusicSelector.js` (methods: `trackUserGenrePreference`, `selectGenreBasedOnVibe`, `getAudienceGenrePreferences`)

### **5. Auto-Stage Management** ✅
- Bot starts **glued to floor** by default
- Mods/co-owners use `/glue` to toggle
- Auto-hop logic: ≤3 DJs = hop up, ≥3 humans = hop down
- 2-minute cooldown after hop down
- Must play ≥1 song before hopping down
- Emergency queueing if on stage with no music
- **Music selection flows even when glued** (background every 5 min)

**File:** `modules/features/StageManager.js`

### **6. AFK Protection** ✅
- 36-minute inactivity warning
- 36-second response window
- Timer resets on: chat, vote, song play, hop on stage, join room
- Excludes bot from checks
- Never boots active users

**File:** `modules/features/AFKDetector.js`

### **7. Command Handlers** ✅
- `/stats` - User stats (bankroll, poker W/L%, upvotes, stars, top 3 artists)
- `/songstats` - Song stats (plays, likes, dislikes, stars)
- `/leaderboard` - Ranks by bankroll
- `/poker [amount]` - Full 5-card poker game
- `/weather [location]` - Weather with emoji
- `/artists` - Artist count
- `/help` - Command list
- `/gitlink`, `/github`, `/repo` - GitHub link
- `/ty`, `/thanks`, `/credits` - Credits

**File:** `modules/handlers/CommandHandler.js`

### **8. Admin Commands** ✅
- `/.ai <openai|gemini|huggingface|auto|off>` - Switch AI provider
- `/.grant <user> <amount>` - Grant bankroll
- `/glue` - Toggle floor lock
- `/.verbose` - Toggle logging
- `/.restart` - Restart bot
- `/.shutdown` - Stop bot

**File:** `modules/handlers/AdminCommandHandler.js`

### **9. Spam Protection** ✅
- Command cooldown: 3 seconds per user
- AI cooldown: 10 seconds per user
- Methods: `canUseCommand()`, `canUseAI()`, `recordCommandUsage()`, `recordAIUsage()`

**File:** `modules/utils/SpamProtection.js`

### **10. Event Tracking** ✅
- Displays ALL room events in PowerShell
- Distinguishes USER plays vs BOT plays
- Enhanced vote tracking (shows song being voted on)
- Genre detection from user plays
- Learning system (tracks genres, not artists)

**File:** `modules/handlers/EventHandler.js`

---

## ❌ **What's NOT Working:**

### **CometChat WebSocket Message Reception** ❌

**Symptom:**
- CometChat WebSocket opens successfully ✅
- Auth message sent successfully ✅
- **NO response from CometChat server** ❌
- Timeout after 15 seconds ❌
- **Bot cannot receive chat messages** ❌
- **Commands in chat are ignored** ❌

**What DOES work:**
- CometChat HTTP API for **sending** messages ✅
- Boot greeting sends successfully ✅

**File with issue:** `modules/connection/CometChatManager.js`

**Working reference:** `hangfm-bot/hang-fm-bot.js` (lines 3065-3355)

**Debug info:** See `COMETCHAT-DEBUG-FOR-CHATGPT.md`

---

## 🔧 **Technical Details:**

### **TTFM Socket (Working):**
```javascript
// SocketManager.js
const socket = new SocketClient('https://socket.prod.tt.fm');
await socket.joinRoom(token, { roomUuid });

// Events emitted:
socket.on('statefulMessage', handler);
socket.on('statelessMessage', handler);
socket.on('serverMessage', handler);
socket.on('connected', handler);
socket.on('error', handler);
```

### **CometChat WebSocket (NOT Working):**
```javascript
// CometChatManager.js
const ws = new WebSocket('wss://193427bb5702bab7.websocket-us.cometchat.io/v3.0/');

ws.on('open', () => {
  ws.send(JSON.stringify({
    appId: "193427bb5702bab7",
    type: "auth",
    sender: userId,
    body: {
      auth: authToken,
      deviceId: `WEB-4_0_10-${userId}-${Date.now()}`,
      presenceSubscription: "ALL_USERS"
    }
  }));
});

ws.on('message', (data) => {
  // THIS NEVER FIRES - No messages received!
  const message = JSON.parse(data.toString());
  // Handle message...
});
```

**Expected:** Auth success response, then chat messages
**Actual:** Nothing - WebSocket receives 0 messages

### **CometChat HTTP API (Working):**
```javascript
// Sending works fine:
axios.post(`https://193427bb5702bab7.apiclient-us.cometchat.io/v3.0/messages`, payload, {
  headers: {
    'authtoken': authToken,
    'appid': apiKey,
    'onBehalfOf': userId
  }
});
// ✅ This works! (boot greeting sends)
```

---

## 📊 **Event Flow:**

### **TTFM Events (Working):**
```
TTFM Socket → SocketManager → Bot.setupEventListeners() → EventHandler
  ↓
handlePlayedSong() → Tracks stats, detects genres, updates AFK
handleVotedOnSong() → Shows votes, updates AFK
handleAddedDj() → Shows stage activity
handleUserJoined() → Tracks presence
```

### **Chat Events (NOT Working):**
```
CometChat WebSocket → CometChatManager.handleMessage() → messageCallback
  ↓
  ❌ NEVER CALLED (WebSocket receives no messages)
  
Expected:
  EventHandler.handleChatMessage() → Admin/User commands → Spam check → Response
```

---

## 🎵 **Music Selection Flow:**

```
1. MusicSelector.selectSong(roomState)
2. Reads DJs on stage & users in room
3. Gets user genre preferences (tracked from plays)
4. Weights: DJs 3x, Users 1x
5. Selects genre (80% audience match, 20% random)
6. Picks random year (1950-2025)
7. Searches Spotify or Discogs
8. Gets random artist from results
9. Fetches artist's songs
10. Filters for unplayed songs
11. Selects random unplayed song
12. Marks as played → saves to bot-played-songs.json
13. Returns { artist, title, source }
```

**Social Awareness:**
- If DoomFan (likes doom metal) is on stage → 3x weight toward doom metal
- If room loves conscious hip hop → bot plays conscious hip hop
- Adapts in real-time!

---

## 🔄 **Auto-Hop Logic:**

```
Every 10 seconds: StageManager.checkAutoStageManagement()

1. Keep music flowing (even when glued) - every 5 min background selection
2. Check if glued → Skip auto-hop
3. Check if critical emergency (on stage with no music) → Queue immediately
4. Check DJ count:
   - ≤3 DJs & not glued → Hop up
   - ≥3 human DJs & on stage → Hop down (after 1 song)
5. Check if on stage without queue → Queue song
```

**Glue Control:**
- Default: `gluedToFloor = true`
- Mods/co-owners use `/glue` to toggle
- When glued: Bot stays on floor (music still flows in background)

---

## 🎯 **Data Flow:**

### **Persistent Data (JSON Files):**
```
user-stats.json         ← User stats (bankroll, poker, upvotes, stars, top artists)
song-stats.json         ← Song stats (plays, likes, dislikes, stars)
user-artists.json       ← User artist preferences
bot-learned-artists.json ← Learned artists (532)
bot-played-songs.json   ← Played songs history (prevents repeats)
bot-artist-cache.json   ← Cached songs per artist (Spotify/Discogs)
bot-strikes.json        ← Content filter strikes
```

**All stored in project root** - shared with original bot (intentional)

### **In-Memory State:**
```
MusicSelector:
  - userGenrePreferences: Map<genre, count>
  - recentUserPlays: Array<{genre, userName, userId, timestamp}>
  - userPreferences: Map<userId, {name, genres, topGenres}>
  - playedSongs: Set<"artist - song">
  - artistSongCache: Map<artist, songs[]>
  - recentlyUsedArtists: Array<artist>

StageManager:
  - gluedToFloor: boolean
  - songsPlayedSinceHopUp: number
  - lastAutoHopDownTime: timestamp

AFKDetector:
  - userLastActivity: Map<userId, timestamp>
  - afkWarnings: Map<userId, {warnedAt, username}>

SpamProtection:
  - userCommandCooldowns: Map<userId, timestamp>
  - userAICooldowns: Map<userId, timestamp>
```

---

## 🔌 **Connection Details:**

### **TTFM Socket (Working):**
```javascript
// Library: ttfm-socket
// URL: https://socket.prod.tt.fm
// Auth: BOT_USER_TOKEN (JWT)

const socket = new SocketClient('https://socket.prod.tt.fm');
const { state } = await socket.joinRoom(token, { roomUuid });

// Emits events:
socket.on('statefulMessage', msg => { /* handle playedSong, votedOnSong, etc. */ });
socket.on('statelessMessage', msg => { /* handle animations, kicks, etc. */ });
socket.on('connected', () => {});
socket.on('error', err => {});

// Actions:
await socket.action('addDj', { song });
await socket.action('removeDj', {});
await socket.action('updateNextSong', { song });
```

### **CometChat WebSocket (NOT Working - See Issue Below):**
```javascript
// URL: wss://193427bb5702bab7.websocket-us.cometchat.io/v3.0/
// Auth: Per-user authtoken (COMETCHAT_AUTH)

const ws = new WebSocket(url);
ws.on('open', () => {
  ws.send(JSON.stringify({
    appId: "193427bb5702bab7",
    type: "auth",
    sender: userId,
    body: { auth: authToken, deviceId, presenceSubscription }
  }));
});

ws.on('message', (data) => {
  // ❌ NEVER FIRES - No messages received
  // Expected: Auth response, then chat messages
  // Actual: Nothing
});
```

### **CometChat HTTP API (Working):**
```javascript
// Sending works fine:
axios.post(`https://193427bb5702bab7.apiclient-us.cometchat.io/v3.0/messages`, {
  receiver: roomId,
  receiverType: 'group',
  category: 'message',
  type: 'text',
  data: { text, metadata }
}, {
  headers: {
    'authtoken': authToken,      // Per-user token
    'appid': apiKey,
    'onBehalfOf': userId,
    'sdk': 'javascript@3.0.10'
  }
});
// ✅ Works! (boot greeting sends successfully)
```

---

## 🎵 **Music Discovery Implementation:**

### **Genre Pool (63 Genres):**
```javascript
// Alternative Hip Hop (18):
'alternative hip hop', 'underground hip hop', 'experimental hip hop',
'abstract hip hop', 'conscious hip hop', 'political hip hop',
'jazz rap', 'jazz hip hop', 'boom bap', 'instrumental hip hop',
'trip hop', 'turntablism', 'nerdcore', 'chillhop',
'lo-fi hip hop', 'cloud rap', 'emo rap', 'indie hip hop'

// Alternative Rock (35):
'alternative rock', 'indie rock', 'garage rock', 'psychedelic rock',
'post-punk', 'punk rock', 'noise rock', 'shoegaze', 'dream pop',
'post-rock', 'math rock', 'art rock', 'progressive rock',
'grunge', 'britpop', 'emo', 'post-hardcore', 'screamo', ...

// Alternative Metal (10):
'alternative metal', 'doom metal', 'stoner metal', 'sludge metal',
'post-metal', 'drone metal', 'progressive metal',
'avant-garde metal', 'noise metal', 'industrial metal'
```

### **Discovery Algorithm:**
```javascript
async selectSong(roomState) {
  // 1. Get DJs and users from room state
  const djsOnStage = roomState?.djs?.map(dj => dj.uuid);
  const usersInRoom = roomState?.users?.map(user => user.uuid);
  
  // 2. Select genre based on audience (social awareness)
  //    - DJs weighted 3x
  //    - Users weighted 1x
  //    - 80% audience match, 20% random
  const genre = this.selectGenreBasedOnVibe(djsOnStage, usersInRoom);
  
  // 3. Pick random year (1950-2025)
  const year = random(1950, 2025);
  
  // 4. Search Spotify or Discogs
  const tracks = await spotify.search(`genre:"${genre}" year:${year}`);
  
  // 5. Pick random artist from results
  const artist = random(tracks).artists[0].name;
  
  // 6. Get songs from artist
  const songs = await spotify.getArtistTopTracks(artistId);
  
  // 7. Filter for unplayed songs
  const unplayed = songs.filter(song => !this.playedSongs.has(createKey(artist, song)));
  
  // 8. Select random unplayed
  const selected = random(unplayed);
  
  // 9. Mark as played & save
  this.playedSongs.add(createKey(artist, selected));
  this.savePlayedSongs();
  
  return { artist, title: selected, source, wasUnplayed };
}
```

---

## 💬 **Command Processing Flow:**

### **Current Implementation:**
```
User sends: "/stats"
  ↓
CometChat WebSocket receives message
  ↓  ❌ THIS STEP FAILS (WebSocket not receiving)
CometChatManager.handleMessage(data)
  ↓
messageCallback({ senderId, senderName, text })
  ↓
EventHandler.handleChatMessage(message)
  ↓
parseChatMessage() → { userId, userName, text }
  ↓
Check spam cooldown (3s)
  ↓
Try admin commands first (/.ai, /.grant, /glue, /.verbose)
  ↓
Try user commands (  /stats, /poker, /weather, etc.)
  ↓
Record command usage
  ↓
Send response via CometChat HTTP API
```

**Breakdown Point:** CometChat WebSocket never receives messages ❌

---

## 🔑 **Environment Variables (From hang-fm-config.env):**

```env
# Authentication
BOT_USER_TOKEN=<JWT token for TTFM>
COMETCHAT_AUTH=<per-user auth token>
COMETCHAT_API_KEY=193427bb5702bab7
USER_ID=47713050-89a9-4019-b563-b0804da12bec
ROOM_ID=a75a3a53-533a-4ced-90c8-dd569ce8ba04

# AI (Per ChatGPT Spec)
AI_PROVIDER=off
AI_TEMPERATURE=0.6
AI_MAX_TOKENS=256
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
GEMINI_API_KEY=xxx
GEMINI_MODEL=gemini-1.5-flash
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
HUGGINGFACE_API_KEY=hf_xxx
HUGGINGFACE_MODEL=mistralai/Mixtral-8x7B-Instruct-v0.1
HUGGINGFACE_BASE_URL=https://api-inference.huggingface.co

# Music Discovery
SPOTIFY_CLIENT_ID=xxx
SPOTIFY_CLIENT_SECRET=xxx
SPOTIFY_ENABLED=true
DISCOGS_TOKEN=xxx
DISCOGS_ENABLED=true
```

**These same values work in original bot!** ✅

---

## 🐛 **THE ISSUE - CometChat WebSocket:**

### **Problem:**
CometChat WebSocket **never receives ANY messages** - not even auth response.

### **Auth Message Sent:**
```json
{
  "appId": "193427bb5702bab7",
  "type": "auth",
  "sender": "47713050-89a9-4019-b563-b0804da12bec",
  "body": {
    "auth": "<COMETCHAT_AUTH token>",
    "deviceId": "WEB-4_0_10-47713050-89a9-4019-b563-b0804da12bec-1728912345678",
    "presenceSubscription": "ALL_USERS"
  }
}
```

**Expected Response:**
```json
{
  "type": "auth",
  "code": "200",
  "status": "success"
}
// OR some variation
```

**Actual Response:** NONE (WebSocket 'message' event never fires)

### **Original Bot (Working) - Same Auth:**
```javascript
// hangfm-bot/hang-fm-bot.js lines 3091-3100
// EXACT SAME auth message format
// WebSocket DOES receive auth response
// Chat messages come through
```

### **What's Different:**
| Aspect | Original Bot | Modular Bot |
|--------|--------------|-------------|
| Auth format | ✅ Same | ✅ Same |
| WebSocket URL | ✅ Same | ✅ Same |
| Environment vars | ✅ Same | ✅ Same |
| HTTP API | ✅ Works | ✅ Works |
| **WebSocket receives** | **✅ YES** | **❌ NO** |

**Something in the WebSocket handling is different!**

---

## 🔬 **Debugging Needed:**

### **1. Add Raw Message Logging:**
```javascript
ws.on('message', (data) => {
  console.log(`🔵 RAW WS MESSAGE: ${data.toString()}`);
  // Then parse and handle
});
```

### **2. Check WebSocket State:**
```javascript
ws.on('open', () => {
  console.log(`WebSocket readyState: ${ws.readyState}`); // Should be 1 (OPEN)
});
```

### **3. Compare Original Bot Directly:**
Run original bot and capture:
- Auth message sent
- Auth response received
- Format of chat messages

### **4. Check for Connection Issues:**
- Firewall blocking WebSocket?
- Proxy issues?
- Network configuration?

**But original bot works on same machine!** So not network issue.

---

## 📝 **Code Differences to Investigate:**

### **Modular Bot:**
```javascript
// CometChatManager.js
onMessage(callback) {
  this.messageCallback = callback;
}

handleMessage(data) {
  // Parse and call callback
  if (this.messageCallback) {
    this.messageCallback({ senderId, senderName, text });
  }
}
```

### **Original Bot:**
```javascript
// hang-fm-bot.js
this.cometChatWs.on('message', (data) => {
  const message = JSON.parse(data.toString());
  this.handleCometChatMessage(message);
});

handleCometChatMessage(message) {
  // Directly processes messages
  if (message.type === 'message' && message.body?.type === 'text') {
    // Handle chat
  }
}
```

**Possible Issue:** Callback registration or event listener setup?

---

## ✅ **What's Already Correct:**

1. ✅ **Auth message format** - Matches original exactly
2. ✅ **WebSocket URL** - Same as original
3. ✅ **Environment variables** - Shared config file
4. ✅ **HTTP API** - Proves credentials valid
5. ✅ **Event routing** - EventHandler properly structured
6. ✅ **Command handlers** - All implemented
7. ✅ **Spam protection** - Implemented per spec
8. ✅ **Stats system** - Working and shared
9. ✅ **Music selection** - Fully functional
10. ✅ **Social awareness** - Implemented

**Only CometChat WebSocket receiving is broken!**

---

## 🎯 **For Codex:**

### **Primary Issue:**
Fix `modules/connection/CometChatManager.js` so WebSocket receives messages.

### **Compare With:**
`hangfm-bot/hang-fm-bot.js` lines 3065-3355 (working implementation)

### **Goal:**
Bot should receive chat messages and process commands like original bot.

### **Constraints:**
- Keep per-user `authtoken` header (no REST API key)
- Keep shared stats location
- Keep ttfm-socket action names
- Don't change HTTP API sending (it works)

---

## 📊 **Success Criteria:**

When fixed, console should show:
```
💬 Connecting to CometChat...
✅ CometChat WebSocket opened
🔐 Sending CometChat auth...
📨 First CometChat message: {...auth response...}
✅ CometChat authenticated - receiving messages enabled

[User sends command]
💬 Username: /stats
[Bot processes and responds]
```

Currently stops at "auth message sent - waiting for response" with no response.

---

## 📚 **Documentation:**

- `COMETCHAT-DEBUG-FOR-CHATGPT.md` - Detailed debugging info
- `FOR-CHATGPT-START-HERE.md` - Quick start guide
- `CHATGPT-HANDOFF.md` - Full project status
- `CHATGPT-SPEC-COMPLETE.md` - Implementation checklist
- `AUTO-STAGE-MANAGEMENT.md` - Stage/glue logic
- `SOCIAL-AWARENESS.md` - DJ/user matching
- `TRUE-RANDOM-MUSIC.md` - Music discovery
- `AFK-PROTECTION.md` - AFK system
- `EVENT-COVERAGE.md` - All ttfm-socket events

---

## 🚀 **To Test:**

```powershell
node "c:\Users\markq\Ultimate bot project\hangfm-bot-modular\hang-fm-bot.js"
```

**Current behavior:**
- Connects to TTFM ✅
- Loads stats ✅
- Sends boot greeting ✅
- Shows room events ✅
- **Doesn't receive chat** ❌

**Expected after fix:**
- All of the above ✅
- **Receives chat messages** ✅
- **Processes commands** ✅

---

## 🔧 **Quick Fix Hypothesis:**

The WebSocket might need:
1. Different event listener setup
2. Different message parsing
3. Ping/pong handling
4. Different auth success detection

**Check original bot's exact WebSocket event handling** - something is different!

---

**Good luck Codex!** 🤖🔧✨

