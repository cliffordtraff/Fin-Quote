import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'
import * as path from 'path'
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

// Metric definitions
interface MetricDefinition {
  name: string
  databaseField: string
  category: string
  description: string
  unit: string
  isCalculated: boolean
  formula?: string
}

const rawMetrics: MetricDefinition[] = [
  // Income Statement
  { name: 'Revenue', databaseField: 'revenue', category: 'Income Statement', description: 'Total revenue (sales) for the fiscal year', unit: 'USD', isCalculated: false },
  { name: 'Gross Profit', databaseField: 'gross_profit', category: 'Income Statement', description: 'Revenue minus cost of goods sold (COGS)', unit: 'USD', isCalculated: false },
  { name: 'Operating Income', databaseField: 'operating_income', category: 'Income Statement', description: 'Profit from core business operations (EBIT)', unit: 'USD', isCalculated: false },
  { name: 'Net Income', databaseField: 'net_income', category: 'Income Statement', description: 'Bottom line profit after all expenses and taxes', unit: 'USD', isCalculated: false },
  { name: 'EPS', databaseField: 'eps', category: 'Income Statement', description: 'Earnings per share (diluted)', unit: 'USD per share', isCalculated: false },
  // Balance Sheet
  { name: 'Total Assets', databaseField: 'total_assets', category: 'Balance Sheet', description: 'Sum of all assets owned by the company', unit: 'USD', isCalculated: false },
  { name: 'Total Liabilities', databaseField: 'total_liabilities', category: 'Balance Sheet', description: 'Sum of all debts and obligations', unit: 'USD', isCalculated: false },
  { name: 'Shareholders Equity', databaseField: 'shareholders_equity', category: 'Balance Sheet', description: 'Net worth of the company (Assets - Liabilities)', unit: 'USD', isCalculated: false },
  // Cash Flow Statement
  { name: 'Operating Cash Flow', databaseField: 'operating_cash_flow', category: 'Cash Flow Statement', description: 'Cash generated from core business operations', unit: 'USD', isCalculated: false },
]

const priceMetrics: MetricDefinition[] = [
  // Stock Price Data
  { name: 'Stock Price (Daily Close)', databaseField: 'close', category: 'Market Data', description: 'Daily closing stock price', unit: 'USD per share', isCalculated: false },
  { name: 'Stock Price (Daily Open)', databaseField: 'open', category: 'Market Data', description: 'Daily opening stock price', unit: 'USD per share', isCalculated: false },
  { name: 'Stock Price (Daily High)', databaseField: 'high', category: 'Market Data', description: 'Highest price during the trading day', unit: 'USD per share', isCalculated: false },
  { name: 'Stock Price (Daily Low)', databaseField: 'low', category: 'Market Data', description: 'Lowest price during the trading day', unit: 'USD per share', isCalculated: false },
  { name: 'Trading Volume', databaseField: 'volume', category: 'Market Data', description: 'Number of shares traded during the day', unit: 'Shares', isCalculated: false },
]

const calculatedMetrics: MetricDefinition[] = [
  // Profitability Ratios
  { name: 'Gross Margin', databaseField: 'gross_margin', category: 'Profitability Ratio', description: 'Percentage of revenue retained after COGS. Higher is better.', unit: 'Percentage (%)', isCalculated: true, formula: '(gross_profit / revenue) × 100' },
  { name: 'Operating Margin', databaseField: 'operating_margin', category: 'Profitability Ratio', description: 'Profit margin from operations before interest and taxes', unit: 'Percentage (%)', isCalculated: true, formula: '(operating_income / revenue) × 100' },
  { name: 'Net Margin', databaseField: 'net_margin', category: 'Profitability Ratio', description: 'Percentage of revenue that becomes profit', unit: 'Percentage (%)', isCalculated: true, formula: '(net_income / revenue) × 100' },
  { name: 'ROE (Return on Equity)', databaseField: 'roe', category: 'Profitability Ratio', description: 'Measures profitability relative to shareholders equity', unit: 'Percentage (%)', isCalculated: true, formula: '(net_income / shareholders_equity) × 100' },
  { name: 'ROA (Return on Assets)', databaseField: 'roa', category: 'Profitability Ratio', description: 'How efficiently assets generate profit', unit: 'Percentage (%)', isCalculated: true, formula: '(net_income / total_assets) × 100' },
  // Leverage Ratios
  { name: 'Debt-to-Equity Ratio', databaseField: 'debt_to_equity_ratio', category: 'Leverage Ratio', description: 'Measures financial leverage by comparing debt to equity', unit: 'Ratio', isCalculated: true, formula: 'total_liabilities / shareholders_equity' },
  { name: 'Debt-to-Assets Ratio', databaseField: 'debt_to_assets', category: 'Leverage Ratio', description: 'Percentage of assets financed by debt', unit: 'Ratio', isCalculated: true, formula: 'total_liabilities / total_assets' },
  // Efficiency Ratios
  { name: 'Asset Turnover', databaseField: 'asset_turnover', category: 'Efficiency Ratio', description: 'How efficiently assets generate revenue', unit: 'Ratio', isCalculated: true, formula: 'revenue / total_assets' },
]

