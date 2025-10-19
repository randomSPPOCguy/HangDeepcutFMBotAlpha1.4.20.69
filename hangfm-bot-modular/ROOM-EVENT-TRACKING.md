# 📡 Room Event Tracking - Reading User Activity

## ✅ **Bot Now Tracks All Room Events!**

The modular bot **reads and displays everything happening in the room** - all user activity, song plays, votes, and more!

---

## 🎵 **What the Bot Tracks:**

### **1. Song Plays (User vs Bot)**
```
👤 USER Playing: Radiohead - Paranoid Android (DJ: MusicLover)
🤖 BOT Playing: MF DOOM - Accordion
```

**Tracked Data:**
- Artist name
- Track name
- DJ name
- Whether it's a user or bot play
- Stats are updated for user plays only

**Learning System:**
- ✅ Excludes bot plays from stats
- ✅ Filters out excluded bots (configured in EXCLUDE_BOT_NAMES)
- ✅ Logs user plays for potential learning
- ✅ Future: Can analyze room vibe from user plays

---

### **2. Votes (Likes, Dislikes, Stars)**
```
👍 RandomUser liked: Wu-Tang Clan - C.R.E.A.M.
👎 SomeUser disliked: Nickelback - Photograph
⭐ CoolDJ starred: Sleep - Dopesmoker
```

**Tracked Data:**
- Voter name
- Vote type (like/dislike/star)
- Current song being voted on
- Activity tracking for AFK detection

---

### **3. DJ Activity**
```
🎧 NewDJ hopped on stage
👋 OldDJ stepped off stage
📝 ActiveDJ queued: Madvillain - Accordion
```

**Tracked Data:**
- DJ joins/leaves stage
- Queue updates
- Activity tracking

---

### **4. User Presence**
```
👤 JohnDoe joined the room
👋 JaneDoe left the room
```

**Tracked Data:**
- Users entering/exiting
- Activity tracking

---

### **5. Chat Messages**
```
💬 RandomUser: this song is fire 🔥
💬 Someone: /stats
```

**Tracked Data:**
- All chat messages
- Command detection
- User activity

---

### **6. Animations & Emojis**
```
✨ RandomUser sent 🎉 emoji animation
✨ CoolUser played confetti animation
```

**Tracked Data:**
- One-time animations
- Emoji sends

---

## 📊 **Stats Tracking from User Plays:**

The bot tracks comprehensive stats for **USER plays only**:

```javascript
// Song Stats
{
  "Wu-Tang Clan - C.R.E.A.M.": {
    "plays": 5,
    "likes": 12,
    "dislikes": 1,
    "stars": 3,
    "lastPlayed": "2025-10-14T12:34:56.789Z",
    "playedBy": ["user1", "user2", "user3"]
  }
}

// User Stats
{
  "user-uuid-123": {
    "username": "MusicLover",
    "plays": 42,
    "upvotes": 156,
    "stars": 23,
    "topArtists": {
      "Wu-Tang Clan": 5,
      "Radiohead": 8,
      "MF DOOM": 12
    }
  }
}
```

---

## 🎯 **Learning System:**

### **What the Bot Learns:**
1. **User Play Patterns** - Tracks what users are playing
2. **Vote Patterns** - What songs get liked/disliked
3. **Popular Artists** - Top artists in the room
4. **Activity Tracking** - Who's active vs AFK

### **Excluded from Learning:**
- Bot plays (the bot's own songs)
- Other bots (configured in `EXCLUDE_BOT_NAMES`)
- Excluded user IDs (configured in `EXCLUDE_USERIDS`)

### **Configuration:**
```env
# Exclude bots from learning
EXCLUDE_BOT_NAMES=bot,bot2,hangbot,musicbot

# Exclude specific user IDs
EXCLUDE_USERIDS=user-uuid-1,user-uuid-2
```

---

## 💻 **Console Output Example:**

```
🤖 Starting Hang.fm Bot (Modular)...
✅ Connected to Hang.fm
📍 Room: All Music Mix
👥 Users in room: 12
🎧 DJs on stage: 3

🎵 Listening for events...

📊 Updated user data (12 users in room)
👤 USER Playing: Wu-Tang Clan - C.R.E.A.M. (DJ: MusicLover)
📚 Learning: MusicLover played Wu-Tang Clan - C.R.E.A.M.
👍 RandomUser liked: Wu-Tang Clan - C.R.E.A.M.
👍 CoolDJ liked: Wu-Tang Clan - C.R.E.A.M.
⭐ AnotherUser starred: Wu-Tang Clan - C.R.E.A.M.

👤 USER Playing: Radiohead - Paranoid Android (DJ: IndieRockFan)
📚 Learning: IndieRockFan played Radiohead - Paranoid Android
👍 MusicLover liked: Radiohead - Paranoid Android
💬 RandomUser: this song is amazing!

🤖 BOT Playing: MF DOOM - Accordion
👍 IndieRockFan liked: MF DOOM - Accordion
👎 SomeUser disliked: MF DOOM - Accordion

🎧 NewDJ hopped on stage
📝 NewDJ queued: Sleep - Dopesmoker
```

---

## 🔧 **How It Works:**

### **Event Flow:**
```
TTFM Socket → SocketManager → Bot.js → EventHandler
                                           ↓
                        handlePlayedSong() - Displays & learns
                        handleVotedOnSong() - Tracks votes
                        handleAddedDj() - Tracks DJs
                        handleUserJoined() - Tracks presence
                        handleChatMessage() - Tracks chat
```

### **Learning Flow:**
```
User plays song → handlePlayedSong()
                     ↓
              Is it a bot? NO
                     ↓
              learnFromUserPlay()
                     ↓
              Check if excluded? NO
                     ↓
              Log: "Learning: User played Artist - Track"
                     ↓
              Update stats
                     ↓
              Future: Analyze room vibe
```

---

## 📝 **Future Enhancements (TODOs):**

### **Already Planned:**
```javascript
// TODO: Analyze user plays to detect room vibe
// - If users play lots of hip hop → bot plays more hip hop
// - If users play doom metal → bot matches the vibe

// TODO: Learn new artists from user plays
// - Discover artists from user plays
// - Add to discovery pool

// TODO: Adapt bot's music selection based on room preferences
// - Smart genre matching
// - Popularity-based selection
```

---

## ✅ **Status:**

| Feature | Status |
|---------|--------|
| Track user plays | ✅ Done |
| Track bot plays | ✅ Done |
| Distinguish user vs bot | ✅ Done |
| Track votes | ✅ Done |
| Track DJ activity | ✅ Done |
| Track chat messages | ✅ Done |
| Update stats | ✅ Done |
| Exclude bots from learning | ✅ Done |
| Display in console | ✅ Done |
| Learn from user plays | 🚧 Logging only (future: vibe analysis) |

---

## 🚀 **Test It:**

```powershell
node "c:\Users\markq\Ultimate bot project\hangfm-bot-modular\hang-fm-bot.js"
```

**Watch for:**
- `👤 USER Playing:` - User song plays
- `🤖 BOT Playing:` - Bot song plays  
- `👍 User liked:` - Vote activity
- `📚 Learning:` - What bot is learning from users

---

**The bot now FULLY tracks and learns from all room activity!** 🎵📡✨

