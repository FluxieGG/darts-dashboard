param(
  [switch]$StrictKiosk,
  [int]$DashboardPort = 5173,
  [int]$BoardPort = 3180
)

$ErrorActionPreference = 'SilentlyContinue'
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   AUTODARTS KIOSK & IPAD OCHE REMOTE LAUNCHER" -ForegroundColor White
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# ----------------------------------------------------------------------------
# STEP 1: Ensure Autodarts Desktop / Board Manager (Port 3180) is running
# ----------------------------------------------------------------------------
Write-Host "[1/4] Checking Autodarts Desktop (port $BoardPort)..." -ForegroundColor Yellow

function Test-LocalPort([int]$Port) {
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $async = $tcp.BeginConnect('127.0.0.1', $Port, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(400, $false)
    if ($ok -and $tcp.Connected) {
      $tcp.EndConnect($async)
      $tcp.Close()
      return $true
    }
    $tcp.Close()
  } catch {}
  return $false
}

if (Test-LocalPort $BoardPort) {
  Write-Host "      Autodarts Board Manager is already live on port $BoardPort." -ForegroundColor Green
} else {
  $candidateExes = @(
    "$env:LOCALAPPDATA\Programs\autodarts-desktop\Autodarts Desktop.exe",
    "$env:LOCALAPPDATA\Programs\Autodarts\Autodarts Desktop.exe",
    "$env:LOCALAPPDATA\Autodarts\Autodarts Desktop.exe",
    "$env:ProgramFiles\Autodarts\Autodarts Desktop.exe"
  )

  $foundExe = $candidateExes | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($foundExe) {
    Write-Host "      Launching Autodarts Desktop: $foundExe" -ForegroundColor Cyan
    Start-Process -FilePath $foundExe
    Write-Host "      Waiting up to 15s for Board Manager API..." -ForegroundColor DarkGray
    for ($i = 0; $i -lt 30; $i++) {
      if (Test-LocalPort $BoardPort) { break }
      Start-Sleep -Milliseconds 500
    }
    if (Test-LocalPort $BoardPort) {
      Write-Host "      Autodarts Board Manager connected!" -ForegroundColor Green
    } else {
      Write-Host "      Autodarts Desktop still initializing (dashboard will auto-connect)." -ForegroundColor DarkYellow
    }
  } else {
    Write-Host "      Autodarts Desktop not found in default paths (continuing anyway — open manually if needed)." -ForegroundColor DarkYellow
  }
}

# ----------------------------------------------------------------------------
# STEP 2: Start Dashboard + LAN Remote Relay + Career Vault + Replay Clipper
# ----------------------------------------------------------------------------
Write-Host "[2/4] Starting Autodarts Dashboard server (port $DashboardPort)..." -ForegroundColor Yellow

if (Test-LocalPort $DashboardPort) {
  Write-Host "      Dashboard server is already running on port $DashboardPort." -ForegroundColor Green
} else {
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoExit", "-Command", "Set-Location '$ProjectDir'; npm run dev -- --host --port $DashboardPort" `
    -WindowStyle Minimized

  Write-Host "      Waiting for Vite server to come online..." -ForegroundColor DarkGray
  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    if (Test-LocalPort $DashboardPort) {
      $ready = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }

  if ($ready) {
    Write-Host "      Dashboard server live at http://localhost:$DashboardPort" -ForegroundColor Green
  } else {
    Write-Host "      Timed out waiting for port $DashboardPort — check the minimized server window." -ForegroundColor Red
  }
}

# ----------------------------------------------------------------------------
# STEP 3: Print iPad Oche Remote LAN URL
# ----------------------------------------------------------------------------
Write-Host "[3/4] Detecting LAN URL for iPad Oche Remote..." -ForegroundColor Yellow
$lanIp = $null
try {
  $info = Invoke-RestMethod -Uri "http://127.0.0.1:$DashboardPort/api/remote/info" -TimeoutSec 3
  if ($info.interfaces -and $info.interfaces.Count -gt 0) {
    $lanIp = $info.interfaces[0].url
  }
} catch {}

if ($lanIp) {
  Write-Host "      iPad Oche Remote URL: $lanIp" -ForegroundColor Cyan
} else {
  Write-Host "      Open the Phone/QR icon in the top header to pair your iPad." -ForegroundColor DarkGray
}

# ----------------------------------------------------------------------------
# STEP 4: Launch Edge or Chrome in Kiosk Fullscreen Mode
# ----------------------------------------------------------------------------
Write-Host "[4/4] Launching Kiosk Display..." -ForegroundColor Yellow

$kioskUrl = "http://localhost:$DashboardPort/?kiosk=1"
$browserPaths = @(
  "$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles (x86)\Google\Chrome\Application\chrome.exe"
)
$browser = $browserPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($browser) {
  if ($StrictKiosk) {
    $argsList = @(
      "--kiosk", $kioskUrl,
      "--edge-kiosk-type=fullscreen",
      "--autoplay-policy=no-user-gesture-required",
      "--no-first-run"
    )
  } else {
    $argsList = @(
      "--app=$kioskUrl",
      "--start-fullscreen",
      "--autoplay-policy=no-user-gesture-required",
      "--no-first-run"
    )
  }
  Start-Process -FilePath $browser -ArgumentList $argsList
  Write-Host "      Kiosk launched! Press F11 or Alt+F4 anytime to exit fullscreen." -ForegroundColor Green
} else {
  Start-Process $kioskUrl
  Write-Host "      Opened in default browser (press F11 for Kiosk Fullscreen)." -ForegroundColor Green
}

Write-Host ""
Start-Sleep -Seconds 2
