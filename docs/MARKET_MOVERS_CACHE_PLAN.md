# Market Movers Cache Implementation Plan

## Overview

Replace direct FMP API calls for gainers/losers with a smart database caching system that:
1. Caches data in Supabase for fast retrieval
2. Only fetches from FMP during relevant market sessions
3. Supports three sessions: pre-market, cash (regular), and after-hours
4. Provides UI to toggle between sessions

---

## Current State

**Data Flow:**
```
User visits page → Next.js ISR (60s) → fetch() with revalidate:60 → FMP API
```

**Problems:**
- Fetches every 60s even when market closed (wasted API calls)
- No historical data (can't see "what were pre-market movers?")
- Single session only (cash/regular hours)

---

## Proposed Architecture

### Data Flow (New)

```
User visits page
       ↓
┌─────────────────────────────────────────────────────────┐
│  Server Action: getMarketMovers(session, direction)     │
│  1. Check Supabase cache                                │
│  2. If fresh → return cached data                       │
│  3. If stale + market open → fetch FMP, update cache    │
│  4. If stale + market closed → return stale cache       │
└─────────────────────────────────────────────────────────┘

Background (separate):
┌─────────────────────────────────────────────────────────┐
│  Cron Job / Vercel Cron                                 │
│  - Runs every 60s                                       │
│  - Checks current market session                        │
│  - Only fetches data for active session                 │
│  - Updates Supabase cache                               │
└─────────────────────────────────────────────────────────┘
```

---

## Market Sessions

| Session | Eastern Time | FMP Endpoint |
|---------|--------------|--------------|
| Pre-market | 4:00 AM - 9:30 AM | `/v3/pre_market_gainers`, `/v3/pre_market_losers` |
| Cash (Regular) | 9:30 AM - 4:00 PM | `/v3/stock_market/gainers`, `/v3/stock_market/losers` |
| After-hours | 4:00 PM - 8:00 PM | `/v3/aftermarket_gainers`, `/v3/aftermarket_losers` |
| Closed | 8:00 PM - 4:00 AM | No fetching (serve cached data) |
| Weekend | Sat-Sun | No fetching (serve Friday's data) |

**Note:** Verify exact FMP endpoint names from their documentation. May be:
- `stock_market/gainers` vs `stock_market_gainers`
- `pre_market_gainers` vs `premarket_gainers`

---

## Database Schema

### Table: `market_movers_cache`

```sql
CREATE TABLE market_movers_cache (
  id SERIAL PRIMARY KEY,

  -- Identifiers
  session_type TEXT NOT NULL,      -- 'premarket', 'cash', 'afterhours'
  direction TEXT NOT NULL,         -- 'gainers', 'losers'

  -- Data
  data JSONB NOT NULL,             -- Array of mover objects

  -- Metadata
  market_date DATE NOT NULL,       -- Trading date (e.g., 2026-02-03)
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  UNIQUE(session_type, direction, market_date)
);

-- Index for fast lookups
CREATE INDEX idx_market_movers_lookup
  ON market_movers_cache(session_type, direction, market_date DESC);

-- Index for cleanup queries
CREATE INDEX idx_market_movers_fetched
  ON market_movers_cache(fetched_at);
```

### Data Shape (JSONB `data` column)

```json
[
  {
    "symbol": "NVDA",
    "name": "NVIDIA Corporation",
    "price": 142.50,
    "change": 8.25,
    "changesPercentage": 6.14
  },
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "price": 185.20,
    "change": 4.10,
    "changesPercentage": 2.26
  }
]
```

---

## Implementation Steps

### Phase 1: Database Setup

**1.1 Create Migration**

File: `supabase/migrations/20260203000002_create_market_movers_cache.sql`

```sql
-- Create market movers cache table
CREATE TABLE IF NOT EXISTS market_movers_cache (
  id SERIAL PRIMARY KEY,
  session_type TEXT NOT NULL CHECK (session_type IN ('premarket', 'cash', 'afterhours')),
  direction TEXT NOT NULL CHECK (direction IN ('gainers', 'losers')),
  data JSONB NOT NULL DEFAULT '[]',
  market_date DATE NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_type, direction, market_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_market_movers_lookup
  ON market_movers_cache(session_type, direction, market_date DESC);

CREATE INDEX IF NOT EXISTS idx_market_movers_fetched
  ON market_movers_cache(fetched_at);

-- RLS policies (read: public, write: service role only)
ALTER TABLE market_movers_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access"
  ON market_movers_cache FOR SELECT
  USING (true);

CREATE POLICY "Allow service role write access"
  ON market_movers_cache FOR ALL
  USING (auth.role() = 'service_role');
```

**1.2 Run Migration**

```bash
npx supabase db push
# or apply via Supabase dashboard
```

---

### Phase 2: Market Session Utilities

**2.1 Create Helper: `lib/market-hours.ts`**

```ts
export type MarketSession = 'premarket' | 'cash' | 'afterhours' | 'closed'

export interface MarketStatus {
  session: MarketSession
  isWeekend: boolean
  isFetchingEnabled: boolean
  nextSessionStart: Date | null
}

/**
 * Determine current market session based on Eastern Time
 */
export function getMarketStatus(): MarketStatus {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))

  const day = et.getDay() // 0 = Sunday, 6 = Saturday
  const hour = et.getHours()
  const minute = et.getMinutes()
  const timeInMinutes = hour * 60 + minute

  // Weekend check
  const isWeekend = day === 0 || day === 6
  if (isWeekend) {
    return {
      session: 'closed',
      isWeekend: true,
      isFetchingEnabled: false,
      nextSessionStart: getNextMondayPremarket(et)
    }
  }

  // Time boundaries (in minutes from midnight)
  const PREMARKET_START = 4 * 60        // 4:00 AM
  const CASH_START = 9 * 60 + 30        // 9:30 AM
  const CASH_END = 16 * 60              // 4:00 PM
  const AFTERHOURS_END = 20 * 60        // 8:00 PM

  if (timeInMinutes < PREMARKET_START) {
    return { session: 'closed', isWeekend: false, isFetchingEnabled: false, nextSessionStart: null }
  } else if (timeInMinutes < CASH_START) {
    return { session: 'premarket', isWeekend: false, isFetchingEnabled: true, nextSessionStart: null }
  } else if (timeInMinutes < CASH_END) {
    return { session: 'cash', isWeekend: false, isFetchingEnabled: true, nextSessionStart: null }
  } else if (timeInMinutes < AFTERHOURS_END) {
    return { session: 'afterhours', isWeekend: false, isFetchingEnabled: true, nextSessionStart: null }
  } else {
    return { session: 'closed', isWeekend: false, isFetchingEnabled: false, nextSessionStart: null }
  }
}

/**
 * Get the current trading date (handles after-midnight edge case)
 */
export function getTradingDate(): string {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))

  // If before 4am ET, consider it previous trading day
  if (et.getHours() < 4) {
    et.setDate(et.getDate() - 1)
  }

  // Skip weekends
  while (et.getDay() === 0 || et.getDay() === 6) {
    et.setDate(et.getDate() - 1)
  }

  return et.toISOString().split('T')[0] // YYYY-MM-DD
}

function getNextMondayPremarket(now: Date): Date {
  const next = new Date(now)
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7
  next.setDate(next.getDate() + daysUntilMonday)
  next.setHours(4, 0, 0, 0)
  return next
}
```

---

### Phase 3: Server Actions

**3.1 Create: `app/actions/market-movers.ts`**

```ts
'use server'

import { createClient } from '@supabase/supabase-js'
import { getMarketStatus, getTradingDate, type MarketSession } from '@/lib/market-hours'

// Types
export interface MoverData {
  symbol: string
  name: string
  price: number
  change: number
  changesPercentage: number
}

export interface MarketMoversResult {
  movers: MoverData[]
  session: MarketSession
  cachedAt: string | null
  isLive: boolean
}

type Direction = 'gainers' | 'losers'
type SessionType = 'premarket' | 'cash' | 'afterhours'

// Supabase clients
const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null

// FMP endpoints by session
const FMP_ENDPOINTS: Record<SessionType, Record<Direction, string>> = {
  premarket: {
    gainers: 'pre_market_gainers',
    losers: 'pre_market_losers'
  },
  cash: {
    gainers: 'stock_market/gainers',
    losers: 'stock_market/losers'
  },
  afterhours: {
    gainers: 'aftermarket_gainers',
    losers: 'aftermarket_losers'
  }
}

// Cache TTL: 60 seconds
const CACHE_TTL_MS = 60 * 1000

/**
 * Get market movers (gainers or losers) for a specific session.
 * Returns cached data if fresh, otherwise fetches from FMP (if market is open).
 */
export async function getMarketMovers(
  session: SessionType,
  direction: Direction
): Promise<MarketMoversResult> {
  const marketDate = getTradingDate()
  const marketStatus = getMarketStatus()

  // 1. Check cache
  const cached = await getCachedMovers(session, direction, marketDate)

  if (cached) {
    const cacheAge = Date.now() - new Date(cached.fetched_at).getTime()
    const isFresh = cacheAge < CACHE_TTL_MS

    // Return cache if fresh OR if we can't fetch (wrong session/market closed)
    if (isFresh || !canFetchSession(session, marketStatus)) {
      return {
        movers: cached.data as MoverData[],
        session,
        cachedAt: cached.fetched_at,
        isLive: isFresh && marketStatus.session === session
      }
    }
  }

  // 2. Fetch fresh data if allowed
  if (canFetchSession(session, marketStatus)) {
    const fresh = await fetchFromFMP(session, direction)
    if (fresh.length > 0) {
      await updateCache(session, direction, marketDate, fresh)
      return {
        movers: fresh,
        session,
        cachedAt: new Date().toISOString(),
        isLive: true
      }
    }
  }

  // 3. Fallback: return stale cache or empty
  return {
    movers: cached?.data as MoverData[] || [],
    session,
    cachedAt: cached?.fetched_at || null,
    isLive: false
  }
}

/**
 * Check if we should fetch for this session based on current market status
 */
function canFetchSession(session: SessionType, status: ReturnType<typeof getMarketStatus>): boolean {
  if (!status.isFetchingEnabled) return false
  return status.session === session
}

/**
 * Read from Supabase cache
 */
async function getCachedMovers(
  session: SessionType,
  direction: Direction,
  marketDate: string
) {
  const { data, error } = await supabasePublic
    .from('market_movers_cache')
    .select('data, fetched_at')
    .eq('session_type', session)
    .eq('direction', direction)
    .eq('market_date', marketDate)
    .maybeSingle()

  if (error) {
    console.error('Cache read error:', error)
    return null
  }

  return data
}

/**
 * Write to Supabase cache (upsert)
 */
async function updateCache(
  session: SessionType,
  direction: Direction,
  marketDate: string,
  movers: MoverData[]
) {
  if (!supabaseAdmin) {
    console.warn('Cannot write cache: SUPABASE_SERVICE_ROLE_KEY not set')
    return
  }

  const { error } = await supabaseAdmin
    .from('market_movers_cache')
    .upsert({
      session_type: session,
      direction: direction,
      market_date: marketDate,
      data: movers,
      fetched_at: new Date().toISOString()
    }, {
      onConflict: 'session_type,direction,market_date'
    })

  if (error) {
    console.error('Cache write error:', error)
  }
}

/**
 * Fetch from FMP API
 */
async function fetchFromFMP(session: SessionType, direction: Direction): Promise<MoverData[]> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) {
    console.error('FMP_API_KEY not set')
    return []
  }

  const endpoint = FMP_ENDPOINTS[session][direction]
  const url = `https://financialmodelingprep.com/api/v3/${endpoint}?apikey=${apiKey}`

  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`FMP API error: ${response.status}`)
    }

    const data = await response.json()

    if (!Array.isArray(data)) {
      console.error('Unexpected FMP response:', data)
      return []
    }

    // Filter and transform
    return data
      .filter((item: any) => {
        const pctChange = Math.abs(item.changesPercentage || 0)
        return pctChange < 1000 && item.price > 0
      })
      .slice(0, 20)
      .map((item: any) => ({
        symbol: item.symbol,
        name: item.name,
        price: item.price,
        change: item.change,
        changesPercentage: item.changesPercentage
      }))
  } catch (error) {
    console.error('FMP fetch error:', error)
    return []
  }
}

