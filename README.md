# Music Bot Collection

🎵 AI-Powered Music Bots for Turntable-style Platforms

---

## 📍 What This Is

This repository contains 3 bots for 2 different music streaming platforms:

### 🌐 For Hang.fm (tt.live)
• Python Modular Bot (WIP) - Modern hybrid architecture rebuild  
• OG Hang.fm Bot (Original) - Original JavaScript bot being refactored

### 🌐 For Deepcut.live
• OG Deepcut Bot (Original) - Original JavaScript bot  
• Deepcut Modular Bot (Planned) - Future Python rebuild

---

## 🐍 Python Modular Bot (WIP)

Platform: Hang.fm (tt.live)  
Status: Work In Progress - Architecture being refined

### What It Currently Has

✅ Hybrid Architecture  
  • Node.js relay for Socket.IO connection  
  • Python core for logic, AI, and commands  
  • Separated concerns for better maintainability

✅ Multi-AI Provider System  
  • Gemini (Primary) - Free tier: 1,500 req/day  
  • OpenAI GPT (Fallback 1) - Pay-as-you-go  
  • Claude (Fallback 2) - Pay-as-you-go  
  • HuggingFace (Fallback 3) - Free tier: 1,000 req/day per model  
  • Priority-based fallback if one provider fails  
  • Switch providers via /.ai command (co-owners only)

✅ Real-Time Event System  
  • Socket.IO relay forwards room events from hang.fm  
  • Tracks song plays, user joins/leaves, DJ changes  
  • HTTP polling for CometChat messages  
  • Room state loaded on boot (current song, DJs, users)

✅ Command System  
  • /help - Show commands  
  • /commands - List all commands  
  • /uptime - Bot uptime and lifetime stats  
  • /room - Current room status (song, DJs, users)  
  • /gitlink - View project on GitHub  
  • /ty - Thank the community  
  • /.adminhelp - Admin commands (mods/co-owners only)  
  • /.ai - Switch AI provider (co-owners only)  
  • Say "bot" in chat to trigger AI

✅ Role-Based Access Control  
  • Co-owners - Full access (all commands, AI switching)  
  • Moderators - Kick, ban, track commands  
  • DJs - Queue, discovery commands  
  • Users - Basic commands  
  • Configurable via .env (COOWNER_UUIDS, MODERATOR_UUIDS)

✅ Dynamic AI Personality  
  • User sentiment tracking (positive/negative/neutral)  
  • Adapts responses based on how users talk to it  
  • Friendly → Bot is chill and relaxed  
  • Rude → Bot roasts back (goofy intelligent way)  
  • Neutral → Bot stays neutral  
  • Custom personality prompt in .env (WIP)

✅ User Memory System  
  • Tracks conversation history per user  
  • Remembers recent messages for context  
  • Sentiment tracking for personality adaptation  
  • Persists to user_memory.json

✅ Health Monitoring  
  • Periodic connection checks (every 5 minutes)  
  • Warns if CometChat connection is lost  
  • Prevents bot running but being invisible

✅ Uptime Tracking  
  • Tracks current session uptime  
  • Accumulates lifetime across restarts  
  • Saves every 60 seconds (prevents data loss)  
  • Saves on shutdown (Ctrl+C)  
  • Persists to uptime_state.json

✅ Content Filtering  
  • Permissive mode (allows swearing)  
  • Blocks empty/spam messages  
  • Relies on AI providers for hate speech detection

✅ Environment-Based Configuration  
  • Zero hardcoded secrets  
  • All credentials in .env file  
  • Detailed env.example with instructions  
  • Where to find each credential documented

### What It Needs (Planned)

🔄 Music Discovery System  
  • Discogs API integration for genre classification  
  • Spotify API for track discovery  
  • Artist learning from user plays  
  • Alternative Hip Hop, Alternative Rock, Nu-Metal focus

🔄 DJ Features  
  • Auto-DJ capabilities  
  • Queue management  
  • Auto-upvote system

🔄 Stats Tracking  
  • Per-user play counts  
  • Song history tracking  
  • Artist preference aggregation

🔄 Advanced Commands  
  • /kick - Kick users  
  • /track - Current track info  
  • /queue - Show playlist queue

### Tech Stack

