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

async function exportFinancialsToExcel() {
  console.log('📊 Starting Excel export...\n')

  // Query all AAPL financials
  console.log('📥 Fetching AAPL financials from Supabase...')
  const { data, error } = await supabase
    .from('financials_std')
    .select('*')
    .eq('symbol', 'AAPL')
    .order('year', { ascending: false })

  if (error) {
    console.error('❌ Error fetching data:', error.message)
    process.exit(1)
  }

  if (!data || data.length === 0) {
    console.error('❌ No data found for AAPL')
    process.exit(1)
  }

  console.log(`✅ Fetched ${data.length} years of financial data\n`)

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

  // Rename Sheet1 to "AAPL Financials"
  console.log('📝 Populating AAPL Financials sheet...')
  templateSheet.name = 'AAPL Financials'
  const financialsSheet = templateSheet

  // Write headers directly to row 1 (preserves template formatting)
  financialsSheet.getCell(1, 1).value = 'Year'
  financialsSheet.getCell(1, 2).value = 'Revenue'
  financialsSheet.getCell(1, 3).value = 'Gross Profit'
  financialsSheet.getCell(1, 4).value = 'Operating Income'
  financialsSheet.getCell(1, 5).value = 'Net Income'
  financialsSheet.getCell(1, 6).value = 'EPS'
  financialsSheet.getCell(1, 7).value = 'Total Assets'
  financialsSheet.getCell(1, 8).value = 'Total Liabilities'
  financialsSheet.getCell(1, 9).value = 'Shareholders Equity'
  financialsSheet.getCell(1, 10).value = 'Operating Cash Flow'

  // Set column widths
  financialsSheet.getColumn(1).width = 10
  financialsSheet.getColumn(2).width = 18
  financialsSheet.getColumn(3).width = 18
  financialsSheet.getColumn(4).width = 18
  financialsSheet.getColumn(5).width = 18
  financialsSheet.getColumn(6).width = 12
  financialsSheet.getColumn(7).width = 18
  financialsSheet.getColumn(8).width = 18
  financialsSheet.getColumn(9).width = 18
  financialsSheet.getColumn(10).width = 18

  // Write data directly to cells (preserves template formatting)
  data.forEach((row, index) => {
    const rowNum = index + 2 // Start from row 2 (row 1 is headers)
    financialsSheet.getCell(rowNum, 1).value = row.year
    financialsSheet.getCell(rowNum, 2).value = row.revenue
    financialsSheet.getCell(rowNum, 3).value = row.gross_profit
    financialsSheet.getCell(rowNum, 4).value = row.operating_income
    financialsSheet.getCell(rowNum, 5).value = row.net_income
    financialsSheet.getCell(rowNum, 6).value = row.eps
    financialsSheet.getCell(rowNum, 7).value = row.total_assets
    financialsSheet.getCell(rowNum, 8).value = row.total_liabilities
    financialsSheet.getCell(rowNum, 9).value = row.shareholders_equity
    financialsSheet.getCell(rowNum, 10).value = row.operating_cash_flow

    // Apply number formats (only to data rows)
    financialsSheet.getCell(rowNum, 2).numFmt = '$#,##0,,"M"' // Revenue
    financialsSheet.getCell(rowNum, 3).numFmt = '$#,##0,,"M"' // Gross Profit
    financialsSheet.getCell(rowNum, 4).numFmt = '$#,##0,,"M"' // Operating Income
    financialsSheet.getCell(rowNum, 5).numFmt = '$#,##0,,"M"' // Net Income
    financialsSheet.getCell(rowNum, 6).numFmt = '$#,##0.00'    // EPS
    financialsSheet.getCell(rowNum, 7).numFmt = '$#,##0,,"M"' // Total Assets
    financialsSheet.getCell(rowNum, 8).numFmt = '$#,##0,,"M"' // Total Liabilities
    financialsSheet.getCell(rowNum, 9).numFmt = '$#,##0,,"M"' // Shareholders Equity
    financialsSheet.getCell(rowNum, 10).numFmt = '$#,##0,,"M"' // Operating Cash Flow
  })

  // Freeze header row
  financialsSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]

  // ==========================================
  // SHEET 2: Calculated Metrics
  // ==========================================
  console.log('\n📝 Creating Calculated Metrics sheet...')
  const metricsSheet = workbook.addWorksheet('Calculated Metrics')
  metricsSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]

  // Write headers
  metricsSheet.getCell(1, 1).value = 'Year'
  metricsSheet.getCell(1, 2).value = 'Gross Margin %'
  metricsSheet.getCell(1, 3).value = 'Operating Margin %'
  metricsSheet.getCell(1, 4).value = 'Net Margin %'
  metricsSheet.getCell(1, 5).value = 'ROE %'
  metricsSheet.getCell(1, 6).value = 'ROA %'
  metricsSheet.getCell(1, 7).value = 'Debt-to-Equity'

  // Set column widths
  metricsSheet.getColumn(1).width = 10
  metricsSheet.getColumn(2).width = 16
  metricsSheet.getColumn(3).width = 18
  metricsSheet.getColumn(4).width = 16
  metricsSheet.getColumn(5).width = 12
  metricsSheet.getColumn(6).width = 12
  metricsSheet.getColumn(7).width = 16

  // Calculate and write metrics directly to cells
  data.forEach((row, index) => {
    const rowNum = index + 2
    const grossMargin = row.revenue ? ((row.gross_profit / row.revenue) * 100) : 0
    const operatingMargin = row.revenue && row.operating_income
      ? ((row.operating_income / row.revenue) * 100)
      : 0
    const netMargin = row.revenue && row.net_income
      ? ((row.net_income / row.revenue) * 100)
      : 0
    const roe = row.shareholders_equity && row.net_income
      ? ((row.net_income / row.shareholders_equity) * 100)
      : 0
    const roa = row.total_assets && row.net_income
      ? ((row.net_income / row.total_assets) * 100)
      : 0
    const debtToEquity = row.shareholders_equity && row.total_liabilities
      ? (row.total_liabilities / row.shareholders_equity)
      : 0

    metricsSheet.getCell(rowNum, 1).value = row.year
    metricsSheet.getCell(rowNum, 2).value = grossMargin
    metricsSheet.getCell(rowNum, 3).value = operatingMargin
    metricsSheet.getCell(rowNum, 4).value = netMargin
    metricsSheet.getCell(rowNum, 5).value = roe
    metricsSheet.getCell(rowNum, 6).value = roa
    metricsSheet.getCell(rowNum, 7).value = debtToEquity

    // Apply number formats
    metricsSheet.getCell(rowNum, 2).numFmt = '0.00"%"'
    metricsSheet.getCell(rowNum, 3).numFmt = '0.00"%"'
    metricsSheet.getCell(rowNum, 4).numFmt = '0.00"%"'
    metricsSheet.getCell(rowNum, 5).numFmt = '0.00"%"'
    metricsSheet.getCell(rowNum, 6).numFmt = '0.00"%"'
    metricsSheet.getCell(rowNum, 7).numFmt = '0.00'
  })

  // ==========================================
  // SHEET 3: Summary & Metadata
  // ==========================================
  console.log('\n📝 Creating Summary sheet...')
  const summarySheet = workbook.addWorksheet('Summary')

  summarySheet.getColumn(1).width = 25
  summarySheet.getColumn(2).width = 30

  // Write summary data directly to cells
  let summaryRow = 1
  summarySheet.getCell(summaryRow++, 1).value = 'AAPL Financial Data Export'
  summaryRow++ // Blank row

  summarySheet.getCell(summaryRow, 1).value = 'Export Date:'
  summarySheet.getCell(summaryRow++, 2).value = new Date().toLocaleString()

  summarySheet.getCell(summaryRow, 1).value = 'Company:'
  summarySheet.getCell(summaryRow++, 2).value = 'Apple Inc. (AAPL)'

  summarySheet.getCell(summaryRow, 1).value = 'Data Source:'
  summarySheet.getCell(summaryRow++, 2).value = 'Fin Quote / Supabase'

  summarySheet.getCell(summaryRow, 1).value = 'Years Included:'
  summarySheet.getCell(summaryRow++, 2).value = `${data[data.length - 1].year} - ${data[0].year}`

  summarySheet.getCell(summaryRow, 1).value = 'Total Years:'
  summarySheet.getCell(summaryRow++, 2).value = data.length

  summaryRow++ // Blank row

  summarySheet.getCell(summaryRow++, 1).value = 'Sheets Included:'
  summarySheet.getCell(summaryRow, 1).value = '1. AAPL Financials'
  summarySheet.getCell(summaryRow++, 2).value = 'Raw financial data (Income Statement, Balance Sheet, Cash Flow)'
  summarySheet.getCell(summaryRow, 1).value = '2. Calculated Metrics'
  summarySheet.getCell(summaryRow++, 2).value = 'Profitability ratios, leverage ratios, efficiency ratios'

  summaryRow++ // Blank row

  summarySheet.getCell(summaryRow++, 1).value = 'Available Raw Metrics:'
  summarySheet.getCell(summaryRow, 1).value = '• Revenue'
  summarySheet.getCell(summaryRow++, 2).value = 'Total sales for the fiscal year'
  summarySheet.getCell(summaryRow, 1).value = '• Gross Profit'
  summarySheet.getCell(summaryRow++, 2).value = 'Revenue minus cost of goods sold'
  summarySheet.getCell(summaryRow, 1).value = '• Operating Income'
  summarySheet.getCell(summaryRow++, 2).value = 'Profit from operations (EBIT)'
  summarySheet.getCell(summaryRow, 1).value = '• Net Income'
  summarySheet.getCell(summaryRow++, 2).value = 'Bottom line profit after all expenses'
  summarySheet.getCell(summaryRow, 1).value = '• EPS'
  summarySheet.getCell(summaryRow++, 2).value = 'Earnings per share (diluted)'
  summarySheet.getCell(summaryRow, 1).value = '• Total Assets'
  summarySheet.getCell(summaryRow++, 2).value = 'Sum of all assets'
  summarySheet.getCell(summaryRow, 1).value = '• Total Liabilities'
  summarySheet.getCell(summaryRow++, 2).value = 'Sum of all debts and obligations'
  summarySheet.getCell(summaryRow, 1).value = '• Shareholders Equity'
  summarySheet.getCell(summaryRow++, 2).value = 'Net worth (Assets - Liabilities)'
  summarySheet.getCell(summaryRow, 1).value = '• Operating Cash Flow'
  summarySheet.getCell(summaryRow++, 2).value = 'Cash from operations'

  // ==========================================
  // Save File
  // ==========================================
  const filename = `exports/aapl-financials-${new Date().toISOString().split('T')[0]}.xlsx`

  try {
    await workbook.xlsx.writeFile(filename)
    console.log(`✅ Excel file created successfully!`)
    console.log(`📁 Location: ${filename}`)
    console.log(`\n📊 Sheets included:`)
    console.log(`   1. AAPL Financials - Raw data (${data.length} years)`)
    console.log(`   2. Calculated Metrics - Ratios and margins`)
    console.log(`   3. Summary - Export metadata\n`)
  } catch (err) {
    console.error('❌ Error writing Excel file:', err)
    process.exit(1)
  }
}

// Run the export
exportFinancialsToExcel()
  .then(() => {
    console.log('✅ Export complete!')
    process.exit(0)
  })
  .catch((err) => {
    console.error('❌ Export failed:', err)
    process.exit(1)
  })
