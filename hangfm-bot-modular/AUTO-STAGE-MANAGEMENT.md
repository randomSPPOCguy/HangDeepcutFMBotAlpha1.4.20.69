# 🎧 Auto-Stage Management - Smart Stage Logic

## ✅ **Bot Stays on Floor Until Mods/Co-Owners Unglue!**

The bot uses the **exact logic from the original bot** with **clean logging** (no spam)!

---

## 🔒 **Default State: GLUED TO FLOOR**

### **Bot starts glued:**
```
✅ Bot started successfully (Modular)
🎵 Listening for events...
🔒 Bot is GLUED TO FLOOR (use /glue command to unglue)
```

### **Music Selection Keeps Flowing:**
- ✅ **Bot still selects music** even when glued (background, every 5 minutes)
- ✅ **Maintains vibe analysis** - tracks genres, audience preferences
- ✅ **Keeps cache fresh** - Spotify/Discogs artist cache stays updated
- ✅ **Silent operation** - runs in background (debug logs only)
- ✅ **Ready to DJ** - when unglued, bot has fresh music ready!

### **Only logs once** - no spam every 10 seconds! ✅

---

## 🎯 **How It Works:**

### **1. Bot Starts Glued (Default)**
```
Bot status: GLUED TO FLOOR
Auto-hop: DISABLED
Music selection: FLOWING (background)
Only mods/co-owners can unglue
```

**Background Activity (Even When Glued):**
- Selects music every 5 minutes
- Maintains genre tracking
- Keeps social awareness active
- Updates Spotify/Discogs cache
- Ready to DJ when unglued!

### **2. Mod Uses /glue Command**
```
💬 Moderator: /glue

🔓 BOT UNGLUED 🔓
Bot can now auto-hop up to stage.
Unglued by: Moderator

🔓 Bot unglued by Moderator (logged once in PowerShell)
```

### **3. Auto-Hop Logic Activates**
```
Stage check every 10 seconds:
  
If ≤3 DJs and bot off stage:
  → 🎧 Auto-hopping up: Only 2 DJs on stage
  → Selects song
  → Hops up with song
  
If ≥3 human DJs and bot on stage:
  → 🎧 Auto-hopping down: 3 humans on stage (making room)
  → Hops down after playing 1 song
  → Sets 2-minute cooldown
```

### **4. Mod Uses /glue Again (Re-Glue)**
```
💬 Moderator: /glue

🔒 BOT GLUED TO FLOOR 🔒
Bot removed from stage and cannot auto-hop up.
Glued by: Moderator

🔒 Bot glued to floor by Moderator (logged once in PowerShell)
```

---

## 📜 **Auto-Hop Logic from Original Bot:**

### **Hop Up Conditions:**
- ✅ ≤3 DJs on stage
- ✅ Bot is NOT glued to floor
- ✅ 2-minute cooldown has passed (after last hop down)
- ✅ Song selected BEFORE hopping up

### **Hop Down Conditions:**
- ✅ ≥3 HUMAN DJs on stage (bot is 4th)
- ✅ Bot has played ≥1 song since hopping up
- ✅ Makes room for human DJs

### **Emergency Queueing:**
- ✅ If bot on stage with NO music playing → queue immediately!
- ✅ If bot on stage alone → queue immediately!

---

## 💻 **Console Output (Clean - No Spam!):**

### **Bot Glued (Shows Once):**
```
🔒 Bot is GLUED TO FLOOR (use /glue command to unglue)
```

### **Mod Unglues:**
```
🔓 Bot unglued by Moderator
```

### **Auto-Hop Up:**
```
🎧 Auto-hopping up: Only 2 DJs on stage
👥 Audience match: doom metal (2 DJs, 5 users)
🔍 Spotify search: genre:"doom metal" year:1993
✨ Selected: Candlemass - Solitude
🤖 BOT Playing: Candlemass - Solitude
✅ Hopped on stage with: Candlemass - Solitude
```

### **Auto-Hop Down:**
```
🎧 Auto-hopping down: 3 humans on stage (making room)
✅ Hopped off stage
```

### **Cooldown (Shows Once Per Second Value):**
```
⏰ Hop cooldown: 120s remaining
⏰ Hop cooldown: 60s remaining  
⏰ Hop cooldown: 30s remaining
```

---

## 🎮 **/glue Command:**

### **Usage:**
```
/glue - Toggle bot between glued/unglued state
```

### **Permissions:**
- ✅ Room co-owners
- ✅ Room moderators
- ❌ Regular users (denied)

### **When Glued:**
```
🔒 BOT GLUED TO FLOOR 🔒
Bot removed from stage and cannot auto-hop up.
Glued by: [ModName]
```

