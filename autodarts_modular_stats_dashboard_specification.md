# App Specification: Autodarts Modular Stats Dashboard

## 1. Overview & Purpose
A modern, portrait-first React web application designed to run on a dedicated vertical side monitor next to a Winmau / Autodarts setup. It displays live and historical player statistics in a clean, glanceable, modular dashboard ("bento grid") style.

While initially focused on a single primary player ("My Stats"), the architecture is built from day one to support switching between players or adding multi-player comparison widgets later.

---

## 2. Target Display & UX Philosophy
* **Primary Display:** Vertical (portrait) 1080×1920 monitor positioned next to the dartboard.
* **Glanceability (3-Meter Rule):** High-contrast typography, generous padding, and tabular numbers (`font-variant-numeric: tabular-nums`) so stats are legible from the oche without squinting.
* **Aesthetic Direction ("Easy on the Eye"):**
  * Deep slate/charcoal dark mode (`#0B0F17` canvas, `#131A26` elevated glass/matte cards, subtle `1px solid rgba(255,255,255,0.06)` borders) to prevent glare in a dimly lit darts room.
  * Muted emerald (`#10B981`) for positive trends / checkouts / live connection status, crimson/rose (`#F43F5E`) for misses or drops, and warm amber (`#F59E0B`) for 100+ / 140+ / 180 highlights.
  * Smooth, non-distracting micro-animations when new darts land or averages update.
* **Responsive Fallback:** Portrait-first vertical stack (2-column bento grid on 1080px width), automatically expanding to a 3–4 column grid on landscape displays.

---

## 3. Tech Stack
* **Frontend:** React 19 + TypeScript + Vite
* **Styling:** Tailwind CSS v4 + `lucide-react` icons
* **Data Visualization:** `recharts` (for trend sparklines, checkout bars, and segment distributions) + Custom SVG Dartboard component (for live `(x, y)` coordinate heatmaps)
* **Grid / Modularity:** Configurable modular widget registry (show/hide, reorder, and resize widgets persisted in `localStorage`)
* **State & Data Fetching:** TanStack Query (`@tanstack/react-query`) + Zustand (for dashboard layout, active player selection, and live WebSocket state)
* **Auth (Cloud API):** `oidc-client-ts` (OAuth 2.0 Authorization Code + PKCE)
* **Local Proxy / Dev Server:** Lightweight Node.js / Express (or Vite server proxy) running alongside the React app to:
  1. Avoid browser CORS issues when communicating with `api.autodarts.io`.
  2. Bridge/persist local Board Manager telemetry into local storage/JSON if desired.

---

## 4. Data Sources & Integration Architecture

The app must implement a **Data Provider Abstraction Layer** supporting three seamless modes (toggleable in Settings):

### A. Live Local Board Manager API (Zero-Auth, Immediate Use)
Runs directly on the darts PC via Autodarts Desktop / Board Manager on port `3180`:
* **WebSocket Stream:** `ws://127.0.0.1:3180/api/events`
* **HTTP Poll Fallback:** `GET http://127.0.0.1:3180/api/state`
* **Payload Details:**
  * Emits `{ "type": "state", "data": { connected, running, status, event, numThrows, throws: [...] } }`.
  * Each throw contains `segment: { name, number, bed, multiplier }` and optional `coords: { x, y }`.
  * **Coordinate System:** Bull-centered polar/Cartesian coordinates where `(0, 0)` is the bullseye, radius `1.0` is the outer double wire, `+x` is right, and `+y` is up. Values `> 1.0` are misses; bounce-outs have `bouncer: true` and no `coords`.
  * **Diffing Logic:** Because the local API sends full state snapshots (up to 3 darts) rather than discrete throw events, the app must diff consecutive snapshots and handle mid-visit dart corrections cleanly.

