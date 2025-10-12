# Deepcut.live Bot

AI-powered music bot for **Deepcut.live** platform.

## ⚠️ Important Disclaimer

**This bot is specifically built for the "All Music Mix" room on Deepcut.live.**

- ✅ Designed for multi-genre music rooms
- ✅ Features YouTube restriction checking
- ✅ Ammy PM permission system integration
- ✅ Album art and Wikipedia summaries
- ✅ Seasonal music filtering
- ⚠️ May need adjustments for other rooms or platforms

**Use in other rooms at your own discretion.** Some features (like Ammy PM system) are room-specific.

---

## Running the Bot

### Windows
Double-click `START-BOT.bat` or run:
```
node bot.js
```

### Linux/Mac
```bash
node bot.js
```

## Configuration

The bot reads its configuration from `../config.env` (in the project root).

## Data Files

All data files are stored in the project root (`..`):
- `bot-learned-artists.json` - Artists learned from users
- `bot-strikes.json` - Content filter strikes
- `bot-stats.json` - Bot statistics
- `uptime.json` - Bot uptime tracking

## Modularization

See `../MODULARIZATION-PACKAGES/deepcut-package/` for modularization guides and resources.

