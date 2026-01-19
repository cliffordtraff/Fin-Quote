# Chat Feature Flag Implementation Plan

## Overview

Implement a feature flag to temporarily disable the chatbot feature for MVP launch while preserving all code for future re-enablement.

## Feature Flag

**Variable:** `NEXT_PUBLIC_ENABLE_CHAT`
- `true` = Chat feature visible
- `false` = Chat feature hidden (MVP default)

The `NEXT_PUBLIC_` prefix is required because the Navigation component is a client component that needs access to this value.

---

## Current Architecture

The chat feature consists of:

1. **Chat page:** `app/chatbot/page.tsx` — Full chat interface with conversation history, Q&A, charts
2. **Chat tab in navigation:** `components/Navigation.tsx` (lines 65-74) — Link to `/chatbot`
3. **Backend (keep untouched):**
   - `app/actions/ask-question.ts` — Q&A orchestration
   - `app/api/ask/route.ts` — Streaming API endpoint
   - `lib/tools.ts` — Tool definitions and prompts
   - `lib/validators.ts` — Answer validation
   - `lib/regeneration.ts` — Auto-correction
   - Database tables: `query_logs`, `conversations`, `messages`, `filing_chunks`

---

## Implementation Steps

### Step 1: Add Environment Variable

**File:** `.env.local`

```bash
# Feature Flags
NEXT_PUBLIC_ENABLE_CHAT=false
```

**File:** `.env.local.example`

```bash
# Feature Flags
# Set to 'true' to enable the AI chatbot feature
NEXT_PUBLIC_ENABLE_CHAT=false
```

---

### Step 2: Hide Chat Tab in Navigation

**File:** `components/Navigation.tsx`

Wrap the Chat `<Link>` element (lines 65-74) in a conditional:

```tsx
{process.env.NEXT_PUBLIC_ENABLE_CHAT === 'true' && (
  <Link
    href="/chatbot"
    className={...}
  >
    Chat
  </Link>
)}
```

---

### Step 3: Protect the Chat Route (Optional)

**File:** `app/chatbot/page.tsx`

Add a redirect at the top of the component if the flag is disabled:

```tsx
import { redirect } from 'next/navigation'

// At the top of AskPageContent or the page component:
if (process.env.NEXT_PUBLIC_ENABLE_CHAT !== 'true') {
  redirect('/')
}
```

This prevents users from directly navigating to `/chatbot` via URL.

---

### Step 4: Update Documentation

**File:** `CLAUDE.md`

Add a section under a new "Feature Flags" heading:

```markdown
## Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `NEXT_PUBLIC_ENABLE_CHAT` | `false` | Enables the AI chatbot feature (Chat tab + /chatbot route) |

To enable: Set to `true` in `.env.local` and restart the dev server.
```

---

## Files to Modify

| File | Change |
|------|--------|
| `.env.local` | Add `NEXT_PUBLIC_ENABLE_CHAT=false` |
| `.env.local.example` | Add variable with documentation comment |
| `components/Navigation.tsx` | Wrap Chat link in conditional (lines 65-74) |
| `app/chatbot/page.tsx` | Add redirect when flag is disabled (optional) |
| `CLAUDE.md` | Document the feature flag |

---

## Testing

After implementation:

1. **With `NEXT_PUBLIC_ENABLE_CHAT=false`:**
   - Chat tab should NOT appear in navigation
   - Navigating directly to `/chatbot` should redirect to `/`

2. **With `NEXT_PUBLIC_ENABLE_CHAT=true`:**
   - Chat tab should appear in navigation
   - `/chatbot` page should work normally

3. **Remember:** Restart dev server after changing env variable (Next.js caches env at build time)

---

## Rollback / Re-enable

To bring chat back:
1. Change `.env.local`: `NEXT_PUBLIC_ENABLE_CHAT=true`
2. Restart the dev server / redeploy
3. Chat is back instantly

---

## What Stays Untouched

- `app/chatbot/page.tsx` — The page code remains, just protected by redirect
- `components/Sidebar.tsx` — Unused currently, but preserved
- `app/actions/ask-question.ts` — Q&A orchestration
- `app/api/ask/route.ts` — Streaming API
- `lib/tools.ts`, `lib/validators.ts`, `lib/regeneration.ts` — All LLM logic
- Database tables and evaluation scripts

**No code is deleted — only conditionally hidden.**

---

## Future: Removing the Feature Flag

Once chat is ready for production:
1. Remove the conditional wrapper from `Navigation.tsx`
2. Remove the redirect from `app/chatbot/page.tsx`
3. Delete the `NEXT_PUBLIC_ENABLE_CHAT` variable from `.env` files
4. Remove the feature flag documentation from `CLAUDE.md`
