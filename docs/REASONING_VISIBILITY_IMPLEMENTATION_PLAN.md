## Reasoning Visibility Implementation Plan (Reasoning Summary, Tool Trace, Scratchpad)

### Why we’re adding this
- Improve trust and debuggability: Users (and admins) can see how an answer was produced without exposing sensitive internal prompts or raw chain-of-thought.
- Faster iteration: Tool traces reveal where latency comes from and which retrievals/citations drive answers.
- Safer transparency: Show a short Reasoning Summary to users; keep deeper internal notes (Scratchpad) behind an admin-only toggle and never persist them.

### Goals (what success looks like)
- Reasoning Summary (2–5 bullets) appears under each assistant response by default.
- Tool Trace shows tools executed, inputs (redacted), durations, and top citations; collapsible by default.
- Scratchpad (hidden chain-of-thought) is viewable only by admins, behind a toggle, and never saved to the database or logs.
- No PII/secrets leakage; token overhead capped; negligible latency impact (<150 ms CPU for parsing/instrumentation).

### Non‑Goals
- Do not expose or store long chain-of-thought for non-admin users.
- Do not change retrieval ranking logic or embeddings configuration as part of this feature.
- Do not introduce new analytics dependencies; we will reuse existing logging where possible.

---

## UX and UI

### Surfaces
- Chat message detail block (beneath each assistant message):
  - Reasoning Summary: bullet list, always visible when “Show reasoning” is on (default on).
  - Tool Trace: collapsible details (default collapsed). Shows each step with name, duration, and high-level result info.
  - Scratchpad: Admin-only sub-toggle “Show scratchpad (debug)”. Hidden by default; visible only if current user is admin.

### Controls
- Global toggle in chat UI header or settings pane:
  - “Show reasoning” (on/off). On shows Reasoning Summary + Tool Trace.
  - If user.isAdmin: nested “Show scratchpad (debug)” toggle; default off.

### Presentation
- Reasoning Summary: 2–5 short bullets, plain text. No secrets, no prompts, no identifiers.
- Tool Trace (collapsible):
  - Step list with: tool name, args (redacted), durationMs, resultCount or top citations.
  - For search results: show filing type/date/section and a short snippet. Avoid long payloads.
- Scratchpad (admin-only, collapsible):
  - Monospace preformatted block, limited to ~200 tokens.
  - Display a caution banner (“Debug view — not user facing. Not stored.”).

---

## API and Data Model

### Response envelope (server → client)
```json
{
  "answer": "final text",
  "reasoningSummary": ["Selected filing content search", "Filtered to 2024 10‑K", "Quoted Item 1A"],
  "toolTrace": [
    {
      "tool": "searchFilings",
      "args": {"query": "risk factors"},       // redact sensitive fields
      "durationMs": 412,
      "results": 5,
      "topCitations": [
        {"filing": "10-K", "date": "2024-11-01", "section": "Item 1A"}
      ]
    }
  ],
  "scratchpad": "<private notes>",             // only included if admin + flag
  "citations": [
    {"filing": "10-K", "date": "2024-11-01", "section": "Item 1A", "anchor": "#risk-factors"}
  ]
}
```

Notes:
- `scratchpad` must never be persisted. It’s only added to the API response for admins when an explicit dev flag is enabled.
- `toolTrace.args` should pass through a redaction layer before returning to client (e.g., mask long strings, strip tokens/keys).

### Tool Trace step shape (TypeScript)
```ts
type ToolTraceStep = {
  tool: string;
  args: Record<string, unknown>;
  durationMs: number;
  results?: number;
  topCitations?: Array<{
    filing: string;
    date: string;
    section?: string;
    anchor?: string;
  }>;
};
```

---

## Prompt Design

### Pattern
Ask the model for three sections: “Reasoning Summary”, “Final Answer”, and a private “<scratchpad>”. Instruct the model not to reveal scratchpad content to the user.

Example (conceptual):
```
You may think step-by-step in <scratchpad> (max 200 tokens). Do not reveal or reference it.
Return the following sections exactly:

Reasoning Summary:
- 2–5 short bullets explaining the approach (no prompts, no secrets)

Final Answer:
- The answer and citations (with filing type, date, section)

<scratchpad>
(Private notes for debugging: why you chose the tool, filters, edge cases considered)
</scratchpad>
```

### Guardrails (in the prompt)
- “Do not include any content from <scratchpad> in the Reasoning Summary or Final Answer.”
- “Keep Reasoning Summary concise and user-safe; avoid prompt text, keys, or file paths.”
- “Cap <scratchpad> at ~200 tokens.”

---

## Backend Changes

### Execution flow (high level)
1) Tool execution instrumentation
   - Before each tool call, record `start = performance.now()` and sanitized `args` copy.
   - After completion, compute `durationMs`; capture `results` count and `topCitations` if applicable.
   - Push one `ToolTraceStep` into a `toolTrace` array on the server.

2) Model response parsing
   - Parse the assistant output into: `reasoningSummary[]`, `finalAnswer`, and optional `<scratchpad>` section.
   - Enforce output length limits. If missing sections, degrade gracefully (empty summary, no scratchpad).

3) Redaction and response assembly
   - Run `redactArgs()` for `toolTrace.args` (e.g., truncate long strings, remove keys).
   - If `user.isAdmin && SCRATCHPAD_ADMIN_ONLY === 'true' && REASONING_SCRATCHPAD_ENABLED === 'true'`, attach `scratchpad`; else omit.
   - Return `{ answer, reasoningSummary, toolTrace, citations, scratchpad? }`.

