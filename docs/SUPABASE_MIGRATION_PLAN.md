# Supabase Migration Plan for Watchlist Package

## Executive Summary

**Goal**: Replace all Firebase dependencies in `packages/watchlist/` with Supabase equivalents and enable real authentication (replacing guest mode stub).

**Timeline**: Phased approach over 3-5 work sessions
**Risk Level**: Medium (requires careful testing, but no data loss since Firebase is read-only source)
**Impact**: Enables full-featured watchlist with user accounts, data persistence, and removes Firebase billing

---

## Current State Analysis

### Firebase Services in Use

Based on analysis of `packages/watchlist/src/lib/firebase/`:

#### 1. **Authentication** (config.ts, admin.ts, auth-context)
- **Client Auth**: `firebase/auth` for sign-in, sign-up, token management
- **Server Auth**: `firebase-admin/auth` for token verification
- **Current Status**: Stubbed to "guest mode" - all auth methods throw errors
- **Usage**: AuthGuard, UserHeader, SignInForm, SignUpForm, useAuth hook

#### 2. **Firestore Database** (admin.ts, various services)
- **watchlists** - ✅ MIGRATED to Supabase (`watchlists` table + API endpoints)
- **settings** - ✅ MIGRATED to Supabase (`watchlist_settings` table + API endpoints)
- **dividends** - Used by dividend-service.ts (7-day cache, batch reads)
- **earnings** - Used by earnings-service.ts (24h cache, denormalized fields)
- **quotesCache** - Used by admin.ts (60s cache, batch reads with memory fallback)
- **extendedHoursCache** - Used by extended-hours-cache-service.ts
- **newsArchive** - Used by news-archive-service.ts
- **symbolMapping** - Used by symbol-mapping-service.ts
- **metrics** - Used by metrics-service.ts

#### 3. **Firebase Storage**
- Not currently used in watchlist package

### Dependencies to Remove

From `packages/watchlist/package.json`:
```json
"firebase": "^12.1.0",
"firebase-admin": "^13.5.0"
```

Current size: ~15MB combined

---

## Migration Strategy

### Phase 1: Database Schema & Tables (Supabase)

Create Supabase tables for all Firebase collections currently in use.

#### 1.1 Dividends Table

```sql
-- Table for cached dividend data
CREATE TABLE public.watchlist_dividends (
  symbol TEXT PRIMARY KEY,
  ex_date TEXT,
  payment_date TEXT,
  amount NUMERIC,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_days INTEGER DEFAULT 7,
  updated_by TEXT CHECK (updated_by IN ('cron', 'on-demand', 'manual'))
);

-- Index for TTL-based cleanup
CREATE INDEX idx_dividends_last_updated ON public.watchlist_dividends(last_updated);

-- RLS Policies
ALTER TABLE public.watchlist_dividends ENABLE ROW LEVEL SECURITY;

-- Anyone can read (public data)
CREATE POLICY "Dividends are viewable by everyone"
  ON public.watchlist_dividends FOR SELECT
  USING (true);

-- Only service role can write (server-side only)
CREATE POLICY "Dividends are writable by service role"
  ON public.watchlist_dividends FOR ALL
  USING (auth.role() = 'service_role');
```

#### 1.2 Earnings Cache Table

```sql
-- Table for cached earnings data with denormalized fields
CREATE TABLE public.watchlist_earnings (
  symbol TEXT PRIMARY KEY,
  upcoming JSONB, -- EarningsData | null
  recent JSONB[], -- Array of up to 4 recent quarters
  status TEXT CHECK (status IN ('none', 'upcoming', 'today_bmo', 'today_amc', 'recent')),
  days_away INTEGER,
  days_since INTEGER,
  event_timestamp_utc TIMESTAMPTZ, -- Easier to query in SQL
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (cached_at + INTERVAL '24 hours') STORED
);

-- Index for status queries
CREATE INDEX idx_earnings_status ON public.watchlist_earnings(status);

-- Index for TTL-based cleanup
CREATE INDEX idx_earnings_expires_at ON public.watchlist_earnings(expires_at);

-- RLS Policies
ALTER TABLE public.watchlist_earnings ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "Earnings are viewable by everyone"
  ON public.watchlist_earnings FOR SELECT
  USING (true);

-- Only service role can write
CREATE POLICY "Earnings are writable by service role"
  ON public.watchlist_earnings FOR ALL
  USING (auth.role() = 'service_role');
```

#### 1.3 Quotes Cache Table

```sql
-- Table for cached stock quote data
CREATE TABLE public.watchlist_quotes (
  symbol TEXT PRIMARY KEY,
  schema_version INTEGER DEFAULT 1,
  api_version TEXT DEFAULT 'fmp-v3',
  quote_data JSONB NOT NULL, -- Full FMP quote object
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_seconds INTEGER DEFAULT 60,
  updated_by TEXT CHECK (updated_by IN ('cron', 'on-demand', 'manual'))
);

-- Index for TTL-based queries
CREATE INDEX idx_quotes_last_updated ON public.watchlist_quotes(last_updated);

-- RLS Policies
ALTER TABLE public.watchlist_quotes ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "Quotes are viewable by everyone"
  ON public.watchlist_quotes FOR SELECT
  USING (true);

-- Only service role can write
CREATE POLICY "Quotes are writable by service role"
  ON public.watchlist_quotes FOR ALL
  USING (auth.role() = 'service_role');
```

#### 1.4 Extended Hours Cache Table

```sql
-- Table for cached extended hours (pre/post-market) data
CREATE TABLE public.watchlist_extended_hours (
  symbol TEXT NOT NULL,
  session TEXT NOT NULL CHECK (session IN ('premarket', 'afterhours')),
  price NUMERIC,
  change NUMERIC,
  change_percent NUMERIC,
  volume BIGINT,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_seconds INTEGER DEFAULT 60,
  PRIMARY KEY (symbol, session)
);

-- Index for session queries
CREATE INDEX idx_extended_hours_session ON public.watchlist_extended_hours(session);

-- Index for TTL-based cleanup
CREATE INDEX idx_extended_hours_last_updated ON public.watchlist_extended_hours(last_updated);

-- RLS Policies
ALTER TABLE public.watchlist_extended_hours ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "Extended hours are viewable by everyone"
  ON public.watchlist_extended_hours FOR SELECT
  USING (true);

-- Only service role can write
CREATE POLICY "Extended hours are writable by service role"
  ON public.watchlist_extended_hours FOR ALL
  USING (auth.role() = 'service_role');
```

