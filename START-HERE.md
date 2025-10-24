# 🤖 Modular Python Bot - Architecture & Setup Guide

## 🎯 Overview

This is a **Python-only**, **modular** bot for Hang.fm that:
- ✅ Connects directly to TT.fm via **Primus WebSocket** (no relay)
- ✅ Connects to CometChat via **WebSocket** for messaging
- ✅ Uses **async/await** for non-blocking I/O
- ✅ Loads all config from `hang-fm-config.env`
- ✅ Runs in `.venv` Python virtual environment

---

## 📁 Project Structure

```
hangfm_bot/
├── __init__.py
├── config.py                 # Pydantic settings (loads env vars)
├── message_queue.py          # Central event queue
├── permissions.py            # Role management
├── uptime.py                 # Bot uptime tracking
├── user_memory.py            # User sentiment/conversation history
│
├── connection/               # WebSocket clients
│   ├── ttfm_socket_client.py    # TT.fm Primus WebSocket
│   ├── cometchat_socket.py      # CometChat WebSocket
│   └── __init__.py
│
├── handlers/                 # Command handlers
│   ├── command_handler.py    # Parse & execute commands
│   └── __init__.py
│
├── ai/                       # AI providers
│   ├── ai_manager.py         # Multi-provider wrapper
│   └── __init__.py
│
├── music/                    # Music features
│   ├── genre_classifier.py   # Genre learning
│   └── __init__.py
│
└── utils/                    # Utilities
    ├── content_filter.py     # Spam/profanity
    ├── role_checker.py       # Permission checks
    └── __init__.py

main.py                      # Entry point
hang-fm-config.env           # ⚠️ LOCAL ONLY - Your credentials
hang-fm-config.env.example   # Safe template (no secrets)
requirements.txt             # Python dependencies
.venv/                       # Virtual environment (DO NOT COMMIT)
```

---

## 🔌 How It Works

### 1️⃣ **Startup** (`main.py`)

```python
# Load config from hang-fm-config.env
settings = Settings()

# Start WebSocket clients
ttfm_socket = TTFMSocketClient()
cometchat_socket = CometChatSocketClient()

# Join room + send boot message
await ttfm_socket.start()
await cometchat_socket.start()
```

### 2️⃣ **TT.fm Connection** (`hangfm_bot/connection/ttfm_socket_client.py`)

**What it does:**
- Connects to Primus WebSocket at `wss://socket.prod.tt.fm/primus?token=YOUR_TOKEN`
- Sends `joinRoom` action to register in room
- Listens for room events (users join/leave, songs play, DJs change)
- Pushes all events to `message_queue` for processing

**Key methods:**
```python
await ttfm_socket.start()           # Connect & join room
await ttfm_socket.send_join_room()  # Send joinRoom action
await ttfm_socket.wait_joined()     # Wait for room join confirmation
await ttfm_socket._ping_loop()      # Heartbeat (ping/pong)
await ttfm_socket._read_loop()      # Receive & parse messages
```

### 3️⃣ **CometChat Connection** (`hangfm_bot/connection/cometchat_socket.py`)

**What it does:**
- Connects to CometChat WebSocket at `wss://APPID.websocket-REGION.cometchat.io/`
- Sends auth frame with JWT token
- Listens for incoming messages
- Sends group messages via WebSocket

**Key methods:**
```python
await cometchat_socket.start()              # Connect & authenticate
await cometchat_socket.wait_authed()        # Wait for auth confirmation
await cometchat_socket.send_group_text()    # Send message to room
```

### 4️⃣ **Message Queue** (`hangfm_bot/message_queue.py`)

**Central hub** for all incoming events:

```python
# All socket events → queue
queue.put({
    "source": "ttfm",           # or "cometchat"
    "type": "room_join",        # event type
    "data": {...}               # event data
})

# Main loop processes queue
while True:
    event = await queue.get()
    await process_queue_item(event)
```

### 5️⃣ **Event Processing** (`main.py` - `process_queue_item()`)

