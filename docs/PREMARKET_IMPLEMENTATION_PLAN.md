# Pre-Market & After-Hours Scanner Implementation Plan

## Overview

This document outlines the implementation plan for adding **pre-market** and **after-hours** stock scanning capabilities to the existing Top 20 Gainers/Losers tables on the Fin Quote dashboard.

### What We're Building

Currently, the dashboard displays top gainers and losers using FMP's dedicated endpoints (`/stock_market/gainers` and `/stock_market/losers`), which only return data during regular market hours (9:30 AM - 4:00 PM ET).

We're extending this functionality to show:
- **Pre-market movers** (4:00 AM - 9:30 AM ET)
- **After-hours movers** (4:00 PM - 8:00 PM ET)

This will provide users with real-time market insights across all trading sessions.

### Why This Approach

FMP does not provide dedicated endpoints for pre-market/after-hours gainers and losers. However, their **batch quote endpoint** (`/api/v3/quote/SYMBOL1,SYMBOL2,...`) includes:
- `preMarketChange`
- `preMarketChangePercentage`
- `afterMarketChange`
- `afterMarketChangePercentage`

By scanning a curated universe of liquid US stocks using batch quotes, we can efficiently calculate and display extended hours movers with minimal API calls.

---

## Current State

### How Existing Scanners Work

**Files:**
- `app/actions/gainers.ts` - Server action for top 20 gainers
- `app/actions/losers.ts` - Server action for top 20 losers
- `app/page.tsx` - Homepage with market data dashboard

**Data Flow:**
1. Homepage calls `getGainersData()` and `getLosersData()` server actions
2. Server actions fetch from FMP endpoints:
   - `/stock_market/gainers` (top gainers)
   - `/stock_market/losers` (top losers)
3. Data cached using **ISR (Incremental Static Regeneration)**:
   ```typescript
   const response = await fetch(url, {
     next: { revalidate: 60 } // 60-second TTL
   })
   ```
4. Client-side polling refreshes every 10 seconds
5. Serves stale data while revalidating in background

**Current Limitations:**
- Only works during regular market hours (9:30 AM - 4:00 PM ET)
- No pre-market or after-hours data
- Shows last close data when market is closed

**API Usage:**
- ~200 API calls per day (assuming typical user traffic)
- 2 calls per page load (gainers + losers)
- ISR caching prevents excessive calls

---

## Goals

1. **Add Pre-Market Scanning** - Display top 20 gainers/losers based on `preMarketChangePercentage` (4:00-9:30 AM ET)
2. **Add After-Hours Scanning** - Display top 20 gainers/losers based on `afterMarketChangePercentage` (4:00-8:00 PM ET)
3. **Smart Time-Based Routing** - Automatically switch data source based on current market session
4. **Maintain ISR Caching** - Preserve efficient caching strategy, no increase in API costs
5. **Seamless UX** - No code changes needed in homepage UI (automatic updates via polling)
6. **Cost-Effective** - Stay within FMP free tier limits (250 calls/day)

---

## Architecture Design

### 1. Ticker Universe Management

**Source:** GitHub repository `rreichel3/US-Stock-Symbols`
- Maintained and updated nightly
- Free and public
- Contains comprehensive list of US stocks by exchange

**Implementation:**
- Download ticker list from: `https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/all/all_tickers.txt`
- Store in: `data/us_tickers.txt`
- Filter to **~500 liquid stocks** (S&P 500 constituents or equivalent)
- Update weekly via automated script

**Filtering Criteria (Automated Script):**
```typescript
// scripts/filter-ticker-universe.ts
const filters = {
  exchanges: ['NYSE', 'NASDAQ'],           // Only major exchanges
  minPrice: 5,                              // Exclude penny stocks
  minAvgVolume: 1_000_000,                  // 1M+ average daily volume
  excludeTypes: ['ETF', 'PREFERRED', 'WARRANT', 'ADR', 'OTC'], // Common stocks only
  maxSymbolLength: 5                        // Exclude exotic tickers
}
```

