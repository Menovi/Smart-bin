@echo off
title SmartBin Launcher
echo ============================================
echo  SmartBin Web App - Starting all services
echo ============================================

REM ── Backend ──────────────────────────────────────────────────────────────────
echo [1/3] Starting Backend...
if not exist "%~dp0backend\.venv" (
    echo     Creating backend venv...
    python -m venv "%~dp0backend\.venv"
    "%~dp0backend\.venv\Scripts\pip.exe" install -r "%~dp0backend\requirements.txt" --quiet
    "%~dp0backend\.venv\Scripts\pip.exe" install pyserial requests python-jose[cryptography] "passlib[bcrypt]" --quiet
)
start "SmartBin - Backend" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\activate && uvicorn main:app --host 0.0.0.0 --port 8000 --loop asyncio"

REM ── Prototype ────────────────────────────────────────────────────────────────
echo [2/3] Starting Prototype bridge (COM6)...
if not exist "%~dp0prototype\.venv" (
    echo     Creating prototype venv...
    python -m venv "%~dp0prototype\.venv"
    "%~dp0prototype\.venv\Scripts\pip.exe" install pyserial requests --quiet
)
start "SmartBin - Prototype" cmd /k "cd /d "%~dp0prototype" && .venv\Scripts\activate && python serial_bridge.py --port COM6"

REM ── Simulator venv (used by the in-app button) ───────────────────────────────
echo [sim] Preparing simulator venv...
if not exist "%~dp0simulator\.venv" (
    python -m venv "%~dp0simulator\.venv"
    "%~dp0simulator\.venv\Scripts\pip.exe" install -r "%~dp0simulator\requirements.txt" --quiet
)

REM ── Frontend ─────────────────────────────────────────────────────────────────
echo [3/3] Starting Frontend...
if not exist "%~dp0frontend\node_modules" (
    echo     Installing npm packages...
    cd /d "%~dp0frontend"
    npm install
)
start "SmartBin - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

REM ── Open browser after a short delay ─────────────────────────────────────────
echo.
echo All services launched. Opening browser in 4 seconds...
timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo ============================================
echo  Backend  : http://localhost:8000
echo  Frontend : http://localhost:5173
echo  Close this window when done.
echo ============================================
pause