### **When Unglued:**
```
🔓 BOT UNGLUED 🔓
Bot can now auto-hop up to stage.
Unglued by: [ModName]
```

---

## ⚙️ **Configuration:**

### **Settings in StageManager:**
```javascript
this.minDJsForBot = 3;  // Bot hops up if ≤3 DJs
this.maxDJsForBot = 4;  // Bot hops down if 4+ DJs
this.hopCooldown = 2 * 60 * 1000; // 2 minutes
this.gluedToFloor = true; // DEFAULT: Glued
```

### **Adjust Settings:**
```javascript
// Change min DJs for bot to hop
this.minDJsForBot = 2; // Hops up if ≤2 DJs

// Change cooldown
this.hopCooldown = 5 * 60 * 1000; // 5 minutes

// Start unglued (not recommended)
this.gluedToFloor = false;
```

---

## 🔄 **Stage Management Flow:**

```
Every 10 seconds:

0. Keep music flowing (ALWAYS - even when glued)
   → Background music selection every 5 minutes
   → Maintains vibe analysis & social awareness
   → Logs: "🎵 Background music selection (maintaining flow)"
   → Logs: "💭 Would play: Artist - Song" (debug)
  
1. Check if bot is glued
   → Yes? Skip auto-hop (log once, but MUSIC STILL FLOWS)
   → No? Continue to step 2

2. Check if critical emergency
   → Bot on stage with no music? Queue immediately!
   
3. Check DJ count
   → ≤3 DJs? Hop up (if cooldown passed)
   → ≥3 human DJs? Hop down (after 1 song)
   
4. Check if bot on stage without queue
   → Queue song immediately
```

---

## 📊 **Song Selection Integration:**

When bot hops up or queues:
```
1. Call MusicSelector.selectSong(roomState)
2. MusicSelector reads who's on stage & in room
3. Weights genres based on DJs (3x) and users (1x)
4. Selects random song from weighted genre
5. Returns song to StageManager
6. StageManager searches hang.fm catalog
7. Bot hops up or queues the song
```

**Bot's song selection is socially aware!** 👥

---

## ✅ **Benefits:**

### **1. Clean Logging**
- Glue status only shown ONCE when it changes
- No spam every 10 seconds
- Only logs meaningful state changes

### **2. Mod Control**
- Mods/co-owners control when bot can DJ
- Default glued = bot stays on floor
- `/glue` toggles state

### **3. Smart Stage Logic**
- Hops up when stage needs filling (≤3 DJs)
- Hops down when humans need room (≥3 humans)
- Plays at least 1 song before hopping down
- 2-minute cooldown prevents spam

### **4. Emergency Handling**
- If on stage with no music → queue immediately!
- Never leaves stage empty

---

## 🚀 **Test It:**

```powershell
node "c:\Users\markq\Ultimate bot project\hangfm-bot-modular\hang-fm-bot.js"
```

### **Expected Output:**
```
✅ Bot started successfully (Modular)
🎵 Listening for events...
🔒 Bot glued to floor (default) - mods can use /glue to allow auto-hop

[User uses /glue]
🔓 Bot unglued by Moderator

[Stage has ≤3 DJs]
🎧 Auto-hopping up: Only 2 DJs on stage
👥 Audience match: doom metal (2 DJs, 5 users)
✨ Selected: Candlemass - Solitude
✅ Hopped on stage with: Candlemass - Solitude
```

---

## 📝 **Commands:**

| Command | Who Can Use | Effect |
|---------|-------------|--------|
| `/glue` | Mods/Co-owners | Toggle glue state |
| N/A | Everyone | Bot auto-manages when unglued |

---

## ✅ **Status:**

| Feature | Status |
|---------|--------|
| Glued by default | ✅ Done |
| /glue command | ✅ Done |
| Permission checking (mods/co-owners) | ✅ Done |
| Auto-hop up (≤3 DJs) | ✅ Done |
| Auto-hop down (≥3 humans) | ✅ Done |
| 2-minute cooldown | ✅ Done |
| Must play ≥1 song | ✅ Done |
| Emergency queueing | ✅ Done |
| Clean logging (no spam) | ✅ Done |
| Song selection integration | ✅ Done |
| Social awareness | ✅ Done |
| **Music flows even when glued** | **✅ Done** |
| **Maintains vibe analysis when glued** | **✅ Done** |
| **Background selection every 5min** | **✅ Done** |

---

## 📚 **Related Docs:**

- `SOCIAL-AWARENESS.md` - DJ/dancefloor matching
- `ROOM-VIBE-MATCHING.md` - Genre detection
- `TRUE-RANDOM-MUSIC.md` - Random discovery

---

**The bot now has FULL AUTO-STAGE MANAGEMENT with clean logging and mod control!** 🎧✨

