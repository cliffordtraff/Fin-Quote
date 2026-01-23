# Insider Trading Feature Documentation

## Overview

The Insider Trading page (`/insiders`) displays SEC Form 4 filings data, allowing users to track stock transactions made by corporate insiders (executives, directors, and major shareholders). Data is sourced from the Financial Modeling Prep (FMP) API.

**Route:** `/insiders`
**Navigation:** Accessible via the main navigation bar

---

## Data Source

### FMP API Endpoint

```
https://financialmodelingprep.com/api/v4/insider-trading
```

### Supported Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Filter by stock ticker (e.g., `AAPL`) |
| `limit` | Number of results to return (default: 100, max used: 500) |
| `apikey` | FMP API authentication key |

### Caching Strategy

- **ISR (Incremental Static Regeneration):** Page revalidates every 5 minutes (`revalidate: 300`)
- **Fetch cache:** API responses cached for 5 minutes via Next.js fetch options

---

## Data Model

### InsiderTrade Interface

```typescript
interface InsiderTrade {
  symbol: string              // Stock ticker (e.g., "AAPL")
  filingDate: string          // Date the Form 4 was filed with SEC
  transactionDate: string     // Date the transaction occurred
  reportingName: string       // Name of the insider
  typeOfOwner: string         // Role/title (e.g., "officer", "director")
  transactionType: string     // Transaction code (P, S, M, A, G, etc.)
  securitiesTransacted: number // Number of shares traded
  price: number | null        // Price per share (null if not disclosed)
  securitiesOwned: number     // Total shares owned after transaction
  securityName: string        // Security description
  link: string                // URL to SEC filing
  acquistionOrDisposition: string // "A" for acquisition, "D" for disposition
  formType: string            // SEC form type (typically "4")
}
```

---

## Server Actions

### `getLatestInsiderTrades(limit: number)`

Fetches the most recent insider trades across all companies.

**Location:** `app/actions/insider-trading.ts`

**Parameters:**
- `limit` (optional): Number of trades to fetch (default: 100)

**Returns:** `{ trades: InsiderTrade[] }` or `{ error: string }`

**Usage:**
```typescript
const result = await getLatestInsiderTrades(200)
if ('trades' in result) {
  // result.trades contains the array
}
```

### `getInsiderTradesBySymbol(symbol: string, limit: number)`

Fetches insider trades for a specific stock ticker.

**Location:** `app/actions/insider-trading.ts`

**Parameters:**
- `symbol` (required): Stock ticker (auto-uppercased)
- `limit` (optional): Number of trades to fetch (default: 100)

**Returns:** `{ trades: InsiderTrade[] }` or `{ error: string }`

**Validation:**
- Returns error if symbol is empty or whitespace-only

---

## UI Components

### Page Component (`app/insiders/page.tsx`)

Server component that:
1. Fetches initial 200 trades via `getLatestInsiderTrades`
2. Renders navigation and page title
3. Passes data to `InsidersPageClient`

### Client Component (`components/InsidersPageClient.tsx`)

Main interactive component with state management for:
- Active view/tab
- Search queries
- Filters
- Pagination

### Table Component (`components/InsiderTradesTable.tsx`)

Renders the trades data table with:
- Sortable columns
- Formatted values
- Clickable stock symbols

---

## Views (Tabs)

### 1. Latest Trades (Default)

Displays the most recent 200 insider trades across all companies, sorted by transaction date (newest first).

**Data fetch:** 200 trades via `getLatestInsiderTrades`

### 2. Top Trades (Week)

Shows the highest-value trades from the past 7 days, ranked by total transaction value.

**Data fetch:** 500 trades via `getLatestInsiderTrades` (larger pool for better ranking)

**Special filtering:**
- Only trades with `price > 0` and `securitiesTransacted > 0`
- Only trades within the last 7 days
- Sorted by value (shares × price) descending
- Date filter dropdown is hidden (fixed to 7 days)

**Default sort:** By value (descending)

### 3. By Ticker

Search for insider trades by stock symbol.

**Behavior:**
- Text input with 300ms debounce
- Calls `getInsiderTradesBySymbol` on input change
- Shows loading spinner during API call
- Input auto-uppercases for consistency
- Minimum 1 character required to trigger search

**Data fetch:** Up to 200 trades for the specified symbol

### 4. By Insider

Filter trades by insider name.

**Behavior:**
- Client-side filtering (no API call)
- Case-insensitive substring matching on `reportingName`
- Filters against the latest trades dataset
- Instant filtering as user types

---

## Filters

### Transaction Type Filter

Dropdown to filter by transaction type.

| Option | Code | Description |
|--------|------|-------------|
| All | — | Show all transactions |
| Purchase | P | Open market purchase |
| Sale | S | Open market sale |
| Option Exercise | M | Exercise of derivative security |
| Award | A | Stock award/grant |
| Gift | G | Gift of securities |

**Implementation:** First character of `transactionType` is compared against the code.

### Date Range Filter

Dropdown to filter by transaction date (hidden in "Top Trades" view).

| Option | Days |
|--------|------|
| All Time | — |
| Past Week | 7 |
| Past Month | 30 |
| Past Quarter | 90 |
| Past Year | 365 |

