# Excel Dark Theme Template Solution

## Problem Statement

We needed to export financial data from Supabase to Excel files with a **dark theme** (black background, white text) that matches the user's custom Excel template (`templates/TemplateBase.xlsx`).

**Initial attempts failed** - exported files always showed white backgrounds with black text, despite loading the dark-themed template.

---

## Root Cause

The issue was discovered through debugging the template file. The dark theme uses **Excel theme colors** (not explicit RGB colors like `#000000`):

```json
{
  "fill": {
    "type": "pattern",
    "pattern": "solid",
    "fgColor": {"theme": 1, "tint": 0.0499893185216834}
  },
  "font": {
    "color": {"theme": 0, "tint": -0.1499984740745262}
  }
}
```

**The problem**: Common ExcelJS operations **destroy** theme colors:

❌ **These operations create NEW cells with default formatting:**
- `sheet.spliceRows()` - Deletes and recreates rows
- `sheet.columns = [...]` - Creates new column definitions
- `sheet.addRow({...})` - Creates new cells with white background

When you create new cells, ExcelJS gives them **default Excel formatting** (white background, black text), completely ignoring the template's theme colors.

---

## The Solution: Direct Cell Writing

✅ **Write data directly to existing template cells** - this preserves their theme formatting.

### Before (Broken Approach)

```typescript
// ❌ This destroys template formatting
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile('templates/TemplateBase.xlsx')

const sheet = workbook.getWorksheet('Sheet1')!
sheet.spliceRows(1, 10000)  // Deletes rows = loses formatting

sheet.columns = [            // Creates new columns = loses formatting
  { header: 'Year', key: 'year' },
  { header: 'Revenue', key: 'revenue' }
]

data.forEach(row => {
  sheet.addRow(row)          // Creates new cells = loses formatting
})
```

**Result**: White background, black text ❌

### After (Working Approach)

```typescript
// ✅ This preserves template formatting
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile('templates/TemplateBase.xlsx')

const sheet = workbook.getWorksheet('Sheet1')!
// Rename it instead of creating new sheet
sheet.name = 'AAPL Financials'

// Write headers directly to existing cells
sheet.getCell(1, 1).value = 'Year'
sheet.getCell(1, 2).value = 'Revenue'
sheet.getCell(1, 3).value = 'Gross Profit'

// Write data directly to existing cells
data.forEach((row, index) => {
  const rowNum = index + 2  // Start from row 2
  sheet.getCell(rowNum, 1).value = row.year
  sheet.getCell(rowNum, 2).value = row.revenue
  sheet.getCell(rowNum, 3).value = row.gross_profit

  // Apply number formats (doesn't affect theme colors)
  sheet.getCell(rowNum, 2).numFmt = '$#,##0,,"M"'
  sheet.getCell(rowNum, 3).numFmt = '$#,##0,,"M"'
})
```

**Result**: Dark theme preserved ✅

---

## Key Principles

### ✅ DO:
1. **Load the template file** with `workbook.xlsx.readFile()`
2. **Get existing worksheet** with `workbook.getWorksheet('Sheet1')`
3. **Rename the sheet** if needed: `sheet.name = 'New Name'`
4. **Write directly to cells** using `sheet.getCell(row, col).value = data`
5. **Set number formats** using `sheet.getCell(row, col).numFmt = '...'`
6. **Set column widths** using `sheet.getColumn(n).width = number`
7. **Set frozen panes** using `sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]`

### ❌ DON'T:
1. **DON'T use `spliceRows()`** - destroys cells and their formatting
2. **DON'T set `sheet.columns`** - creates new columns with default formatting
3. **DON'T use `addRow()`** - creates new cells with default formatting
4. **DON'T clear/delete rows** - you lose the theme formatting

---

## What About Additional Sheets?

**Problem**: `TemplateBase.xlsx` only has 1 sheet, but we need multiple sheets (Financials, Metrics, Summary).