```python
async def process_queue_item(item):
    source = item.get("source")
    event_type = item.get("type")
    data = item.get("data")
    
    # TT.fm events
    if source == "ttfm":
        if event_type == "room_join":
            # User joined
        elif event_type == "room_leave":
            # User left
        elif event_type == "song_play":
            # New song started
        elif event_type == "dj_change":
            # New DJ
    
    # CometChat events
    elif source == "cometchat":
        if event_type == "message":
            # User sent message
            text = data.get("text")
            user_id = data.get("sender")
            await command_handler.handle_command(text, user_id)
```

---

## ⚙️ Configuration (`hang-fm-config.env`)

**REQUIRED fields:**
```env
ROOM_UUID=your-room-uuid                    # From Local Storage
TTFM_AUTH_TOKEN=your-jwt-token              # From Primus URL
COMETCHAT_APPID=your-app-id                 # From Local Storage
COMETCHAT_UID=your-bot-uuid                 # From Local Storage
COMETCHAT_AUTH=your-auth-token              # From CometChat WS frame
```

**OPTIONAL fields:**
```env
BOOT_GREET=true                             # Send message on startup
BOOT_GREET_MESSAGE=BOT Online 🦾🤖

LOG_LEVEL=INFO                              # DEBUG, INFO, WARNING, ERROR

GEMINI_API_KEY=                             # For AI responses
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
HUGGINGFACE_API_KEY=

SPOTIFY_CLIENT_ID=                          # For music discovery
SPOTIFY_CLIENT_SECRET=
DISCOGS_USER_TOKEN=
```

---

## 🚀 Quick Start

### Step 1: Setup

```powershell
# Clone the repo and checkout modular-python branch
git clone https://github.com/randomSPPOCguy/HangDeepcutFMBotAlpha1.4.20.69.git
cd HangDeepcutFMBotAlpha1.4.20.69
git checkout modular-python

# Create virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

### Step 2: Configure

```powershell
# Copy example to real config
cp hang-fm-config.env.example hang-fm-config.env

# Edit with your tokens
notepad hang-fm-config.env
```

### Step 3: Run

```powershell
cd C:\Users\markq\Ultimate bot project
.\.venv\Scripts\python.exe main.py
```

**Expected output:**
```
INFO:hangfm_bot.connection.ttfm_socket_client:TT.fm: connecting wss://socket.prod.tt.fm/primus?token=...
INFO:hangfm_bot.connection.ttfm_socket_client:TT.fm: joinRoom sent for YOUR_ROOM_ID
INFO:hangfm_bot.connection.ttfm_socket_client:TT.fm: join confirmed — bot should be visible in room.
INFO:hangfm_bot.connection.cometchat_socket:CometChat: connecting wss://YOUR_APPID.websocket-us.cometchat.io/
INFO:hangfm_bot.connection.cometchat_socket:CometChat: auth frame sending for YOUR_UID
INFO:hangfm_bot.connection.cometchat_socket:CometChat: auth response SUCCESS
INFO:__main__:Boot greet sent via CometChat WS.
```

---

## 🔄 How to Work on This via Codex

### Option 1: Edit via GitHub Web Editor

1. Go to: https://github.com/randomSPPOCguy/HangDeepcutFMBotAlpha1.4.20.69/tree/modular-python
2. Click `.` to open **GitHub Codespaces** (web editor)
3. Edit files directly
4. Commit & push changes
5. Tell me the branch/commit hash
6. I'll pull & test locally

### Option 2: VS Code Remote (via Codex)

1. Open project in VS Code
2. Use **Remote - SSH** or **Remote - Containers**
3. Work on files
4. Push to GitHub
5. I'll pull & integrate

### Option 3: Tell Me What to Change

1. Describe what you want to change
2. I'll make the changes in Cursor
3. Test locally
4. Push to `modular-python` branch
5. You review on GitHub

---

## 📝 Common Tasks

### Add a New Command

**File:** `hangfm_bot/handlers/command_handler.py`

```python
async def handle_command(self, text: str, user_id: str):
    if text.startswith("/mycommand"):
        # Your logic here
        response = "Command executed!"
        await self.cometchat.send_group_text(response)
