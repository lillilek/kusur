@echo off
cd /d "%~dp0"
python -X utf8 tools\build_static_corpus.py
if errorlevel 1 pause
