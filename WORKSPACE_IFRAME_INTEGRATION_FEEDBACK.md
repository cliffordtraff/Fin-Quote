# Workspace Iframe Integration Plan

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
- On first mount, renders an `<iframe>` loading the charting app's embed-enabled URL: `${NEXT_PUBLIC_CHARTING_URL}/tos/AAPL?embed=true&view=price&theme={current_theme}`
- Uses `usePathname()` to detect the current route
- When pathname starts with `/workspace/`:
  - Makes the iframe container visible (covers the full viewport below the navbar)
  - Reads which view from the pathname (`/workspace/chart` → `price`, `/workspace/fundamentals` → `fundamentals`, `/workspace/overview` → `overview`)
  - Sends `SET_WORKSPACE_MODE` postMessage to the iframe with the target view
- When pathname does NOT start with `/workspace/`:
  - Hides the iframe container via CSS (`display: none` or `visibility: hidden + position: absolute`)
  - Does NOT unmount the iframe — it stays in the DOM, preserving all chart state
- Listens for `READY` message from the iframe to know when it's initialized before sending messages
- Tracks whether the iframe has loaded to avoid sending messages before it's ready

**Visibility approach:**
- The iframe container is a `div` with `fixed` positioning, `top` set to the navbar height (~98px: 56px header + 40px tabs + 2px border), and `bottom/left/right: 0`
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

2. **Pass embed flag to all `generate*Script(ctx)` functions** so UI modules can conditionally adjust their behavior in embed mode

### File: `src/server/routes/tos-ui/fundamentals.ts`

**What changes:**

1. **Hide workspace-switch buttons in embed mode**
   - The `<div class="workspace-switch">` containing Price/Fund/Overview buttons should be hidden when `ctx.embed === true`
   - Either don't render it, or add `style="display:none"` in embed mode
   - The toolbar itself stays visible — only the workspace switching buttons are hidden

2. **Set initial workspace mode from query param**
   - If `ctx.initialView` is `'fundamentals'` or `'overview'`, set `fundState.workspaceMode` accordingly on initialization instead of defaulting to `'price'`

### File: `src/server/routes/tos-ui/html.ts` (or appropriate bootstrap file)

**What changes:**

Add a postMessage listener in embed mode that handles incoming messages from the Fin Quote host:

```
window.addEventListener('message', function(event) {
  // Validate origin against allowed origins
  // Parse message using existing protocol validation
  // Handle SET_WORKSPACE_MODE:
  //   - Update fundState.workspaceMode
  //   - Trigger the same UI switching logic that the Fund/Overview buttons use
  //   - This includes showing/hiding containers, loading data if needed
  // Handle SET_SYMBOL (reuse existing logic from embed protocol)
  // Handle SET_THEME (reuse existing logic)
})
```

The postMessage listener should reuse the **exact same internal functions** that the Fund/Overview button click handlers call. No new switching logic — just a new trigger mechanism.

**Send READY message** when the page has finished initializing, so Fin Quote knows it can start sending messages:
```
if (window !== window.parent) {
  window.parent.postMessage({ v: 1, type: 'READY' }, '*')
}
```

### File: `src/server/routes/tos-ui/bootstrap.ts` (or wherever "View on The Intraday" link lives)