**Calculation:** `(now - transactionDate) / 86400000 <= days`

---

## Table Features

### Columns

| Column | Field | Sortable | Format |
|--------|-------|----------|--------|
| Symbol | `symbol` | Yes | Clickable link to `/stock/{symbol}` |
| Insider | `reportingName` | No | Truncated with tooltip |
| Title | `typeOfOwner` | No | Truncated to 20 chars |
| Type | `transactionType` | No | Single letter (P/S/M/A/G) |
| Shares | `securitiesTransacted` | Yes | K/M suffix formatting |
| Price | `price` | Yes | `$XX.XX` format |
| Value | calculated | Yes | `$XXK` / `$XXM` format |
| Date | `transactionDate` | Yes | `MMM DD, 'YY` format |

### Sorting

- Click any sortable column header to sort
- Click again to toggle between ascending/descending
- Current sort indicated by arrow (↑/↓)
- Unsorted columns show neutral indicator (↕)

**Default sort:**
- "Top Trades" view: By value (descending)
- All other views: By transaction date (descending)

### Transaction Type Colors

| Type | Color |
|------|-------|
| Purchase (P) | Green |
| Sale (S) | Red |
| Option/Award/Gift | Gray |

### Value Formatting

| Range | Format | Example |
|-------|--------|---------|
| ≥ $1,000,000 | `$X.XM` | `$12.5M` |
| ≥ $1,000 | `$XK` | `$450K` |
| < $1,000 | `$X` | `$750` |
| No price | `—` | — |

### Share Formatting

| Range | Format | Example |
|-------|--------|---------|
| ≥ 1,000,000 | `X.XM` | `1.5M` |
| ≥ 1,000 | `X.XK` | `25.3K` |
| < 1,000 | comma-separated | `850` |

---

## Pagination

- **Page size:** 50 trades per page
- **Controls:** Previous / Next buttons
- **Display:** "Page X of Y" indicator
- **Auto-reset:** Page resets to 1 when filters, search, or view changes

---

## State Management

### Client State (InsidersPageClient)

```typescript
// View state
activeView: 'latest' | 'top' | 'ticker' | 'insider'
trades: InsiderTrade[]
isLoading: boolean

// Search state
tickerQuery: string    // For "By Ticker" tab
insiderQuery: string   // For "By Insider" tab
abortControllerRef: AbortController | null  // Cancel in-flight requests

// Filter state
transactionFilter: 'all' | 'purchase' | 'sale' | 'option' | 'award' | 'gift'
dateFilter: 'all' | 'week' | 'month' | 'quarter' | 'year'

// Pagination state
page: number
```

### Table State (InsiderTradesTable)

```typescript
sortField: 'symbol' | 'transactionDate' | 'securitiesTransacted' | 'price' | 'value'
sortDir: 'asc' | 'desc'
```

---

## Performance Optimizations

### Debounced Search

Ticker search uses a 300ms debounce to prevent excessive API calls while typing.

### AbortController

In-flight API requests are cancelled when:
- User types new search query (previous request aborted)
- User switches tabs (previous request aborted)

### useMemo for Filtering

Filtered trade lists are memoized with `useMemo` to prevent unnecessary recalculations. Dependencies:
- `trades`
- `transactionFilter`
- `dateFilter`
- `activeView`
- `insiderQuery`

### Sorted Trades Memoization

Sorting is applied via `useMemo` in the table component to avoid re-sorting on every render.

---

## Error Handling

### API Errors

- Server action returns `{ error: string }` on failure
- Client shows empty table with "No trades found" message
- Console logs error details for debugging

### Empty States

- No trades found: Displays centered "No trades found" message in table area
- Loading: Displays "Loading..." in results count area

---

## Dark Mode Support

All UI elements support dark mode via Tailwind's `dark:` prefix:

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Background | `bg-gray-50` | `bg-[rgb(33,33,33)]` |
| Table header | `bg-gray-100` | `bg-[rgb(26,26,26)]` |
| Input fields | `bg-white` | `bg-[rgb(38,38,38)]` |
| Text | `text-gray-900` | `text-white` |
| Secondary text | `text-gray-600` | `text-gray-400` |
| Borders | `border-gray-200` | `border-gray-700` |

---

## File Structure

```
app/
├── insiders/
│   └── page.tsx              # Server component (entry point)
├── actions/
│   └── insider-trading.ts    # Server actions for FMP API

components/
├── InsidersPageClient.tsx    # Client component (tabs, filters, state)
└── InsiderTradesTable.tsx    # Table rendering and sorting

docs/
├── INSIDERS-FEATURE.md       # This documentation
└── INSIDERS-FEATURE-PLAN.md  # Original implementation plan
```

---

## Future Enhancements (from INSIDERS-FEATURE-PLAN.md)

The following features were planned but may not yet be implemented:

- [ ] Click-through to original SEC filing via `link` field
- [ ] Export to CSV/Excel
- [ ] Aggregate statistics (total buys vs sells, top buyers/sellers)
- [ ] Chart visualization of insider activity trends
- [ ] Email alerts for specific tickers or insiders