/**
 * Get all sessions for a direction (for initial page load)
 * Returns cached data for all three sessions
 */
export async function getAllSessionMovers(direction: Direction): Promise<{
  premarket: MoverData[]
  cash: MoverData[]
  afterhours: MoverData[]
  currentSession: MarketSession
}> {
  const marketStatus = getMarketStatus()

  const [premarket, cash, afterhours] = await Promise.all([
    getMarketMovers('premarket', direction),
    getMarketMovers('cash', direction),
    getMarketMovers('afterhours', direction)
  ])

  return {
    premarket: premarket.movers,
    cash: cash.movers,
    afterhours: afterhours.movers,
    currentSession: marketStatus.session
  }
}
```

---

### Phase 4: Background Refresh (Cron Job)

**4.1 Create API Route: `app/api/cron/refresh-market-movers/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getMarketStatus } from '@/lib/market-hours'
import { getMarketMovers } from '@/app/actions/market-movers'

// Vercel Cron or external cron hits this endpoint
export async function GET(request: Request) {
  // Verify cron secret (optional but recommended)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const status = getMarketStatus()

  // Skip if market fully closed
  if (!status.isFetchingEnabled) {
    return NextResponse.json({
      message: 'Market closed, skipping refresh',
      session: status.session,
      isWeekend: status.isWeekend
    })
  }

  // Only refresh the current active session
  const session = status.session as 'premarket' | 'cash' | 'afterhours'

  const [gainers, losers] = await Promise.all([
    getMarketMovers(session, 'gainers'),
    getMarketMovers(session, 'losers')
  ])

  return NextResponse.json({
    message: 'Refresh complete',
    session,
    gainersCount: gainers.movers.length,
    losersCount: losers.movers.length,
    timestamp: new Date().toISOString()
  })
}
```

**4.2 Configure Vercel Cron: `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/refresh-market-movers",
      "schedule": "* * * * *"
    }
  ]
}
```

This runs every minute. The endpoint itself checks if fetching is needed.

**4.3 Add Environment Variable**

```bash
# .env.local
CRON_SECRET=your-secret-here
```

---

### Phase 5: Update Data Fetching

**5.1 Update `lib/fetch-market-data.ts`**

Replace direct FMP calls with cache-aware calls:

```ts
// Old
import { getGainersData } from '@/app/actions/gainers'
import { getLosersData } from '@/app/actions/losers'

