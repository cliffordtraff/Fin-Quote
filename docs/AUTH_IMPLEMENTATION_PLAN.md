# Authentication Implementation Plan

## Overview

We're adding user authentication to save query history per user instead of per anonymous session.

---

## Current State

**How it works now:**
- Anonymous sessions using `localStorage`
- Each browser gets a random UUID (`finquote_session_id`)
- Queries saved to `query_logs` table with `session_id`
- **Problem:** History lost when clearing browser data or switching devices

**Current schema:**
```sql
query_logs (
  id UUID,
  session_id TEXT,  -- anonymous UUID from localStorage
  question TEXT,
  answer TEXT,
  tool_used TEXT,
  created_at TIMESTAMP
)
```

---

## Target State

**How it will work:**
- Users sign up/login with email + password (or OAuth)
- Each user gets a unique `user_id` from Supabase Auth
- Queries saved with `user_id` instead of `session_id`
- **Benefit:** History persists across devices and browser clears

**New schema:**
```sql
query_logs (
  id UUID,
  user_id UUID REFERENCES auth.users(id),  -- authenticated user
  session_id TEXT,  -- keep for backward compatibility
  question TEXT,
  answer TEXT,
  tool_used TEXT,
  created_at TIMESTAMP
)
```

---

## Architecture Decisions

### Where to Store User Data?

**✅ Recommended: Supabase Auth**

**Pros:**
- Already using Supabase for everything
- Built-in auth system (no extra service)
- Free tier: 50,000 monthly active users
- Handles password hashing, email verification, password reset
- Works with RLS (Row Level Security) policies
- OAuth providers (Google, GitHub, etc.) built-in

**Cons:**
- None for this use case

**❌ Not Recommended: Firebase Auth**

**Pros:**
- You mentioned Firebase earlier
- Good auth system

**Cons:**
- Adds second backend service (complexity)
- Need to sync user_id between Firebase and Supabase
- Extra cost
- More moving parts

### Where to Store Query History?

**✅ Keep in Supabase `query_logs` table**

Just add a `user_id` column to link queries to authenticated users.

---

## Implementation Steps

### Phase 1: Database Setup (10 min)

**1. Add user_id column to query_logs**

```sql
-- Add user_id column (nullable for backward compatibility)
ALTER TABLE query_logs
ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Create index for fast lookups
CREATE INDEX idx_query_logs_user_id ON query_logs(user_id);

-- Create index for session_id (still used for anonymous users)
CREATE INDEX idx_query_logs_session_id ON query_logs(session_id);
```

**2. Enable Row Level Security (RLS)**

```sql
-- Enable RLS on query_logs
ALTER TABLE query_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own queries
CREATE POLICY "Users can view own queries"
  ON query_logs FOR SELECT
  USING (
    auth.uid() = user_id
    OR session_id = current_setting('app.session_id', true)
  );

-- Policy: Users can insert their own queries
CREATE POLICY "Users can insert own queries"
  ON query_logs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR session_id IS NOT NULL
  );

-- Policy: Users can update their own queries (for feedback)
CREATE POLICY "Users can update own queries"
  ON query_logs FOR UPDATE
  USING (auth.uid() = user_id);
```

### Phase 2: Auth UI Components (30 min)

**1. Create auth components:**
- `components/AuthModal.tsx` - Login/Signup modal
- `components/UserMenu.tsx` - User dropdown menu (profile, logout)

**2. Auth flows:**
- Sign up with email + password
- Login with email + password
- Logout
- (Optional) OAuth with Google/GitHub
- (Optional) Password reset

**3. Protected routes:**
- `/ask` - Require login OR allow anonymous (your choice)
- Anonymous users can try it, logged-in users get history

### Phase 3: Update Data Layer (20 min)

**1. Update `app/actions/ask-question.ts`:**
```typescript
// Get user_id from Supabase Auth session
const { data: { user } } = await supabase.auth.getUser()

// Save query with user_id if logged in
await supabase.from('query_logs').insert({
  user_id: user?.id,        // authenticated user
  session_id: sessionId,     // fallback for anonymous
  question,
  answer,
  tool_used,
  // ... other fields
})
```

**2. Update `app/actions/get-recent-queries.ts`:**
```typescript
export async function getRecentQueries(userId?: string, sessionId?: string) {
  const supabase = createServerClient()

  // Fetch by user_id if logged in, otherwise by session_id
  const query = supabase
    .from('query_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  if (userId) {
    query.eq('user_id', userId)
  } else if (sessionId) {
    query.eq('session_id', sessionId)
  }

  const { data } = await query
  return data || []
}
```

### Phase 4: Update UI (15 min)

**1. Add auth state management:**
```typescript
// app/ask/page.tsx
const [user, setUser] = useState<User | null>(null)

useEffect(() => {
  // Get current user
  supabase.auth.getUser().then(({ data: { user } }) => {
    setUser(user)
  })

  // Listen for auth changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    setUser(session?.user ?? null)
  })

  return () => subscription.unsubscribe()
}, [])
```

**2. Show login button or user menu:**
```typescript
{user ? (
  <UserMenu user={user} />
) : (
  <button onClick={() => setShowAuthModal(true)}>
    Login / Sign Up
  </button>
)}
```

