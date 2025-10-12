# 🤖 Ultimate Bot Project

Two AI-powered music bots for different platforms, fully self-contained and ready to run.

---

## 📁 Project Structure

```
Ultimate bot project/
├── hangfm-bot/         ← Complete Hang.fm bot (self-contained)
├── deepcut-bot/        ← Complete Deepcut.live bot (self-contained)
├── node_modules/       ← Shared dependencies
├── package.json        ← Root dependencies
└── README.md           ← This file
```

Each bot folder contains **everything** needed to run independently.

---

## 🎵 **Hang.fm Bot**

**Location:** `hangfm-bot/`

**Features:**
- ✅ AI Chat (OpenAI, Gemini, HuggingFace)
- ✅ Poker Game with card images
- ✅ User Stats & Bankroll tracking
- ✅ Song Stats tracking
- ✅ Top 3 Artists per user
- ✅ Artist Learning from human plays
- ✅ Auto Stage Management
- ✅ Weather Service
- ✅ Holiday Decorations (auto-detects)
- ✅ Content Filter with 3-strike system
- ✅ AFK Detection
- ✅ Auto-upvote
- ✅ Curated artist list (~1,300 artists)

**Quick Start:**
```bash
cd hangfm-bot
npm install
node hang-fm-bot.js
```

Or double-click `hangfm-bot/START-BOT.bat` (Windows)

**Configuration:** Edit `hangfm-bot/hang-fm-config.env`

---

## 🎧 **Deepcut.live Bot**

**Location:** `deepcut-bot/`

**Features:**
- ✅ AI Chat (OpenAI, Gemini, HuggingFace)
- ✅ Avatar Management (change bot avatar via commands)
- ✅ Album Info with art display
- ✅ Seasonal Music Filtering
- ✅ YouTube Restriction Checking
- ✅ Ammy PM Permission System (auto-hop)
- ✅ Artist Learning
- ✅ Content Filter
- ✅ Auto-queue system
- ✅ Curated artist list (~1,300 artists)

**Quick Start:**
```bash
cd deepcut-bot
npm install
node bot.js
```

Or double-click `deepcut-bot/START-BOT.bat` (Windows)

**Configuration:** Edit `deepcut-bot/config.env`

---

## 📦 **Installation**

### Install Dependencies (First Time)

From project root:
```bash
npm install
```

This installs shared dependencies used by both bots.

### Install Bot-Specific Dependencies

Each bot can also install its own dependencies:
```bash
cd hangfm-bot
npm install

cd ../deepcut-bot
npm install
```

---

## 🚀 **Running the Bots**

### Option 1: Command Line
```bash
# Hang.fm Bot
cd hangfm-bot
node hang-fm-bot.js

# Deepcut Bot
cd deepcut-bot
node bot.js
```

### Option 2: Quick Launchers (Windows)
- Double-click `hangfm-bot/START-BOT.bat`
- Double-click `deepcut-bot/START-BOT.bat`

### Option 3: NPM Scripts
```bash
# From project root
cd hangfm-bot && npm start
cd deepcut-bot && npm start
```

---

## 📊 **Data Files**

Each bot maintains its own data files in its folder:

### Hang.fm Bot Data:
- `user-stats.json` - User poker stats, bankroll, reactions
- `song-stats.json` - Song play counts, reactions
- `user-artists.json` - Top 3 artists per user
- `bot-learned-artists.json` - Artists learned from users
- `bot-strikes.json` - Content filter strikes

### Deepcut Bot Data:
- `bot-learned-artists.json` - Artists learned from users
- `bot-strikes.json` - Content filter strikes
- `uptime.json` - Bot uptime tracking

---

## 🔧 **Configuration**

Each bot has its own configuration file:

**Hang.fm:** `hangfm-bot/hang-fm-config.env`  
**Deepcut:** `deepcut-bot/config.env`

Required settings:
- Bot user tokens/auth
- Room IDs
- AI API keys (OpenAI, Gemini, HuggingFace)
- Music API keys (Spotify, Discogs, Wikipedia)

---

## 📝 **Features Comparison**

| Feature | Hang.fm Bot | Deepcut Bot |
|---------|-------------|-------------|
| AI Chat | ✅ | ✅ |
| Stats Tracking | ✅ | ❌ |
| Poker Game | ✅ | ❌ |
| Weather | ✅ | ❌ |
| Avatar Management | ❌ | ✅ |
| Album Info Display | ❌ | ✅ |
| Seasonal Filtering | ❌ | ✅ |
| YouTube Restriction Check | ❌ | ✅ |
| Artist Learning | ✅ | ✅ |
| Content Filter | ✅ | ✅ |
| Auto-Queue | ✅ | ✅ |

---

## 🛠️ **Troubleshooting**

### Bot won't start
- Check that dependencies are installed: `npm install`
- Verify config files exist and have correct values
- Check API keys are valid

### Can't find modules
- Run `npm install` in the project root
- Or run `npm install` in the specific bot folder

### Data files missing
- Bots will create data files automatically on first run
- If issues persist, create empty JSON files: `echo {} > filename.json`

---

## 📚 **Documentation**

Each bot folder contains its own README with detailed information:
- `hangfm-bot/README.md` - Hang.fm bot documentation
- `deepcut-bot/README.md` - Deepcut bot documentation

---

## 🎯 **Key Differences**

### Hang.fm Bot
- Full user engagement system with stats and poker
- Weather integration
- More social features

### Deepcut Bot  
- Visual features (avatar, album art)
- Permission-based stage management
- Content filtering focused

Both bots share:
- AI chat capabilities
- Music selection and queueing
- Artist learning
- Content moderation

---

## 📄 **License**

MIT License - feel free to modify and distribute!

---

## 🤝 **Support**

Each bot is fully self-contained and independent. You can:
- Run both simultaneously on different sites
- Backup/restore individual bot folders
- Move bots to different machines easily
- Modify one without affecting the other

---

**Enjoy your bots! 🎉🤖**
