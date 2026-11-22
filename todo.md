# Project Context & Roadmap (`todo.md`)

> **AGY CLI Session Kickoff File:** Read this file at the start of every session to orient on what this app is, its tech stack, key architecture, conventions, and active tasks. Keep the checklist updated as work is completed.

---

## 1. What This App Is

**Autodarts Modular Dashboard & Tech Darts Arcade** is a local-first, kiosk-friendly web application built to run on a dedicated **vertical (1080×1920 portrait) monitor** next to a Winmau / Autodarts dartboard (with responsive fallback for 16:9 landscape displays).

It has two core pillars sharing a single live dartboard connection:
1. **Live Stats Dashboard (Bento Grid):** Real-time 3-dart visit tracking, SVG dartboard `(x, y)` coordinate heatmap, 3-Dart Average, First 9 Average, Scoring Power (Ton+ breakdown), Target Precision hit rates, progression sparklines, multi-player profiles, and a customizable modular widget layout.
2. **Modular Tech Darts Games Arcade:** A plug-in game socket inspired by **Flight Club** and **Roxy Ballroom Tech Darts**, allowing social/party and precision games (*The Board is Lava*, *Killer*, *Snooker*, *Demolition 501*, *Shanghai*, *Snakes & Ladders*, *Halve It*, *Donkey Derby*) to snap directly into the live Autodarts telemetry stream.

---

## 2. Tech Stack, Languages & Frameworks

| Layer | Technology | Notes |
| :--- | :--- | :--- |
| **Language** | TypeScript `~5.7` (strict mode) | All source files under `src/` |
| **UI Framework** | React `19` + Vite `6` | SPA, fast HMR on `http://localhost:5173` |
| **Styling** | Tailwind CSS `v4` (`@tailwindcss/vite`) + `clsx` + `tailwind-merge` | Dark-room matte theme (`#0B0F17` canvas, `.card-matte` cards, `tabular-nums`) |
| **Icons** | `lucide-react` | Standard icon set across header, widgets, and games |
| **State Management** | Zustand `5` (with `persist` to `localStorage`) | `useLiveBoardStore`, `usePlayerStore`, `useLayoutStore`, `useSettingsStore`, `useGameStore` |
| **Charts & Viz** | `recharts` + Custom `SvgDartboard` | Vector dartboard with `segmentOverlays` + `DartPlotOverlay` |
| **Data / Auth** | `@tanstack/react-query` + `oidc-client-ts` | Optional future Autodarts Cloud OAuth2 PKCE |
| **Live Hardware API** | Autodarts Desktop Local Board Manager (port `3180`) | `ws://127.0.0.1:3180/api/events` + `GET http://127.0.0.1:3180/api/state` |
| **Audio (Games)** | Web Audio API (`soundEngine.ts`) | Zero-dependency synthesized arcade SFX |

---

## 3. Architecture & Key Files