**3. Update recent queries to use user_id:**
```typescript
<RecentQueries
  userId={user?.id}
  sessionId={!user ? sessionId : undefined}
  onQueryClick={handleRecentQueryClick}
/>
```

---

## User Experience Flows

### For New Users

1. **First visit (anonymous)**
   - Can immediately start asking questions
   - History saved to localStorage session
   - Banner: "Sign up to save your history across devices"

2. **Sign up**
   - Click "Sign Up" button
   - Enter email + password
   - Email verification (optional)
   - **Migrate** their anonymous session queries to user account

3. **Logged in**
   - All queries saved to their account
   - Access history from any device
   - Can logout and data persists

### For Returning Users

1. **Visit site**
   - Auto-login if session valid
   - Load query history from database
   - Continue where they left off

2. **New device**
   - Login with email + password
   - All history loads (from other devices too)

---

## Migration Strategy

### Handling Existing Anonymous Sessions

When a user signs up, we should migrate their anonymous queries:

```typescript
async function migrateAnonymousQueries(userId: string, sessionId: string) {
  // Update all queries with this session_id to have the user_id
  await supabase
    .from('query_logs')
    .update({ user_id: userId })
    .eq('session_id', sessionId)
    .is('user_id', null)
}
```

Call this after successful signup:
```typescript
// After user signs up
const { user } = await supabase.auth.signUp({ email, password })
await migrateAnonymousQueries(user.id, sessionId)
```

---

## Security Considerations

### Row Level Security (RLS)

**Why it matters:**
- Without RLS, users could see each other's queries
- Even with client-side checks, anyone can call the API directly
- RLS enforces access control at the database level

**How it works:**
```sql
-- Example RLS policy
CREATE POLICY "Users can only see own queries"
  ON query_logs FOR SELECT
  USING (auth.uid() = user_id);
```

This means:
- User A can only SELECT queries where `user_id = User A's ID`
- Even if malicious code tries `SELECT * FROM query_logs`, they only get their own data
- Enforced by Postgres, not client code

### Sensitive Data

**What we're storing:**
- User questions (could contain sensitive info)
- Financial queries (personal interest in stocks)
- Query patterns (when/what they ask)

**Protection:**
- RLS ensures users can only see their own data
- HTTPS for data in transit
- Supabase encrypts data at rest
- Consider adding: data retention policy (delete old queries)

---

## Optional Enhancements

### 1. OAuth Providers (Easy to add)

```typescript
// Google sign-in
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`
  }
})

// GitHub sign-in
await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`
  }
})
```

### 2. User Profile Page

- View all past queries
- Delete individual queries
- Export history as CSV/JSON
- Account settings (email, password)
- Usage stats (total questions, favorite topics)

### 3. Shared Queries

- Generate shareable link for a query
- "Copy link to this question"
- Public queries (opt-in per query)

### 4. Query Collections

- Save queries to folders
- Tag queries by topic
- Search through past queries

---

## Cost Estimate

**Supabase Free Tier:**
- ✅ 50,000 monthly active users
- ✅ 500 MB database space
- ✅ 1 GB file storage
- ✅ 2 GB bandwidth

**Your expected usage:**
- 100 users: Well within free tier
- 1,000 users: Still free
- 10,000 users: Still free
- 50,000+ users: Upgrade to Pro ($25/month)

**Verdict:** Free for a long time!

---

## Implementation Timeline

| Phase | Task | Time | Priority |
|-------|------|------|----------|
| 1 | Database schema updates | 10 min | High |
| 2 | Enable RLS policies | 10 min | High |
| 3 | Create AuthModal component | 30 min | High |
| 4 | Update ask-question.ts for user_id | 15 min | High |
| 5 | Update get-recent-queries.ts | 10 min | High |
| 6 | Add auth state to page.tsx | 15 min | High |
| 7 | Add UserMenu component | 20 min | Medium |
| 8 | Migration function for anonymous | 15 min | Medium |
| 9 | OAuth providers (Google) | 20 min | Low |
| 10 | User profile page | 60 min | Low |

**Total core features:** ~1.5 hours
**Total with nice-to-haves:** ~3 hours

---

## Next Steps

1. **Review this plan** - any questions or changes?
2. **Database migration** - run SQL to add user_id column
3. **Build auth components** - login/signup UI
4. **Update data layer** - save queries with user_id
5. **Test** - try signup, login, query history
6. **Deploy** - push to production

---

## Questions to Answer

**Q: Should anonymous users be allowed?**
- **Option A:** Require login (more signups, less friction to try)
- **Option B:** Allow anonymous + encourage signup (better trial experience)
- **Recommendation:** Option B - let them try first, then signup to save history

**Q: Email verification required?**
- **Option A:** Yes (prevents spam, validates emails)
- **Option B:** No (faster signup, less friction)
- **Recommendation:** Option B for now, add later if spam becomes issue

**Q: What auth methods?**
- **Must have:** Email + password
- **Nice to have:** Google OAuth (most popular)
- **Optional:** GitHub, Apple, etc.

---

**Ready to implement? Let me know and I'll start building!**