Using `(symbol, session)` as the primary key preserves both premarket and afterhours quotes simultaneously instead of overwriting one row per symbol.

#### 1.5 News Archive Table

```sql
-- Table for cached news articles
CREATE TABLE public.watchlist_news_archive (
  id TEXT PRIMARY KEY, -- Unique article ID (hash of URL or GUID)
  symbol TEXT, -- Stock symbol (can be null for market-wide news)
  headline TEXT NOT NULL,
  summary TEXT,
  source TEXT NOT NULL, -- 'wsj', 'nyt', 'bloomberg', 'yahoo', 'barrons'
  url TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  topics TEXT[], -- Array of topic tags
  ai_summary TEXT, -- AI-generated summary (optional)
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_days INTEGER DEFAULT 7
);

-- Indexes for common queries
CREATE INDEX idx_news_symbol ON public.watchlist_news_archive(symbol);
CREATE INDEX idx_news_published_at ON public.watchlist_news_archive(published_at DESC);
CREATE INDEX idx_news_source ON public.watchlist_news_archive(source);
CREATE INDEX idx_news_last_updated ON public.watchlist_news_archive(last_updated);

-- RLS Policies
ALTER TABLE public.watchlist_news_archive ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "News is viewable by everyone"
  ON public.watchlist_news_archive FOR SELECT
  USING (true);

-- Only service role can write
CREATE POLICY "News is writable by service role"
  ON public.watchlist_news_archive FOR ALL
  USING (auth.role() = 'service_role');
```

#### 1.6 Symbol Mapping Table

```sql
-- Table for symbol mappings (alternate tickers, aliases)
CREATE TABLE public.watchlist_symbol_mapping (
  symbol TEXT PRIMARY KEY,
  canonical_symbol TEXT NOT NULL,
  alias_symbols TEXT[],
  company_name TEXT,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for canonical symbol lookups
CREATE INDEX idx_symbol_mapping_canonical ON public.watchlist_symbol_mapping(canonical_symbol);

-- RLS Policies
ALTER TABLE public.watchlist_symbol_mapping ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "Symbol mappings are viewable by everyone"
  ON public.watchlist_symbol_mapping FOR SELECT
  USING (true);

-- Only service role can write
CREATE POLICY "Symbol mappings are writable by service role"
  ON public.watchlist_symbol_mapping FOR ALL
  USING (auth.role() = 'service_role');
```

#### 1.7 Metrics Table

```sql
-- Table for cached performance metrics
CREATE TABLE public.watchlist_metrics (
  id TEXT PRIMARY KEY, -- Composite key (e.g., "AAPL:2024Q1")
  symbol TEXT NOT NULL,
  metric_type TEXT NOT NULL, -- 'earnings_quality', 'beat_quality', etc.
  period TEXT NOT NULL, -- '2024Q1', '2024', etc.
  metric_data JSONB NOT NULL,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_days INTEGER DEFAULT 30
);

-- Indexes for common queries
CREATE INDEX idx_metrics_symbol ON public.watchlist_metrics(symbol);
CREATE INDEX idx_metrics_type ON public.watchlist_metrics(metric_type);
CREATE INDEX idx_metrics_period ON public.watchlist_metrics(period);

-- RLS Policies
ALTER TABLE public.watchlist_metrics ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "Metrics are viewable by everyone"
  ON public.watchlist_metrics FOR SELECT
  USING (true);

-- Only service role can write
CREATE POLICY "Metrics are writable by service role"
  ON public.watchlist_metrics FOR ALL
  USING (auth.role() = 'service_role');
```

**Checklist for Phase 1:**
- [ ] Create migration SQL file: `supabase/migrations/20250119000000_watchlist_cache_tables.sql`
- [ ] Run migration: `supabase db push` or execute via Supabase Studio
- [ ] Verify tables exist with correct schema
- [ ] Test RLS policies (read as anon, write as service role)
- [ ] Add TypeScript types to `lib/database.types.ts`
- [ ] Schedule TTL cleanup job (Supabase Scheduled Tasks or pg_cron) to purge expired cache rows daily

#### 1.8 Cache Cleanup Job

Add a scheduled task (Supabase Scheduled Function, `pg_cron`, or your infra CRON hitting a maintenance endpoint) that runs at least hourly:

```sql
DELETE FROM public.watchlist_quotes WHERE last_updated < NOW() - INTERVAL '5 minutes';
DELETE FROM public.watchlist_extended_hours WHERE last_updated < NOW() - INTERVAL '5 minutes';
DELETE FROM public.watchlist_earnings WHERE expires_at < NOW();
DELETE FROM public.watchlist_dividends WHERE last_updated < NOW() - INTERVAL '14 days';
DELETE FROM public.watchlist_news_archive WHERE last_updated < NOW() - INTERVAL '30 days';
```

Logging the number of deleted rows per run will help verify cache churn and keep Supabase storage predictable.

---

### Phase 2: Authentication Migration

Replace Firebase Auth with Supabase Auth.

#### 2.1 Remove Firebase Auth Config

**File**: `packages/watchlist/src/lib/firebase/config.ts`

**Action**: Delete file entirely (will replace with Supabase client)

#### 2.2 Remove Firebase Admin Auth

**File**: `packages/watchlist/src/lib/firebase/admin.ts`

**Action**: Delete file entirely (auth verification will use Supabase middleware)

#### 2.3 Create Supabase Client Utilities

**New File**: `packages/watchlist/src/lib/supabase/client.ts`

```typescript
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Database } from '@/lib/database.types'

/**
 * Browser-side Supabase client for use in client components
 * Automatically handles cookie-based session management
 */
export function createClient() {
  return createClientComponentClient<Database>()
}
```

**New File**: `packages/watchlist/src/lib/supabase/server.ts`

```typescript
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { Database } from '@/lib/database.types'

/**
 * Server-side Supabase client for use in server components and API routes
 * Uses cookies for session management
 */
export function createServerClient() {
  return createServerComponentClient<Database>({ cookies })
}
```

