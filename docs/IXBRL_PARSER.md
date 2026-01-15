# iXBRL Segment Data Parser

## Overview

This document describes the iXBRL parser system for extracting segment revenue data (by product line and geographic region) directly from SEC filings.

> **See also**: [METRIC_TAXONOMY.md](./METRIC_TAXONOMY.md) for the accounting-based classification system (ASC 280, ASC 606, Operating KPIs).

## What is iXBRL?

SEC filings (10-K, 10-Q) are not plain HTML documents. They are **Inline XBRL (iXBRL)** documents—HTML with embedded machine-readable structured data.

Each filing contains:
1. **Human-readable HTML** - the formatted document displayed in browsers
2. **XBRL tags** - structured data embedded within special XML elements

## Key Concepts

### Contexts

Contexts define "who, when, and what slice" for a financial fact:

```xml
<xbrli:context id="c-46">
  <xbrli:entity>...</xbrli:entity>
  <xbrli:period>
    <xbrli:startDate>2023-10-01</xbrli:startDate>
    <xbrli:endDate>2024-09-28</xbrli:endDate>
  </xbrli:period>
  <xbrli:segment>
    <xbrldi:explicitMember dimension="srt:ProductOrServiceAxis">
      aapl:IPhoneMember
    </xbrldi:explicitMember>
  </xbrli:segment>
</xbrli:context>
```

### Dimensional Qualifiers

Dimensional qualifiers specify which "slice" of data a fact represents:

| Component | Purpose | Example |
|-----------|---------|---------|
| **Axis** | The category of breakdown | `srt:ProductOrServiceAxis` |
| **Member** | The specific value | `aapl:IPhoneMember` |

Without a dimensional qualifier, a revenue fact represents total company revenue. With a qualifier, it represents segment-specific revenue.

### Numeric Facts

Numeric values are tagged with `<ix:nonFraction>`:

```xml
<ix:nonFraction
  contextRef="c-46"
  name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax"
  scale="6"
  decimals="-6">201,183</ix:nonFraction>
```

- `contextRef` links to a context definition
- `name` is the XBRL taxonomy element
- `scale="6"` means multiply by 10^6 (millions)
- Value: 201,183 × 10^6 = $201.183 billion

## Apple Segment Data

### Product Segments

| XBRL Member | Display Name |
|-------------|--------------|
| `aapl:IPhoneMember` | iPhone |
| `aapl:MacMember` | Mac |
| `aapl:IPadMember` | iPad |
| `us-gaap:ServiceMember` | Services |
| `aapl:WearablesHomeandAccessoriesMember` | Wearables, Home and Accessories |

Axis: `srt:ProductOrServiceAxis`

### Geographic Segments

| XBRL Member | Display Name |
|-------------|--------------|
| `aapl:AmericasSegmentMember` | Americas |
| `aapl:EuropeSegmentMember` | Europe |
| `aapl:GreaterChinaSegmentMember` | Greater China |
| `aapl:JapanSegmentMember` | Japan |
| `aapl:RestOfAsiaPacificSegmentMember` | Rest of Asia Pacific |

Axis: `us-gaap:StatementBusinessSegmentsAxis`

## Other SEC Metrics to Parse (non-segment)

While this parser focuses on segment revenue, we should also pull these filing-sourced metrics:

- **Shares outstanding**: `dei:EntityCommonStockSharesOutstanding` (as-of period end); also weighted-average shares `us-gaap:WeightedAverageNumberOfSharesOutstandingBasic` and `...Diluted`.
- **Share repurchases**: cash outlay `us-gaap:PaymentsForRepurchaseOfCommonStock` or `us-gaap:TreasuryStockAcquiredCost`; shares retired `us-gaap:TreasuryStockSharesAcquired`.
- **R&D expense**: `us-gaap:ResearchAndDevelopmentExpense` (periodic operating line).

Store in `company_metrics` with `metric_category` suited to the metric (e.g., capital allocation for buybacks, share metrics, operating expense), `dimension_type: null`, and `unit: currency` or `count` as appropriate.

## Usage

### Parse Segment Data (Dry Run)

