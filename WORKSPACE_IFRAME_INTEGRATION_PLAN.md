# Workspace Iframe Integration Plan (v2 — with code review fixes)

## Context

**The Intraday** has two separate codebases:

1. **Fin Quote** (`theintraday.com`) — Next.js 15 app on Vercel. Marketing pages, market dashboard, stock pages, economic calendar, insider trading, AI chatbot.
2. **Charting Platform** (`charts.theintraday.com`) — Express.js app on AWS EC2. Professional charting workstation with custom Canvas2D/WebGL engine, 28 technical indicators, 14 drawing tools, fundamentals workspace, overview workspace, "Why Is It Moving" AI summaries.

Both apps share the same Supabase project (database + auth) and use `.theintraday.com` cookies for shared authentication.

**Current integration:** Fin Quote's navbar has a "Charting (Beta)" tab that opens `charts.theintraday.com/tos/AAPL` in a **new browser tab**. The user leaves Fin Quote entirely. There is no iframe, no embedding, no shared navigation.

**Goal:** Embed the charting platform inside Fin Quote using an iframe so the user never leaves Fin Quote. The charting app's three views (Chart, Fundamentals, Overview) become tabs in Fin Quote's navbar. The iframe persists across all route changes so chart state (drawings, zoom, indicators) is never lost.

---

## Architecture Decision

**Approach: iframe with postMessage communication**

- Fin Quote renders an `<iframe>` that loads the charting app from EC2
- The iframe is mounted in the root layout and persists for the entire session
- Fin Quote's navbar controls which view (Chart/Fundamentals/Overview) the iframe displays via `postMessage`
- The charting app's internal view-switching buttons (Fund/Overview) are hidden in embed mode — Fin Quote's navbar replaces them
- The charting app's toolbar (ticker search, OHLC, timeframe, drawing tools, Studies, etc.) remains fully visible inside the iframe
- The charting app's theme toggle is hidden in embed mode — Fin Quote owns theme control

**Why iframe:**
- Zero rewrite of the charting platform's 38 UI modules
- EC2 deployment unchanged — same Express server, same PM2, same nginx
- The charting platform already has a postMessage protocol (`src/embed/protocol.ts`) with `SET_SYMBOL`, `SET_TIMEFRAME`, `SET_THEME` message types
- Industry standard — TradingView, Webull, and other platforms use this exact pattern

---

## Navbar Tab Changes (Fin Quote)

**Current tabs:**
```
Dashboard | Most Active | Charting (Beta) [external link] | Fundamentals Charting | Market Internals | Financials | Calendar | Insiders
```

**New tabs:**
```
Dashboard | Most Active | Chart | Fundamentals | Overview | Charting (Old) | Market Internals | Financials | Calendar | Insiders
```

Changes:
- **Remove** "Charting (Beta)" external link (was opening charts.theintraday.com in new tab)
- **Add** "Chart" → `/workspace/chart` (iframe, charting app price view)
- **Add** "Fundamentals" → `/workspace/fundamentals` (iframe, charting app fundamentals view)
- **Add** "Overview" → `/workspace/overview` (iframe, charting app overview view)
- **Rename** "Fundamentals Charting" → "Charting (Old)" (keeps pointing to `/charts-experiment`, preserved for comparison)
- Everything else stays the same

---

## Implementation: Fin Quote (Next.js)

### File: `components/Navigation.tsx`

**What changes:**
- Remove the `NEXT_PUBLIC_CHARTING_URL` external link block (lines 35-46)
- Add three new internal links to `navLinks` array at position 2:
  - `{ href: '/workspace/chart', label: 'Chart', match: '/workspace/chart' }`
  - `{ href: '/workspace/fundamentals', label: 'Fundamentals', match: '/workspace/fundamentals' }`
  - `{ href: '/workspace/overview', label: 'Overview', match: '/workspace/overview' }`
- Rename the "Fundamentals Charting" label to "Charting (Old)"