```text
dashboard/
├── AGENTS.md                                       # Auto-loaded AGY CLI workspace rules
├── todo.md                                         # This file (context + living roadmap)
├── GAMES_DEVELOPMENT_GUIDE.md                      # Authoritative AI blueprint for building new games
├── autodarts_modular_stats_dashboard_specification.md
├── README.md                                       # Daily startup & local board setup guide
└── src/
    ├── App.tsx                                     # Root shell; owns single persistent LocalBoardManagerService WS
    ├── index.css                                   # Tailwind v4 + .card-matte + glow & tabular-nums utilities
    ├── types/
    │   ├── darts.ts                                # DartThrow, DartSegment, DartCoords, BoardManager payloads
    │   ├── stats.ts                                # PlayerProfile, PlayerStats, TonBreakdown
    │   ├── config.ts                               # WidgetId, DashboardLayout, DataConnectionMode
    │   └── games.ts                                # GameDefinition, GameModuleProps, GameBoardEvent, GameResult
    ├── services/
    │   ├── localBoardManager.ts                    # Autodarts port 3180 WS + HTTP snapshot poller & parser
    │   ├── gameEventBus.ts                         # Diffing pub/sub socket: dart_thrown, dart_corrected, visit_completed
    │   ├── simulator.ts                            # Gaussian scatter Demo Simulator throw generator
    │   └── cloudApi.ts                             # Optional Autodarts Cloud OIDC client
    ├── store/
    │   ├── useLiveBoardStore.ts                    # Live board throws -> updates stats (paused during active games) + gameEventBus
    │   ├── usePlayerStore.ts                       # Multi-player profiles & persisted session stats (default: Callum)
    │   ├── useLayoutStore.ts                       # Bento widget visibility, order, colSpan
    │   ├── useSettingsStore.ts                     # Local/Cloud/Demo mode, WS/HTTP URLs, simulator toggles
    │   └── useGameStore.ts                         # View switching ('dashboard' | 'games-lobby' | 'game-active'), roster, config
    ├── components/
    │   ├── layout/                                 # Header (with Gamepad2 button), BentoGrid, LayoutDrawer, SettingsModal
    │   ├── dartboard/                              # SvgDartboard (supports segmentOverlays) + DartPlotOverlay
    │   ├── widgets/                                # 7 modular stats widgets + widgetRegistry.ts
    │   └── common/                                 # Badge, MetricCard, Modal
    └── games/
        ├── gameRegistry.ts                         # Central plug-in registry for all modular games
        ├── hooks/useGameBoardEvents.ts             # Hook games use to subscribe to live dart events
        ├── utils/soundEngine.ts                    # Synthesized Web Audio arcade SFX
        └── components/
            ├── GamesLobby.tsx                      # Arcade lobby screen with category filters & bento game cards
            ├── GameCard.tsx                        # Matte widget card per game (Coming Soon / Ready to Play)
            ├── GameRulePreviewModal.tsx            # Preview modal with rules & copyable AGY CLI prompt
            └── GameHost.tsx                        # Plug-in socket: Setup -> Live Chrome/Undo/Test Throws -> Victory Podium
```

---

## 4. Dev & Verification Commands

```powershell
# Start local dev server (http://localhost:5173)
npm run dev

# Type-check & production build (MUST pass with 0 errors after changes)
npm run build
```

---

## 5. Living Roadmap & Task Checklist

### Completed Foundations
- [x] Core React 19 + TypeScript + Vite + Tailwind v4 portrait-first dashboard shell
- [x] Live Autodarts Desktop integration (`ws://127.0.0.1:3180/api/events` + HTTP `/api/state` sync & snapshot diffing)
- [x] Built-in Demo Simulator mode & multi-player profile switcher (`Callum` primary + guests)
- [x] Customizable Bento Grid with 7 modular widgets (`widgetRegistry.ts` + `LayoutDrawer`)
- [x] Accurate `SvgDartboard` + `DartPlotOverlay` with coordinate heatmap & multi-segment `segmentOverlays`
- [x] Modular Games Socket (`gameEventBus`, `useGameBoardEvents`, `useGameStore`, `GameHost`, `soundEngine`)
- [x] Header `Gamepad2` button & Tech Darts Arcade Lobby (`GamesLobby`, `GameCard`, `GameRulePreviewModal`)
- [x] AI Game Development Specification (`GAMES_DEVELOPMENT_GUIDE.md`)
- [x] AGY CLI workspace onboarding setup (`todo.md` + `AGENTS.md`)
- [x] **Party Mode (Subtle GTA VI Purple/Gold Theme + Unsaved Ephemeral Guest Stats)** — Dedicated `Party Mode` / `Stop Party` header button, RAM-only stats isolation, and clean board reset starting from the next visit
- [x] **All 8 Tech Darts Arcade Games Implemented & Plugged In** (`board-is-lava`, `killer`, `snooker`, `demolition`, `shanghai`, `snakes-and-ladders`, `halve-it`, `donkey-derby`)
- [x] **Phone-at-the-Oche QR Remote Control** — Embedded zero-dependency Vite LAN SSE relay (`scripts/viteRemoteRelayPlugin.ts`), offline QR pairing modal (`RemoteQrModal`), and thumb-friendly mobile controller (`/?remote=1` — Control, Games, Players, Throw Pad, Party Mode theme sync)
- [x] **Player Accounts: Save-to-Device Toggle & Darts Colour Custom Themes** — New player forms (Header, Game Setup, Phone Remote) let players pick their darts colour + tick whether to save their account, subtly tinting gradients & card rims across the Dashboard, all 8 Arcade Games on each player's turn, and the Phone Remote
- [x] **Local Career Vault, Streak Calendar & Daily/Weekly Objectives** — Atomic local disk persistence (`data/career-vault.json`), 14-week GitHub-style practice calendar & daily streak tracker, clickable Day Inspector + Best Days Ever archive, Personal Records Vault modal (with JSON export/import), and live Fun/Skill/Grind Daily & Weekly Objectives
- [x] **Flight Club-Style "Oche-Cam" Action Replay & Auto-Clipper** — Default Side-by-Side Dual-Camera 10s rolling `MediaRecorder` compositor (`OCHE CAM` + `BOARD CAM` stitched at `1600×720`) saving WebM clips to `C:\Users\callu\Desktop\Media\darts-autoclipper`, broadcast split-screen slow-mo replay overlay, Replay Gallery, and removable Settings Dev Test (`Capture Next Dart`)
- [x] **Ordered Kiosk Startup Script & iPad Oche Command Deck** — One-click `Start-Autodarts-Kiosk.bat` / `start-kiosk.ps1` + in-app 4-stage `KioskBootScreen` (Career Vault → Autodarts 3180 → iPad Relay → Default Auto-Start Side-by-Side Split-Cam), plus full 2-column iPad Oche Deck (`/?remote=1`) with iPadOS wake recovery, live Match Rules editor, Saved Profile quick-add, and `Clip That!` / Dismiss Replay controls

