# Panel Discussion: Building Comparison Queries for Fin Quote

**Moderator:** We're here today to discuss how to build the comparison queries feature for Fin Quote - a financial chatbot competing with fiscal.ai. Users will ask natural language questions comparing multiple companies and get both a written answer AND an interactive Highcharts visualization.

**Examples:**
- "Compare Apple and Microsoft revenue over 5 years"
- "How does Tesla's P/E compare to Ford and GM?"
- "Show me gross margins for FAANG stocks"
- "Which has better ROE - JPMorgan or Goldman Sachs?"

**Current System Context:**
- Next.js 15 with Server Actions
- Highcharts for visualization (SVG-based)
- Two-step LLM: Tool Selection → Execution → Answer Generation
- Data in Supabase (PostgreSQL), currently AAPL only, expanding to 100+ companies
- Tools return structured JSON, charts generated from that data

---

## Panelists

1. **Elena** (Data Visualization Expert) - 12 years building financial dashboards at Bloomberg Terminal and Tableau. Deep expertise in Highcharts, D3.js, and what makes charts actually useful for analysts.

2. **James** (LLM Systems Engineer) - Built production RAG systems at Anthropic and Cohere. Expert in prompt engineering, tool design, and LLM reliability.

3. **Nina** (Financial Product Designer) - Former PM at fiscal.ai and Koyfin. Knows exactly what financial analysts expect from comparison tools.

4. **Ray** (Full-Stack Architect) - Principal engineer who's built real-time trading systems. Cares about latency, caching, and systems that feel instant.

---

## Topic 1: Chart Selection Logic

**Moderator:** Should the LLM choose the chart type, or should it be rule-based? What chart types are essential for financial comparisons?

**Elena:** Rule-based, absolutely. Here's why: chart type selection is deterministic based on data structure, not semantic intent. 

**Essential chart types for comparisons:**
1. **Multi-series line chart** - For time-series comparisons (revenue over 5 years for 3 companies). This is the workhorse. Highcharts handles this beautifully with `series: [{ name: 'AAPL', data: [...] }, { name: 'MSFT', data: [...] }]`.
2. **Grouped column chart** - For single-year or snapshot comparisons ("Compare P/E ratios for FAANG in 2024"). Use `chart.type: 'column'` with `plotOptions.column.grouping: true`.
3. **Scatter plot** - For correlation analysis ("Plot ROE vs P/E for tech stocks"). Highcharts scatter with `series.type: 'scatter'`.
4. **Waterfall chart** - For showing differences ("Show the gap between Apple and Microsoft revenue"). Highcharts has a waterfall module.

**Rule-based logic:**
```typescript
function selectChartType(query: string, data: ComparisonData): ChartType {
  const hasTimeSeries = data.some(company => company.data.length > 1);
  const isSingleYear = query.includes('in 2024') || query.includes('for 2024');
  const isCorrelation = query.includes('vs') && query.includes('plot');
  
  if (isCorrelation) return 'scatter';
  if (hasTimeSeries && !isSingleYear) return 'line';
  if (isSingleYear || !hasTimeSeries) return 'column';
  return 'line'; // default
}
```

**James:** I partially agree, but we need LLM input for edge cases. The LLM should extract intent: "compare over time" vs "compare at a point in time" vs "correlation analysis". Then apply rules. The tool selection prompt should include a `chartTypeHint` field that the LLM can optionally populate.

**Nina:** From fiscal.ai's experience, analysts expect consistency. If I ask "compare revenue" and get a line chart, then ask "compare margins" and get a bar chart, that's confusing. Rule-based with clear patterns: time = line, snapshot = column, correlation = scatter. No exceptions.

**Ray:** Rule-based is faster. No LLM call needed. We can encode this in the chart generation function. But we need to handle the "compare 5 companies over 10 years" case - that's 50 data points. Line chart with 5 series is fine, but we need color differentiation and a legend.

**Consensus:** Rule-based chart selection with clear patterns. LLM extracts temporal intent, but chart type is deterministic.

---

## Topic 2: Interactivity Requirements

**Moderator:** What Highcharts interactions matter? Click-to-drill-down? Hover tooltips? Toggle series on/off? Click a data point to ask a follow-up question?

**Elena:** MVP must-haves:
1. **Hover tooltips** - Show exact values, formatted correctly. Highcharts default is good, but customize formatting: "$383.3B (2024)" not "383285000000".
2. **Legend click to toggle series** - Essential for 5+ company comparisons. Highcharts does this by default with `legend: { enabled: true }`.
3. **Data labels on hover** - Not always visible, but appear on hover for clarity.

