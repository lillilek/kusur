@echo off
cd /d "%~dp0"
python tools\import_flex.py --pick
if errorlevel 1 pause
