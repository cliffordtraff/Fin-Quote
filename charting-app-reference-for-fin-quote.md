# Charting App Reference for Fin Quote Integration

> **Purpose:** This document gives the Fin Quote codebase (and any AI working on it) everything it needs to know about the Charting Platform — its deployment, auth setup, Supabase usage, environment variables, API endpoints, and how the two apps connect. This is the single source of truth for cross-app integration details.

---

## 1. What Is the Charting App?

A high-performance financial charting platform (think Thinkorswim-style) built with:

- **Backend:** Node.js Express server (server-side HTML generation, no React)
- **Frontend:** Custom Canvas2D + WebGL engine (`@yourco/chart-engine`), vanilla JS UI injected as `<script>` tags
- **Data:** Financial Modeling Prep (FMP) API for market data
- **Auth & Storage:** Supabase (shared with Fin Quote — same project)
- **Repo:** `github.com/cliffordtraff/Charting-Platform` (private)

**Production URL:** `https://charts.theintraday.com`
**Fin Quote URL:** `https://theintraday.com`

---

## 2. Deployment (AWS EC2)

| Property | Value |
|---|---|
| **Hosting** | AWS EC2 t3.micro (Amazon Linux 2023) |
| **Public IP** | Check AWS console (needs Elastic IP for stability) |
| **Process manager** | PM2 (`pm2 start "node --import tsx dist/server/index.js" --name charting`) |
| **Reverse proxy** | nginx on port 80, proxies to `localhost:3000` |
| **SSL** | Cloudflare Flexible mode (Cloudflare terminates HTTPS, talks HTTP to EC2) |
| **DNS** | Cloudflare A record: `charts` → EC2 public IP (orange cloud / proxied) |
| **SSH** | EC2 Instance Connect (browser-based terminal) |
| **App directory** | `/home/ec2-user/charting-app` |
| **Node version** | v18 (via `dnf install nodejs`) |
| **Branch deployed** | `express-fin-quote-integration` |

### nginx config (`/etc/nginx/conf.d/charting.conf`)
```nginx
server {
    listen 80;
    server_name charts.theintraday.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Deploying updates to EC2
```bash
# SSH into EC2 via Instance Connect, then:
cd ~/charting-app
git pull
npm ci
npm run build
pm2 restart charting
```

### Cloudflare SSL settings
- **SSL/TLS mode:** Flexible (Cloudflare handles HTTPS; EC2 nginx listens on HTTP port 80 only)
- **No certbot/Let's Encrypt needed** — Cloudflare provides the certificate

---

## 3. Shared Supabase Project

Both apps use the **same Supabase project**. This is how shared auth works.

| Property | Value |
|---|---|
| **Supabase URL** | `https://hccwmbmnmbmhuslmbymq.supabase.co` |
| **Project** | Fin Quote's Supabase project (the charting app was consolidated into it) |
| **Auth providers** | Google OAuth (primary, from Fin Quote), Email/Password (also supported) |
| **Shared table** | `auth.users` — same users across both apps |

### What the charting app added to the Supabase database

A single `docs` table for storing chart workspaces, drawings, indicators, watchlists, and user preferences:

```sql
create table docs (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null,    -- 'workspace' | 'chart' | 'indicatorSet' | 'drawingLayer' | 'watchlist' | 'userPrefs' | 'template'
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_docs_owner on docs(owner_id);
create index idx_docs_type on docs(doc_type);
create index idx_docs_owner_type on docs(owner_id, doc_type);

-- RLS: users can only access their own docs
alter table docs enable row level security;
create policy "Users can read own docs" on docs for select using (owner_id = auth.uid());
create policy "Users can insert own docs" on docs for insert with check (owner_id = auth.uid());
create policy "Users can update own docs" on docs for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users can delete own docs" on docs for delete using (owner_id = auth.uid());

-- Auto-increment version on update
create or replace function increment_doc_version()
returns trigger as $$
begin
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  return NEW;
end;
$$ language plpgsql;

create trigger docs_version_trigger before update on docs for each row
  execute function increment_doc_version();
```

**This table does NOT conflict with any Fin Quote tables.** It's completely isolated via RLS (each user only sees their own docs).

### Supabase redirect URLs (registered in Supabase dashboard)
These must be in Supabase → Authentication → URL Configuration → Redirect URLs:
- `https://charts.theintraday.com/auth/callback`
- `https://theintraday.com/**` (or whatever Fin Quote uses)
- `http://localhost:3000/auth/callback` (charting dev)
- `http://localhost:3001/**` (Fin Quote dev, if applicable)

