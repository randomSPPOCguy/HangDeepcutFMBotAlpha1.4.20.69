# ⏰ AFK Protection - Timer Resets & Safety

## ✅ **Bot NEVER Boots Active Users!**

The AFK timer **automatically resets** when users:
1. ✅ **Chat** (say anything in chat)
2. ✅ **Vote** (like, dislike, or star a song)
3. ✅ **Play a song**
4. ✅ **Hop on stage**
5. ✅ **Join the room**

---

## 🎯 **How It Works:**

### **Activity Tracking:**
```
User sends chat message → Timer RESET ✅
User votes on song → Timer RESET ✅
User plays a song → Timer RESET ✅
User hops on stage → Timer RESET ✅
User joins room → Timer RESET ✅
```

### **What You'll See in PowerShell:**

#### **User is Active (No Warning):**
```
💬 RandomUser: this song is fire
⏰ AFK timer reset for user (chat)

👍 RandomUser liked: Wu-Tang Clan - C.R.E.A.M.
⏰ AFK timer reset for user (vote)
```

#### **User Gets AFK Warning:**
```
⚠️ RandomUser inactive for 36 minutes

💬 Chat: "⚠️ AFK Warning: @RandomUser - You've been inactive for 36 minutes. 
         Vote or chat within 36 seconds or you'll be removed from stage."
```

#### **User Responds (Warning Cleared):**
```
💬 RandomUser: sorry was afk
✅ RandomUser activity detected (chat) - AFK timer reset & warning cleared
```

#### **User Doesn't Respond (Removed):**
```
⏰ Removing RandomUser from stage (AFK timeout)

💬 Chat: "⏰ RandomUser removed from stage due to inactivity."
```

---

## 📊 **AFK Timeline:**

```
0 min: User plays song → Timer starts
5 min: User votes → Timer RESET to 0
15 min: User chats → Timer RESET to 0
36 min: No activity → ⚠️ WARNING sent
36 min 20s: User votes → ✅ Warning CLEARED, timer RESET
```

**Or if user doesn't respond:**
```
0 min: User plays song → Timer starts
36 min: No activity → ⚠️ WARNING sent
36 min 36s: Still no activity → 🚫 REMOVED from stage
```

---

## 🔧 **Activity Types Tracked:**

| Activity | Resets Timer | Example |
|----------|--------------|---------|
| **Chat** | ✅ YES | "this song is fire" |
| **Vote** | ✅ YES | 👍 Like, 👎 Dislike, ⭐ Star |
| **Play Song** | ✅ YES | DJ plays a track |
| **Hop On Stage** | ✅ YES | User becomes a DJ |
| **Join Room** | ✅ YES | User enters the room |

**ANY of these activities = Timer RESET!** ⏰

---

## ⚙️ **Configuration:**

### **Current Settings:**
```javascript
this.afkTimeout = 36 * 60 * 1000;    // 36 minutes of inactivity
this.afkWarningTime = 36 * 1000;     // 36 seconds to respond
```

### **To Adjust:**
```javascript
// Increase to 45 minutes
this.afkTimeout = 45 * 60 * 1000;

// Give 1 minute to respond
this.afkWarningTime = 60 * 1000;
```

---

## 🎯 **Safety Features:**

### **1. Multiple Activity Types**
- Not just song plays
- Chat messages count!
- Votes count!
- Any interaction resets timer

### **2. Warning System**
- 36-minute warning before removal
- 36 seconds to respond
- Clear message in chat

### **3. Timer Reset Confirmation**
```
User was warned → User votes → Warning cleared
✅ RandomUser activity detected (vote) - AFK timer reset & warning cleared
```

### **4. Bot is Excluded**
```javascript
// Skip the bot
if (djId === this.bot.config.userId) continue;
```
Bot never gets AFK warnings or removal!

---

## 💻 **Console Output Examples:**

### **Active User:**
```
💬 MusicLover: love this track
⏰ AFK timer reset for user (chat)

👍 MusicLover liked: Sleep - Dopesmoker
⏰ AFK timer reset for user (vote)

👤 USER Playing: Electric Wizard - Funeralopolis (DJ: MusicLover)
⏰ AFK timer reset for user (song-play)
```

### **Inactive User (Gets Warned):**
```
⚠️ AFKUser inactive for 36 minutes

[36 seconds pass with no response]

⏰ Removing AFKUser from stage (AFK timeout)
💬 Chat: "⏰ AFKUser removed from stage due to inactivity."
```

### **User Saves Themselves:**
```
⚠️ AFKUser inactive for 36 minutes

💬 AFKUser: back
✅ AFKUser activity detected (chat) - AFK timer reset & warning cleared
```

---

## 📝 **Important Notes:**

### **✅ Users CANNOT Be Wrongly Booted If:**
- They're chatting ← Timer resets
- They're voting ← Timer resets
- They're playing songs ← Timer resets

### **❌ Users WILL Be Warned If:**
- 36 minutes of ZERO activity
- No chat, no votes, no song plays

### **🚫 Users WILL Be Removed If:**
- Warned at 36 minutes
- No response for 36 seconds
- Total: 36 minutes 36 seconds of inactivity

---

## 🎯 **Why This is Safe:**

**Active users are protected:**
- Chat = Timer reset
- Vote = Timer reset
- Any interaction = Timer reset

**Only truly AFK users are removed:**
- Must ignore warning
- Must not chat for 36+ minutes
- Must not vote for 36+ minutes

---

## ✅ **Testing:**

### **Test Timer Reset (Chat):**
```
1. User plays song
2. Wait 5 minutes
3. User says "nice track"
   → Timer resets to 0 ✅
```

### **Test Timer Reset (Vote):**
```
1. User plays song
2. Wait 30 minutes
3. User votes on current song
   → Timer resets to 0 ✅
```

### **Test Warning System:**
```
1. User plays song
2. Wait 36 minutes (no activity)
   → ⚠️ Warning sent
3. User chats within 36 seconds
   → ✅ Warning cleared, timer reset
```

---

## ✅ **Status:**

| Feature | Status |
|---------|--------|
| Timer resets on chat | ✅ DONE |
| Timer resets on vote | ✅ DONE |
| Timer resets on song play | ✅ DONE |
| Timer resets on hop-on-stage | ✅ DONE |
| Timer resets on join room | ✅ DONE |
| 36-minute inactivity warning | ✅ DONE |
| 36-second response window | ✅ DONE |
| Warning cleared on activity | ✅ DONE |
| Bot excluded from AFK | ✅ DONE |
| Activity type logging | ✅ DONE |

---

**The bot will NEVER boot users who are active in chat or voting!** ✅⏰

