# Watchlist Integration Plan
## Sunday Trading Dashboard → Fin Quote

**Status:** Planning Phase
**Created:** 2025-11-16
**Integration Approach:** Full Integration (Watchlist First, Charts Second)
**Next.js Version:** Stay on 14 (adapt Sunday code)

---

## Executive Summary

Integrating Sunday's watchlist functionality into Fin Quote as a unified financial platform. This plan focuses on **watchlist first**, then charts in Phase 2. We'll migrate from Firebase to Supabase, adapt to Next.js 14, and maintain Fin Quote's theme.

---

## Integration Decisions

| Decision Point | Choice | Rationale |
|---|---|---|
| **Integration Depth** | Full integration, keep `/Watchlist` as reference | Complete when done, reference for verification |
| **Feature Priority** | Watchlist first, charts second | Lower complexity, delivers core value first |
| **Database** | Create Supabase tables first | Schema-driven approach prevents rework |
| **Navigation** | New "Watchlist" top-level tab | Equal importance to Chatbot/Market/Financials |
| **Authentication** | Clean start, Supabase Auth only | Pre-launch, no user migration needed |
| **Charts** | Watchlist-only (chart modal on ticker click) | Sunday's existing behavior, no Fin Quote stock page charts |
| **Live Quotes** | Skip WebSocket for now | Use FMP REST API (60s cache), add later if needed |
| **Styling** | Keep best of both | Gradual convergence, avoid massive refactor |
| **Next.js Version** | **Stay on Next.js 14** | Lower risk, Sunday code adapts easily |
| **Multi-Symbol** | Fin Quote = AAPL-only, Watchlist = any symbol | Distinct features, different purposes |

---

## Phase 1: Watchlist Foundation (Week 1-2)

### Milestone 1.1: Database Setup (Day 1)

**Objective:** Create Supabase schema equivalent to Firebase structure

**Tasks:**
1. Analyze Sunday's Firebase watchlist structure
2. Design Supabase equivalent tables
3. Create migration file
4. Run migration
5. Set up RLS (Row Level Security) policies

**Firebase Structure (Sunday):**
```
/users/{uid}/data/watchlist
{
  tabs: [
    {
      name: string,
      items: [
        { type: 'stock', symbol: string, tvSymbol?: string, exchange?: string, companyName?: string, isADR?: boolean } |
        { type: 'header', text: string }
      ]
    }
  ],
  activeTabIndex: number,
  updatedAt: timestamp
}
```

**Supabase Schema (Fin Quote):**
```sql
-- Watchlist tabs table
CREATE TABLE watchlist_tabs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Watchlist items table
CREATE TABLE watchlist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tab_id UUID REFERENCES watchlist_tabs(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('stock', 'header')),
  position INTEGER NOT NULL,

  -- Stock fields (nullable)
  symbol TEXT,
  tv_symbol TEXT,
  exchange TEXT,
  company_name TEXT,
  is_adr BOOLEAN,

  -- Header fields (nullable)
  header_text TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validation
  CONSTRAINT valid_stock CHECK (
    (type = 'stock' AND symbol IS NOT NULL) OR
    (type = 'header' AND header_text IS NOT NULL)
  )
);

-- User settings table
CREATE TABLE watchlist_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_tab_id UUID REFERENCES watchlist_tabs(id),
  show_extended_hours BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices
CREATE INDEX idx_watchlist_tabs_user_id ON watchlist_tabs(user_id);
CREATE INDEX idx_watchlist_tabs_position ON watchlist_tabs(user_id, position);
CREATE INDEX idx_watchlist_items_tab_id ON watchlist_items(tab_id);
CREATE INDEX idx_watchlist_items_position ON watchlist_items(tab_id, position);

-- RLS Policies
ALTER TABLE watchlist_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watchlist tabs"
  ON watchlist_tabs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watchlist tabs"
  ON watchlist_tabs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watchlist tabs"
  ON watchlist_tabs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own watchlist tabs"
  ON watchlist_tabs FOR DELETE
  USING (auth.uid() = user_id);

-- Similar policies for watchlist_items and watchlist_settings
```

