# 👥 Social Awareness - Adapt to Who's On Stage & Dancefloor

## ✅ **Bot Now Reads the Room!**

The bot **reads who's on stage (DJs)** and **who's on the dancefloor (users)** and **adapts its music selection** based on WHO is present!

---

## 🎯 **How It Works:**

### **1. Bot Tracks Individual User Preferences**
```
User "DoomFan" plays: Sleep - Dopesmoker
  → Genre detected: doom metal
  → Tracked: DoomFan → doom metal (1 play)

User "DoomFan" plays: Electric Wizard - Funeralopolis  
  → Genre detected: doom metal
  → Tracked: DoomFan → doom metal (2 plays)

DoomFan's Profile:
  Top Genres: [doom metal, stoner metal, sludge metal]
```

### **2. Bot Reads Who's On Stage**
```
Socket state shows:
  DJs on stage: [DoomFan, HipHopHead, RockLover]
  Users in room: [MusicFan1, MusicFan2, IndieKid, MetalHead]
```

### **3. Bot Weights Selection (DJs 3x, Users 1x)**
```
DoomFan (DJ): doom metal (2 plays) → Weight: 6 (3x multiplier)
HipHopHead (DJ): conscious hip hop (3 plays) → Weight: 9 (3x multiplier)
MusicFan1 (User): shoegaze (1 play) → Weight: 1 (1x multiplier)
MetalHead (User): black metal (2 plays) → Weight: 2 (1x multiplier)

Total weights:
- conscious hip hop: 9
- doom metal: 6  
- black metal: 2
- shoegaze: 1
```

###  **4. Bot Adapts (80% Audience Match)**
```
👥 Audience match: conscious hip hop (3 DJs, 4 users)
🔍 Spotify search: genre:"conscious hip hop" year:1994
✨ Selected: Common - I Used to Love H.E.R.
```

---

## 🎵 **Weighting System:**

### **Priority Levels:**
1. **DJs on Stage** → 3x weight (highest priority)
2. **Users in Room** → 1x weight (lower priority)
3. **Random** → 20% of the time for variety

### **Algorithm:**
```javascript
80% of the time:
  - Collect top 5 genres from DJs (3x weight each)
  - Collect top 5 genres from users (1x weight each)
  - Weighted random selection based on totals

20% of the time:
  - Pick random genre for variety
```

---

## 📊 **Example Scenarios:**

### **Scenario 1: Doom Metal DJ Hops On**
```
Before:
  DJs: [HipHopHead, RockLover]
  Bot selection: conscious hip hop (from HipHopHead's profile)

After:
  DJs: [HipHopHead, RockLover, DoomFan]
  
  Weights:
  - conscious hip hop: 3 (HipHopHead)
  - indie rock: 3 (RockLover)
  - doom metal: 3 (DoomFan)
  
  Bot selection (weighted random):
  - 33% chance → conscious hip hop
  - 33% chance → indie rock
  - 33% chance → doom metal
  
Result: Bot now has 33% chance to play doom metal!
```

### **Scenario 2: User Leaves, New DJ Arrives**
```
Before:
  DJs: [DoomFan]
  Users: [MetalHead, IndieKid, HipHopFan]
  
  Weights:
  - doom metal: 6 (DoomFan 3x + MetalHead 1x + others)
  
After:  
  DJs: [DoomFan, HipHopHead]
  Users: [IndieKid] (MetalHead left)
  
  New Weights:
  - doom metal: 3 (DoomFan only)
  - conscious hip hop: 3 (HipHopHead)
  
Result: Bot adapts - now 50/50 between doom and hip hop!
```

### **Scenario 3: All DJs Step Off**
```
DJs: []
Users: [RandomUser1, RandomUser2]

Bot falls back to:
  - Room vibe (70% weighted toward popular genres overall)
  - Random (30% for variety)
```

---

## 💻 **Console Output:**

```
👤 USER Playing: Sleep - Dopesmoker (DJ: DoomFan)
📊 Analyzing genre: DoomFan played Sleep - Dopesmoker
🎯 Room vibe: doom metal (from DoomFan)
👤 DoomFan preference: doom metal (1 plays)

👤 USER Playing: Wu-Tang Clan - C.R.E.A.M. (DJ: HipHopHead)
📊 Analyzing genre: HipHopHead played Wu-Tang Clan - C.R.E.A.M.
🎯 Room vibe: conscious hip hop (from HipHopHead)
👤 HipHopHead preference: conscious hip hop (1 plays)

🎧 DoomFan hopped on stage
🎧 HipHopHead hopped on stage

[Bot's turn - reads room state]
👥 Audience match: doom metal (2 DJs, 5 users)
🔍 Spotify search: genre:"doom metal" year:1993
✨ Selected: Candlemass - Solitude
🤖 BOT Playing: Candlemass - Solitude
```

---

## 🎯 **Social Awareness Levels:**