**Two Options**:

### Option 1: Accept White Background for Extra Sheets ⚡ Fast
```typescript
// Sheet 1: Use template (perfect dark theme)
const sheet1 = workbook.getWorksheet('Sheet1')!
sheet1.name = 'AAPL Financials'
// Write data directly to cells...

// Sheet 2: Create new sheet (white background)
const sheet2 = workbook.addWorksheet('Calculated Metrics')
// Write data directly to cells...
```

**Result**:
- Sheet 1: Dark theme ✅
- Sheet 2+: White background (Excel defaults)

**Pros**: Fast export (~2 seconds)
**Cons**: Inconsistent theming across sheets

### Option 2: Create Multi-Sheet Template 🐌 Slow but Perfect
Create `TemplateBase.xlsx` with pre-formatted sheets:
- Sheet1: "AAPL Financials" (dark theme, 10,000 rows formatted)
- Sheet2: "Calculated Metrics" (dark theme, 10,000 rows formatted)
- Sheet3: "Summary" (dark theme, 10,000 rows formatted)

Then use direct cell writes for all sheets.

**Pros**: All sheets have dark theme ✅
**Cons**:
- Slower export (~30 seconds for 3 sheets)
- Requires pre-creating template sheets

---

## Testing the Solution

Create a test script to verify template preservation:

```typescript
// scripts/test-template-write.ts
import ExcelJS from 'exceljs'
import * as path from 'path'

async function testTemplateWrite() {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile('templates/TemplateBase.xlsx')

  const sheet = workbook.getWorksheet('Sheet1')!

  // Write headers
  sheet.getCell(1, 1).value = 'Year'
  sheet.getCell(1, 2).value = 'Revenue'

  // Write data
  sheet.getCell(2, 1).value = 2023
  sheet.getCell(2, 2).value = 383000000

  await workbook.xlsx.writeFile('exports/test.xlsx')
  console.log('✅ Open exports/test.xlsx to verify dark theme!')
}

testTemplateWrite()
```

Run: `npx tsx scripts/test-template-write.ts`

Open the file - if it has dark theme, the solution works!

---

## Implementation in Production

### Current Implementation: `scripts/export-to-excel.ts`

**Sheet 1** (AAPL Financials):
- ✅ Uses TemplateBase.xlsx Sheet1
- ✅ Renames to "AAPL Financials"
- ✅ Writes data directly to cells
- ✅ **Result**: Perfect dark theme

**Sheet 2** (Calculated Metrics):
- Creates new sheet with `addWorksheet()`
- Writes data directly to cells
- **Result**: White background (Excel default)

**Sheet 3** (Summary):
- Creates new sheet with `addWorksheet()`
- Writes data directly to cells
- **Result**: White background (Excel default)

### To Make All Sheets Dark:

1. Open Excel
2. Create a new workbook with 3 sheets:
   - Sheet1: "AAPL Financials"
   - Sheet2: "Calculated Metrics"
   - Sheet3: "Summary"
3. Apply dark theme formatting to ALL cells (select all, format)
4. Save as `templates/TemplateBase.xlsx`
5. Update scripts to use `getWorksheet()` for all 3 sheets instead of `addWorksheet()`

---

## Code Comparison

### Writing Headers

```typescript
// ❌ BEFORE (Creates new cells, loses formatting)
sheet.columns = [
  { header: 'Year', key: 'year', width: 10 },
  { header: 'Revenue', key: 'revenue', width: 18 }
]

// ✅ AFTER (Writes to existing cells, preserves formatting)
sheet.getCell(1, 1).value = 'Year'
sheet.getCell(1, 2).value = 'Revenue'
sheet.getColumn(1).width = 10
sheet.getColumn(2).width = 18
```

### Writing Data Rows