Python 3.12+ with async/await  
Node.js for Socket.IO relay  
aiohttp for async HTTP requests  
aisuite for unified AI interface  
pydantic for config validation  
Google Gemini API (primary)  
OpenAI GPT API (fallback)  
Anthropic Claude API (fallback)  
HuggingFace Inference API (free fallback)

### Quick Start

Step 1: Install Dependencies
```bash
# Python dependencies
pip install -r requirements.txt

# Node.js dependencies (relay)
cd relay
npm install
cd ..
```

Step 2: Configure
```bash
# Copy template
cp env.example .env

# Edit .env with your credentials
# See env.example for detailed instructions on where to find each value
```

Step 3: Run
```bash
# Windows
.\START-BOT.bat

# Or manually
python main.py
```

Step 4: Verify
```
Look for:
✅ Bot online and visible in room
🎵 Playing: Artist - Track (DJ: Username)
👥 In room (X): User1, User2, User3
```

---

## 📜 OG Hang.fm Bot (JavaScript)

Platform: Hang.fm (tt.live)  
Status: Original code being refactored into Python modular bot

### Features

AI System  
  • OpenAI GPT support  
  • Google Gemini support  
  • Anthropic Claude support  
  • Smart usage limits to save API costs

Music Discovery  
  • Discogs API for genre classification  
  • Spotify API for track discovery  
  • Artist learning from user plays  
  • Smart queue selection based on room preferences  
  • Genre focus: Alternative Hip Hop, Alt Rock, Nu-Metal

Room Management  
  • Auto-DJ capabilities  
  • Queue management  
  • User tracking and statistics  
  • Boot greeting on startup

Stats System  
  • Per-user play counts  
  • Song history tracking  
  • Artist preference aggregation

Content Moderation  
  • Profanity filter  
  • Spam protection  
  • Bot exclusion system (ignores other bots)

Role-Based Permissions  
  • Owner, admin, mod, DJ, user roles  
  • Configurable command access

Avatar System  
  • Customizable chat avatars

### Tech Stack

Node.js with ES6+  
WebSocket (CometChat) for real-time chat  
Socket.IO (ttfm-socket) for room events  
Axios for HTTP requests  
dotenv for configuration

### Quick Start

```bash
cd OG-HANG

# Install dependencies
npm install

# Configure
cp hang-fm-config.env.example hang-fm-config.env
# Edit hang-fm-config.env with your credentials

# Run
.\START-BOT.bat
# Or: node hang-fm-bot.js
```

---

## 📜 OG Deepcut Bot (JavaScript)

Platform: Deepcut.live  
Status: Original code (future modular rebuild planned)

### Features

Multi-AI Provider  
  • OpenAI GPT support  
  • Google Gemini support  
  • HuggingFace support  
  • AI provider toggle (switch on-the-fly)

Permission System  
  • Owner, admin, mod hierarchies  
  • Configurable access control

Command System  
  • Extensive room management commands  
  • PM support (owner-only private messages)  
  • Customizable keyword triggers

Auto-Upvote  
  • Optional automatic upvoting

Silent Mode  
  • Run without main chat spam

Wiki Integration  
  • Wikipedia lookup capability

Discogs Integration  
  • Music metadata lookup

### Tech Stack

Node.js with ES6+  
WebSocket for Deepcut.live protocol  
Multiple AI provider support  
dotenv for configuration

### Quick Start

```bash
cd OG-DEEPCUT

# Install dependencies
npm install

# Configure
cp config.env.example config.env
# Edit config.env with your credentials

# Run
.\START-BOT.bat
# Or: node bot.js
```

---

## 🔐 Security

All bots follow security best practices:

Zero Hardcoded Secrets  
  • All credentials in .env files (gitignored)  
  • Code only reads from environment variables  
  • Config templates (.example files) show required variables

Config Templates  
  • env.example - Python bot template  
  • hang-fm-config.env.example - Hang.fm bot template  
  • config.env.example - Deepcut bot template

Protected Files  
  • .env files are gitignored  
  • Bot data files (.json) are gitignored  
  • No secrets will be committed to GitHub

---

## 📁 Project Structure