### **Level 1: Individual Tracking**
- Tracks each user's top 5 favorite genres
- Builds user profiles over time
- Example: DoomFan → [doom metal, stoner metal, sludge metal]

### **Level 2: Stage Awareness**
- Reads who's currently on stage (DJs)
- Weights DJs 3x more than regular users
- Adapts when DJs hop on/off

### **Level 3: Room Awareness**
- Reads all users in the room
- Weights their preferences (1x)
- Creates overall audience profile

### **Level 4: Dynamic Adaptation**
- Bot selection changes as people enter/leave
- Real-time adaptation to room changes
- If your favorite DJ hops on → bot plays their genres more!

---

## ⚙️ **Configuration:**

### **Weight Multipliers:**
```javascript
// In getAudienceGenrePreferences()
genreWeights.set(genre, current + 3); // DJs weighted 3x
genreWeights.set(genre, current + 1); // Users weighted 1x

// Change to 5x for DJs: current + 5
// Change to 2x for users: current + 2
```

### **Audience Match Percentage:**
```javascript
// In selectGenreBasedOnVibe()
const shouldMatchAudience = Math.random() < 0.8; // 80% match audience

// Change to 90%: < 0.9
// Change to 70%: < 0.7
```

### **Enable/Disable:**
```javascript
// In MusicSelector constructor
this.socialAwarenessEnabled = true; // Set to false to disable
```

---

## 📝 **How Room State is Read:**

### **When Bot Selects Song:**
```javascript
// Bot.js calls MusicSelector.selectSong(roomState)
const roomState = this.socket.getState();

roomState contains:
{
  djs: [
    { uuid: 'user-123', name: 'DoomFan', ... },
    { uuid: 'user-456', name: 'HipHopHead', ... }
  ],
  users: [
    { uuid: 'user-789', name: 'MusicFan', ... },
    { uuid: 'user-123', name: 'DoomFan', ... }, // DJs also in users
    ...
  ]
}
```

### **Genre Matching:**
```javascript
1. Extract DJ UUIDs: ['user-123', 'user-456']
2. Extract all user UUIDs: ['user-789', 'user-123', ...]
3. Look up each user in userPreferences Map
4. Get their top 5 genres
5. Weight DJs 3x, users 1x
6. Select genre based on weights
```

---

## 🎵 **Multi-Layer Selection:**

```
Priority 1: Social Awareness (80%)
  └─> Who's on stage? Who's in room?
      └─> DJs weighted 3x
      └─> Users weighted 1x
      └─> Weighted random selection

Priority 2: Room Vibe (if no social data, 70%)
  └─> Overall popular genres
      └─> Weighted toward top 5 genres
      
Priority 3: Random (20-30%)
  └─> Pure random for variety
```

---

## ✅ **Benefits:**

### **1. Personalized Experience**
- If DoomFan hops on stage → bot plays doom metal
- If HipHopHead is in room → bot considers hip hop
- Room feels tailored to who's present!

### **2. Social Cohesion**
- Bot adapts to the crowd
- People feel "heard" by the bot
- Creates better room atmosphere

### **3. Dynamic Adaptation**
- Real-time changes as people hop on/off
- Bot stays relevant to current audience
- Never static - always adapting!

### **4. Still Discovers New Music**
- Doesn't learn new artists from users
- Only matches genres within 63-genre pool
- Discovers new artists via Spotify/Discogs

---

## 🚀 **Test It:**

```powershell
node "c:\Users\markq\Ultimate bot project\hangfm-bot-modular\hang-fm-bot.js"
```

### **Watch For:**
```
👤 User preference: doom metal (2 plays)
👥 Audience match: genre (X DJs, Y users)
```

### **Test Social Awareness:**
1. Have users play songs (bot learns their preferences)
2. Have those users hop on stage
3. Bot should play their favorite genres more often!
4. Different users hop on → bot adapts to new crowd!

---

## ✅ **Status:**

| Feature | Status |
|---------|--------|
| Track individual user preferences | ✅ Done |
| Read who's on stage (DJs) | ✅ Done |
| Read who's in room (users) | ✅ Done |
| Weight DJs 3x | ✅ Done |
| Weight users 1x | ✅ Done |
| 80% audience match | ✅ Done |
| Real-time adaptation | ✅ Done |
| Does NOT learn new artists | ✅ Correct |
| Only matches genres | ✅ Correct |
| Console logging | ✅ Done |

---

## 📚 **Related Docs:**

- `ROOM-VIBE-MATCHING.md` - Genre detection details
- `ROOM-EVENT-TRACKING.md` - Event tracking system
- `TRUE-RANDOM-MUSIC.md` - Random discovery system

---

**The bot now READS WHO'S ON STAGE & DANCEFLOOR and ADAPTS in real-time!** 👥✨

**If your favorite DJ hops on → bot plays their favorite genres!**