**New File**: `packages/watchlist/src/lib/supabase/admin.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

/**
 * Admin Supabase client with service role key
 * USE WITH EXTREME CAUTION - bypasses RLS policies
 * Only use in server-side contexts (API routes, server actions)
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase admin credentials')
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
```

⚠️ Keep this module in a server-only entry point (e.g., `packages/watchlist/server/lib/supabase/admin.ts`) and re-export thin wrappers for API routes. Never import it from client bundles—otherwise the service role key can be inlined during tree-shaking. Client components should stick to `createClient()` or server helpers that proxy through API routes.

#### 2.4 Create Auth Context (Supabase)

**New File**: `packages/watchlist/src/lib/auth/AuthContext.tsx`

```typescript
'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  signInWithGoogle: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
    if (error) throw error
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        signInWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
```

#### 2.5 Update Auth Components

**File**: `packages/watchlist/src/components/Auth/AuthGuard.tsx`

```typescript
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      // Not signed in, redirect to auth page
      router.push('/auth')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-xl">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null // Will redirect
  }

  return <>{children}</>
}
```

**File**: `packages/watchlist/src/components/Auth/SignInForm.tsx`

Replace Firebase auth calls with:

```typescript
import { useAuth } from '@/lib/auth/AuthContext'

// In component:
const { signIn, signInWithGoogle } = useAuth()

// Email/password sign in:
await signIn(email, password)

// Google sign in:
await signInWithGoogle()
```

**File**: `packages/watchlist/src/components/Auth/SignUpForm.tsx`

Replace Firebase auth calls with:

```typescript
import { useAuth } from '@/lib/auth/AuthContext'

// In component:
const { signUp } = useAuth()

// Email/password sign up:
await signUp(email, password)
```

#### 2.6 Create Auth Callback Route

**New File**: `app/auth/callback/route.ts`

```typescript
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
    await supabase.auth.exchangeCodeForSession(code)
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL('/watchlist', requestUrl.origin))
}
```

#### 2.7 Configure Google OAuth in Supabase

**Steps**:
1. Go to Supabase Dashboard → Authentication → Providers
2. Enable Google provider
3. Add OAuth credentials from Google Cloud Console
4. Add authorized redirect URI: `https://[your-project].supabase.co/auth/v1/callback`
5. Test OAuth flow

**Checklist for Phase 2:**
- [ ] Create Supabase client utilities (client.ts, server.ts, admin.ts)
- [ ] Create new AuthContext with Supabase
- [ ] Update AuthGuard to use Supabase auth
- [ ] Update SignInForm with Supabase methods
- [ ] Update SignUpForm with Supabase methods
- [ ] Create auth callback route
- [ ] Configure Google OAuth in Supabase Dashboard
- [ ] Test email/password sign-up flow
- [ ] Test email/password sign-in flow
- [ ] Test Google OAuth sign-in flow
- [ ] Test sign-out flow
- [ ] Remove Firebase auth config files
- [ ] Remove auth-related imports from Firebase

---

### Phase 3: Database Services Migration

Replace Firebase Firestore services with Supabase equivalents.

#### 3.1 Migrate Dividend Service

**File**: `packages/watchlist/src/lib/firebase/dividend-service.ts` → `packages/watchlist/src/lib/services/dividend-service.ts`

**Before** (Firebase):
```typescript
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './config'

export class DividendService {
  static async getDividendData(symbol: string): Promise<DividendData | null> {
    const dividendRef = doc(db, 'dividends', symbol)
    const dividendDoc = await getDoc(dividendRef)
    // ...
  }

  static async saveDividendData(...): Promise<void> {
    const dividendRef = doc(db, 'dividends', symbol)
    await setDoc(dividendRef, { ..., lastUpdated: serverTimestamp() })
  }
}
```

**After** (Supabase):
```typescript
import { createAdminClient } from '@/lib/supabase/admin'

export class DividendService {
  private static CACHE_DURATION_DAYS = 7

  static async getDividendData(symbol: string): Promise<DividendData | null> {
    try {
      const supabase = createAdminClient()

      const { data, error } = await supabase
        .from('watchlist_dividends')
        .select('*')
        .eq('symbol', symbol)
        .single()

      if (error || !data) {
        return null
      }

      // Check if data is stale
      const lastUpdated = new Date(data.last_updated)
      const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)

      if (daysSinceUpdate > this.CACHE_DURATION_DAYS) {
        console.log(`[DividendService] Data for ${symbol} is stale (${daysSinceUpdate.toFixed(1)} days old)`)
        return null
      }

      return {
        exDate: data.ex_date,
        paymentDate: data.payment_date,
        amount: data.amount,
        lastUpdated: lastUpdated
      }
    } catch (error) {
      console.error(`[DividendService] Error getting dividend data for ${symbol}:`, error)
      return null
    }
  }

  static async saveDividendData(
    symbol: string,
    exDate: string | null,
    paymentDate: string | null,
    amount: number | null
  ): Promise<void> {
    try {
      const supabase = createAdminClient()

      const { error } = await supabase
        .from('watchlist_dividends')
        .upsert({
          symbol,
          ex_date: exDate,
          payment_date: paymentDate,
          amount,
          last_updated: new Date().toISOString(),
          updated_by: 'on-demand'
        })

      if (error) throw error

      console.log(`[DividendService] Successfully saved dividend data for ${symbol}`)
    } catch (error) {
      console.error(`[DividendService] Error saving dividend data for ${symbol}:`, error)
      throw error
    }
  }

  static async getBatchDividendData(symbols: string[]): Promise<Map<string, DividendData>> {
    const results = new Map<string, DividendData>()

    try {
      const supabase = createAdminClient()

      const { data, error } = await supabase
        .from('watchlist_dividends')
        .select('*')
        .in('symbol', symbols)

      if (error) throw error

      const now = Date.now()
      data?.forEach(row => {
        const lastUpdated = new Date(row.last_updated)
        const daysSinceUpdate = (now - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)

        // Only include fresh data
        if (daysSinceUpdate <= this.CACHE_DURATION_DAYS) {
          results.set(row.symbol, {
            exDate: row.ex_date,
            paymentDate: row.payment_date,
            amount: row.amount,
            lastUpdated
          })
        }
      })

      console.log(`[DividendService] Batch fetched ${results.size}/${symbols.length} symbols`)
    } catch (error) {
      console.error('[DividendService] Error in batch fetch:', error)
    }

    return results
  }
}
```