---

## 4. Cross-Subdomain Auth (How SSO Works)

### Strategy: Cookie-based shared domain auth

Both apps set Supabase auth cookies on the **parent domain** `.theintraday.com`. This means a user who logs in on `theintraday.com` is automatically authenticated on `charts.theintraday.com` (and vice versa).

### How it works end-to-end

1. **User logs in on Fin Quote** (`theintraday.com`) via Google OAuth
2. Supabase sets session cookies (`sb-*` cookies) on the browser
3. **Key:** These cookies must be set with `domain: .theintraday.com` so they're sent to all subdomains
4. User navigates to `charts.theintraday.com`
5. Browser sends the `sb-*` cookies (because cookie domain matches)
6. Charting app's Express middleware reads cookies via `@supabase/ssr`'s `createServerClient`
7. Middleware calls `supabase.auth.getUser()` to validate the session
8. User is authenticated — no re-login required

### What Fin Quote needs to do for this to work

**The critical requirement:** Fin Quote must set Supabase auth cookies with `domain: .theintraday.com` (note the leading dot — this makes cookies available to all subdomains).

#### Environment variables needed in Fin Quote:
```env
# Add these to Fin Quote's .env / Vercel env vars
NEXT_PUBLIC_COOKIE_DOMAIN=.theintraday.com
COOKIE_DOMAIN=.theintraday.com
```

#### Supabase client configuration in Fin Quote:
Wherever Fin Quote creates its Supabase client (browser-side or server-side), the cookie options must include the shared domain:

**Browser-side (Next.js client component):**
```typescript
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookieOptions: {
      domain: '.theintraday.com',  // <-- THIS IS THE KEY LINE
      path: '/',
      sameSite: 'lax',
      secure: true,
    },
  }
);
```

**Server-side (Next.js middleware / server component / route handler):**
```typescript
import { createServerClient } from '@supabase/ssr';

const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            ...options,
            domain: '.theintraday.com',  // <-- THIS IS THE KEY LINE
          });
        });
      },
    },
  }
);
```

**Without the `domain: '.theintraday.com'` setting, cookies are scoped to just `theintraday.com` and won't be sent to `charts.theintraday.com`.** This is the most common reason SSO fails.

### How the charting app handles it (already done)

The charting app already has all cookie domain handling in place:

- **`src/server/middleware/auth.ts`** — Express middleware reads `COOKIE_DOMAIN` env var, passes it to `@supabase/ssr`'s `createServerClient` in the `setAll` callback
- **`src/supabase/index.ts`** — Browser-side Supabase client accepts `cookieDomain` config, passes it to `createBrowserClient`'s `cookieOptions.domain`
- **`src/server/index.ts`** — `app.set('trust proxy', 1)` so Express recognizes HTTPS behind Cloudflare/nginx (required for secure cookies)
- **`src/server/routes/tos.ts`** — Passes `cookieDomain` and `secure` flags to the page context, which the auth bootstrap script uses

### Important: `trust proxy` setting

The charting app has `app.set('trust proxy', 1)` in `src/server/index.ts`. This is required because:
- Cloudflare terminates HTTPS and forwards HTTP to EC2
- Without `trust proxy`, Express sees HTTP and won't handle secure cookies properly
- If Fin Quote is behind Vercel (which also terminates SSL), Next.js handles this automatically

---

## 5. Environment Variables on EC2

The charting app's `.env` file on EC2 (`/home/ec2-user/charting-app/.env`):

```env
FMP_API_KEY=<fmp_api_key>
SUPABASE_URL=https://hccwmbmnmbmhuslmbymq.supabase.co
SUPABASE_ANON_KEY=<supabase_anon_key>
SUPABASE_SERVICE_ROLE_KEY=<supabase_service_role_key>
SUPABASE_AUTH_MODE=true
SUPABASE_SYNC_MODE=false
DOCSYNC_MODE=false
FIN_QUOTE_URL=https://theintraday.com
COOKIE_DOMAIN=.theintraday.com
PORT=3000
NODE_ENV=production
```

