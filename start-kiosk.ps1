param(
  [switch]$Silent,
  [int]$BootDelaySec = 0,
  [int]$CalibrationTimeoutSec = 180,
  [int]$DashboardPort = 5173,
  [int]$BoardPort = 3180
)

$ErrorActionPreference = 'SilentlyContinue'
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

# Ensure ./data exists for boot log
$DataDir = Join-Path $ProjectDir 'data'
if (-not (Test-Path $DataDir)) {
  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
}
$LogFile = Join-Path $DataDir 'kiosk-boot.log'

function Write-BootLog([string]$Message, [string]$Color = 'White') {
  $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  Add-Content -Path $LogFile -Value "[$stamp] $Message"
  if (-not $Silent) {
    Write-Host $Message -ForegroundColor $Color
  }
}

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

Write-BootLog "======================================================" 'Cyan'
Write-BootLog "   AUTODARTS DASHBOARD BOOT SEQUENCE (MANUAL BROWSER)" 'White'
Write-BootLog "======================================================" 'Cyan'

# Optional cold-boot settle delay so USB cameras & Wi-Fi initialize cleanly
if ($BootDelaySec -gt 0) {
  Write-BootLog "[0/5] Waiting ${BootDelaySec}s for Windows USB cameras & Wi-Fi to settle..." 'DarkGray'
  Start-Sleep -Seconds $BootDelaySec
}

# ----------------------------------------------------------------------------
# STEP 1: Launch Autodarts Desktop & wait for Local Board Manager (Port 3180)
# ----------------------------------------------------------------------------
Write-BootLog "[1/5] Checking Autodarts Desktop (port $BoardPort)..." 'Yellow'

if (Test-LocalPort $BoardPort) {
  Write-BootLog "      Autodarts Board Manager is already live on port $BoardPort." 'Green'
} else {
  $candidateExes = @(
    "$env:LOCALAPPDATA\autodarts-desktop\current\autodarts-desktop.exe",
    "$env:LOCALAPPDATA\Programs\autodarts-desktop\Autodarts Desktop.exe",
    "$env:LOCALAPPDATA\Programs\Autodarts\Autodarts Desktop.exe",
    "$env:LOCALAPPDATA\Autodarts\Autodarts Desktop.exe",
    "$env:ProgramFiles\Autodarts\Autodarts Desktop.exe"
  )

  $foundExe = $candidateExes | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($foundExe) {
    Write-BootLog "      Launching Autodarts Desktop: $foundExe" 'Cyan'
    Start-Process -FilePath $foundExe
    Write-BootLog "      Waiting up to 25s for Autodarts Board Manager API (port $BoardPort)..." 'DarkGray'
    for ($i = 0; $i -lt 50; $i++) {
      if (Test-LocalPort $BoardPort) { break }
      Start-Sleep -Milliseconds 500
    }
    if (Test-LocalPort $BoardPort) {
      Write-BootLog "      Autodarts Board Manager connected!" 'Green'
    } else {
      Write-BootLog "      Autodarts Desktop still initializing (dashboard will auto-connect)." 'DarkYellow'
    }
  } else {
    Write-BootLog "      Autodarts Desktop executable not found in standard paths." 'DarkYellow'
  }
}

# ----------------------------------------------------------------------------
# STEP 2: Wait for Autodarts Calibration & Board Detection to Finish
# ----------------------------------------------------------------------------
Write-BootLog "[2/5] Waiting for Autodarts calibration & board detection..." 'Yellow'

if (-not (Test-LocalPort $BoardPort)) {
  Write-BootLog "      Skipping calibration wait (port $BoardPort not reachable)." 'DarkYellow'
} else {
  $calibrated = $false
  $waitedAny = $false
  $lastLoggedState = ''
  $deadline = (Get-Date).AddSeconds($CalibrationTimeoutSec)
  $lastHeartbeat = Get-Date

  while ((Get-Date) -lt $deadline) {
    try {
      $state = Invoke-RestMethod -Uri "http://127.0.0.1:$BoardPort/api/state" -TimeoutSec 2
      $running = ($state.running -eq $true)
      $statusStr = [string]$state.status
      $eventStr = [string]$state.event

      $isCalibratingOrStopped = ($statusStr -match 'calibrat|stop|init|start') -or ($eventStr -match 'calibrat')

      if ($running -and -not $isCalibratingOrStopped) {
        $calibrated = $true
        if ($waitedAny) {
          Write-BootLog "      Autodarts calibration complete & detection running (status: $statusStr)! Settling 2s..." 'Green'
          Start-Sleep -Seconds 2
        } else {
          Write-BootLog "      Autodarts is already calibrated & running (status: $statusStr)." 'Green'
        }
        break
      }

      $stateSummary = "running=$running, status=$statusStr"
      if ($stateSummary -ne $lastLoggedState -or ((Get-Date) - $lastHeartbeat).TotalSeconds -ge 15) {
        Write-BootLog "      Waiting for Autodarts calibration/detection ($stateSummary)..." 'DarkGray'
        $lastLoggedState = $stateSummary
        $lastHeartbeat = Get-Date
      }
    } catch {
      if ($lastLoggedState -ne 'api-warming' -or ((Get-Date) - $lastHeartbeat).TotalSeconds -ge 15) {
        Write-BootLog "      Waiting for Autodarts /api/state to respond..." 'DarkGray'
        $lastLoggedState = 'api-warming'
        $lastHeartbeat = Get-Date
      }
    }

    $waitedAny = $true
    Start-Sleep -Seconds 1
  }

  if (-not $calibrated) {
    Write-BootLog "      Timed out after ${CalibrationTimeoutSec}s waiting for Autodarts calibration ($lastLoggedState) - starting Dashboard anyway." 'DarkYellow'
  }
}