**Why 500 stocks (not 2,000)?**
- **API Efficiency:** 500 stocks = 3 API calls per scan (vs. 10 for 2,000)
- **Coverage:** S&P 500 captures 80%+ of US market cap, includes all major movers
- **Cost Reduction:** 70% fewer API calls (3 vs. 10 per scan)
- **Quality:** All liquid, actively traded stocks with extended hours volume
- **Free Tier Compatibility:** Keeps total API usage under 250 calls/day

### 2. Market Session Detection

**Time-Based Routing Logic:**

```
Current ET Time      | Market Session    | Data Source
---------------------|-------------------|----------------------------------
4:00 AM - 9:30 AM    | Pre-Market        | Batch quotes with preMarketChange
9:30 AM - 4:00 PM    | Regular Hours     | FMP /stock_market/gainers endpoint
4:00 PM - 8:00 PM    | After-Hours       | Batch quotes with afterMarketChange
8:00 PM - 4:00 AM    | Closed            | Last close data (regular endpoint)
```

**Implementation:**
- Create utility function: `getCurrentMarketSession()` in `lib/market-utils.ts`
- Returns: `'premarket' | 'regular' | 'afterhours' | 'closed'`
- Handles timezone conversion to ET
- **Uses market calendar API for holidays and early closes**

**Market Calendar Integration:**
```typescript
// Use IEX Cloud Trading Calendar API (free tier available)
// Or NYSE holiday list from a reliable source
const holidayDates = [
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
]

const earlyCloseDates = [
  '2025-07-03',  // Day before July 4th
  '2025-11-28',  // Black Friday (1 PM close)
  '2025-12-24',  // Christmas Eve
]
```

### 3. Extended Hours Scanner Implementation

**New Files:**
- `app/actions/scan-extended-hours.ts` - Core scanning logic for pre-market/after-hours
- `lib/market-utils.ts` - Market session detection utilities
- `data/us_tickers.txt` - Universe of ~2,000 liquid US stocks

**Batch Quote Scanning Approach (REVISED):**

**CRITICAL FIX: Single Shared Scan Per Session**

Instead of separate scans for gainers and losers (which doubles API costs), we fetch once and derive both lists:

1. **Load Ticker Universe**
   - Read `us_tickers.txt` (500 stocks)
   - Split into batches of 200 symbols (3 batches)

2. **Fetch Batch Quotes ONCE per cache period**
   - Call `/api/v3/quote/SYMBOL1,SYMBOL2,...` (3 API calls total)
   - Store result in shared cache (Next.js cache or Redis)
   - Each response contains: `preMarketChange`, `afterMarketChange`, `volume`, `price`, `marketCap`