| Variable | Purpose | Sensitive? |
|---|---|---|
| `FMP_API_KEY` | Financial Modeling Prep API key (market data) | Yes — server-only |
| `SUPABASE_URL` | Supabase project URL | No — safe for client |
| `SUPABASE_ANON_KEY` | Supabase anonymous key (RLS-enforced) | No — safe for client |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (bypasses RLS) | **Yes — server-only, NEVER expose to browser** |
| `SUPABASE_AUTH_MODE` | Enable auth UI and session management | No |
| `SUPABASE_SYNC_MODE` | Enable cloud sync of chart data to Supabase | No |
| `DOCSYNC_MODE` | Enable IndexedDB persistence | No |
| `FIN_QUOTE_URL` | URL of Fin Quote app (for cross-app links) | No |
| `COOKIE_DOMAIN` | Shared cookie domain for SSO | No |
| `PORT` | Express server port | No |
| `NODE_ENV` | `production` or `development` | No |

---

## 6. Charting App API Endpoints

These are the routes the charting app exposes:

### Page routes
| Route | Description |
|---|---|
| `GET /` | Redirects to `/tos/AAPL` |
| `GET /tos/:ticker` | Main chart page (e.g., `/tos/AAPL`, `/tos/MSFT`) |
| `GET /health` | Health check — returns `{ status: 'ok' }` |

### Data API routes (used internally by the chart page)
| Route | Description |
|---|---|
| `GET /tos/api/bars?ticker=X&interval=D&range=1y` | Historical OHLCV bars |
| `GET /tos/api/search?q=apple` | Ticker search / autocomplete |
| `GET /tos/api/quotes?symbols=AAPL,MSFT` | Real-time quote snapshots |
| `GET /tos/api/profiles?symbols=AAPL` | Company profile + logo |
| `GET /tos/api/resolve?symbol=AAPL` | Symbol resolution |
| `GET /tos/api/fundamentals?symbol=AAPL&period=annual&statements=income,balance&limit=5` | Fundamentals data |

### Auth routes
| Route | Description |
|---|---|
| `GET /auth/login?redirect=/tos/AAPL` | Login page |
| `GET /auth/callback?redirect=/tos/AAPL` | OAuth callback (redirects to `redirect` param) |
| `POST /auth/logout` | Logout (204 No Content) |

---

## 7. Cross-App Navigation

### Fin Quote → Charting App

To link to the charting app from Fin Quote, use:

```tsx
// Link to chart for a specific symbol
<a href={`https://charts.theintraday.com/tos/${symbol}`}>
  Open in Workspace
</a>

// Examples:
// https://charts.theintraday.com/tos/AAPL
// https://charts.theintraday.com/tos/MSFT
// https://charts.theintraday.com/tos/TSLA
```

The URL pattern is `/tos/:ticker`. The ticker is case-insensitive.

### Charting App → Fin Quote (already implemented)

The charting app already has a toolbar button that links back to Fin Quote:

```
https://theintraday.com/stock/${ticker}
```

This appears as an external-link icon in the chart toolbar. It reads the `FIN_QUOTE_URL` environment variable so it works in both dev and production.

### Where to add the "Workspace" tab in Fin Quote

Add a new tab/link in the Fin Quote navbar (next to existing items like Dashboard, Stock, etc.):

```tsx
// In Fin Quote's navbar component
<Link href="https://charts.theintraday.com" target="_blank" rel="noopener">
  Workspace
</Link>

// Or for a specific symbol context (e.g., on a stock page):
<Link href={`https://charts.theintraday.com/tos/${symbol}`} target="_blank" rel="noopener">
  Workspace
