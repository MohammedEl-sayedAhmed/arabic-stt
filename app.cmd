@echo off
rem Start Tafrigh from source on Windows (settings: app\config.toml).
rem   app.cmd              desktop window
rem   app.cmd --browser    in a browser window instead
rem Setup once:  py -3.12 -m venv .venv
rem              .venv\Scripts\pip install -r requirements.txt -r requirements-desktop.txt
cd /d "%~dp0"
start "" ".venv\Scripts\pythonw.exe" -m app.desktop %*