**Nice-to-haves (v2):**
4. **Zoom/pan** - For long time-series. Highcharts `chart.zoomType: 'x'` enables this.
5. **Export** - PNG/CSV export. Highcharts exporting module.
6. **Click data point → follow-up question** - This is innovative. We could use Highcharts `plotOptions.series.point.events.click` to trigger a modal: "Ask about AAPL's 2024 revenue?"

**James:** The click-to-follow-up is brilliant but complex. We'd need to:
1. Store the clicked point context (company, metric, year, value)
2. Generate a suggested question: "Tell me more about AAPL's revenue in 2024"
3. Pre-fill the input box

This is v2. For MVP, tooltips and legend toggle are sufficient.

**Nina:** fiscal.ai doesn't have click-to-follow-up, but Koyfin has "drill-down" which is similar. Analysts love it. But it's not table stakes. Focus on:
- **Tooltips that show all series at once** - When hovering over 2024, show "AAPL: $383B, MSFT: $318B, GOOGL: $307B" in one tooltip. Highcharts `tooltip.shared: true` does this.
- **Legend with company names, not symbols** - "Apple" not "AAPL" in the legend.

**Ray:** Performance concern: if we enable zoom/pan on a 10-year, 5-company chart, that's 50 data points. Highcharts handles this fine, but we need to ensure data grouping doesn't break interactivity. For MVP, keep it simple: tooltips + legend toggle.

**Consensus:** 
- **MVP:** Hover tooltips (shared, showing all series), legend toggle, formatted values
- **V2:** Zoom/pan, export, click-to-follow-up

---

## Topic 3: Data Normalization

**Moderator:** Companies have different fiscal year ends, different scales ($B vs $M). How do you make comparisons fair and clear?

**Elena:** This is critical. Three normalization strategies:

1. **Fiscal year alignment** - Map all companies to calendar years. If Apple's FY ends Sept 30, their "2024" data is actually Sept 2023 - Sept 2024. Map to calendar 2024 for comparison. This requires a fiscal year mapping table.

2. **Scale normalization** - Always show in the same unit. If comparing Apple ($383B) to a small cap ($500M), show both in billions: "$383.0B" and "$0.5B". Or use a dual-axis if scales are wildly different (rare for comparisons).

3. **Percentage change** - For trends, show YoY % change alongside absolute values. Tooltip: "AAPL: $383B (+5.2% YoY)".

**James:** The LLM should handle this in the answer generation. The prompt should say: "When comparing companies with different scales, normalize units. If one company reports in billions and another in millions, convert both to the same unit for clarity."

But the chart should show raw values with proper formatting. Don't normalize in the chart data itself - normalize in display.

**Nina:** fiscal.ai shows both: absolute values in the chart, percentage change in the written answer. This works well. For the chart, use a consistent unit (billions) and format small values as "$0.5B" not "$500M".

**Ray:** Database optimization: we should store a `scale_factor` column (1 for billions, 0.001 for millions) and normalize at query time. But for MVP, we can do this in the chart generation function. Check the max value, if it's < 1B, show in millions.

**Consensus:** 
- Normalize to calendar years in the database (fiscal year mapping)
- Show consistent units in charts (billions preferred, millions if needed)
- Include percentage change in tooltips and written answer
- Handle scale differences in chart generation, not in stored data

---

## Topic 4: Query Parsing

**Moderator:** How should the LLM handle ambiguous comparisons? "Compare big tech companies" - which ones? "Compare margins" - which margin?

**James:** This is a two-step problem:

1. **Company extraction** - The LLM should extract explicit companies first: "Apple and Microsoft" → `["AAPL", "MSFT"]`. For ambiguous queries like "big tech", we need a `searchCompanies` tool that returns a list: "Did you mean: AAPL, MSFT, GOOGL, META, NFLX?" Then ask the user to clarify.

2. **Metric disambiguation** - The current tool selection prompt already handles this well. "margins" → check context: "gross margins" vs "operating margins" vs "net margins". If truly ambiguous, the LLM should ask: "Which margin? Gross, operating, or net?"

**Tool design:**
```typescript
{
  name: 'searchCompanies',
  description: 'Search for company tickers by name or category',
  args: {
    query: 'string - "big tech", "FAANG", "banks", etc.',
    limit: 'number - max results (default: 10)'
  }
}
```

