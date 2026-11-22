@echo off
title Autodarts Kiosk Launcher
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-kiosk.ps1"