#### 3.2 Migrate Earnings Service

**File**: `packages/watchlist/src/lib/firebase/earnings-service.ts` → `packages/watchlist/src/lib/services/earnings-service.ts`

**Key Changes**:
- Replace `doc()`, `getDoc()`, `setDoc()` with Supabase `.from().select()/.upsert()`
- Replace `writeBatch()` with Supabase `.upsert()` (supports bulk upserts)
- Replace Firestore timestamp with `Date.now()` (milliseconds)
- Update field names to snake_case (Supabase convention)
- Store `cached_at`/`expires_at` as `TIMESTAMPTZ` so Postgres can enforce TTL logic server-side

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { EarningsData, EarningsCache, EarningsContext } from '@watchlist/types/earnings'

const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

export class EarningsService {
  async cacheEarnings(symbol: string, earningsData: EarningsData[]): Promise<void> {
    if (!symbol || earningsData.length === 0) return

    try {
      const supabase = createAdminClient()
      const now = Date.now()
      const cachedAt = new Date(now)
      const expiresAt = new Date(now + CACHE_TTL)

      const upcoming = earningsData.find(e => new Date(e.date).getTime() >= now)
      const recent = earningsData
        .filter(e => new Date(e.date).getTime() < now)
        .slice(0, 4)

      const { status, daysAway, daysSince, eventTimestampUtc } = this.computeStatus(upcoming, recent[0])

      const { error } = await supabase
        .from('watchlist_earnings')
        .upsert({
          symbol,
          upcoming: upcoming || null,
          recent,
          status,
          days_away: daysAway,
          days_since: daysSince,
          event_timestamp_utc: eventTimestampUtc ? new Date(eventTimestampUtc).toISOString() : null,
          cached_at: cachedAt.toISOString(),
          expires_at: expiresAt.toISOString()
        })

      if (error) throw error

      console.log(`[Earnings Service] Cached earnings for ${symbol}`)
    } catch (error) {
      console.error(`[Earnings Service] Error caching earnings for ${symbol}:`, error)
    }
  }

  async getEarnings(symbol: string): Promise<EarningsCache | null> {
    if (!symbol) return null

    try {
      const supabase = createAdminClient()

      const { data, error } = await supabase
        .from('watchlist_earnings')
        .select('*')
        .eq('symbol', symbol)
        .single()

      if (error || !data) return null

      // Check if cache is fresh
      if (!data.expires_at || Date.now() > new Date(data.expires_at).getTime()) {
        console.log(`[Earnings Service] Cache expired for ${symbol}`)
        return null
      }

      return {
        symbol: data.symbol,
        upcoming: data.upcoming,
        recent: data.recent,
        status: data.status,
        daysAway: data.days_away,
        daysSince: data.days_since,
        eventTimestampUtc: data.event_timestamp_utc,
        cachedAt: data.cached_at,
        expiresAt: data.expires_at
      }
    } catch (error) {
      console.error(`[Earnings Service] Error getting earnings for ${symbol}:`, error)
      return null
    }
  }

  async getBatchEarnings(symbols: string[]): Promise<Map<string, EarningsContext>> {
    const results = new Map<string, EarningsContext>()

    if (symbols.length === 0) return results

    try {
      const supabase = createAdminClient()

      const { data, error } = await supabase
        .from('watchlist_earnings')
        .select('*')
        .in('symbol', symbols)

      if (error) throw error

      const now = Date.now()
      data?.forEach(row => {
        // Only include fresh cache
        if (row.expires_at && now <= new Date(row.expires_at).getTime()) {
          results.set(row.symbol, {
            status: row.status,
            daysAway: row.days_away ?? undefined,
            daysSince: row.days_since ?? undefined,
            lastEarnings: row.recent[0],
            nextEarnings: row.upcoming ?? undefined,
            impactConfidence: 0
          })
        }
      })

      console.log(`[Earnings Service] Batch fetched ${results.size}/${symbols.length} symbols`)
    } catch (error) {
      console.error('[Earnings Service] Error in batch fetch:', error)
    }

    return results
  }

  async batchCacheEarnings(earningsMap: Map<string, EarningsData[]>): Promise<void> {
    if (earningsMap.size === 0) return

    try {
      const supabase = createAdminClient()
      const now = Date.now()
      const cachedAt = new Date(now)
      const expiresAt = new Date(now + CACHE_TTL)

      const rows = []
      for (const [symbol, earningsData] of earningsMap.entries()) {
        if (earningsData.length === 0) continue

        const upcoming = earningsData.find(e => new Date(e.date).getTime() >= now)
        const recent = earningsData
          .filter(e => new Date(e.date).getTime() < now)
          .slice(0, 4)

        const { status, daysAway, daysSince, eventTimestampUtc } = this.computeStatus(upcoming, recent[0])

        rows.push({
          symbol,
          upcoming: upcoming || null,
          recent,
          status,
          days_away: daysAway,
          days_since: daysSince,
          event_timestamp_utc: eventTimestampUtc ? new Date(eventTimestampUtc).toISOString() : null,
          cached_at: cachedAt.toISOString(),
          expires_at: expiresAt.toISOString()
        })
      }

      // Supabase supports bulk upsert (no 500-item limit like Firestore batch)
      const { error } = await supabase
        .from('watchlist_earnings')
        .upsert(rows)

      if (error) throw error

      console.log(`[Earnings Service] Batch cached ${rows.length} symbols`)
    } catch (error) {
      console.error('[Earnings Service] Error in batch cache:', error)
    }
  }

  // computeStatus method stays the same...
  private computeStatus(/* ... */) { /* ... */ }
}

export const earningsService = new EarningsService()
```

#### 3.3 Migrate Quotes Cache (from admin.ts)

**New File**: `packages/watchlist/src/lib/services/quotes-service.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

