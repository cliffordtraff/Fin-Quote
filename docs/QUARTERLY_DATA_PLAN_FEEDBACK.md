# Feedback on Quarterly Data Plan

- **Schema safety**: Add a CHECK constraint for `period_type IN ('annual','quarterly','ttm')` to avoid typos. If you later store TTM rows, include `period_type` and `period_end_date` in indexes used for TTM queries.
- **Labeling for grouping**: Store a `fiscal_label` (e.g., `2024-Q2`) alongside `period_end_date` to simplify chart x-axis and grouping.
- **Ingestion completeness**: Before ingest, run a per-symbol/year completeness check so missing quarters are logged; keep ingest idempotent with the expanded composite key.
- **Parameter validation**: In `getAaplFinancialsByMetric`/`getFinancialMetric`, reject mismatched combos (e.g., `period_type='annual'` with `quarters=[1]`); require `quarters` only when `period_type='quarterly'`.
- **TTM handling**: For ratios/percentages, recompute from underlying numerators/denominators instead of summing ratios; add unit tests comparing against FMP TTM values.
- **Chart UX**: Add period toggle (Annual/Quarterly/TTM presets), x-axis formatting like `Q1 '24`, hide data labels when >20 points, and default quarterly views to the most recent ~12 quarters to keep charts readable.
- **Performance**: Enable data grouping or lighten markers for dense quarterly series; throttle resize/reflow and limit default fetch ranges.
- **LLM/prompt updates**: Include clear examples contrasting annual vs quarterly vs TTM; add validation that rejects an annual-only result when the user asked for quarterly (and vice versa).
