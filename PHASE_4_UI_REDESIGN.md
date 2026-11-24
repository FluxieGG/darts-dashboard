# Phase 4 — Collaborative UI Redesign (Standalone AGY Handoff & Data-Safe Design Specification)

> **Purpose of this file:** If you are a new AGY session picking up after a disconnect, read `todo.md`, `plan.md`, and this file first. Phases 1–3 (Crash/Freeze Remediation, Leak/Audio Removal, and Hardening + `vitest` Regression Suite) are **100% complete**. You are now entering **Phase 4**, an **interactive, collaborative UI redesign sprint** with the user.

---

## 1. How to Run Phase 4 (IMPORTANT — Do NOT Code Before Aligning!)

The user explicitly asked that **Phase 4 be a collaborative design conversation first**:
1. **Talk through the UI together before writing code:** Discuss what the user likes, dislikes, wants simplified, or wants elevated across each surface (Kiosk TV Dashboard, Games/Practice Arenas, DartCounter Handoff, iPad Oche Deck).
2. **Validate every visual/layout change against existing data & store contracts** (documented in Section 4 below) so zero user data (`career-vault.json`, `dashboard-state.json`, saved clips) and zero live hardware integrations (Autodarts port `3180`, DartCounter Brave extension, iPad SSE relay) are ever broken.
3. **Agree on a concrete wireframe / component spec** for each surface (you can recommend `/grill-me` or ask structured design questions) before implementing changes incrementally with `npm test` + `npm run build` verification after every step.

---

## 2. Current App State & Ground Rules (Post Phases 1–3)

Before proposing UI changes, remember these **hard constraints** established in Phases 1–3:
- **No Audio on Kiosk:** There are **no speakers/audio** on this kiosk (`soundEngine.ts` is a silent no-op, camera mic capture is permanently `audio: false`, replay `<video>` elements are permanently `muted`). **Do NOT add any volume sliders, SFX toggles, voice callers, or audio badges** to the new UI.
- **Manual Browser Launch (No Forced Kiosk Mode):** `start-kiosk.ps1` waits for Autodarts Desktop calibration (`GET /api/state` → `running: true`) and starts the Vite server (`http://localhost:5173`) in the background; the user opens the dashboard manually in a browser (can press `F` for fullscreen anytime).
- **Target Displays:**
  1. **Primary Display — Vertical Portrait TV (`1080×1920`)** next to the dartboard (**3-meter / 8-foot glanceability rule**: giant `tabular-nums` numbers, zero micro-text, zero touch buttons required on the TV itself). Must also expand gracefully to `xl:` 16:9 landscape monitors.
  2. **Controller Display — iPad Oche Deck (`http://<LAN-IP>:5173/?remote=1`)** (plus responsive phone fallback). 100% of interactive controls live on the iPad (players, layout, games/drills, throw corrections, DartCounter Confirm & Send, replay clips).
  3. **Hidden Dev Console (`/?dev=1`, PIN `0161`)** — opened via 5-tap on the `AD` crest or `Ctrl + Shift + D`. Keep this entry point working!
