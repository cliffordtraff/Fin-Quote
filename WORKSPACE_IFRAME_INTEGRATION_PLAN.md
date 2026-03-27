# Workspace Iframe Integration Status

This document replaces the original future-state plan and records the current host-side implementation in the Fin Quote / The Intraday repo.

Important boundary:

- This repo contains the **host app** implementation for the embedded workspace experience.
- The charting platform itself lives in a separate codebase and is still an external dependency.
- Anything involving `/tos/:ticker`, iframe headers, remote `postMessage` listeners, or nginx/CSP behavior is **not implemented in this repo** unless explicitly noted.

## Summary

The Fin Quote host-side iframe integration is now implemented.

What exists in this repo today:

- Workspace routes at `/workspace/chart`, `/workspace/fundamentals`, and `/workspace/overview`
- Symbol-aware navbar links into those routes
- A persistent root-level iframe shell that survives route changes
- Theme and symbol sync from Fin Quote into the embedded charting app
- Workspace-mode switching via `postMessage`
- Re-sync when the iframe becomes visible again
- Search-overlay support using the same embedded charting surface
- A loading state while the iframe initializes

What still depends on the external charting platform:

- Support for `?embed=true&view=...&theme=...`
- `READY` messaging back to the host
- Support for the host `postMessage` protocol
- Allowing the page to be framed by The Intraday domain

## Current Host-Side Architecture

### Root layout

The workspace iframe is mounted once in the root layout so it does not unmount during route changes.

Current file:

- `app/layout.tsx`

Behavior:

- The normal page is rendered first
- `WorkspaceIframe` is mounted as a sibling under the app providers
- The iframe shell stays alive across navigation and is shown/hidden instead of recreated

### Navigation

The navbar now links directly to workspace routes instead of using an external charting tab.

Current file:

- `components/Navigation.tsx`

Current workspace-related behavior:

- Adds `Chart`, `Fundamentals`, and `Overview` tabs
- Preserves the active stock symbol in workspace URLs when possible
- Highlights the active workspace tab based on pathname

Note:

- The older plan referenced a preserved "Charting (Old)" comparison tab. That is not part of the current navigation in this repo.

### Workspace iframe shell

The host-side iframe orchestration lives in:

- `components/WorkspaceIframe.tsx`

Current behavior:

- Derives workspace mode from pathname:
  - `/workspace/chart` → `price`
  - `/workspace/fundamentals` → `fundamentals`
  - `/workspace/overview` → `overview`
- Derives the symbol from:
  - `?symbol=...` on workspace routes
  - the current `/stock/[symbol]` route
  - fallback `AAPL`
- Builds the initial iframe URL using:
  - `NEXT_PUBLIC_CHARTING_URL`
  - `/tos/:symbol?embed=true&view=...&theme=...`
- Waits for a `READY` message from the embedded app
- Sends host-to-iframe messages for:
  - `SET_WORKSPACE_MODE`
  - `SET_SYMBOL`
  - `SET_THEME`
  - `SET_EMBED_SURFACE_MODE`
- Hides the iframe with CSS when leaving workspace routes instead of unmounting it
- Forces a re-sync when the iframe becomes visible again
- Shows a loading overlay until the embedded app is ready

### Search overlay support

The current implementation goes beyond the original plan and also reuses the embedded charting surface for ticker-search interactions.

Current host behavior includes:

- opening a search-only iframe surface outside workspace routes
- sending search-related messages into the embedded charting app
- handling selection/close messages back from the iframe

This behavior is also implemented in:

- `components/WorkspaceIframe.tsx`
- `lib/native-ticker-search.ts`

### Workspace route shells

Current files:

- `app/workspace/chart/page.tsx`
- `app/workspace/fundamentals/page.tsx`
- `app/workspace/overview/page.tsx`

Behavior:

- Each page renders navigation and a blank content shell
- The real UI is the overlayed persistent iframe

## Host-Side Status by Area

