# 🎯 Room Vibe Matching - Genre-Based Learning

## ✅ **Bot Now Matches Room Vibe!**

The bot **analyzes genres from user plays** and **adapts its music selection** to match the room's vibe!

---

## 🎵 **How It Works:**

### **1. User Plays Song**
```
👤 USER Playing: Wu-Tang Clan - C.R.E.A.M. (DJ: HipHopHead)
📊 Analyzing genre: HipHopHead played Wu-Tang Clan - C.R.E.A.M.
```

### **2. Bot Detects Genre (via Spotify API)**
```
🔍 Querying Spotify for: Wu-Tang Clan C.R.E.A.M.
✅ Detected genre: conscious hip hop
```

### **3. Bot Tracks Genre Preference**
```
🎯 Room vibe: conscious hip hop (from HipHopHead)
📊 Genre tracking: conscious hip hop (3 plays)
```

### **4. Bot Adapts Selection**
```
🤖 BOT's turn to play...
🎯 Vibe match: Selected conscious hip hop (popular in room)
🔍 Spotify search: genre:"conscious hip hop" year:1994
✨ Selected: Common - I Used to Love H.E.R.
```

---

## 📊 **Vibe Matching Algorithm:**

### **Genre Detection:**
1. User plays a song
2. Bot queries Spotify for artist genres
3. Matches Spotify genres to bot's genre pool (63 genres)
4. Tracks the matched genre

### **Weighted Selection (70/30 Rule):**
- **70% of the time:** Pick from top 5 popular genres in room
- **30% of the time:** Pick randomly for variety

### **Preference Decay:**
- After 20 user plays, old preferences decay by 10%
- Keeps system responsive to current vibe
- If room shifts from metal to hip hop, bot adapts!

---

## 🎯 **Example Scenarios:**

### **Scenario 1: Hip Hop Room**
```
User 1 plays: Wu-Tang Clan - C.R.E.A.M.
  → Detected: conscious hip hop
  
User 2 plays: Madvillain - Accordion  
  → Detected: underground hip hop

User 3 plays: Aesop Rock - None Shall Pass
  → Detected: abstract hip hop

Room Vibe Stats: conscious hip hop (1), underground hip hop (1), abstract hip hop (1)

Bot's Next Pick (70% chance):
  → Selects from: conscious/underground/abstract hip hop
  ✨ Result: MF DOOM - Accordion
```

### **Scenario 2: Metal Room**
```
User 1 plays: Sleep - Dopesmoker
  → Detected: doom metal
  
User 2 plays: Electric Wizard - Funeralopolis
  → Detected: doom metal

User 3 plays: Kyuss - Green Machine
  → Detected: stoner metal

Room Vibe Stats: doom metal (2), stoner metal (1)

Bot's Next Pick (70% chance):
  → Weighted toward doom/stoner metal
  ✨ Result: Candlemass - Solitude
```

### **Scenario 3: Mixed Room**
```
User 1 plays: Radiohead - Paranoid Android
  → Detected: alternative rock
  
User 2 plays: Portishead - Glory Box
  → Detected: trip hop

User 3 plays: My Bloody Valentine - Only Shallow
  → Detected: shoegaze

Room Vibe Stats: alternative rock (1), trip hop (1), shoegaze (1)

Bot's Next Pick:
  → 70% chance picks from those 3 genres
  → 30% chance picks random for variety
```

---

## 💻 **Console Output:**

```
👤 USER Playing: Wu-Tang Clan - C.R.E.A.M. (DJ: HipHopHead)
📊 Analyzing genre: HipHopHead played Wu-Tang Clan - C.R.E.A.M.
🎯 Room vibe: conscious hip hop (from HipHopHead)

👤 USER Playing: Madvillain - Accordion (DJ: MFDOOMFan)  
📊 Analyzing genre: MFDOOMFan played Madvillain - Accordion
🎯 Room vibe: underground hip hop (from MFDOOMFan)

[Bot's turn]
🎯 Vibe match: Selected conscious hip hop (popular in room)
🔍 Spotify search: genre:"conscious hip hop" year:1994
✨ Selected: Common - I Used to Love H.E.R.
📊 5/10 unplayed | 1 total history
🤖 BOT Playing: Common - I Used to Love H.E.R.
```