```bash
npx tsx scripts/parse-ixbrl-segments.ts --ticker AAPL
```

Output shows parsed segment revenue by fiscal year:

```
FY 2024:
  Product Segments:
    iPhone                              $201.18B
    Services                            $96.17B
    Wearables, Home and Accessories     $37.01B
    Mac                                 $29.98B
    iPad                                $26.69B
  Geographic Segments:
    Americas                            $167.04B
    Europe                              $101.33B
    Greater China                       $66.95B
    Rest of Asia Pacific                $30.66B
    Japan                               $25.05B
```

### Parse Specific Filing

```bash
npx tsx scripts/parse-ixbrl-segments.ts --ticker AAPL --filing aapl-10-k-2024.html
```

### Validate Against Existing Data

```bash
npx tsx scripts/validate-ixbrl-segments.ts --ticker AAPL
```

Compares parsed values against existing `company_metrics` table data.

### Ingest to Database

```bash
npx tsx scripts/parse-ixbrl-segments.ts --ticker AAPL --ingest
```

Upserts parsed data into `company_metrics` table with:
- `data_source: 'SEC-XBRL'`
- `metric_category: 'segment_reporting'` (ASC 280 classification)

## Files

| File | Purpose |
|------|---------|
| `scripts/parse-ixbrl-segments.ts` | Main parser script |
| `scripts/validate-ixbrl-segments.ts` | Validation against existing data |
| `lib/ixbrl-mappings/aapl.ts` | Apple-specific XBRL mappings |
| `lib/ixbrl-mappings/index.ts` | Company mappings registry |

## Adding New Companies

To add support for a new company:

1. **Download their filings** to Supabase Storage

2. **Explore their XBRL structure** using the exploration scripts:
   ```bash
   node scripts/explore-ixbrl.mjs
   ```

3. **Create a mapping file** at `lib/ixbrl-mappings/{ticker}.ts`:
   ```typescript
   export const MSFT_MAPPINGS: CompanyMappings = {
     ticker: 'MSFT',
     name: 'Microsoft Corporation',
     axes: {
       product: 'us-gaap:StatementBusinessSegmentsAxis',  // varies by company
       geographic: 'srt:StatementGeographicalAxis',
     },
     revenueFact: 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
     fiscalYearEndMonth: 6,  // Microsoft's FY ends in June
     members: {
       // Map XBRL members to display names
     }
   }
   ```

4. **Export from index** in `lib/ixbrl-mappings/index.ts`

5. **Test the parser** with the new ticker

## Data Flow

```
SEC Filing HTML (Supabase Storage)
         │
         ▼
┌─────────────────────────────────┐
│   parse-ixbrl-segments.ts       │
│                                 │
│  1. Download HTML from storage  │
│  2. Parse <ix:header> contexts  │
│  3. Parse <ix:nonFraction> facts│
│  4. Join facts + contexts       │
│  5. Map XBRL members → names    │
│  6. Calculate fiscal years      │
└─────────────────────────────────┘
         │
         ▼
   SegmentRevenue[]
         │
         ├──────────────────────┐
         │                      │
         ▼                      ▼
   Display (dry run)      Ingest (--ingest)
                                │
                                ▼
                       company_metrics table
```

## Metric Classification

All segment data extracted by this parser is classified as **`segment_reporting`** (ASC 280):

| Field | Value | Notes |
|-------|-------|-------|
| `metric_name` | `segment_revenue` | Revenue by segment |
| `metric_category` | `segment_reporting` | ASC 280 - Segment Reporting |
| `dimension_type` | `product` or `geographic` | Type of breakdown |
| `unit` | `currency` | All values in USD |

For other metric types (revenue disaggregation, operating KPIs), see [METRIC_TAXONOMY.md](./METRIC_TAXONOMY.md).

## Limitations

- Each 10-K filing typically contains 3 years of segment data
- Need multiple filings for longer historical coverage
- Company XBRL taxonomies vary; each company needs its own mapping file
- Quarterly data (10-Q) not yet implemented
- Only extracts ASC 280 segment revenue; ASC 606 disaggregation and operating KPIs require different parsing approaches
