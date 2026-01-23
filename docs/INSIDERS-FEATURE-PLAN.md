# Insiders Page - Full Feature Implementation Plan

## Current State (MVP Complete)
- ✅ Basic page at `/insiders` with navigation link
- ✅ Server action: `getLatestInsiderTrades(limit)`
- ✅ Table component with 8 columns, transaction colors
- ✅ ISR caching (5 minutes)

---

## Features to Add

### 1. Three Views (Tabs)
| Tab | Description | Data Source |
|-----|-------------|-------------|
| Latest Trades | All recent trades (default) | Existing function |
| By Ticker | Search trades for a symbol | New: `getInsiderTradesBySymbol()` |
| By Insider | Search by insider name | Client-side filter |

### 2. Filters (All Tabs)
- **Transaction Type**: All, Purchase, Sale, Option Exercise, Award, Gift
- **Date Range**: All Time, Past Week, Past Month, Past Quarter, Past Year

### 3. Table Enhancements
- Clickable symbols → `/stock/{symbol}`
- Sortable columns (click header)
- Pagination (50 per page)

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `app/actions/insider-trading.ts` | **Modify** | Add `getInsiderTradesBySymbol()` |
| `components/InsidersPageClient.tsx` | **Create** | Client component with tabs, filters, state |
| `components/InsiderFilters.tsx` | **Create** | Transaction type + date range dropdowns |
| `components/InsiderTradesTable.tsx` | **Modify** | Add links, sorting, pagination |
| `app/insiders/page.tsx` | **Modify** | Pass initial data to client component |

---

## Implementation Phases

### Phase 1: Server Action Enhancement
**File:** `app/actions/insider-trading.ts`

Add symbol-filtered function:
```typescript
export async function getInsiderTradesBySymbol(
  symbol: string,
  limit: number = 100
): Promise<{ trades: InsiderTrade[] } | { error: string }>
```
FMP endpoint: `?symbol=${symbol}&limit=${limit}&apikey=${apiKey}`

---

### Phase 2: Client Component with Tabs
**File:** `components/InsidersPageClient.tsx`

```typescript
type ViewType = 'latest' | 'ticker' | 'insider'

// State
const [activeView, setActiveView] = useState<ViewType>('latest')
const [trades, setTrades] = useState<InsiderTrade[]>(initialTrades)
const [searchQuery, setSearchQuery] = useState('')
const [isLoading, setIsLoading] = useState(false)

// Filter state
const [transactionFilter, setTransactionFilter] = useState('all')
const [dateFilter, setDateFilter] = useState('all')

// Pagination
const [page, setPage] = useState(1)
const ROWS_PER_PAGE = 50
```

**Tab UI Pattern:** Follow `FinancialStatementsTabs.tsx`
- Three tab buttons with active state styling
- Conditional search input (shown for ticker/insider tabs)

---

### Phase 3: Filter Component
**File:** `components/InsiderFilters.tsx`

Two dropdown selects:

```typescript
interface InsiderFiltersProps {
  transactionFilter: string
  onTransactionChange: (value: string) => void
  dateFilter: string
  onDateChange: (value: string) => void
}
```

Options:
- Transaction: `all | purchase | sale | option | award | gift`
- Date: `all | week | month | quarter | year`

---

### Phase 4: Table Enhancements
**File:** `components/InsiderTradesTable.tsx`

Add:
1. **Link wrapper** on Symbol column: `<Link href={/stock/${symbol}}>`
2. **Sort state** + clickable headers with arrow indicator
3. **Pagination footer**: "Page X of Y" with Prev/Next buttons

```typescript
type SortField = 'symbol' | 'transactionDate' | 'securitiesTransacted' | 'price'
type SortDir = 'asc' | 'desc'

// Props additions
interface InsiderTradesTableProps {
  trades: InsiderTrade[]
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}
```

---

### Phase 5: Wire Up Page
**File:** `app/insiders/page.tsx`