export async function saveQuoteDataAsAdmin(
  symbol: string,
  quoteData: any,
  updatedBy: 'cron' | 'on-demand' | 'manual' = 'cron'
): Promise<boolean> {
  try {
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('watchlist_quotes')
      .upsert({
        symbol,
        schema_version: 1,
        api_version: 'fmp-v3',
        quote_data: quoteData,
        last_updated: new Date().toISOString(),
        ttl_seconds: 60,
        updated_by: updatedBy
      })

    if (error) throw error

    // Also update memory cache
    const { quotesCache } = await import('@watchlist/lib/cache/simple-cache')
    quotesCache.set(`quote:${symbol}`, quoteData, 30) // 30s TTL

    return true
  } catch (error) {
    console.error(`[Admin] Error saving quote data for ${symbol}:`, error)
    return false
  }
}

export async function getQuoteDataAsAdmin(symbols: string[]): Promise<Map<string, any>> {
  const { quotesCache } = await import('@watchlist/lib/cache/simple-cache')
  const results = new Map<string, any>()
  const missingSymbols: string[] = []

  // Check memory cache first
  for (const symbol of symbols) {
    const cached = quotesCache.get<any>(`quote:${symbol}`)
    if (cached) {
      results.set(symbol, cached.data)
    } else {
      missingSymbols.push(symbol)
    }
  }

  if (results.size > 0) {
    console.log(`[Quote Cache] Memory HIT for ${results.size}/${symbols.length} symbols`)
  }

  // Fetch missing from Supabase
  if (missingSymbols.length > 0) {
    console.log(`[Quote Cache] Fetching ${missingSymbols.length} missing symbols from Supabase`)

    try {
      const supabase = createAdminClient()

      const { data, error } = await supabase
        .from('watchlist_quotes')
        .select('symbol, quote_data, schema_version')
        .in('symbol', missingSymbols)

      if (error) throw error

      data?.forEach(row => {
        // Validate schema version
        if (!row.schema_version || row.schema_version === 1) {
          results.set(row.symbol, row.quote_data)

          // Update memory cache
          quotesCache.set(`quote:${row.symbol}`, row.quote_data, 30)
        } else {
          console.warn(`[Quote Cache] Unknown schema version ${row.schema_version} for ${row.symbol}`)
        }
      })

      console.log(`[Admin] Fetched ${data?.length || 0} quotes from Supabase`)
    } catch (error) {
      console.error('[Admin] Error fetching quote data from Supabase:', error)
    }
  }

  return results
}

// Watchlist scanning functions (to find active symbols)
export async function scanUserWatchlists(): Promise<Set<string>> {
  const allSymbols = new Set<string>()

  try {
    const supabase = createAdminClient()

    // Get all watchlists from Supabase
    const { data: watchlists, error } = await supabase
      .from('watchlists')
      .select('tabs')

    if (error) throw error

    watchlists?.forEach(row => {
      if (row.tabs && Array.isArray(row.tabs)) {
        row.tabs.forEach((tab: any) => {
          if (tab.items && Array.isArray(tab.items)) {
            tab.items.forEach((item: any) => {
              if (item.type === 'stock' && item.symbol) {
                allSymbols.add(item.symbol)
              }
            })
          }
        })
      }
    })

    console.log(`[Admin] Scanned ${watchlists?.length || 0} watchlists, found ${allSymbols.size} unique symbols`)
  } catch (error) {
    console.error('[Admin] Error scanning watchlists:', error)
  }

  return allSymbols
}
```

#### 3.4 Migrate Other Services

Follow the same pattern for:

- **extended-hours-cache-service.ts** → Use `watchlist_extended_hours` table
- **news-archive-service.ts** → Use `watchlist_news_archive` table
- **symbol-mapping-service.ts** → Use `watchlist_symbol_mapping` table
- **metrics-service.ts** → Use `watchlist_metrics` table

**General Pattern**:
1. Replace `doc(db, 'collection', 'id')` with `supabase.from('table').select()...eq('id', value)`
2. Replace `getDoc(ref)` with `.single()` at end of query
3. Replace `setDoc(ref, data)` with `.upsert(data)`
4. Replace `getDocs(query)` with `.select()`
5. Replace `writeBatch()` with bulk `.upsert()` (no batch limit)
6. Replace Firestore `serverTimestamp()` with `new Date().toISOString()` or `Date.now()`
7. Convert camelCase field names to snake_case (Supabase convention)
8. Keep caching logic (memory cache, TTL checks) identical

**Checklist for Phase 3:**
- [ ] Migrate DividendService to Supabase
- [ ] Migrate EarningsService to Supabase
- [ ] Migrate quotes cache functions to Supabase
- [ ] Migrate ExtendedHoursService to Supabase
- [ ] Migrate NewsArchiveService to Supabase
- [ ] Migrate SymbolMappingService to Supabase
- [ ] Migrate MetricsService to Supabase
- [ ] Update all imports across the codebase
- [ ] Test each service individually
- [ ] Verify memory cache still works
- [ ] Verify batch operations work correctly

---

### Phase 4: Remove Firebase Dependencies

Clean up all Firebase references from the codebase.

#### 4.1 Remove Firebase Package Dependencies

**File**: `packages/watchlist/package.json`

**Remove**:
```json
"firebase": "^12.1.0",
"firebase-admin": "^13.5.0"
```

**Keep**:
```json
"@supabase/auth-helpers-nextjs": "^0.10.0"
```

**Add** (if not already present):
```json
"@supabase/supabase-js": "^2.39.0"
```

Run:
```bash
cd packages/watchlist
npm install
```

#### 4.2 Delete Firebase Files

**Files to delete**:
```
packages/watchlist/src/lib/firebase/config.ts
packages/watchlist/src/lib/firebase/admin.ts
packages/watchlist/src/lib/firebase/verify-token.ts
packages/watchlist/src/lib/firebase/dividend-service.ts (moved to services/)
packages/watchlist/src/lib/firebase/earnings-service.ts (moved to services/)
packages/watchlist/src/lib/firebase/extended-hours-cache-service.ts (moved to services/)
packages/watchlist/src/lib/firebase/news-archive-service.ts (moved to services/)
packages/watchlist/src/lib/firebase/symbol-mapping-service.ts (moved to services/)
packages/watchlist/src/lib/firebase/metrics-service.ts (moved to services/)
packages/watchlist/src/lib/firebase/watchlist-service.ts (already migrated)
packages/watchlist/src/lib/firebase/settings-service.ts (already migrated)
```

**Remove entire directory**:
```bash
rm -rf packages/watchlist/src/lib/firebase
```

#### 4.3 Update Import Paths

**Search and replace** across `packages/watchlist/src/`:

```typescript
// Old imports
import { something } from '@watchlist/lib/firebase/...'