### Up Next — Core Features & Priorities
- [ ] **Live Match / Online Game Logger & Checkout Assistant** — Way to log or track live matches being played (e.g., when starting an online Autodarts match or local 501/301 leg) so this display knows your exact remaining score in real time and automatically offers optimal checkout routes + highlights target doubles/trebles on the dartboard
- [ ] *(Cleanup when done testing)* Remove temporary `[DEV-TEST: REMOVE WHEN DONE]` next-dart replay trigger once Oche-Cam angle & timing are verified
- [ ] **Seamless PC Auto-Boot & Kiosk Startup Script** — Windows boot/login script (Startup folder / Task Scheduler) that automatically launches Autodarts Desktop, starts the dashboard server silently in the background, waits until both are ready, and opens the browser straight into fullscreen (`F11` / `--kiosk`) on the darts monitor for a zero-touch turnkey experience

### Modular Games Roster (All Plugged Into `src/games/gameRegistry.ts`)
- [x] **The Board is Lava** (`board-is-lava`) — Survival party game with erupting lava wedges & bullseye cool-down
- [x] **Killer** (`killer`) — Flight Club classic: claim wedge, charge lives to Killer, hunt rivals
- [x] **Snooker** (`snooker`) — Tactical Red/Colour potting with live 147 break tracker & clearance sequence
- [x] **Demolition 501** (`demolition`) — Arcade X01 (180/301/501) with score towers & board checkout route highlights
- [x] **Shanghai** (`shanghai`) — Escalating round target game with instant S+D+T Shanghai KO
- [x] **Snakes & Ladders** (`snakes-and-ladders`) — Visual neon 100-square board race with ladders & snakes
- [x] **Halve It** (`halve-it`) — High-stakes challenge gauntlet where missing all 3 darts halves your score
- [x] **Donkey Derby** (`donkey-derby`) — Multi-lane neon racing game where hitting your wedge gallops ahead

### Future Platform Enhancements
- [ ] Persist per-game high scores / leaderboards (e.g., Highest Snooker Break, Most Killer Wins) in `useGameStore`
- [ ] Optional on-screen virtual dartboard touch/click keypad for quick score corrections at the oche
- [ ] Optional Autodarts Cloud OAuth2 PKCE integration once `VITE_AUTODARTS_CLIENT_ID` is configured
- [ ] Sound volume slider & custom voice/announcer callouts (Web Speech API) toggle in Settings
