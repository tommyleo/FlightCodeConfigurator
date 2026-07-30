@echo off
cd /d "%~dp0"
start "" "http://localhost:8080"
py -m http.server 8080
if errorlevel 1 python -m http.server 8080
