# Brainstorm: 10 Next-Level Ideas for Autodarts Modular Dashboard & Arcade

> Curated by cross-referencing the **Autodarts open-source ecosystem** (`lbormann/darts-hub`, `lbormann/darts-caller`, `lbormann/darts-wled`, `IteraThor/AutoGlow`, `creazy231/tools-for-autodarts`, `homedarts-for-autodarts`), **Flight Club / Roxy Ballroom venue tech**, and **our exact existing architecture** (React 19 + TypeScript + Vite 6 + Zustand + `gameEventBus` + `SvgDartboard` `segmentOverlays` + 1080×1920 vertical kiosk display).

---

## Quick Comparison Matrix

| # | Idea | Category | Effort | Wow Factor | Builds On |
| :-: | :--- | :--- | :---: | :---: | :--- |
| **1** | **Live Online Match Sync & Dynamic Checkout Co-Pilot** | Core Utility | Medium | ★★★★★ | `getCheckoutRoute`, `SvgDartboard`, Cloud/Extension Bridge |
| **2** | **Native WLED Smart Room & Surround Lighting** | Hardware / Immersion | Low–Med | ★★★★★ | `gameEventBus`, `Party Mode`, WLED JSON API |
| **3** | **Pro Broadcast Voice Caller & Walk-On Audio** | Audio / Atmosphere | Low | ★★★★☆ | `soundEngine.ts`, Web Speech API / MP3 packs |
| **4** | **Flight Club "Oche-Cam" Action Replays** | Party / Social | Medium | ★★★★★ | Browser `MediaRecorder` ring buffer + `gameEventBus` |
| **5** | **Phone-at-the-Oche QR Remote Control** | Kiosk UX | Medium | ★★★★★ | Lightweight WS relay + mobile web view |
| **6** | **Precision Drift & Grouping Coach (MPI Biomechanics)** | Pro Analytics | Low–Med | ★★★★☆ | Exact `(x, y)` `sessionThrows` + `DARTBOARD_RADIUS` |
| **7** | **Pro Training Drills Suite (Bob's 27, 121 Ladder, JDC)** | Skill Progression | Low–Med | ★★★★☆ | Existing `GameHost` plug-in socket |
| **8** | **Hype GIF & Meme Celebration Engine (Party Mode)** | Party / Fun | Low | ★★★★☆ | `gameEventBus`, `CalloutBanner`, `isPartyMode` |
| **9** | **Local Career Vault (File/SQLite) & Streaks Wall** | Data & Longevity | Medium | ★★★★☆ | `usePlayerStore`, Vite/Node local storage API |
| **10** | **Adaptive DartBot & "Ghost Yourself" Sparring** | Solo Replayability | Low–Med | ★★★★★ | `simulator.ts` Gaussian scatter + `DemolitionGame` |

---

## Detailed Breakdown of All 10 Ideas

### 1. Live Online Match Sync & Dynamic Checkout Co-Pilot
* **Open-Source Inspiration:** `creazy231/tools-for-autodarts` & Autodarts Cloud WebSocket (`wss://api.autodarts.io/ms/v0/subscribe`).
* **The Problem:** When you launch an online match on `play.autodarts.io`, Autodarts Desktop's local port `3180` only broadcasts *individual throws* — it doesn't know your match score (e.g., `121 remaining`), opponent's score, or leg count.
* **The Solution:** A sleek **Match Co-Pilot Bar / Widget** supporting two modes:
  1. **Zero-Auth Instant Companion:** One tap to start tracking a `501` / `301` leg right alongside an online match (or connect a tiny 30-line companion userscript on `play.autodarts.io` that forwards the live match state to `localhost:5173`).
  2. **Full Cloud OAuth2 Sync:** Once you have a `VITE_AUTODARTS_CLIENT_ID`, subscribe directly to `autodarts.matches` via `cloudApi.ts` for 100% hands-free opponent + leg sync.
* **Why It Shines Here:** We *already* built the PDC `2–170` checkout engine (`getCheckoutRoute`) and multi-segment `SvgDartboard` overlays! If you're on `121` and Dart 1 drifts from `T20` into `S20`, the display instantly recalculates (`101` left → lights up `T17` → `Bull` / `T20` → `D20` with 2 darts left) in under 50ms.

---

### 2. Native WLED Smart Room & Dartboard Surround Lighting
* **Open-Source Inspiration:** `lbormann/darts-wled` & `IteraThor/AutoGlow`.
* **The Problem:** Most Autodarts users have to install Python, `darts-hub`, and separate daemon scripts just to make an LED strip flash on a 180.
* **The Solution:** Build a native **WLED Controller** directly into Settings (`WLED IP: http://192.168.1.x`) that fires ultra-fast HTTP JSON requests straight from `gameEventBus`!
* **Mapped Effects:**
  * `boardStatus === 'throw'` → crisp warm white / emerald ready ring.
  * `boardStatus === 'takeout'` → soft amber breathing pulse ("pull darts").
  * `180` / `Checkout` / `Shanghai` → 3-second rainbow fireworks burst.
  * **The Board is Lava** → room shifts to flickering molten orange-red when someone burns!
  * **Party Mode (GTA VI)** → automatically switches your darts room LEDs to moody Vice purple & sunset gold!

---

### 3. Pro Broadcast Voice Caller & Custom Walk-On Audio ("Russ Bray Mode")
* **Open-Source Inspiration:** `lbormann/darts-caller`.
* **The Solution:** Upgrade `src/games/utils/soundEngine.ts` with a **Voice Caller Engine**:
  * **Zero-Setup Default:** Crisp browser `speechSynthesis` caller announcing visit totals (`"One hundred and forty!"`), bust calls, checkout requirements (`"Callum, you require 64"`), and arcade events (`"Killer unlocked!"`).
  * **Custom MP3 Voice Packs:** Drop any community voice pack folder into `public/voices/<pack-name>/` (`180.mp3`, `140.mp3`, `game-shot.mp3`, etc.) and select it in Settings — just like `darts-caller`, running natively in the browser with zero background apps.
  * **Player Walk-On Clips:** Let each player profile/guest pick a 5-second entrance sting when starting a match in Party Mode.

---

### 4. Flight Club-Style "Oche-Cam" Action Replays & Highlight Cards
* **Open-Source Inspiration:** Flight Club's signature *Oche-Cam Action Replays* & *Flight Club Stories*.
* **The Solution:** Plug in any cheap USB webcam aimed at the oche (or players) and use the browser's native `navigator.mediaDevices.getUserMedia` + a rolling 8-second `MediaRecorder` ring buffer (100% local, zero cloud uploads!).
* **The Magic:** Whenever `gameEventBus` detects a **hype event** (`180`, `140+`, `Bullseye finish`, `Shanghai`, `Killer knockout`, `Snooker 30+ break`), the monitor immediately freezes for 3 seconds and plays a crisp **Action Replay picture-in-picture overlay** with the score stamp on top!
* **Party Bonus:** At the end of a Party Mode night, view a gallery of all clipped moments and optionally download them as `.webm` clips or shareable recap cards.

---

### 5. Phone-at-the-Oche QR Remote Control
* **Open-Source Inspiration:** Companion remotes in kiosk apps / `tools-for-autodarts` mobile wrappers.
* **The Problem:** On a wall-mounted vertical 1080×1920 kiosk monitor, walking over to a mouse/keyboard to click **Undo**, **Switch Game**, **Add Guest**, or **Toggle Party Mode** breaks the flow.
* **The Solution:** Add a lightweight local WebSocket bridge (as a tiny Vite dev-server plugin or small Node sidecar) and display a clean **QR Code** button in the header.
* **The Experience:** Scan the QR code with any phone on the same Wi-Fi to open a sleek dark-mode remote control:
  * Big thumb-friendly buttons: **Undo Dart**, **Next Turn / Pull Darts**, **Toggle Party Mode**, **Switch Game**, **Add Guest Players**, and **Quick Dart Correction**.

---

### 6. Precision Drift & Grouping Coach (MPI Biomechanics Widget)
* **Open-Source Inspiration:** `homedarts-for-autodarts` & professional dart coaching scatter analytics.
* **The Insight:** Our `DartThrow.coords` already records exact sub-millimeter `(x, y)` coordinates (`radius 1.0 = 170mm`). We're barely scratching the surface of that goldmine!
* **What This New Dashboard Widget Shows:**
  * **Mean Point of Impact (MPI) Offset:** E.g., *"Your T20 group centers 4.8mm left & 2.1mm high"* — instantly tells you if your stance or release is drifting into S5/S1.
  * **Grouping Tightness Radius (R80 in mm):** Tracks the radius containing 80% of your T20 darts over time (watch it shrink from 32mm → 18mm!).
  * **Dart 1 vs Dart 2 vs Dart 3 Breakdown:** Reveals whether your 1st dart is a stray marker dart or your 3rd dart drops low from rushing.
  * **Zoomed-In T20 / D16 / Bull Reticle View:** Magnified SVG bed showing exact wire misses.

---

### 7. Structured Pro Training Drills Suite (Reusing `GameHost`)
* **Open-Source Inspiration:** Classic darts training apps (*My Dart Training*, *DartCounter*, *JDC Routine*).
* **The Solution:** Add a **Practice Drills** category right inside our existing modular `GameHost` socket (zero new engine plumbing needed!):
  * **Bob's 27:** Start at 27 points, throw 3 darts at every double from `D1` → `Bull`. Hits add double value; missing all 3 subtracts it. Drop below 0 = fail! Best doubles drill in darts.
  * **121 Checkout Ladder:** You get 9 darts to check out `121`. Succeed → move up to `122`; fail → drop to `120`. Builds real match-finishing nerve.
  * **JDC Challenge:** Official 3-stage scored routine (10–15 Shanghai, Around the World Doubles, 15–20 Shanghai) producing a trackable numeric rating & color belt.
  * **Treble 20 / Doubles Speedrun:** 99-dart scoring benchmark with live pace-vs-PB gauge.

---

### 8. Hype GIF & Meme Celebration Engine (Party Mode Exclusive)
* **Open-Source Inspiration:** `creazy231/tools-for-autodarts` custom GIF triggers & `autodarts-gif`.
* **The Solution:** A customizable **Event → Reaction** rule engine that flashes slick, non-blocking meme/GIF/animated overlays on big or hilarious throws:
  * `26` (S20 + S5 + S1) → *"Bed & Breakfast!"* toast animation
  * `180` → Full-screen gold confetti + laser burst
  * `3` (S1 + S1 + S1) → *"Madhouse Special"*
  * `Bust` / `3× Miss` → Dramatic glitch / facepalm reaction
* **Smart Guardrail:** Configurable to auto-enable **only during Party Mode & Arcade Games**, keeping your solo practice dashboard sleek and broadcast-clean.

---

### 9. Local Career Vault (File/SQLite Persistence) & Personal Records Wall
* **The Problem:** Browser `localStorage` has a ~5MB cap and disappears if browser cache gets cleared — fine for sessions, not great for a 2-year career of 50,000+ dart coordinates.
* **The Solution:** Add an optional ultra-light local Node/Vite file API (saving structured JSON or SQLite into `./data/career.db` right inside the repo folder, gitignored) with automatic daily snapshots.
* **Unlocks:**
  * **GitHub-Style Practice Streak Calendar** (green squares for every day you threw)
  * **Personal Records Trophy Cabinet** (Highest 3DA Session, First 180, Best Checkout, Highest Snooker Break, Most Killer Wins)
  * **Long-Term Trend Filtering** (Today / 7 Days / 30 Days / All-Time) without slowing down the browser.

---

### 10. Adaptive "DartBot" & Ghost-Yourself Sparring Mode
* **Open-Source Inspiration:** *Autodarts Bot*, *NakKa n01*, *DartConnect* adaptive AI.
* **The Insight:** We *already* have a realistic Gaussian polar scatter simulator in `src/services/simulator.ts` (`generateSimulatedThrow`) AND a full PDC checkout engine (`getCheckoutRoute`)!
* **The Experience:**
  * In **Demolition 501** (and even **Snooker** / **Shanghai** / **Killer**!), let you add a **DartBot** player to the roster with a target 3-Dart Average (`40`, `55`, `70`, `85`, `100`+).
  * On the bot's turn, watch its 3 darts land one-by-one (~600ms apart) directly onto `SvgDartboard` with realistic Gaussian grouping and smart checkout attempts!
  * **Ghost Mode Twist:** Race head-to-head against a replay of *your own* recorded past leg ("Beat Your Best 18-Darter!").
