# Hang.fm Bot

This is the working directory for the Hang.fm bot.

## Running the Bot

### Windows
Double-click `START-BOT.bat` or run:
```
node hang-fm-bot.js
```

### Linux/Mac
```bash
node hang-fm-bot.js
```

## Configuration

The bot reads its configuration from `../hang-fm-config.env` (in the project root).

## Data Files

All data files are stored in the project root (`..`):
- `user-stats.json` - User poker stats, bankroll, reactions
- `user-artists.json` - Top 3 artists per user
- `song-stats.json` - Song play counts, reactions, first player
- `bot-learned-artists.json` - Artists learned from users
- `bot-strikes.json` - Content filter strikes

## Modularization

See `../MODULARIZATION-PACKAGES/hangfm-package/` for modularization guides and resources.