| Area | Status | Notes |
|------|--------|-------|
| Workspace routes | Implemented | `/workspace/chart`, `/workspace/fundamentals`, `/workspace/overview` exist |
| Root-mounted persistent iframe | Implemented | Mounted from `app/layout.tsx` |
| Workspace nav tabs | Implemented | Symbol-aware links in `components/Navigation.tsx` |
| Initial iframe URL with `embed/view/theme` | Implemented | Built in `WorkspaceIframe.tsx` |
| Host-side `READY` handling | Implemented | Host waits for remote readiness |
| `SET_WORKSPACE_MODE` host message | Implemented | Sent after readiness and on route changes |
| Theme sync | Implemented | Host sends `SET_THEME` on theme changes |
| Symbol sync | Implemented | Host sends `SET_SYMBOL` when symbol changes |
| Hide without unmounting | Implemented | Uses CSS visibility control |
| Re-show refresh behavior | Implemented | Achieved through force re-sync, not a dedicated `REFRESH` message |
| Loading state | Implemented | Loading overlay shown until ready |
| Search-only embedded surface | Implemented | Added after the original plan |
| Charting app embed-mode internals | External dependency | Not implemented in this repo |
| Frame headers / CSP / nginx config | External dependency | Must be handled in the charting platform deployment |

## Current Host Message Expectations

### Host → Charting app

The host currently expects the embedded charting app to understand:

- `SET_WORKSPACE_MODE`
- `SET_SYMBOL`
- `SET_THEME`
- `SET_EMBED_SURFACE_MODE`
- `OPEN_TICKER_SEARCH`
- `SET_TICKER_SEARCH_QUERY`
- `CLOSE_TICKER_SEARCH`

### Charting app → Host

The host currently listens for:

- `READY`
- `TICKER_SELECTED`
- `TICKER_SEARCH_CLOSED`

If the external charting app does not support these messages, the host workspace will render but the synchronized experience will be incomplete.

## Differences From the Original Plan

The original plan is no longer fully accurate. Main differences:

1. The document was written as if the integration had not started. The host-side implementation now exists.
2. Re-show behavior is implemented as a forced re-sync of mode/symbol/theme rather than a dedicated `REFRESH` message.
3. A loading state is now present in the host iframe shell.
4. A search-only embedded surface was added after the original plan.
5. The navigation does not currently include the originally described "Charting (Old)" comparison tab.
6. The charting-platform-side tasks remain external to this repo and should not be treated as completed here.

## External Dependencies and Risks

The main remaining risks are not in this repository:

- **Frame embedding headers**
  - The charting platform must allow itself to be framed by The Intraday domains.
  - `X-Frame-Options` and CSP `frame-ancestors` must be configured correctly in the remote app/nginx stack.

- **Protocol drift**
  - The host implementation now assumes a concrete `postMessage` protocol.
  - If the external charting app changes message names, payload shapes, or readiness timing, the host shell can regress.

- **Environment configuration**
  - `NEXT_PUBLIC_CHARTING_URL` must point to a compatible charting deployment.
  - If it is missing, the host workspace shows a configuration error instead of the iframe.

## Files in This Repo That Matter

### Core implementation

- `app/layout.tsx`
- `components/Navigation.tsx`
- `components/WorkspaceIframe.tsx`
- `app/workspace/chart/page.tsx`
- `app/workspace/fundamentals/page.tsx`
- `app/workspace/overview/page.tsx`

### Related integration points

- `components/StockSearch.tsx`
- `components/EmbedChart.tsx`
- `lib/native-ticker-search.ts`
- `components/ThemeProvider.tsx`

### Tests

- `components/__tests__/WorkspaceIframe.test.tsx`
- `components/__tests__/Navigation.test.tsx`

## Current Verification Checklist

### Host app

1. Set `NEXT_PUBLIC_CHARTING_URL` to a compatible charting deployment
2. Start the app and open `/workspace/chart`
3. Verify the iframe loads and the loading state clears
4. Switch between:
   - `/workspace/chart`
   - `/workspace/fundamentals`
   - `/workspace/overview`
5. Verify the embedded app changes mode without a full reinitialization
6. Navigate to a non-workspace page and back
7. Verify the iframe resumes with preserved state
8. Change theme in the host app and verify the iframe theme updates
9. Test symbol flow by entering a stock symbol and opening workspace routes with `?symbol=...`

### External charting platform

These checks must be verified against the separate charting codebase/deployment:

1. The `/tos/:ticker` page allows framing from The Intraday origins
2. The embedded page sends `READY`
3. The embedded page supports the host messages listed above
4. The embedded page accepts `embed`, `view`, and `theme` URL params
5. Any internal workspace-switch UI is appropriately hidden in embed mode

## Recommendation

Treat this repo as **host-side complete but integration-dependent**.

If more work is needed, the next high-value steps are:

1. Keep the host-side tests around `WorkspaceIframe` current
2. Document the external charting protocol in a shared, versioned spec
3. Add explicit cross-repo verification for frame headers and `READY` / workspace-mode behavior