```typescript
export default async function InsidersPage() {
  const result = await getLatestInsiderTrades(200)
  const initialTrades = 'trades' in result ? result.trades : []

  return (
    <div className="min-h-screen ...">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h1>Insider Trading</h1>
        <InsidersPageClient initialTrades={initialTrades} />
      </main>
    </div>
  )
}
```

---

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│ Insider Trading                                      │
│                                                      │
│ [Latest Trades] [By Ticker] [By Insider]            │
│                                                      │
│ Transaction: [All ▼]  Date: [All Time ▼]  [Search]  │
│                                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Symbol▼ │ Insider │ Title │ Type │ Shares │ ... │ │
│ ├─────────┼─────────┼───────┼──────┼────────┼─────┤ │
│ │ AAPL    │ Cook    │ CEO   │  S   │  50K   │ ... │ │
│ └─────────────────────────────────────────────────┘ │
│                                                      │
│ Page 1 of 4              [< Prev] [Next >]          │
└─────────────────────────────────────────────────────┘
```

---

## Client-Side Filtering Logic

```typescript
const filteredTrades = useMemo(() => {
  return trades.filter(trade => {
    // Transaction type
    if (transactionFilter !== 'all') {
      const typeMap: Record<string, string> = {
        purchase: 'P', sale: 'S', option: 'M', award: 'A', gift: 'G'
      }
      if (trade.transactionType?.charAt(0) !== typeMap[transactionFilter]) {
        return false
      }
    }
    // Date range
    if (dateFilter !== 'all') {
      const days: Record<string, number> = { week: 7, month: 30, quarter: 90, year: 365 }
      const tradeDate = new Date(trade.transactionDate)
      const daysDiff = (Date.now() - tradeDate.getTime()) / 86400000
      if (daysDiff > days[dateFilter]) return false
    }
    return true
  })
}, [trades, transactionFilter, dateFilter])
```

---

## Search Logic by Tab

**By Ticker tab:**
- Input with 300ms debounce
- Calls `getInsiderTradesBySymbol(symbol.toUpperCase())`
- Shows loading spinner during fetch

**By Insider tab:**
- Input filters client-side on `trade.reportingName`
- Case-insensitive contains match
- Instant filtering (no API call)

---

## Key Patterns Reference

| Pattern | File |
|---------|------|
| Tab switching | `components/FinancialStatementsTabs.tsx` |
| Debounced search | `components/StockSearch.tsx` |
| Dropdown select | Native `<select>` with Tailwind styling |
| Pagination | Standard prev/next with page state |

---

## Transaction Type Colors

| Type | Letter | Color |
|------|--------|-------|
| Purchase | P | Green |
| Sale | S | Red |
| Option Exercise | M | Gray |
| Award | A | Gray |
| Gift | G | Gray |

---

## FMP API Reference

**Endpoint:** `https://financialmodelingprep.com/api/v4/insider-trading`

**Supported Parameters:**
| Param | Description |
|-------|-------------|
| `symbol` | Filter by stock symbol |
| `limit` | Number of results (default: 100) |
| `page` | Pagination offset |
| `apikey` | API authentication |

**Cache:** 5 minutes (`revalidate: 300`)

---

## Implementation Checklist

### Phase 1: Server Action
- [ ] Add `getInsiderTradesBySymbol()` to `insider-trading.ts`

### Phase 2: Client Component
- [ ] Create `InsidersPageClient.tsx` with tab state
- [ ] Add tab buttons with styling
- [ ] Wire up tab switching logic

### Phase 3: Filters
- [ ] Create `InsiderFilters.tsx` with two dropdowns
- [ ] Implement client-side filtering with `useMemo`

### Phase 4: Table Enhancements
- [ ] Add `<Link>` to Symbol column
- [ ] Add sortable column headers
- [ ] Add pagination controls

### Phase 5: Integration
- [ ] Update `page.tsx` to use client component
- [ ] Test all three views
- [ ] Test filters and sorting
