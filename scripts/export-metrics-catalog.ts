import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

// Load environment variables
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient<Database>(supabaseUrl, supabaseKey)

// Path to dark-themed Excel template
const TEMPLATE_PATH = path.join(
  process.cwd(),
  'templates/TemplateBase.xlsx'
)

// Helper to clone a worksheet with its formatting
function cloneSheet(workbook: ExcelJS.Workbook, sourceSheet: ExcelJS.Worksheet, newName: string): ExcelJS.Worksheet {
  const newSheet = workbook.addWorksheet(newName)

  // Copy sheet properties
  if (sourceSheet.properties) {
    newSheet.properties = { ...sourceSheet.properties }
  }

  // Copy default row height and column widths
  newSheet.properties.defaultRowHeight = sourceSheet.properties.defaultRowHeight
  newSheet.properties.defaultColWidth = sourceSheet.properties.defaultColWidth

  // Copy view settings (frozen panes, etc.)
  if (sourceSheet.views && sourceSheet.views.length > 0) {
    newSheet.views = sourceSheet.views.map(view => ({ ...view }))
  }

  // Get the template's cell formatting (from row 1, col 1 as reference)
  const templateCell = sourceSheet.getCell(1, 1)
  const cellStyle = {
    fill: templateCell.fill,
    font: templateCell.font,
    border: templateCell.border,
    alignment: templateCell.alignment,
  }

  // Apply the template formatting to a large range of cells
  for (let row = 1; row <= 10000; row++) {
    for (let col = 1; col <= 20; col++) {
      const cell = newSheet.getCell(row, col)
      if (cellStyle.fill) cell.fill = cellStyle.fill
      if (cellStyle.font) cell.font = cellStyle.font
      if (cellStyle.border) cell.border = cellStyle.border
      if (cellStyle.alignment) cell.alignment = cellStyle.alignment
    }

    // Progress indicator every 1000 rows
    if (row % 1000 === 0) {
      console.log(`    Formatting ${newName}: ${row}/10000 rows...`)
    }
  }

  return newSheet
}

// Metric definitions
interface MetricDefinition {
  name: string
  databaseField: string
  category: string
  description: string
  unit: string
  dataType: string
  isCalculated: boolean
  formula?: string
  availableYears?: string
}

const rawMetrics: MetricDefinition[] = [
  // Income Statement
  {
    name: 'Revenue',
    databaseField: 'revenue',
    category: 'Income Statement',
    description: 'Total revenue (sales) for the fiscal year',
    unit: 'USD',
    dataType: 'number',
    isCalculated: false,
  },
  {
    name: 'Gross Profit',
    databaseField: 'gross_profit',
    category: 'Income Statement',
    description: 'Revenue minus cost of goods sold (COGS)',
    unit: 'USD',
    dataType: 'number',
    isCalculated: false,
  },
  {
    name: 'Operating Income',
    databaseField: 'operating_income',
    category: 'Income Statement',
    description: 'Profit from core business operations (EBIT)',
    unit: 'USD',
    dataType: 'number',
    isCalculated: false,
  },
  {
    name: 'Net Income',
    databaseField: 'net_income',
    category: 'Income Statement',
    description: 'Bottom line profit after all expenses and taxes',
    unit: 'USD',
    dataType: 'number',
    isCalculated: false,
  },
  {
    name: 'EPS',
    databaseField: 'eps',
    category: 'Income Statement',
    description: 'Earnings per share (diluted)',
    unit: 'USD per share',
    dataType: 'number',
    isCalculated: false,
  },
  // Balance Sheet
  {
    name: 'Total Assets',
    databaseField: 'total_assets',
    category: 'Balance Sheet',
    description: 'Sum of all assets owned by the company',
    unit: 'USD',
    dataType: 'number',
    isCalculated: false,
  },
  {
    name: 'Total Liabilities',
    databaseField: 'total_liabilities',
    category: 'Balance Sheet',
    description: 'Sum of all debts and obligations',
    unit: 'USD',
    dataType: 'number',
    isCalculated: false,
  },
  {
    name: 'Shareholders Equity',
    databaseField: 'shareholders_equity',
    category: 'Balance Sheet',
    description: 'Net worth of the company (Assets - Liabilities)',
    unit: 'USD',
    dataType: 'number',
    isCalculated: false,
  },
  // Cash Flow Statement
  {
    name: 'Operating Cash Flow',
    databaseField: 'operating_cash_flow',
    category: 'Cash Flow Statement',
    description: 'Cash generated from core business operations',
    unit: 'USD',
    dataType: 'number',
    isCalculated: false,
  },
]