### B. Autodarts Cloud API (Career Stats & Multi-Player)
Uses Autodarts' OAuth 2.0 / OIDC service (replacing legacy Keycloak):
* **OIDC Discovery:** `https://api.autodarts.io/.well-known/openid-configuration`
* **Auth Flow:** Authorization Code + PKCE via `oidc-client-ts` (Public Client).
  * Authorize: `https://api.autodarts.io/auth/v1/oauth/authorize`
  * Exchange: `https://api.autodarts.io/auth/v1/exchange`
  * Refresh: `https://api.autodarts.io/auth/v1/refresh` (15-min access token, 30-day rotating refresh token)
  * User Info: `https://api.autodarts.io/auth/v1/userinfo`
* **REST & WebSocket Endpoints (proxied to prevent CORS issues):**
  * User/Match Stats: `https://api.autodarts.io/as/v0/users/{userId}`, `https://api.autodarts.io/as/v0/matches/{matchId}/stats`
  * Match State: `https://api.autodarts.io/gs/v0/matches/{matchId}/state`
  * Live Cloud Events: `wss://api.autodarts.io/ms/v0/subscribe` (channels: `autodarts.boards`, `autodarts.matches`, `autodarts.users`)
* **Configuration:** Reads `VITE_AUTODARTS_CLIENT_ID` and `VITE_AUTODARTS_REDIRECT_URI` from `.env`. Gracefully prompts setup instructions if not configured.

### C. Built-In Demo / Simulator Mode
* Includes a realistic mock data generator + "Simulate Throw" button so the dashboard can be developed, styled, and tested without throwing darts or having cloud credentials ready.

---

## 5. Modular Dashboard Widgets (v1)

Every widget must be a self-contained component registered in a central `widgetRegistry.ts`, supporting toggle visibility, drag/button reordering, and compact/expanded sizing:

1. **Header & Connection Pill (Pinned Top)**
   * Active Player Switcher (defaults to "My Stats", ready for friend/guest profiles).
   * Live status indicators: `Local Board: Connected` / `Cloud API: Synced` / `Demo Mode`.
   * Quick access to Layout Customizer and Settings drawer.
2. **Hero KPI Strip (2×2 Bento Block)**
   * **3-Dart Average** (Session vs. All-Time delta badge)
   * **First 9 Average**
   * **Checkout %** (with Hits / Attempts subtitle)
   * **Highest Checkout** (or Highest Visit)
3. **Live Visit & Throw Tracker**
   * Displays the current 3-dart visit as large pill badges (e.g., `T20`, `S20`, `T19` → `137`), updating live from the local WebSocket.
4. **Interactive SVG Dartboard Heatmap**
   * Plots live and session dart coordinates `(x, y)` onto an accurate vector dartboard.
   * Toggle between **Dot Plot** (recent darts) and **Density Heatmap** (glowing cluster zones) to visualize grouping and drift.
5. **Scoring Power Breakdown (Ton+ Counter)**
   * Clean horizontal bar/pill breakdown of `60+`, `100+`, `140+`, and `180` visits.
6. **Average Trend Sparkline**
   * Smooth area chart showing 3-dart average progression across the last 10–20 matches/sessions.
7. **Doubles & Trebles Accuracy Module**
   * Quick-glance hit rates for favorite targets (`T20`, `T19`, `D20`, `D16`, `D8`, `Bull`).
8. **Recent Matches / Sessions Feed**
   * Compact scrollable list showing opponent/mode, result, 3DA, and best leg.

---

## 6. Multi-Player Extensibility (Future-Ready)
* All data models must be keyed by `playerId: string`.
* Store a `players` array in state (defaulting to the primary user).
* Include a clean placeholder in the Player Switcher (`+ Add Player / Compare`) so adding friends' Autodarts usernames or guest profiles later requires zero refactoring of the widget layer.

---

## 7. Non-Functional Requirements
* **Always-On Reliability:** Automatic exponential backoff reconnection for WebSockets; zero memory leaks over multi-hour sessions.
* **Kiosk Friendly:** Works cleanly in Chromium/Edge Fullscreen (`F11`) with hidden scrollbars unless hovered.
* **Local Persistence:** Save widget layout, theme accents, and local-board session stats in `localStorage` (with JSON export/import).