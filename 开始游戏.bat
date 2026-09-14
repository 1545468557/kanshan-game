@echo off
REM ============================================================
REM  Blue Blood - launcher for Windows (same behaviour as 开始游戏.command on macOS)
REM
REM  Double-click this file. It starts the local server and opens the home page.
REM  Keep this window open; closing it (or Ctrl+C) stops the game.
REM
REM  NOTE: all messages here are intentionally ASCII. A .bat file with Chinese
REM  text gets garbled on Windows unless the console codepage matches the file
REM  encoding, and that differs between Chinese and English Windows. ASCII always
REM  works. The server itself prints a full Chinese banner once it starts.
REM ============================================================
setlocal enabledelayedexpansion
title Blue Blood - local server

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [X] Node.js / npm not found.
  echo       Install the LTS version from https://nodejs.org then run this again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting Blue Blood ... the home page will open automatically.
echo.

REM ------------------------------------------------------------
REM  Stop whatever is still holding port 4180.
REM  Why this matters: server.mjs and lib\ are Node code loaded ONCE at startup.
REM  After editing them you MUST restart, otherwise the old process keeps serving
REM  stale code. On macOS this exact trap once made the site show
REM  "no background music and no opening cinematic" while the launcher still
REM  printed success, because the health check was answered by the OLD process.
REM ------------------------------------------------------------
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:"TCP.*:4180 .*LISTENING"') do (
  echo   [!] port 4180 is held by PID %%p - stopping it first.
  taskkill /f /pid %%p >nul 2>nul
)
echo.

REM Start the server in its own window so its log stays visible.
start "Blue Blood server" cmd /k "npm start"

REM Wait until it really answers. -f makes 404/500 count as "not up yet", and
REM --noproxy "*" stops local requests from being pushed out through a system
REM HTTP proxy onto some unrelated process.
set READY=0
for /l %%i in (1,1,80) do (
  if "!READY!"=="0" (
    curl -s -f --noproxy "*" -o nul --max-time 1 http://127.0.0.1:4180/api/health >nul 2>nul
    if not errorlevel 1 (
      set READY=1
    ) else (
      timeout /t 1 /nobreak >nul
    )
  )
)

if "!READY!"=="1" (
  REM Open the HOME PAGE, not room.html - the first screen locally must be the
  REM same page the judges see on the public link, or the two can't be compared.
  start "" http://127.0.0.1:4180/
  echo.
  echo   ============================================================
  echo    Home page : http://127.0.0.1:4180/
  echo    Act 1     : http://127.0.0.1:4180/room.html
  echo    Records   : http://127.0.0.1:4180/admin
  echo.
  echo    To stop: press Ctrl+C in the "Blue Blood server" window,
  echo    or just close that window.
  echo   ============================================================
  echo.
) else (
  echo.
  echo   [X] The server did not come up within 20 seconds.
  echo       Send me a screenshot of the "Blue Blood server" window.
  echo.
)

pause
endlocal