4) Persistence
   - Store `answer`, `reasoningSummary`, `toolTrace`, and `citations` as part of the message or query log.
   - Do not store `scratchpad`. Avoid logging it to console or external logs.

### Redaction guidelines
- Remove API keys, tokens, and auth headers.
- Truncate large text fields (e.g., queries > 256 chars) with a suffix “…(truncated)”.
- Mask PII if present (e.g., emails → `u***@domain.com`).
- For embeddings or RPC payloads, keep only query term and counts; avoid raw vectors.

### Feature flags / config
- `REASONING_ENABLED=true` (default true; can disable globally).
- `REASONING_SHOW_SUMMARY_DEFAULT=true` (UI default on).
- `REASONING_TOOL_TRACE_DEFAULT=true` (UI default on).
- `REASONING_SCRATCHPAD_ENABLED=false` (default off in prod).
- `SCRATCHPAD_ADMIN_ONLY=true` (must be true in prod).

---

## Frontend Changes

### UI toggles (AssistantChat)
- Add “Show reasoning” switch (persist per-session in local state; optionally in user settings).
- If admin: show “Show scratchpad (debug)” nested switch.

### Rendering
- Reasoning Summary: simple bullet list under the assistant message.
- Tool Trace: collapsible section listing steps with durations and top citations; include a “Copy trace” button for debugging.
- Scratchpad: admin-only collapsible preformatted block with a warning banner.

### Accessibility and performance
- Ensure toggles are keyboard-accessible.
- Virtualize long histories: Reasoning/Trace should not cause message reflows that are expensive.

---

## Security, Privacy, and Compliance
- Never store the scratchpad; it’s transient and admin-only.
- Redact secrets/PII from tool traces and args.
- Ensure RLS prevents non-admins from seeing `scratchpad` fields even if the API is called directly.
- Log size caps: protect logs and payloads against excessive growth (e.g., 100 KB cap per trace).

---

## Testing Plan

### Unit tests
- Prompt parser: extracts Reasoning Summary, Final Answer, and Scratchpad correctly.
- Redaction: verifies keys/PII removed; long strings truncated.
- Trace builder: correct durations, counts, and top citations propagation.

### Integration/E2E
- User flow: Ask filing question → Reasoning Summary + Tool Trace visible; citations match trace.
- Admin flow: Enable scratchpad → visible; disable → hidden.
- Flag behavior: Disabling `REASONING_ENABLED` hides reasoning UI entirely.

### Safety checks
- Ensure no scratchpad content appears in user-visible fields.
- Verify DB writes exclude scratchpad.
- Confirm large inputs do not degrade performance (load/perf checks).

---

## Rollout Plan
1) Dev/staging (admins only)
   - Enable all features including scratchpad.
   - Collect feedback on clarity and usefulness.
2) Limited production (users see Reasoning Summary + Trace; scratchpad off)
   - `REASONING_ENABLED=true`, `REASONING_SCRATCHPAD_ENABLED=false`.
3) Full production
   - Keep scratchpad off by default; enable per-session for on-call debugging.

---

## Risks and Mitigations
- Risk: Prompt leakage via Reasoning Summary.
  - Mitigation: Explicit prompt instructions; add tests to detect restricted phrases; manual reviews.
- Risk: Token/cost overhead.
  - Mitigation: Cap scratchpad to ~200 tokens; keep reasoning bullets short; strip long fields from traces.
- Risk: Privacy leakage via traces.
  - Mitigation: Redaction layer; admin-only scratchpad; RLS checks.
- Risk: Developer accidentally logs scratchpad.
  - Mitigation: Lint rule / code review checklist; wrap scratchpad in a typed object only returned conditionally.

---

## Implementation Checklist

Backend
- [ ] Add tool instrumentation util (`startTraceStep`, `endTraceStep`).
- [ ] Add redaction util for args and traces.
- [ ] Update answer action to request sections + parse `Reasoning Summary`, `Final Answer`, `<scratchpad>`.
- [ ] Assemble response envelope and exclude `scratchpad` unless admin + flag.
- [ ] Persist answer, reasoningSummary, toolTrace, citations only.

Frontend
- [ ] Add “Show reasoning” and admin-only “Show scratchpad” toggles.
- [ ] Render Reasoning Summary under assistant messages.
- [ ] Render collapsible Tool Trace with durations and top citations.
- [ ] Render admin-only Scratchpad with warning banner; hidden by default.

Config & Testing
- [ ] Add feature flags (`REASONING_*`, `SCRATCHPAD_ADMIN_ONLY`).
- [ ] Unit tests for parser, redaction, trace builder.
- [ ] E2E tests for user/admin flows and flags.

---

## Appendix

### Example Tool Trace step
```json
{
  "tool": "searchFilings",
  "args": {"query": "risk factors"},
  "durationMs": 387,
  "results": 5,
  "topCitations": [
    {"filing": "10-K", "date": "2024-11-01", "section": "Item 1A", "anchor": "#risk-factors"}
  ]
}
```

### Example Reasoning Summary (good)
- Selected “searchFilings” because question asks about content (not metadata).
- Filtered to the latest 10‑K results.
- Ranked by vector similarity; top passages in Item 1A mention key risks.
- Quoted directly with filing/date/section citations.

### Example Scratchpad (admin-only, truncated)
```
Chose searchFilings → query="risk factors". Top results aligned with Item 1A.
Discarded 10‑Q passages; user asked 10‑K. Considered "geopolitical" and "supply chain".
Ensure quotes are verbatim; cite 2024‑11‑01 10‑K.
```


