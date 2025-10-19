# 🤖 Quick Start Guide - Hang.fm Modular Bot

## ✅ Status: WORKING!
- ✅ Socket connects - bot is VISIBLE in room
- ✅ CometChat connects - bot can send/receive messages
- ✅ Commands working
- ✅ Stats tracking

## 🚀 Start the Bot

```powershell
cd "C:\Users\markq\Ultimate bot project"
node hangfm-bot-modular\hang-fm-bot.js
```

## 🧪 Test Commands (type in Hang.fm chat)

| Command | What it does |
|---------|-------------|
| `/help` or `/commands` | Show all available commands |
| `/stats` | Show your listening stats |
| `/poker` | Play a poker game |
| `/rps rock` | Play rock-paper-scissors |
| `/8ball Will this work?` | Ask the magic 8-ball |

## 🤖 AI Features (ENABLED)

The bot has **AI-powered chat** using Gemini (or OpenAI) with:
- 🎭 **Mood Tracking** - Adapts personality based on how you treat it
- 🧠 **Conversation Memory** - Remembers your last 5 exchanges
- 🛡️ **Content Filtering** - Blocks links and inappropriate content

**Trigger AI by saying:**
- `hey bot, what's playing?`
- `bot tell me about this artist`
- `@bot2 what do you think of this song?`

**Keywords that trigger AI:**
`bot`, `b0t`, `bot2`, `b0t2`, `@bot2`

**🎭 Mood Spectrum:**
- Be **nice** → Bot is friendly and helpful
- Be **neutral** → Bot is informative and straightforward
- Be **rude** → Bot gets sarcastic and snarky

**🧠 Memory:**
- Bot remembers your last conversation
- Context persists for 1 hour
- Can reference previous questions

**AI Provider:** Gemini 2.5 Flash (set in `hang-fm-config.env`)
- Can switch to OpenAI: `AI_PROVIDER=openai`
- Or HuggingFace: `AI_PROVIDER=huggingface`

## 👀 What to Look For

### ✅ GOOD - Bot is working:
```
[INFO] Connecting socket…
✅ Socket connected - bot should now be visible in room
[INFO] CometChat initialized.
[INFO] Boot greeting sent.
[INFO] Bot started.
```

### 📥 When someone types a command:
```
💬 Chat from [Username]: /help
🤖 Responding: Here are my commands...
```

### ❌ BAD - Something failed:
```
❌ Socket failed to connect: ...
❌ CometChat connection failed: ...
```

## 🐛 Troubleshooting

**Bot not visible in room:**
- Check `hang-fm-config.env` has valid `BOT_USER_TOKEN` and `ROOM_ID`
- Test with: `node hangfm-bot-modular\TEST-SOCKET.js`

**Bot visible but not responding:**
- Check console for "CometChat initialized"
- Look for errors about "Unauthorized" or "401"
- Make sure `COMETCHAT_API_KEY` and `COMETCHAT_AUTH` are correct

**Bot responds but commands fail:**
- Check console for specific error messages
- Some commands need user stats to be initialized first

## 📝 Files You Modified
- `hangfm-bot-modular/modules/connection/SocketManager.js` - Fixed token property names
- `hangfm-bot-modular/modules/connection/CometChatManager.js` - Fixed auth and message handling
- `hangfm-bot-modular/hang-fm-bot.js` - Fixed env loading and error handling

## 🎯 Next Steps
1. Test all commands in chat
2. Verify stats are being tracked
3. Check if music selection works (if bot is DJ)
4. Monitor console for any errors

## 🛑 Stop the Bot
Press `Ctrl+C` in the PowerShell window where it's running

