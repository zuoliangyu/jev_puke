@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required.
  pause
  exit /b 1
)

echo Starting JEV Landlords Lab at http://127.0.0.1:4173
start "JEV Landlords Lab" http://127.0.0.1:4173
node server.mjs
