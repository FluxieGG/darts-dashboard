# Autodarts Modular Stats Dashboard

A portrait-first, broadcast-style live stats dashboard built to run on a dedicated **vertical (1080×1920) side monitor** next to your dartboard. Designed for **8ft+ oche glanceability** with high-contrast dark mode, tabular numbers, real-time throw badges, and an accurate SVG dartboard coordinate heatmap.

Reads throws directly from **Autodarts Desktop** running locally on port `3180` — **no cloud login or API keys required**.

---

## Daily Startup Guide (Turning Your PC On Tomorrow)

Follow these quick steps every time you turn on your PC to play:

### 1. Start Autodarts Desktop
1. Open **Autodarts Desktop** on your PC.
2. Wait for your cameras to initialize and make sure **board detection is running** (not paused/stopped).
   - Autodarts Desktop automatically exposes your live board state locally at `http://127.0.0.1:3180/api/state` and `ws://127.0.0.1:3180/api/events`.

### 2. Start the Dashboard
1. Open **PowerShell** or **Command Prompt** (or VS Code terminal) in the dashboard folder:
   ```powershell
   cd C:\Users\callu\Desktop\Programs\dashboard
   ```
2. Start the server:
   ```powershell
   npm run dev
   ```
3. Leave this terminal window open in the background while you play.

### 3. Open on Your Vertical Monitor
1. Open **Chrome** or **Edge** and drag the window onto your vertical monitor.
2. Go to:
   ```
   http://localhost:5173
   ```
3. Press **`F11`** (or click the fullscreen icon in the top-right header) to enter clean kiosk fullscreen mode.

### 4. Verify & Play
1. Check the status pill in the top-right header — it should say **`Autodarts Live`** in green.
2. *(Optional)* If you want a fresh `0.00` session for today, click the **trash icon** on the Dartboard Heatmap (or **Settings → Reset Session**).
3. Start throwing!
   - Darts appear live in **Live Visit** (`D1`, `D2`, `D3` + **Total**).
   - All 3 darts stay visible during **`TAKEOUT`** so you can read your score while walking to the board.
   - As soon as you pull your darts out, the visit automatically logs into your **Average Progression Trend**, **Recent Visits Log**, **Heatmap**, **3-Dart Avg**, **First 9 Avg**, **Scoring Power**, and **Target Precision**.

> **Tip: One-Click Startup Shortcut (Optional)**
> If you don't want to type commands every day, create a file on your Desktop called `Start-Darts-Dashboard.bat` with the following contents and double-click it after opening Autodarts Desktop:
> ```bat
> @echo off
> cd /d C:\Users\callu\Desktop\Programs\dashboard
> start "" http://localhost:5173
> npm run dev
> ```

---

## First-Time Setup Guide (From Scratch)

Follow this section if you are setting up the dashboard on a brand-new PC or fresh folder.

