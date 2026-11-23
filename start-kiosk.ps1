param(
  [switch]$Silent,
  [switch]$StrictKiosk,
  [int]$BootDelaySec = 0,
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

# Win32 window helper for reliable Maximize -> Focus -> Fullscreen Kiosk on Windows boot
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class KioskWin32 {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  [DllImport("kernel32.dll")]
  public static extern uint GetCurrentThreadId();

  [DllImport("user32.dll")]
  public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

  [DllImport("user32.dll")]
  public static extern bool BringWindowToTop(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

  public const int SW_RESTORE = 9;
  public const int SW_MAXIMIZE = 3;
  public const int GWL_STYLE = -16;
  public const int WS_CAPTION = 0x00C00000;

  public static void FocusAndMaximize(IntPtr hWnd) {
    if (hWnd == IntPtr.Zero) return;
    IntPtr fg = GetForegroundWindow();
    uint pid;
    uint fgThread = fg != IntPtr.Zero ? GetWindowThreadProcessId(fg, out pid) : 0;
    uint curThread = GetCurrentThreadId();
    uint targetThread = GetWindowThreadProcessId(hWnd, out pid);

    if (fgThread != 0 && fgThread != curThread) AttachThreadInput(curThread, fgThread, true);
    if (targetThread != 0 && targetThread != curThread) AttachThreadInput(curThread, targetThread, true);

    ShowWindow(hWnd, SW_MAXIMIZE);
    BringWindowToTop(hWnd);
    SetForegroundWindow(hWnd);

    if (targetThread != 0 && targetThread != curThread) AttachThreadInput(curThread, targetThread, false);
    if (fgThread != 0 && fgThread != curThread) AttachThreadInput(curThread, fgThread, false);
  }

  public static bool IsBorderlessFullscreen(IntPtr hWnd, int screenW, int screenH) {
    if (hWnd == IntPtr.Zero) return false;
    RECT r;
    if (!GetWindowRect(hWnd, out r)) return false;
    int width = r.Right - r.Left;
    int height = r.Bottom - r.Top;
    int style = GetWindowLong(hWnd, GWL_STYLE);
    bool hasCaption = (style & WS_CAPTION) != 0;
    return (!hasCaption) && width >= screenW && height >= screenH;
  }
}
"@

function Find-AutodartsBrowserWindow {
  $procs = Get-Process -Name msedge, chrome -ErrorAction SilentlyContinue |
    Where-Object {
      $_.MainWindowHandle -ne [IntPtr]::Zero -and
      ($_.MainWindowTitle -like '*Autodarts*' -or $_.MainWindowTitle -like '*localhost:5173*')
    }
  return $procs | Select-Object -First 1
}

function Maximize-And-EnterKioskMode {
  $screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $win = $null

  # Wait up to 18 seconds for Edge/Chrome Autodarts window to appear
  for ($i = 0; $i -lt 72; $i++) {
    $win = Find-AutodartsBrowserWindow
    if ($win) { break }
    Start-Sleep -Milliseconds 250
  }

  if (-not $win) {
    Write-BootLog "      Could not locate Autodarts browser window for maximize/fullscreen." 'DarkYellow'
    return
  }

  $hwnd = $win.MainWindowHandle

  # Step A: Focus and Maximize the app window
  [KioskWin32]::FocusAndMaximize($hwnd)
  Write-BootLog "      Window focused & maximized ($($win.MainWindowTitle))." 'Cyan'

  # Wait briefly for the React app title to finish loading before pressing 'f'
  for ($w = 0; $w -lt 16; $w++) {
    $refreshed = Find-AutodartsBrowserWindow
    if ($refreshed -and $refreshed.MainWindowTitle -like '*Autodarts*') {
      $hwnd = $refreshed.MainWindowHandle
      break
    }
    Start-Sleep -Milliseconds 250
  }
  Start-Sleep -Milliseconds 450

  # Step B: Enter true fullscreen kiosk mode if not already borderless fullscreen
  if (-not [KioskWin32]::IsBorderlessFullscreen($hwnd, $screen.Width, $screen.Height)) {
    [KioskWin32]::FocusAndMaximize($hwnd)
    Start-Sleep -Milliseconds 150
    $wshell = New-Object -ComObject WScript.Shell
    # Send 'f' (in-app fullscreen kiosk toggle) and verify; fall back to F11 native browser fullscreen
    $wshell.SendKeys('f')
    Start-Sleep -Milliseconds 700

    if (-not [KioskWin32]::IsBorderlessFullscreen($hwnd, $screen.Width, $screen.Height)) {
      [KioskWin32]::FocusAndMaximize($hwnd)
      Start-Sleep -Milliseconds 150
      $wshell.SendKeys('{F11}')
      Start-Sleep -Milliseconds 500
    }
  }

  if ([KioskWin32]::IsBorderlessFullscreen($hwnd, $screen.Width, $screen.Height)) {
    Write-BootLog "      Instant Fullscreen Kiosk Mode active!" 'Green'
  } else {
    Write-BootLog "      Sent fullscreen command (press F or F11 anytime to toggle)." 'DarkGray'
  }
}

Write-BootLog "======================================================" 'Cyan'
Write-BootLog "   AUTODARTS ZERO-TOUCH KIOSK BOOT SEQUENCE" 'White'
Write-BootLog "======================================================" 'Cyan'

# Optional cold-boot settle delay so USB cameras & Wi-Fi initialize cleanly
if ($BootDelaySec -gt 0) {
  Write-BootLog "[0/4] Waiting ${BootDelaySec}s for Windows USB cameras & Wi-Fi to settle..." 'DarkGray'
  Start-Sleep -Seconds $BootDelaySec
}

# ----------------------------------------------------------------------------
# STEP 1: Launch Autodarts Desktop & wait for Local Board Manager (Port 3180)
# ----------------------------------------------------------------------------
Write-BootLog "[1/4] Checking Autodarts Desktop (port $BoardPort)..." 'Yellow'

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
# STEP 2: Start Dashboard + iPad LAN Relay + Career Vault + Replay Clipper
# ----------------------------------------------------------------------------
Write-BootLog "[2/4] Starting Autodarts Dashboard server (port $DashboardPort)..." 'Yellow'

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

# ----------------------------------------------------------------------------
# STEP 3: Verify iPad Oche Deck LAN Relay is listening
# ----------------------------------------------------------------------------
Write-BootLog "[3/4] Arming iPad Oche Deck LAN Relay..." 'Yellow'
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
# STEP 4: Open App -> Maximize -> Instant Fullscreen Kiosk Mode
# ----------------------------------------------------------------------------
Write-BootLog "[4/4] Launching Autodarts Kiosk Display (Open -> Maximize -> Fullscreen)..." 'Yellow'

$kioskUrl = "http://localhost:$DashboardPort/?kiosk=1"
$existingWindow = Find-AutodartsBrowserWindow

if ($existingWindow) {
  Write-BootLog "      Found existing Autodarts window — maximizing & entering kiosk mode..." 'Cyan'
  Maximize-And-EnterKioskMode
} else {
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
        "--disable-session-crashed-bubble",
        "--noerrdialogs",
        "--no-first-run"
      )
      Start-Process -FilePath $browser -ArgumentList $argsList
    } else {
      $argsList = @(
        "--app=$kioskUrl",
        "--start-maximized",
        "--window-position=0,0",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-session-crashed-bubble",
        "--noerrdialogs",
        "--no-first-run"
      )
      Start-Process -FilePath $browser -ArgumentList $argsList
      Maximize-And-EnterKioskMode
    }
    Write-BootLog "      Kiosk launched cleanly! Boot sequence complete." 'Green'
  } else {
    Start-Process $kioskUrl
    Write-BootLog "      Opened in default browser." 'Green'
  }
}

if (-not $Silent) {
  Start-Sleep -Seconds 2
}
