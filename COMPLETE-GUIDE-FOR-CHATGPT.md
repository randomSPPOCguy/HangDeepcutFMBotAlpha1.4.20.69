# 🤖 Hang.fm Bot - Complete Technical Guide

**Date:** October 20, 2025  
**Version:** Modular Bot v2.0  
**Status:** Production-ready with recent fixes

---

## 📂 **Complete Project Structure**

```
Ultimate bot project/
│
├── hangfm-bot-modular/                    ← MODULAR BOT (working on this)
│   │
│   ├── hang-fm-bot.js                     ← MAIN ENTRY POINT
│   ├── package.json                       ← Dependencies
│   ├── hang-fm-config.env.example         ← Config template
│   │
│   └── modules/
│       │
│       ├── ai/                            ← AI & MOOD SYSTEM
│       │   ├── AIManager.js               ← Mood tracking, response generation
│       │   ├── GeminiProvider.js          ← Google Gemini API
│       │   ├── OpenAIProvider.js          ← OpenAI GPT API
│       │   └── HuggingFaceProvider.js     ← HuggingFace API
│       │
│       ├── connection/                    ← SOCKET & CHAT
│       │   ├── SocketManager.js           ← Hang.fm socket, readiness gate
│       │   └── CometChatManager.js        ← Chat messages, deduplication
│       │
│       ├── core/                          ← CORE LOGIC
│       │   ├── Bot.js                     ← Bot orchestration
│       │   └── Config.js                  ← Configuration loader
│       │
│       ├── handlers/                      ← EVENT HANDLING
│       │   ├── EventHandler.js            ← Message routing, AI triggers
│       │   ├── CommandHandler.js          ← Command processing
│       │   ├── ChatHandler.js             ← Chat logic
│       │   └── AdminCommandHandler.js     ← Admin commands
│       │
│       ├── features/                      ← BOT FEATURES
│       │   ├── ContentFilter.js           ← Security, link filtering
│       │   ├── StageManager.js            ← DJ stage management
│       │   ├── AFKDetector.js             ← AFK detection
│       │   ├── HolidayDecorator.js        ← Holiday themes
│       │   └── WeatherService.js          ← Weather integration
│       │
│       ├── music/                         ← MUSIC SYSTEM
│       │   ├── MusicSelector.js           ← Song selection
│       │   ├── QueueManager.js            ← Queue management
│       │   ├── CatalogSearcher.js         ← Music catalog search
│       │   └── MetadataFetcher.js         ← Song metadata
│       │
│       ├── stats/                         ← STATISTICS
│       │   ├── StatsManager.js            ← Stats tracking
│       │   ├── UserStats.js               ← User statistics
│       │   ├── SongStats.js               ← Song statistics
│       │   └── PokerGame.js               ← Poker mini-game
│       │
│       └── utils/                         ← UTILITIES
│           ├── Logger.js                  ← Logging system
│           ├── SpamProtection.js          ← Spam detection
│           └── Helpers.js                 ← Helper functions
│
├── hangfm-bot/                            ← ORIGINAL BOT (production)
│   ├── hang-fm-bot.js                     ← Single-file version
│   ├── hang-fm-config.env                 ← Config (not in zip)
│   └── package.json
│
├── README.md                              ← Project overview
├── QUICK-START.md                         ← Quick guide
├── AI-MOOD-MEMORY-SYSTEM.md               ← AI documentation
└── COMPLETE-GUIDE-FOR-CHATGPT.md          ← This file
```

---

## 🎯 **Files You're Reviewing**

### **1. Main Entry Point**

**File:** `hangfm-bot-modular/hang-fm-bot.js`  
**Lines:** ~300 total  
**Purpose:** Initializes all modules, connects services, starts bot

**Key sections:**
- Lines 1-50: Imports and setup
- Lines 141-143: ContentFilter instantiation
- Lines 220-234: Patch error handling (your fix)
- Lines 238-242: updatedUserData listener (readiness gate)

---

### **2. Socket & Connection**

#### **SocketManager.js**
**Path:** `hangfm-bot-modular/modules/connection/SocketManager.js`  
**Lines:** ~195 total  
**Purpose:** Manages ttfm-socket connection, room state

