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
- [x] **Flight Club-Style "Oche-Cam" Action Replay & Auto-Clipper** — Default Side-by-Side 4-Camera Broadcast Compositor (`1600×900`: unchanged Oche/Throwing USB webcam on left + all 3 Autodarts Desktop board cameras stacked at exact 16:9 on right via unbuffered `/api/replays/board-stream` MJPEG decoder), spinning broadcast stinger & full-screen replay stage, **auto-saving 10s game clips (`5s before + 5s after`)** + **20s manual iPad `Clip That!` clips (`15s before + 5s after`)**, smooth 2.2s **`CLIP SAVED!`** broadcast celebration animation that auto-resumes the game with zero black flicker, **automatic Game Winning Shot / Checkout clipping & auto-saving across all 8 games** (e.g. `Killer - Game Winning Shot - Callum (YYYY-MM-DD_HH-MM-SS).webm`), auto-discovery of all saved clips on restart across `Game Highlights`, `User Triggered`, and `Dev Tests` inside `C:\Users\callu\Desktop\Media\darts-autoclipper`, and removable Settings Dev Test (`Capture Next Dart`)
- [x] **Zero-Touch Windows Auto-Boot, Kiosk Startup Script & iPad Oche Command Deck** — Silent Startup shortcut (`Autodarts-Kiosk.lnk` → `Launch-Kiosk-Silent.vbs` → `start-kiosk.ps1`) + `Install/Uninstall-Kiosk-AutoBoot.bat`, in-app 4-stage `KioskBootScreen` (Career Vault → Autodarts 3180 → iPad Relay → Default Auto-Start Side-by-Side Split-Cam), and full 2-column iPad Oche Deck (`/?remote=1`) with iOS/iPadOS Home Screen safe-area insets, wake recovery, live Match Rules editor, Saved Profile quick-add, `Clip That! (20s)`, `Save Clip`, and Dismiss Replay controls
- [x] **Hidden PIN-Protected Mobile Dev Debug Console (`/?dev=1`, PIN `0161`)** — Secretly opened via **5-tap on the `AD` crest** (on BOTH Kiosk Header and iPad Oche Deck) or `Ctrl + Shift + D`, locked behind PIN `0161` on both the QR modal and iOS notch-safe Home Screen web app, streaming live listeners health (Board 3180, Split-Cam, Oche Deck, Kiosk View, Career Vault, JS Errors), filterable real-time console logs (`BOARD`, `CAMERA`, `REMOTE`, `GAME`, `VAULT`, `SYS`), and remote diagnostic triggers (`Ping`, `Restart Cams`, `Arm Next-Dart Clip`)
- [x] **Pure Broadcast Kiosk / Complete iPad Oche Controller Transition** — Main Kiosk TV display (`http://localhost:5173`) stripped of all clutter and on-screen buttons into a clean, dark-night 8-foot glanceable broadcast view (Header, Heatmap, Live Visit, Objectives, Streak Calendar, Games Showcase, Match Setup Lineup, Podium, Full-Viewport Replay Overlay); 100% of app controls migrated to the iPad Oche Command Deck (`/?remote=1` — Games & Setup, Players & Inline Darts Colour Editor, Split-Cam Replays & Categorized Saved Clips Gallery with Play-on-TV / Speed / Save / Dismiss, Bento Layout Customizer, Heatmap Mode, Objectives Reroll, Data Mode / Demo Sim, Career Vault Summary, Kiosk Fullscreen); emergency keyboard shortcut `Ctrl + Shift + S` retained for hardware webcam dropdown fallback
- [x] **Solo Training Mode (`practice-lobby`), 4 Pro Practice Drills & Context-Aware iPad Right Panel** — Added dedicated **Practice** mode alongside **Dashboard** & **Arcade** in the responsive 3-mode iPad header (inline on landscape `lg+`, crisp 3-col pill strip on portrait/phone `< lg`), built 4 live-board solo drills plugged into `GameHost` (**Bob's 27**, **121 Checkout Ladder**, **JDC Challenge**, **99-Dart Scoring Gauntlet**) + Kiosk `PracticeLobby` showcase, and made the iPad right panel's 1st tab context-aware (**Goals** with live Daily & Weekly Objectives on Dashboard, **Games** on Arcade, **Drills** on Practice) with verified Party Mode on/off theme & stat tracking restoration

- [x] **Live Match / Online Game Logger & Dynamic Checkout Assistant** — Real-time `501` / `301` / `701` leg tracker (`useOnlineMatchStore` + `useOnlineMatchSync`) controlled from the iPad Dashboard **Goals** tab (Start/End, Undo, Opp Won Leg, Reset Leg, Mid-Leg Score Sync), modular `LiveMatchWidget` scoreboard strip, live PDC checkout double/treble highlights directly on `DartboardHeatmapWidget`, and automatic `Online 501 - Game Winning Shot` auto-clipping on checkouts
- [x] **Persistent Per-Game & Per-Drill Leaderboards + Modular Dashboard Widget** — All-time Hall of Fame records persisted in `data/career-vault.json` (`gameLeaderboards`) across all 13 Arcade games, 7 Solo Practice Drills, and Online X01 legs (Party Mode protected), rendered as a movable, toggleable modular `game-leaderboards` widget (`LeaderboardsWidget`) customizable up/down via the iPad **Display** tab
- [x] **Dedicated iPad Game & Practice Companion Screen + Broadcast "How to Play" Vertical TV Guide** — Launching any of the 13 Arcade Games or 7 Solo Practice Drills automatically switches the iPad (`/?remote=1`) into a dedicated, clutter-free **`GameCompanionScreen`** tailored to that exact game/drill across Setup, Live Match, and Finished phases (custom Oche Cheat Sheet, tailored Quick Throw/Correction Pad, Next Turn & Undo pads, Clip That 20s, Audio toggle, 2-tap safe Restart / Change Rules / **Stop & Exit** controls, and a prominent **`How to Play`** toggle that pops an 8-foot readable rulebook guide directly onto the vertical Kiosk monitor for everyone to read)
- [x] **1080×1920 Portrait Broadcast Kiosk Redesign Across All 20 Games & Practice Drills** — Removed the hardcoded `560px` cap in `SvgDartboard` (enabling crisp `600–680px` dartboards on 1080px portrait), upgraded `VisitPillsStrip` & `CalloutBanner` for 8-foot glanceability, and redesigned all 13 Arcade games and 7 Solo Practice drills with giant hero typography (`text-7xl`–`text-9xl`), prominent high-contrast telemetry tiles (such as visual dart-pip **Darts Left** counters), and zero unreadable micro-text

### Up Next — Core Features & Priorities
- [ ] *(Cleanup when done testing)* Remove temporary `[DEV-TEST: REMOVE WHEN DONE]` next-dart replay trigger once Oche-Cam angle & timing are verified

### Modular Games Roster (All 13 Plugged Into `src/games/gameRegistry.ts`)
- [x] **The Board is Lava** (`board-is-lava`) — Survival party game with erupting lava wedges & bullseye cool-down
- [x] **Killer** (`killer`) — Flight Club classic: claim wedge, charge lives to Killer, hunt rivals
- [x] **Snooker** (`snooker`) — Tactical Red/Colour potting with live 147 break tracker & clearance sequence
- [x] **Demolition 501** (`demolition`) — Arcade X01 (180/301/501) with score towers & board checkout route highlights
- [x] **Shanghai** (`shanghai`) — Escalating round target game with instant S+D+T Shanghai KO
- [x] **Snakes & Ladders** (`snakes-and-ladders`) — Visual neon 100-square board race with ladders & snakes
- [x] **Halve It** (`halve-it`) — High-stakes challenge gauntlet where missing all 3 darts halves your score
- [x] **Donkey Derby** (`donkey-derby`) — Multi-lane neon racing game where hitting your wedge gallops ahead
- [x] **Cal's Quest** (`cals-quest`) — D&D Roguelike dungeon crawler (1–6P Co-Op): 5 escalating bosses (3 HP Goblin → 20 HP Elder Dragon), Armor Shields, Minions, Bullseye healing, 6 Roguelike Relics, and Left-Half vs Right-Half dartboard Choose-Your-Path rooms
- [x] **Darts Golf** (`darts-golf`) — Randomised 9-Hole / 20-Hole Par course (1–6P) with shuffled target segments per hole, Masters emerald scorecard, Eagle/Birdie/Par/Bogey rings, Last-Dart vs Best-Dart rules, and Gimme Bull Par rescue
- [x] **Battleship Darts** (`battleship`) — Hidden naval fleets across adjacent wedges with Hits/Sunk tracking & Multiplier Sonar Pings
- [x] **Cricket** (`cricket`) — Classic 20–15 & Bull closing matrix with Standard and Cut-Throat scoring variants
- [x] **Sniper Bingo** (`sniper-bingo`) — Shuffled 3×3 neon Bingo cards (Classic & Pro Doubles/Trebles; Line & Blackout patterns)

### Modular Solo Practice Drills (All 7 Plugged Into `src/games/gameRegistry.ts`)
- [x] **Bob's 27** (`bobs-27`) — Classic PDC doubles drill (`D1` → `D20` → `Bull`) with pulsing targets & accuracy tracking
- [x] **121 Checkout Ladder** (`checkout-121`) — 9-dart Double-Out ladder with live PDC checkout route highlights
- [x] **JDC Challenge** (`jdc-challenge`) — 3-stage scored routine (Shanghai 10–15, Doubles Gauntlet, Shanghai 15–20) with Belt ranks
- [x] **99-Dart Scoring Gauntlet** (`scoring-gauntlet`) — Fixed-dart scoring benchmark (`T20` / `T19` / `Bull` / Free) with live 3DA & Ton+ breakdown
- [x] **Around the Clock Pro** (`around-the-clock`) — Sequential `1 → 20 → Bull` sprint with Any / Doubles / Trebles modes and Turbo Skip (`D=+2`, `T=+3`)
- [x] **Catch 40** (`catch-40`) — PDC finishing mastery (`61 → 100` or `61 → 80`) with 6 darts per checkout, `+3/+2/+1` speed scoring & live routes
- [x] **Precision Sniper** (`precision-sniper`) — Surgical target grouping circuits (`T20→T10`, Pro Doubles, Power Core) with Darts-Per-Hit tracking

### Future Platform Enhancements
- [ ] Sound volume slider & Pro Voice Caller / Announcer callouts (Web Speech API / MP3 packs) controlled from iPad
- [ ] Optional Autodarts Cloud OAuth2 PKCE integration once `VITE_AUTODARTS_CLIENT_ID` is configured