### File: `components/WorkspaceIframe.tsx` (new)

**Purpose:** Client component that renders the iframe and persists it across all route changes. Mounted in the root layout so it never unmounts.

**Behavior:**
- Uses `usePathname()` to detect the current route
- Derives the initial view from the first workspace route visited (`/workspace/chart` → `price`, `/workspace/fundamentals` → `fundamentals`, `/workspace/overview` → `overview`)
- Derives the initial ticker from Fin Quote's stock page context if available (e.g., if user was on `/stock/NVDA` and clicks "Chart", iframe loads `/tos/NVDA`). Falls back to `AAPL`
- On first workspace visit, creates the iframe with the correct `?view=` param in the URL — no postMessage needed for initial load (avoids race condition)
- On subsequent view switches (iframe already loaded, `READY` received), sends `SET_WORKSPACE_MODE` via postMessage
- When pathname does NOT start with `/workspace/`:
  - Hides the iframe container via CSS (`display: none`)
  - Does NOT unmount the iframe — it stays in the DOM, preserving all chart state
- When re-showing the iframe after it was hidden, sends a `REFRESH` message (or re-sends the current `SET_WORKSPACE_MODE`) so the charting engine triggers a redraw (RAF callbacks may have been paused while hidden)
- Listens for `READY` message from the iframe to know when it's initialized
- Forwards theme changes: when Fin Quote's theme toggles, sends `SET_THEME` postMessage to the iframe

**Visibility approach:**
- The iframe container is a `div` with `fixed` positioning, `top` measured dynamically via a ref on the navbar (not hardcoded), and `bottom/left/right: 0`
- When visible: `z-index: 10`, full viewport below navbar
- When hidden: `display: none` (iframe JS keeps running, WebSocket connections stay alive, all state preserved)

**postMessage format** (matches existing charting platform protocol):
```json
{
  "v": 1,
  "type": "SET_WORKSPACE_MODE",
  "payload": { "mode": "price" | "fundamentals" | "overview" }
}
```

### File: `app/layout.tsx`

**What changes:**
- Import and render `<WorkspaceIframe />` as a sibling to `{children}` inside the providers
- The iframe component is always in the DOM at the root level

```
<ThemeProvider>
  <TimezoneProvider>
    {children}
    <WorkspaceIframe />
  </TimezoneProvider>
</ThemeProvider>
```

### Files: `app/workspace/chart/page.tsx`, `app/workspace/fundamentals/page.tsx`, `app/workspace/overview/page.tsx` (new)

**Purpose:** Minimal page components for the three workspace routes. They exist so Next.js routing works and the navbar can highlight the active tab.

**Content:** Each page renders only `<Navigation />` and an empty content area. The actual content is the iframe overlay managed by `WorkspaceIframe.tsx`. The empty content area ensures the page has the right background color and doesn't show a blank white screen during iframe load.

---

## Implementation: Charting Platform (Express/EC2)

### Context for the Charting Platform

The Charting Platform is an Express.js server that generates complete HTML pages server-side. It has no frontend framework — all UI is vanilla JS generated by ~38 modules in `src/server/routes/tos-ui/`. The chart engine is a custom Canvas2D/WebGL renderer in `packages/chart-engine/`.

The app has three workspace modes accessed via buttons in the toolbar:
- **Price** — interactive candlestick chart with indicators, drawings, watchlist
- **Fund** — fundamentals workspace showing 30+ financial metrics as charts
- **Overview** — company overview with segment breakdowns and AI annotations

These are switched by buttons in a `<div class="workspace-switch">` element. The switching logic lives in `src/server/routes/tos-ui/fundamentals.ts` which manages `fundState.workspaceMode`.

The app already has a separate `/embed` route (`src/server/routes/embed.ts`) with a postMessage protocol defined in `src/embed/protocol.ts`. However, the embed route is price-chart-only (no fundamentals or overview) and uses a simplified toolbar. **We are NOT using the `/embed` route for this integration.** Instead, we are adding embed support to the main `/tos/:ticker` route.

