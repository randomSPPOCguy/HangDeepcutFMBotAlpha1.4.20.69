# 🔄 Bot Switching Guide - Choose Your Bot

## 🎯 **Two Ways to Switch Bots:**

### **Method 1: Launcher Menu (Easy!)**
### **Method 2: Remote Commands (For Mods)**

---

## 📋 **Method 1: Bot Launcher Menu**

### **How to Use:**

**Double-click this file:**
```
START-BOT-LAUNCHER.bat
```

**You'll see:**
```
═══════════════════════════════════════════════════════════
           🤖 ULTIMATE BOT PROJECT - LAUNCHER 🤖           
═══════════════════════════════════════════════════════════

Choose Your Bot:

  [1] ORIGINAL - Stable & Proven
      └─> Curated artists (1300+)
      └─> All features tested & working
      └─> Production ready

  [2] MODULAR - New & Experimental
      └─> TRUE RANDOM from Spotify/Discogs
      └─> Social awareness (reads DJs/users)
      └─> Room vibe matching
      └─> Auto-hop stage management
      └─> Music flows even when glued

  [0] Exit

═══════════════════════════════════════════════════════════

Select bot [0-2]:
```

**Type a number and press Enter:**
- `1` = Start Hang.fm Original (Stable)
- `2` = Start Hang.fm Modular (Experimental)
- `0` = Exit

**That's it!** The bot starts automatically! 🎵

---

## 🎮 **Method 2: Remote Commands (For Mods)**

### **Chat Commands:**

#### **`/.restart`** or **`/.reboot`**
- Restarts current bot
- Co-owners only
- Bot reconnects with same configuration

**Example:**
```
💬 Co-owner: /.restart

🔄 BOT RESTARTING
Initiated by: Co-owner

Bot will reconnect shortly...

[Bot exits and restarts]
```

#### **`/.shutdown`** or **`/.stop`**
- Stops current bot
- Co-owners only
- Bot disconnects (must manually restart)

**Example:**
```
💬 Co-owner: /.shutdown

🛑 BOT SHUTTING DOWN
Initiated by: Co-owner

Goodbye! 👋

[Bot exits]
```

---

## 🔄 **How to Switch Between Bots:**

### **Scenario: Switch from Original → Modular**

**Step 1: Stop Current Bot**
```
💬 Co-owner (in chat): /.shutdown
```

**Step 2: Start Different Bot**
```
(Double-click) START-BOT-LAUNCHER.bat
Select [2] for Modular
```

**Or use PowerShell directly:**
```powershell
node "hangfm-bot-modular\hang-fm-bot.js"
```

---

## 🤖 **Available Bots:**

### **1. Hang.fm Original** ⭐ **STABLE**
**File:** `hangfm-bot\hang-fm-bot.js`

**Features:**
- ✅ Fully tested and working
- ✅ All commands implemented
- ✅ AI chat responses
- ✅ 1300+ curated artists
- ✅ Proven stable
- ✅ Production ready

**When to Use:**
- Live/production use
- Maximum stability
- Known working configuration
- Safe choice for important events

**Start Command:**
```powershell
node "hangfm-bot\hang-fm-bot.js"
```

---

### **2. Hang.fm Modular** 🆕 **EXPERIMENTAL**
**File:** `hangfm-bot-modular\hang-fm-bot.js`

**Features:**
- ✅ TRUE RANDOM music (Spotify/Discogs)
- ✅ Discovers from **millions of artists**
- ✅ 63 genres × 76 years = 4,788+ combinations
- ✅ Social awareness (DJs 3x weight, users 1x)
- ✅ Room vibe matching (genre detection)
- ✅ Never repeats songs (persistent tracking)
- ✅ Auto-hop stage management
- ✅ Glued to floor by default
- ✅ Music flows even when glued!
- ✅ Admin commands (/.ai, /.grant, /.verbose, /.restart, /.shutdown)
- ✅ Spam protection (3s commands, 10s AI)

**When to Use:**
- Testing new features
- Maximum music variety
- Social room adaptation
- Modern modular architecture
- Experimental features

**Start Command:**
```powershell
node "hangfm-bot-modular\hang-fm-bot.js"
```

---

### **Deepcut.live Bot** 🎵 *(Separate Platform)*
**File:** `deepcut-bot\bot.js`

**Note:** This bot is for **Deepcut.live**, not Hang.fm!  
Not included in launcher (different platform).

**Start Command (if needed):**
```powershell
node "deepcut-bot\bot.js"
```

---

## 📝 **Admin Commands Reference:**

### **Co-Owners Only:**
```
/.restart     - Restart bot
/.shutdown    - Stop bot
/.grant <user> <amount> - Grant bankroll
```

### **Mods & Co-Owners:**
```
/glue         - Toggle floor lock
/.ai <provider> - Switch AI provider
/.verbose     - Toggle verbose logging
```

### **Everyone:**
```
/stats        - User stats
/poker        - Play poker
/weather      - Weather info
/help         - Command list
```

---

## 🚀 **Quick Start:**

### **For You (Owner):**
1. Double-click `START-BOT-LAUNCHER.bat`
2. Choose bot
3. Done! ✅

### **For Mods (Remote):**
1. In chat: `/.shutdown`
2. Tell you which bot to start
3. You run launcher

---

## 💾 **With PM2 (Advanced - Auto-Restart):**

If you want **automatic restarts** after `/.restart`:

### **Install PM2:**
```powershell
npm install -g pm2
```

### **Start Bot with PM2:**
```powershell
# Hang.fm Original
pm2 start "hangfm-bot\hang-fm-bot.js" --name "hangfm-original"

# Hang.fm Modular
pm2 start "hangfm-bot-modular\hang-fm-bot.js" --name "hangfm-modular"

# Deepcut
pm2 start "deepcut-bot\bot.js" --name "deepcut"
```

### **Switch Bots:**
```powershell
# Stop current
pm2 stop hangfm-original

# Start different one
pm2 start hangfm-modular

# View status
pm2 status
```

**With PM2, `/.restart` automatically restarts the bot!**

---

## 📂 **Files Created:**

| File | Purpose |
|------|---------|
| `START-BOT-LAUNCHER.bat` | Double-click launcher |
| `START-BOT-LAUNCHER.ps1` | PowerShell launcher script |
| `BOT-SWITCHING-GUIDE.md` | This guide |

---

## ✅ **Summary:**

**Easy Way:**
- Double-click `START-BOT-LAUNCHER.bat`
- Choose bot from menu
- Done! ✅

**Remote Way (Mods):**
- Mods use `/.shutdown` in chat
- You restart with launcher
- Choose different bot

**Advanced Way (PM2):**
- PM2 manages bot processes
- Auto-restart on crash
- Remote restart via `/.restart`
- Switch bots with PM2 commands

---

**You now have complete control over which bot runs!** 🎵✨🔄