**Your fixes:**
- Line 13: `_ready` flag (readiness gate)
- Lines 61-65: Removed premature logging
- Lines 174-194: `_maybeMarkReady()` method
- Line 192: `isReady()` accessor

**What it does:**
- Connects to Hang.fm socket
- Waits for `updatedUserData` event
- Only logs room info when state is complete
- Prevents "Unknown Room / Users: 0" bug

#### **CometChatManager.js**
**Path:** `hangfm-bot-modular/modules/connection/CometChatManager.js`  
**Lines:** ~150 total  
**Purpose:** HTTP polling for chat messages

**Your fix:**
- Line 122: Changed to `const messageKey = ${message.id};`
- Was: `${messageId}_${sender}_${text}` (BUGGY)
- Now: Uses unique message ID only

**What it does:**
- Polls CometChat API every 2 seconds
- Deduplicates messages by ID
- Routes messages to event handlers
- Prevents processing same message twice

---

### **3. AI System**

#### **AIManager.js**
**Path:** `hangfm-bot-modular/modules/ai/AIManager.js`  
**Lines:** ~400 total  
**Purpose:** Mood tracking, AI orchestration

**Your implementation:**
- Lines 180-256: `updateUserSentiment()` (5-tier mood)
- Lines 46-66: Personality prompts (mood-adaptive)
- Lines 68-120: `generateResponse()` method
- Lines 258-280: Conversation memory

**Mood tiers:**
```javascript
hostile      → 3+ consecutive negative
annoyed      → 2 consecutive negative
neutral      → default
positive     → nice interaction
enthusiastic → 3+ consecutive positive
```

**Mood decay:**
- 30-minute timeout
- Resets to neutral after inactivity

#### **AI Providers**
**Paths:**
- `hangfm-bot-modular/modules/ai/GeminiProvider.js`
- `hangfm-bot-modular/modules/ai/OpenAIProvider.js`
- `hangfm-bot-modular/modules/ai/HuggingFaceProvider.js`

**Your alignment:**
- All use same mood-based `basePersona`
- All normalize to 300 tokens (Gemini was 1024)
- All include conversation history
- Temperature: 0.7-0.8 (consistent)

**Code (all providers):**
```javascript
let basePersona = 'helpful and straightforward';
if (context.mood === 'enthusiastic') basePersona = 'extra friendly, playful';
else if (context.mood === 'positive') basePersona = 'friendly and witty';
else if (context.mood === 'annoyed') basePersona = 'moderately sarcastic';
else if (context.mood === 'hostile') basePersona = 'very sarcastic, blunt';
```

---

### **4. Event Handling**

#### **EventHandler.js**
**Path:** `hangfm-bot-modular/modules/handlers/EventHandler.js`  
**Lines:** ~110 total  
**Purpose:** Routes chat messages, triggers AI

**Your implementation:**
- Lines 43-44: AI keyword array
- Lines 56-74: Link safety check (whitelist)
- Lines 77-83: Hate speech check
- Lines 86-100: AI response generation

**AI keywords:**
```javascript
['bot', 'b0t', 'bot2', 'b0+', 'bοt']
```

**Flow:**
```
1. Receive message
2. Check if command (starts with /)
3. Check for AI keyword
4. Check link safety (whitelist YouTube, Spotify)
5. Check hate speech
6. Call AIManager.generateResponse()
7. Send reply to chat
```

---

### **5. Security**

#### **ContentFilter.js**
**Path:** `hangfm-bot-modular/modules/features/ContentFilter.js`  
**Lines:** ~105 total  
**Purpose:** Content moderation, link filtering

**Your critical fixes:**

**Fix 1: Type normalization**
```javascript
// Lines 11-14
_normalizeUnsafe(res) {
  if (typeof res === 'string') return res.trim().toUpperCase() === 'UNSAFE';
  return Boolean(res);
}
```

**Fix 2: Domain spoofing prevention**
```javascript
// Lines 60-98
async checkLinkSafety(url) {
  const allowedSchemes = new Set(['http:', 'https:']);
  const u = new URL(url);

  // BEFORE: domain.includes(safeDomain) ← VULNERABLE
  // AFTER: domain === sd || domain.endsWith('.' + sd) ← SAFE

  const isWhitelisted = safeDomains.some(sd =>
    domain === sd || domain.endsWith('.' + sd)
  );
}
```

