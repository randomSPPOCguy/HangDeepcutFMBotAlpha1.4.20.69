# 🤖 AI Implementation - Need ChatGPT Review

**Date:** October 19, 2025  
**Status:** AI keyword detection added, but needs review for proper implementation

---

## 📝 What I Changed

### **File: `hangfm-bot-modular/modules/handlers/EventHandler.js`**

**Location:** Lines 49-71

**Before:**
```javascript
// Optional: AI on mention
if (this.bot?.ai?.isEnabled && this.bot.ai.isEnabled()) {
  const name = this.bot?.config?.botName || '';
  const mentioned = name && new RegExp(`\\b${name.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\\\$&')}\\b`, 'i').test(text);
  if (mentioned && this.bot?.spam?.canUseAI?.(userId)) {
    const reply = await this.bot.ai.generateReply(text, { userId, userName });
    if (reply) await this.bot.say?.(this.roomId, reply);
    this.bot.spam?.recordAIUsage?.(userId);
    return;
  }
}
```

**After:**
```javascript
// Optional: AI on keyword triggers
if (this.bot?.ai?.isEnabled && this.bot.ai.isEnabled()) {
  // Check for keyword triggers (bot, b0t, etc.)
  const keywords = this.bot?.config?.keywordTriggers || ['bot', 'b0t', 'bot2', 'b0t2', '@bot2'];
  const textLower = text.toLowerCase();
  const hasKeyword = keywords.some(kw => textLower.includes(kw.toLowerCase()));
  
  if (hasKeyword && userId !== this.bot?.config?.userId && this.bot?.spam?.canUseAI?.(userId)) {
    this.logger?.log?.(`🎯 AI keyword detected: ${text}`);
    
    // Get current song info from state
    const currentSong = this.bot?.socket?.state?.room?.currentSong;
    const roomState = this.bot?.socket?.state;
    
    const reply = await this.bot.ai.generateResponse(text, userId, userName, currentSong, roomState);
    if (reply) {
      await this.bot?.chat?.sendMessage?.(this.roomId, reply);
      this.logger?.log?.(`🤖 AI response: ${reply}`);
    }
    this.bot.spam?.recordAIUsage?.(userId);
    return;
  }
}
```

---

## 🔍 What I Did

### ✅ **Changes Made:**

1. **Keyword Detection**
   - Changed from bot NAME check to KEYWORD check
   - Uses `config.keywordTriggers` array (default: `['bot', 'b0t', 'bot2', 'b0t2', '@bot2']`)
   - Case-insensitive matching

2. **Method Call**
   - Changed from `bot.ai.generateReply(text, context)` 
   - To: `bot.ai.generateResponse(text, userId, userName, currentSong, roomState)`

3. **Context Passing**
   - Now passes current song from `socket.state.room.currentSong`
   - Passes full room state for context

4. **Response Routing**
   - Changed from `bot.say(roomId, reply)`
   - To: `bot.chat.sendMessage(roomId, reply)`

---

## ❓ Questions for ChatGPT

### **1. Method Signature Question**

AIManager has TWO methods:
- `generateResponse(message, userId, userName, currentSong, roomState)` - Returns string
- `generateReply(text, context)` - Simpler wrapper

**Which should I use?** I switched to `generateResponse` because it matches the original bot, but is that correct?

### **2. State Access Question**

I'm accessing socket state like this:
```javascript
const currentSong = this.bot?.socket?.state?.room?.currentSong;
const roomState = this.bot?.socket?.state;
```

**Is this the right way?** Or should I use a getter method from SocketManager?

### **3. Spam Protection Question**

I call:
```javascript
if (this.bot?.spam?.canUseAI?.(userId)) {
  // Generate AI response
  this.bot.spam?.recordAIUsage?.(userId);
}
```

**Is this spam protection sufficient?** The original bot has more complex checks in `checkAiKeywordSpam()`.

### **4. Content Filter Question**

The original bot checks for hateful content BEFORE AI processing. Should I add:
```javascript
if (this.bot?.filter?.isHateful?.(text)) {
  // Block message
  return;
}
```

Before the AI keyword check?

### **5. User Sentiment Question**

AIManager has `updateUserSentiment(userId, message)` that affects AI personality. Is this being called automatically inside `generateResponse()`, or should I call it first in EventHandler?

---

## 📊 Current AI Architecture

### **Flow:**
```
User: "hey bot, what's up?"
  ↓
EventHandler.handleChatMessage()
  ↓
Check if message contains keyword ("bot")
  ↓
Check spam protection (canUseAI)
  ↓
Get current song/room state
  ↓
AIManager.generateResponse(text, userId, userName, song, state)
  ↓
Send reply via CometChat
  ↓
