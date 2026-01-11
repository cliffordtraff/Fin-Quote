# Answer Generation and Validation Flow

## Overview (Plain English)

When you ask a question, the chatbot goes through these steps:
1. **Pick a tool** - Decides which data source to use
2. **Fetch data** - Gets the actual numbers from the database
3. **Generate answer** - AI writes the answer using ONLY the fetched data
4. **Validate answer** - Checks if the answer matches the data (catches mistakes)
5. **Fix if needed** - If validation fails, regenerates the answer with corrections

---

## Step-by-Step Process

### Step 1: Tool Selection Prompt

**What happens**: The AI decides which tool to use based on your question.

**The Prompt** (`lib/tools.ts`):
```
You are a router. Choose exactly one tool and return ONLY valid JSON: {"tool": string, "args": object}

Available Tools:
1. getAaplFinancialsByMetric - For revenue, profit, assets, etc.
2. getPrices - For stock price history
3. getRecentFilings - For filing dates/metadata
4. searchFilings - For searching filing content
5. listMetrics - For browsing available metrics
6. getFinancialMetric - For advanced metrics (P/E, ROE, etc.)

User question: "[your question]"
```

**Output**: JSON like `{"tool": "getAaplFinancialsByMetric", "args": {"metric": "revenue", "limit": 4}}`

**Why this works**: Separates "what tool to use" from "how to answer" - makes routing more accurate.

---

### Step 2: Tool Execution

**What happens**: The selected tool queries Supabase database.

**Example**:
- Tool: `getAaplFinancialsByMetric`
- Args: `{metric: "revenue", limit: 4}`
- Database query: `SELECT * FROM financials_std WHERE metric='revenue' LIMIT 4`
- Returns: `[{year: 2024, value: 383.3B}, {year: 2023, value: 383.3B}, ...]`

**Data is rounded** to 2 decimal places before sending to LLM (prevents seeing values like `1.5191298333175105`).

---

### Step 3: Answer Generation Prompt

**What happens**: The AI writes the answer using ONLY the fetched data.

**The Prompt Structure** (`lib/tools.ts` - `buildFinalAnswerPrompt`):

```
You are an analyst. Answer the user using ONLY the provided facts.

User question: "[your question]"

Facts (JSON rows):
[The actual data from Step 2, formatted as JSON]

CRITICAL VALIDATION RULES - Follow These Exactly:

1. NUMBERS - Use EXACT numbers from the data:
   - Copy numbers precisely from the facts JSON
   - Format: 383285000000 → "$383.3B"
   - Round to 2 decimal places maximum
   - NEVER round significantly or estimate

2. YEARS - ONLY mention years that appear in the facts:
   - Before mentioning any year, verify it exists in the facts JSON
   - If asked about a year NOT in the facts, say: "I don't have data for [year]."
   - DO NOT extrapolate, estimate, or guess

3. DATES - Use EXACT dates from the data:
   - For filings, use the exact filing_date from the facts
   - NEVER invent or approximate dates

4. CITATIONS - Use EXACT filing information:
   - If mentioning a filing, verify its filing_type and filing_date are in the facts
   - NEVER reference filings not present in the facts

5. CALCULATIONS - You MUST calculate ratios/percentages from the data:
   - Gross Margin = (gross_profit / revenue) × 100
   - Debt-to-Equity = total_liabilities / shareholders_equity
   - Show calculations with formatted numbers

6. FORMATTING RULES:
   - Respond in plain text (no Markdown, bullets, tables)
   - For 4+ data points: Write 2 sentences max
   - First sentence: earliest/latest values + notable highs/lows
   - Second sentence: overall trend + "check the data table below"
```

**Key Features**:
- **Strict instructions** - Tells AI exactly how to format numbers, years, dates
- **Examples** - Shows correct vs incorrect formats
- **Conversation history** - Includes last 4-10 messages for context
- **Previous tool results** - If user asks follow-up, includes previous data

**Output**: Plain text answer like "Revenue increased from $274.5B in 2020 to $383.3B in 2024."

---

### Step 4: Validation Process

**What happens**: After the answer is generated, it's checked against the source data to catch errors.

**Three Validators** (`lib/validators.ts`):

#### A. Number Validation

**How it works**:
1. Extracts all numbers from the answer (e.g., "$383.3B" → 383.3)
2. Extracts all numbers from the data (e.g., `[{value: 383285000000}, ...]`)
3. Compares each mentioned number to data numbers
4. Allows 0.5% tolerance for rounding differences

