# 🤖 AI Assistant Guide: Modularizing Hang.fm Bot

## 📌 Mission

You are tasked with modularizing `hang-fm-bot.js` (currently 9620 lines) into a clean, maintainable module structure. The original file has been backed up as `hang-fm-bot-ORIGINAL-BACKUP.js`.

## 🎯 Goals

1. **Split the monolithic file** into logical, focused modules
2. **Maintain 100% functionality** - Everything must work exactly as before
3. **Create clean interfaces** between modules
4. **Improve maintainability** - Each module should have a single responsibility
5. **Add proper documentation** - JSDoc comments for all public methods

## 📁 Target Structure

```
hangfm-bot-modular/
├── hang-fm-bot.js (NEW - slim entry point, ~50 lines)
├── hang-fm-bot-ORIGINAL-BACKUP.js (backup of original)
├── modules/
│   ├── README.md (comprehensive docs)
│   ├── core/
│   │   ├── Bot.js
│   │   └── Config.js
│   ├── connection/
│   │   ├── SocketManager.js
│   │   └── CometChatManager.js
│   ├── handlers/
│   │   ├── EventHandler.js
│   │   ├── ChatHandler.js
│   │   ├── CommandHandler.js
│   │   └── AdminCommandHandler.js
│   ├── music/
│   │   ├── MusicSelector.js
│   │   ├── QueueManager.js
│   │   ├── MetadataFetcher.js
│   │   └── CatalogSearcher.js
│   ├── ai/
│   │   ├── AIManager.js
│   │   ├── OpenAIProvider.js
│   │   ├── GeminiProvider.js
│   │   └── HuggingFaceProvider.js
│   ├── stats/
│   │   ├── StatsManager.js
│   │   ├── UserStats.js
│   │   ├── SongStats.js
│   │   └── PokerGame.js
│   ├── features/
│   │   ├── WeatherService.js
│   │   ├── HolidayDecorator.js
│   │   ├── ContentFilter.js
│   │   └── AFKDetector.js
│   └── utils/
│       ├── Logger.js
│       ├── SpamProtection.js
│       └── Helpers.js
└── package.json
```

## 🔍 Original File Analysis

The current `hang-fm-bot-ORIGINAL-BACKUP.js` contains:

### Constructor Section (~lines 10-250)
- Environment variable loading
- State initialization
- Maps and Sets for tracking
- Configuration

### Connection Methods (~lines 496-750)
- `connect()` - Socket connection
- `connectCometChat()` - CometChat connection
- `setupEventListeners()` - Event registration

### Event Handlers (~lines 751-1600)
- `handleStatefulMessage()` - State updates
- `handleStatelessMessage()` - Room events
- `handlePlayedSong()` - Song play events
- `handleVotedOnSong()` - Vote events
- `handleAddedDj()`, `handleRemovedDj()` - DJ events
- `handleUserJoined()`, `handleUserLeft()` - User events

### Music Selection (~lines 2500-4500)
- `generateSongSuggestion()` - Main song selection
- `getCuratedArtists()` - Curated artist list (~1300 artists)
- `searchHangFmCatalog()` - Catalog search
- `getSpotifyGenres()` - Genre detection
- Spotify, MusicBrainz, Wikipedia API calls

### AI Methods (~lines 5000-6000)
- `generateAIResponse()` - AI orchestration
- `callOpenAI()`, `callGemini()`, `callHuggingFace()` - Provider methods
- System prompts and personality logic

### Command Handlers (~lines 3700-4500, 7000-8500)
- User commands: `/stats`, `/songstats`, `/poker`, `/w`, etc.
- Admin commands: `/.ai`, `/.grant`, `/glue`, etc.
- Command routing logic

### Stats System (~lines 6900-7900)
- `updateStatsForSong()` - Stats coordination
- `updateUserStats()` - User stats
- `updateSongStats()` - Song stats
- `updateReactionStats()` - Reaction tracking
- `loadStats()`, `saveStats()` - Persistence

### Poker Game (~lines 8200-8900)
- `handlePokerCommand()` - Game start
- `dealPokerHands()` - Card dealing
- `evaluatePokerHand()` - Hand evaluation
- `comparePokerHands()` - Tie-breaking
- `generateCardImage()` - Card image generation

### Helper Methods (scattered throughout)
- `getUsernameById()` - Username resolution
- `isBotUser()` - Bot detection
- `cleanArtistName()` - Name cleaning
- `checkAutoStageManagement()` - Auto hop logic
- `checkAFKDJs()` - AFK detection

## 🚨 Critical Rules

1. **DO NOT CHANGE LOGIC** - Only reorganize code, don't modify behavior
2. **PRESERVE ALL FEATURES** - Every feature must work exactly as before
3. **MAINTAIN STATE** - Ensure `this.state` is accessible where needed
4. **KEEP FILE REFERENCES** - JSON file paths must remain correct
5. **TEST INCREMENTALLY** - Test each module as you create it
6. **USE HELPERS** - Leverage `Helpers.js` for common functions
7. **LOG EVERYTHING** - Use `Logger.js` for all console output

## 📦 Module Dependencies

```
Bot.js (main orchestrator)
├── Config.js
├── Logger.js
├── SocketManager.js
│   └── ttfm-socket library
├── CometChatManager.js
│   └── axios
├── StatsManager.js
│   └── fs
├── MusicSelector.js
│   ├── MetadataFetcher.js
│   └── CatalogSearcher.js
├── AIManager.js
│   ├── OpenAIProvider.js
│   ├── GeminiProvider.js
│   └── HuggingFaceProvider.js
├── EventHandler.js
├── CommandHandler.js
├── AdminCommandHandler.js
├── PokerGame.js
│   └── canvas
├── WeatherService.js
│   └── axios
├── HolidayDecorator.js
├── ContentFilter.js
├── AFKDetector.js
├── SpamProtection.js
└── Helpers.js
```

## ✅ Success Criteria

Modularization is complete when:

1. ✅ All 20+ modules are created
2. ✅ New entry point `hang-fm-bot.js` works
3. ✅ All features work identically to original
4. ✅ No errors in console
5. ✅ Stats system works correctly
6. ✅ Code is more maintainable and readable
7. ✅ Each module has single responsibility
8. ✅ Modules have proper documentation

---

**This is a large but straightforward refactoring task. Take it one module at a time, test frequently, and you'll have a clean, modular bot in no time!** 🎯