```typescript
// ❌ BEFORE (Creates new rows, loses formatting)
data.forEach(row => {
  sheet.addRow({
    year: row.year,
    revenue: row.revenue
  })
})

// ✅ AFTER (Writes to existing cells, preserves formatting)
data.forEach((row, index) => {
  const rowNum = index + 2  // Row 1 = headers, data starts at row 2
  sheet.getCell(rowNum, 1).value = row.year
  sheet.getCell(rowNum, 2).value = row.revenue

  // Apply number format
  sheet.getCell(rowNum, 2).numFmt = '$#,##0,,"M"'
})
```

---

## Why Theme Colors Are Special

Excel has two types of colors:

### 1. Explicit Colors (RGB)
```json
{
  "fgColor": {"argb": "FF000000"}  // Explicit black
}
```
ExcelJS preserves these when copying cells.

### 2. Theme Colors (Dynamic)
```json
{
  "fgColor": {"theme": 1, "tint": 0.05}  // Theme color 1 with tint
}
```
These reference the workbook's color theme. When you apply a different Excel theme (e.g., "Dark"), all theme colors change automatically.

**The problem**: When ExcelJS creates new cells via `addRow()` or `columns`, it uses **default theme** (white background, black text), not the template's theme.

**The solution**: Don't create new cells. Write to existing template cells that already have the correct theme colors.

---

## Lessons Learned

1. **ExcelJS doesn't fully support Excel themes** - Creating new cells always uses default theme
2. **Template inheritance is limited** - Only existing cells keep their formatting
3. **Direct cell writing is slower but reliable** - Explicit cell access preserves formatting
4. **Test with simple cases first** - The test script (`test-template-write.ts`) proved the concept
5. **Trade-offs exist** - Fast exports vs. perfect theming across all sheets

---

## Files Modified

1. **`scripts/export-to-excel.ts`**
   - Sheet 1: Direct cell writes to template ✅
   - Sheets 2-3: New sheets (white background)

2. **`templates/TemplateBase.xlsx`**
   - Single sheet with dark theme formatting
   - Used as base for Sheet 1 only

3. **`scripts/test-template-write.ts`** (created)
   - Proof-of-concept test
   - Verified direct cell writing preserves theme

4. **`scripts/debug-template.ts`** (created)
   - Debugging tool to inspect cell formatting
   - Revealed theme colors vs. explicit colors

---

## Future Improvements

### Option A: Multi-Sheet Template
Create `TemplateBase.xlsx` with all sheets pre-formatted:
```typescript
const sheet1 = workbook.getWorksheet('AAPL Financials')!
const sheet2 = workbook.getWorksheet('Calculated Metrics')!
const sheet3 = workbook.getWorksheet('Summary')!
// Write directly to all sheets
```

### Option B: Explicit Dark Theme
Instead of theme colors, use explicit colors:
```typescript
cell.fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF000000' }  // Explicit black
}
cell.font = {
  color: { argb: 'FFFFFFFF' }    // Explicit white
}
```

Then apply to new sheets programmatically (slower but works).

### Option C: Post-Processing
Use a separate script to apply dark theme after data export:
```typescript
// 1. Export data (fast, white background)
// 2. Load exported file
// 3. Apply dark theme to all cells
// 4. Save
```

---

## Summary

✅ **What Worked**: Direct cell writes to existing template cells preserve dark theme formatting

❌ **What Didn't Work**: Using `.addRow()`, `.columns`, or `.spliceRows()` destroyed theme colors

🎯 **Current State**: Sheet 1 (AAPL Financials) has perfect dark theme. Sheets 2-3 have white backgrounds.

🚀 **Next Steps**: Either accept mixed theming or create multi-sheet template for consistent dark theme across all sheets.

---

**Date**: 2025-11-06
**Solution**: Direct cell writing preserves Excel theme colors
**Scripts**: `export-to-excel.ts`, `test-template-write.ts`, `debug-template.ts`
**Status**: ✅ WORKING for Sheet 1