// New
import { getAllSessionMovers } from '@/app/actions/market-movers'
```

In `fetchAllMarketData()`:

```ts
// Old
gainersResult = await getGainersData()
losersResult = await getLosersData()

// New
const [gainersAllSessions, losersAllSessions] = await Promise.all([
  getAllSessionMovers('gainers'),
  getAllSessionMovers('losers')
])
```

**5.2 Update `AllMarketData` Type**

```ts
// Old
gainers: GainerData[]
losers: LoserData[]

// New
gainers: {
  premarket: MoverData[]
  cash: MoverData[]
  afterhours: MoverData[]
  currentSession: MarketSession
}
losers: {
  premarket: MoverData[]
  cash: MoverData[]
  afterhours: MoverData[]
  currentSession: MarketSession
}
```

---

### Phase 6: UI Components

**6.1 Create Session Toggle Component**

File: `components/SessionToggle.tsx`

```tsx
'use client'

import { type MarketSession } from '@/lib/market-hours'

type SessionType = 'premarket' | 'cash' | 'afterhours'

interface SessionToggleProps {
  selected: SessionType
  onChange: (session: SessionType) => void
  currentSession: MarketSession
}

export default function SessionToggle({ selected, onChange, currentSession }: SessionToggleProps) {
  const sessions: { id: SessionType; label: string; shortLabel: string }[] = [
    { id: 'premarket', label: 'Pre-Market', shortLabel: 'Pre' },
    { id: 'cash', label: 'Regular', shortLabel: 'Reg' },
    { id: 'afterhours', label: 'After-Hours', shortLabel: 'AH' }
  ]

  return (
    <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
      {sessions.map((session) => {
        const isActive = selected === session.id
        const isLive = currentSession === session.id

        return (
          <button
            key={session.id}
            onClick={() => onChange(session.id)}
            className={`
              relative px-3 py-1 text-xs font-medium rounded-md transition-colors
              ${isActive
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }
            `}
          >
            {session.shortLabel}
            {isLive && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
            )}
          </button>
        )
      })}
    </div>
  )
}
```

**6.2 Update Gainers/Losers Tables**

File: `components/MarketMoversTable.tsx`

```tsx
'use client'