const calculatedMetrics: MetricDefinition[] = [
  // Profitability Ratios
  {
    name: 'Gross Margin',
    databaseField: 'gross_margin',
    category: 'Profitability Ratio',
    description: 'Percentage of revenue retained after COGS. Higher is better.',
    unit: 'Percentage (%)',
    dataType: 'number',
    isCalculated: true,
    formula: '(gross_profit / revenue) × 100',
  },
  {
    name: 'Operating Margin',
    databaseField: 'operating_margin',
    category: 'Profitability Ratio',
    description: 'Profit margin from operations before interest and taxes',
    unit: 'Percentage (%)',
    dataType: 'number',
    isCalculated: true,
    formula: '(operating_income / revenue) × 100',
  },
  {
    name: 'Net Margin',
    databaseField: 'net_margin',
    category: 'Profitability Ratio',
    description: 'Percentage of revenue that becomes profit',
    unit: 'Percentage (%)',
    dataType: 'number',
    isCalculated: true,
    formula: '(net_income / revenue) × 100',
  },
  {
    name: 'ROE (Return on Equity)',
    databaseField: 'roe',
    category: 'Profitability Ratio',
    description: 'Measures profitability relative to shareholders equity',
    unit: 'Percentage (%)',
    dataType: 'number',
    isCalculated: true,
    formula: '(net_income / shareholders_equity) × 100',
  },
  {
    name: 'ROA (Return on Assets)',
    databaseField: 'roa',
    category: 'Profitability Ratio',
    description: 'How efficiently assets generate profit',
    unit: 'Percentage (%)',
    dataType: 'number',
    isCalculated: true,
    formula: '(net_income / total_assets) × 100',
  },
  // Leverage Ratios
  {
    name: 'Debt-to-Equity Ratio',
    databaseField: 'debt_to_equity_ratio',
    category: 'Leverage Ratio',
    description: 'Measures financial leverage by comparing debt to equity',
    unit: 'Ratio',
    dataType: 'number',
    isCalculated: true,
    formula: 'total_liabilities / shareholders_equity',
  },
  {
    name: 'Debt-to-Assets Ratio',
    databaseField: 'debt_to_assets',
    category: 'Leverage Ratio',
    description: 'Percentage of assets financed by debt',
    unit: 'Ratio',
    dataType: 'number',
    isCalculated: true,
    formula: 'total_liabilities / total_assets',
  },
  // Efficiency Ratios
  {
    name: 'Asset Turnover',
    databaseField: 'asset_turnover',
    category: 'Efficiency Ratio',
    description: 'How efficiently assets generate revenue',
    unit: 'Ratio',
    dataType: 'number',
    isCalculated: true,
    formula: 'revenue / total_assets',
  },
]

