@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:8767/corpus.html in your browser.
python -X utf8 tools\preview_static.py
if errorlevel 1 pause
