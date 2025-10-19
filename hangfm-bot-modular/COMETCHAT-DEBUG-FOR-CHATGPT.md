# 🐛 CometChat Command Issue - Debug Info for ChatGPT

## ❌ **Problem:**
**Modular bot is NOT responding to chat commands.**

---

## 🔍 **Current Symptoms:**

### **What WORKS:** ✅
- ✅ TTFM Socket connection (connects to Hang.fm)
- ✅ Room events display (songs, votes, DJs, users)
- ✅ Stats tracking (loads/saves user & song stats)
- ✅ **CometChat HTTP API for SENDING messages** (boot greeting works!)
- ✅ All commands are implemented (`/stats`, `/poker`, `/weather`, etc.)
- ✅ Admin commands implemented (`/glue`, `/.ai`, `/.grant`, etc.)
- ✅ Spam protection implemented

### **What DOESN'T WORK:** ❌
- ❌ **CometChat WebSocket for RECEIVING messages**
- ❌ Bot doesn't see chat messages
- ❌ Commands sent in chat are not received by bot
- ❌ WebSocket auth times out (no response from CometChat)

---

## 📊 **Console Output:**

```
💬 Connecting to CometChat...
🔗 CometChat URL: wss://193427bb5702bab7.websocket-us.cometchat.io/v3.0/
✅ CometChat WebSocket opened
🔐 Sending CometChat auth for user: 47713050-89a9-4019-b563-b0804da12bec
📤 CometChat auth message sent - waiting for response...
⚠️  CometChat WebSocket auth timeout (15s) - messages may not be received!
⚠️  Bot can send but cannot receive messages via WebSocket

[Later...]
📤 Sending boot greeting...
💬 Sent: 🎃 BOT Online 🦾🤖 🎃
✅ Boot greeting sent successfully!
```

**Observations:**
1. WebSocket opens successfully ✅
2. Auth message sent ✅
3. **NO response from CometChat** ❌
4. Timeout after 15 seconds ❌
5. HTTP API sending works ✅

---

## 🔧 **Current Implementation:**

### **File:** `modules/connection/CometChatManager.js`

**Auth Message Sent:**
```javascript
const authMessage = {
  appId: this.config.cometChatApiKey,  // "193427bb5702bab7"
  type: "auth",
  sender: this.config.userId,           // "47713050-89a9-4019-b563-b0804da12bec"
  body: {
    auth: this.config.cometChatAuth,    // From env
    deviceId: `WEB-4_0_10-${this.config.userId}-${Date.now()}`,
    presenceSubscription: "ALL_USERS"
  }
};
this.ws.send(JSON.stringify(authMessage));
```

**Expected Response:**
```javascript
// Looking for any of these:
message.type === 'auth' ||
message.type === 'authSuccess' ||
message.body?.code === '200' ||
message.body?.success ||
message.status === 'success' ||
message.code === '200'
```

**Result:** No response received ❌

---

## ✅ **Original Bot (Working) Reference:**

### **File:** `hangfm-bot/hang-fm-bot.js`

**Same Implementation:**
```javascript
// Line 3091-3100
this.cometChatWs.send(JSON.stringify({
  appId: "193427bb5702bab7",
  type: "auth",
  sender: this.userId,
  body: {
    auth: this.cometChatAuth,
    deviceId: `WEB-4_0_10-${this.userId}-${Date.now()}`,
    presenceSubscription: "ALL_USERS"
  }
}));
```

**This works in original bot!** ✅

**Why does it work there but not in modular?**

---

## 🎯 **Key Differences:**

### **Modular Bot:**
- Uses `modules/connection/CometChatManager.js`
- Callback-based message handling
- `onMessage(callback)` registration
- `parseChatMessage()` helper

### **Original Bot:**
- CometChat WebSocket in main bot class
- Direct `handleCometChatMessage()` method
- Same auth format

**Difference:** Original bot might be receiving messages but modular isn't. Need to debug why!