**Blocks:**
- ✅ `spotify.com.evil.tld` (domain spoofing)
- ✅ `javascript:alert(1)` (dangerous scheme)
- ✅ `data:text/html,...` (data URLs)
- ✅ `file.exe` (dangerous extension)

**Allows:**
- ✅ `youtube.com/watch?v=123`
- ✅ `music.youtube.com` (valid subdomain)
- ✅ `open.spotify.com/track/xyz`

#### **SpamProtection.js**
**Path:** `hangfm-bot-modular/modules/utils/SpamProtection.js`  
**Lines:** ~200 total  
**Purpose:** Rate limiting, cooldowns

**Features:**
- 10-second AI cooldown per user
- Multi-trigger spam detection
- Staff bypass (co-owners, mods)
- Regular user tolerance (higher limits)

---

## 🔧 **Recent Fixes (Per Your Review)**

### **Fix 1: Socket Readiness Gate** ✅
**Problem:** Logged "Unknown Room / Users: 0" prematurely  
**Solution:** Wait for `updatedUserData` event before logging

**File:** `modules/connection/SocketManager.js`  
**Lines changed:** 13, 61-65, 174-194

**Before:**
```javascript
this.state = connection.state;
console.log(`Room: ${this.state.room?.name || 'Unknown Room'}`); // ← Too early!
```

**After:**
```javascript
this.state = connection.state;
console.log(`⏳ Waiting for room state...`); // ← Wait for event

// Later, in _maybeMarkReady():
if (name && users > 0) {
  this._ready = true;
  console.log(`📍 Room ready: ${name}`); // ← Now correct!
}
```

---

### **Fix 2: Message Deduplication** ✅
**Problem:** Used text in dedup key, blocked repeated words  
**Solution:** Use only unique message ID

**File:** `modules/connection/CometChatManager.js`  
**Line changed:** 122

**Before:**
```javascript
const messageKey = `${message.id}_${message.sender}_${text}`;
// Typing "bot" twice = same key = ignored!
```

**After:**
```javascript
const messageKey = `${message.id}`;
// Each message has unique ID, always processes
```

---

### **Fix 3: Domain Spoofing Prevention** ✅
**Problem:** `domain.includes(safeDomain)` allowed `spotify.com.evil.tld`  
**Solution:** Strict subdomain matching

**File:** `modules/features/ContentFilter.js`  
**Lines changed:** 82-85

**Before:**
```javascript
const isWhitelisted = safeDomains.some(safeDomain => 
  domain.includes(safeDomain) // ← VULNERABLE
);
```

**After:**
```javascript
const isWhitelisted = safeDomains.some(sd =>
  domain === sd || domain.endsWith('.' + sd) // ← SAFE
);
```

---

### **Fix 4: Type Normalization** ✅
**Problem:** AI returns mixed types ("SAFE"/"UNSAFE" or boolean)  
**Solution:** Normalize all responses to boolean

**File:** `modules/features/ContentFilter.js`  
**Lines changed:** 11-14, 20-21, 52

**Added:**
```javascript
_normalizeUnsafe(res) {
  if (typeof res === 'string') return res.trim().toUpperCase() === 'UNSAFE';
  return Boolean(res);
}
```

---

### **Fix 5: Provider Consistency** ✅
**Problem:** Gemini used 1024 tokens, others used 300  
**Solution:** Normalize all to 300

**Files:**
- `modules/ai/GeminiProvider.js` (line 51)
- `modules/ai/OpenAIProvider.js` (already 300)
- `modules/ai/HuggingFaceProvider.js` (kept 200 for smaller models)

---

### **Fix 6: Mood-Aligned Prompts** ✅
**Problem:** All providers said "sarcastic" regardless of mood  
**Solution:** Dynamic persona based on mood tier

**Files:** All 3 AI providers (lines 26-32 in each)

**Implementation:**
```javascript
let basePersona = 'helpful and straightforward';
if (context.mood === 'enthusiastic') basePersona = 'extra friendly, playful, and warm';
// ... other tiers
const systemInstructions = `You are a ${basePersona} music bot...`;
```