**What changes:**
- In embed mode, consider hiding the "View on The Intraday" external link from the toolbar (since the user is already on The Intraday)
- In embed mode, consider hiding the "Sign In" button from the toolbar (since auth is handled by Fin Quote's navbar)

---

## How It All Works Together

### User Flow

1. User visits `theintraday.com/dashboard` — sees Fin Quote dashboard, navbar at top, no iframe loaded yet
2. User clicks **"Chart"** in the navbar
3. Fin Quote navigates to `/workspace/chart` — the page renders Navigation + empty content
4. `WorkspaceIframe` detects the route change, makes the iframe visible
5. If first visit: iframe loads `charts.theintraday.com/tos/AAPL?embed=true&view=price`
6. Charting app renders: full toolbar (ticker search, OHLC, timeframe, drawing tools, Studies) + candlestick chart + watchlist. No Fund/Overview buttons in toolbar.
7. User clicks **"Fundamentals"** in Fin Quote's navbar
8. Fin Quote navigates to `/workspace/fundamentals`
9. `WorkspaceIframe` sends `postMessage({ v:1, type: 'SET_WORKSPACE_MODE', payload: { mode: 'fundamentals' } })`
10. Charting app receives message, switches to fundamentals view (same as clicking Fund button internally)
11. User clicks **"Dashboard"** in navbar
12. Fin Quote navigates to `/dashboard` — WorkspaceIframe hides the iframe (display:none)
13. Dashboard renders normally
14. User clicks **"Chart"** again
15. WorkspaceIframe shows the iframe again — all previous chart state (drawings, zoom, indicators) is still there

### Communication Flow

```
Fin Quote (Vercel)                    Charting Platform (EC2)
─────────────────                     ──────────────────────

layout.tsx
  └─ WorkspaceIframe
       │
       ├─ renders <iframe src="charts.theintraday.com/tos/AAPL?embed=true">
       │                              │
       │                              ├─ Loads full /tos page with embed=true
       │                              ├─ Hides workspace-switch buttons
       │                              ├─ Adds postMessage listener
       │                              └─ Sends READY message ──────────────────┐
       │                                                                       │
       ├─ Receives READY ◄─────────────────────────────────────────────────────┘
       │
       ├─ User clicks "Fundamentals" in navbar
       │   └─ postMessage SET_WORKSPACE_MODE {mode:'fundamentals'} ───────────┐
       │                                                                       │
       │                              ├─ Receives message ◄───────────────────┘
       │                              ├─ Calls same switching logic as Fund button
       │                              └─ Renders fundamentals workspace
       │
       ├─ User navigates to /dashboard
       │   └─ iframe hidden (display:none), state preserved
       │
       └─ User navigates back to /workspace/chart
           └─ iframe shown again, all state intact
```

---

## What Does NOT Change

- EC2 deployment (same server, PM2, nginx, Cloudflare)
- The standalone `charts.theintraday.com/tos/AAPL` experience (visiting directly still works as before)
- The chart engine, indicators, drawings, watchlist
- The charting app's ticker search in its toolbar
- The charting app's theme controller
- The fundamentals data pipeline, WISM pipeline, overview system
- Supabase tables, auth, shared cookies
- Any other Fin Quote pages (dashboard, stock, calendar, etc.)

---

## Files Modified/Created Summary

### Fin Quote

| File | Action | Description |
|------|--------|-------------|
| `components/Navigation.tsx` | Modify | Remove external Charting (Beta) link, add Chart/Fundamentals/Overview tabs, rename Fundamentals Charting to Charting (Old) |
| `components/WorkspaceIframe.tsx` | Create | Persistent iframe component with postMessage communication |
| `app/layout.tsx` | Modify | Add WorkspaceIframe to root layout |
| `app/workspace/chart/page.tsx` | Create | Minimal page (Navigation + empty content) |
| `app/workspace/fundamentals/page.tsx` | Create | Minimal page (Navigation + empty content) |
| `app/workspace/overview/page.tsx` | Create | Minimal page (Navigation + empty content) |

### Charting Platform

| File | Action | Description |
|------|--------|-------------|
| `src/embed/protocol.ts` | Modify | Add SET_WORKSPACE_MODE message type |
| `src/server/routes/tos.ts` | Modify | Accept `embed`, `view`, `theme` query params, pass to context |
| `src/server/routes/tos-ui/fundamentals.ts` | Modify | Hide workspace-switch buttons in embed mode, support initial view from query param |
| `src/server/routes/tos-ui/html.ts` or `bootstrap.ts` | Modify | Add postMessage listener in embed mode, send READY on init, hide "Sign In" and "View on The Intraday" links in embed mode |

---

## Verification

### Testing the Charting Platform changes (do first)

1. Start the charting app locally: `npm run dev`
2. Visit `http://localhost:3000/tos/AAPL?embed=true` — verify:
   - Fund/Overview workspace-switch buttons are hidden
   - Toolbar (ticker search, OHLC, timeframe, drawing tools, Studies) is still visible
   - Chart renders normally
3. Visit `http://localhost:3000/tos/AAPL?embed=true&view=fundamentals` — verify fundamentals view loads directly
4. Open browser console, test postMessage:
   ```js
   window.postMessage({ v: 1, type: 'SET_WORKSPACE_MODE', payload: { mode: 'overview' } }, '*')
   ```
   Verify it switches to overview view
5. Test switching back to price mode via postMessage
6. Verify standalone mode still works: visit `/tos/AAPL` (no embed param) — Fund/Overview buttons should still be visible

### Testing the Fin Quote changes

1. Start Fin Quote dev server: `npm run dev`
2. Set `NEXT_PUBLIC_CHARTING_URL=http://localhost:3000` in `.env.local` (pointing to local charting app)
3. Navigate to `/workspace/chart` — verify:
   - Fin Quote navbar shows with "Chart" tab highlighted
   - iframe loads below navbar with full charting app
   - Charting app toolbar visible, workspace-switch buttons hidden
4. Click "Fundamentals" in navbar — verify:
   - iframe switches to fundamentals view without reloading
   - "Fundamentals" tab is highlighted in navbar
5. Click "Overview" — verify same behavior
6. Click "Dashboard" — verify:
   - Dashboard page renders normally
   - No iframe visible
7. Click "Chart" again — verify:
   - iframe reappears with all previous state intact (same zoom, drawings, indicators)
8. Test with production charting URL to verify cross-origin postMessage works

---

## Addendum: Code Review Feedback (from Charting Platform codebase)

The following issues were found by reviewing the plan against the actual charting platform source code. These must be addressed during implementation.

---

### CRITICAL: Null Check Guard Will Kill Fundamentals in Embed Mode

**Problem:** In `src/server/routes/tos-ui/fundamentals.ts` (~line 348), there is a guard clause:
```js
if (!fundToggleBtn || !overviewToggleBtn || !priceWorkspaceBtn || !fundContainer || ...) return;
```

The plan says to hide the workspace-switch buttons in `html.ts` by not rendering them when `ctx.embed === true`. But if those DOM elements don't exist, `getElementById` returns `null`, the guard triggers, and **the entire fundamentals script exits early**. This means `setFundWorkspaceMode()` is never defined — the postMessage handler has nothing to call. Fundamentals and Overview views are completely broken in embed mode.

**Fix:** In `html.ts`, still render the workspace-switch `<div>` in embed mode but add `style="display:none"` to hide it visually. The DOM elements exist (null checks pass, switching logic initializes), but the user never sees the buttons. Change the plan from "don't render the buttons" to "render them hidden."

Concretely, at line 52 of `html.ts`, instead of:
```
${ctx.fundamentalsMode && !ctx.embed ? '...' : ''}
```
Do:
```
${ctx.fundamentalsMode ? `
  <div class="workspace-switch" id="workspace-switch" ${ctx.embed ? 'style="display:none"' : ''} ...>
    ...buttons...
  </div>
` : ''}
```

---

### HIGH: postMessage Origin Validation is Underspecified

**Problem:** The plan says to send READY with `'*'` and to "validate origin against allowed origins" in the listener, but never specifies where the allowed origins come from. The existing `isOriginAllowed()` in `protocol.ts` takes an `allowedOrigins: string[]` parameter, but there's no mechanism to populate it.

Without this, any page that iframes `charts.theintraday.com` can send `SET_WORKSPACE_MODE`, `SET_SYMBOL`, etc.

**Fix:** Add an environment variable:
```
EMBED_ALLOWED_ORIGINS=https://theintraday.com,https://www.theintraday.com
```

Parse it in `tos.ts`, pass as `ctx.embedAllowedOrigins` (comma-separated string), and use it in the postMessage listener:
```js
var allowedOrigins = '${ctx.embedAllowedOrigins || ''}'.split(',').filter(Boolean);
window.addEventListener('message', function(event) {
  if (allowedOrigins.length > 0 && allowedOrigins.indexOf(event.origin) === -1) return;
  // ... handle message
});
```

In dev, add `http://localhost:3000` to the list. Sending READY with `'*'` is acceptable (it's a non-sensitive announcement), but the **receive side** must validate.

---

### MEDIUM: Race Condition on First Load — Use `?view=` Param

**Problem:** If the user's first visit is `/workspace/fundamentals`, the following race occurs:
1. WorkspaceIframe creates iframe with `?view=price` (plan's default)
2. iframe is still loading...
3. WorkspaceIframe sees pathname is `/workspace/fundamentals`, tries to send `SET_WORKSPACE_MODE`
4. READY hasn't arrived yet — message is silently dropped
5. iframe finishes loading, sends READY
6. User is stuck on price view

**Fix:** Set the `?view=` query param in the iframe URL based on whichever `/workspace/*` route the user first lands on. Map: `/workspace/chart` → `?view=price`, `/workspace/fundamentals` → `?view=fundamentals`, `/workspace/overview` → `?view=overview`. Then the server renders the correct view on initial load with no postMessage needed.

Only use `SET_WORKSPACE_MODE` postMessage for **subsequent** view switches (when the iframe is already loaded and READY has been received). This eliminates the race entirely.

Update `WorkspaceIframe.tsx` to:
```tsx
// On first mount, derive view from current pathname
const viewFromPath = pathname === '/workspace/fundamentals' ? 'fundamentals'
  : pathname === '/workspace/overview' ? 'overview' : 'price';
const iframeSrc = `${CHARTING_URL}/tos/AAPL?embed=true&view=${viewFromPath}&theme=${theme}`;
```

---

### MEDIUM: No Symbol Sync from Fin Quote Context

**Problem:** The iframe URL is hardcoded to `/tos/AAPL?embed=true`. If the user was viewing NVDA on a Fin Quote stock page and clicks "Chart", they get AAPL.

This may be intentional for v1 (user searches within the charting app's own toolbar), but should be explicitly documented as a known limitation or addressed.

**Possible v1 fix:** If Fin Quote has a "current ticker" context (e.g., from the stock page), make the iframe URL dynamic:
```tsx
const iframeSrc = `${CHARTING_URL}/tos/${currentTicker || 'AAPL'}?embed=true&view=${view}`;
```

Or send `SET_SYMBOL` after READY if the user has navigated from a ticker-specific page.

---

### LOW: RAF May Pause When Iframe is `display:none`

**Problem:** Some browsers throttle or stop `requestAnimationFrame` callbacks for elements with `display: none`. The charting engine uses RAF for its render loop. When the user navigates away and back, the chart canvas may appear stale until a user interaction triggers a redraw.

**Fix:** When showing the iframe again after it was hidden, send a lightweight message (e.g., `SET_WORKSPACE_MODE` with the current mode, or a new `REFRESH` message) so the charting app calls `markDirty(DIRTY_RESIZE)` and re-renders. Alternatively, have the charting app listen for `document.visibilitychange` and poke the dirty flags when becoming visible.

---

### LOW: Theme Sync is One-Directional

**Problem:** The plan handles initial theme via `?theme=` and Fin Quote can send `SET_THEME`, but doesn't address:
- If the user toggles theme inside the charting app's own toolbar, Fin Quote doesn't know
- Should the charting app's theme toggle be hidden in embed mode?

**Recommendation:** In embed mode, hide the charting app's theme toggle (Fin Quote owns theme). If bidirectional sync is needed later, add a `THEME_CHANGED` embed→host message.

---

### LOW: `TosPageContext` Type Update Missing

**Problem:** The plan adds `embed`, `initialView`, and `initialTheme` to the context object in `tos.ts` but doesn't mention updating the `TosPageContext` TypeScript interface. Without this, the fields are untyped and invisible to other developers.

**Fix:** Update the `TosPageContext` interface (likely in `tos.ts` or a shared types file) to include:
```typescript
embed?: boolean;
initialView?: 'price' | 'fundamentals' | 'overview';
initialTheme?: 'light' | 'dark';
embedAllowedOrigins?: string;
```

---

### Summary of Required Plan Changes

| # | Severity | Issue | Required Change |
|---|----------|-------|-----------------|
| 1 | **Critical** | Null check guard exits early if buttons not in DOM | Render buttons with `display:none` in embed mode, don't omit from DOM |
| 2 | **High** | No origin validation design | Add `EMBED_ALLOWED_ORIGINS` env var, validate on receive side |
| 3 | **Medium** | Race condition on first load | Use `?view=` param derived from initial route, not postMessage |
| 4 | **Medium** | No symbol sync from Fin Quote | Document as known limitation or make iframe URL dynamic |
| 5 | **Low** | RAF pause when iframe hidden | Send resize/refresh on re-show |
| 6 | **Low** | Theme sync one-directional | Hide charting app theme toggle in embed mode |
| 7 | **Low** | `TosPageContext` type not updated | Add new fields to the TypeScript interface |