**Elena:** For chart generation, we need to handle the "FAANG" case. The LLM should expand "FAANG" to `["META", "AAPL", "AMZN", "NFLX", "GOOGL"]` before calling the tool. This expansion should be in the tool selection prompt with examples.

**Nina:** fiscal.ai handles this with autocomplete. As the user types "compare big", it suggests "big tech", "big banks", etc. But for MVP, we can do this in the LLM. Add to the prompt:

```
COMMON COMPANY GROUPS:
- "FAANG" → ["META", "AAPL", "AMZN", "NFLX", "GOOGL"]
- "big tech" → ["AAPL", "MSFT", "GOOGL", "META", "AMZN"]
- "banks" → ["JPM", "BAC", "WFC", "C", "GS"]
- "auto" → ["TSLA", "F", "GM", "FORD"]

If user asks to compare a group, expand to individual tickers.
```

**Ray:** Performance: if the LLM expands "FAANG" to 5 companies, that's 5 parallel database queries. We should batch these in a single query: `.in('symbol', ['META', 'AAPL', ...])`. The tool should accept `symbols: string[]` not just a single symbol.

**Consensus:**
- LLM extracts companies (explicit or from groups)
- Add `searchCompanies` tool for ambiguous queries
- Expand common groups (FAANG, big tech) in the prompt
- Tools accept `symbols: string[]` for batch queries
- For truly ambiguous queries, ask user to clarify

---

## Topic 5: Answer + Chart Integration

**Moderator:** Should the written answer describe what's in the chart, or provide additional insight? How do you avoid redundancy?

**James:** The answer should provide **insight**, not just describe the chart. The chart shows the data; the answer should explain **why** and **what it means**.

**Answer structure:**
1. **Summary sentence** - "Apple's revenue ($383B) exceeded Microsoft's ($318B) by 20% in 2024."
2. **Trend analysis** - "Over the past 5 years, Apple grew 40% while Microsoft grew 35%."
3. **Context** - "This gap widened after Apple's iPhone 15 launch in 2023."
4. **Chart reference** - "See the chart below for the full comparison."

The prompt should say: "Do not describe what's in the chart. Provide analysis and context. Reference the chart only to direct the user's attention."

**Elena:** I agree. The chart is self-explanatory for analysts. The answer should add value: highlight outliers, explain trends, provide context.

**Nina:** fiscal.ai does this well. The answer is 2-3 sentences of insight, then "See chart for details." This works because analysts can read the chart themselves.

**Ray:** We need to ensure the answer doesn't contradict the chart. If the chart shows Apple at $383B and Microsoft at $318B, the answer must use those exact numbers. The validation step should check this.

**Consensus:**
- Answer provides insight and context, not chart description
- Reference the chart only to direct attention
- Ensure answer numbers match chart data (validation)
- Keep answers concise (2-3 sentences for comparisons)

---

## Topic 6: Performance & Caching

**Moderator:** Comparing 5 companies × 10 years = 50 data fetches. How do you keep this fast?

**Ray:** This is the critical question. Three strategies:

1. **Batch queries** - Don't fetch 5 companies sequentially. Use `.in('symbol', symbols)` to fetch all companies in one query. This reduces 5 queries to 1.

2. **Parallel tool execution** - If comparing revenue AND P/E, execute both tools in parallel, not sequentially.

3. **Caching** - Cache at two levels:
   - **Database query cache** - Supabase/PostgreSQL query cache (automatic)
   - **Application cache** - Redis or in-memory cache for common comparisons ("FAANG revenue last 5 years"). TTL: 1 hour for financial data, 5 minutes for prices.