// New imports
import { something } from '@watchlist/lib/services/...'
import { something } from '@watchlist/lib/auth/AuthContext'
import { something } from '@watchlist/lib/supabase/...'
```

**Files likely to have Firebase imports**:
- All hooks in `src/hooks/`
- All components in `src/components/`
- Main app file `src/index.tsx`

Use global search:
```bash
cd packages/watchlist
grep -r "from '@watchlist/lib/firebase" src/
grep -r "from './firebase" src/
grep -r "firebase/firestore" src/
grep -r "firebase/auth" src/
```

#### 4.4 Update Environment Variables

**Remove** (no longer needed):
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_SERVICE_ACCOUNT=
```

**Ensure present**:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

#### 4.5 Update Root App Configuration

**File**: `app/watchlist/page.tsx`

Wrap watchlist in AuthProvider:

```typescript
import { AuthProvider } from '@fin/watchlist/lib/auth/AuthContext'
import SundayWatchlistApp from '@fin/watchlist'

export default function WatchlistPage() {
  return (
    <AuthProvider>
      <SundayWatchlistApp />
    </AuthProvider>
  )
}
```

#### 4.6 Test Firebase Removal

**Verification Steps**:
1. Build the package: `cd packages/watchlist && npm run build`
2. Check for Firebase imports in build output
3. Run production build: `npm run build` (from root)
4. Check bundle size (should be ~15MB smaller without Firebase)
5. Test all features in browser (no Firebase errors in console)

**Checklist for Phase 4:**
- [ ] Remove firebase and firebase-admin from package.json
- [ ] Delete entire `src/lib/firebase/` directory
- [ ] Update all import paths to point to new locations
- [ ] Remove Firebase environment variables
- [ ] Wrap watchlist in AuthProvider
- [ ] Build package successfully
- [ ] Build main app successfully
- [ ] Verify no Firebase imports in build
- [ ] Verify bundle size reduction
- [ ] Test in browser (no console errors)

---

### Phase 5: Enable Real Authentication

Switch from guest mode to real user accounts.

#### 5.1 Remove Guest Mode Stub

**File**: `packages/watchlist/src/index.tsx` (or wherever guest mode is stubbed)

**Remove**:
```typescript
// Old stub that returns "guest" user
const user = { uid: 'guest', email: 'guest@example.com' }
```

**Replace with**:
```typescript
import { useAuth } from '@/lib/auth/AuthContext'

// In component:
const { user, loading } = useAuth()

if (loading) {
  return <LoadingSpinner />
}

if (!user) {
  return <AuthGuard>...</AuthGuard>
}
```

#### 5.2 Update API Routes to Use Real User ID

**Files**: All API routes in `app/api/watchlist/**`

**Before** (guest mode):
```typescript
const userId = 'guest' // Hardcoded guest user
```

**After** (real auth):
```typescript
import { createServerClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = createServerClient()

  // Get authenticated user
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const userId = user.id

  // Use userId for queries...
}
```

**Routes to update**:
- `/api/watchlist/route.ts`
- `/api/watchlist/settings/route.ts`
- Any other watchlist-related routes

#### 5.3 Update RLS Policies for User-Specific Data

**Watchlists Table** (already user-specific):
```sql
-- Users can only see their own watchlists
CREATE POLICY "Users can view own watchlists"
  ON public.watchlists FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only modify their own watchlists
CREATE POLICY "Users can modify own watchlists"
  ON public.watchlists FOR ALL
  USING (auth.uid() = user_id);
```

**Settings Table** (already user-specific):
```sql
-- Users can only see their own settings
CREATE POLICY "Users can view own settings"
  ON public.watchlist_settings FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only modify their own settings
CREATE POLICY "Users can modify own settings"
  ON public.watchlist_settings FOR ALL
  USING (auth.uid() = user_id);
```

**Cache Tables** (shared, read-only for users):
- Already configured in Phase 1 (public read, service role write)
- No changes needed

#### 5.4 Test Real Authentication

**Test Cases**:
1. **Sign Up Flow**:
   - Create new account with email/password
   - Verify email confirmation email is sent
   - Confirm email and sign in
   - Verify watchlist loads with empty state
   - Add stocks and verify they persist

2. **Sign In Flow**:
   - Sign in with existing account
   - Verify watchlist data loads correctly
   - Make changes and verify they persist
   - Sign out and verify data is cleared from UI

3. **Google OAuth Flow**:
   - Click "Sign in with Google"
   - Complete Google OAuth flow
   - Verify redirect back to /watchlist
   - Verify watchlist loads correctly

4. **Multi-User Isolation**:
   - Sign in as User A, create watchlist
   - Sign out
   - Sign in as User B, create different watchlist
   - Sign out
   - Sign in as User A, verify only User A's data is visible

5. **Unauthorized Access**:
   - Sign out
   - Try to access /watchlist directly
   - Verify redirect to /auth
   - Try to call API routes without auth
   - Verify 401 Unauthorized response

**Checklist for Phase 5:**
- [ ] Remove guest mode stub from watchlist package
- [ ] Update API routes to use real user IDs
- [ ] Verify RLS policies are correct
- [ ] Test sign-up with email/password
- [ ] Test sign-in with email/password
- [ ] Test Google OAuth sign-in
- [ ] Test sign-out
- [ ] Test multi-user data isolation
- [ ] Test unauthorized access protection
- [ ] Test watchlist persistence across sessions

---

## Testing Strategy

### Unit Tests

Create tests for each migrated service:

