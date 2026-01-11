# Multi-Company Comparison Implementation Plan

## Phase 1: Data Layer
1. Create `companies` table with S&P 500 tickers + metadata
2. Expand FMP fetch scripts to loop through companies
3. Ingest financials for top 100 companies into existing tables

## Phase 2: Tool Updates
1. Rename `getAaplFinancialsByMetric` → `getFinancialsByMetric`
2. Add `symbols: string[]` parameter (default: `["AAPL"]` for backwards compat)
3. Update `getFinancialMetric`, `getPrices` similarly
4. Add `searchCompanies` tool for ticker lookup ("Microsoft" → "MSFT")

## Phase 3: Prompt Updates (`lib/tools.ts`)
1. Add company extraction rules to tool selection prompt
2. Examples:
   - "Compare Apple and Microsoft revenue" → `symbols: ["AAPL", "MSFT"]`
   - "AAPL vs GOOGL P/E" → `symbols: ["AAPL", "GOOGL"]`
3. Handle ambiguity: "Compare tech giants" → ask user to specify

## Phase 4: Server Actions
1. Update queries: `.eq('symbol', 'AAPL')` → `.in('symbol', symbols)`
2. Return data grouped by symbol
3. Add company name to response for display

## Phase 5: Charts
1. Multi-series Highcharts config (one series per company)
2. Color coding by company
3. Legend with company names

## Phase 6: Answer Generation
1. Update prompt to handle comparative answers
2. Format: "Apple's revenue ($383B) was 20% higher than Microsoft's ($318B) in 2023"

---

## Data Cost Estimate
- FMP API: 250 calls/day on free tier
- 100 companies × 3 endpoints = 300 calls (need paid tier or batch over days)

## Timeline
- Phase 1-2: Foundation (data + tools)
- Phase 3-4: Core functionality (prompts + actions)
- Phase 5-6: Polish (charts + answers)
