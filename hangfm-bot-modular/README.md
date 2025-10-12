# 🎵 Hang.fm Bot - Modular Version

## 📌 Project Status

This is a **work-in-progress modular refactoring** of the original hang.fm bot. The goal is to break down the monolithic 9620-line `hang-fm-bot.js` into clean, maintainable modules.

### ✅ What's Working

- **Socket Connection** - Connects to Hang.fm via `ttfm-socket`, joins room, receives events
- **CometChat HTTP API** - Sends messages via HTTP API (WebSocket times out but HTTP works)
- **Boot Greeting** - Successfully sends Halloween-themed greeting: `🎃 BOT Online 🦾🤖 🎃`
- **Event Handlers** - Listens and logs: song plays, votes, DJ changes, user join/leave
- **Stats System** - Loads/saves user stats, song stats, learned artists (1238 curated + 532 learned)
- **Holiday Decorator** - Detects current holiday and provides themed emojis
- **AFK Detection** - Monitors DJ activity (36-minute timeout with 36-second warning)
- **AI Providers** - OpenAI, Gemini, HuggingFace modules created (API calls work)
- **Music Selector** - 1300+ curated alternative artists loaded

### 🚧 What Needs Implementation

The following modules are **placeholders** or **incomplete** and need logic ported from `hang-fm-bot-ORIGINAL-BACKUP.js`:

1. **Command Handlers** (`modules/handlers/CommandHandler.js`) - User commands like `/stats`, `/poker`, `/weather`, `/w`, `/songstats`
2. **Admin Commands** (`modules/handlers/AdminCommandHandler.js`) - Mod/owner commands like `/.ai`, `/.grant`, `/glue`
3. **Song Selection Logic** - Port full AI-based song selection from original (lines 2500-4500)
4. **Auto-hop Stage Management** - Logic to hop on/off stage based on DJ count
5. **Poker Game** (`modules/stats/PokerGame.js`) - Full poker game with card generation
6. **Queue Manager** (`modules/music/QueueManager.js`) - Song queue management
7. **Helpers Module** (`modules/utils/Helpers.js`) - `getUsernameById()`, `isBotUser()`, etc.
8. **Complete EventHandler** - More detailed handling in `handlePlayedSong()`, `handleChatMessage()`, etc.

---

## 📁 Architecture

```
hangfm-bot-modular/
├── hang-fm-bot.js                    # Entry point (17 lines - just starts the bot)
├── hang-fm-bot-ORIGINAL-BACKUP.js    # Original 9620-line monolithic code (REFERENCE ONLY)
├── package.json                      # Dependencies
├── modules/
│   ├── core/
│   │   ├── Bot.js                    # Main orchestrator - initializes all modules
│   │   └── Config.js                 # Environment config loader (✅ COMPLETE)
│   │
│   ├── connection/
│   │   ├── SocketManager.js          # ttfm-socket connection (✅ COMPLETE)
│   │   └── CometChatManager.js       # Chat via HTTP API (✅ COMPLETE)
│   │
│   ├── handlers/
│   │   ├── EventHandler.js           # Socket event handling (✅ MOSTLY COMPLETE)
│   │   ├── CommandHandler.js         # User commands (🚧 PLACEHOLDER)
│   │   ├── AdminCommandHandler.js    # Admin commands (🚧 PLACEHOLDER)
│   │   └── ChatHandler.js            # Chat processing (🚧 PLACEHOLDER)
│   │
│   ├── music/
│   │   ├── MusicSelector.js          # 1300+ curated artists (✅ COMPLETE)
│   │   ├── MetadataFetcher.js        # Spotify/MusicBrainz APIs (✅ COMPLETE)
│   │   ├── CatalogSearcher.js        # Hang.fm catalog search (✅ COMPLETE)
│   │   └── QueueManager.js           # Song queue (🚧 PLACEHOLDER)
│   │
│   ├── ai/
│   │   ├── AIManager.js              # AI orchestration (✅ COMPLETE)
│   │   ├── OpenAIProvider.js         # OpenAI API (✅ COMPLETE)
│   │   ├── GeminiProvider.js         # Google Gemini API (✅ COMPLETE)
│   │   └── HuggingFaceProvider.js    # HuggingFace API (✅ COMPLETE)
│   │
│   ├── stats/
│   │   ├── StatsManager.js           # User/song stats (✅ COMPLETE)
│   │   ├── PokerGame.js              # Poker game logic (🚧 PLACEHOLDER)
│   │   ├── UserStats.js              # User stats helpers (🚧 EMPTY)
│   │   └── SongStats.js              # Song stats helpers (🚧 EMPTY)
│   │
│   ├── features/
│   │   ├── HolidayDecorator.js       # Seasonal themes (✅ COMPLETE)
│   │   ├── WeatherService.js         # OpenWeather API (✅ COMPLETE)
│   │   ├── ContentFilter.js          # AI content moderation (✅ COMPLETE)
│   │   └── AFKDetector.js            # AFK monitoring (✅ COMPLETE)
│   │
│   └── utils/
│       ├── Logger.js                 # Logging utility (✅ COMPLETE)
│       ├── SpamProtection.js         # Rate limiting (🚧 PLACEHOLDER)
│       └── Helpers.js                # Utility functions (🚧 PLACEHOLDER)
│
└── README.md                         # This file
```