**Deliverables:**
- [ ] `/supabase/migrations/20241116_create_watchlist_tables.sql`
- [ ] Migration applied to Supabase project
- [ ] RLS policies tested

---

### Milestone 1.2: Server Actions (Day 2-3)

**Objective:** Build Supabase-backed watchlist CRUD operations

**Create these server actions in `/app/actions/watchlist/`:**

1. **`get-watchlist.ts`** - Fetch user's complete watchlist
2. **`create-tab.ts`** - Create new watchlist tab
3. **`update-tab.ts`** - Rename tab, reorder tabs
4. **`delete-tab.ts`** - Delete watchlist tab
5. **`set-active-tab.ts`** - Set active tab
6. **`add-item.ts`** - Add stock or header to tab
7. **`update-item.ts`** - Update item (rename header, update stock info)
8. **`delete-item.ts`** - Remove item from tab
9. **`reorder-items.ts`** - Reorder items within tab
10. **`get-settings.ts`** - Get user watchlist settings
11. **`update-settings.ts`** - Update settings (extended hours toggle)

**Pattern to follow (from Fin Quote's existing actions):**
```typescript
'use server';

import { createServerClient } from '@/lib/supabase/server';

export async function getWatchlist() {
  const supabase = createServerClient();

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Not authenticated');
  }

  // Fetch tabs with items
  const { data: tabs, error } = await supabase
    .from('watchlist_tabs')
    .select(`
      *,
      items:watchlist_items(*)
    `)
    .eq('user_id', user.id)
    .order('position', { ascending: true });

  if (error) throw error;

  return tabs;
}
```

**Deliverables:**
- [ ] All 11 server actions implemented
- [ ] TypeScript types for watchlist data
- [ ] Error handling for all actions
- [ ] Test each action with Supabase dashboard

---

### Milestone 1.3: Core Hooks (Day 4-5)

**Objective:** Create React hooks that wrap server actions

**Hooks to create in `/hooks/`:**

1. **`useWatchlist.ts`** - Main watchlist state management
   - Fetches watchlist on mount
   - Provides add/remove/reorder functions
   - Handles optimistic updates
   - Auto-saves to Supabase

2. **`useWatchlistSettings.ts`** - User settings
   - Extended hours toggle
   - Other preferences

3. **`useChartModal.ts`** - Chart modal state
   - Open/close chart
   - Track current symbol and timeframe

**Pattern (adapt from Sunday's hooks):**
```typescript
'use client';

import { useState, useEffect } from 'react';
import { getWatchlist, addItem } from '@/app/actions/watchlist';

export function useWatchlist() {
  const [tabs, setTabs] = useState([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadWatchlist();
  }, []);

  async function loadWatchlist() {
    setIsLoading(true);
    try {
      const data = await getWatchlist();
      setTabs(data.tabs);
      setActiveTabIndex(data.activeTabIndex);
    } finally {
      setIsLoading(false);
    }
  }

  async function addSymbol(symbol: string) {
    // Optimistic update
    const newTabs = [...tabs];
    newTabs[activeTabIndex].items.push({ type: 'stock', symbol });
    setTabs(newTabs);

    // Server update
    await addItem(tabs[activeTabIndex].id, { type: 'stock', symbol });
  }

  return {
    tabs,
    activeTabIndex,
    isLoading,
    addSymbol,
    // ... other methods
  };
}
```

**Deliverables:**
- [ ] `useWatchlist.ts` with full CRUD operations
- [ ] `useWatchlistSettings.ts` for preferences
- [ ] `useChartModal.ts` for chart state
- [ ] Optimistic UI updates working

---

### Milestone 1.4: Basic UI Components (Day 6-8)

**Objective:** Copy and adapt Sunday's components for Fin Quote

**Components to integrate:**

**Priority 1 (Core functionality):**
1. **`WatchlistTable/index.tsx`** - Main table component
2. **`WatchlistTable/StockRow.tsx`** - Individual stock row
3. **`WatchlistTable/TableCell.tsx`** - Table cell rendering
4. **`SymbolSearchDropdown.tsx`** - Symbol search/add
5. **`TabManager.tsx`** - Tab navigation
6. **`ActionsDropdown.tsx`** - Actions menu (delete mode, reorder, add header)

**Priority 2 (Nice-to-have):**
7. **`ExtendedHoursToggle.tsx`** - Toggle for extended hours
8. **`ThemeToggle.tsx`** - Use Fin Quote's existing one or adapt Sunday's

**Adaptation steps for each component:**

1. **Copy file** from `/Watchlist/components/` to `/components/`
2. **Update imports:**
   - Firebase → Supabase patterns
   - `@/lib/firebase/auth-context` → `@/lib/supabase/auth` (or create equivalent)
   - `@/hooks/useWatchlist` → Use new Supabase-based hook
3. **Update data access:**
   - Remove Firebase calls
   - Use server actions via hooks
4. **Update styling:**
   - Keep Sunday's Tailwind classes for now
   - Ensure dark mode works with Fin Quote's theme
5. **Test component** in isolation

**Example adaptation:**
```typescript
// Before (Sunday - Firebase)
import { useAuth } from '@/lib/firebase/auth-context';
import { useWatchlist } from '@/hooks/useWatchlist'; // Firebase version

// After (Fin Quote - Supabase)
import { useAuth } from '@/lib/supabase/auth'; // Create this
import { useWatchlist } from '@/hooks/useWatchlist'; // New Supabase version
```

**Deliverables:**
- [ ] All Priority 1 components copied and adapted
- [ ] Components rendering without errors
- [ ] Basic interactivity working (add/remove/reorder)
- [ ] Dark mode functional

---

### Milestone 1.5: Watchlist Page Route (Day 9-10)

**Objective:** Create `/app/watchlist/page.tsx` using adapted components

**Tasks:**

1. **Create page file** at `/app/watchlist/page.tsx`
2. **Copy structure** from Sunday's `/Watchlist/app/watchlist/page.tsx`
3. **Replace Firebase auth** with Supabase auth check
4. **Wire up components** to use new hooks
5. **Add to navigation** - Update `/components/Navigation.tsx`

**Page structure:**
```typescript
'use client';

import { useWatchlist } from '@/hooks/useWatchlist';
import WatchlistTable from '@/components/WatchlistTable';
import TabManager from '@/components/TabManager';
import { SymbolSearchDropdown } from '@/components/SymbolSearchDropdown';
import { ChartModal } from '@/components/TradingView/ChartModal';

export default function WatchlistPage() {
  const {
    tabs,
    activeTabIndex,
    isLoading,
    addSymbol,
    removeSymbol,
    // ... other methods
  } = useWatchlist();

  if (isLoading) {
    return <div>Loading watchlist...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[rgb(33,33,33)]">
      <Navigation />

      {/* Tab manager */}
      <TabManager
        tabs={tabs}
        activeTabIndex={activeTabIndex}
        // ... props
      />

      {/* Controls row */}
      <div className="watchlist-controls">
        <SymbolSearchDropdown onSelect={addSymbol} />
        {/* ... other controls */}
      </div>

      {/* Watchlist table */}
      <WatchlistTable
        symbols={currentTabSymbols}
        onRemoveSymbol={removeSymbol}
        onSymbolClick={openChart}
        // ... props
      />

      {/* Chart modal (Phase 2) */}
      <ChartModal {...chartProps} />
    </div>
  );
}
```

**Navigation update:**
```typescript
// components/Navigation.tsx
<Link
  href="/watchlist"
  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
    pathname === '/watchlist'
      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
  }`}
>
  Watchlist
</Link>
```

**Deliverables:**
- [ ] `/app/watchlist/page.tsx` created
- [ ] Page accessible at `http://localhost:3002/watchlist`
- [ ] "Watchlist" tab added to navigation
- [ ] Tab highlights when on watchlist page
- [ ] Basic watchlist functionality working (view, add, remove)

---

### Milestone 1.6: Data Integration (Day 11-12)

**Objective:** Connect watchlist to real stock data from FMP API

**Tasks:**

1. **Reuse Fin Quote's FMP integration**
   - Watchlist should use existing `FMP_API_KEY`
   - Leverage existing price fetching patterns from market dashboard

2. **Create quote fetching hook** - `useWatchlistQuotes.ts`
   - Fetches real-time quotes for all symbols in watchlist
   - Polls during market hours (adapt Sunday's polling strategy)
   - Caches with 60-second TTL

3. **Integrate with WatchlistTable**
   - Pass quote data to StockRow components
   - Display price, change, % change
   - Color code red/green based on movement

**Quote fetching pattern:**
```typescript
'use client';

import { useState, useEffect } from 'react';

export function useWatchlistQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (symbols.length === 0) return;

    async function fetchQuotes() {
      setIsLoading(true);
      try {
        // Call Fin Quote's existing quote endpoint or create new one
        const response = await fetch(`/api/watchlist/quotes?symbols=${symbols.join(',')}`);
        const data = await response.json();
        setQuotes(data);
      } finally {
        setIsLoading(false);
      }
    }

    fetchQuotes();

    // Poll every 60 seconds during market hours
    const interval = setInterval(fetchQuotes, 60000);
    return () => clearInterval(interval);
  }, [symbols]);

  return { quotes, isLoading };
}
```

**May need to create:**
- `/app/api/watchlist/quotes/route.ts` - Batch quote endpoint
  - Takes comma-separated symbols
  - Returns { [symbol]: Quote } object
  - Uses FMP API key
  - Caches with 60s TTL

**Deliverables:**
- [ ] `useWatchlistQuotes.ts` hook created
- [ ] Quote API route created (if needed)
- [ ] Real prices displaying in watchlist
- [ ] Auto-refresh working (60s poll)
- [ ] Price change colors working (red/green)

---

### Milestone 1.7: Testing & Polish (Day 13-14)

**Objective:** Test complete watchlist feature and fix bugs

**Testing checklist:**

**Functionality:**
- [ ] Add symbol to watchlist
- [ ] Remove symbol from watchlist
- [ ] Create new tab
- [ ] Rename tab
- [ ] Delete tab
- [ ] Switch between tabs
- [ ] Reorder symbols within tab
- [ ] Add header rows
- [ ] Rename headers
- [ ] Delete mode (select multiple, delete)
- [ ] Reorder mode (drag and drop)

**Data persistence:**
- [ ] Watchlist persists after page reload
- [ ] Changes sync to Supabase
- [ ] Multiple tabs work correctly
- [ ] Active tab remembered

**Authentication:**
- [ ] Watchlist requires login
- [ ] Each user sees only their watchlist
- [ ] RLS policies working

**UI/UX:**
- [ ] Dark mode works
- [ ] Responsive on different screen sizes
- [ ] Keyboard shortcuts work (if any from Sunday)
- [ ] Loading states clear
- [ ] Error messages helpful

**Performance:**
- [ ] No unnecessary re-renders
- [ ] Quote polling doesn't block UI
- [ ] Large watchlists (100+ symbols) perform well

**Deliverables:**
- [ ] All functionality tests passing
- [ ] Bug list created and prioritized
- [ ] Critical bugs fixed
- [ ] Phase 1 complete and stable

---

## Phase 2: Chart Integration (Week 3-4)

### Milestone 2.1: Dependencies & Setup (Day 1)

**Objective:** Install chart libraries and copy chart components

**Tasks:**

1. **Install dependencies** from Sunday's package.json:
```bash
npm install lightweight-charts@5.0.0
# Any other chart-specific dependencies
```

2. **Copy chart components** from Sunday to Fin Quote:
   - `/components/TradingView/TradingViewChart.tsx`
   - `/components/TradingView/ChartModal.tsx`
   - `/components/TradingView/TimeframeSelector.tsx`
   - `/components/TradingView/DrawingToolbar.tsx`
   - `/components/TradingView/plugins/extended-hours-overlay.ts`
   - `/components/TradingView/plugins/trend-line.ts`

3. **Copy chart utilities:**
   - `/utils/chart-helpers.ts` (if not conflicts with Fin Quote's)
   - `/hooks/useChartData.ts`

**Deliverables:**
- [ ] lightweight-charts installed
- [ ] Chart components copied to Fin Quote
- [ ] No import errors

---

### Milestone 2.2: Chart Data API (Day 2-3)

**Objective:** Create API route to fetch historical price data for charts

**Create:**
- `/app/api/watchlist/chart-data/route.ts`

**Functionality:**
- Accepts symbol and timeframe (1D, 1W, 1M, 3M, 1Y, ALL)
- Fetches from FMP API
- Returns OHLCV data formatted for lightweight-charts
- Caches with appropriate TTL

**Pattern:**
```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const timeframe = searchParams.get('timeframe') || '1D';

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  try {
    // Fetch from FMP API
    const data = await fetchHistoricalPrices(symbol, timeframe);

    // Transform to chart format
    const chartData = transformToOHLCV(data);

    return NextResponse.json(chartData);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

**Deliverables:**
- [ ] Chart data API route created
- [ ] Returns correct OHLCV format
- [ ] All timeframes working
- [ ] Caching implemented

---

### Milestone 2.3: Chart Modal Integration (Day 4-5)

**Objective:** Wire chart modal to watchlist table

**Tasks:**

1. **Update WatchlistTable** to open chart on symbol click
2. **Wire ChartModal** to useChartModal hook
3. **Pass chart data** from API to chart component
4. **Test chart rendering** for various symbols

**Integration:**
```typescript
// In watchlist page
const { isOpen, symbol, timeframe, openChart, closeChart } = useChartModal();

// In WatchlistTable
<StockRow
  onSymbolClick={openChart}
  // ... other props
/>

// Chart modal
<ChartModal
  isOpen={isOpen}
  symbol={symbol}
  timeframe={timeframe}
  onClose={closeChart}
/>
```

**Deliverables:**
- [ ] Clicking ticker opens chart modal
- [ ] Chart displays correct symbol
- [ ] Timeframe selector works
- [ ] Close button works
- [ ] Keyboard shortcuts work (ESC to close)

---

### Milestone 2.4: Chart Features (Day 6-7)

**Objective:** Enable drawing tools and extended hours overlay

**Tasks:**

1. **Drawing toolbar** - Enable trendline drawing
2. **Extended hours overlay** - Show pre/post market sessions
3. **Theme integration** - Match Fin Quote's dark/light mode
4. **Performance** - Ensure smooth rendering with large datasets

**Deliverables:**
- [ ] Drawing tools functional
- [ ] Extended hours overlay working
- [ ] Charts adapt to theme changes
- [ ] No performance issues

---

### Milestone 2.5: Testing & Polish (Day 8)

**Objective:** Test complete chart integration

**Testing checklist:**
- [ ] Chart opens for any symbol
- [ ] All timeframes work
- [ ] Drawing tools functional
- [ ] Extended hours display correctly
- [ ] Chart closes properly
- [ ] Multiple symbols tested
- [ ] Dark/light mode switching works
- [ ] Performance good with frequent opens/closes

**Deliverables:**
- [ ] All chart tests passing
- [ ] Bugs fixed
- [ ] Phase 2 complete

---

## Phase 3: Final Integration (Week 5)

### Milestone 3.1: Styling Convergence (Day 1-2)

**Objective:** Harmonize Sunday and Fin Quote themes

**Tasks:**

1. **Identify style conflicts**
   - List components with different colors/fonts/spacing
   - Decide which style to keep

2. **Update Tailwind config** if needed
   - Merge color palettes
   - Ensure CSS variables work across both

3. **Gradual updates**
   - Don't force everything at once
   - Focus on most jarring inconsistencies

**Deliverables:**
- [ ] Style audit complete
- [ ] Critical inconsistencies fixed
- [ ] App looks cohesive (not perfectly uniform)

---

### Milestone 3.2: Authentication Refinement (Day 3)

**Objective:** Ensure auth works seamlessly

**Tasks:**

1. **Protected routes** - Watchlist requires login
2. **Auth state** - Consistent across app
3. **Login redirect** - Redirect to watchlist after login (if that was intent)
4. **User menu** - Integrate with Fin Quote's existing UserMenu

**Deliverables:**
- [ ] Auth flow smooth
- [ ] No auth bugs
- [ ] User menu integrated

---

### Milestone 3.3: Documentation (Day 4)

**Objective:** Update docs for integrated app

**Tasks:**

1. **Update CLAUDE.md**
   - Add watchlist section
   - Document server actions
   - Document hooks
   - Update navigation structure

2. **Create WATCHLIST.md** (optional)
   - Detailed watchlist documentation
   - Schema reference
   - API reference

3. **Update README** (if exists)
   - Add watchlist to features list

**Deliverables:**
- [ ] CLAUDE.md updated
- [ ] Documentation accurate
- [ ] Integration notes added

---

### Milestone 3.4: Final Testing (Day 5)

**Objective:** End-to-end testing of integrated app

**Test all features:**
- [ ] Chatbot works
- [ ] Market dashboard works
- [ ] Stock details page works
- [ ] Watchlist works
- [ ] Charts work
- [ ] Navigation works
- [ ] Auth works
- [ ] Dark mode works
- [ ] No console errors
- [ ] No broken links

**Performance:**
- [ ] Page load times acceptable
- [ ] No memory leaks
- [ ] Polling doesn't slow down app

**Deliverables:**
- [ ] All features working
- [ ] Integration complete
- [ ] Ready for next phase (deployment or new features)

---

## Dependencies to Install

From Sunday's package.json, we'll need:

```json
{
  "lightweight-charts": "^5.0.0",
  // May need others depending on what features we integrate
}
```

**Installation:**
```bash
cd /Users/cliffordtraff/Desktop/Fin\ Quote
npm install lightweight-charts@^5.0.0
```

---

## File Structure After Integration

```
/Fin Quote/
├── Watchlist/                  # Reference codebase (temporary, delete when done)
├── app/
│   ├── actions/
│   │   └── watchlist/          # NEW - Watchlist server actions
│   │       ├── get-watchlist.ts
│   │       ├── add-item.ts
│   │       ├── create-tab.ts
│   │       └── ...
│   ├── api/
│   │   └── watchlist/          # NEW - Watchlist API routes
│   │       ├── quotes/route.ts
│   │       └── chart-data/route.ts
│   ├── watchlist/              # NEW - Watchlist page
│   │   └── page.tsx
│   ├── (existing pages...)
│   └── layout.tsx              # May need updates
├── components/
│   ├── Navigation.tsx          # UPDATE - Add Watchlist tab
│   ├── WatchlistTable/         # NEW - From Sunday
│   │   ├── index.tsx
│   │   ├── StockRow.tsx
│   │   └── TableCell.tsx
│   ├── TradingView/            # NEW - From Sunday (Phase 2)
│   │   ├── TradingViewChart.tsx
│   │   ├── ChartModal.tsx
│   │   ├── TimeframeSelector.tsx
│   │   └── plugins/
│   ├── SymbolSearchDropdown.tsx # NEW - From Sunday
│   ├── TabManager.tsx          # NEW - From Sunday
│   ├── ActionsDropdown.tsx     # NEW - From Sunday
│   └── (existing components...)
├── hooks/
│   ├── useWatchlist.ts         # NEW - Supabase version
│   ├── useWatchlistQuotes.ts   # NEW
│   ├── useWatchlistSettings.ts # NEW
│   ├── useChartModal.ts        # NEW - From Sunday (Phase 2)
│   └── (existing hooks...)
├── lib/
│   ├── supabase/
│   │   └── auth.ts             # May need to create for auth hook
│   └── (existing lib...)
├── supabase/
│   └── migrations/
│       └── 20241116_create_watchlist_tables.sql  # NEW
└── docs/
    ├── WATCHLIST_INTEGRATION_PLAN.md  # This file
    └── (existing docs...)
```

---

## Next.js 14 vs 15 Compatibility

**Decision: Stay on Next.js 14**

**Adaptation needed for Sunday code:**

1. **Server Components vs Client Components**
   - Sunday uses Next.js 15, Fin Quote uses 14
   - Minimal differences in App Router between 14 and 15
   - Most Sunday components marked 'use client' will work as-is

2. **Import changes**
   - Sunday: `import { useRouter } from 'next/navigation'`
   - Fin Quote: Same (Next.js 14 has this)
   - No changes needed

3. **Fetch caching**
   - Next.js 15 changed default caching behavior
   - Sunday code may have explicit `cache: 'no-store'` or `next: { revalidate: X }`
   - These work in Next.js 14, no changes needed

4. **Server Actions**
   - Both Next.js 14 and 15 support Server Actions
   - Sunday's pattern: `'use server'` at top of file
   - Fin Quote's pattern: Same
   - No changes needed

**Potential issues:**
- React 19 features in Sunday (if any) → Check for new hooks
- Turbopack in Sunday → Fin Quote uses Webpack (doesn't affect runtime)

**Bottom line:** Minimal adaptation needed. Most Sunday code will work as-is in Fin Quote's Next.js 14 environment.

---

## Risk Mitigation

### High-Risk Areas:

1. **Schema design**
   - **Risk:** Incorrect schema causes data loss or performance issues
   - **Mitigation:** Thoroughly review Firebase structure, test with sample data first

2. **Authentication**
   - **Risk:** Users locked out or see wrong data
   - **Mitigation:** Test RLS policies extensively, manual testing with multiple accounts

3. **Data migration**
   - **Risk:** N/A (clean start, no existing users)
   - **Mitigation:** N/A

4. **Performance with large watchlists**
   - **Risk:** App slows down with 100+ symbols
   - **Mitigation:** Test with large datasets, implement pagination or virtualization if needed

5. **Quote polling**
   - **Risk:** Too many API calls, hit rate limits
   - **Mitigation:** Batch requests, implement intelligent polling (only during market hours)

### Testing Strategy:

1. **Unit testing:** Test each server action individually
2. **Integration testing:** Test hooks with real Supabase
3. **E2E testing:** Manual testing of complete user flows
4. **Performance testing:** Test with 100+ symbols
5. **Security testing:** Verify RLS policies, auth checks

---

## Success Criteria

**Phase 1 (Watchlist) is complete when:**
- [ ] User can add/remove symbols to watchlist
- [ ] Watchlist persists in Supabase
- [ ] Multiple tabs work
- [ ] Real-time quotes display
- [ ] Auto-refresh works
- [ ] Dark mode functional
- [ ] No critical bugs
- [ ] Documentation updated

**Phase 2 (Charts) is complete when:**
- [ ] Clicking symbol opens chart modal
- [ ] All timeframes work
- [ ] Drawing tools functional
- [ ] Extended hours overlay works
- [ ] Performance acceptable
- [ ] No critical bugs

**Integration is complete when:**
- [ ] All Fin Quote features still work
- [ ] Watchlist fully functional
- [ ] Charts fully functional
- [ ] Styling consistent enough
- [ ] Auth seamless
- [ ] Documentation complete
- [ ] `/Watchlist` folder can be deleted

---

## Timeline Summary

| Phase | Duration | Milestones |
|---|---|---|
| **Phase 1: Watchlist** | 2 weeks | Database, Server Actions, Hooks, UI Components, Page Route, Data Integration, Testing |
| **Phase 2: Charts** | 1-1.5 weeks | Dependencies, Chart API, Modal Integration, Drawing Tools, Testing |
| **Phase 3: Final** | 0.5-1 week | Styling, Auth, Documentation, Final Testing |
| **Total** | **3.5-4.5 weeks** | Full integration complete |

---

## Open Questions

**For user to decide:**

1. **Extended hours data** - Do we want to support this in Phase 1 or Phase 2?
2. **News integration** - Sunday has news features. Integrate them? (Future phase?)
3. **Stripe payments** - Sunday has Stripe. Integrate for premium watchlist features? (Future phase?)
4. **Symbol search** - Use Sunday's symbol search or build new one with FMP?
5. **Mobile responsive** - How important is mobile support for watchlist?

---

## Notes

- Keep `/Watchlist` folder as reference throughout integration
- Delete `/Watchlist` only when 100% confident integration is complete
- Commit frequently with descriptive messages
- Test on separate branch first, merge to main when stable
- Consider creating `feature/watchlist-integration` branch

---

## Next Steps

**Immediate actions:**

1. **Confirm Next.js version decision** (Stay on 14? Upgrade to 15?)
2. **Review this plan** - Any changes needed?
3. **Start Phase 1, Milestone 1.1** - Create Supabase schema
4. **Set up project board** (optional) - Track milestones in GitHub Issues

**Ready to begin? Let's start with the database schema!**