**CRITICAL: Null check guard in fundamentals.ts (~line 348).** There is a guard clause that checks for the existence of Fund/Overview button DOM elements. If those elements don't exist in the DOM, `getElementById` returns `null`, the guard triggers, and the entire fundamentals initialization exits early — meaning `setFundWorkspaceMode()` is never defined. Therefore, **the workspace-switch buttons must remain in the DOM in embed mode** — just hidden visually with `style="display:none"`. Do NOT omit them from the HTML.

### File: `src/embed/protocol.ts`

**What changes:**
- Add new message type `SET_WORKSPACE_MODE` to the `HostMessage` type union
- Payload: `{ mode: 'price' | 'fundamentals' | 'overview' }`

**Existing protocol types for reference:**
```
Host → Embed: SET_SYMBOL, SET_TIMEFRAME, SET_THEME, (new) SET_WORKSPACE_MODE
Embed → Host: READY, ERROR, CROSSHAIR_MOVE
Message format: { v: 1, type: string, payload: object, reqId?: string }
```

### File: `src/server/routes/tos.ts`

**What changes:**

1. **Accept `embed` query parameter** on the `/tos/:ticker` route handler (~line 1631)
   - When `?embed=true` is present, pass an `embed: true` flag to the page context (`ctx`)
   - Also accept `?view=price|fundamentals|overview` for initial workspace mode (default: `price`)
   - Also accept `?theme=light|dark` to set initial theme

2. **Update `TosPageContext` TypeScript interface** to include new fields:
   ```typescript
   embed?: boolean;
   initialView?: 'price' | 'fundamentals' | 'overview';
   initialTheme?: 'light' | 'dark';
   embedAllowedOrigins?: string;
   ```

3. **Pass embed flag to all `generate*Script(ctx)` functions** so UI modules can conditionally adjust their behavior in embed mode

### File: `src/server/routes/tos-ui/fundamentals.ts`

**What changes:**

1. **Hide workspace-switch buttons visually in embed mode (keep them in the DOM)**
   - The `<div class="workspace-switch">` must still be rendered so `getElementById` doesn't return null
   - Add `style="display:none"` to the div when `ctx.embed === true`
   - The toolbar itself stays visible — only the workspace switching buttons are hidden

2. **Set initial workspace mode from query param**
   - If `ctx.initialView` is `'fundamentals'` or `'overview'`, set `fundState.workspaceMode` accordingly on initialization instead of defaulting to `'price'`

### File: `src/server/routes/tos-ui/html.ts`

**What changes:**

1. **Render workspace-switch with display:none in embed mode**
   At line 52 (approximately), instead of conditionally omitting the workspace-switch div:
   ```html
   <div class="workspace-switch" id="workspace-switch"
     ${ctx.embed ? 'style="display:none"' : ''} ...>
     ...buttons...
   </div>
   ```

2. **Add postMessage listener in embed mode**
   ```
   window.addEventListener('message', function(event) {
     // Validate origin against allowed origins from EMBED_ALLOWED_ORIGINS env var
     var allowedOrigins = '${ctx.embedAllowedOrigins || ''}'.split(',').filter(Boolean);
     if (allowedOrigins.length > 0 && allowedOrigins.indexOf(event.origin) === -1) return;

     // Parse message using existing protocol validation
     // Handle SET_WORKSPACE_MODE:
     //   - Call setFundWorkspaceMode(payload.mode) — same function the button click handlers use
     //   - This includes showing/hiding containers, loading data if needed
     // Handle SET_SYMBOL (reuse existing ticker change logic)
     // Handle SET_THEME (reuse existing theme toggle logic)
   })
   ```
   The postMessage listener must reuse the **exact same internal functions** that the Fund/Overview button click handlers call. No new switching logic — just a new trigger mechanism.

