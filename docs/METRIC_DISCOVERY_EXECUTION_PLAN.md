# Metric Discovery & Execution Plan

## Goal
Expose all 139 financial metrics through one reliable tool call while giving both humans and the LLM an easy way to discover what’s available. We accomplish this with two complementary layers:

1. **Discovery Layer (Catalog)** – Teach the model/UI what metrics exist before it makes a request.
2. **Execution Layer (Alias + Multi-metric Resolver)** – Translate whatever phrase the caller uses into the canonical metric keys that Supabase expects.

## 1. Discovery Layer (Catalog)
### Purpose
Provide a read-only endpoint (or static JSON) that lists every metric, its canonical key, category, units, definition, and example usage. The LLM or UI can browse this catalog to understand what’s available before calling the tool.

### Why it matters
- **Discoverability:** The current prompt only lists nine metrics; the catalog shows all 139 grouped by Valuation, Profitability, Growth, etc.
- **Grounding:** Definitions and units prevent confusion about what each metric represents.
- **Better tool picks:** The LLM can consult the catalog to pick the right key instead of guessing names from memory.

### Implementation outline
1. Export the canonical metric list from `financial_metrics` (name, category, description, units).
2. Store it as `metrics_catalog.json` or serve via a simple `GET /metrics/catalog` endpoint.
3. Update the router prompt to mention `listMetrics` (or similar) as a read-only tool.
4. Encourage the LLM to call `listMetrics` when it needs clarification (“Which debt ratios do you know?”).

## 2. Execution Layer (Alias & Multi-Metric Resolver)
### Purpose
Once the model chooses a metric, ensure the request succeeds even if the phrasing isn’t exact, and support multiple metrics in one call.

### Components
- **Alias map:** Dictionary that maps natural language names and abbreviations ("price to earnings", "p/e") to canonical keys (`peRatio`).
- **Similarity fallback:** If no alias exists, use a lightweight similarity check (embeddings or Levenshtein) to pick the closest canonical name.
- **Plural support:** Allow `metricNames: string[]` so one tool call can fetch multiple metrics.
- **Canonical query:** Only send validated canonical keys to Supabase, and fetch all requested metrics in one SQL query when possible.

### Why it matters
- **Reliability:** Users can be imprecise (“PE multiple”) and still receive `peRatio` data.
- **Scalability:** Adding new metrics only requires updating the catalog + alias map, not rewriting prompts.
- **Efficiency:** Multi-metric questions run in a single round-trip, reducing latency and token cost.

### Implementation outline
1. Define `canonicalMetrics: string[]` in code to validate requests.
2. Create `metricAliases: Record<string, string>` with common synonyms.
3. Build a helper `resolveMetricName(input: string): string | null` that normalizes input, checks aliases, and falls back to similarity.
4. Update the new `getFinancialMetric(s)` tool handler to accept either `metricName` or `metricNames`, resolve them via the helper, dedupe, and query Supabase.
5. Return results keyed by canonical name so downstream formatting and validation stay clean.

## How the layers work together
1. **Discovery:** The LLM (or UI) can call `listMetrics` to understand available metrics, categories, units, and descriptions.
2. **Execution:** When the user actually asks, “What’s Apple’s price to earnings?”, the LLM calls `getFinancialMetric` with whatever string it prefers.
3. **Translation:** The server resolves that phrase to `peRatio`, queries Supabase, and returns annual data.

With both layers, the system becomes easier to explore and dramatically more forgiving at execution time, unlocking all 139 metrics without overwhelming the router or the prompt.