# ----------------------------------------------------------------------------
# STEP 3: Detect & Verify All Connected Cameras (Oche Cam + 3 Board Cams)
# ----------------------------------------------------------------------------
Write-BootLog "[3/5] Detecting all connected USB & Autodarts board cameras..." 'Yellow'

$autodartsVidPids = @()
$autodartsConfiguredCount = 0
$boardStreamOk = $false
$cameraWarnings = @()

try {
  $adConfig = Invoke-RestMethod -Uri "http://127.0.0.1:$BoardPort/api/config" -TimeoutSec 2
  if ($adConfig -and $adConfig.cam -and $adConfig.cam.cams) {
    $autodartsConfiguredCount = @($adConfig.cam.cams).Count
    foreach ($camSpec in $adConfig.cam.cams) {
      $specStr = [string]$camSpec
      if ($specStr -match 'vid=([0-9a-fA-F]{4})&pid=([0-9a-fA-F]{4})') {
        $vp = "$($Matches[1].ToLower()):$($Matches[2].ToLower())"
        if ($autodartsVidPids -notcontains $vp) {
          $autodartsVidPids += $vp
        }
      }
    }
  }
} catch {
  $cameraWarnings += "Autodarts Desktop config unreachable on port $BoardPort"
}

try {
  $streamReq = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$BoardPort/api/streams/live")
  $streamReq.Timeout = 2500
  $streamResp = $streamReq.GetResponse()
  if ([int]$streamResp.StatusCode -eq 200) {
    $s = $streamResp.GetResponseStream()
    $buf = New-Object byte[] 64
    $readBytes = $s.Read($buf, 0, 64)
    if ($readBytes -gt 0) {
      $boardStreamOk = $true
    }
  }
  $streamResp.Close()
} catch {
  $boardStreamOk = $false
  $cameraWarnings += "Autodarts 3-camera live stream not responding on port $BoardPort"
}

$pnpCams = @(Get-PnpDevice -Class Camera,Image -ErrorAction SilentlyContinue)
$activeCameras = @()
$ocheCandidates = @()
$boardCamDevices = @()

foreach ($dev in $pnpCams) {
  $inst = [string]$dev.InstanceId
  $status = [string]$dev.Status
  $name = [string]$dev.FriendlyName
  if (-not $name) { $name = 'USB Video Device' }

  $vidPid = ''
  if ($inst -match 'VID_([0-9A-Fa-f]{4})&PID_([0-9A-Fa-f]{4})') {
    $vidPid = "$($Matches[1].ToLower()):$($Matches[2].ToLower())"
  }

  $isBoardCam = ($vidPid -ne '' -and ($autodartsVidPids -contains $vidPid))
  $role = if ($isBoardCam) { 'board' } else { 'oche' }

  if ($status -eq 'OK') {
    $entry = [ordered]@{
      name       = $name
      vidPid     = $vidPid
      instanceId = $inst
      status     = $status
      role       = $role
    }
    $activeCameras += $entry
    if ($isBoardCam) {
      $boardCamDevices += $entry
    } else {
      $ocheCandidates += $entry
    }
    Write-BootLog "      [OK] ($($role.ToUpper())) $name [$vidPid]" 'Cyan'
  } elseif ($status -eq 'Error' -or $status -eq 'Degraded') {
    $warnMsg = "Camera device problem: $name ($status)"
    $cameraWarnings += $warnMsg
    Write-BootLog "      [WARN] $warnMsg" 'DarkYellow'
  }
}

if ($ocheCandidates.Count -eq 0) {
  $cameraWarnings += "No dedicated Oche / Throwing webcam detected (only $($boardCamDevices.Count) Autodarts board camera(s) found)"
  Write-BootLog "      [WARN] No dedicated Oche webcam detected!" 'DarkYellow'
} else {
  Write-BootLog "      Detected $($ocheCandidates.Count) Oche cam(s) + $($boardCamDevices.Count) Autodarts board cam(s) (3-cam stream: $(if ($boardStreamOk) { 'LIVE' } else { 'OFFLINE' }))." 'Green'
}