**Example**: `packages/watchlist/src/lib/services/__tests__/dividend-service.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { DividendService } from '../dividend-service'
import { createAdminClient } from '@/lib/supabase/admin'

describe('DividendService', () => {
  const testSymbol = 'AAPL_TEST'

  afterAll(async () => {
    // Cleanup test data
    const supabase = createAdminClient()
    await supabase.from('watchlist_dividends').delete().eq('symbol', testSymbol)
  })

  it('should save and retrieve dividend data', async () => {
    // Save
    await DividendService.saveDividendData(testSymbol, '2024-05-10', '2024-05-17', 0.25)

    // Retrieve
    const data = await DividendService.getDividendData(testSymbol)

    expect(data).not.toBeNull()
    expect(data?.exDate).toBe('2024-05-10')
    expect(data?.paymentDate).toBe('2024-05-17')
    expect(data?.amount).toBe(0.25)
  })

  it('should return null for non-existent symbol', async () => {
    const data = await DividendService.getDividendData('NONEXISTENT')
    expect(data).toBeNull()
  })

  it('should batch fetch multiple symbols', async () => {
    const symbols = [testSymbol, 'MSFT_TEST']
    const results = await DividendService.getBatchDividendData(symbols)

    expect(results.size).toBeGreaterThanOrEqual(0)
  })
})
```

### Integration Tests

**Manual Testing Checklist**:

1. **Data Persistence**:
   - [ ] Create watchlist, refresh page, verify data persists
   - [ ] Modify watchlist, refresh page, verify changes persist
   - [ ] Sign out and sign in, verify data persists

2. **Real-time Updates**:
   - [ ] Add stock to watchlist
   - [ ] Verify stock quote updates every 10s (during market hours)
   - [ ] Verify news badges update when new articles match

3. **Cache Functionality**:
   - [ ] First load: verify data fetched from API
   - [ ] Second load: verify data served from cache (faster)
   - [ ] Wait for cache expiry: verify fresh data fetched

4. **Multi-Tab Sync**:
   - [ ] Open watchlist in two browser tabs
   - [ ] Make changes in Tab 1
   - [ ] Verify Tab 2 reflects changes after refresh

5. **Error Handling**:
   - [ ] Disconnect internet, verify graceful degradation
   - [ ] Try to save with invalid data, verify error message
   - [ ] Sign out, try to access API, verify 401 error

### Performance Tests

**Metrics to Track**:

| Metric | Firebase Baseline | Supabase Target | Status |
|--------|------------------|-----------------|---------|
| Initial page load | ~1.5s | <1.5s | ⏳ TBD |
| Watchlist fetch (10 symbols) | ~300ms | <300ms | ⏳ TBD |
| Batch quote fetch (50 symbols) | ~800ms | <800ms | ⏳ TBD |
| Sign-in latency | ~500ms | <500ms | ⏳ TBD |
| Bundle size | 2.5MB | ~2.35MB (-15MB deps, +gzip) | ⏳ TBD |

**Load Testing**:
```bash
# Test concurrent user load
npx artillery quick --count 10 --num 50 https://your-app.vercel.app/api/watchlist
```

---

## Rollback Plan

If migration fails, we can rollback to Firebase:

### Step 1: Keep Firebase Code in Git History

**Before deleting**:
```bash
# Create backup branch
git checkout -b firebase-backup
git push origin firebase-backup

# Then proceed with migration on main branch
git checkout main
```

### Test Database Strategy

Never point automated tests at the production Supabase project. Run them against:

1. A local Supabase stack (`supabase start`) with seed data, or
2. A disposable schema/database (e.g., `supabase_test`) that each CI run resets inside a transaction.

Expose the test project's service key through `SUPABASE_SERVICE_ROLE_KEY_TEST` so `createAdminClient` can switch contexts during tests. This prevents unit specs from mutating customer data while still exercising the real SQL paths.

### Step 2: Rollback Procedure

**If migration fails**:
```bash
# Revert to pre-migration state
git revert [migration-commit-sha]

# Or cherry-pick Firebase files back
git checkout firebase-backup -- packages/watchlist/src/lib/firebase/
git checkout firebase-backup -- packages/watchlist/package.json

# Reinstall Firebase deps
cd packages/watchlist && npm install
```

### Step 3: Feature Flag

**Add migration feature flag** to safely test in production:

```typescript
// .env.local
NEXT_PUBLIC_USE_SUPABASE_MIGRATION=true

// In code:
const useSupabase = process.env.NEXT_PUBLIC_USE_SUPABASE_MIGRATION === 'true'

if (useSupabase) {
  // Use Supabase services
} else {
  // Use Firebase services (fallback)
}
```

This allows A/B testing and gradual rollout.

---

## Timeline & Milestones

### Week 1: Database & Auth Setup
- **Day 1-2**: Create Supabase tables (Phase 1)
- **Day 3-4**: Migrate authentication (Phase 2)
- **Day 5**: Test auth flows, fix issues

**Deliverable**: Users can sign up, sign in, and sign out with Supabase

### Week 2: Service Migration
- **Day 1**: Migrate DividendService and EarningsService
- **Day 2**: Migrate quotes cache and related admin functions
- **Day 3**: Migrate remaining services (extended hours, news, symbol mapping, metrics)
- **Day 4**: Update all import paths and test services
- **Day 5**: Integration testing

**Deliverable**: All Firebase services replaced with Supabase equivalents

### Week 3: Cleanup & Real Auth
- **Day 1**: Remove Firebase dependencies (Phase 4)
- **Day 2**: Enable real authentication (Phase 5)
- **Day 3**: Testing and bug fixes
- **Day 4**: Performance testing and optimization
- **Day 5**: Final QA and documentation

**Deliverable**: Fully migrated watchlist with real user accounts

---

## Success Criteria

### Must-Have (P0)
- [ ] All Firebase dependencies removed from package.json
- [ ] All Firebase imports removed from codebase
- [ ] User authentication works (email/password + Google OAuth)
- [ ] Watchlist data persists correctly for each user
- [ ] Settings persist correctly for each user
- [ ] All cache services work (dividends, earnings, quotes, etc.)
- [ ] No Firebase errors in browser console
- [ ] No Firebase API calls in network tab
- [ ] Multi-user data isolation verified
- [ ] Production build succeeds

### Should-Have (P1)
- [ ] Performance equal to or better than Firebase
- [ ] Bundle size reduced by ~15MB
- [ ] Unit tests pass for all services
- [ ] Integration tests pass
- [ ] Error handling works gracefully
- [ ] Supabase RLS policies tested and secure

### Nice-to-Have (P2)
- [ ] Migration guide documentation
- [ ] Rollback procedure tested
- [ ] Load testing completed
- [ ] Performance metrics documented
- [ ] A/B test with feature flag (optional)

