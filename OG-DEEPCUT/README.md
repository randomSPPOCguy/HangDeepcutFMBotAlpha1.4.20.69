# Deepcut.live Bot

This is the working directory for the Deepcut.live bot.

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