- **Visual Baseline & Themes:**
  - Default theme: Dark-room matte (`#0B0F17` canvas, `.card-matte` cards, high-contrast typography, subtle `--player-tint-rgb` / `--player-tint-hex` driven by the active player's `dartColor`).
  - Party Mode (`data-theme="party"`): GTA VI Vice purple/gold theme with RAM-only ephemeral guest stats (never touches personal Career Vault or saved stats).
  - DartCounter Mode (`data-theme="dartcounter"`): Light & Target Orange (`#F4F5F7` canvas, `#FFFFFF` cards, `#F76505` orange). **Clipping & Oche-Cam are permanently paused whenever in DartCounter mode** (`isDartCounterClippingDisabled()`).
- **Single Hardware Connection Rule:** Keep the single persistent `LocalBoardManagerService` connection in `src/App.tsx` (proxied via `/api/board` to port `3180`). Games consume telemetry exclusively via `useGameBoardEvents` / `gameEventBus`.
- **Error Boundaries Must Stay:** Keep `AppErrorBoundary` wrapping root (`main.tsx`), per-widget (`BentoGrid.tsx`), active game (`GameHost.tsx`), and replay overlay (`App.tsx`).

---

## 3. Surfaces Eligible for Redesign

| Surface | Current Key Files | Current Pain Points / Opportunities |
| :--- | :--- | :--- |
| **Kiosk Header & Chrome** | `src/components/layout/Header.tsx`, `src/App.tsx` | Broadcast header + footer; keep 5-tap `AD` crest (`Ctrl+Shift+D`) and `Ctrl+Shift+S` emergency settings intact. |
| **Kiosk Live Dashboard (Bento Grid)** | `src/components/layout/BentoGrid.tsx`, `src/components/widgets/*` (11 widgets in `widgetRegistry.ts`), `src/components/dartboard/SvgDartboard.tsx`, `DartPlotOverlay.tsx` | 11 modular widgets (`live-match`, `hero-kpis`, `live-visit`, `dartboard-heatmap`, `scoring-power`, `doubles-trebles`, `trend-sparkline`, `recent-matches`, `objectives-tracker`, `career-streak`, `game-leaderboards`). Opportunity for cleaner visual hierarchy, sharper 8ft readability, unified typography/spacing, and richer data storytelling from existing stats. |
| **Kiosk Games & Practice Lobbies + GameHost** | `src/games/components/GamesLobby.tsx`, `PracticeLobby.tsx`, `GameHost.tsx`, `ArcadePrimitives.tsx` | Lobby cards, Match Setup lineup showcase, Victory Podium, and Broadcast "How to Play" rulebook overlay. (All 20 game engines are pure & tested — UI skins can be refreshed safely without touching engines!) |
| **Kiosk DartCounter Handoff** | `src/components/online/DartCounterKioskArena.tsx`, `OnlineMatchFullscreenArena.tsx` | Lightweight handoff screen (`app.dartcounter.net/match`), live online friends strip, and manual X01 fullscreen arena. |
| **Kiosk Action Replay Overlay** | `src/components/replay/ActionReplayOverlay.tsx`, `ReplayGalleryModal.tsx` | Broadcast stinger, full-viewport split-cam replay stage, and "CLIP SAVED!" celebration banner. |
| **iPad Oche Deck (`/?remote=1`)** | `src/components/remote/MobileRemoteView.tsx` (**~3,000 lines — top refactor target!**), `GameCompanionScreen.tsx` (~1,400 lines), `DartCounterRemoteScreen.tsx` | Huge opportunity to split `MobileRemoteView.tsx` into clean, fast, focused sub-components (`React.memo` panels) with better thumb/tablet ergonomics, cleaner navigation, and faster visual scanning at the oche. |

---

## 4. Safe Data & Persistence Contracts (DO NOT BREAK)

Any UI redesign MUST stay 100% compatible with the existing persisted disk files, `localStorage` keys, and LAN SSE protocols below.

### A. Persisted Disk Files (`./data/`)
1. **`data/career-vault.json`** (`src/types/career.ts` → `CareerVaultData`, `useCareerStore.ts`, `scripts/viteCareerVaultPlugin.ts`):
   - **Never rename or drop fields** in `CareerVaultData` (`version`, `players[playerId].dailyLogs[YYYY-MM-DD]`, `records`, `objectiveRerolls`, `completedObjectiveIds`, `gameLeaderboards[gameId]`).
   - **Rich existing data you can surface in new UI designs (already tracked live!):**
     - Per-day (`DailyCareerLog`): `totalDarts`, `totalPoints`, `threeDartAvg`, `visitsCount`, `highestVisit`, `highestVisitDarts`, `ton60Plus`, `ton100Plus`, `ton140Plus`, `ton180`, `treblesHit`, `doublesHit`, `bullsHit`, `outerBullsHit`, `cleanVisits`, `segmentCounts` (exact hit count per segment like `"T20"`, `"D16"`, `"Bull"`!), `gamesPlayed`, `gamesWon`, `highlights[]`.
     - All-time (`PersonalRecords`): `bestDay3DA`, `highestVisit`, `mostDartsInDay`, `longestStreakDays`, `totalCareerDarts`, `totalCareerVisits`, `total180s`, `total140Plus`, `total100Plus`, `totalBulls`, `totalTrebles`, `totalDoubles`, `totalGamesWon`.
     - Per-game Hall of Fame (`gameLeaderboards[gameId]`): `wins`, `gamesPlayed`, `bestStatValue`, `bestStatDisplay`, `bestStatLabel`, `lastPlayedAt`.
     - Live Objectives (`evaluateObjectives`): 3 Daily + 3 Weekly (`Fun` / `Skill` / `Grind`) with `current`, `target`, `pct`, `completed`.
     - Streaks (`computeStreaks`): `currentStreak`, `longestStreak`, `playedToday`, `daysPlayedThisWeek`, `totalDaysPlayed`.

2. **`data/dashboard-state.json`** (`src/services/dashboardPersistence.ts` → `PersistedDashboardState`):
   - Persists:
     - `layout`: `DashboardLayout` (`widgets[]` with `id: WidgetId`, `enabled`, `order`, `colSpan: 1 | 2`). **If adding/removing/renaming widgets**, keep `WidgetId` migration/fallback handling in `useLayoutStore.ts` + `dashboardPersistence.ts` so existing saved layouts never break!
     - `settings`: `dataMode`, `heatmapMode`, `showDevCoords`, `localWsUrl`, `localHttpUrl`, `autoSimIntervalMs`.
     - `players`: `players[]` (`id`, `name`, `isPrimary`, `dartColor`, `dartColorName`, `isSaved`), `activePlayerId`, `playerStats[playerId]` (`threeDartAvg`, `firstNineAvg`, `highestVisit`, `highestCheckout`, `checkoutPct`, `tonBreakdown`, `segmentAccuracy`, `trendHistory` [last 25], `recentVisits` [last 30], `sessionThrows` [capped at 200], `totalDartsThrown`, `totalPointsScored`, `firstNinePoints`, `firstNineDartsCount`).
     - `replay`: `boardCameraMode`, `autoStartCamera`, `selectedOcheDeviceId`, `playbackRate`, `clipsDirectory`, `triggers`.
   - **Size budget rule (established in Phase 1):** Keep `sessionThrows` capped (200) and compact JSON writes so `dashboard-state.json` stays lean and fast.

3. **Saved Video Clips (`C:\Users\callu\Desktop\Media\darts-autoclipper`):**
   - Managed via `/api/replays/list`, `/api/replays/file/...`, `POST /api/replays/clip`, `DELETE /api/replays/file/...` (`scripts/viteReplayClipperPlugin.ts`). Categories: `game`, `manual`, `dev`.

### B. Live Zustand Stores & What Data Each Exposes
- **`useLiveBoardStore`**: `currentVisitThrows[]` (with exact `(x, y)` coords, `segment`, `score`, `bouncer`), `boardStatus` (`throw` | `takeout`), `lastEvent`, `lastCompletedVisit`.
- **`usePlayerStore`**: `players[]`, `activePlayerId`, `playerStats`, `isPartyMode`, `partyPlayers`, `partyPlayerStats`, `getActivePlayer()`, `getActiveStats()` (always returns stable frozen fallback — never allocate in selectors!).
- **`useCareerStore`**: `vault`, `getPlayerVault(playerId)`, `recentlyCompletedObjective`, `isDiskSynced`.
- **`useLayoutStore`**: `layout.widgets[]` — controls dashboard widget visibility, order, and 1-col / 2-col spans.
- **`useGameStore`**: `activeView` (`dashboard` | `dartcounter` | `games-lobby` | `practice-lobby` | `game-active`), `activeGameId`, `matchPhase` (`setup` | `playing` | `paused` | `finished`), `roster`, `matchConfig`, `lastResult`, `isRulesOverlayOpen`, `activeTurnPlayerColor`, `canUndoActiveGame`.
- **`useOnlineMatchStore`**: `isActive`, `source` (`manual` | `dartcounter`), `startScore`, `outRule`, `legsToWin`, `remaining`, `opponentName`, `opponentRemaining`, `opponentAvg`, `isPlayerTurn`, `playerLegs`, `opponentLegs`, `legThreeDartAvg`, `checkoutRoute`, `isBust`, `matchWinner`, `dcConnected`, `dcMode`, `dcMatchUrl`, `dcPendingVisit`, `dcPendingInvites`, `dcOnlineFriends`, `dcOutgoingInviteTo`, `isFullscreenKiosk`.
- **`useReplayStore`**: `status` (`idle` | `starting` | `buffering` | `capturing` | `error`), `boardCameraMode`, `boardFeedActive`, `activeCameraLabel`, `availableCameras`, `hasCameraIssue`, `cameraIssueSummary`, `errorEpoch`, `activeOverlayClip`, `lastRecordedClip`, `clips[]`, `isSavingLastClip`, `playbackRate`, `triggers`.

### C. Kiosk ↔ iPad LAN Protocol (`src/types/remote.ts`, `src/services/remoteBridge.ts`)
- Kiosk pushes `RemoteKioskState` over `/api/remote/state` → SSE `/api/remote/stream`.
- Clips are fetched **on demand** by the iPad via `GET /api/replays/list` whenever `clipsRevision` or `replayClipCount` changes (keep `recentClips` out of the 60ms SSE push!).
- iPad sends `RemoteCommand` union via `POST /api/remote/command`. Any redesigned iPad UI can reuse all existing `RemoteCommand` types immediately without touching backend plugins!

---

## 5. Suggested Discussion Agenda for Starting Phase 4

When resuming with the user in a new session, kick off by asking these focused questions (or running `/grill-me`):
1. **Priority order:** Which screen bothers you most or do you want to redesign first?
   - A) **Kiosk Live Dashboard** (vertical `1080×1920` bento widgets & header)
   - B) **iPad Oche Deck** (`/?remote=1` — navigation, layout, modular split of `MobileRemoteView.tsx`)
   - C) **Games & Practice Lobbies / Match Setup / Podium** (`GamesLobby`, `PracticeLobby`, `GameHost`)
   - D) **Visual aesthetic & theme overhaul** (typography, card style, colors, density across all views)
