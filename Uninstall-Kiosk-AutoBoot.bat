@echo off
title Uninstall Autodarts Kiosk Auto-Boot
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$startup = [Environment]::GetFolderPath('Startup');" ^
  "$lnkPath = Join-Path $startup 'Autodarts-Kiosk.lnk';" ^
  "if (Test-Path $lnkPath) { Remove-Item $lnkPath -Force; Write-Host 'Removed Autodarts-Kiosk.lnk from Windows Startup.' -ForegroundColor Green } else { Write-Host 'Autodarts Kiosk auto-boot was not installed.' -ForegroundColor Yellow }"
echo.
pause
