# Ratio MVP Testing Guide

## Implementation Summary

Successfully implemented support for **9 financial ratios** using the existing "fetch data → LLM calculates" pattern with:
- ✅ Zero new tools or endpoints
- ✅ Zero architecture changes
- ✅ Zero cost increase
- ✅ Complete validation coverage
- ✅ Automatic chart generation

## Ratios Now Supported

### Profitability Ratios (5)
1. **Gross Margin** - (gross_profit / revenue) × 100 ✅ Already working
2. **Operating Margin** - (operating_income / revenue) × 100 ✅ NEW
3. **Net Profit Margin** - (net_income / revenue) × 100 ✅ NEW
4. **ROE** (Return on Equity) - (net_income / shareholders_equity) × 100 ✅ Already working
5. **ROA** (Return on Assets) - (net_income / total_assets) × 100 ✅ NEW

### Leverage Ratios (2)
6. **Debt-to-Equity** - total_liabilities / shareholders_equity ✅ Already working
7. **Debt-to-Assets** - total_liabilities / total_assets ✅ NEW

### Efficiency Ratios (2)
8. **Asset Turnover** - revenue / total_assets ✅ NEW
9. **Cash Flow Margin** - (operating_cash_flow / revenue) × 100 ✅ NEW

## Manual Testing Instructions

Since the app uses Server Actions (not REST APIs), testing must be done through the UI.

### 1. Start the Dev Server

```bash
npm run dev
```

Visit: http://localhost:3002/ask

### 2. Test Each Ratio

Copy and paste these queries one at a time:

#### Profitability Ratios
```
What's AAPL gross margin?
Show me AAPL operating margin
What is AAPL's net profit margin?
AAPL return on equity
What's AAPL's ROA?
```

#### Leverage Ratios
```
AAPL debt to equity ratio
Show me AAPL debt to assets
```

#### Efficiency Ratios
```
AAPL asset turnover
What's AAPL cash flow margin?
```

### 3. Verify Each Response

For each query, check:

✅ **Answer contains a percentage or ratio**
- Profitability/Margin questions should show percentages (e.g., "46.2%")
- Leverage/Turnover questions should show ratios (e.g., "1.2")

✅ **Answer shows the calculation**
- Example: "46.2% (gross profit of $180.7B divided by revenue of $391.0B)"

✅ **Chart generates correctly**
- Should appear below the answer
- Should show the ratio over multiple years
- Y-axis should be labeled appropriately (% or Ratio)

✅ **Validation passes**
- No errors in the console
- Validation status shows "passed" (check dev tools console)

### 4. Test Multi-Year Queries

Try asking for historical data:

```
Show me AAPL gross margin over the last 5 years
Compare AAPL operating margin from 2020 to 2024
AAPL return on equity trend
```

Verify:
- Chart shows multiple years
- All percentages are calculated correctly
- Answer mentions specific years with exact values

### 5. Test Edge Cases

```
AAPL gross margin in 2019
What was AAPL's debt to equity in 2015?
```

Verify:
- Older years (if data exists) are calculated correctly
- Missing years return appropriate "I don't have data for X" message

## Expected Behavior

### Gross Margin Example

**Query:** "What's AAPL gross margin?"

**Expected Answer:**
```
AAPL's gross margin in 2024 is 46.2% (gross profit of $180.7B divided by revenue of $391.0B).
```

**Expected Chart:**
- Title: "AAPL Gross Margin (2021-2024)"
- Type: Column chart
- Y-axis: "Gross Margin (%)"
- Data points: 4 years of percentages

### ROA Example

**Query:** "What's AAPL's ROA?"

**Expected Answer:**
```
AAPL's ROA in 2024 is X.X% (net income of $YYY.YB divided by total assets of $ZZZ.ZB).
```

**Expected Chart:**
- Title: "AAPL Return on Assets (ROA) (2021-2024)"
- Type: Column chart
- Y-axis: "ROA (%)"
- Data points: 4 years of ROA percentages

### Debt-to-Assets Example

**Query:** "Show me AAPL debt to assets"

**Expected Answer:**
```
AAPL's debt-to-assets ratio in 2024 is X.XX (total liabilities of $YYY.YB divided by total assets of $ZZZ.ZB).
```

**Expected Chart:**
- Title: "AAPL Debt-to-Assets Ratio (2021-2024)"
- Type: Column chart
- Y-axis: "Ratio"
- Data points: 4 years of debt-to-assets ratios

## Troubleshooting

### Issue: "I don't have that information"

**Possible Causes:**
1. Tool selection picked the wrong metric
2. Data doesn't exist for that year
3. Prompt not recognizing the ratio keyword

**Debug:**
- Check console logs for tool selection output
- Verify the question is clear and uses keywords from the prompt
- Try rephrasing with exact terms like "gross margin" instead of "profitability"

### Issue: Wrong calculation

**Possible Causes:**
1. LLM miscalculated
2. Wrong fields used in calculation
3. Validation should catch this

**Debug:**
- Check validation output in console
- If validation passed but answer is wrong, check validators.ts
- Verify the data returned includes all required fields

### Issue: Chart not appearing

**Possible Causes:**
1. Chart detection logic not recognizing ratio
2. Missing fields in data
3. Chart component error

**Debug:**
- Check browser console for errors
- Verify chart-helpers.ts has logic for this ratio
- Ensure financials.ts returns the needed fields

## Success Criteria

✅ All 9 queries return calculated values
✅ All calculations show working formulas
✅ All charts generate with proper labels
✅ Validation passes for all answers
✅ Multi-year queries work correctly
✅ No cost increase (same 2 LLM calls per query)

## Next Steps After Manual Testing

Once all ratios are verified working:

1. **Monitor usage** - Check query logs to see which ratios users request most
2. **Add more ratios** - Use the same pattern for additional ratios
3. **Improve prompts** - Refine based on any failures
4. **Extend to other tickers** - Once AAPL works, add MSFT, GOOGL, etc.

## Files Modified

All changes are on the `feature/ratio-mvp` branch:

```
lib/tools.ts               - Extended prompt with 9 ratio formulas
app/actions/financials.ts  - Added related field mappings
lib/chart-helpers.ts       - Added chart generation for new ratios
lib/validators.ts          - Extended validation for new ratios
```

## Performance Metrics to Track

After deploying:

- Average cost per query (should stay at ~$0.0003)
- Validation pass rate for ratio questions (target: >95%)
- User feedback on ratio answers
- Most requested ratios (to prioritize Phase 2)