2. **Information density on the TV (`1080×1920`):** Which widgets do you actually glance at from the oche, which feel cluttered or redundant, and what stats from `career-vault.json` / `playerStats` would you like surfaced bigger (or hidden)?
3. **iPad workflow at the oche:** What actions do you tap most often during a session (e.g., switching players, launching a game/drill, confirming DartCounter scores, `Clip That!`, undo/corrections), and what gets in your way?
4. **Target aesthetic:** Keep the dark matte broadcast look with cleaner spacing/polish, or move toward a specific visual direction (e.g., ultra-minimal broadcast HUD, Flight Club pub-arcade glow, pro PDC TV broadcast graphics)?

---

## 6. Verification Checklist After Every Phase 4 UI Change

Run these commands before finishing any Phase 4 milestone:
```powershell
# 1. Permanent unit & fuzz regression suite (parsers, career engine, stores, all 20 game engines)
npm test

# 2. Node/Vite plugin strict typecheck
npx tsc -p tsconfig.node.json --noEmit

# 3. Full TypeScript + Vite production build
npm run build
```
Also verify:
- Existing `data/career-vault.json` and `data/dashboard-state.json` load cleanly with zero data loss.
- Portrait `1080×1920` glanceability (8ft legibility, `tabular-nums`, no horizontal overflow) + `xl:` landscape layout.
- iPad `/?remote=1` stays single-breakpoint mounted, wakes cleanly from sleep, and has zero audio/SFX controls.
- Keep `plan.md` and `todo.md` checked off as milestones complete.