```

### Send a Message

```python
from hangfm_bot.connection.cometchat_socket import CometChatSocketClient

cometchat = CometChatSocketClient()
await cometchat.send_group_text("Hello room! 👋")
```

### Access Settings

```python
from hangfm_bot.config import settings

print(settings.room_uuid)       # Your room ID
print(settings.cometchat_uid)   # Your bot UUID
print(settings.boot_greet)      # True/False
```

### Log Something

```python
import logging
LOG = logging.getLogger(__name__)

LOG.info("This is an info message")
LOG.warning("This is a warning")
LOG.error("This is an error")
```

---

## 🐛 Debugging

### Enable Debug Logging

Edit `hang-fm-config.env`:
```env
LOG_LEVEL=DEBUG
```

### Check Connection Status

Run the diagnostic:
```powershell
.\.venv\Scripts\python.exe hangfm_bot/diagnostics/cometchat_check.py
```

### Common Issues

**Issue:** `ModuleNotFoundError: No module named 'pydantic_settings'`
```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

**Issue:** `No visibility and chat` (bot doesn't appear in room)
- Check `TTFM_AUTH_TOKEN` is correct
- Check `ROOM_UUID` is correct
- Check `ttfm_socket_client.py` logs show "join confirmed"

**Issue:** Messages not sending to chat
- Check `COMETCHAT_AUTH` is correct
- Check `COMETCHAT_UID` is correct
- Check `COMETCHAT_APPID` is correct
- Check `cometchat_socket.py` logs show "auth response SUCCESS"

---

## 📊 Data Flows

### Room Join Event Flow

```
TT.fm Primus WS
     ↓
ttfm_socket_client receives: {"action": "user_join", ...}
     ↓
Normalize to: {"source": "ttfm", "type": "room_join", "data": {...}}
     ↓
message_queue.put(event)
     ↓
main.process_queue_item(event)
     ↓
Log "User X joined"
```

### Chat Message Flow

```
User types in chat on Hang.fm
     ↓
CometChat WS sends message
     ↓
cometchat_socket receives: {"type": "message", "text": "/help", ...}
     ↓
Normalize to: {"source": "cometchat", "type": "message", "data": {...}}
     ↓
message_queue.put(event)
     ↓
main.process_queue_item(event)
     ↓
command_handler.handle_command("/help", user_id)
     ↓
cometchat_socket.send_group_text("Available commands: ...")
     ↓
Message appears in chat
```

---

## 🔑 Key Files to Understand

1. **`main.py`** - Entry point, event loop, startup logic
2. **`hangfm_bot/config.py`** - Settings/environment variables
3. **`hangfm_bot/connection/ttfm_socket_client.py`** - TT.fm WebSocket
4. **`hangfm_bot/connection/cometchat_socket.py`** - CometChat WebSocket
5. **`hangfm_bot/message_queue.py`** - Event queue
6. **`hangfm_bot/handlers/command_handler.py`** - Command parsing

---

## 🚀 Next Steps

1. **Codex Integration:** Edit files on GitHub, I'll pull & test
2. **Add Commands:** Extend `command_handler.py`
3. **Add AI:** Integrate `ai_manager.py` for responses
4. **Add Music Features:** Extend `music/` module
5. **Deploy:** Push to production when stable

---

## 📞 Questions?

- **How do I add a new command?** → Edit `command_handler.py`
- **How do I send a message?** → Use `cometchat.send_group_text()`
- **Where are my tokens?** → In local `hang-fm-config.env` (NEVER commit)
- **How do I test locally?** → Run `main.py` in terminal
- **How do I work via Codex?** → Use GitHub web editor or Codespaces

Happy coding! 🎵🤖
