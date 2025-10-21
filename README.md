# Hang.fm Bot - Python Version (Modular)

🎵 **Professional Modular Hang.fm Bot** with AI, Music Discovery, and Room Event Tracking

## ✨ Features

- **Multi-AI Support**: Gemini, Claude, OpenAI, HuggingFace (via aisuite)
- **Music Discovery**: Discogs + Spotify integration
- **Room Events**: Real-time Socket.IO event handling
- **Command System**: Role-based access control
- **Content Filtering**: Profanity detection
- **Genre Classification**: Alternative Hip Hop, Rock, Nu-Metal focus
- **Async/Await**: Modern Python asyncio architecture
- **Modular Design**: Clean folder structure for maintainability

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `env.example` to `.env` and fill in your credentials:

```bash
# Windows
Copy-Item env.example .env

# Linux/Mac
cp env.example .env
```

### 3. Run the Bot

**PowerShell one-liner:**
```powershell
cd c:\Users\markq\cx; python main.py
```

**Or use the launcher:**
```cmd
START-BOT.bat
```

**Or run directly:**
```bash
python main.py
```

## 📂 Project Structure

```
cx/
├── main.py                      # 🚀 Entry point
├── requirements.txt             # 📦 Dependencies
├── env.example                  # 📝 Config template
├── .env                         # 🔐 Your config (gitignored)
├── START-BOT.bat               # 🎮 Windows launcher
│
├── hangfm_bot/                  # 📦 Main package
│   ├── __init__.py
│   ├── config.py                # ⚙️  Configuration
│   ├── message_queue.py         # 📬 Async queue
│   │
│   ├── ai/                      # 🤖 AI System
│   │   ├── __init__.py
│   │   └── ai_manager.py        # Multi-provider orchestration
│   │
│   ├── handlers/                # 📨 Event Handlers
│   │   ├── __init__.py
│   │   └── command_handler.py   # Command processing
│   │
│   ├── utils/                   # 🔧 Utilities
│   │   ├── __init__.py
│   │   ├── content_filter.py    # Content moderation
│   │   └── role_checker.py      # RBAC system
│   │
│   ├── music/                   # 🎵 Music Discovery
│   │   ├── __init__.py
│   │   └── genre_classifier.py  # Genre validation
│   │
│   ├── connection/              # 🔌 Connections
│   │   └── __init__.py
│   │
│   └── http/                    # 🌐 HTTP Clients
│       └── __init__.py
│
├── code-txt/                    # 📚 JS Reference
│   └── (21 original .js files)
│
└── docs/                        # 📖 Documentation
    ├── README.md
    ├── SETUP.md
    └── PYTHON-CONVERSION-COMPLETE.md
```

## 🎮 Commands

**Public:**
- `/help` - Show help message
- `/commands` - List commands
- `/stats` - Your statistics
- `/ai <message>` - Chat with AI
- Say **"bot"** to trigger AI

**Admin** (Mods/Co-owners):
- `/.adminhelp` - Admin commands

## 🔧 Development

**Test configuration:**
```bash
python -c "from hangfm_bot.config import settings; print(settings.room_uuid)"
```

**Run with debug logging:**
```bash
LOG_LEVEL=DEBUG python main.py
```

**Python version:**
```bash
python --version  # Requires 3.10+
```

## 📝 Architecture

### Modular Design

Each subsystem is isolated in its own package:

- **`ai/`** - AI provider abstraction (aisuite)
- **`handlers/`** - Message and command processing
- **`utils/`** - Shared utilities (filtering, RBAC)
- **`music/`** - Music discovery and genre classification
- **`connection/`** - Socket.IO and CometChat managers
- **`http/`** - REST API clients

### Async/Await

All I/O operations use Python's native `async`/`await`:

```python
async def handle_message(msg):
    response = await ai_manager.generate_response(msg)
    await chat.send(response)
```

### Type Safety

Full type hints for IDE support and validation:

```python
async def generate_response(
    message: str,
    user_role: str = "user",
    context: Optional[List[Dict]] = None
) -> str:
```

## 🔒 Security

- ✅ All credentials in `.env` (gitignored)
- ✅ Content filtering enabled
- ✅ Role-based permissions
- ✅ No sensitive data logging
- ✅ Only public data processed

## 📚 Dependencies

Core:
- `aiohttp` - Async HTTP
- `python-socketio` - Socket.IO client
- `pydantic` - Config validation

AI:
- `aisuite` - Unified AI interface
- `openai`, `anthropic`, `google-generativeai`

Music:
- `spotipy` - Spotify API
- `discogs-client` - Discogs API

Utils:
- `profanity-filter` - Content moderation

## 🎵 Music Discovery (Coming Soon)

Planned features:
- User play tracking
- Preference aggregation
- Discogs genre classification
- Spotify track discovery
- Smart track selection

See `code-txt/` for JavaScript reference.

## 🐛 Troubleshooting

**"No module named 'hangfm_bot'"**
→ Run from project root: `python main.py`

**"No module named 'pydantic_settings'"**
→ Install: `pip install pydantic-settings`

**Socket connection fails**
→ Check `TTFM_API_TOKEN` and `ROOM_UUID` in `.env`

**No AI responses**
→ Set at least one AI provider key in `.env`

## 📄 License

MIT License - Free to use and modify

## 🙏 Credits

Converted from Node.js using Microsoft Copilot architecture.

Original JavaScript: `code-txt/` folder