**Implementation:**
```typescript
async function fetchComparisonData(symbols: string[], metric: string, years: number) {
  const cacheKey = `comparison:${symbols.sort().join(',')}:${metric}:${years}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  // Single batch query
  const { data } = await supabase
    .from('financials_std')
    .select('*')
    .in('symbol', symbols)
    .eq('metric', metric)
    .gte('year', currentYear - years)
    .order('year', { ascending: true });
  
  await redis.setex(cacheKey, 3600, JSON.stringify(data));
  return data;
}
```

**James:** The LLM tool selection should be aware of caching. If the user asks "compare FAANG revenue" and we just fetched it 2 minutes ago, we can skip the tool call and use cached data. But this is v2 optimization.

**Nina:** fiscal.ai pre-aggregates common comparisons. They have a `comparison_cache` table with pre-computed "FAANG revenue 5 years" results. This is overkill for MVP, but worth considering for v2.

**Elena:** Chart rendering performance: Highcharts handles 50 data points easily. But if we're comparing 10 companies over 20 years (200 points), we need data grouping. Highcharts `dataGrouping` automatically groups points when zoomed out. This is already implemented for price charts - we should use it for comparison charts too.

**Consensus:**
- Batch queries: `.in('symbol', symbols)` for multi-company
- Parallel tool execution for multiple metrics
- Application-level caching (Redis) with 1-hour TTL for financials
- Use Highcharts data grouping for large datasets (10+ companies, 10+ years)
- Pre-aggregation is v2 optimization

---

## Topic 7: What fiscal.ai Does Right

**Moderator:** What should we directly copy vs. improve upon? What's table stakes vs. differentiator?

**Nina:** Let me break down fiscal.ai's comparison feature:

**Table stakes (must have):**
1. Multi-company line charts with clear color differentiation
2. Hover tooltips showing all companies at once
3. Legend with company names (not just symbols)
4. Written answer with percentage changes and context
5. Handles 3-5 companies smoothly

**What they do well:**
1. **Smart defaults** - If you ask "compare tech companies", they suggest the top 5 by market cap. We should do the same.
2. **Export to Excel** - Analysts love this. Highcharts exporting module makes this easy.
3. **Time range presets** - "Last 5 years", "Last 10 years" buttons. We can add these as follow-up questions.

**Where we can differentiate:**
1. **Click-to-follow-up** - Click a data point to ask "Why did Apple's revenue drop in 2023?" This is innovative.
2. **Natural language queries** - fiscal.ai requires structured input. We have natural language, which is our advantage.
3. **Contextual answers** - Our LLM can provide richer context than fiscal.ai's templated responses.

**Elena:** From a visualization perspective, fiscal.ai's charts are clean but basic. We can improve:
1. **Better color palette** - Use a colorblind-friendly palette (Highcharts default is good, but we can customize)
2. **Dual-axis for scale differences** - If comparing a $500B company to a $5B company, use dual y-axis
3. **Annotations** - Highlight significant events ("iPhone launch", "pandemic impact") on the chart

**James:** fiscal.ai's query parsing is rigid. They require "Company A vs Company B metric". We can handle "How does Apple compare to Microsoft?" which is more natural. This is our differentiator.

**Ray:** Performance-wise, fiscal.ai feels instant because they pre-aggregate everything. We can't do that for MVP, but we can optimize with caching and batch queries to get close.

**Consensus:**
- **Copy:** Multi-company charts, tooltips, legend, export, smart defaults
- **Improve:** Natural language queries, contextual answers, click-to-follow-up
- **Differentiate:** LLM-powered insights, natural language parsing, interactive data points

---

## Implementation Plan Summary

**Phase 1: Foundation (Week 1)**
1. Update tools to accept `symbols: string[]` instead of single symbol
2. Add `searchCompanies` tool for ticker lookup
3. Update database queries to use `.in('symbol', symbols)`
4. Add fiscal year mapping table

**Phase 2: Chart Generation (Week 2)**
1. Create `generateComparisonChart()` function in `lib/chart-helpers.ts`
2. Implement rule-based chart type selection
3. Add multi-series support to Highcharts config
4. Customize tooltips and legend

**Phase 3: LLM Integration (Week 2)**
1. Update tool selection prompt with company extraction rules
2. Add common group expansions (FAANG, big tech)
3. Update answer generation prompt for comparison insights
4. Add validation for answer-chart consistency

**Phase 4: Performance (Week 3)**
1. Implement batch queries (`.in('symbol', symbols)`)
2. Add Redis caching layer
3. Parallel tool execution
4. Data grouping for large datasets

**Phase 5: Polish (Week 3)**
1. Click-to-follow-up (v2)
2. Export functionality
3. Dual-axis for scale differences
4. Annotations on charts

---

## Final Recommendations

**Elena:** Start with multi-series line charts. They're the most versatile and what analysts expect. Add column charts for single-year comparisons in v2.

**James:** The LLM should extract companies and metrics, but chart type selection should be rule-based. This gives us reliability and performance.

**Nina:** Focus on the core comparison experience first: 2-3 companies, 5-10 years, one metric. Get that perfect, then expand.

**Ray:** Batch queries and caching are non-negotiable. Without them, 5-company comparisons will be slow. This is infrastructure, not a feature.

**Moderator:** Thank you all. This gives us a clear path forward. Let's build this feature with rule-based chart selection, batch queries, caching, and LLM-powered insights. We'll start with the foundation and iterate.