---

## 🔧 Configuration

**Shared config:** `c:\Users\markq\Ultimate bot project\hang-fm-config.env`

**Shared data files** (in project root):
- `user-stats.json` - User stats (bankroll, poker, votes)
- `song-stats.json` - Song play counts, likes, stars
- `user-artists.json` - Top 3 artists per user
- `bot-learned-artists.json` - 532 artists learned from room
- `bot-strikes.json` - User strike tracking

---

## 🎯 Implementation Guidelines

### 1. **Porting Logic from Original**

The original code is in `hang-fm-bot-ORIGINAL-BACKUP.js` (9620 lines). Key sections:

- **Lines 496-750**: Connection methods
- **Lines 751-1600**: Event handlers
- **Lines 2069-2521**: Curated artist list (ALREADY PORTED to `MusicSelector.js`)
- **Lines 2500-4500**: Song selection logic with AI
- **Lines 3700-4500, 7000-8500**: Command handlers
- **Lines 5000-6000**: AI methods
- **Lines 6900-7900**: Stats system (MOSTLY PORTED to `StatsManager.js`)
- **Lines 8200-8900**: Poker game

### 2. **Code Style & Patterns**

- **Use existing logger:** `this.logger.log()`, `this.logger.error()`, `this.logger.debug()`
- **Error handling:** Always use try-catch, continue on error (don't crash bot)
- **State access:** Use `this.bot.socket.getState()` to get current room state
- **Config access:** `this.config.someValue` or `this.bot.config.someValue`
- **Stats saving:** Call `this.stats.save()` after updates
- **Command format:** Commands start with `/` (user) or `/.` (admin)

### 3. **Critical Modules to Implement**

#### **A. Helpers.js** (PRIORITY 1)
Port these essential functions from original:
- `getUsernameById(userId, state, botUserId)` - Get username from state
- `isBotUser(userId, username, botUserId, botName, excludeIds, excludeNames)` - Check if user is a bot
- `cleanArtistName(name)` - Clean artist names for matching

#### **B. CommandHandler.js** (PRIORITY 2)
Port user commands:
- `/stats` - Show user stats (lines 3700-3800)
- `/songstats` - Show song stats (lines 3800-3900)
- `/poker [amount]` - Start poker game (lines 8200-8900)
- `/w [location]` - Weather report (lines 7500-7700)
- `/leaderboard` or `/lb` - Top users (lines 3900-4000)
- `/help` - Command list

#### **C. AdminCommandHandler.js** (PRIORITY 3)
Port admin commands:
- `/.ai [provider]` - Switch AI provider (lines 4100-4200)
- `/.grant [user]` - Grant chips (lines 8100-8150)
- `/glue` - Toggle auto-hop (lines 4300-4400)

#### **D. EventHandler Enhancements** (PRIORITY 4)
Enhance `handleChatMessage()` to:
- Parse and route commands to CommandHandler
- Trigger AI responses when mentioned (lines 5500-6000)
- Content filtering for hate speech (lines 5200-5400)
- Link safety checking (lines 5400-5500)

#### **E. Song Selection Integration** (PRIORITY 5)
In `EventHandler.handlePlayedSong()`:
- Queue next song when bot's song finishes (lines 2800-3000)
- Use `MusicSelector.selectSong()` with AI integration
- Search catalog with `CatalogSearcher.search()`
- Fetch metadata with `MetadataFetcher.fetchSongMetadata()`

---

## 🔍 Key Differences from Original

### CometChat Connection
- **Original:** Uses WebSocket for real-time messages
- **Modular:** WebSocket times out, uses HTTP API instead (works fine!)

### File Paths
- **Original:** Loads data files from bot's own directory
- **Modular:** Loads from project root (shared with original)

### Structure
- **Original:** Single 9620-line file
- **Modular:** 20+ focused modules with single responsibilities

---

## 🚀 How to Run

```powershell
node "c:\Users\markq\Ultimate bot project\hangfm-bot-modular\hang-fm-bot.js"
```

**Expected output:**
```
🔧 [MODULAR] Loading config from: c:\Users\markq\Ultimate bot project\hang-fm-config.env
📊 [MODULAR] Data files will be shared from: c:\Users\markq\Ultimate bot project
📡 Creating SocketClient...
✅ SocketClient created
🎵 Loaded 1238 curated artists
🎉 Holiday theme: halloween 🎃
⏰ AFK detection started (36 min timeout)
🤖 Starting Hang.fm Bot (Modular)...
✅ Connected to Hang.fm
ℹ️  CometChat WebSocket timeout - HTTP API will be used instead
✅ Bot started successfully (Modular)
📤 Sending boot greeting...
✅ Joined CometChat group
💬 Sent: 🎃 BOT Online 🦾🤖 🎃
✅ Boot greeting sent successfully!
```

---

## ✅ Testing Checklist

After implementing features, test:

- [ ] `/stats` shows user stats
- [ ] `/songstats [artist - song]` shows song stats
- [ ] `/poker 100` starts poker game
- [ ] `/w Seattle` shows weather
- [ ] `/.ai gemini` switches AI provider
- [ ] Bot responds when mentioned in chat
- [ ] Bot queues and plays songs automatically
- [ ] Auto-hop works (hops up when DJs < 3)
- [ ] AFK detection removes inactive DJs
- [ ] Stats are saved correctly

---

## 📝 Notes

1. **Don't modify the original backup** (`hang-fm-bot-ORIGINAL-BACKUP.js`) - it's reference only
2. **Test incrementally** - Implement one feature at a time and test
3. **Use existing modules** - Don't recreate what's already working
4. **Follow the patterns** - Look at completed modules for examples
5. **Handle errors gracefully** - Bot should never crash, just log errors

---

## 🎯 Success Criteria

The modular bot will be **feature-complete** when:
- ✅ All commands work (`/stats`, `/poker`, `/weather`, etc.)
- ✅ Bot can select and queue songs automatically
- ✅ Auto-hop stage management works
- ✅ AI chat responses work
- ✅ Stats tracking is accurate
- ✅ All features match original bot functionality
- ✅ Code is clean, modular, and maintainable

---

**Current Status:** 🟡 Core systems working, features need implementation

**Last Updated:** 2025-01-12

**Original Bot:** `hangfm-bot/hang-fm-bot.js` (9620 lines - fully functional)
