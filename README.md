# Hang.fm Bot Collection

🎵 **AI-Powered Music Bot Project - Modular Rebuild from Original JavaScript Code**

This repository contains a music bot project being rebuilt from scratch:
1. **Python Bot** (WIP) - Modern modular rebuild with hybrid architecture
2. **OG Hang.fm Bot** (Original) - Original JavaScript bot being refactored
3. **OG Deepcut Bot** (Original) - Original Deepcut bot (future modular version planned)

---

## 🤖 Bots Overview

### 1. 🐍 Python Bot (WIP - Under Discussion)

**Status:** Work In Progress - Architecture being refined

**What It Currently Has:**
- ✅ **Hybrid Architecture**: Node.js relay + Python core
- ✅ **Multi-AI Support**: Gemini, OpenAI, Claude, HuggingFace (priority fallback system)
- ✅ **Real-time Events**: Socket.IO relay for room events (plays, joins, DJs)
- ✅ **HTTP Polling**: CometChat message receiving via HTTP
- ✅ **Command System**: `/help`, `/commands`, `/uptime`, `/room`, `/.adminhelp`, `/.ai`
- ✅ **Role-Based Access**: Co-owners, moderators, users with configurable permissions
- ✅ **AI Personality**: Dynamic sentiment-based responses (friendly/roasting/neutral)
- ✅ **User Memory**: Tracks conversation history and sentiment per user
- ✅ **Health Monitoring**: Periodic connection checks (every 5 minutes)
- ✅ **Uptime Tracking**: Persistent session and lifetime tracking
- ✅ **Content Filtering**: Permissive mode (allows swearing, blocks hate speech via AI)
- ✅ **Room State Tracking**: Boot-time loading of current song, DJs, users in room
- ✅ **Environment-Based Config**: Zero hardcoded secrets, all from `.env`

**What It Needs:**
- 🔄 Music Discovery System (Discogs + Spotify integration planned)
- 🔄 DJ/Auto-Queue Features
- 🔄 Stats Tracking (user plays, song history)
- 🔄 Artist Learning System

**Tech Stack:**
- Python 3.12+ with async/await
- Node.js relay for Socket.IO
- `aiohttp` for async HTTP
- `aisuite` for unified AI interface
- `pydantic` for config validation

**Quick Start:**
```bash
# 1. Install dependencies
pip install -r requirements.txt
cd relay && npm install && cd ..

# 2. Configure
cp env.example .env
# Edit .env with your credentials

# 3. Run
.\START-BOT.bat
```

---

### 2. 📜 OG Hang.fm Bot (JavaScript - Original Code)

**Platform:** Hang.fm (tt.live)

**Original Bot Being Refactored:**
- ✅ **Complete AI System**: OpenAI GPT, Google Gemini, Anthropic Claude support
- ✅ **Advanced Music Discovery**: 
  - Discogs API integration for genre classification
  - Spotify API for track discovery and metadata
  - Artist learning from user plays
  - Smart queue selection based on room preferences
  - Alternative Hip Hop, Alternative Rock, Nu-Metal focus
- ✅ **Room Management**: 
  - Auto-DJ capabilities
  - Queue management
  - User tracking and statistics
- ✅ **Stats System**:
  - Per-user play counts
  - Song history tracking
  - Artist preference aggregation
- ✅ **Content Moderation**: Profanity filter, spam protection
- ✅ **Role-Based Permissions**: Owner, admin, mod, DJ, user roles
- ✅ **Boot Greeting**: Announces presence on startup
- ✅ **AI Token Management**: Smart usage limits to save API costs
- ✅ **Bot Exclusion System**: Ignores other bots in learning
- ✅ **Avatar System**: Customizable chat avatars

**Tech Stack:**
- Node.js with ES6+
- WebSocket (CometChat) for real-time chat
- Socket.IO (ttfm-socket) for room events
- Axios for HTTP requests
- dotenv for configuration