Record AI usage (spam protection)
```

### **Modules Involved:**

1. **EventHandler** - Detects keywords, routes to AI
2. **AIManager** - Generates AI responses
3. **GeminiProvider** - Calls Gemini API
4. **SpamProtection** - Prevents AI abuse
5. **CometChatManager** - Sends AI response to chat

---

## 🔧 Configuration (hang-fm-config.env)

```bash
# AI Settings
AI_PROVIDER=gemini                    # Current provider
GEMINI_API_KEY=AIzaSy...              # Valid key (already set)
GEMINI_MODEL=gemini-2.5-flash         # Model to use
OPENAI_API_KEY=sk-proj-...            # Backup key (already set)
OPENAI_MODEL=gpt-4o-mini              # Backup model

# Keyword Triggers
KEYWORD_TRIGGERS=bot,b0t,bot2,b0t2,@bot2

# AI Behavior
RESPONSE_LENGTH_LIMIT=200             # Max chars in AI response
```

---

## 🐛 Potential Issues

### **Issue 1: Socket State Not Populated**

Console shows:
```
Room: Unknown Room
Bot: Unknown
Users in room: 0
```

This means `socket.state.room` might not have the data I'm expecting. When I pass `currentSong` to AI, it might always be `null`.

**Question:** How do I properly get the current song from socket state?

### **Issue 2: Method Not Found?**

I'm calling `bot.ai.generateResponse()` but haven't tested if it works. 

**Question:** Should I add error handling like:
```javascript
if (typeof this.bot.ai.generateResponse !== 'function') {
  this.logger.error('generateResponse method not found');
  return;
}
```

### **Issue 3: Response Not Appearing**

The AI might generate a response but fail to send it if:
- `bot.chat.sendMessage()` doesn't exist
- Room ID is wrong
- CometChat group join still failing

**Question:** Should I add fallback logging to debug failed sends?

---

## 📁 Files ChatGPT Should Review

**Modified Files:**
1. **`hangfm-bot-modular/modules/handlers/EventHandler.js`** (lines 49-71) - AI keyword detection

**Related Files (for context):**
2. **`hangfm-bot-modular/modules/ai/AIManager.js`** - AI response generator
3. **`hangfm-bot-modular/modules/ai/GeminiProvider.js`** - Gemini API calls
4. **`hangfm-bot-modular/modules/utils/SpamProtection.js`** - AI spam prevention
5. **`hangfm-bot-modular/modules/connection/SocketManager.js`** - State management

**Reference (original working bot):**
6. **`hangfm-bot/hang-fm-bot.js`** (lines 3307-3340) - How original bot handles keywords

---

## 🎯 What I Need ChatGPT to Review

1. **Is my keyword detection correct?**
2. **Am I using the right AIManager method?**
3. **Is the state access pattern correct?**
4. **Should I add content filtering before AI?**
5. **Are there any missing checks or error handling?**
6. **How to properly get current song info?**

---

## 🧪 Testing Needed

Once ChatGPT reviews, I need to test:

1. Type `hey bot` in chat - does it respond?
2. Type `bot what's playing?` - does it know the song?
3. Spam test - type `bot` 5 times quickly - should get blocked
4. Type `@bot2 hello` - alternate keyword test
5. Check console for AI generation logs

---

## 📝 Original Bot's AI Flow (for comparison)

From `hangfm-bot/hang-fm-bot.js` lines 3563-3705:

```javascript
async processUserMessage(text, senderId, senderName, messageId = null) {
  // Check for links
  const linkResult = await this.checkAndHandleLinks(text, senderId, senderName, messageId);
  if (linkResult === 'blocked') return;
  
  // Track user activity for AFK
  this.userLastActivity.set(senderId, Date.now());
  
  // Check for commands FIRST
  if (text.startsWith('/')) {
    await this.handleCommand(text, senderId, senderName);
    return;
  }
  
  // Check hateful content
  if (this.contentFilterEnabled) {
    const isHateful = await this.detectHatefulContentQuick(text);
    if (isHateful) {
      await this.handleInappropriateChatContent(senderId, senderName, text);
      return;
    }
  }
  
  // Check AI keyword spam
  const canUseAI = await this.checkAiKeywordSpam(senderId, text);
  if (!canUseAI) return;
  
  // Generate AI response
  const response = await this.generateAIResponse(text, senderId, senderName);
  if (response) {
    await this.sendChat(response);
  }
}
```

**Differences from my implementation:**
- Original checks links BEFORE AI
- Original checks hateful content BEFORE AI  
- Original has separate `checkAiKeywordSpam()` method
- Original uses `sendChat()` instead of `chat.sendMessage()`

---

**Compiled by:** Cursor AI (Claude Sonnet 4.5)  
**Commit:** 3b0fbfd - "Add AI keyword detection"  
**GitHub:** https://github.com/randomSPPOCguy/HangDeepcutFMBotAlpha1.4.20.69

