# Modular Tech Darts Games — AI Development Guide & Specification

> **Purpose:** This document is the authoritative blueprint for building modular social darts games (inspired by **Flight Club** and **Roxy Ballroom Tech Darts**) that plug directly into the Autodarts Modular Dashboard's **Game Socket**.
>
> **How to use with AGY CLI:**
> ```text
> Build the "<Game Name>" modular game (id: "<game-id>") following GAMES_DEVELOPMENT_GUIDE.md and plug it into src/games/gameRegistry.ts.
> ```

---

## 1. Visual & UX Philosophy (Flight Club / Roxy Ballroom Standard)

Every game built for this app runs on a **dedicated portrait 1080×1920 kiosk monitor** mounted next to a Winmau/Autodarts dartboard (with responsive fallback for 16:9 landscape screens). Treat it like a **social entertainment venue screen**, not a spreadsheet.

### Core Design Rules
1. **The 3-Meter / 8-Foot Glanceability Rule**
   * Players stand 2.37m (7' 9¼") away at the oche. Never bury critical info in tiny text.
   * Active player's name, current target/objective, lives/score, and 3-dart visit pills MUST be readable in under 0.5 seconds from across the room.
   * Always apply `tabular-nums` (`font-variant-numeric: tabular-nums`) and `font-mono` to all changing scores, counters, and timers so digits never jitter.
2. **Dark-Room Matte Aesthetic (Consistent with Main Dashboard)**
   * Canvas: `#0B0F17`
   * Elevated cards: `.card-matte` (`#141D2B`, crisp `1px` light border, soft depth shadow)
   * Neon gameplay accents:
     * **Emerald (`#10B981`)** — Safe zones, active turn, checkouts, positive hits, ladders
     * **Amber (`#F59E0B`)** — Trebles, Killer status, warnings, takeout prompts, 100+ bursts
     * **Rose (`#F43F5E`)** — Lava hazards, eliminations, busts, misses, snakes
     * **Sky (`#38BDF8`)** — Secondary objectives, info pills, player accents
     * **Purple (`#A855F7`)** — Instant-win specials (Shanghai, combos, jackpots)
3. **High-Drama Micro-Feedback ("Venue Juice")**
   * Every impactful throw should trigger a brief, unmistakable **full-width or overlay Callout Banner** (1.2s–1.8s auto-dismiss): e.g., `"🔥 LAVA HIT! -1 LIFE"`, `"💀 KILLER UNLOCKED!"`, `"👑 SHANGHAI! INSTANT WIN!"`, `"💥 BUST!"`, `"🎱 36 BREAK!"`.
   * Pair visual callouts with `soundEngine` cues (`playDartHit`, `playBonusHit`, `playJackpot`, `playHazard`, `playElimination`, `playTurnChange`, `playVictory`).
4. **Clear Board-Pacing Prompts**
   * When `boardStatus === 'takeout'` (or 3 darts are in the board), display a prominent amber pill: **`PULL DARTS FOR NEXT TURN`** (plus a clickable fallback button in case the user is playing/testing without a physical board).
5. **Portrait-First Layout Structure**
   * **Top strip:** Active Turn Spotlight (Active Player color halo, Round indicator, current objective, 3-dart visit slots).
   * **Centerpiece:** Interactive `SvgDartboard` with live `segmentOverlays` + `DartPlotOverlay` (or custom game board such as the Snakes & Ladders grid / Donkey Derby track alongside a compact dartboard).
   * **Bottom / Side Grid:** Multiplayer Scoreboard Cards (2-column grid on portrait, side column on `xl:` landscape), clearly highlighting the active player's card and dimming eliminated players.

---

## 2. Architecture & Plug-In Socket Overview

The shell already manages the single persistent Autodarts WebSocket connection (`ws://127.0.0.1:3180/api/events` + HTTP `/api/state` fallback), Lobby navigation, Player Roster setup, Match Settings UI, Undo/Restart chrome, Virtual Test Throw Bar, and Victory Podium.

**A new game cartridge NEVER needs to open a WebSocket, build a player picker, or build a victory screen.**

```
Autodarts Desktop (WS/HTTP) ─┐
                             ├──► useLiveBoardStore ──► gameEventBus ("The Socket")
Demo / Virtual Throw Bar ────┘                                │
                                                              ▼
                                                  useGameBoardEvents(...)
                                                              │
Header (Gamepad2) ──► GamesLobby ──► GameHost ──► [ YOUR GAME MODULE ]
                                     (Setup / Chrome / Podium)
```

### Key Existing Files (Do Not Duplicate)
| File | Responsibility |
| :--- | :--- |
| `src/types/darts.ts` | Authoritative `DartThrow`, `DartSegment`, `DartBedType`, `DartCoords` types |
| `src/types/games.ts` | Modular game contracts (`GameDefinition`, `GameModuleProps`, `GamePlayer`, `GameResult`, `GameModuleController`) |
| `src/services/gameEventBus.ts` | Snapshot-diffing event bus emitting `dart_thrown`, `dart_corrected`, `visit_completed`, `board_status` |
| `src/games/hooks/useGameBoardEvents.ts` | React hook your game uses to receive live dart events safely |
| `src/games/gameRegistry.ts` | Central game registry where cartridges are plugged in |
| `src/games/components/GameHost.tsx` | Host shell managing Setup → Playing → Victory Podium + Undo/Restart/Test Throws |
| `src/games/utils/soundEngine.ts` | Zero-dependency Web Audio arcade SFX engine |
| `src/components/dartboard/SvgDartboard.tsx` | Shared vector dartboard supporting `segmentOverlays` and `dimInactiveSegments` |
| `src/components/dartboard/DartPlotOverlay.tsx` | Plots live `(x, y)` dart markers onto `SvgDartboard` |

---

## 3. Required Folder Structure for Every Game

Create a self-contained folder under `src/games/<game-id>/` matching the slug in `src/games/gameRegistry.ts`:

```text
src/games/<game-id>/
  ├── types.ts             # Internal game state, player state, callout & history snapshot types
  ├── engine.ts            # PURE TypeScript game engine (initState, applyDart, advanceTurn, buildGameResult)
  ├── <GameName>Game.tsx   # React UI component implementing GameModuleProps
  └── index.ts             # Clean barrel export of the root component
```

### Golden Rule: Pure Engine + State Snapshot Stack
Keep **100% of game rules** inside `engine.ts` as pure functions:
```ts
export function createInitialState(players: GamePlayer[], config: GameMatchConfig): GameState
export function applyDartToState(state: GameState, dart: DartThrow): { nextState: GameState; feedback: DartFeedback }
export function advanceTurn(state: GameState): GameState
export function buildGameResult(state: GameState, startedAt: number): GameResult
```
**Why this matters:**
1. **Undo** becomes trivial: push `state` onto a `historyStack: GameState[]` before every dart or turn advance; pop to undo!
2. **Autodarts Mid-Visit Corrections (`dart_corrected`)** become rock-solid: store `turnStartState: GameState` at the start of each player's visit. If Autodarts corrects Dart 1 or Dart 2 mid-visit, simply replay `visitThrows` cleanly from `turnStartState` using `applyDartToState`! Zero drift, zero double-scoring bugs!

---

## 4. Exact Plug-In Contract (`GameModuleProps`)

Your root component (`<GameName>Game.tsx`) receives these exact props from `GameHost`:

```ts
export interface GameModuleProps {
  players: GamePlayer[];                // Ordered turn roster (id, name, colorHex, avatarInitial)
  config: GameMatchConfig;              // User-selected setup values from game.configOptions
  soundEnabled: boolean;                // Pass into soundEngine.play*(soundEnabled)
  isBoardConnected: boolean;            // True if local Autodarts Desktop is connected
  boardStatus: string;                  // 'throw' | 'takeout' | 'waiting'
  currentVisitThrows: DartThrow[];      // Current darts physically sitting in the board
  onGameComplete: (result: GameResult) => void;
  registerController: (controller: GameModuleController) => void;
  onCanUndoChange?: (canUndo: boolean) => void;
}
```

### Registering Undo & Restart with `GameHost`
Inside your game component, always wire `registerController` and `onCanUndoChange`:
```tsx
useEffect(() => {
  registerController({
    undoLastAction: handleUndo,
    canUndo: () => history.length > 0,
    restartMatch: handleRestart,
  });
}, [registerController, handleUndo, handleRestart, history.length]);

useEffect(() => {
  onCanUndoChange?.(history.length > 0);
}, [history.length, onCanUndoChange]);
```

---

## 5. Subscribing to Live Autodarts Events (`useGameBoardEvents`)

Use `useGameBoardEvents` inside your game component to receive sub-50ms dart telemetry from BOTH a physical Autodarts board and the `GameHost` Virtual Throw Bar:

```tsx
useGameBoardEvents({
  enabled: !state.isFinished,
  onDartThrown: (dart, dartIndex, visitThrows) => {
    // 1. Guard: ignore if current turn already finished (e.g. bust or 3 darts already processed)
    // 2. Push current state to historyStack
    // 3. Run applyDartToState(state, dart)
    // 4. Trigger soundEngine + Callout banner
    // 5. If nextState.isFinished -> call onGameComplete(buildGameResult(nextState, startedAt)) immediately!
  },
  onDartCorrected: (_dart, _prevDart, _dartIndex, visitThrows) => {
    // Replay visitThrows cleanly from turnStartState so camera corrections never corrupt scores!
  },
  onVisitCompleted: () => {
    // Darts have been pulled from the board (takeout finished).
    // If the turn hasn't already ended the game, advanceTurn() -> next active player!
  },
});
```

### Mandatory Edge Cases Every Game Must Handle
1. **Instant-Win Darts (Before Takeout):** If Dart 1 or Dart 2 wins the game (e.g., last opponent eliminated in Killer, winning double in Demolition, instant Shanghai, reaching square 100), trigger `onGameComplete(result)` immediately (after a brief ~700ms beat for the winning callout/animation) — do NOT force the player to wait for takeout.
2. **Bouncers & Misses:** Check `dart.bouncer || dart.score === 0 || dart.segment.bed === 'Outside'`. A miss still consumes 1 of the player's 3 darts for that visit.
3. **Bullseye Normalization:** Autodarts inner bull has `dart.segment.name === 'Bull'` (`score === 50`, `bed === 'InnerBull'`). Outer bull has `dart.segment.name === '25'` (`score === 25`, `bed === 'Bull'`). Note that `segment.number` may be `25` or `50` depending on source — always check `dart.score === 50` or `dart.segment.bed === 'InnerBull'` for Inner Bull, and `dart.score === 25` for Outer Bull.
4. **Mid-Visit Corrections:** Always keep `turnStartState` and replay `visitThrows` on `onDartCorrected`.
5. **Click-to-Throw Support on `SvgDartboard`:** Wire `SvgDartboard`'s `onBoardClick` prop so players/testers can optionally click any segment on the SVG dartboard to inject a throw during testing (`coordsToSegment(x, y)` → `gameEventBus.injectManualDart(...)`) when `!isBoardConnected`!
6. **Practice Stats Isolation:** `useLiveBoardStore` automatically pauses practice 3DA stat recording while `activeView === 'game-active' && matchPhase === 'playing'`. Games never need to touch `usePlayerStore`.

---

## 6. Using Shared Primitives

### A. Highlighting Segments on `SvgDartboard`
`SvgDartboard` supports dynamic multi-segment overlays via `segmentOverlays` and `dimInactiveSegments`:

```tsx
import { SvgDartboard, SegmentOverlayStyle } from '../../components/dartboard/SvgDartboard';
import { DartPlotOverlay } from '../../components/dartboard/DartPlotOverlay';

const overlays: Record<string, SegmentOverlayStyle> = {
  '20': { fill: '#F43F5E', opacity: 0.78, pulse: true, badge: '🔥' }, // Whole wedge (S+D+T)
  'D16': { fill: '#10B981', opacity: 0.9, stroke: '#FFFFFF', pulse: true }, // Specific bed
  'Bull': { fill: '#38BDF8', opacity: 0.9, pulse: true }, // Inner Bull
  '25': { fill: '#38BDF8', opacity: 0.65 }, // Outer Bull
};

<SvgDartboard
  size={460}
  segmentOverlays={overlays}
  dimInactiveSegments={true}
>
  <DartPlotOverlay
    sessionThrows={[]}
    currentVisitThrows={currentVisitThrows}
    mode="dots"
  />
</SvgDartboard>
```

### B. Arcade Sound Cues (`soundEngine`)
```ts
import { soundEngine } from '../utils/soundEngine';

soundEngine.playDartHit(soundEnabled);      // Standard single
soundEngine.playBonusHit(soundEnabled);     // Double, treble, ladder, killer charge
soundEngine.playJackpot(soundEnabled);      // Bullseye, Shanghai, 180, big break
soundEngine.playHazard(soundEnabled);       // Lava hit, bust, miss foul, halve-it penalty
soundEngine.playElimination(soundEnabled);  // Player knocked out
soundEngine.playTurnChange(soundEnabled);   // Next player up
// Note: playVictory is automatically triggered by GameHost on onGameComplete!
```

---

## 7. Plugging the Completed Game into `gameRegistry.ts`

Once your game folder `src/games/<game-id>/` is complete:
1. Open `src/games/gameRegistry.ts`.
2. Import your root component:
   ```ts
   import { BoardIsLavaGame } from './board-is-lava';
   ```
3. Update the matching `GameDefinition` entry:
   ```ts
   status: 'playable', // Changed from 'coming_soon'
   component: BoardIsLavaGame,
   ```
4. If you added or refined `configOptions`, update them in `gameRegistry.ts` so `GameHost`'s Setup phase renders them automatically.

---

## 8. Step-by-Step AI Implementation Checklist

When asked to build a game, follow these steps in exact order:

1. **Read Context First:** Inspect `src/types/games.ts`, `src/games/gameRegistry.ts`, and `src/games/components/GameHost.tsx` to verify exact field names and config keys for the target game.
2. **Design State & Rules (`types.ts` + `engine.ts`):**
   * Implement deterministic pure functions (`createInitialState`, `applyDartToState`, `advanceTurn`, `buildGameResult`).
   * Ensure all `configOptions` defined in `gameRegistry.ts` actually take effect in `engine.ts`.
   * Handle all edge cases (bouncers, misses, early-win darts, tie-breakers, player elimination turn skipping).
3. **Build the UI (`<GameName>Game.tsx`):**
   * Portrait-first 1080×1920 layout with `xl:` landscape grid adaptation.
   * Large, high-contrast active player spotlight + 3-dart visit pills.
   * Dynamic `SvgDartboard` `segmentOverlays` (plus custom visual board if applicable, e.g., Snakes & Ladders grid or Derby track).
   * Animated dramatic Callout Banner for big moments.
   * Wire `useGameBoardEvents` (`onDartThrown`, `onDartCorrected`, `onVisitCompleted`) + `registerController` (`undoLastAction`, `canUndo`, `restartMatch`).
   * Support click-on-board throw injection when `!isBoardConnected` for instant browser testing.
4. **Register in `src/games/gameRegistry.ts`:**
   * Attach `component` and set `status: 'playable'`.
5. **Verify Before Finishing:**
   * Run `npm run build` (`tsc -b && vite build`) and confirm **0 TypeScript or build errors**.
   * Verify there are no unused imports, stale closures, or infinite render loops.
   * Confirm the game supports all player counts between `minPlayers` and `maxPlayers`.

---

## 9. Game-by-Game Design Blueprints

Use these blueprints when implementing any of the 8 registered lobby games:

### 1. The Board is Lava (`board-is-lava`)
* **Core Loop:** Survival + score multiplier. Each round, `N` random segments erupt into glowing Lava (`#F43F5E` / `#F97316` pulsing overlays with `🔥` badge). Number of lava wedges scales with round number and `config.heatEscalation` (`easy`: starts 4, +1/round; `normal`: starts 6, +2/round; `hard`: starts 8, +2/round; cap at 16 wedges).
* **Scoring & Hazards:**
  * Hit a **Safe** wedge: earn `dart.score` points (safe Doubles/Trebles give a visual "SAFE BONUS!" flash).
  * Hit a **Lava** wedge: lose 1 life (`❤️`), `soundEngine.playHazard`, scorched callout (`🔥 BURNED! -1 LIFE`), 0 points for that dart. If lives hit 0, player is eliminated (`playElimination`).
  * **Bullseye Cool-Down** (`config.bullCoolsLava`): Hitting `25` or `Bull` extinguishes 1 active lava wedge for the rest of the round + awards +50 shield points!
  * **Miss/Bouncer:** Safe from lava, scores 0.
* **Win Condition:** Last surviving player wins immediately — OR if all players survive 8 rounds (or everyone burns out on the same round), highest score wins.

### 2. Killer (`killer`)
* **Core Loop:** Classic Flight Club elimination.
* **Assignment:**
  * `config.numberAssignment === 'auto'`: evenly distribute unique numbers around `SEGMENT_ORDER` so players aren't clustered next to each other.
  * `config.numberAssignment === 'throw'`: Setup round where each player throws 1 dart to claim an unclaimed number (re-throw on miss/duplicate).
* **Progression:**
  * Players start at `0` lives (`0 / maxLives`). Hit your own number to gain lives (`Single = +1`, `Double = +2`, `Treble = +3`, capped at `maxLives`).
  * Reaching `maxLives` unlocks **KILLER** (`💀` badge + amber glow + `playJackpot`).
  * While Killer, hitting any **opponent's** number strips lives (`Single = -1`, `Double = -2`, `Treble = -3`). Dropping below 0 (or to 0 after having lives) eliminates that opponent!
  * Optional `config.suicideRule`: hitting your own number while Killer deducts your own lives.
* **Dartboard Visuals:** Color-code each active player's wedge using `player.colorHex` and their 2–3 letter initial badge; add a skull/amber border when they are a Killer!

### 3. Snooker (`snooker`)
* **Core Loop:** Authentic break-building snooker frame on the dartboard.
* **Board Mapping:**
  * **Reds (1 pt):** Segments `1–10` (or remaining red count mapped cleanly on highlighted crimson wedges, e.g., `1` through `15` — always clearly shown via `segmentOverlays` with `dimInactiveSegments={true}`!).
  * **Colours:** Clearly mapped and badged on the board:
    * Yellow (2) = `2` (Yellow `#FACC15`)
    * Green (3) = `3` (Emerald `#10B981`)
    * Brown (4) = `4` (Amber/Brown `#B45309`)
    * Blue (5) = `5` (Sky `#38BDF8`)
    * Pink (6) = `6` (Pink `#EC4899`)
    * Black (7) = `7` or `Bull` (Slate/Gold `#E2E8F0` with gold ring)
* **Turn State Machine:** `targetPhase: 'red' | 'colour' | 'clearance'`.
  * Pot a Red → switches immediately to `'colour'` for the next dart in the same visit!
  * Pot a Colour → adds its value to current break, switches back to `'red'` (if reds remain) or `'clearance'` (Yellow → Green → Brown → Blue → Pink → Black in order).
  * Missing the required target ends the break (and if `config.foulPenalty` is on and all 3 darts miss, awards 4 foul points to the opponent / next player).
* **UI Highlights:** Live "Current Break" counter, glowing remaining Red/Colour balls rack, and Highest Break badge!

### 4. Demolition 501 (`demolition`)
* **Core Loop:** Fast, broadcast-grade X01 (`180`, `301`, or `501`).
* **Features:**
  * Vertical "Score Tower" bar per player that visibly demolishes downward as their remaining score drops.
  * Live **Checkout Route Calculator** for `remaining <= 170` (e.g., `121 → T20 • T11 • D14`), automatically highlighting the recommended next target bed on `SvgDartboard`!
  * Supports `config.outRule === 'straight'` (any dart hitting exact 0 wins) and `'double'` (must finish on Double or Inner Bull; leaving `1` or `< 0` busts and restores `turnStartScore`).

### 5. Shanghai (`shanghai`)
* **Core Loop:** `config.rounds` rounds (`7`, `10`, or `20`). Round `R` targets segment `R` exclusively.
* **Visuals:** Highlight only segment `R` on `SvgDartboard` with `dimInactiveSegments={true}` and a massive `"TARGET: ${R}"` banner.
* **Instant Win:** Track `{ hitSingle, hitDouble, hitTreble }` within the current visit on segment `R`. If all three become true and `config.instantWin` is enabled, fire `"👑 SHANGHAI!"` (`playJackpot`) and immediately win the match!

### 6. Snakes & Ladders (`snakes-and-ladders`)
* **Core Loop:** Visual neon 10×10 (or 8×8) board grid alongside a compact live dart readout.
* **Movement:** Each dart advances the active player by a scaled step (e.g., Single = segment value or simplified `1–6` die mapping / raw dart score capped or mapped so a 100-square game lasts 10–15 minutes — recommend **direct dart score on 100-square board with Doubles triggering Ladder Boost / Trebles triggering 1.5x or exact-hit rules**, or clearly displayed step values!). Actually: on a 100-square board, raw dart scores (average ~15/dart) would finish in 2 visits — so map darts smartly to **1–12 steps** (e.g., `Miss = 0`, `Single = 1..5` bucketed or `Math.max(1, Math.round(score / 4))`, or `Single = +2, Double = +4, Treble = +6, Bull = +8`, OR `segment.number` on a 100-square board where only hits on your chosen roll count). Even better: **Dart Value Step Mode**: Single = `Math.ceil(number / 4)` (1–5 steps), Double = `+2 bonus`, Treble = `+4 bonus`, Bull = `+10 turbo`, clearly previewed on-screen so games always hit the sweet 10–15 min pace with dramatic Snakes & Ladders swings!
* **Board:** Render crisp glowing SVG snake curves and emerald ladder rungs over the numbered tile grid with colored player tokens.

### 7. Halve It (`halve-it`)
* **Core Loop:** Escalating round gauntlet (`20`, `16`, `Any Double`, `19`, `Any Treble`, `14`, `Bull` — extended adds `18`, `15`, `D20`).
* **Rules:** Every player starts with `config.startingBank` (default `40`). Hit the round's challenge to add the dart's score. If a player finishes their 3-dart visit with **0 hits** on the round challenge, trigger `"✂️ HALVED!"` (`playHazard`) and set `score = Math.floor(score / 2)`.
* **Visuals:** Highlight all valid target beds for the current challenge on `SvgDartboard` (e.g., the entire Double ring for `"Any Double"`, the entire Treble ring for `"Any Treble"`!).

### 8. Donkey Derby (`donkey-derby`)
* **Core Loop:** Side-scrolling horizontal neon race track (2–6 lanes) paired with `SvgDartboard`.
* **Rules:** Each player is assigned a unique wedge around the board (colored to match their racing lane).
  * Hit your own wedge: Single = `+1`, Double = `+2`, Treble = `+3` furlongs.
  * Hit Bull / 25: `+2` (Bull) or `+1` (25) turbo sprint for the active thrower!
  * If `config.helpRivals` is enabled: accidentally hitting a rival's wedge advances *their* racer by `+1/+2/+3`!
* **Win Condition:** First racer to reach `config.trackLength` crosses the checkered finish line for an instant photo-finish victory!