**Quick Start:**
```bash
cd OG-HANG

# 1. Install dependencies
npm install

# 2. Configure
cp hang-fm-config.env.example hang-fm-config.env
# Edit hang-fm-config.env with your credentials

# 3. Run
.\START-BOT.bat
# Or: node hang-fm-bot.js
```

---

### 3. 📜 OG Deepcut Bot (JavaScript - Original Code)

**Platform:** Deepcut.live

**Original Deepcut Bot:**
- ✅ **Multi-AI Provider**: OpenAI GPT, Google Gemini, HuggingFace support
- ✅ **AI Provider Toggle**: Switch between providers on-the-fly
- ✅ **Permission System**: Owner, admin, mod hierarchies
- ✅ **Command System**: Extensive commands for room management
- ✅ **Auto-Upvote**: Optional automatic upvoting
- ✅ **PM Support**: Owner-only private message commands
- ✅ **Keyword Triggers**: Customizable AI activation keywords
- ✅ **Silent Mode**: Run without main chat spam
- ✅ **Wiki Integration**: Wikipedia lookup capability
- ✅ **Discogs Integration**: Music metadata lookup

**Tech Stack:**
- Node.js with ES6+
- WebSocket for Deepcut.live protocol
- Multiple AI provider support
- dotenv for configuration

**Quick Start:**
```bash
cd OG-DEEPCUT

# 1. Install dependencies
npm install

# 2. Configure
cp config.env.example config.env
# Edit config.env with your credentials

# 3. Run
.\START-BOT.bat
# Or: node bot.js
```

---

## 🔐 Security

All bots follow security best practices:
- ✅ **Zero Hardcoded Secrets**: All credentials in `.env` files (gitignored)
- ✅ **Config Templates**: `.example` files show required variables
- ✅ **No Token Exposure**: Code only reads from environment variables
- ✅ **Permission-Based Access**: Role checking for sensitive commands

---

## 📁 Repository Structure

```
Ultimate bot project/
│
├── 🐍 Python Bot (main/)
│   ├── main.py                      # Entry point
│   ├── hangfm_bot/                  # Core package
│   │   ├── ai/                      # Multi-provider AI system
│   │   ├── connection/              # CometChat + relay
│   │   ├── handlers/                # Command processing
│   │   ├── utils/                   # RBAC, content filter
│   │   ├── music/                   # Genre classifier (WIP)
│   │   ├── config.py                # Pydantic settings
│   │   ├── uptime.py                # Uptime tracking
│   │   └── user_memory.py           # Conversation memory
│   ├── relay/                       # Node.js Socket.IO relay
│   │   └── relay.js
│   ├── requirements.txt             # Python dependencies
│   ├── env.example                  # Config template
│   └── START-BOT.bat               # Windows launcher
│
├── 📜 OG Hang.fm Bot (OG-HANG/)
│   ├── hang-fm-bot.js              # Complete bot implementation
│   ├── hang-fm-config.env.example  # Config template
│   ├── package.json                # Node dependencies
│   └── START-BOT.bat               # Windows launcher
│
├── 📜 OG Deepcut Bot (OG-DEEPCUT/)
│   ├── bot.js                      # Complete bot implementation
│   ├── config.env.example          # Config template
│   ├── package.json                # Node dependencies
│   └── START-BOT.bat               # Windows launcher
│
└── README.md                        # This file
```

---

## 🎮 Common Commands

All bots share similar command structures:

**Public Commands:**
- `/help` - Show help message
- `/commands` - List available commands
- `/stats` - User statistics (JS bots)
- `/uptime` - Bot uptime
- `/room` - Current room status (Python bot)
- Say **"bot"** in chat to trigger AI

**Admin Commands:**
- `/.adminhelp` - Show admin commands
- `/.ai <provider>` - Switch AI provider (Python bot, co-owners only)

---

## 🔧 Configuration

Each bot requires its own configuration file:

### Python Bot (`.env`):
```bash
# Platform
TTFM_API_TOKEN=your_token
ROOM_UUID=your_room_uuid
BOT_NAME=BOT

# CometChat
COMETCHAT_APPID=your_app_id
COMETCHAT_AUTH=your_auth_token

# Permissions
COOWNER_UUIDS=uuid1,uuid2
MODERATOR_UUIDS=uuid3,uuid4

# AI Providers
GEMINI_API_KEY=your_key
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
HUGGINGFACE_API_KEY=your_key
```

