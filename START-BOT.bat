@echo off
REM Start BOTH Node Relay and Python Bot in one command
echo =====================================
echo HANG.FM BOT - HYBRID LAUNCHER
echo =====================================
echo.

cd /d "%~dp0"

echo [1/3] Installing Node relay dependencies...
cd relay
call npm install --silent
cd ..

echo.
echo [2/3] Starting Node.js relay in background...
start /B cmd /c "cd relay && node relay.js > ..\relay.log 2>&1"

echo.
echo Waiting for relay to connect...
timeout /t 7 /nobreak > nul

echo.
echo [3/3] Starting Python bot...
python main.py

REM When Python exits, kill the Node relay
taskkill /F /IM node.exe > nul 2>&1

pause