---

## Risk Mitigation

### Risk 1: Data Loss During Migration
**Mitigation**:
- Keep Firebase as read-only source of truth during migration
- Test on staging environment first
- Create database backups before migration
- Use feature flag for gradual rollout

### Risk 2: Auth Flow Breaks
**Mitigation**:
- Test auth flows thoroughly on staging
- Keep Firebase auth as fallback during transition
- Document rollback procedure
- Monitor error logs closely after deployment

### Risk 3: Performance Regression
**Mitigation**:
- Benchmark Firebase performance before migration
- Test Supabase performance on staging
- Implement caching aggressively (memory + Supabase)
- Use Supabase edge functions if needed for latency

### Risk 4: Breaking Changes in Dependencies
**Mitigation**:
- Lock dependency versions during migration
- Test on staging with same versions as production
- Have rollback plan ready
- Keep Firebase backup branch

---

## Post-Migration Checklist

### Immediate (Day 1)
- [ ] Monitor error logs for any Firebase-related errors
- [ ] Monitor API response times
- [ ] Check Supabase dashboard for query performance
- [ ] Verify no 401/403 auth errors
- [ ] Check user feedback channels

### Week 1
- [ ] Review Supabase billing (should be lower than Firebase)
- [ ] Optimize slow queries if any
- [ ] Add indexes if needed
- [ ] Monitor cache hit rates
- [ ] Collect user feedback

### Week 2
- [ ] Delete Firebase project (if migration successful)
- [ ] Remove feature flag (if using)
- [ ] Update documentation
- [ ] Train team on Supabase
- [ ] Celebrate! 🎉

---

## Appendix

### A. Supabase Client Patterns

**Browser Client** (for client components):
```typescript
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()
const { data, error } = await supabase.from('table').select()
```

**Server Client** (for server components/API routes):
```typescript
import { createServerClient } from '@/lib/supabase/server'

const supabase = createServerClient()
const { data, error } = await supabase.from('table').select()
```

**Admin Client** (for bypassing RLS):
```typescript
import { createAdminClient } from '@/lib/supabase/admin'

const supabase = createAdminClient()
const { data, error } = await supabase.from('table').select()
```

### B. Common Migration Patterns

**Pattern 1: Single Document Read**
```typescript
// Firebase
const docRef = doc(db, 'collection', 'id')
const docSnap = await getDoc(docRef)
const data = docSnap.exists() ? docSnap.data() : null

// Supabase
const { data, error } = await supabase
  .from('table')
  .select()
  .eq('id', 'value')
  .single()
```

**Pattern 2: Collection Query**
```typescript
// Firebase
const q = query(collection(db, 'collection'), where('field', '==', 'value'))
const querySnapshot = await getDocs(q)
const results = querySnapshot.docs.map(doc => doc.data())

// Supabase
const { data, error } = await supabase
  .from('table')
  .select()
  .eq('field', 'value')
```

**Pattern 3: Write/Update**
```typescript
// Firebase
const docRef = doc(db, 'collection', 'id')
await setDoc(docRef, data, { merge: true })

// Supabase
const { error } = await supabase
  .from('table')
  .upsert({ id: 'value', ...data })
```

**Pattern 4: Batch Write**
```typescript
// Firebase
const batch = writeBatch(db)
batch.set(doc(db, 'collection', 'id1'), data1)
batch.set(doc(db, 'collection', 'id2'), data2)
await batch.commit()

// Supabase (no batch needed, bulk upsert)
const { error } = await supabase
  .from('table')
  .upsert([data1, data2])
```

### C. Environment Variables Reference

```bash
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Feature Flags
NEXT_PUBLIC_ENABLE_SUNDAY_WATCHLIST=true
NEXT_PUBLIC_USE_SUPABASE_MIGRATION=true

# Market Data
FMP_API_KEY=your-fmp-key

# AI (optional, for news summaries)
OPENAI_API_KEY=sk-...
```

### D. Useful Commands

```bash
# Create migration
supabase migration new watchlist_cache_tables

# Run migration
supabase db push

# Reset database (WARNING: deletes all data)
supabase db reset

# Generate TypeScript types
supabase gen types typescript --local > lib/database.types.ts

# Start local Supabase
supabase start

# View logs
supabase logs

# Open Supabase Studio
supabase studio
```

---

## Questions & Answers

**Q: What if we need Firebase for other parts of the app?**
A: This migration only affects `packages/watchlist/`. Other parts of the app can continue using Firebase if needed. However, the main Fin Quote app already uses Supabase exclusively.

**Q: Can we keep Firebase for analytics/monitoring?**
A: Yes, Firebase Analytics can remain if needed. This migration only removes Auth and Firestore dependencies. However, consider using Supabase's built-in analytics or PostHog for better integration.

**Q: What about Firebase Cloud Functions?**
A: The watchlist package doesn't use Cloud Functions. If needed in the future, use Supabase Edge Functions (Deno-based) or Next.js API routes/Server Actions.

**Q: How do we migrate existing Firebase users to Supabase?**
A: Since auth is currently stubbed to "guest mode", there are no real Firebase users to migrate. All users will be new Supabase users after migration.

**Q: What if Supabase is slower than Firebase?**
A: Supabase should be comparable or faster due to PostgreSQL performance and geographic proximity (can choose region). If issues arise, optimize with caching, indexes, or Edge Functions.

**Q: Can we run Firebase and Supabase in parallel during migration?**
A: Yes! Use a feature flag to switch between implementations. This allows gradual rollout and easy rollback if needed.

---

## Conclusion

This migration plan replaces all Firebase dependencies in the watchlist package with Supabase equivalents while maintaining feature parity and enabling real user authentication.

**Estimated Effort**: 15-20 hours of development + 5-10 hours of testing
**Risk Level**: Medium (well-defined scope, clear rollback path)
**Value**: Simplified tech stack, reduced costs, better integration with main app

After completion:
- ✅ No Firebase dependencies in watchlist package
- ✅ Real user authentication and data persistence
- ✅ Unified tech stack across entire application
- ✅ Reduced bundle size (~15MB smaller)
- ✅ Lower hosting costs (Supabase free tier is generous)

**Next Steps**: Begin Phase 1 (database schema creation) after this plan is reviewed and approved.