---

## 📊 **What ChatGPT Said**

### **✅ Approved:**
1. All fixes are correct
2. Code quality is good
3. Modular structure is on right track
4. Ready for production (after implementing their suggestions)

### **🔧 Suggestions to Implement:**

**1. Fix Unknown Room Bug (again?)**
- Wait for `room.metadata.name` before logging
- Ensure `updateState()` is called after patch

**2. Reorder Content Filtering**
- Check hate speech BEFORE AI keyword
- Check links BEFORE AI keyword
- Current order: keyword → filter (WRONG)
- Correct order: filter → keyword (RIGHT)

**3. Use `generateReply()` Method**
- Standardize context handling
- Better for testing
- Consistent across providers

**4. Add Mood Decay Timestamps**
- Store `lastInteraction` timestamp
- Reset mood after 10-30 minutes inactivity
- Already implemented (30 min decay)

---

## 🎯 **File-by-File Summary**

| File | Lines | Purpose | Your Changes |
|------|-------|---------|--------------|
| `hang-fm-bot.js` | 300 | Main entry | ContentFilter init, patch errors |
| `SocketManager.js` | 195 | Socket conn | Readiness gate, removed dupe |
| `CometChatManager.js` | 150 | Chat polling | Dedup fix (ID only) |
| `EventHandler.js` | 110 | Message routing | Link whitelist, filtering |
| `AIManager.js` | 400 | Mood & AI | 5-tier mood, decay, memory |
| `GeminiProvider.js` | 100 | Gemini API | Mood prompts, 300 tokens |
| `OpenAIProvider.js` | 100 | OpenAI API | Mood prompts |
| `HuggingFaceProvider.js` | 100 | HuggingFace | Mood prompts |
| `ContentFilter.js` | 105 | Security | Type norm, domain spoofing |
| `SpamProtection.js` | 200 | Rate limits | (no changes, working) |
| `Config.js` | 80 | Config | (no changes, working) |

---

## 🚀 **How to Start Bot**

**Modular bot:**
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
cd "C:\Users\markq\Ultimate bot project"
node hangfm-bot-modular\hang-fm-bot.js
```

**Original bot:**
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
cd "C:\Users\markq\Ultimate bot project"
node hangfm-bot\hang-fm-bot.js
```

---

## 🧪 **Test Plan**

### **Test 1: Socket State**
```
✅ Start bot
✅ Wait for "Room ready: [Name]" (not "Unknown Room")
✅ Check user count > 0 (not "0")
```

### **Test 2: Message Deduplication**
```
✅ Type "bot" in chat
✅ Bot responds
✅ Type "bot" again
✅ Bot responds again (FIX VERIFIED)
```

### **Test 3: Link Filtering**
```
✅ "bot check youtube.com" → Allowed
✅ "bot visit evil-site.ru" → Blocked
✅ "bot javascript:alert(1)" → Blocked
```

### **Test 4: Mood Progression**
```
✅ "hey bot" → Neutral
✅ "thanks!" → Positive
✅ "you rock!" → Enthusiastic
✅ "bot you suck" → Negative
✅ "shut up" → Annoyed
✅ "useless" → Hostile
```

---

## 📦 **What's in the Zip**

```
hangfm-bot-modular/
├── hang-fm-bot.js
├── package.json
├── hang-fm-config.env.example
└── modules/
    ├── ai/ (4 files)
    ├── connection/ (2 files)
    ├── core/ (2 files)
    ├── handlers/ (4 files)
    ├── features/ (5 files)
    ├── music/ (4 files)
    ├── stats/ (4 files)
    └── utils/ (3 files)

Total: 33 files
All with proper folder structure
```

---

## ❓ **Questions for ChatGPT**

1. **Are the file paths clear?** Can you see exactly where each file is?
2. **Do you need any specific files re-explained?**
3. **Should we implement your 3 suggestions now or test first?**
4. **Any other concerns before production deployment?**

---

## 📝 **Next Steps**

After your approval:
1. Implement your 3 suggestions (if needed)
2. Test thoroughly
3. Deploy to production
4. Monitor for 24 hours

---

**All code is in the zip with exact folder structure matching the project!**

- User via Cursor AI Assistant
  October 20, 2025

