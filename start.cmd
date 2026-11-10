@echo off
cd /d "%~dp0measure"
if not exist node_modules\tsx call npm install --silent
start "opus-lab" /min node console\server.mjs
ping -n 2 127.0.0.1 >nul
start "" http://127.0.0.1:3020