async function exportMetricsCatalog() {
  console.log('📋 Starting Metrics Catalog export...\n')

  // Get data coverage info from Supabase
  console.log('📥 Fetching data coverage from Supabase...')
  const { data, error } = await supabase
    .from('financials_std')
    .select('year')
    .eq('symbol', 'AAPL')
    .order('year', { ascending: true })

  if (error) {
    console.error('❌ Error fetching data:', error.message)
    process.exit(1)
  }

  const years = data?.map((d) => d.year) || []
  const firstYear = years[0]
  const lastYear = years[years.length - 1]
  const totalYears = years.length
  const yearRange = `${firstYear} - ${lastYear}`

  console.log(`✅ Data coverage: ${yearRange} (${totalYears} years)\n`)

  // Update metrics with year availability
  const allMetrics = [...rawMetrics, ...calculatedMetrics].map((m) => ({
    ...m,
    availableYears: yearRange,
  }))

  // Load TemplateBase.xlsx
  console.log('📋 Loading TemplateBase.xlsx template...')
  const workbook = new ExcelJS.Workbook()

  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`❌ Template not found at: ${TEMPLATE_PATH}`)
    process.exit(1)
  }

  await workbook.xlsx.readFile(TEMPLATE_PATH)
  console.log(`✅ Template loaded: ${TEMPLATE_PATH}\n`)

  workbook.creator = 'Fin Quote'
  workbook.lastModifiedBy = 'Fin Quote'
  workbook.modified = new Date()

  // Get Sheet1 (the template sheet with dark formatting)
  const templateSheet = workbook.getWorksheet('Sheet1')!

  // Rename Sheet1 to "Metrics Overview"
  console.log('📝 Populating Metrics Overview sheet...')
  templateSheet.name = 'Metrics Overview'
  const overviewSheet = templateSheet

  // Write headers directly to row 1 (preserves template formatting)
  overviewSheet.getCell(1, 1).value = 'Metric Name'
  overviewSheet.getCell(1, 2).value = 'Category'
  overviewSheet.getCell(1, 3).value = 'Type'
  overviewSheet.getCell(1, 4).value = 'Description'
  overviewSheet.getCell(1, 5).value = 'Unit'
  overviewSheet.getCell(1, 6).value = 'Available Years'

  // Set column widths
  overviewSheet.getColumn(1).width = 28
  overviewSheet.getColumn(2).width = 20
  overviewSheet.getColumn(3).width = 12
  overviewSheet.getColumn(4).width = 60
  overviewSheet.getColumn(5).width = 16
  overviewSheet.getColumn(6).width = 16

  // Write metrics directly to cells (preserves template formatting)
  allMetrics.forEach((metric, index) => {
    const rowNum = index + 2 // Start from row 2 (row 1 is headers)
    overviewSheet.getCell(rowNum, 1).value = metric.name
    overviewSheet.getCell(rowNum, 2).value = metric.category
    overviewSheet.getCell(rowNum, 3).value = metric.isCalculated ? 'Calculated' : 'Raw'
    overviewSheet.getCell(rowNum, 4).value = metric.description
    overviewSheet.getCell(rowNum, 5).value = metric.unit
    overviewSheet.getCell(rowNum, 6).value = metric.availableYears

    // Wrap text for description column
    overviewSheet.getCell(rowNum, 4).alignment = { vertical: 'top', wrapText: true }
  })

  // Freeze header row
  overviewSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]

  // ==========================================
  // Save File
  // ==========================================
  const filename = `exports/aapl-metrics-catalog-${new Date().toISOString().split('T')[0]}.xlsx`

  // Add raw metrics
  rawMetrics.forEach((metric) => {
    rawSheet.addRow({
      name: metric.name,
      field: metric.databaseField,
      category: metric.category,
      description: metric.description,
      unit: metric.unit,
      dataType: metric.dataType,
    })
  })

  // Wrap text in data rows
  rawSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true }
      })
    }
  })

  // ==========================================
  // SHEET 3: Calculated Metrics
  // ==========================================
  console.log('\n📝 Creating Calculated Metrics sheet (cloning template formatting)...')
  const calcSheet = cloneSheet(workbook, templateSheet, 'Calculated Metrics')
  calcSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]

  calcSheet.columns = [
    { header: 'Metric Name', key: 'name', width: 28 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Description', key: 'description', width: 50 },
    { header: 'Formula', key: 'formula', width: 35 },
    { header: 'Unit', key: 'unit', width: 16 },
  ]

  // Template handles all header styling

  // Add calculated metrics
  calculatedMetrics.forEach((metric) => {
    calcSheet.addRow({
      name: metric.name,
      category: metric.category,
      description: metric.description,
      formula: metric.formula,
      unit: metric.unit,
    })
  })

  // Wrap text in data rows
  calcSheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true }
      })
    }
  })

  // ==========================================
  // SHEET 4: Metrics by Category
  // ==========================================
  console.log('\n📝 Creating By Category sheet (cloning template formatting)...')
  const categorySheet = cloneSheet(workbook, templateSheet, 'By Category')

  categorySheet.getColumn(1).width = 25
  categorySheet.getColumn(2).width = 55

  // Title - template handles font styling
  categorySheet.addRow(['AAPL Financial Metrics by Category'])
  categorySheet.addRow([])

  // Group by category
  const categories = [
    'Income Statement',
    'Balance Sheet',
    'Cash Flow Statement',
    'Profitability Ratio',
    'Leverage Ratio',
    'Efficiency Ratio',
  ]

  categories.forEach((category) => {
    const metricsInCategory = allMetrics.filter((m) => m.category === category)

    // Category header - template handles font and color styling
    categorySheet.addRow([category])

    // Metrics in category
    metricsInCategory.forEach((metric) => {
      const row = categorySheet.addRow([
        `  • ${metric.name}`,
        metric.description,
      ])
      if (metric.isCalculated) {
        row.getCell(2).value = `${metric.description} | Formula: ${metric.formula}`
      }
    })

    categorySheet.addRow([]) // Blank row
  })

  // ==========================================
  // SHEET 5: Summary
  // ==========================================
  console.log('\n📝 Creating Summary sheet (cloning template formatting)...')
  const summarySheet = cloneSheet(workbook, templateSheet, 'Summary')

  summarySheet.getColumn(1).width = 25
  summarySheet.getColumn(2).width = 40

  // Template handles all font styling
  summarySheet.addRow(['AAPL Financial Metrics Catalog'])
  summarySheet.addRow([])

  summarySheet.addRow(['Export Date:', new Date().toLocaleString()])
  summarySheet.addRow(['Company:', 'Apple Inc. (AAPL)'])
  summarySheet.addRow(['Data Source:', 'Fin Quote / Supabase'])
  summarySheet.addRow([])

  summarySheet.addRow(['Data Coverage'])
  summarySheet.addRow(['Years Available:', yearRange])
  summarySheet.addRow(['Total Years:', totalYears])
  summarySheet.addRow([])

  summarySheet.addRow(['Metrics Summary'])
  summarySheet.addRow(['Total Metrics:', allMetrics.length])
  summarySheet.addRow(['Raw Metrics:', rawMetrics.length])
  summarySheet.addRow(['Calculated Metrics:', calculatedMetrics.length])
  summarySheet.addRow([])

  summarySheet.addRow(['Metric Categories'])
  summarySheet.addRow(['Income Statement Metrics:', rawMetrics.filter((m) => m.category === 'Income Statement').length])
  summarySheet.addRow(['Balance Sheet Metrics:', rawMetrics.filter((m) => m.category === 'Balance Sheet').length])
  summarySheet.addRow(['Cash Flow Metrics:', rawMetrics.filter((m) => m.category === 'Cash Flow Statement').length])
  summarySheet.addRow(['Profitability Ratios:', calculatedMetrics.filter((m) => m.category === 'Profitability Ratio').length])
  summarySheet.addRow(['Leverage Ratios:', calculatedMetrics.filter((m) => m.category === 'Leverage Ratio').length])
  summarySheet.addRow(['Efficiency Ratios:', calculatedMetrics.filter((m) => m.category === 'Efficiency Ratio').length])
  summarySheet.addRow([])

  summarySheet.addRow(['Sheets Included'])
  summarySheet.addRow(['1. Metrics Overview', 'All metrics in one table'])
  summarySheet.addRow(['2. Raw Metrics', 'Primitives stored in database'])
  summarySheet.addRow(['3. Calculated Metrics', 'Derived ratios with formulas'])
  summarySheet.addRow(['4. By Category', 'Metrics grouped by financial statement'])
  summarySheet.addRow(['5. Summary', 'This sheet'])

  // ==========================================
  // Save File
  // ==========================================
  try {
    await workbook.xlsx.writeFile(filename)
    console.log(`✅ Metrics catalog created successfully!`)
    console.log(`📁 Location: ${filename}`)
    console.log(`\n📊 Sheets included:`)
    console.log(`   1. Metrics Overview - All ${allMetrics.length} metrics`)
    console.log(`   2. Raw Metrics - ${rawMetrics.length} primitives`)
    console.log(`   3. Calculated Metrics - ${calculatedMetrics.length} ratios`)
    console.log(`   4. By Category - Organized by financial statement`)
    console.log(`   5. Summary - Metadata and counts\n`)
  } catch (err) {
    console.error('❌ Error writing Excel file:', err)
    process.exit(1)
  }
}

// Run the export
exportMetricsCatalog()
  .then(() => {
    console.log('✅ Catalog export complete!')
    process.exit(0)
  })
  .catch((err) => {
    console.error('❌ Catalog export failed:', err)
    process.exit(1)
  })