import { useState } from 'react'
import SessionToggle from './SessionToggle'
import type { MoverData } from '@/app/actions/market-movers'
import type { MarketSession } from '@/lib/market-hours'

type SessionType = 'premarket' | 'cash' | 'afterhours'

interface MarketMoversTableProps {
  title: 'Gainers' | 'Losers'
  data: {
    premarket: MoverData[]
    cash: MoverData[]
    afterhours: MoverData[]
    currentSession: MarketSession
  }
}

export default function MarketMoversTable({ title, data }: MarketMoversTableProps) {
  // Default to current session, fallback to 'cash'
  const defaultSession: SessionType =
    data.currentSession === 'closed' ? 'cash' : data.currentSession as SessionType

  const [selectedSession, setSelectedSession] = useState<SessionType>(defaultSession)

  const movers = data[selectedSession]
  const isGainers = title === 'Gainers'

  return (
    <div className="bg-white dark:bg-[rgb(33,33,33)] rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
        <SessionToggle
          selected={selectedSession}
          onChange={setSelectedSession}
          currentSession={data.currentSession}
        />
      </div>

      {/* Table */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {movers.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            No {title.toLowerCase()} data for {selectedSession} session
          </div>
        ) : (
          movers.slice(0, 10).map((mover) => (
            <div
              key={mover.symbol}
              className="flex items-center justify-between px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {mover.symbol}
                </div>
                <div className="text-xs text-gray-500 truncate max-w-[150px]">
                  {mover.name}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-900 dark:text-white">
                  ${mover.price.toFixed(2)}
                </div>
                <div className={`text-xs ${isGainers ? 'text-green-500' : 'text-red-500'}`}>
                  {isGainers ? '+' : ''}{mover.changesPercentage.toFixed(2)}%
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
```

---

### Phase 7: Update Dashboard

**7.1 Update `MarketDashboardSunday.tsx`**

Replace old gainers/losers rendering with new component:

```tsx
import MarketMoversTable from '@/components/MarketMoversTable'

// In the JSX:
<div className="grid grid-cols-2 gap-4">
  <MarketMoversTable title="Gainers" data={data.gainers} />
  <MarketMoversTable title="Losers" data={data.losers} />
</div>
```

---

## API Call Efficiency

### Before (Current)

```
Every 60s (24/7):
  - Fetch gainers (1 call)
  - Fetch losers (1 call)

Daily total: 2,880 API calls
Weekly total: 20,160 API calls
```

### After (New)

```
Only during active sessions:
  - Pre-market (4:00 AM - 9:30 AM): 330 minutes × 2 calls = 660 calls
  - Cash (9:30 AM - 4:00 PM): 390 minutes × 2 calls = 780 calls
  - After-hours (4:00 PM - 8:00 PM): 240 minutes × 2 calls = 480 calls

Daily total: 1,920 API calls (weekdays only)
Weekly total: 9,600 API calls (vs 20,160)

Savings: 52% reduction
```

Even better with smarter polling (every 2 min during slower periods).

---

## Data Cleanup

Add a cleanup job to remove old cache entries:

```sql
-- Run weekly: delete cache entries older than 7 days
DELETE FROM market_movers_cache
WHERE market_date < CURRENT_DATE - INTERVAL '7 days';
```

Or via cron endpoint:

```ts
// app/api/cron/cleanup-cache/route.ts
await supabaseAdmin
  .from('market_movers_cache')
  .delete()
  .lt('market_date', sevenDaysAgo)
```

---

## Testing Checklist

- [ ] Migration applies cleanly
- [ ] Cache reads work (with and without data)
- [ ] Cache writes work (upsert on conflict)
- [ ] Market session detection is accurate
- [ ] FMP endpoints return expected data format
- [ ] Cron job runs and respects market hours
- [ ] UI toggle switches between sessions
- [ ] Live indicator shows for active session
- [ ] Graceful fallback when cache is empty
- [ ] Graceful fallback when FMP fails

---

## Rollback Plan

If issues arise:

1. Revert `fetch-market-data.ts` to use direct FMP calls
2. Revert `AllMarketData` type changes
3. Revert component changes
4. Disable cron job

The cache table can remain (harmless) or be dropped:

```sql
DROP TABLE IF EXISTS market_movers_cache;
```

---

## Future Enhancements

1. **Historical view** - "Show pre-market movers from last Tuesday"
2. **Notifications** - Alert when a stock appears in multiple sessions
3. **Comparison view** - Side-by-side pre-market vs cash performance
4. **Extended data** - Add volume, market cap to movers
5. **Filtering** - Filter by sector, market cap, etc.
