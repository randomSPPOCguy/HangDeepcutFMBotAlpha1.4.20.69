# 🤖 AI Assistant Guide: Modularizing Deepcut.live Bot

## 📌 Mission

You are tasked with modularizing `bot.js` (currently ~10,000 lines) into a clean, maintainable module structure. This is the deepcut.live bot which uses WebSocket connections and has unique features like YouTube restriction checking, Ammy PM permission system, and avatar management.

## 🎯 Goals

1. **Split the monolithic file** into logical, focused modules
2. **Maintain 100% functionality** - Everything must work exactly as before  
3. **Create clean interfaces** between modules
4. **Improve maintainability** - Each module should have a single responsibility
5. **Add proper documentation** - JSDoc comments for all public methods

## 🔑 Key Differences from Hang.fm Bot

### Deepcut.live Specific Features:
1. **WebSocket Connection** - Uses native WebSocket (not ttfm-socket)
2. **Ammy PM Permission System** - Waits for moderator bot PM before hopping up
3. **Avatar Management** - Can change bot avatar via commands
4. **YouTube Restrictions** - Checks video restrictions via polsy.org.uk API
5. **Auto-Hop Reboot Fallback** - 30-second fallback if Ammy PM not received
6. **Album Command** - Displays album art + Wikipedia summary
7. **Seasonal Music Filtering** - Filters holiday music by month
8. **No Stats System** - Deepcut bot doesn't track stats (hang.fm does)
9. **No Poker Game** - Deepcut bot doesn't have poker
10. **No Weather** - Deepcut bot doesn't have weather features

### Preserved Features:
- AI chat responses (OpenAI, Gemini, HuggingFace)
- Curated artist list (~1300 artists)
- Auto-queue system
- Content filtering
- User memory/sentiment
- PM command system

## 📁 Target Structure

```
deepcut-modular/
├── bot.js (NEW - slim entry point, ~50 lines)
├── bot-ORIGINAL-BACKUP.js (backup of original)
├── config.env (configuration)
├── modules/
│   ├── README.md (comprehensive docs)
│   ├── core/
│   │   ├── Bot.js
│   │   └── Config.js
│   ├── connection/
│   │   └── WebSocketManager.js (native WS)
│   ├── handlers/
│   │   ├── EventHandler.js
│   │   ├── ChatHandler.js
│   │   ├── CommandHandler.js
│   │   └── StageManagement.js (auto-hop, Ammy PM logic)
│   ├── music/
│   │   ├── MusicSelector.js
│   │   ├── QueueManager.js
│   │   ├── MetadataFetcher.js
│   │   ├── YouTubeRestrictionChecker.js (UNIQUE)
│   │   └── CatalogSearcher.js
│   ├── ai/
│   │   ├── AIManager.js
│   │   ├── OpenAIProvider.js
│   │   ├── GeminiProvider.js
│   │   └── HuggingFaceProvider.js
│   ├── features/
│   │   ├── AvatarManager.js (UNIQUE)
│   │   ├── AlbumInfoFetcher.js (UNIQUE)
│   │   ├── SeasonalFilter.js (UNIQUE)
│   │   ├── ContentFilter.js
│   │   └── UserSentiment.js
│   └── utils/
│       ├── Logger.js
│       ├── SpamProtection.js
│       └── Helpers.js
└── data/
    └── bot-learned-artists.json
```

## 🚨 Critical Rules

1. **DO NOT CHANGE LOGIC** - Only reorganize code, don't modify behavior
2. **PRESERVE ALL FEATURES** - Every feature must work exactly as before
3. **MAINTAIN STATE** - Ensure `this.roomState` is accessible where needed
4. **KEEP FILE REFERENCES** - JSON file paths must remain correct
5. **TEST INCREMENTALLY** - Test each module as you create it
6. **USE HELPERS** - Leverage `Helpers.js` for common functions
7. **LOG EVERYTHING** - Use `Logger.js` for all console output
8. **PRESERVE AMMY LOGIC** - The Ammy PM permission system is critical

## 📦 Module Dependencies

```
Bot.js (main orchestrator)
├── Config.js
├── Logger.js
├── WebSocketManager.js (native WebSocket)
├── MusicSelector.js
│   ├── MetadataFetcher.js
│   ├── CatalogSearcher.js
│   ├── YouTubeRestrictionChecker.js (DEEPCUT UNIQUE)
│   └── SeasonalFilter.js (DEEPCUT UNIQUE)
├── AIManager.js
│   ├── OpenAIProvider.js
│   ├── GeminiProvider.js
│   └── HuggingFaceProvider.js
├── EventHandler.js
├── CommandHandler.js
├── StageManagement.js (DEEPCUT UNIQUE - Ammy PM logic)
├── AvatarManager.js (DEEPCUT UNIQUE)
├── AlbumInfoFetcher.js (DEEPCUT UNIQUE)
├── ContentFilter.js
├── SpamProtection.js
└── Helpers.js
```

## 💡 Tips for Success

1. **Start Small** - Begin with utilities (Logger, Helpers)
2. **Work Bottom-Up** - Build foundation before complex modules
3. **Test Often** - Run the bot after each major module
4. **Use Original** - Keep `bot-ORIGINAL-BACKUP.js` open for reference
5. **Check Dependencies** - Ensure modules can access what they need
6. **Preserve Comments** - Keep important comments from original
7. **Follow Patterns** - Maintain consistent coding style
8. **Test Ammy Logic** - The permission system is critical to deepcut bot

## ✅ Success Criteria

Modularization is complete when:

1. ✅ All 20+ modules are created
2. ✅ New entry point `bot.js` works
3. ✅ All features work identically to original
4. ✅ No errors in console
5. ✅ Ammy PM permission system works
6. ✅ Auto-queue works
7. ✅ Code is more maintainable and readable
8. ✅ Each module has single responsibility

---

**Good luck! This is similar to the hang.fm bot but with some unique deepcut.live features. Take it one module at a time, test frequently, and you'll have a clean, modular bot in no time!** 🎯

