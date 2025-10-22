# HangDeepcutFMBotAlpha1.4.20.69

🎵 Music bots for Hang.fm and Deepcut.live built with AI assistance.

---

## 📍 What This Is

3 bots for 2 music platforms. Rebuilding the original JavaScript bots into modular Python.

### 🌐 For Hang.fm (tt.live)
• 🐍 **Python Modular Bot** (WIP) - Modern rebuild with better architecture  
• 📜 **OG Hang.fm Bot** (JS) - Original code being refactored

### 🌐 For Deepcut.live
• 📜 **OG Deepcut Bot** (JS) - Original code  
• 🔄 **Modular version** planned for later

---

## 🐍 Python Bot (WIP)

Modern modular rebuild with hybrid architecture.

### ✅ Currently Has

**🤖 Multi-AI System**
• Gemini (primary, free tier)
• OpenAI GPT (fallback)
• Claude (fallback)
• HuggingFace (free fallback)
• Auto-fallback if provider fails
• Switch providers with `/.ai` command

**🎵 Real-Time Events**
• Song plays, user joins/leaves, DJ changes
• Room state tracking (current song, DJs, users)
• Health monitoring every 5 minutes

**⚡ Commands**
• Public commands for everyone
• Admin commands for co-owners
• Permission management from chat
• See "Commands" section below for full list

**🎭 Dynamic Personality**
• Adapts to each user's vibe
• Friendly → chill and relaxed
• Rude → roasts back
• Neutral → stays neutral
• User memory & conversation history

**💾 Data Management**
• Uptime tracking (saves every 60s)
• User memory (sentiment & conversations)
• Permissions (co-owners & mods)
• All saved to separate JSON files

**🔐 Security**
• Zero hardcoded secrets
• All credentials in .env
• Permission management from chat

### 🔄 Still Needs

• Music discovery (Discogs + Spotify)
• DJ features (auto-queue, auto-upvote)
• Stats tracking (plays, favorites)

### 🚀 Quick Start

```bash
# Install dependencies
pip install -r requirements.txt
cd relay && npm install && cd ..

# Configure
cp env.example .env
# Edit .env (see "Getting Credentials" below)

# Run
.\START-BOT.bat
```

### 🔧 Tech

Python 3.12 + Node.js relay  
Multi-AI via aisuite  
HTTP polling for chat (CometChat)  
Socket.IO for room events (ttfm-socket)

---

## 📜 OG Hang.fm Bot (JavaScript)

Original bot with full music features.

### ✅ Has

**🎵 Music System**
• Discogs API for genre classification
• Spotify API for track discovery
• Learns artists from user plays
• Smart queue selection
• Genres: Alt Hip Hop, Alt Rock, Nu-Metal

**📊 Stats**
• User play counts
• Song history
• Artist preferences

**🤖 AI**
• OpenAI GPT
• Google Gemini
• Anthropic Claude

**⚙️ Features**
• Auto-DJ
• Queue management
• Boot greeting
• Content filter
• Role-based permissions

### 🚀 Quick Start

```bash
cd OG-HANG
npm install
cp hang-fm-config.env.example hang-fm-config.env
# Edit hang-fm-config.env
.\START-BOT.bat
```

---

## 📜 OG Deepcut Bot (JavaScript)

Original Deepcut bot with AI and permissions.

### ✅ Has

**🤖 AI**
• OpenAI GPT
• Google Gemini
• HuggingFace
• Provider switching

**⚙️ Features**
• Permission system (owner/admin/mod)
• Command system
• Auto-upvote option
• PM support
• Custom keyword triggers

### 🚀 Quick Start

```bash
cd OG-DEEPCUT
npm install
cp config.env.example config.env
# Edit config.env
.\START-BOT.bat
```

---

## 🔑 Getting Credentials

### Finding Your Tokens

**Hang.fm API Token:**
1. Open hang.fm in browser
2. F12 → Application → Local Storage → tt.live
3. Copy "token" value (starts with eyJ...)
4. Paste into `TTFM_API_TOKEN`

**CometChat Auth:**
1. Same location as above
2. Copy "cometchat_auth" value
3. Paste into `COMETCHAT_AUTH`

**Your Bot UUID:**
1. Same location
2. Copy "userId" value
3. Paste into `COMETCHAT_UID`

**Your UUID (for permissions):**
1. Start bot
2. Type `/myuuid` in chat
3. Copy UUID from bot's response
4. Create `permissions.json`:
```json
{
  "coowners": {"your-uuid-here": "YourName"},
  "moderators": {}
}
```

### AI API Keys (need at least one)

🟢 **Gemini** (free, recommended)  
https://aistudio.google.com/app/apikey

🟡 **OpenAI** (pay-as-you-go)  
https://platform.openai.com/api-keys

🟣 **Claude** (pay-as-you-go)  
https://console.anthropic.com/settings/keys

🟠 **HuggingFace** (free)  
https://huggingface.co/settings/tokens

---

## 🎮 Commands

### 🌐 Public
• `/commands` - Show available commands
• `/uptime` - Bot uptime
• Say "bot" for AI chat

### 👑 Admin (Co-Owners & Mods)
• `/.adminhelp` - Show admin commands

Co-owners can manage permissions and switch AI providers.

---

## 📚 API Resources

Helpful docs for building bots:

**ttfm-socket** (Socket.IO for room events)  
https://www.npmjs.com/package/ttfm-socket

**Hang.fm REST APIs** (Swagger docs)  
• User Service: https://gateway.prod.tt.fm/api/user-service/api/  
• Room Service: https://gateway.prod.tt.fm/api/room-service/api/  
• Social Service: https://gateway.prod.tt.fm/api/social-service/api/  
• Playlist Service: https://gateway.prod.tt.fm/api/playlist-service/api/

---

## 🙏 Credits

**Code Built On:**

🔧 **Turntable-API** by @alaingilbert  
https://github.com/alaingilbert/Turntable-API  
Core API wrapper and patterns

🤖 **mrRobotoV3** by @jodrell2000  
https://github.com/jodrell2000/mrRobotoV3  
Bot architecture inspiration

**Thank You:**

Jodrell  
noiz  
Kai the Husky  
butter  
The music sharing community

**Development:**

Built with Claude AI in Cursor IDE. Original JavaScript bots refactored into Python through AI-assisted development.

---

## 📄 License

MIT License - See LICENSE and NOTICE files

---

🎶 Made for the music sharing community