```
Ultimate bot project/
│
├── 🐍 Python Modular Bot
│   ├── main.py                      Entry point
│   ├── START-BOT.bat               Windows launcher
│   ├── requirements.txt            Python dependencies
│   ├── env.example                 Config template
│   │
│   ├── hangfm_bot/                 Core package
│   │   ├── config.py               Configuration loader
│   │   ├── uptime.py               Uptime tracking
│   │   ├── user_memory.py          User sentiment & memory
│   │   ├── message_queue.py        Async message queue
│   │   │
│   │   ├── ai/                     AI system
│   │   │   └── ai_manager.py       Multi-provider orchestration
│   │   │
│   │   ├── connection/             Connection managers
│   │   │   ├── cometchat_manager.py    CometChat HTTP client
│   │   │   └── cometchat_poller.py     HTTP polling for messages
│   │   │
│   │   ├── handlers/               Event handlers
│   │   │   └── command_handler.py      Command processing
│   │   │
│   │   ├── utils/                  Utilities
│   │   │   ├── role_checker.py         RBAC system
│   │   │   └── content_filter.py       Content moderation
│   │   │
│   │   └── music/                  Music system
│   │       └── genre_classifier.py     Genre validation
│   │
│   └── relay/                      Node.js Socket.IO relay
│       ├── relay.js                Forwards events to Python
│       └── package.json            Node dependencies
│
├── 📜 OG Hang.fm Bot
│   ├── hang-fm-bot.js              Complete bot implementation
│   ├── hang-fm-config.env.example  Config template
│   ├── package.json                Dependencies
│   └── START-BOT.bat              Launcher
│
├── 📜 OG Deepcut Bot
│   ├── bot.js                      Complete bot implementation
│   ├── config.env.example          Config template
│   ├── package.json                Dependencies
│   └── START-BOT.bat              Launcher
│
├── README.md                        This file
├── LICENSE                          MIT License
└── NOTICE                           Third-party credits
```

---

## 🎮 Commands

### Public Commands (All Users)

📊 Info & Stats  
  • /stats - Your statistics  
  • /uptime - Bot uptime  
  • /room - Current room status  
  • /commands - List commands

💜 Community  
  • /gitlink - View project on GitHub  
  • /ty - Thank the community

🤖 AI Chat  
  • Say "bot" in chat to trigger AI  
  • /ai <message> - Direct AI chat

### Admin Commands (Mods/Co-owners)

Use /.adminhelp to see admin commands

👑 Co-Owner Commands  
  • /.ai <provider> - Switch AI provider  
    (gemini, openai, claude, huggingface, off, auto)  
  • /.grant <user> - Grant AI access

🔨 Moderator Commands  
  • /kick <user> - Kick user  
  • /track - Track info  
  • /queue - Show queue

---

## ⚙️ Configuration

Each bot requires its own configuration file. See detailed instructions in each bot's .example file.

### Python Bot (.env)

Step 1: Copy Template
```bash
cp env.example .env
```

Step 2: Fill In Required Values

Platform Connection (Required)  
  • TTFM_API_TOKEN - Your hang.fm JWT token  
  • ROOM_UUID - Room ID you want to join  
  • BOT_NAME - Bot's display name

CometChat (Required)  
  • COMETCHAT_APPID - 193427bb5702bab7 (same for all hang.fm users)  
  • COMETCHAT_API_KEY - 193427bb5702bab7  
  • COMETCHAT_UID - Your bot's user UUID  
  • COMETCHAT_AUTH - Your CometChat auth token

Permissions (Required)  
  • COOWNER_UUIDS - Comma-separated UUIDs for full access  
  • MODERATOR_UUIDS - Comma-separated UUIDs for mod access

AI Providers (At Least One Required)  
  • GEMINI_API_KEY - Google Gemini (recommended, free tier)  
  • OPENAI_API_KEY - OpenAI GPT (pay-as-you-go)  
  • ANTHROPIC_API_KEY - Claude (pay-as-you-go)  
  • HUGGINGFACE_API_KEY - HuggingFace (free tier)

Step 3: Where to Find Credentials

Hang.fm API Token  
  1. Open hang.fm in browser  
  2. Open DevTools (F12)  
  3. Go to Application tab → Local Storage → tt.live  
  4. Copy value from "token" key

CometChat Auth  
  1. Same location as API token  
  2. Copy value from "cometchat_auth" key