async function exportMetricsList() {
  console.log('📋 Starting Metrics List export...\n')

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
  const yearRange = `${years[0]} - ${years[years.length - 1]}`

  console.log(`✅ Data coverage: ${yearRange} (${years.length} years)\n`)

  // Combine all metrics
  const allMetrics = [
    ...rawMetrics.map(m => ({ ...m, availableYears: yearRange })),
    ...priceMetrics.map(m => ({ ...m, availableYears: 'Daily (7d/30d/90d ranges available)' })),
    ...calculatedMetrics.map(m => ({ ...m, availableYears: yearRange }))
  ]

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

  // Rename Sheet1 to "AAPL Metrics"
  console.log('📝 Populating AAPL Metrics sheet...')
  templateSheet.name = 'AAPL Metrics'
  const sheet = templateSheet

  // Write headers directly to row 1 (preserves template formatting)
  sheet.getCell(1, 1).value = 'Metric Name'
  sheet.getCell(1, 2).value = 'Category'
  sheet.getCell(1, 3).value = 'Type'
  sheet.getCell(1, 4).value = 'Description'
  sheet.getCell(1, 5).value = 'Unit'
  sheet.getCell(1, 6).value = 'Available Years'

  // Set column widths
  sheet.getColumn(1).width = 28
  sheet.getColumn(2).width = 20
  sheet.getColumn(3).width = 12
  sheet.getColumn(4).width = 60
  sheet.getColumn(5).width = 16
  sheet.getColumn(6).width = 16

  // Write metrics directly to cells (preserves template formatting)
  allMetrics.forEach((metric, index) => {
    const rowNum = index + 2 // Start from row 2 (row 1 is headers)
    sheet.getCell(rowNum, 1).value = metric.name
    sheet.getCell(rowNum, 2).value = metric.category
    sheet.getCell(rowNum, 3).value = metric.isCalculated ? 'Calculated' : 'Raw'
    sheet.getCell(rowNum, 4).value = metric.description + (metric.formula ? ` | Formula: ${metric.formula}` : '')
    sheet.getCell(rowNum, 5).value = metric.unit
    sheet.getCell(rowNum, 6).value = metric.availableYears

    // Wrap text for description column
    sheet.getCell(rowNum, 4).alignment = { vertical: 'top', wrapText: true }
  })

  // Freeze header row
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]

  // Save File
  const filename = `exports/aapl-metrics-list-${new Date().toISOString().split('T')[0]}.xlsx`

  try {
    await workbook.xlsx.writeFile(filename)
    console.log(`✅ Metrics list created successfully!`)
    console.log(`📁 Location: ${filename}`)
    console.log(`\n📊 Content:`)
    console.log(`   - ${allMetrics.length} total metrics`)
    console.log(`   - ${rawMetrics.length} raw financial metrics`)
    console.log(`   - ${priceMetrics.length} market data metrics (stock price)`)
    console.log(`   - ${calculatedMetrics.length} calculated metrics (ratios)`)
    console.log(`   - Financial data: ${yearRange}`)
    console.log(`   - Market data: Daily prices (7d/30d/90d ranges)\n`)
  } catch (err) {
    console.error('❌ Error writing Excel file:', err)
    process.exit(1)
  }
}

// Run the export
exportMetricsList()
  .then(() => {
    console.log('✅ Export complete!')
    process.exit(0)
  })
  .catch((err) => {
    console.error('❌ Export failed:', err)
    process.exit(1)
  })