---

## 🔬 **Debugging Steps for ChatGPT:**

### **1. Check if WebSocket is actually receiving:**
Add this to `CometChatManager.js` line 63:
```javascript
this.ws.on('message', (data) => {
  console.log(`🔵 RAW WEBSOCKET MESSAGE: ${data.toString()}`);
  // ... rest of handling
});
```

### **2. Check if auth message format is correct:**
Log the exact auth message being sent:
```javascript
console.log(`📤 Sending auth: ${JSON.stringify(authMessage)}`);
this.ws.send(JSON.stringify(authMessage));
```

### **3. Compare with original bot:**
Run original bot side-by-side and compare:
- Auth message sent
- Auth response received
- Message format

### **4. Check environment variables:**
Verify these are set correctly:
- `COMETCHAT_AUTH` - Per-user auth token
- `COMETCHAT_API_KEY` - App ID (193427bb5702bab7)
- `USER_ID` - Bot's user UUID

---

## 📂 **Files to Review:**

### **Priority 1 - The Issue:**
- `modules/connection/CometChatManager.js` - WebSocket not receiving

### **Priority 2 - Working Reference:**
- `hangfm-bot/hang-fm-bot.js` - Lines 3065-3355 (CometChat implementation)

### **Priority 3 - Event Handling:**
- `modules/handlers/EventHandler.js` - Chat message routing
- `modules/core/Bot.js` - How CometChat is wired

---

## 🎯 **Goal:**

**Fix CometChat WebSocket** so the modular bot can:
- ✅ Receive chat messages
- ✅ Process commands
- ✅ Respond to users

**The HTTP API works for sending** - we just need to receive messages!

---

## 💡 **Possible Causes:**

1. **WebSocket auth response not matching expected format**
   - Need to see actual response from CometChat
   - May need different auth success check

2. **Message callback not registered properly**
   - `onMessage(callback)` might not be wired correctly
   - Check in `Bot.js` line 67-72

3. **Message format parsing issue**
   - Original bot uses `message.body.type === 'text'`
   - Modular might be looking in wrong place

4. **Environment variable mismatch**
   - Check if `COMETCHAT_AUTH` token is valid
   - Verify it matches what original bot uses

---

## 🔧 **Quick Tests:**

### **Test 1: Use Original Bot Config**
Make sure modular bot loads from same `hang-fm-config.env` as original.
✅ Already does this (line 16: `c:\Users\markq\Ultimate bot project\hang-fm-config.env`)

### **Test 2: Compare WebSocket Messages**
Run original bot with verbose logging and capture:
- Auth message sent
- Auth response received
- First chat message received

### **Test 3: Try Different Auth Format**
CometChat v3.0 might expect different auth format.
Check CometChat v3.0 docs for WebSocket auth.

---

## 📝 **Environment Check:**

```env
# From hang-fm-config.env (project root)
COMETCHAT_AUTH=<per-user-token>
COMETCHAT_API_KEY=193427bb5702bab7
USER_ID=47713050-89a9-4019-b563-b0804da12bec
ROOM_ID=a75a3a53-533a-4ced-90c8-dd569ce8ba04
```

These same values work in original bot! ✅

---

## ✅ **What's Already Correct:**

- ✅ Auth message format matches original
- ✅ WebSocket URL matches original
- ✅ Environment variables loaded correctly
- ✅ HTTP API works (proves credentials are valid)
- ✅ Event routing implemented
- ✅ Command handlers implemented

**Something small is different in how messages are received!**

---

## 🎯 **For ChatGPT:**

**Focus on:** `modules/connection/CometChatManager.js`

**Compare with:** `hangfm-bot/hang-fm-bot.js` lines 3065-3355

**Goal:** Make WebSocket receive messages like original bot does.

**The auth credentials are correct** (HTTP API works), so it's a **WebSocket implementation issue**.

---

**Good luck ChatGPT!** 🤖🔧

