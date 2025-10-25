# Fin Quote - Company Financial Data Platform

A Next.js application that displays company financial data from Supabase.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Firebase Auth (separate)
- **Styling**: Tailwind CSS
- **Language**: TypeScript

## Database Schema

### Tables

1. **company**
   - `id` (uuid, primary key)
   - `created_at` (timestamptz)
   - `symbol` (text, unique)
   - `name` (text)
   - `sector` (text)
   - RLS Policy: Public read access

2. **financials_std**
   - `id` (uuid, primary key)
   - `created_at` (timestamptz)
   - `symbol` (text, foreign key → company.symbol)
   - `year` (int4)
   - `revenue` (int8)
   - `gross_profit` (int8)
   - RLS Policy: Public read access

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

You can find these values in your Supabase project:
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to Settings → API
4. Copy the "Project URL" and "anon/public" key

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Project Structure

```
├── app/
│   ├── actions/
│   │   └── financials.ts       # Server action to fetch data
│   ├── financials/
│   │   └── page.tsx            # Financials display page
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home page
│   └── globals.css             # Global styles
├── lib/
│   ├── database.types.ts       # TypeScript types for Supabase
│   └── supabase/
│       ├── client.ts           # Client-side Supabase client
│       └── server.ts           # Server-side Supabase client
├── .env.local.example          # Example environment variables
└── package.json
```

## Features

### Server Actions

The app uses Next.js Server Actions for data fetching, located in `app/actions/financials.ts`:

```typescript
import { getCompaniesWithFinancials } from '@/app/actions/financials'

const { data, error } = await getCompaniesWithFinancials()
```

This server action:
- Fetches all companies with their related financial data
- Uses Supabase's nested `.select()` syntax to join tables
- Returns fully typed data using TypeScript
- Handles errors gracefully
- Orders companies by name and financials by year (descending)

### Type Safety

All database types are defined in `lib/database.types.ts`, providing:
- Full TypeScript autocomplete for database queries
- Type-safe data access throughout the application
- Helper types like `CompanyWithFinancials` for joined data

### Supabase Client

Two client configurations are available:

1. **Server Client** (`lib/supabase/server.ts`)
   - Used in Server Components and Server Actions
   - Runs on the server only
   - Safe for sensitive operations

2. **Browser Client** (`lib/supabase/client.ts`)
   - Used in Client Components
   - Runs in the browser
   - Uses the public anon key (safe to expose)

## Usage Example

### Fetching Data in a Server Component

```typescript
// app/financials/page.tsx
import { getCompaniesWithFinancials } from '@/app/actions/financials'

export default async function FinancialsPage() {
  const { data: companies, error } = await getCompaniesWithFinancials()

  // Render companies and their financials
  return (
    <div>
      {companies?.map(company => (
        <div key={company.id}>
          <h2>{company.name} ({company.symbol})</h2>
          {company.financials_std.map(financial => (
            <div key={financial.id}>
              <p>Year: {financial.year}</p>
              <p>Revenue: ${financial.revenue.toLocaleString()}</p>
              <p>Gross Profit: ${financial.gross_profit.toLocaleString()}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

### Nested Supabase Query

The server action uses Supabase's nested select syntax to fetch related data in a single query:

```typescript
const { data, error } = await supabase
  .from('company')
  .select(`
    id,
    created_at,
    symbol,
    name,
    sector,
    financials_std (
      id,
      created_at,
      symbol,
      year,
      revenue,
      gross_profit
    )
  `)
  .order('name', { ascending: true })
  .order('year', { foreignTable: 'financials_std', ascending: false })
```

This approach:
- Avoids N+1 query problems
- Returns properly typed nested data
- Maintains referential integrity
- Reduces network overhead

## Security

- RLS (Row Level Security) policies are enabled on both tables with public read access
- The anon key is safe to expose in the browser (it's prefixed with `NEXT_PUBLIC_`)
- Authentication is handled separately via Firebase Auth
- Environment variables are properly configured and ignored by git

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Next Steps

- Add pagination for large datasets
- Implement filtering and search
- Add data visualization (charts/graphs)
- Set up Firebase Auth integration
- Add data export functionality
- Create admin panel for data management
