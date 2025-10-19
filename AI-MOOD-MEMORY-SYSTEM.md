# 🎭 AI Mood & Memory Spectrum System

**Status:** ✅ Implemented across all AI providers  
**Date:** October 19, 2025

---

## 🧠 **How It Works**

The bot tracks **mood** and **conversation memory** for each user, creating a personalized experience that adapts to how users interact with it.

### **Mood Spectrum**
```
😡 Negative ←→ 😐 Neutral ←→ 😊 Positive
```

**Tracked Per User:**
- Current mood (positive, neutral, negative)
- Mood history (last 10 mood changes)
- Interaction count (total times user talked to bot)
- Last interaction timestamp

### **Memory Spectrum**
```
🆕 First Time ←→ 📚 Familiar ←→ 🤝 Regular
```

**Stored Per User:**
- Last 10 messages (5 exchanges: user + bot responses)
- Conversation start time
- Last message timestamp
- Auto-cleanup after 1 hour of inactivity

---

## 📊 **Mood Detection**

### **Positive Triggers:**
```javascript
['thanks', 'thank you', 'help', 'info', 'tell me', 'what is', 
 'good', 'cool', 'awesome', 'love', 'great', 'nice']
```

**Example:**
```
User: "hey bot, thanks for the info!"
→ Mood: Positive
→ Bot responds: Friendly and helpful
```

### **Negative Triggers:**
```javascript
['stupid', 'dumb', 'suck', 'hate', 'fuck you', 'asshole', 
 'garbage', 'trash', 'shut up', 'annoying', 'useless']
```

**Example:**
```
User: "bot you suck"
→ Mood: Negative
→ Bot responds: Sarcastic and snarky
```

### **Neutral:**
```
User: "bot what's playing?"
→ Mood: Neutral (first interaction or mixed sentiment)
→ Bot responds: Informative and straightforward
```

---

## 💬 **Conversation Memory**

### **What's Stored:**

For each user, the bot remembers:
1. **Last 5 exchanges** (10 messages total)
2. **Message timestamps**
3. **User role** (user) vs **Bot role** (assistant)

**Example Conversation:**
```
User: "hey bot, what's this song?"
Bot: "It's The Smiths - This Charming Man from 1983..."

[30 seconds later]
User: "tell me more about the smiths"
Bot: "You just asked about This Charming Man! The Smiths were..." ← Remembers context!
```

### **Memory Cleanup:**

- Conversations older than **1 hour** are auto-deleted
- Keeps only **last 10 messages** per user (to save memory)
- Cleanup runs every time a new message is processed

---

## 🎨 **How AI Adapts by Mood**

### **Positive Mood (User is nice):**

**Personality Prompt:**
> "Be friendly and helpful. The user has been nice to you, so reciprocate their positive energy."

**Example:**
```
User: "hey bot, thanks for helping!"
Bot: "Happy to help! What else can I do for you? 😊"
```

---

### **Negative Mood (User is rude):**

**Personality Prompt:**
> "Match their energy - be sarcastic and blunt. They've been rude, so give it back to them with attitude."

**Example:**
```
User: "bot you're useless"
Bot: "Yet here you are, still talking to me. Interesting. 🙄"
```

---

### **Neutral Mood (First time or mixed):**

**Personality Prompt:**
> "Start completely NEUTRAL. Be informative and straightforward without sass or friendliness. Just answer the question."

**Example:**
```
User: "bot what year is this from?"
Bot: "This song is from 1985. It was released on their second album."
```

---

## 🔄 **Provider Consistency**

All three AI providers use **identical** mood and memory features:

### **Gemini (Primary)**
```javascript
// System instructions include mood
const systemInstructions = 
  `You are a chill, sarcastic music bot. 
   Current user mood: ${context.mood}. 
   You've talked to this user ${context.interactions} times before.
   ...`;

// Conversation history added to contents
contents = [
  ...conversationHistory,  // Previous messages
  { role: 'user', parts: [{ text: prompt }] }
];
```

### **OpenAI (Backup)**
```javascript
// System instructions include mood
const systemInstructions = 
  `You are a chill, sarcastic music bot. 
   Current user mood: ${context.mood}. 
   You've talked to this user ${context.interactions} times before.
   ...`;

// Conversation history added to messages
messages = [
  { role: 'system', content: systemInstructions },
  ...conversationHistory,  // Previous messages
  { role: 'user', content: prompt }
];
```

### **HuggingFace (Backup)**
```javascript
// Same mood-aware system instructions
// Same conversation history format
// Identical behavior to OpenAI/Gemini
```

---

## 📈 **Mood Tracking Over Time**

**Example User Journey:**