User UUIDs  
  1. Run the bot and check logs when users chat  
  2. Or check room settings/console

AI API Keys  
  • Gemini: https://aistudio.google.com/app/apikey  
  • OpenAI: https://platform.openai.com/api-keys  
  • Claude: https://console.anthropic.com/settings/keys  
  • HuggingFace: https://huggingface.co/settings/tokens

### OG Hang.fm Bot (hang-fm-config.env)

```bash
cd OG-HANG
cp hang-fm-config.env.example hang-fm-config.env
# Edit hang-fm-config.env

# Required fields:
BOT_USER_TOKEN=your_token
ROOM_ID=your_room_id
COMETCHAT_AUTH=your_auth

# AI providers (at least one):
GEMINI_API_KEY=your_key
OPENAI_API_KEY=your_key

# Music APIs (for discovery features):
DISCOGS_USER_TOKEN=your_token
SPOTIFY_CLIENT_ID=your_id
SPOTIFY_CLIENT_SECRET=your_secret

# Bot behavior:
DJ_ENABLED=false
AUTO_UPVOTE=false
BOOT_GREET=true
```

### OG Deepcut Bot (config.env)

```bash
cd OG-DEEPCUT
cp config.env.example config.env
# Edit config.env

# Required fields:
AUTH=your_auth_token
USERID=your_user_id
ROOMID=your_room_id
BOT_NAME=BOT2

# Permissions:
OWNER_USERIDS=id1,id2
ADMIN_USERIDS=id3
MOD_USERIDS=id4

# AI provider:
AI_PROVIDER=openai
OPENAI_API_KEY=your_key
GEMINI_API_KEY=your_key
```

---

## 🚀 Running the Bots

### Python Modular Bot

Windows (Recommended)
```bash
cd "C:\path\to\Ultimate bot project"
.\START-BOT.bat
```

Manual Start
```bash
# Start relay first
cd relay
node relay.js &
cd ..

# Then start Python bot
python main.py
```

What You Should See
```
============================================================
   🎵 HANG.FM BOT v2.0
============================================================
🤖 Bot: BOT
🆔 Room: a75a3a53-533a-4ced-90c8-dd569ce8ba04
============================================================
💾 Loaded uptime state: 240s lifetime
✅ CometChat HTTP polling started
✅ Bot online and visible in room
📊 Requested room state from relay

🎵 Playing: Artist - Track (DJ: Username)
👥 In room (12): User1, User2, User3 (+9 more)
```

### OG Hang.fm Bot

```bash
cd OG-HANG
.\START-BOT.bat
```

Or
```bash
cd OG-HANG
node hang-fm-bot.js
```

### OG Deepcut Bot

```bash
cd OG-DEEPCUT
.\START-BOT.bat
```

Or
```bash
cd OG-DEEPCUT
node bot.js
```

---

## 🛠️ Built With

### Development Tools

Cursor IDE - AI-powered code editor  
Claude (Anthropic) - AI pair programming assistant  
Git/GitHub - Version control

### Tech Stack

Python 3.12+ - Modern async/await architecture  
Node.js - Socket.IO relay for real-time events  
aiohttp - Async HTTP client library  
aisuite - Unified AI provider interface  
pydantic - Configuration validation  
python-socketio - Socket.IO client (unused, using Node relay instead)

### AI Providers

Google Gemini API - Primary AI provider (free tier)  
OpenAI GPT API - Fallback provider (pay-as-you-go)  
Anthropic Claude API - Secondary fallback (pay-as-you-go)  
HuggingFace Inference API - Free tier fallback (1000 req/day per model)

### Platform APIs

Hang.fm (tt.live) - Music streaming platform  
CometChat - Real-time chat system  
Socket.IO (ttfm-socket) - Room event system  
Discogs API - Music metadata (planned)  
Spotify API - Track discovery (planned)

---

## 🤝 Development Process

This bot was built through collaborative AI-assisted development.

### How It Was Made

Original JavaScript bots refactored into modular Python  
Built iteratively with Claude AI in Cursor IDE  
Features designed based on community needs  
Architecture refined through discussion and testing  
Debugging through systematic log analysis

### Why AI-Assisted

Faster iteration on architectural patterns  
Learning modern Python async/await while building  
Systematic debugging of complex async issues  
Comprehensive error handling implementation  
Building in the open, learning as we go

