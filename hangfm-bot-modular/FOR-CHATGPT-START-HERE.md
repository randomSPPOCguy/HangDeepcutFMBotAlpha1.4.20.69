# 🤖 For ChatGPT - Start Here!

## 🎯 **Current Issue:**

**The modular bot cannot receive chat messages via CometChat WebSocket.**

- ✅ Bot **can SEND** messages (HTTP API works)
- ❌ Bot **cannot RECEIVE** messages (WebSocket times out)
- ❌ Commands in chat are not processed

---

## 📋 **Read These Files in Order:**

1. **`COMETCHAT-DEBUG-FOR-CHATGPT.md`** ← **Start here for full debug info**
2. **`CHATGPT-HANDOFF.md`** ← Project status & features
3. **`CHATGPT-SPEC-COMPLETE.md`** ← What's been implemented
4. **Compare:**
   - `modules/connection/CometChatManager.js` (broken)
   - `hangfm-bot/hang-fm-bot.js` lines 3065-3355 (working)

---

## 🎯 **Your Mission:**

**Fix CometChat WebSocket** so modular bot can receive chat messages and process commands.

**The HTTP API works**, so credentials are valid. It's a **WebSocket implementation issue**.

---

## 🚀 **Test After Fix:**

```powershell
node "hangfm-bot-modular\hang-fm-bot.js"
```

**Then in chat:**
```
/help
/stats
/glue
```

**Should see:**
```
💬 Username: /help
[Bot responds]
```

---

## 📚 **Full Documentation:**

- `COMETCHAT-DEBUG-FOR-CHATGPT.md` - Debugging info
- `CHATGPT-HANDOFF.md` - Project overview
- `CHATGPT-SPEC-COMPLETE.md` - Implementation status
- `AUTO-STAGE-MANAGEMENT.md` - Stage logic
- `SOCIAL-AWARENESS.md` - DJ/user matching
- `TRUE-RANDOM-MUSIC.md` - Music discovery
- `AFK-PROTECTION.md` - AFK timer system

---

**Start with `COMETCHAT-DEBUG-FOR-CHATGPT.md` for all the details!** 🔧✨