</Link>
```

---

## 8. Data Contracts

If Fin Quote ever needs to consume charting data or share data structures:

### Bar format
```typescript
interface Bar {
  t: number;    // Timestamp in milliseconds (UTC)
  o: number;    // Open price
  h: number;    // High price
  l: number;    // Low price
  c: number;    // Close price
  v?: number;   // Volume (optional)
  session?: 'pre' | 'regular' | 'post';
}
```

### Intervals and time ranges
```typescript
type Interval = '1min' | '2min' | '5min' | '15min' | '30min' | '1hour' | '4hour' | 'D' | 'W' | 'M';
type TimeRange = '1d' | '5d' | '1m' | '3m' | '6m' | '1y' | '2y' | '5y';
```

### Auth user shape (from Supabase)
```typescript
// What both apps get from supabase.auth.getUser()
interface AuthUser {
  id: string;       // UUID — same across both apps (same auth.users table)
  email: string | null;
}
```

---

## 9. Feature Flags

The charting app uses environment-variable feature flags. These are the current production settings:

| Flag | Default | EC2 Value | What it does |
|---|---|---|---|
| `SUPABASE_AUTH_MODE` | `false` | `true` | Show login/profile UI, run auth middleware |
| `SUPABASE_SYNC_MODE` | `false` | `false` | Sync chart data to Supabase cloud |
| `DOCSYNC_MODE` | `true` | `false` | Use IndexedDB for local persistence |
| `DATAFEED_MODE` | `true` | `true` | Use `@yourco/datafeed` adapter |
| `INDICATOR_WORKER_MODE` | `true` | `true` | Compute indicators in Web Worker |
| `WATCHLIST_MODE` | `true` | `true` | Show watchlist sidebar |
| `OBJECT_TREE_MODE` | `true` | `true` | Show object tree panel |
| `REALTIME_MODE` | `false` | `false` | WebSocket streaming |
| `MULTICHART_MODE` | `false` | `false` | Multi-chart grid layout |
| `EMBED_MODE` | `false` | `false` | iframe embed product |

---

## 10. Common Troubleshooting

### "Logged in on Fin Quote but not on charting app"
1. **Check cookie domain:** Open DevTools → Application → Cookies on `charts.theintraday.com`. Look for `sb-*` cookies. If they're missing, Fin Quote isn't setting `domain: .theintraday.com` on cookies.
2. **Check Cloudflare SSL mode:** Must be "Flexible" (SSL/TLS → Overview in Cloudflare dashboard). If set to "Full" or "Strict", Cloudflare tries HTTPS to the origin, which fails (EC2 nginx only listens on HTTP).
3. **Check `trust proxy`:** The charting Express app must have `app.set('trust proxy', 1)`. Without it, Express behind a reverse proxy can't handle secure cookies correctly.

### "Charting app returns 522 or times out"
1. **Check EC2 security group:** Port 80 must be open for inbound HTTP traffic.
2. **Check PM2:** `pm2 status` — is the `charting` process online?
3. **Check nginx:** `sudo nginx -t && sudo systemctl status nginx`
4. **Check app logs:** `pm2 logs charting --lines 50`

### "Changes I pushed to GitHub aren't showing on EC2"
EC2 doesn't auto-deploy. You must SSH in and run:
```bash
cd ~/charting-app && git pull && npm ci && npm run build && pm2 restart charting
```

---

## 11. Integration Status (as of March 8, 2026)

### Completed
- [x] Supabase consolidated — charting uses Fin Quote's Supabase project
- [x] `docs` table created with RLS policies
- [x] Cookie-based auth with `@supabase/ssr` (both browser and server)
- [x] Cookie domain set to `.theintraday.com` on charting side
- [x] Google OAuth + Email/Password support
- [x] Charting app deployed to EC2 with nginx + Cloudflare SSL
- [x] Auth callback URLs registered in Supabase
- [x] `trust proxy` fix for secure cookies behind reverse proxy
- [x] Charting → Fin Quote link in toolbar (external link icon)
- [x] Cross-subdomain auth verified working

### Completed (Fin Quote side — March 8, 2026)
- [x] **Set cookie domain to `.theintraday.com`** in Fin Quote's Supabase client config (browser, server, middleware, callback) + Vercel env var
- [x] **Add "Workspace" tab** to Fin Quote navbar — same-tab navigation to `charts.theintraday.com/tos/{symbol}`
- [x] **Add Supabase migration file** for the `docs` table (`supabase/migrations/20260308000001_create_charting_docs_table.sql`)
- [x] **Cross-subdomain auth working** — login on Fin Quote, navigate to charting app, session is recognized
- [x] **Auth error handling** — OAuth callback now shows error messages instead of failing silently

### Remaining
- [ ] **Validate logout behavior** — logging out on one app should clear cookies for both
- [ ] **Shared Tailwind config** — sync sage/cream theme tokens to charting app for visual consistency

---

## 12. Quick Reference

```
Charting App URL:     https://charts.theintraday.com
Charting Chart URL:   https://charts.theintraday.com/tos/{TICKER}
Fin Quote URL:        https://theintraday.com
Fin Quote Stock URL:  https://theintraday.com/stock/{TICKER}

Supabase Project:     https://hccwmbmnmbmhuslmbymq.supabase.co
Shared Cookie Domain: .theintraday.com

Charting Repo:        github.com/cliffordtraff/Charting-Platform
Fin Quote Repo:       (Fin Quote's private repo)

EC2 Region:           (check AWS console)
EC2 App Path:         /home/ec2-user/charting-app
EC2 PM2 Process:      charting
EC2 nginx Config:     /etc/nginx/conf.d/charting.conf
```