### The Result

Clean modular architecture with separated concerns  
Fully async throughout (no blocking operations)  
Environment-based config (zero hardcoded secrets)  
Multi-provider AI fallback system  
Real-time event processing with health monitoring  
Dynamic personality that adapts to users

This is an ongoing project, learning and improving through use.

---

## 📊 Bot Comparison

| Feature | Python Bot | OG Hang.fm | OG Deepcut |
|---------|-----------|------------|------------|
| Status | WIP - Modular Rebuild | Original Code | Original Code |
| Platform | Hang.fm | Hang.fm | Deepcut.live |
| Architecture | Hybrid (Node relay + Python) | Monolith | Monolith |
| Multi-AI | 4 providers | 3 providers | 3 providers |
| AI Switching | /.ai command | No | Toggle command |
| Music Discovery | Planned | Full system | Basic |
| DJ/Queue | Planned | Full | Full |
| Stats Tracking | Planned | Full | Basic |
| Health Monitoring | Every 5 min | No | No |
| User Memory | Yes | No | No |
| Dynamic Personality | Sentiment-based | Basic | Basic |
| Room Events | Real-time | Real-time | Real-time |
| Uptime Tracking | Persistent | No | No |
| Config Format | .env | .env | .env |
| Custom Personality | WIP | No | No |

---

## 🐛 Troubleshooting

### Python Bot

Module not found  
  → Run: pip install -r requirements.txt

Relay not connecting  
  → Check TTFM_API_TOKEN in .env  
  → Verify Socket.IO base URL is correct

Bot not visible in room  
  → Check COMETCHAT_AUTH credentials  
  → Check COMETCHAT_UID matches your bot user

Room events not loading  
  → Wait 7 seconds after relay starts  
  → Check relay.log for errors  
  → Verify ROOM_UUID is correct

No AI responses  
  → Set at least one AI provider key in .env  
  → Check API key is valid  
  → Try different provider with /.ai command

Health check warnings  
  → Connection may have been lost  
  → Restart bot to reconnect

### OG Hang.fm Bot

localStorage not defined  
  → Run with Node.js (not in browser)

Connection fails  
  → Check BOT_USER_TOKEN is valid  
  → Check ROOM_ID is correct

No AI responses  
  → Verify at least one AI provider key is set  
  → Check GEMINI_MODEL or OPENAI_MODEL setting

Music discovery not working  
  → Set DISCOGS_USER_TOKEN  
  → Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET

### OG Deepcut Bot

WebSocket errors  
  → Check AUTH token for Deepcut  
  → Check ROOMID is correct for Deepcut.live

Commands not working  
  → Verify user IDs in OWNER_USERIDS  
  → Check COMMANDS_ADMIN_ONLY setting

AI not responding  
  → Check AI_PROVIDER is set  
  → Verify corresponding API key is set

---

## 📄 License

MIT License - Free to use and modify

See LICENSE file for full license text  
See NOTICE file for third-party attributions and credits

---

## 🙏 Credits

### Built On

Turntable-API by Alain Gilbert (MIT License)  
  • https://github.com/alaingilbert/Turntable-API  
  • Core turntable.fm API wrapper and patterns

mrRobotoV3 by jodrell2000  
  • https://github.com/jodrell2000/mrRobotoV3  
  • Bot architecture inspiration

### Community Inspiration

Jodrell - For the vibes and inspiration  
noiz - For pushing boundaries  
Kai the Husky - For the energy  
butter - For the support  
The music sharing community - For keeping the turntable spirit alive

### Development

Built with Claude AI in Cursor IDE  
Original JavaScript bots refactored into Python  
Ongoing improvements from community feedback

---

## 🤝 Contributing

This is a personal bot project under active development.

The Python bot is open to:  
  • Architecture discussions  
  • Feature suggestions  
  • Bug reports  
  • Pull requests

Feel free to fork and customize for your own use.

---

## 📞 Support

Issues: https://github.com/randomSPPOCguy/HangDeepcutFMBotAlpha1.4.20.69/issues

For help with:  
  • Configuration  
  • Finding credentials  
  • Troubleshooting  
  • Feature requests

---

Made with 💜 for the music sharing community