**Example**:
- Answer says: "$383.3B"
- Data has: `383285000000` (which is $383.285B)
- Validation: ✅ PASS (383.3 vs 383.285 is within 0.5% tolerance)

**If it fails**:
- Status: `fail`
- Severity: `low` (if <25% wrong), `medium` (25-50% wrong), `high` (>50% wrong)
- Details: "2 of 5 values could not be validated"

#### B. Year Validation

**How it works**:
1. Extracts all years mentioned in answer (e.g., "2020", "2024")
2. Checks if each year exists in the data
3. Also checks database to see if year exists but wasn't fetched (critical error)

**Example**:
- Answer says: "Revenue in 2020 was $274.5B"
- Data has: `[{year: 2024}, {year: 2023}, {year: 2022}, {year: 2021}]`
- Validation: ❌ FAIL (2020 not in data)

**If it fails**:
- Status: `fail`
- Severity: `critical` (if year exists in DB but wasn't fetched), `high` (otherwise)
- Details: "Year 2020 mentioned but not in data. Available years: 2024, 2023, 2022, 2021"

#### C. Filing Validation

**How it works**:
1. Extracts filing references from answer (e.g., "10-K filed November 1, 2024")
2. Checks if filing type and date match data
3. Verifies filing exists in the fetched data

**Example**:
- Answer says: "According to the 10-K filed November 1, 2024..."
- Data has: `[{filing_type: "10-K", filing_date: "2024-11-01"}, ...]`
- Validation: ✅ PASS

**If it fails**:
- Status: `fail`
- Severity: `high`
- Details: "Filing 10-K (2024-11-15) referenced but not in data"

#### Overall Validation Result

Combines all three validators:
- **Overall passed**: All validators passed
- **Overall severity**: Highest severity from any validator (`none`, `low`, `medium`, `high`, `critical`)
- **Latency**: How long validation took (usually <100ms)

---

### Step 5: Regeneration (If Validation Fails)

**What happens**: If validation fails with medium/high/critical severity, the answer is automatically regenerated with error-specific corrections.

**Decision Logic** (`lib/regeneration.ts` - `shouldRegenerateAnswer`):
- ✅ Regenerate if: `critical` or `high` severity
- ✅ Regenerate if: `medium` severity AND specific validator failed
- ❌ Don't regenerate if: `low` severity (acceptable quality)

**Regeneration Prompt** (`lib/regeneration.ts` - `buildRegenerationPrompt`):

```
⚠️ REGENERATION REQUIRED - Your previous answer had validation errors.

Original question: "[question]"
Your previous answer: "[original answer]"

⚠️ VALIDATION ERRORS FOUND:

[Error-specific correction hints]

CORRECTION INSTRUCTIONS:
1. Fix the specific errors listed above
2. Use ONLY the facts provided
3. Follow all formatting rules exactly

Facts (JSON rows):
[Same data as before]

User question: "[question]"
```

**Error-Specific Hints**:

**For Number Errors**:
```
⚠️ NUMBER VALIDATION ERROR:

Numbers mentioned but not in data:
  - $400B (closest match: $383.3B, difference: 4.4%)
  - $50B (not found)

Numbers ACTUALLY in the data:
  - $383.3B (2024)
  - $383.3B (2023)
  ...

CRITICAL RULES:
  1. ONLY use numbers from the list above
  2. Format: $383.3B (not $383B or $400B)
  3. Round to 2 decimal places maximum
```

**For Year Errors**:
```
⚠️ YEAR VALIDATION ERROR:

CRITICAL ISSUE: You said you don't have data for 2020, but it EXISTS in the database.
The tool may have used the wrong limit parameter. The data has been refetched.

Years ACTUALLY available in the data:
  2024, 2023, 2022, 2021, 2020, 2019, ...

CRITICAL RULES:
  1. ONLY mention years that appear in the data above
  2. If user asks for a specific year, check if it's in the list
  3. If year is missing, say "I don't have data for [year]"
```

**For Filing Errors**:
```
⚠️ FILING VALIDATION ERROR:

Your answer referenced these filings that don't exist in the data:
  - 10-K (2024-11-15)

ONLY use these ACTUAL filings:
  - 10-K filed November 1, 2024
  - 10-Q filed August 1, 2024
  ...

CRITICAL RULES:
  1. ONLY reference filings listed above
  2. Use EXACT dates from the list
  3. Do NOT mention filings not in the list
```

**Regeneration Process**:
1. Build regeneration prompt with error hints
2. Call LLM again with correction instructions
3. Validate the regenerated answer
4. If regenerated answer passes → use it
5. If regenerated answer still fails → use original (but log the failure)

---

## Complete Flow Diagram

```
User Question
    ↓
[Step 1] Tool Selection Prompt
    → LLM picks tool + args
    ↓
[Step 2] Tool Execution
    → Query Supabase
    → Get data (rounded to 2 decimals)
    ↓
[Step 3] Answer Generation Prompt
    → Includes: question + data + conversation history + strict rules
    → LLM generates answer
    ↓
[Step 4] Validation
    → Number validator: Check numbers match data (±0.5%)
    → Year validator: Check years exist in data
    → Filing validator: Check citations are real
    ↓
    ┌─────────────────┐
    │ Validation Pass? │
    └─────────────────┘
         │        │
      YES│        │NO
         │        │
         ↓        ↓
    [Return]  [Step 5] Regeneration?
         │        │
         │        ├─→ Critical/High severity? → YES → Regenerate with error hints
         │        │
         │        └─→ Low severity? → NO → Return original
         │
    Final Answer
```

---

## Key Design Principles

### 1. **Strict Prompting**
- Very detailed instructions (700+ lines of rules)
- Explicit examples of correct vs incorrect
- Multiple validation rules (numbers, years, dates, citations)

### 2. **Validation Before Delivery**
- Catches hallucinations before showing to users
- Three independent validators (numbers, years, filings)
- Severity levels help decide if regeneration is needed

### 3. **Auto-Correction**
- Regenerates answers automatically when validation fails
- Error-specific hints tell LLM exactly what to fix
- Validates regenerated answer before using it

### 4. **Data Rounding**
- Numbers rounded to 2 decimals before sending to LLM
- Prevents LLM from seeing `1.5191298333175105` → sees `1.52`
- Makes validation easier (exact matches)

### 5. **Conversation Context**
- Includes last 4-10 messages in prompts
- Enables follow-up questions
- Previous tool results included for context

---

## Example: Full Flow

**User Question**: "What's Apple's revenue trend?"

**Step 1 - Tool Selection**:
```
Prompt: "User question: 'What's Apple's revenue trend?'"
LLM Output: {"tool": "getAaplFinancialsByMetric", "args": {"metric": "revenue", "limit": 4}}
```

**Step 2 - Tool Execution**:
```
Query: SELECT * FROM financials_std WHERE metric='revenue' LIMIT 4
Result: [
  {year: 2024, value: 383285000000},
  {year: 2023, value: 383285000000},
  {year: 2022, value: 394328000000},
  {year: 2021, value: 365817000000}
]
Rounded for LLM: [
  {year: 2024, value: 383.29},
  {year: 2023, value: 383.29},
  {year: 2022, value: 394.33},
  {year: 2021, value: 365.82}
]
```

**Step 3 - Answer Generation**:
```
Prompt: "Answer using ONLY these facts:
[
  {year: 2024, value: 383.29},
  {year: 2023, value: 383.29},
  {year: 2022, value: 394.33},
  {year: 2021, value: 365.82}
]

CRITICAL RULES: Use EXACT numbers, format as $383.3B, etc."
LLM Output: "Revenue increased from $365.8B in 2021 to $383.3B in 2024."
```

**Step 4 - Validation**:
```
Number Validation:
  - "$365.8B" → 365.8 → Matches data 365.82 ✅
  - "$383.3B" → 383.3 → Matches data 383.29 ✅
  Status: PASS

Year Validation:
  - "2021" → Exists in data ✅
  - "2024" → Exists in data ✅
  Status: PASS

Filing Validation:
  - No filings mentioned → SKIP
  Status: SKIP

Overall: PASS ✅
```

**Step 5 - Regeneration**:
```
Not needed (validation passed)
```

**Final Answer**: "Revenue increased from $365.8B in 2021 to $383.3B in 2024."

---

## Why This Works

1. **Separation of Concerns**: Tool selection vs answer generation = better accuracy
2. **Strict Rules**: Detailed prompts prevent common LLM mistakes
3. **Validation**: Catches errors before users see them
4. **Auto-Fix**: Regeneration fixes errors automatically
5. **Data Rounding**: Makes validation easier and more reliable

This creates a **self-correcting system** that catches and fixes its own mistakes before showing answers to users.