3. **Filter with Proper Liquidity Checks**
   - ⚠️ **CRITICAL:** Do NOT use `volume` field (it's regular-session only)
   - Instead use: `price > $5` AND `marketCap > $1B` as liquidity proxy
   - Alternative: Check if `preMarketPrice` exists (indicates extended hours activity)
   - Filter out stocks with missing extended hours data

4. **Sort and Derive Both Lists**
   - Sort by `preMarketChangePercentage` (or `afterMarketChangePercentage`)
   - Extract top 20 gainers (positive % change)
   - Extract top 20 losers (negative % change)
   - Both lists derived from same API payload

5. **Cache Results**
   - Use ISR with longer TTL: `revalidate: 300` (5 minutes)
   - Store shared snapshot with timestamp
   - Both `getGainersData()` and `getLosersData()` read from same cache

**API Efficiency (CORRECTED):**
- **3 API calls per scan** (500 stocks ÷ 200 per batch = 2.5, rounded to 3)
- Cached for 5 minutes (12 scans/hour)
- Pre-market (5.5 hrs): 12 scans/hr × 5.5 hrs = **66 scans** (not individual calls)
- After-hours (4 hrs): 12 scans/hr × 4 hrs = **48 scans**
- **Total extended hours: 114 scans = 342 API calls** (not ~160 as originally stated)

### 4. Smart Routing in Existing Actions

**Modified Files:**
- `app/actions/gainers.ts`
- `app/actions/losers.ts`

**New Logic:**

```typescript
export async function getGainersData() {
  const session = getCurrentMarketSession()

  if (session === 'regular' || session === 'closed') {
    // Use existing FMP endpoint
    return fetchRegularHoursGainers()
  } else if (session === 'premarket') {
    // Use batch quote scanner with preMarketChange
    return scanExtendedHours('premarket', 'gainers')
  } else if (session === 'afterhours') {
    // Use batch quote scanner with afterMarketChange
    return scanExtendedHours('afterhours', 'gainers')
  }
}
```

**Key Benefits:**
- Homepage UI code unchanged (still calls `getGainersData()` and `getLosersData()`)
- Automatic time-based routing happens server-side
- Client polling continues to work seamlessly

### 5. Caching Strategy

**Regular Hours:**
- Cache TTL: 60 seconds
- Rationale: High volatility, frequent updates needed

**Extended Hours (Pre-Market & After-Hours):**
- Cache TTL: 180 seconds (3 minutes)
- Rationale: Lower volatility, less frequent updates acceptable

**Market Closed:**
- Cache TTL: 300 seconds (5 minutes)
- Rationale: Static data (last close), no need for frequent refresh

**ISR Benefits:**
- Stale-while-revalidate: Serves cached data immediately while fetching fresh data in background
- Scales to zero: No API calls if no users are active
- Cost-effective: Only refreshes when users are viewing the page

---

## Technical Implementation

### API Endpoints

**Regular Hours (Existing):**
```
GET https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey={key}
GET https://financialmodelingprep.com/api/v3/stock_market/losers?apikey={key}
```

**Extended Hours (New):**
```
GET https://financialmodelingprep.com/api/v3/quote/AAPL,MSFT,GOOGL,...?apikey={key}
```
- Max 200 symbols per request
- Returns: `preMarketChange`, `preMarketChangePercentage`, `afterMarketChange`, `afterMarketChangePercentage`, `volume`, `price`

**Ticker Universe:**
```
GET https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/all/all_tickers.txt
```

### Code Structure Changes

**New Files:**

1. **`lib/market-utils.ts`**
   - `getCurrentMarketSession()` - Returns current market session
   - `isMarketOpen()` - Boolean check for market open status
   - `getNextMarketOpen()` - Returns next market open time
   - `isMarketHoliday(date)` - Check if date is NYSE holiday
   - `MARKET_HOLIDAYS` - Array of holiday dates

2. **`app/actions/scan-extended-hours.ts`**
   - `getExtendedHoursSnapshot(session)` - Fetch and cache shared snapshot
   - `loadTickerUniverse()` - Read and parse ticker list
   - `batchQuoteFetch(symbols)` - Fetch quotes in batches of 200 (3 calls)
   - `filterByLiquidity(quotes, session)` - Filter with price/market cap checks
   - `deriveGainers(snapshot)` - Extract top 20 gainers from shared data
   - `deriveLosers(snapshot)` - Extract top 20 losers from shared data

3. **`data/us_tickers.txt`**
   - Plain text file with one ticker per line
   - ~500 liquid US stocks (S&P 500 equivalent)
   - Updated weekly via automated script

4. **`scripts/filter-ticker-universe.ts`**
   - Automated filtering script
   - Applies exchange, price, volume, type filters
   - Outputs clean ticker list to `data/us_tickers.txt`

**Modified Files:**

1. **`app/actions/gainers.ts`**
   - Add session detection logic
   - Route to appropriate data source
   - Maintain existing return type/structure

2. **`app/actions/losers.ts`**
   - Add session detection logic
   - Route to appropriate data source
   - Maintain existing return type/structure

**No Changes Needed:**
- `app/page.tsx` - Homepage continues to call same server actions
- `components/*` - UI components unchanged

### File Modification Details

**`lib/market-utils.ts` (New File):**
```typescript
export type MarketSession = 'premarket' | 'regular' | 'afterhours' | 'closed'

export function getCurrentMarketSession(): MarketSession {
  // Get current time in ET
  // Check time ranges
  // Return session type
}

export function isMarketOpen(): boolean {
  return getCurrentMarketSession() !== 'closed'
}
```

**`app/actions/scan-extended-hours.ts` (New File - REVISED):**
```typescript
'use server'

interface ExtendedHoursStock {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
  volume: number
  marketCap: number
}

interface ExtendedHoursSnapshot {
  timestamp: number
  session: 'premarket' | 'afterhours'
  stocks: ExtendedHoursStock[]
}

// Shared cache (in-memory or Redis)
let cachedSnapshot: ExtendedHoursSnapshot | null = null

export async function getExtendedHoursSnapshot(
  session: 'premarket' | 'afterhours'
): Promise<ExtendedHoursSnapshot> {
  // Check cache (5-minute TTL)
  if (cachedSnapshot && Date.now() - cachedSnapshot.timestamp < 300_000) {
    return cachedSnapshot
  }

  // 1. Load ticker universe from data/us_tickers.txt (500 stocks)
  // 2. Split into batches of 200 (3 batches)
  // 3. Fetch batch quotes (3 API calls - SHARED between gainers and losers)
  // 4. Filter by liquidity: price > $5 AND marketCap > $1B
  // 5. Store in cache with timestamp

  cachedSnapshot = { timestamp: Date.now(), session, stocks: filteredQuotes }
  return cachedSnapshot
}

export async function deriveGainers(session: 'premarket' | 'afterhours') {
  const snapshot = await getExtendedHoursSnapshot(session)
  const field = session === 'premarket' ? 'preMarketChangePercentage' : 'afterMarketChangePercentage'
  return snapshot.stocks
    .filter(s => s[field] > 0)
    .sort((a, b) => b[field] - a[field])
    .slice(0, 20)
}

export async function deriveLosers(session: 'premarket' | 'afterhours') {
  const snapshot = await getExtendedHoursSnapshot(session)
  const field = session === 'premarket' ? 'preMarketChangePercentage' : 'afterMarketChangePercentage'
  return snapshot.stocks
    .filter(s => s[field] < 0)
    .sort((a, b) => a[field] - b[field])
    .slice(0, 20)
}
```

**`app/actions/gainers.ts` (Modified - REVISED):**
```typescript
export async function getGainersData() {
  const session = getCurrentMarketSession()

  if (session === 'premarket') {
    // Reads from shared cache (no duplicate API calls)
    return deriveGainers('premarket')
  } else if (session === 'afterhours') {
    // Reads from shared cache (no duplicate API calls)
    return deriveGainers('afterhours')
  } else {
    // Existing regular hours logic
    return fetchRegularHoursGainers()
  }
}
```

**`app/actions/losers.ts` (Modified - REVISED):**
```typescript
export async function getLosersData() {
  const session = getCurrentMarketSession()

  if (session === 'premarket') {
    // Reads from shared cache (no duplicate API calls)
    return deriveLosers('premarket')
  } else if (session === 'afterhours') {
    // Reads from shared cache (no duplicate API calls)
    return deriveLosers('afterhours')
  } else {
    // Existing regular hours logic
    return fetchRegularHoursLosers()
  }
}
```

**Key Fix:** Both `getGainersData()` and `getLosersData()` call the same `getExtendedHoursSnapshot()` which caches the batch quote results. This eliminates duplicate API calls.

---

## API Usage & Cost Analysis

### Current State (Regular Hours Only)

**API Calls Per Day:**
- Gainers endpoint: ~100 calls/day
- Losers endpoint: ~100 calls/day
- **Total: ~200 calls/day**

**Assumptions:**
- Average traffic during market hours (9:30 AM - 4 PM ET)
- ISR caching reduces calls (60-second TTL)
- 10-second client polling triggers revalidation

### Projected State (Extended Hours Added - CORRECTED)

**CRITICAL REVISION:** Original calculation severely undercounted API usage. Here's the corrected analysis:

**Regular Hours (9:30 AM - 4 PM ET):**
- Gainers: ~50 calls
- Losers: ~50 calls
- Subtotal: ~100 calls

**Pre-Market (4:00 AM - 9:30 AM ET):**
- Duration: 5.5 hours
- Cache TTL: 5 minutes (12 refreshes/hour)
- Total refreshes: 12 × 5.5 = **66 refreshes**
- API calls per refresh: 3 (500 stocks ÷ 200 per batch)
- **Subtotal: 66 × 3 = 198 API calls** (not 110 as originally stated)

**After-Hours (4:00 PM - 8:00 PM ET):**
- Duration: 4 hours
- Cache TTL: 5 minutes (12 refreshes/hour)
- Total refreshes: 12 × 4 = **48 refreshes**
- API calls per refresh: 3
- **Subtotal: 48 × 3 = 144 API calls** (not 80 as originally stated)

**Total Projected: ~442 API calls/day** ⚠️ **EXCEEDS free tier (250 calls/day)**

**Breakdown by Session (CORRECTED):**

| Session        | Duration | Cache TTL | Refreshes/Hr | Total Refreshes | API Calls/Refresh | Total API Calls |
|----------------|----------|-----------|--------------|-----------------|-------------------|-----------------|
| Pre-Market     | 5.5 hrs  | 5 min     | 12           | 66              | 3                 | **198**         |
| Regular Hours  | 6.5 hrs  | 1 min     | ~8           | ~50             | 2 (gainers+losers)| **100**         |
| After-Hours    | 4 hrs    | 5 min     | 12           | 48              | 3                 | **144**         |
| **Total**      | 16 hrs   | -         | -            | -               | -                 | **442**         |

**Cost Analysis (CORRECTED):**

| Metric                     | Current | Original Estimate | Actual Projected | Status |
|----------------------------|---------|-------------------|------------------|--------|
| API Calls Per Day          | ~200    | ~290 ❌ Wrong     | **~442**         | -      |
| Within Free Tier (250/day) | ✅ Yes  | ⚠️ Close          | ❌ **No**        | **EXCEEDS** |
| Requires Paid Plan         | ❌ No   | ❌ No             | ⚠️ **Maybe**     | See below |

**Options to Stay Within Free Tier:**

### Option 1: Reduce Universe Size (Recommended)
- Use **300 stocks** instead of 500 (2 API calls per scan vs. 3)
- Pre-market: 66 × 2 = **132 calls**
- After-hours: 48 × 2 = **96 calls**
- Regular: **100 calls**
- **Total: 328 calls/day** (still over, but closer)

### Option 2: Increase Cache TTL (Most Effective)
- Use **10-minute cache** for extended hours (6 refreshes/hour vs. 12)
- Pre-market: 33 × 3 = **99 calls**
- After-hours: 24 × 3 = **72 calls**
- Regular: **100 calls**
- **Total: 271 calls/day** (slightly over, but much better)

### Option 3: Combined Approach (RECOMMENDED)
- **300 stocks** (2 API calls per scan)
- **10-minute cache TTL** for extended hours
- Pre-market: 33 × 2 = **66 calls**
- After-hours: 24 × 2 = **48 calls**
- Regular: **100 calls**
- **Total: 214 calls/day** ✅ **Within free tier!**

### Option 4: Paid Plan
- FMP Starter Plan: $15/month for 1,000 calls/day
- Enables 500-stock universe with 5-minute cache
- More headroom for future features

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal:** Set up infrastructure for extended hours scanning

**Tasks:**
1. Create `scripts/filter-ticker-universe.ts` with filtering logic
2. Run script to generate `data/us_tickers.txt` (300 stocks)
3. Create `lib/market-utils.ts` with session detection + holiday calendar
4. Add NYSE holiday dates array
5. Test session detection with various times and holiday dates

**Success Criteria:**
- `getCurrentMarketSession()` correctly identifies all 4 sessions
- Holiday detection works (returns 'closed' on NYSE holidays)
- Ticker universe contains exactly 300 high-quality stocks
- Automated filter script can be re-run weekly

### Phase 2: Pre-Market Scanner (Week 1-2)
**Goal:** Build and test pre-market scanning functionality

**Tasks:**
1. Create `app/actions/scan-extended-hours.ts`
2. Implement `getExtendedHoursSnapshot('premarket')` with shared caching
3. Implement `deriveGainers('premarket')` - reads from cache
4. Implement `deriveLosers('premarket')` - reads from cache
5. Use proper liquidity filters: `price > $5` AND `marketCap > $1B`
6. Test with manual time override (simulate pre-market hours)

**Success Criteria:**
- Returns top 20 pre-market gainers/losers
- Filters out penny stocks and low market cap stocks
- **API calls: 2 per scan (300 stocks ÷ 200 = 1.5, rounded to 2)**
- Cache TTL set to 10 minutes
- Gainers and losers read from same cached snapshot (no duplicate API calls)

### Phase 3: After-Hours Scanner (Week 2)
**Goal:** Build and test after-hours scanning functionality

**Tasks:**
1. Implement `scanExtendedHours('afterhours', 'gainers')`
2. Implement `scanExtendedHours('afterhours', 'losers')`
3. Test with manual time override (simulate after-hours)
4. Validate data format matches regular hours structure

**Success Criteria:**
- Returns top 20 after-hours gainers/losers
- Uses `afterMarketChange` and `afterMarketChangePercentage`
- Maintains consistent data structure with regular hours

### Phase 4: Smart Routing Integration (Week 2-3)
**Goal:** Integrate time-based routing into existing server actions

**Tasks:**
1. Modify `app/actions/gainers.ts` with session routing
2. Modify `app/actions/losers.ts` with session routing
3. Test all 4 market sessions (premarket, regular, afterhours, closed)
4. Verify homepage UI works without changes
5. Test client-side polling continues to work

**Success Criteria:**
- Homepage automatically switches data source based on time
- No UI code changes needed
- Client polling refreshes data every 10 seconds
- ISR caching works correctly for each session

### Phase 5: Optimization & Monitoring (Week 3-4)
**Goal:** Fine-tune performance and monitor API usage

**Tasks:**
1. Add logging to track API call count per session
2. Monitor actual API usage for 1 week
3. Verify API usage stays under 214 calls/day (free tier target)
4. Add error handling for API failures
5. Implement fallback to regular hours data if extended hours scan fails
6. Add alerting if daily API usage approaches 250 calls

**Success Criteria:**
- **API usage stays under 214 calls/day** (with 10-min cache + 300 stocks)
- Error rate < 1%
- Average response time < 2 seconds
- Graceful degradation on API failures
- Shared cache eliminates duplicate API calls (confirmed via logs)

---

## UI Enhancements

### Session Indicators

**Add visual indicators to show which market session is active:**

1. **Badge on Table Header**
   - Pre-Market: Orange badge "PRE-MARKET"
   - Regular Hours: Green badge "MARKET OPEN"
   - After-Hours: Blue badge "AFTER-HOURS"
   - Closed: Gray badge "MARKET CLOSED"

2. **Next Session Countdown**
   - "Pre-market opens in 2h 34m"
   - "Market opens in 45m"
   - "After-hours ends in 1h 12m"

**Implementation:**
- Add to `app/page.tsx` near table headers
- Calculate time until next session using `getNextMarketOpen()`

### Volume Warnings

**Display liquidity indicator for filtered stocks:**

During extended hours, we filter by `price > $5` AND `marketCap > $1B` to ensure liquidity. However, we can still show additional warnings:

- Market Cap < $5B: ⚠️ "Mid-Cap Stock"
- Market Cap < $2B: 🔴 "Small-Cap Stock (Higher Risk)"

**Why Price/Market Cap Instead of Volume:**
- FMP's `/quote` endpoint returns regular-session volume, not extended-hours volume
- Using regular-session volume would incorrectly filter out legitimate pre-market movers
- Price + market cap is a more reliable liquidity proxy for extended hours

**Future Enhancement:**
- If FMP adds extended-hours volume data, we can use that for more accurate filtering

### Last Updated Timestamp

**Add "Last updated: 2m ago" below tables:**

Shows users how fresh the data is, especially important during extended hours with 3-minute cache TTL.

**Implementation:**
- Store `lastUpdated` timestamp in response
- Calculate time difference in client
- Format as "Xs ago" or "Xm ago"

---

## Fallback Strategy

### Handling API Failures

**Scenario 1: Batch Quote API Fails**
- Fallback to regular hours endpoint (even if pre-market/after-hours)
- Display warning: "Extended hours data temporarily unavailable"
- Log error for monitoring

**Scenario 2: Ticker Universe File Missing**
- Use hardcoded list of top 500 stocks (S&P 500)
- Log warning for manual intervention
- Continue with reduced coverage

**Scenario 3: API Rate Limit Exceeded**
- Serve stale cached data with extended TTL (5 minutes)
- Display notice: "Data may be delayed"
- Alert admin to check API usage

### Graceful Degradation

**If extended hours scanning fails:**
1. Attempt retry once (with 2-second delay)
2. If retry fails, fall back to regular hours endpoint
3. Log error with details (session, time, error message)
4. Display data with disclaimer: "Showing last close data"

**Implementation:**
```typescript
try {
  return await scanExtendedHours(session, type)
} catch (error) {
  console.error('Extended hours scan failed:', error)
  return await fetchRegularHoursGainers() // Fallback
}
```

---

## Testing Plan

### Manual Testing During Each Market Session

**Pre-Market Testing (4:00 AM - 9:30 AM ET):**
1. Open homepage at 6:00 AM ET
2. Verify "PRE-MARKET" badge appears
3. Check top 20 gainers/losers display pre-market data
4. Inspect network tab: confirm batch quote API calls (10 calls)
5. Wait 3 minutes, verify data refreshes
6. Check volume filter: no stocks with volume < 100,000

**Regular Hours Testing (9:30 AM - 4:00 PM ET):**
1. Open homepage at 12:00 PM ET
2. Verify "MARKET OPEN" badge appears
3. Check data matches existing regular hours endpoint
4. Inspect network tab: confirm single API call (not batch quotes)
5. Wait 1 minute, verify data refreshes
6. Compare with previous version (should match exactly)

**After-Hours Testing (4:00 PM - 8:00 PM ET):**
1. Open homepage at 5:00 PM ET
2. Verify "AFTER-HOURS" badge appears
3. Check top 20 gainers/losers display after-hours data
4. Inspect network tab: confirm batch quote API calls (10 calls)
5. Wait 3 minutes, verify data refreshes
6. Check volume filter: no stocks with volume < 100,000

**Market Closed Testing (8:00 PM - 4:00 AM ET):**
1. Open homepage at 10:00 PM ET
2. Verify "MARKET CLOSED" badge appears
3. Check data shows last close values
4. Inspect network tab: confirm regular hours endpoint used
5. Wait 5 minutes, verify data refreshes (with longer cache TTL)

### Automated Testing

**Unit Tests:**
- `getCurrentMarketSession()` returns correct session for various times
- `scanExtendedHours()` filters and sorts stocks correctly
- Batch quote fetching handles 2,000 stocks in 10 calls

**Integration Tests:**
- Full flow: homepage → server action → API → response
- Session routing works for all 4 sessions
- Cache TTL respects session-specific values

**Load Tests:**
- Simulate 100 concurrent users during pre-market
- Verify API calls stay under 10 per scan
- Confirm ISR caching prevents excessive API usage

---

## Success Metrics

### Functional Success
- ✅ Pre-market data displays correctly (4:00-9:30 AM ET)
- ✅ After-hours data displays correctly (4:00-8:00 PM ET)
- ✅ Regular hours data unchanged (9:30 AM-4:00 PM ET)
- ✅ Automatic session switching works without user intervention

### Performance Success
- ✅ API calls < 214/day (stay within free tier with 300 stocks + 10-min cache)
- ✅ Response time < 2 seconds (average)
- ✅ Error rate < 1%
- ✅ Cache hit rate > 80%
- ✅ No duplicate API calls (gainers/losers use shared snapshot)

### User Experience Success
- ✅ No code changes needed in UI (seamless integration)
- ✅ Data refreshes automatically via polling
- ✅ Session indicators inform users of current market state
- ✅ Volume warnings protect users from illiquid stocks

---

## Review Findings & Follow-Ups

### Key Risks Identified

- **API budget undercounted:** Each extended-hours refresh requires 10 batch-quote hits per table (2,000 symbols ÷ 200 per call). With separate gainers/losers fetches and 3-minute TTL, pre-market alone would consume ~2,200 calls, after-hours another ~1,600, pushing total usage far beyond the 250-call free tier before regular-hours traffic is included. The plan must either shrink the universe, lengthen TTLs substantially, or assume a paid plan.
- **Duplicate fetches for gainers vs. losers:** `getGainersData` and `getLosersData` each trigger a full 2,000-symbol scan, doubling API cost and latency. Consider running the batch quotes once per session, caching the result (e.g., in memory, Redis, or edge cache), and deriving both ranked lists from that shared snapshot.
- **Volume filter uses the wrong signal:** `/quote`’s `volume` represents the most recent regular-session print, not pre/after-hours traded volume. Relying on it will suppress legitimate pre-market movers while letting illiquid overnight spikes through. We need an extended-hours-specific liquidity check (e.g., `preMarketPrice` × `preMarketVolume` from a different endpoint, or at minimum a price/market-cap guard).
- **Session calendar gaps:** The current schedule only distinguishes weekdays vs. weekends. U.S. markets observe ~10 holidays plus early closes (e.g., July 3, Black Friday). Without referencing an exchange calendar (IEX calendar API, NYSE holiday list, etc.), the system will misroute to “regular” logic on closed days.
- **Ticker universe quality control:** Pulling the raw `rreichel3` dump introduces ETFs, preferreds, warrants, ADRs, OTC symbols, and stale listings. Manual weekly curation will not scale and risks batches full of non-trading tickers. Scriptable filters (exchange whitelist, price range, average-volume floor) plus periodic validation should be specified.

### Solutions to Open Questions

**1. Screening rules for ticker universe:**
✅ **RESOLVED:** Use automated script with the following filters:
- Exchanges: NYSE, NASDAQ only
- Min price: $5 (exclude penny stocks)
- Min avg volume: 1M shares/day
- Exclude: ETFs, preferreds, warrants, ADRs, OTC
- Max symbol length: 5 characters
- Target size: **300 stocks** (S&P 400 Mid-Cap or equivalent)

**2. Budget for higher FMP tier:**
✅ **RESOLVED:** Stay in free tier using **Option 3 (Combined Approach)**:
- 300 stocks (2 API calls per scan)
- 10-minute cache TTL for extended hours
- Total: ~214 calls/day (well within 250 limit)

**3. Shared extended-hours snapshot location:**
✅ **RESOLVED:** Use in-memory cache with 5-10 minute TTL:
```typescript
let cachedSnapshot: ExtendedHoursSnapshot | null = null
// Stored in server memory (Next.js server action context)
// Shared between getGainersData() and getLosersData()
// Invalidated after TTL expires
```
Alternative (for scale): Redis or Next.js unstable_cache

**4. Market calendar source:**
✅ **RESOLVED:** Hardcode NYSE holidays in `lib/market-utils.ts`:
```typescript
const MARKET_HOLIDAYS = [
  '2025-01-01', '2025-01-20', '2025-02-17', // ... (10 dates/year)
]
const EARLY_CLOSE_DATES = [
  '2025-07-03', '2025-11-28', '2025-12-24'
]
```
Update annually (manual process, takes 5 minutes)

---

## Future Enhancements

### Phase 6: Advanced Features (Future)
1. **Historical Extended Hours Data**
   - Store pre-market/after-hours data in database
   - Enable historical analysis of extended hours movements

2. **Alert System**
   - Notify users of significant pre-market movers
   - Email/SMS alerts for stocks on watchlist

3. **Earnings Calendar Integration**
   - Highlight stocks with earnings announcements
   - Pre-market earnings reaction tracking

4. **Options Activity**
   - Show unusual options activity during extended hours
   - Call/put volume ratios

5. **News Integration**
   - Display relevant news headlines for top movers
   - Sentiment analysis for pre-market moves

---

## Summary

This implementation plan adds pre-market and after-hours scanning capabilities to the Fin Quote dashboard using a time-based routing architecture. By leveraging FMP's batch quote endpoint and a curated ticker universe from GitHub, we can efficiently scan ~2,000 liquid stocks with only 10 API calls per scan.

**Key Decisions (REVISED):**
- Use `rreichel3/US-Stock-Symbols` with automated filtering (300 stocks)
- Batch 200 symbols per API call (2 calls per scan, not 10)
- **Shared snapshot architecture** eliminates duplicate API calls
- Smart session detection with NYSE holiday calendar
- ISR caching with 10-minute TTL for extended hours
- Liquidity filters: price > $5 AND marketCap > $1B (not volume)
- Zero UI changes needed (server-side routing handles everything)
- **Stay within FMP free tier: 214 calls/day** (vs. original estimate of 290)

**Implementation Timeline:**
- Week 1: Foundation + Pre-Market Scanner
- Week 2: After-Hours Scanner + Smart Routing
- Week 3-4: Optimization + Monitoring

**Expected Outcome:**
Users will see real-time top gainers/losers across all trading sessions, providing comprehensive market insights from 4:00 AM to 8:00 PM ET, with seamless automatic switching between data sources based on market hours.
