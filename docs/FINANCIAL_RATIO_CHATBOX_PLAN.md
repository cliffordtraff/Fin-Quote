# Financial Ratio Chatbox Expansion Plan

## Goal
Extend the chat experience so users can request any common financial ratio for a given stock and receive a clear, sourced answer. This requires indexing/deriving the ratios below, exposing them through the tooling layer, and updating prompts plus validation to keep responses accurate.

## Ratio Coverage Target
We want the chatbox to recognize and return every ratio in this checklist. Each ratio should include a plain-language definition, current value (with units where applicable), time context (TTM, latest quarter, FY, multi-year average), and supporting data links.

### Profitability
- Gross Margin
- Operating Margin
- Net Profit Margin
- EBITDA Margin
- Return on Equity (ROE)
- Return on Assets (ROA)
- Return on Invested Capital (ROIC)
- Return on Capital Employed (ROCE)
- Return on Total Capital

### Liquidity
- Current Ratio
- Quick Ratio (Acid-Test)
- Cash Ratio
- Working Capital Ratio
- Defensive Interval Ratio

### Leverage & Solvency
- Debt-to-Equity
- Debt-to-Assets
- Net Debt-to-EBITDA
- Interest Coverage Ratio
- Fixed-Charge Coverage Ratio
- Debt Service Coverage Ratio
- Equity Multiplier

### Efficiency & Turnover
- Asset Turnover
- Inventory Turnover
- Days Sales of Inventory (DSI)
- Receivables Turnover
- Days Sales Outstanding (DSO)
- Payables Turnover
- Days Payable Outstanding (DPO)
- Cash Conversion Cycle
- Operating Cycle

### Valuation
- Price-to-Earnings (Trailing / Forward)
- PEG Ratio
- Enterprise Value to EBITDA (EV/EBITDA)
- Enterprise Value to EBIT (EV/EBIT)
- Enterprise Value to Sales (EV/Sales)
- Enterprise Value to Free Cash Flow (EV/FCF)
- Price-to-Sales
- Price-to-Book
- Price-to-Tangible-Book
- Price-to-Cash-Flow

### Dividend & Payout
- Dividend Yield
- Dividend Payout Ratio
- Dividend Coverage Ratio
- Dividend Growth Rate (CAGR)
- Share Buyback Yield
- Total Shareholder Yield

### Growth Metrics
- Revenue Compound Annual Growth Rate (CAGR)
- EPS Growth (YoY / CAGR)
- EBITDA Growth
- Free Cash Flow Growth
- Book Value per Share Growth

### Cash Flow & Coverage
- Free Cash Flow Margin
- Free Cash Flow Conversion (FCF / Net Income)
- Operating Cash Flow Ratio (CFO / Current Liabilities)
- Cash Flow to Debt Ratio
- Cash Return on Invested Capital (CROIC)
- Operating Cash Flow per Share

### Per-Share & Quality Metrics
- Earnings Per Share (Basic & Diluted)
- Book Value per Share
- Tangible Book Value per Share
- Economic Value Added (EVA)
- Cash Earnings Ratio (Operating Cash Flow / Net Income)
- Quality of Earnings Ratio

### Market / Performance Hybrids
- Beta
- Sharpe Ratio
- Treynor Ratio
- Jensen’s Alpha
- Information Ratio

## Next Steps
1. **Data Audit:** Confirm each ratio is available or derivable from existing Supabase tables or upstream providers; note any gaps.
2. **Computation Layer:** Build reusable utilities that calculate every ratio with consistent period handling (quarterly vs TTM vs FY) and unit normalization.
3. **Composite Ratio Tools:** Implement purpose-built endpoints (e.g., `getValuationRatios`, `getLiquidityRatios`) that bundle all required numerators/denominators so the orchestrator can stay “one tool per turn.”
4. **Tooling Update:** Expose those composite endpoints via chat tools (e.g., `get_financial_ratio(symbol, ratio_name, period)`) and validate requested metrics against the supported catalog.
5. **Prompt Design:** Teach the assistant to detect user intent for these ratios and respond with standardized messaging (value, context, definition, source).
6. **Guardrails & Validation:** Expand validators to check returned ratios against authoritative data before sending to the user.
7. **UX Enhancements:** Add UI affordances (autocomplete, quick ratio chips, explanatory tooltips) to highlight supported ratios.
8. **Documentation:** Publish user-facing help and internal runbooks covering the ratio glossary, data lineage, and troubleshooting steps.

Delivering this list will make the chatbox a comprehensive financial ratio assistant for equity analysis workflows.