if ($autodartsConfiguredCount -gt 0 -and $boardCamDevices.Count -lt $autodartsConfiguredCount) {
  $cameraWarnings += "Expected $autodartsConfiguredCount Autodarts board cameras, but Windows reports $($boardCamDevices.Count) active"
}

$cameraReportPath = Join-Path $DataDir 'camera-boot-report.json'
try {
  $reportObj = [ordered]@{
    detectedAt                = (Get-Date).ToString('o')
    detectedAtMs              = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    totalActiveCameras        = $activeCameras.Count
    autodartsConfiguredCount  = $autodartsConfiguredCount
    autodartsBoardCamCount    = $boardCamDevices.Count
    autodartsVidPids          = $autodartsVidPids
    boardStreamOk             = $boardStreamOk
    ocheCandidates            = $ocheCandidates
    cameras                   = $activeCameras
    warnings                  = $cameraWarnings
  }
  $reportObj | ConvertTo-Json -Depth 5 | Set-Content -Path $cameraReportPath -Encoding UTF8
} catch {}

# ----------------------------------------------------------------------------
# STEP 4: Start Dashboard + iPad LAN Relay + Career Vault + Replay Clipper
# ----------------------------------------------------------------------------
Write-BootLog "[4/5] Starting Autodarts Dashboard server (port $DashboardPort)..." 'Yellow'

if (Test-LocalPort $DashboardPort) {
  Write-BootLog "      Dashboard server is already running on port $DashboardPort." 'Green'
} else {
  $serverStyle = if ($Silent) { 'Hidden' } else { 'Minimized' }
  $npmCmd = "Set-Location '$ProjectDir'; npm run dev -- --host --port $DashboardPort"
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile", "-WindowStyle", $serverStyle, "-Command", $npmCmd `
    -WindowStyle $serverStyle

  Write-BootLog "      Waiting for Vite server on port $DashboardPort..." 'DarkGray'
  $ready = $false
  for ($i = 0; $i -lt 50; $i++) {
    if (Test-LocalPort $DashboardPort) {
      $ready = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }

  if ($ready) {
    Write-BootLog "      Dashboard server live at http://localhost:$DashboardPort" 'Green'
  } else {
    Write-BootLog "      Timed out waiting for port $DashboardPort." 'Red'
  }
}

$lanUrl = $null
for ($i = 0; $i -lt 8; $i++) {
  try {
    $info = Invoke-RestMethod -Uri "http://127.0.0.1:$DashboardPort/api/remote/info" -TimeoutSec 2
    if ($info.interfaces -and $info.interfaces.Count -gt 0) {
      $lanUrl = $info.interfaces[0].url
      break
    }
  } catch {
    Start-Sleep -Milliseconds 400
  }
}

if ($lanUrl) {
  Write-BootLog "      iPad Oche Deck listening at: $lanUrl" 'Cyan'
} else {
  Write-BootLog "      iPad Oche Deck relay online (check QR icon in header)." 'DarkGray'
}

# ----------------------------------------------------------------------------
# STEP 5: Launch Brave Browser -> Target DartCounter (Ready for Online Games)
# ----------------------------------------------------------------------------
Write-BootLog "[5/5] Launching Brave Browser -> Target DartCounter (https://app.dartcounter.net)..." 'Yellow'

$dartCounterUrl = "https://app.dartcounter.net"
$existingBraveDc = Get-Process -Name brave -ErrorAction SilentlyContinue |
  Where-Object {
    $_.MainWindowHandle -ne [IntPtr]::Zero -and
    ($_.MainWindowTitle -like '*DartCounter*' -or $_.MainWindowTitle -like '*dartcounter*')
  } |
  Select-Object -First 1

if ($existingBraveDc) {
  Write-BootLog "      Brave is already open on DartCounter ($($existingBraveDc.MainWindowTitle))." 'Green'
} else {
  $bravePaths = @(
    "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
    "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
    "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
  )
  $braveExe = $bravePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

  if ($braveExe) {
    # Disable background tab throttling / window occlusion so DartCounter stays 100% live
    Start-Process -FilePath $braveExe -ArgumentList @(
      "--new-window",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-features=CalculateNativeWinOcclusion",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-session-crashed-bubble",
      "--no-first-run",
      $dartCounterUrl
    )
    Write-BootLog "      Brave launched (un-throttled) to $dartCounterUrl (ready to start a game)." 'Green'
  } else {
    Write-BootLog "      Brave Browser executable not found in standard paths." 'DarkYellow'
  }
}

Write-BootLog "      App server ready! Open http://localhost:$DashboardPort manually in your browser." 'Green'

if (-not $Silent) {
  Start-Sleep -Seconds 2
}
