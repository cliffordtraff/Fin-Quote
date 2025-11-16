# Integration Request: Sunday Trading Dashboard → Fin Quote

## Purpose of This Document

This document is for an LLM assistant working in the **Sunday (refreshed monday) 2** codebase. We are integrating selected features from Sunday into the **Fin Quote** platform to create a unified financial research and tracking experience.

---

## About Fin Quote (Target Codebase)

**Fin Quote** is a Next.js-based financial platform with the following architecture:

- **Framework**: Next.js 14 (App Router)
- **Auth & Database**: Supabase (PostgreSQL + Auth)
- **API Provider**: Financial Modeling Prep (FMP) - REST API only (no WebSocket yet)
- **LLM**: OpenAI for AI-powered Q&A chatbot
- **UI**: React 18, Tailwind CSS, dark mode support
- **Charts**: Currently Highcharts (basic financial charts)
- **Current Features**:
  - AI chatbot for stock questions (ask about financials, ratios, SEC filings)
  - Stock detail pages with 139 financial metrics
  - Market data dashboard (indices, movers, sectors)
  - Semantic search over SEC filings (RAG with pgvector)

---

## What We're Integrating from Sunday

We want to selectively integrate **watchlist** and **charting** capabilities:

### ✅ Features We Want:

1. **Watchlist System**
   - User ability to add/remove stocks to/from watchlist
   - Watchlist table/grid view
   - Multi-symbol tracking
   - Persistence (we'll migrate from Firebase to Supabase)

2. **TradingView Charts**
   - Interactive price charts using lightweight-charts
   - Timeframe selection (1D, 1W, 1M, 3M, 1Y, ALL)
   - Extended hours overlay
   - Drawing tools/trend lines

3. **Live Quotes** (Optional/Future)
   - Real-time price updates via FMP WebSocket
   - Live watchlist updates

### ❌ Features We're NOT Integrating:

- Firebase (we use Supabase)
- Electron desktop wrapper
- PWA service worker
- News ingestion/classification
- Stripe payments (for now)
- Alpha Vantage integration

---

## Integration Approach

We will:
1. Copy relevant components/hooks from Sunday into Fin Quote's structure
2. Rewrite data layer to use Supabase instead of Firebase
3. Adapt auth to use Supabase Auth (replaces Firebase Auth)
4. Ensure UI consistency with Fin Quote's theme/navigation
5. Install required dependencies into Fin Quote's package.json

---

## Information We Need from You

Please provide detailed information in the following categories:

---

### 1. Database Schema & Data Model

**For Watchlist:**
- What Firebase collections/documents are used for watchlist?
- What is the exact data structure? (field names, types, nesting)
- How is user data associated? (e.g., `users/{uid}/watchlist/{symbol}`)
- Are there any indexes, constraints, or validation rules?
- What metadata is stored beyond just symbol? (e.g., added_at, notes, alerts)

**Example format we need:**
```typescript
// Firebase structure
users/{uid}/data/watchlist/{symbol}
{
  symbol: string,
  addedAt: timestamp,
  notes?: string,
  // ... any other fields
}
```

**For Live Quotes Cache:**
- Where are quotes cached? (Firestore collections?)
- What is the caching strategy/TTL?
- How is the cache updated?

---

### 2. Watchlist Feature Inventory

Please list all files related to watchlist functionality:

**A. Pages/Routes:**
- File paths to any watchlist-related pages (e.g., `app/watchlist/page.tsx`)
- What URL routes exist?

**B. Components:**
- File paths to watchlist UI components (e.g., `components/WatchlistTable.tsx`)
- Brief description of what each component does

**C. Hooks:**
- File paths to watchlist-related hooks (e.g., `hooks/useWatchlist.ts`)
- What data does each hook provide?
- What mutations does each hook support?

**D. API Routes/Server Actions:**
- File paths to any backend logic for watchlist
- What operations exist? (add, remove, get, update)

**E. Types/Interfaces:**
- File paths to TypeScript types for watchlist
- Please include the actual type definitions

---

### 3. Chart Feature Inventory

**A. Chart Components:**
- File paths to all chart-related components
- Which component is the main entry point?
- What props/interfaces do they accept?

**B. Chart Data Format:**
- What data structure do charts expect?
- Example data format for price data (OHLCV?)
- How are timeframes handled?

**C. Chart Dependencies:**
- Which packages are required? (lightweight-charts version?)
- Are there any custom plugins or extensions?

**D. Chart Utilities:**
- Any helper functions for chart data transformation?
- Theme/styling utilities?

---

### 4. Data Flow & Architecture

**A. Watchlist Data Flow:**
```
[User Action] → [Hook/Component] → [Firebase/API] → [State Update] → [UI Re-render]
```
- Please map out this flow with actual file names
- Where is state managed? (React Context, Zustand, local state?)
- Are there any caching layers?

**B. Live Quotes Flow:**
```
[WebSocket] → [Manager/Service] → [State/Cache] → [Component Update]
```
- How does the FMP WebSocket integration work?
- File paths for WebSocket manager
- How are subscriptions managed?

**C. Authentication Flow:**
- Where are auth checks performed in watchlist components?
- What user info is needed? (uid, email, subscription status?)
- Are there any auth-gated features?

---

### 5. Component Dependencies & Coupling

**For each major component (watchlist table, chart, etc.):**

1. **Pure components** (no external dependencies):
   - Which components can be copied as-is?

2. **Firebase-coupled components**:
   - Which components have direct Firebase imports?
   - Where exactly is Firebase used? (hooks, direct calls?)

3. **Service-coupled components**:
   - Which components depend on specific services (WebSocket manager, etc.)?

4. **Shared utilities**:
   - Which utility functions do watchlist/charts depend on?
   - File paths to utility modules

---

### 6. Critical Code Snippets

Please provide:

**A. Watchlist Add/Remove Logic:**
```typescript
// How does adding a symbol to watchlist work?
// Include the actual function/hook code
```

**B. Live Quote Subscription:**
```typescript
// How does subscribing to live quotes work?
// Include WebSocket setup/subscribe/unsubscribe code
```

**C. Chart Data Adapter:**
```typescript
// How is API data transformed for charts?
// Include transformation logic
```

**D. Key TypeScript Interfaces:**
```typescript
// Main types used in watchlist/charts
interface WatchlistItem { ... }
interface ChartData { ... }
interface QuoteData { ... }
```

---

### 7. Migration Considerations

**Questions:**

1. **Complexity**: What's the most complex part of the watchlist feature?

2. **Edge Cases**: Are there any tricky edge cases we should know about?
   - Handling duplicate symbols?
   - Race conditions in WebSocket updates?
   - Offline behavior?

3. **Performance**: Any performance considerations?
   - How many symbols can be in a watchlist?
   - Is there pagination or virtualization?
   - How often do live quotes update?

4. **Known Issues**: Are there any known bugs or limitations?

5. **Feature Flags**: Are there any feature flags controlling watchlist/charts?

---

### 8. Dependencies & Package Versions

Please list:

**A. NPM packages specific to watchlist/charts:**
```json
{
  "lightweight-charts": "version",
  "other-package": "version"
}
```

**B. Peer dependencies or version constraints:**
- Any packages that must be specific versions?
- Any packages that conflict with Next.js 14 / React 18?

---

## Expected Output Format

Please provide your response in **structured markdown** with:

1. **Clear headings** for each section (matching sections above)
2. **File paths** relative to Sunday's root directory
3. **Code snippets** in TypeScript with proper syntax highlighting
4. **Data structures** as TypeScript interfaces or JSON examples
5. **Dependency lists** as JSON package.json format

---

## How We'll Use This Information

Once we receive your analysis, we will:

1. **Create Supabase schema** based on Firebase structure
2. **Copy components** into Fin Quote's `/components` directory
3. **Rewrite data hooks** to use Supabase instead of Firebase
4. **Adapt auth** to use Supabase Auth (replace `useAuth()` with our auth)
5. **Install dependencies** into Fin Quote's package.json
6. **Create integration routes** (e.g., `/app/watchlist/page.tsx`)
7. **Update navigation** to include Watchlist tab
8. **Ensure theme consistency** with Fin Quote's Tailwind config

---

## Questions?

If you need clarification on:
- Fin Quote's architecture
- Supabase patterns we use
- Our auth setup
- Our component structure

Please ask! We want to ensure smooth integration.

---

## Next Steps

After you provide this information, we will:
1. Review and create an integration plan
2. Set up Supabase tables for watchlist
3. Begin selective component migration
4. Adapt code to Fin Quote's patterns
5. Test integration thoroughly

Thank you for helping us build a unified financial platform!
