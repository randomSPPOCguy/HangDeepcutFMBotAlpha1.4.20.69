# Bot Launcher - Choose which bot to start
# Created for Ultimate Bot Project

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "           🎵 HANG.FM BOT LAUNCHER 🎵                     " -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Choose Your Bot:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  [1] ORIGINAL - Stable & Proven" -ForegroundColor Green
Write-Host "      └─> Curated artists (1300+)"
Write-Host "      └─> All features tested & working"
Write-Host "      └─> Production ready"
Write-Host ""
Write-Host "  [2] MODULAR - New & Experimental" -ForegroundColor Magenta
Write-Host "      └─> TRUE RANDOM from Spotify/Discogs"
Write-Host "      └─> Social awareness (reads DJs/users)"
Write-Host "      └─> Room vibe matching (genre detection)"
Write-Host "      └─> Auto-hop stage management"
Write-Host "      └─> Music flows even when glued"
Write-Host ""
Write-Host "  [0] Exit" -ForegroundColor Red
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$choice = Read-Host "Select bot [0-2]"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "🚀 Starting Hang.fm Bot (ORIGINAL - Stable)..." -ForegroundColor Green
        Write-Host ""
        node "hangfm-bot\hang-fm-bot.js"
    }
    "2" {
        Write-Host ""
        Write-Host "🚀 Starting Hang.fm Bot (MODULAR - Experimental)..." -ForegroundColor Magenta
        Write-Host ""
        Write-Host "Features Active:" -ForegroundColor Yellow
        Write-Host "  ✓ TRUE RANDOM music discovery" -ForegroundColor Cyan
        Write-Host "  ✓ Social awareness (DJ/user matching)" -ForegroundColor Cyan
        Write-Host "  ✓ Room vibe detection" -ForegroundColor Cyan
        Write-Host "  ✓ Auto-hop management" -ForegroundColor Cyan
        Write-Host ""
        node "hangfm-bot-modular\hang-fm-bot.js"
    }
    "0" {
        Write-Host ""
        Write-Host "👋 Goodbye!" -ForegroundColor Yellow
        Write-Host ""
        exit
    }
    default {
        Write-Host ""
        Write-Host "❌ Invalid choice. Please select 0, 1, or 2." -ForegroundColor Red
        Write-Host ""
        exit 1
    }
}