---

## 🔧 **Technical Details:**

### **Genre Pool (63 Genres):**
All bot selections come from these genres only:
- Alternative Hip Hop + subgenres (18)
- Alternative Rock + subgenres (35)  
- Alternative Metal (10)

### **Spotify Genre Matching:**
```javascript
Spotify returns: ["hip hop", "conscious hip hop", "east coast hip hop"]
Bot matches to: "conscious hip hop" (from our 63 genre pool)
```

### **Weighted Selection Formula:**
```javascript
1. Get top 5 genres by play count
2. Calculate total weight (sum of all play counts)
3. Random weighted selection:
   - If "doom metal" has 5 plays
   - And "conscious hip hop" has 3 plays
   - Total weight = 8
   - 62.5% chance doom metal, 37.5% chance conscious hip hop
```

### **Preference Decay:**
```javascript
Every 20 user plays:
- All genre counts × 0.9
- Keeps system responsive to current vibe
- Old preferences fade gradually
```

---

## ⚙️ **Configuration:**

### **Enable/Disable Vibe Matching:**
```javascript
// In MusicSelector constructor
this.vibeMatchingEnabled = true; // Set to false for pure random
```

### **Adjust Vibe Matching Percentage:**
```javascript
// In selectGenreBasedOnVibe()
const shouldMatchVibe = Math.random() < 0.7; // 70% vibe match, 30% random
// Change 0.7 to 0.8 for 80% match, 0.5 for 50% match, etc.
```

### **Exclude Bots from Learning:**
```env
# In hang-fm-config.env
EXCLUDE_BOT_NAMES=bot,bot2,hangbot,musicbot
EXCLUDE_USERIDS=user-uuid-1,user-uuid-2
```

---

## 📝 **What Bot Does NOT Do:**

### **❌ Does NOT Learn New Artists**
- Bot does NOT add artists from user plays to its selection pool
- Bot ONLY discovers from Spotify/Discogs using its 63 genres

### **✅ ONLY Matches Genres**
- Bot analyzes what GENRES users prefer
- Bot plays more of those genres
- All artists still come from Spotify/Discogs random discovery

---

## 🎯 **Benefits:**

### **1. Room Cohesion**
- If room loves doom metal, bot plays doom metal
- Bot fits the vibe instead of random selection

### **2. Variety Maintained**
- 30% random selection keeps things interesting
- Discovers new artists within popular genres

### **3. Responsive System**
- Preference decay means bot adapts quickly
- Room shifts from hip hop to metal? Bot follows!

### **4. No Bad Matches**
- Bot never learns mainstream pop from user plays
- Stays within alternative hip hop, rock, and metal genres

---

## 🚀 **Test It:**

```powershell
node "c:\Users\markq\Ultimate bot project\hangfm-bot-modular\hang-fm-bot.js"
```

### **Watch For:**
```
📊 Analyzing genre: [username] played [artist] - [track]
🎯 Room vibe: [genre] (from [username])
🎯 Vibe match: Selected [genre] (popular in room)
```

### **Test Vibe Matching:**
1. Have users play several songs from same genre
2. Watch bot detect and track the genre
3. When bot plays, it should pick that genre more often
4. Room vibe stats show top 3 genres

---

## ✅ **Status:**

| Feature | Status |
|---------|--------|
| Genre detection (Spotify) | ✅ Done |
| Genre tracking | ✅ Done |
| Vibe-based selection | ✅ Done |
| Weighted algorithm (70/30) | ✅ Done |
| Preference decay | ✅ Done |
| Exclude bots | ✅ Done |
| Console logging | ✅ Done |
| Does NOT learn artists | ✅ Correct |
| Only matches genres | ✅ Correct |

---

## 📚 **Related Docs:**

- `ROOM-EVENT-TRACKING.md` - Full event tracking
- `TRUE-RANDOM-MUSIC.md` - Random discovery system
- `FINAL-SUMMARY.md` - Complete bot overview

---

**The bot now ADAPTS to room vibe by matching genres, NOT by learning new artists!** 🎯✨

