@echo off
title Install Autodarts Kiosk Auto-Boot
cd /d "%~dp0"
echo Installing Autodarts Kiosk into Windows Startup...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$startup = [Environment]::GetFolderPath('Startup');" ^
  "$lnkPath = Join-Path $startup 'Autodarts-Kiosk.lnk';" ^
  "$vbsPath = Join-Path '%~dp0' 'Launch-Kiosk-Silent.vbs';" ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$sc = $ws.CreateShortcut($lnkPath);" ^
  "$q = [char]34;" ^
  "$sc.TargetPath = 'wscript.exe';" ^
  "$sc.Arguments = $q + $vbsPath + $q;" ^
  "$sc.WorkingDirectory = '%~dp0';" ^
  "$sc.Description = 'Zero-touch Autodarts Kiosk & iPad Oche Remote auto-launcher';" ^
  "$sc.Save();" ^
  "Write-Host 'SUCCESS: Installed startup shortcut at:' -ForegroundColor Green;" ^
  "Write-Host $lnkPath -ForegroundColor Cyan"
echo.
echo On your next fresh reboot, Windows will automatically:
echo   1. Launch Autodarts Desktop (port 3180) and wait for calibration
echo   2. Start the Dashboard + iPad Oche Relay silently in background (port 5173)
echo   3. Ready for you to open http://localhost:5173 manually in your browser
echo.
pause