3. **Send READY message** when the page has finished initializing:
   ```
   if (window !== window.parent) {
     window.parent.postMessage({ v: 1, type: 'READY' }, '*')
   }
   ```
   Sending READY with `'*'` is acceptable (non-sensitive announcement). The **receive side** validates origins.

4. **Hide "View on The Intraday" link in embed mode** (user is already on The Intraday)

5. **Hide "Sign In" button in embed mode** (auth is handled by Fin Quote's navbar)

6. **Hide charting app's theme toggle in embed mode** (Fin Quote owns theme control via postMessage)

### Environment Variable: `EMBED_ALLOWED_ORIGINS`

**Add to `.env` / `.env.local`:**
```
EMBED_ALLOWED_ORIGINS=https://theintraday.com,https://www.theintraday.com
```

In dev, add `http://localhost:3001` (or whatever port Fin Quote dev runs on).

Parse in `tos.ts`, pass as `ctx.embedAllowedOrigins`. Used by the postMessage listener to validate incoming messages.

---

## How It All Works Together

### User Flow

1. User visits `theintraday.com/dashboard` — sees Fin Quote dashboard, navbar at top, no iframe loaded yet
2. User clicks **"Chart"** in the navbar
3. Fin Quote navigates to `/workspace/chart` — the page renders Navigation + empty content
4. `WorkspaceIframe` detects the route change, creates iframe with URL: `charts.theintraday.com/tos/AAPL?embed=true&view=price&theme=dark`
5. Charting app renders: full toolbar (ticker search, OHLC, timeframe, drawing tools, Studies) + candlestick chart + watchlist. No Fund/Overview buttons visible. No theme toggle visible.
6. Charting app sends `READY` message to parent
7. User clicks **"Fundamentals"** in Fin Quote's navbar
8. Fin Quote navigates to `/workspace/fundamentals`
9. `WorkspaceIframe` (iframe already loaded, READY received) sends `postMessage({ v:1, type: 'SET_WORKSPACE_MODE', payload: { mode: 'fundamentals' } })`
10. Charting app receives message, validates origin, calls `setFundWorkspaceMode('fundamentals')` — same as clicking Fund button internally
11. User clicks **"Dashboard"** in navbar
12. Fin Quote navigates to `/dashboard` — WorkspaceIframe hides iframe (`display:none`)
13. Dashboard renders normally
14. User clicks **"Chart"** again
15. WorkspaceIframe shows the iframe again, sends a refresh message — chart re-renders with all previous state intact (drawings, zoom, indicators)

### Communication Flow

```
Fin Quote (Vercel)                    Charting Platform (EC2)
─────────────────                     ──────────────────────

layout.tsx
  └─ WorkspaceIframe
       │
       ├─ renders <iframe src="charts.theintraday.com/tos/AAPL?embed=true&view=price">
       │                              │
       │                              ├─ Loads full /tos page with embed=true
       │                              ├─ Hides workspace-switch buttons (display:none, still in DOM)
       │                              ├─ Hides theme toggle, Sign In, "View on The Intraday"
       │                              ├─ Adds postMessage listener (validates origin)
       │                              └─ Sends READY message ──────────────────┐
       │                                                                       │
       ├─ Receives READY ◄─────────────────────────────────────────────────────┘
       │
       ├─ User clicks "Fundamentals" in navbar
       │   └─ postMessage SET_WORKSPACE_MODE {mode:'fundamentals'} ───────────┐
       │                                                                       │
       │                              ├─ Receives message, validates origin ◄──┘
       │                              ├─ Calls setFundWorkspaceMode('fundamentals')
       │                              └─ Renders fundamentals workspace
       │
       ├─ User toggles theme in Fin Quote navbar
       │   └─ postMessage SET_THEME {theme:'light'} ─────────────────────────┐
       │                                                                       │
       │                              ├─ Receives message ◄───────────────────┘
       │                              └─ Switches to light theme
       │
       ├─ User navigates to /dashboard
       │   └─ iframe hidden (display:none), state preserved
       │
       └─ User navigates back to /workspace/chart
           ├─ iframe shown again
           └─ sends refresh so RAF-based rendering resumes
```

---

## What Does NOT Change

- EC2 deployment (same server, PM2, nginx, Cloudflare)
- The standalone `charts.theintraday.com/tos/AAPL` experience (visiting directly still works as before — Fund/Overview buttons visible, theme toggle visible, Sign In visible)
- The chart engine, indicators, drawings, watchlist
- The charting app's ticker search in its toolbar
- The fundamentals data pipeline, WISM pipeline, overview system
- Supabase tables, auth, shared cookies
- Any other Fin Quote pages (dashboard, stock, calendar, etc.)

---

## Files Modified/Created Summary

### Fin Quote

| File | Action | Description |
|------|--------|-------------|
| `components/Navigation.tsx` | Modify | Remove external Charting (Beta) link, add Chart/Fundamentals/Overview tabs, rename Fundamentals Charting to Charting (Old) |
| `components/WorkspaceIframe.tsx` | Create | Persistent iframe component with postMessage communication, dynamic initial view/symbol, theme sync, refresh on re-show |
| `app/layout.tsx` | Modify | Add WorkspaceIframe to root layout |
| `app/workspace/chart/page.tsx` | Create | Minimal page (Navigation + empty content) |
| `app/workspace/fundamentals/page.tsx` | Create | Minimal page (Navigation + empty content) |
| `app/workspace/overview/page.tsx` | Create | Minimal page (Navigation + empty content) |

### Charting Platform

| File | Action | Description |
|------|--------|-------------|
| `src/embed/protocol.ts` | Modify | Add SET_WORKSPACE_MODE message type |
| `src/server/routes/tos.ts` | Modify | Accept `embed`, `view`, `theme` query params, update TosPageContext type, pass to context |
| `src/server/routes/tos-ui/fundamentals.ts` | Modify | Set initial workspace mode from query param |
| `src/server/routes/tos-ui/html.ts` | Modify | Render workspace-switch with display:none in embed mode, add postMessage listener with origin validation, send READY on init, hide Sign In / theme toggle / "View on The Intraday" in embed mode |
| `.env` / `.env.local` | Modify | Add EMBED_ALLOWED_ORIGINS |

---

## Verification

### Testing the Charting Platform changes (do first)

1. Start the charting app locally: `npm run dev`
2. Visit `http://localhost:3000/tos/AAPL?embed=true` — verify:
   - Fund/Overview workspace-switch buttons are hidden (but inspect DOM — elements must still exist)
   - Theme toggle is hidden
   - "Sign In" button is hidden
   - Toolbar (ticker search, OHLC, timeframe, drawing tools, Studies) is still visible
   - Chart renders normally
3. Visit `http://localhost:3000/tos/AAPL?embed=true&view=fundamentals` — verify fundamentals view loads directly (no flash of price view first)
4. Visit `http://localhost:3000/tos/MSFT?embed=true&view=overview` — verify overview loads for MSFT
5. Open browser console, test postMessage:
   ```js
   window.postMessage({ v: 1, type: 'SET_WORKSPACE_MODE', payload: { mode: 'overview' } }, '*')
   ```
   Verify it switches to overview view
6. Test switching back to price mode via postMessage
7. Verify standalone mode still works: visit `/tos/AAPL` (no embed param) — Fund/Overview buttons, theme toggle, Sign In should all be visible

### Testing the Fin Quote changes

1. Start Fin Quote dev server: `npm run dev` (port 3001 or whichever)
2. Start charting app dev server: `npm run dev` (port 3000)
3. Set `NEXT_PUBLIC_CHARTING_URL=http://localhost:3000` in Fin Quote's `.env.local`
4. Add `http://localhost:3001` to charting app's `EMBED_ALLOWED_ORIGINS`
5. Navigate to `/workspace/chart` — verify:
   - Fin Quote navbar shows with "Chart" tab highlighted
   - iframe loads below navbar with full charting app
   - Charting app toolbar visible, workspace-switch buttons hidden
6. Click "Fundamentals" in navbar — verify:
   - iframe switches to fundamentals view without reloading
   - "Fundamentals" tab is highlighted in navbar
7. Click "Overview" — verify same behavior
8. Click "Dashboard" — verify:
   - Dashboard page renders normally
   - No iframe visible
9. Click "Chart" again — verify:
   - iframe reappears with all previous state intact (same zoom, drawings, indicators)
   - Chart canvas re-renders properly (not stale/blank)
10. Toggle theme in Fin Quote navbar — verify charting app theme updates
11. Test with production charting URL to verify cross-origin postMessage works with origin validation

---

## Addendum: v2 Review (from Charting Platform codebase, round 2)

Three remaining issues found after reviewing the v2 plan against the codebase.

---

### HIGH: X-Frame-Options / CSP frame-ancestors Not Addressed

This could silently block the entire feature. If nginx or Express sets `X-Frame-Options: DENY` or `X-Frame-Options: SAMEORIGIN`, the browser will refuse to render `charts.theintraday.com` inside an iframe on `theintraday.com` — they are different *origins* (different subdomains), even though they are same-*site*.

**Action (do first, before writing any code):**

1. Check the nginx config on EC2 for any `X-Frame-Options` or `Content-Security-Policy` headers
2. Check Express middleware for `helmet()` or manual header setting
3. Ensure the `/tos/:ticker` response allows framing by the Fin Quote domain. The modern approach is CSP `frame-ancestors` (which supersedes `X-Frame-Options`):
   ```
   Content-Security-Policy: frame-ancestors 'self' https://theintraday.com https://www.theintraday.com
   ```
4. In dev, also allow `http://localhost:*`
5. If `X-Frame-Options` is set at the nginx level, it must be removed or overridden there — a code-level change won't help

**Recommendation:** Add this to the Charting Platform file changes table. Either:
- Set the header conditionally in `tos.ts` when `?embed=true` is present
- Or configure it in nginx for the `/tos/` location block

---

### MEDIUM: READY Message Sent Too Early

The plan places both the postMessage listener and the READY signal in `html.ts`. But `setFundWorkspaceMode()` is defined inside `fundamentals.ts`, which generates a separate script block. The page assembly in `tos.ts` calls these generators in sequence and concatenates the output.

The postMessage **listener** is fine — it's registered via `addEventListener`, and by the time any message actually arrives (asynchronous event loop), all synchronous scripts on the page have finished executing.

The issue is **READY timing**:
1. `html.ts` script runs → sends READY to parent
2. Parent receives READY, immediately sends `SET_WORKSPACE_MODE`
3. Message arrives in the event loop... but `fundamentals.ts` script may not have executed yet, so `setFundWorkspaceMode()` could be undefined

In practice the async message dispatch likely gives synchronous scripts time to finish, but this is a timing dependency, not a guarantee.

**Fix:** Don't send READY from `html.ts`. Instead, either:
- **Option A (recommended):** Add a small `generateEmbedReadyScript(ctx)` that is called *last* in the page assembly in `tos.ts`, after all other `generate*Script()` calls. It just sends READY and nothing else. This guarantees all modules are initialized.
- **Option B:** Send READY from the end of `fundamentals.ts`'s generated script (since it defines the functions the listener needs).

---

### LOW: Loading State (UX Polish, not a blocker)

On first iframe load, the user sees a blank colored rectangle for a few seconds while bars are fetched from Polygon and the chart engine initializes. No loading feedback.

**Recommendation for fast follow:** In `WorkspaceIframe.tsx`, show a lightweight loading skeleton or spinner inside the iframe container div. Hide it when the `READY` message is received from the iframe. This gives the user immediate visual feedback that something is happening.
