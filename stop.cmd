@echo off
curl -s -m 3 -X POST -H "X-Opus: 1" http://127.0.0.1:3020/api/stop >nul 2>&1
ping -n 2 127.0.0.1 >nul
if exist "%~dp0measure\lab-data\console.pid" for /f "usebackq" %%p in ("%~dp0measure\lab-data\console.pid") do taskkill /pid %%p /f >nul 2>&1
if exist "%~dp0measure\lab-data\console.pid" del "%~dp0measure\lab-data\console.pid"
echo opus lab stopped