```
Message 1: "hey bot"
→ Mood: neutral (first interaction)
→ Bot: "Yeah? What's up?"

Message 2: "you're cool, thanks!"
→ Mood: positive (thanks detected)
→ Mood History: [neutral → positive]
→ Bot: "No problem! Happy to help 😊"

Message 3: "actually you suck"
→ Mood: negative (suck detected)
→ Mood History: [neutral → positive → negative]
→ Bot: "Well that changed fast. Make up your mind. 🙄"

Message 4: "sorry, just kidding"
→ Mood: positive (apologetic)
→ Mood History: [positive → negative → positive]
→ Bot: "Haha, no worries! I can take a joke."
```

---

## 🗂️ **Data Structure**

### **User Sentiment Object:**
```javascript
{
  sentiment: 'positive',        // Current overall sentiment
  mood: 'positive',             // Current mood state
  interactions: 5,              // Total interactions
  lastInteraction: 1697834567,  // Timestamp
  moodHistory: [                // Last 10 mood changes
    { 
      mood: 'neutral', 
      timestamp: 1697834000, 
      trigger: 'hey bot' 
    },
    { 
      mood: 'positive', 
      timestamp: 1697834100, 
      trigger: 'thanks!' 
    }
  ]
}
```

### **Conversation Object:**
```javascript
{
  messages: [                    // Last 10 messages
    { 
      role: 'user', 
      content: 'hey bot, what\'s this song?',
      timestamp: 1697834567 
    },
    { 
      role: 'assistant', 
      content: 'It\'s The Smiths - This Charming Man...',
      timestamp: 1697834568 
    }
  ],
  startedAt: 1697834567,         // Conversation start
  lastMessage: 1697834600         // Last activity
}
```

---

## 🎯 **Benefits**

### **1. Personalized Responses**
Each user gets a unique experience based on how they've interacted before.

### **2. Context Awareness**
Bot remembers recent conversation, so users don't have to repeat themselves.

### **3. Emotional Intelligence**
Bot adapts its tone based on user mood - friendly to nice users, snarky to rude ones.

### **4. Memory Efficiency**
Auto-cleanup prevents unlimited memory growth while preserving recent context.

### **5. Cross-Provider Consistency**
Whether using Gemini, OpenAI, or HuggingFace, users get the same personalized experience.

---

## 🧪 **Testing the System**

### **Test 1: Mood Tracking**
```
You: "hey bot"
Bot: [Neutral response]

You: "thanks bot, you're awesome!"
Bot: [Friendly positive response]

You: "bot you suck"
Bot: [Sarcastic negative response]
```

### **Test 2: Memory Retention**
```
You: "hey bot, what's this song?"
Bot: "It's Radiohead - Creep from 1992..."

[30 seconds later]
You: "tell me more about radiohead"
Bot: "You just asked about Creep! Radiohead formed in..." ← Remembers!
```

### **Test 3: Mood Evolution**
```
After 5 positive interactions:
Bot becomes more friendly and helpful

After 3 negative interactions:
Bot becomes more sarcastic and snarky
```

---

## ⚙️ **Configuration**

**In `hang-fm-config.env`:**
```bash
# AI Provider (uses mood & memory)
AI_PROVIDER=gemini

# Keyword Triggers
KEYWORD_TRIGGERS=bot,b0t,bot2,b0t2,@bot2

# Response Limits
RESPONSE_LENGTH_LIMIT=200

# Conversation Memory
ENABLE_CONVERSATION_MEMORY=true       # Already enabled by default
USER_MEMORY_DURATION=86400           # 24 hours (default: 1 hour in code)
```

---

## 📝 **Implementation Details**

### **File: `modules/ai/AIManager.js`**

**New Methods:**
- `getUserConversation(userId)` - Get or create conversation
- `addToConversation(userId, role, content)` - Store message
- `cleanupOldConversations()` - Remove old data

**Enhanced Methods:**
- `updateUserSentiment(userId, message)` - Now tracks mood history
- `generateResponse()` - Now passes context to providers

### **Files: All Providers**

**Updated:**
- `GeminiProvider.js` - Uses conversation history
- `OpenAIProvider.js` - Uses conversation history  
- `HuggingFaceProvider.js` - Uses conversation history

**Signature:**
```javascript
async generate(prompt, context = {
  mood: 'positive',
  sentiment: 'positive',
  moodHistory: [...],
  conversationHistory: [...],
  interactions: 5
})
```

---

## 🎓 **How Providers Use Context**

### **All Providers:**

1. **Inject mood into system prompt**
   ```
   "Current user mood: positive. You've talked 5 times before..."
   ```

2. **Add conversation history to messages**
   ```
   messages = [
     { role: 'system', content: '...' },
     { role: 'user', content: 'previous question' },
     { role: 'assistant', content: 'previous answer' },
     { role: 'user', content: 'current question' }
   ]
   ```

3. **Generate response with full context**
   - AI sees user's mood
   - AI remembers previous exchanges
   - AI adapts personality accordingly

---

## 🚀 **Result**

Users get:
- ✅ Personalized responses based on their behavior
- ✅ Contextual conversations that remember previous messages
- ✅ Emotional intelligence that matches their energy
- ✅ Consistent experience across all AI providers

**The bot feels more like a real person, less like a robot!** 🎉