### OG Hang.fm Bot (`hang-fm-config.env`):
```bash
BOT_USER_TOKEN=your_token
ROOM_ID=your_room_id
COMETCHAT_AUTH=your_auth

GEMINI_API_KEY=your_key
OPENAI_API_KEY=your_key

DISCOGS_USER_TOKEN=your_token
SPOTIFY_CLIENT_ID=your_id
SPOTIFY_CLIENT_SECRET=your_secret

DJ_ENABLED=false
AUTO_UPVOTE=false
BOOT_GREET=true
```

### OG Deepcut Bot (`config.env`):
```bash
AUTH=your_auth_token
USERID=your_user_id
ROOMID=your_room_id
BOT_NAME=BOT2

OWNER_USERIDS=id1,id2
ADMIN_USERIDS=id3
MOD_USERIDS=id4

AI_PROVIDER=openai
OPENAI_API_KEY=your_key
GEMINI_API_KEY=your_key
```

See each bot's `.example` file for complete configuration details.

---

## 🚀 Deployment

### Python Bot:
```bash
cd "C:\path\to\Ultimate bot project"
.\START-BOT.bat
```

### OG Hang.fm Bot:
```bash
cd OG-HANG
.\START-BOT.bat
```

### OG Deepcut Bot:
```bash
cd OG-DEEPCUT
.\START-BOT.bat
```

---

## 🤝 Contributing

This is a personal bot collection. The Python bot is under active development and open to architectural discussions.

---

## 📄 License

MIT License - Free to use and modify

---

## 🙏 Credits

- **Python Bot**: Modern rewrite with hybrid architecture
- **OG Hang.fm Bot**: Production-tested on Hang.fm/tt.live
- **OG Deepcut Bot**: Production-tested on Deepcut.live

Original JavaScript implementations converted and enhanced with AI assistance.

---

## 📊 Bot Comparison

| Feature | Python Bot | OG Hang.fm | OG Deepcut |
|---------|-----------|------------|------------|
| **Status** | WIP - Modular Rebuild | Original Code | Original Code |
| **Multi-AI** | ✅ 4 providers | ✅ 3 providers | ✅ 3 providers |
| **Music Discovery** | 🔄 Planned | ✅ Full | ⚠️ Basic |
| **DJ/Queue** | 🔄 Planned | ✅ Full | ✅ Full |
| **Stats Tracking** | 🔄 Planned | ✅ Full | ⚠️ Basic |
| **Health Monitoring** | ✅ Yes | ❌ No | ❌ No |
| **User Memory** | ✅ Yes | ❌ No | ❌ No |
| **Dynamic Personality** | ✅ Yes | ⚠️ Basic | ⚠️ Basic |
| **Architecture** | Hybrid | Monolith | Monolith |
| **Platform** | Hang.fm | Hang.fm | Deepcut.live |

---

## 🐛 Troubleshooting

### Python Bot
- **"Module not found"**: Run `pip install -r requirements.txt`
- **Relay not connecting**: Check `TTFM_API_TOKEN` in `.env`
- **Bot not visible**: Check `COMETCHAT_AUTH` credentials
- **Room events not loading**: Wait 7 seconds after relay starts

### OG Hang.fm Bot
- **"localStorage not defined"**: Run with Node.js (not browser)
- **Connection fails**: Check `BOT_USER_TOKEN` and `ROOM_ID`
- **No AI responses**: Verify at least one AI provider key is set

### OG Deepcut Bot
- **WebSocket errors**: Check `AUTH` and `ROOMID` for Deepcut
- **Commands not working**: Verify user IDs in `OWNER_USERIDS`

---

**Project Status:**
- 🐍 **Python Bot** - Modern modular rebuild (active development)
- 📜 **OG Hang.fm** - Original code being refactored into Python bot
- 📜 **OG Deepcut** - Original code (modular version planned for future)