### Prerequisites
1. **Node.js (v18 or newer):** Download and install from [nodejs.org](https://nodejs.org/). Verify in PowerShell:
   ```powershell
   node -v
   npm -v
   ```
2. **Autodarts Desktop:** Installed, calibrated, and working with your cameras.

### Step 1: Install Dependencies
Open PowerShell inside the project folder and install packages:
```powershell
cd C:\Users\callu\Desktop\Programs\dashboard
npm install
```

### Step 2: Verify Autodarts Desktop Local API
Make sure **Autodarts Desktop** is open and running, then verify port `3180` responds by opening this URL in your browser (or running in PowerShell):
```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:3180/api/state" -UseBasicParsing | Select-Object -ExpandProperty Content
```
You should see JSON similar to:
```json
{"connected":true,"event":"takeoutFinished","running":true,"status":"throw","throws":[]}
```
If this fails, open Autodarts Desktop and ensure the board manager is running and not blocked by firewall/antivirus.

### Step 3: Launch the Dashboard
```powershell
npm run dev
```
Open **[http://localhost:5173](http://localhost:5173)** in Chrome or Edge.

### Step 4: Confirm Mode & Display Setup
1. **Connection Mode:** The app defaults to **Local Board (3180)** (`Autodarts Live`). You can double-check or change the URL anytime via the **Settings (gear)** icon in the top-right header.
2. **Vertical Monitor Setup (Windows):**
   - Right-click Desktop → **Display settings**.
   - Select your darts monitor → set **Display orientation** to **Portrait** (`1080 × 1920`).
   - Set **Scale** to `100%` (or `125%` if you want even larger text).
   - Open `http://localhost:5173` on that monitor and press **`F11`**.

---

## Dashboard Features & Controls

### Default Vertical Widget Order
1. **Live Visit Tracker:** Real-time `D1`, `D2`, `D3` badges, Visit Total, `THROW` / `TAKEOUT` status, and last-visit recap.
2. **Average Progression Trend:** Rolling 3-Dart Average curve plotted automatically after each visit.
3. **Recent Visits Log:** Chronological feed of every completed visit with color-coded dart badges (`T20`, `D16`, `S20`, etc.) and totals.
4. **Dartboard Coordinate Heatmap:** Accurate vector dartboard plotting exact `(x, y)` dart coordinates from Autodarts Desktop. Switch between **Dots**, **Heat** (density clusters), or **Both**.
5. **Performance Snapshot (Hero KPIs):** Live **3-Dart Avg**, **First 9 Avg**, **Checkout %**, and **Highest Visit**.
6. **Scoring Power & Target Precision:** Breakdown of `60+`, `100+`, `140+`, and `180` visits alongside hit rates for `T20`, `T19`, `T18`, `D20`, `D16`, `D8`, and `Bull`.

### Customizing Your Layout
- Click the **Sliders icon** in the top-right header to open **Customize Layout**:
  - Toggle individual widgets on/off.
  - Reorder widgets up or down.
  - Switch widgets between **Full Width (2 Cols)** and **Half Width (1 Col)**.
  - Export or import your layout as JSON.
- All layout customizations and session stats save automatically to your browser's `localStorage`.

### Managing Players
- Defaults to **Callum** with zero mock data.
- Click the player pill in the top-left header to add friends or practice profiles (`+ Add Player / Guest`). Each player's stats and heatmap are tracked independently.

### Demo Simulator Mode (Testing Without Throwing)
- Click **Settings (gear)** → switch mode to **Demo Simulator**.
- Use the **Visit**, **Auto**, or **Sim Dart** buttons (or click directly on the SVG dartboard) to test layouts and animations without throwing real darts.
- Switch back to **Local Board (3180)** when ready to play on your board.

---

## Target DartCounter Live Bridge Setup Guide (TV Mirror + Autodarts Auto-Scoring)

This dashboard includes a built-in **Chrome / Edge Browser Extension** (`extensions/dartcounter-bridge/`) and a local Vite relay (`/api/dartcounter/*`) that links **Target DartCounter Web** (`https://app.dartcounter.net`) directly to your Autodarts Kiosk TV, iPad Oche Deck, and Split-Cam Auto-Clipper.

### What It Does
* **Live Vertical TV Sync (Option A):** Starting any X01 match (`501` / `301` / `701`) on `app.dartcounter.net` automatically mirrors your remaining score, **opponent's live score & 3DA**, leg scoreboard, active turn indicator, live **PDC checkout routes**, and **Split-Cam auto-clipping** (e.g. `DartCounter 501 vs Dave - Game Winning Shot`) onto your vertical kiosk monitor.
* **DIY "Omni" Auto-Scoring (Option B):** Automatically feeds your 3-dart Autodarts camera visit totals directly into DartCounter Web when you pull your darts — with three safety modes switchable right on the iPad or extension popup:
  * **iPad Confirm *(Recommended)*:** Queues each completed visit on the iPad with a 1-tap **"Send XX to DartCounter"** button (or **Skip**) so a misread dart never gets submitted by mistake.
  * **Auto-Score:** Hands-free — enters your visit total into DartCounter automatically as soon as Autodarts detects takeout on your turn.
  * **Sync TV Only:** Read-only — mirrors the match, checkouts, and winning clips to your TV without ever touching DartCounter's keypad.

---

### Step-by-Step Installation (2 Minutes — Chrome or Microsoft Edge)

#### 1. Make Sure the Dashboard Server Is Running
Start the kiosk as usual (`Start-Autodarts-Kiosk.bat` or `npm run dev`) so the local relay is listening on `http://127.0.0.1:5173`.

#### 2. Load the Unpacked Extension in Edge or Chrome
1. Open **Microsoft Edge** or **Google Chrome** on your darts PC.
2. In the address bar, go to:
   * **Edge:** `edge://extensions`
   * **Chrome:** `chrome://extensions`
3. Toggle **Developer mode** **ON** (left sidebar in Edge, top-right corner in Chrome).
4. Click **Load unpacked**.
5. Select the extension folder inside this project:
   ```text
   C:\Users\callu\Desktop\Programs\dashboard\extensions\dartcounter-bridge
   ```
6. *(Optional)* Click the puzzle-piece icon in your browser toolbar and **Pin** **Autodarts ↔ DartCounter Bridge** so you can check status or switch modes in one click.

#### 3. Configure Your DartCounter Username & Mode
1. Click the **Autodarts ↔ DartCounter Bridge** icon in your browser toolbar.
2. Verify the top-right status pill turns green (**`Kiosk Live`**).
3. Enter **Your DartCounter Username** exactly as it appears on the scoreboard in DartCounter (e.g. `Callum`) — this ensures the bridge always knows which side of the scoreboard is yours, even when you throw second.
4. Choose your preferred mode (**iPad Confirm**, **Auto**, or **Sync Only**) and click **Save & Sync**.

#### 4. Play on Target DartCounter Web
1. Open **[https://app.dartcounter.net](https://app.dartcounter.net)** in that same Chrome/Edge browser and start a DartBot or Online X01 match.
2. You will see a compact **`AUTODARTS BRIDGE`** floating pill in the bottom-right corner of DartCounter showing live sync status (click `–` to collapse or `Pause` anytime).
3. On your **Vertical Kiosk TV**, the **Live Match & Checkout Co-Pilot** widget automatically switches to **`DartCounter Live`** with both players' scores and live checkout routes.
4. On your **iPad Oche Deck (`/?remote=1`)**, open the **Dashboard → Goals** tab to switch between **Auto-Score / iPad Confirm / Sync TV Only** or tap **Send to DartCounter** in Confirm mode.

### DartCounter Bridge Troubleshooting

| Issue | Fix |
| :--- | :--- |
| Extension popup shows **`Offline`** | Confirm the dashboard server is running on `http://127.0.0.1:5173`, then click **Reconnect** in the extension popup. |
| TV shows opponent's score as yours | Open the extension popup, set **Your DartCounter Username** to match your DartCounter display name, and click **Save & Sync**. |
| Score didn't auto-submit on takeout | Check that mode isn't set to **Sync Only**, the HUD pill isn't **Paused**, and DartCounter is showing **YOUR TURN** with the keypad visible. |
| Want to use DartCounter on a different PC | In the extension popup, change **Kiosk Dashboard URL** to your darts PC's LAN URL (e.g. `http://192.168.0.197:5173`) and reload the extension. |

---

## Optional: Autodarts Cloud API (OAuth 2.0 + PKCE)

You do **not** need this for local board play. If you later want to connect Autodarts Cloud accounts/career stats:
1. Request a public OAuth `client_id` from the Autodarts team via the official Autodarts Discord (`#developer` / `#api`).
2. Copy `.env.example` to `.env`:
   ```powershell
   copy .env.example .env
   ```
3. Add your Client ID:
   ```env
   VITE_AUTODARTS_CLIENT_ID=your_client_id_here
   VITE_AUTODARTS_REDIRECT_URI=http://localhost:5173/auth/callback
   ```
4. Restart `npm run dev`, open **Settings**, select **Autodarts Cloud**, and click **Authenticate with Autodarts**.

---

## Troubleshooting

| Issue | Fix |
| :--- | :--- |
| Header shows **`Board Offline`** (red) | Make sure **Autodarts Desktop** is running on the same PC and detection is started. Test `http://127.0.0.1:3180/api/state` in your browser. |
| Dashboard won't load (`ERR_CONNECTION_REFUSED`) | Make sure the PowerShell window running `npm run dev` is still open. |
| Darts aren't clearing after I pull them | Check Autodarts Desktop to ensure takeout detection finished (`status: "throw"`). |
| Stats look stuck on old data | Click the **trash icon** on the heatmap widget or **Settings → Reset Session** to start fresh from `0.00`. |
| Opening from another device (tablet/phone) | Run `npm run dev -- --host`, open `http://<YOUR-PC-IP>:5173`, and update the Local Board URLs in **Settings** to use your PC's LAN IP instead of `127.0.0.1`. |

---

## Production Build Commands

```powershell
# Type-check & build optimized static bundle into /dist
npm run build

# Preview production build locally
npm run preview
```
