# Workspace Instructions for AGY CLI

## Session Start Routine (Always Follow)
1. **Read `todo.md` first** at the beginning of every new session in this repository to load the current project summary, tech stack, directory architecture, and active task checklist.
2. When a task involves creating, modifying, or debugging any modular dart game, **read and strictly follow `GAMES_DEVELOPMENT_GUIDE.md`** before writing code.

## Project Conventions & Guardrails
* **Stack:** React 19 + TypeScript (strict) + Vite 6 + Tailwind CSS v4 + Zustand 5 + `lucide-react`.
* **Target Display:** Portrait-first **1080×1920 vertical kiosk monitor** next to a dartboard (3-meter / 8-foot glanceability rule), with clean responsive expansion on wide `xl:` landscape displays.
* **Visual System:** Dark-room matte theme (`#0B0F17` canvas, `.card-matte` cards, high-contrast typography, `tabular-nums` + `font-mono` for live scores).
* **Live Hardware Integration:** Keep the single persistent Autodarts Desktop connection (`LocalBoardManagerService` on port `3180`) in `src/App.tsx`. Modular games must consume dart telemetry exclusively via `useGameBoardEvents` / `gameEventBus` — never open duplicate WebSockets.
* **Verification:** Always run `npm run build` (`tsc -b && vite build`) after edits and verify zero TypeScript or bundle errors before concluding.
* **Keep `todo.md` Current:** When finishing a feature or plugging a new game into `src/games/gameRegistry.ts`, check off the corresponding item in `todo.md` and note any new follow-ups.
