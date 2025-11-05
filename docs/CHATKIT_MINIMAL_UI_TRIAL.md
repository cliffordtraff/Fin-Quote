## ChatKit Minimal UI Trial (UI-only, keep current SSE backend)

### Why we’re doing this
- **Faster UI polish**: ChatKit provides a ready-made chat UI with streaming, typing indicators, attachments, and source annotations.
- **Preserve our backend**: We already have a custom pipeline that selects tools, fetches data, generates charts, validates answers, and streams via SSE from `app/api/ask/route.ts`. We keep this intact.
- **Low-risk spike**: This trial checks whether ChatKit can act as a purely visual layer with a custom transport; if it can’t, we revert without backend changes.

### Current state (baseline)
Our server endpoint `app/api/ask/route.ts` streams Server-Sent Events (SSE) with these event types:
- `status`: progress updates (selecting, fetching, generating, suggestions)
- `data`: payload describing `dataUsed` and optional `chartConfig`
- `answer`: streamed assistant text deltas (final answer content)
- `validation`: server-side validation results
- `followup`: array of suggested follow-up questions
- `complete`: final timing/metrics, includes `answer`
- `error`: error message

On the client, `components/AssistantChat.tsx` renders the chat, consumes the SSE stream, shows the streamed answer, renders charts from `chartConfig`, and displays follow-up suggestions.

### Goal of this trial
- Replace the custom chat UI in `components/AssistantChat.tsx` with ChatKit components while continuing to consume our existing SSE stream without changing the backend protocol.
- Map our SSE events to ChatKit’s message/data model as closely as possible.

### Scope
- In-scope: Add ChatKit UI components, create an adapter that feeds ChatKit from our SSE, wire user input → our `/api/ask` SSE, render streamed deltas, keep charts and follow-ups.
- Out-of-scope: Migrating to OpenAI Sessions/Agents/Workflows; changing `app/api/ask/route.ts` logic; altering tool selection, validation, or data fetching.

### Assumptions to validate (first)
1. ChatKit exposes a way to programmatically feed/stream assistant content (e.g., append deltas) without requiring an OpenAI “session” endpoint.
2. ChatKit allows displaying custom per-message metadata/annotations (to reflect `validation` results and `dataUsed` sources) or we can render these as adjacent UI elements.
3. ChatKit doesn’t mandate Markdown output; our assistant responses are plain text and should render correctly.
4. ChatKit can coexist with our existing chart components (we will still render charts via our React components below the message).

If any of these assumptions fail, we will not proceed beyond the spike and will revert to the existing UI.

### High-level approach
1. Install ChatKit UI dependencies (UI/web component) in the app.
2. Build a small **ChatKitTransportAdapter** that:
   - Subscribes to our `/api/ask` SSE stream.
   - Translates `answer` deltas to ChatKit’s streaming API (or incremental message updates).
   - Emits system/typing feedback for `status` events.
   - Persists `dataUsed` and `chartConfig` from `data` for rendering under the active assistant turn.
   - Attaches `validation` outcomes as metadata/annotation on the assistant turn (or a compact badge/footnote if annotations aren’t supported).
   - Shows `followup` as suggestion chips.
3. Swap the chat surface in `components/AssistantChat.tsx` with ChatKit components, keep our chart and follow-up components wired to the adapter’s state.
4. Ensure telemetry and logging remain unchanged (server continues logging via `logQuery`).

### Event mapping

| Our SSE event | Meaning | ChatKit UI handling |
| --- | --- | --- |
| `status` | Progress updates | Show typing indicator or a small status banner for the active turn |
| `data` | `dataUsed`, optional `chartConfig` | Store in adapter state; render chart component and sources below the assistant message |
| `answer` | Streaming text deltas | Append to the active assistant message via ChatKit streaming APIs |
| `validation` | Validation results | Attach as annotations/metadata badges; show an expandable panel if needed |
| `followup` | Suggested questions | Render as suggestion chips/actions below the thread |
| `complete` | Final metrics and full answer | Stop typing indicator; finalize the assistant message |
| `error` | Error message | Render an error bubble and stop streaming |

### Implementation plan (step-by-step)
1. Dependencies
   - Add ChatKit UI package(s) per OpenAI docs.
   - Verify tree-shaking and bundle size impact.

2. Adapter: `ChatKitTransportAdapter`
   - Input: `{ question, conversationHistory }`.
   - Starts fetch to `/api/ask` with `Accept: text/event-stream`.
   - Parses SSE lines; for each event:
     - `status`: set typing/phase in local state for the active assistant turn.
     - `data`: capture `dataUsed` and `chartConfig` on the active turn.
     - `answer`: call ChatKit API to append delta text to the active assistant message.
     - `validation`: attach validation summary to the active turn.
     - `followup`: store suggestions for rendering.
     - `complete`: finalize the assistant turn (commit full text, clear typing).
     - `error`: surface an error message bubble and stop.

3. UI swap in `components/AssistantChat.tsx`
   - Replace the current message list and input with ChatKit’s components (Provider + Chat surface + Input).
   - On user submit: push a user message into ChatKit, then invoke the adapter to stream the assistant response.
   - Under the assistant turn, render:
     - Our existing chart component when `chartConfig` is present.
     - Source list derived from `dataUsed` (e.g., filings snippets or metric labels).
     - Validation summary badge/panel.
     - Follow-up suggestion chips.

4. Accessibility and mobile
   - Verify keyboard navigation and screen reader roles.
   - Test small screens; ensure the layout doesn’t overflow and chips wrap correctly.

5. Telemetry and errors
   - No server changes: `logQuery` remains as-is.
   - Consider client-side error breadcrumbs (only non-sensitive context).

### Testing checklist
- Start a conversation; confirm:
  - Streaming text appears incrementally with a typing indicator.
  - `data` event triggers chart render and sources section.
  - `validation` summary is visible and accurate.
  - `followup` shows actionable chips; clicking resubmits a new turn.
  - `complete` removes typing and the answer is finalized.
  - SSE disconnects are handled gracefully with a retry or a clear error state.

### Success criteria (acceptance)
- No backend changes required.
- Visual parity or better versus current chat UI.
- Streaming remains smooth (<150ms average inter-chunk render on broadband).
- Charts and follow-ups render exactly as before.
- Mobile layout works on iPhone 13/SE widths and a mid-size Android.

### Risks and mitigations
- **ChatKit requires OpenAI session backend**: If true, this approach is not viable; revert to current UI.
- **Limited annotation hooks**: If we can’t attach validation/source metadata to the assistant turn, render a compact panel under the message using our own components.
- **Bundle size**: Monitor size; code-split ChatKit if necessary.

### Rollback plan
- Keep all changes behind a feature flag (e.g., `NEXT_PUBLIC_ENABLE_CHATKIT_UI`).
- If anything breaks or assumptions fail, disable the flag to restore the current UI instantly.

### Timeline
- Day 1: Install, build adapter, swap UI in a feature-flagged branch.
- Day 2: Polish mapping, accessibility/mobility checks, acceptance testing, go/no-go decision.

### Open questions
1. Exact ChatKit APIs for programmatic streaming and metadata—confirm during spike.
2. Where to surface validation details for best UX (inline vs expandable panel)?
3. Do we want to show sources as citations inline in text, or just below?


