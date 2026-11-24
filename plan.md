# Autodarts Modular Dashboard — Stability & Health Remediation Plan

> Generated from the 6-agent comprehensive health & crash audit ([health_report.md](file:///C:/Users/callu/.gemini/antigravity-cli/brain/10a6cdd5-38e6-4fd3-89f3-eb4f875a5282/health_report.md)).
> Work through one phase at a time, verifying `npm run build` (`tsc -b && vite build`) and runtime/stress checks after each phase before moving to the next.

---

## Phase 1 — Stop Crashes & Freezes Immediately *(Completed)*

Goal: Eliminate all active hard-crash, Node server exit, GPU/RAM OOM, Brave browser freeze, and silent disk-save failure vectors.

### 1A. React Error Boundaries & Core Crash Guards
- [x] Create `src/components/common/AppErrorBoundary.tsx` with root, widget, game, and silent-overlay recovery modes
- [x] Wrap root app in `src/main.tsx`, per-widget in `src/components/layout/BentoGrid.tsx`, `<GameComponent />` in `src/games/components/GameHost.tsx` (with Return to Lobby recovery + empty-roster guard), and `<ActionReplayOverlay />` in `src/App.tsx`
- [x] Fix `usePlayerStore.ts`: return frozen module-level `EMPTY_PLAYER_STATS` / `PRIMARY_PLAYER` fallbacks in `getActiveStats()` and `getActivePlayer()` (eliminates React 19 / Zustand 5 infinite render loop & `undefined` deref)
- [x] Fix `devLogger.ts`: add circular-safe `safeFormatArg()` + `try/catch` inside `console.error`/`console.warn` monkey-patch, cap `DevLoggerService.queue` at 200 items, and reschedule `scheduleFlush()` when tail logs remain

### 1B. Harden Vite Node Server Plugins & Proxies
- [x] `scripts/viteRemoteRelayPlugin.ts`: add `res.on('error')`, `req.on('error')`, `res.on('close')` unified cleanup, check `res.writableEnded || res.destroyed` in `sendSse` (drop dead/stalled clients + broadcast presence), `try/catch` around `new URL()`, safe `Buffer.concat` + `req.destroy()` in `readJsonBody()`, and clear `heartbeat` on server close
- [x] `scripts/viteDartCounterPlugin.ts`: add `res.on('error')` / `res.on('close')` cleanup, return `boolean` from `sendSse` so `delivered` only counts live sockets, safe `readJsonBody()` (`settled` + `req.destroy()`), `try/catch` `new URL()`, clear `heartbeat` on close, gate `connectedExtensions === 0` disconnect on `role === 'extension'`
- [x] `scripts/viteReplayClipperPlugin.ts`: add `stream.on('error')` + `res.on('close', () => stream.destroy())` + strict HTTP `Range` validation (`416`) + `decodeURIComponent`/`statSync` guards; add `res`/`upstreamRes` error handlers + timeout + `unpipe`/`destroy` on `/api/replays/board-stream` and `fetchAutodartsCameraConfig`; add `.catch()` on `/api/replays/cameras`; switch `POST /api/replays/clip` to async `fs.promises.writeFile`, unique `.tmp` names, `req.destroy()` on oversize/`aborted`, and deduplicate `relativePath` in `clips-index.json` (fixes duplicate clips)
- [x] `scripts/viteCareerVaultPlugin.ts`: per-file serialized async write queue (`fs.promises.writeFile` + UUID temp files + Windows `EPERM`/`EBUSY` rename retry + `.tmp` cleanup), validate JSON on `GET` (quarantine corrupt files), safe `Buffer.concat` + `req.destroy()`, and write compact JSON for `dashboard-state.json`
- [x] `vite.config.ts`: add `proxyReqWs` socket error handler and `proxy.on('error')` on `preview.proxy` & `/api/autodarts`

### 1C. Fix `dashboard-state.json` 64 KiB `keepalive` Cliff & Unbounded `sessionThrows`
- [x] Add running `totalPointsScored`, `firstNinePoints`, and `firstNineDartsCount` to `PlayerStats` (`src/types/stats.ts`, `usePlayerStore.ts`, `useLiveBoardStore.ts`) and cap `sessionThrows` at `200` darts so 3DA & First-9 Avg remain exact without unbounded growth
- [x] Fix `src/services/dashboardPersistence.ts`: remove `keepalive: true` from normal saves, update `lastSerializedPayload` only after `res.ok`, guard unload `sendBeacon`/`keepalive` at `<= 60_000` bytes, and eliminate double `JSON.stringify`

### 1D. Fix Camera / WebGL OOM, Context Exhaustion & Async Races
- [x] `src/services/ocheCamService.ts`: prune before spawning & cap active slots to `<= 2` per camera (max 6 lightweight encoders instead of 9–12); add monotonic `lifecycleEpoch` + `try/catch` rollback in `start()`; add `captureEpoch` + clearable post-roll timeout in `recordTenSecondClip()` so `stop()` aborts cleanly; replace `setInterval(drawFrame, 42)` with `try/catch` self-scheduling timer; add `recorder.onerror` + handler detachment; zero canvases & pause/load `<video>` on `stop()`; fix MJPEG stall watchdog to actually abort/reconnect + cancel `reader` + reuse staging buffer
- [x] `src/services/virtualBoardCam.ts`: call `WEBGL_lose_context?.loseContext()` + zero canvas in `dispose()`; add `webglcontextlost`/`webglcontextrestored` + `gl.isContextLost()` guards; disable MSAA (`antialias: false`) and reuse GPU texture with `gl.texSubImage2D` + `MAX_TEXTURE_SIZE` check
- [x] `src/store/useReplayStore.ts`: guard `startCamera()` and post-capture `triggerActionReplay()` with `isDartCounterClippingDisabled() || pausedForDartCounter` + monotonic `startEpoch`; decouple `URL.revokeObjectURL` from `savedConfirmTimer`; free `pendingSaveBundle` on pause/stop; add `AbortController` timeouts to upload/list fetches

### 1E. Fix Brave Extension Freezes, Leaks & DartCounter Score Races
- [x] `extensions/dartcounter-bridge/content.js`: ignore `#ad-dc-bridge-hud` mutations in `MutationObserver`, skip `innerHTML` when HUD signature is unchanged (kills 10 Hz layout-thrash loop), strip `detectedAt` from invite hash, add `safeSendMessage()` + full listener/interval teardown on `Extension context invalidated`, escape HUD HTML, cap `submittedVisitIds`, replace `innerText` with `textContent`
- [x] `extensions/dartcounter-bridge/page-bridge.js`: guard `document.documentElement?.dataset` at `document_start`, cache resolved Angular services + scan LViews once per tick + prune disconnected LViews, stop 404 chunk `import()` storm (`*Tried` guard), add `isPublishing` mutex, shorten submit wait below `content.js` timeout
- [x] `extensions/dartcounter-bridge/background.js` & `popup.js`: fix `streamConnecting` race, add 45s SSE heartbeat watchdog + `reader.cancel()`, route `submit_visit`/`dc_control_command` to primary active match tab only (fixes multi-tab conflicts), wrap async `sendResponse` in `try/catch`, escape popup HTML
- [x] `src/services/dartCounterBridge.ts`, `src/store/useOnlineMatchStore.ts`, `src/hooks/useOnlineMatchSync.ts`, `src/components/remote/DartCounterRemoteScreen.tsx`: hoist submission mutex/timer state to module scope + iPad submit debounce (fixes duplicate submissions), preserve pre-checkout `turnStartRemaining` on 1-dart leg wins, gate `useOnlineMatchSync` on player's turn, guard `Number.isFinite` remaining values, stop persisting `isActive: true` when `source === 'dartcounter'`

---

## Phase 2 — Eliminate Hangs, Leaks & Gameplay Edge Bugs *(Completed)*

Goal: Resolve socket churn, iPad PWA performance/sleep-wake issues, boot screen loops, remove all kiosk audio/Web Audio overhead, and fix game undo/lifecycle edge bugs.

### 2A. Network, Boot & Bridge Lifecycle
- [x] `src/services/localBoardManager.ts`: add `pollInFlight` lock, 1.5s `AbortController` timeout, abort on `disconnect()`, and exponential offline backoff when port `3180` is unreachable (eliminates 381 `TIME_WAIT` socket churn and 6-socket HTTP/1.1 deadlock)
- [x] `src/components/layout/KioskBootScreen.tsx` & `src/App.tsx`: store `onComplete` in a ref (`[]` deps + `hasStartedRef`), guard `info?.interfaces?.[0]?.url` & `!isDartCounterClippingDisabled()`, deduplicate double `hydrateVault()`/`loadSavedClips()`, and use narrow selectors on `useSettingsStore`
- [x] `src/services/remoteBridge.ts` & `src/services/devLogger.ts`: store `isLocalConnected`/`connectedRemotes` in refs so SSE streams & store subscriptions don't tear down on board flicker; skip idle `/api/dev/health` & `/api/remote/state` posts when 0 listeners connected; stop re-scanning disk clips on every `presence` event

### 2B. iPad Oche Deck & UI Performance/Leak Fixes
- [x] `src/components/remote/MobileRemoteView.tsx` & `GameCompanionScreen.tsx`: mount only active breakpoint (`matchMedia`) instead of double-mounting iPad + Phone DOMs; move `recentClips` out of 60ms SSE push (fetch on demand via `clipsRevision`); force-reopen `EventSource` on `visibilitychange`/`pageshow`/`online` with backoff + monotonic `updatedAt` guard; clear all timers on unmount; add full optional chaining & safe number formatters; respect `replayErrorEpoch`; remove audio/SFX toggle buttons
- [x] `src/components/layout/SettingsModal.tsx`, `Header.tsx`, `Modal.tsx`, `DevConsoleQrModal.tsx`, `MobileDevConsoleView.tsx`: fix detached `<video>` `srcObject` leak, whole-store subscriptions while closed, impure `setPin` updaters, missing `useEffect` deps, uncleaned timers, remove audio capture toggle, and replace blocking `alert()`/`confirm()`
- [x] `src/components/dartboard/` & Dashboard Widgets (`DartPlotOverlay.tsx`, `SvgDartboard.tsx`, `TrendSparklineWidget.tsx`, `CareerStreakWidget.tsx`, `LiveMatchWidget.tsx`, `CareerVaultModal.tsx`): guard `NaN` coords/segments, scope SVG `<defs>` with `useId()`, fix `animate-ping` transform origin, reduce per-cluster GPU repaints, sanitize Recharts domain, add midnight rollover to `CareerStreakWidget`, validate vault JSON import

### 2C. Remove All Kiosk Audio + Games & Replay Edge Bugs
- [x] **Remove all kiosk audio:** Strip all `AudioContext` / Web Audio oscillator logic from `src/games/utils/soundEngine.ts` (silent no-op), remove mic/audio capture (`audio: false`) from `ocheCamService.ts` / `useReplayStore.ts` / `SettingsModal.tsx`, force `muted` on `<video>` in `ActionReplayOverlay.tsx` & `ReplayGalleryModal.tsx`, and remove SFX/Audio UI pills & toggles (`GameHost.tsx`, `GameCompanionScreen.tsx`, `MobileRemoteView.tsx`)
- [x] `GameHost.tsx` & `useGameStore.ts`: clear `activeController` on finish/launch, guard `completeMatch` against double execution, keep game mounted during `paused`, enforce `roster.length >= game.minPlayers`, and remove stale audio controls
- [x] Fix Undo `turnStartRef` corruption across the 11 affected game/practice modules (`{ state, turnStartState }` history snapshots) + resync `gameEventBus.resetVisitBuffer()` on Undo/Restart
- [x] Fix `ActionReplayOverlay.tsx` `<video>` muted autoplay + `onError` + src teardown, `useReplayAutoTrigger` mid-capture 180 upgrade, `Checkout 121` 2-dart Bull routes, and `Scoring Gauntlet` early-takeout stats

---

## Phase 3 — Hardening, Cleanup & Permanent Automated Tests *(Completed)*

Goal: Harden parsers/storage against malformed inputs, clean up temporary dev hooks, and establish a permanent `vitest` regression suite.

### 3A. Input, Storage & Engine Hardening
- [x] Harden `parseAutodartsThrow` & `handleStateSnapshot` (`src/services/localBoardManager.ts`): `Number.isFinite` clamping, non-negative bounds, `null` payload guards, empty `{}` throw `isOutside: true` (`multiplier: 0`)
- [x] Harden `src/lib/careerEngine.ts`: validate `YYYY-MM-DD` date keys (eliminates `"NaN-NaN-NaN"` infinite-loop hazard in `computeStreaks`) and sanitize `NaN` throw scores
- [x] Create shared `safeLocalStorage` helper and wire it into all 4 persisted Zustand stores (`usePlayerStore`, `useOnlineMatchStore`, `useGameStore`, `useSettingsStore`) + sync newer local vault back to disk in `useCareerStore.hydrateVault()` + flush `diskSaveTimer` on unload
- [x] Add empty-roster defensive guards (`players.length === 0`) to the 11 arcade game engines & UIs

### 3B. Cleanup & Permanent Test Suite (`vitest`)
- [x] Remove the 6 temporary `[DEV-TEST]` replay hooks once Oche-Cam verification is complete (kept PIN `0161` Dev Console diagnostic trigger cleanly without user-facing `DEV-TEST` UI banners)
- [x] Install `vitest` and add `"test": "vitest run"` to `package.json`
- [x] Commit automated regression test suites covering `localBoardManager`, `careerEngine`, `usePlayerStore`/`dashboardPersistence`, and all 20 pure game/practice engines (`87` tests passing)

---

## Phase 4 — Collaborative UI Redesign (Data-Safe Design Sprint) *(Next Up — See `PHASE_4_UI_REDESIGN.md`)*

Goal: Work together interactively to redesign the Kiosk TV (`1080×1920` portrait + landscape) and iPad Oche Deck (`/?remote=1`) interfaces, talking through layout, visual hierarchy, and ergonomics while mapping every design change against existing stores, telemetry, and persisted data schemas (`career-vault.json`, `dashboard-state.json`, game engines, DartCounter bridge) to guarantee zero data loss or broken integrations.

### 4A. Discovery & Data Contract Alignment
- [ ] Walk through current pain points, screen layouts, and visual goals for Kiosk Dashboard, Games/Practice Arenas, DartCounter handoff, and iPad Oche Deck
- [ ] Audit existing data schemas & store contracts (`usePlayerStore`, `useCareerStore`, `useLiveBoardStore`, `useGameStore`, `useOnlineMatchStore`, `useLayoutStore`, `RemoteKioskState`) to verify which fields are persisted and must remain backwards-compatible
- [ ] Agree on a safe UI specification & wireframe/component plan before writing code

### 4B. Phased, Data-Safe UI Implementation
- [ ] Redesign Kiosk TV views (Dashboard Bento Grid, Header, Games/Practice Lobbies, Podium & Overlays) without breaking existing store/persistence contracts
- [ ] Redesign & modularize the iPad Oche Deck (`MobileRemoteView` & `GameCompanionScreen` & `DartCounterRemoteScreen`) into clean, fast, focused components
- [ ] Verify backwards compatibility with existing `data/career-vault.json` and `data/dashboard-state.json`, plus full `npm run build` and test suite pass
