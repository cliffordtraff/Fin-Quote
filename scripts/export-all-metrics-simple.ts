/**
 * Simple script to export all available financial metrics to Excel
 */
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function exportAllMetrics() {
  console.log('📊 Exporting all financial metrics...\n')

  // Load catalog
  const catalogPath = path.join(process.cwd(), 'data/metrics-catalog.json')
  const catalogData = await fs.readFile(catalogPath, 'utf-8')
  const catalog = JSON.parse(catalogData)

  console.log(`✅ Loaded ${catalog.length} metrics from catalog\n`)

  // Create workbook
  const workbook = new ExcelJS.Workbook()

  // ==========================================
  // SHEET 1: All Metrics Summary
  // ==========================================
  const summarySheet = workbook.addWorksheet('All Metrics')

  summarySheet.columns = [
    { header: 'Metric Name', key: 'metric_name', width: 30 },
    { header: 'Category', key: 'category', width: 30 },
    { header: 'Description', key: 'description', width: 60 },
    { header: 'Unit', key: 'unit', width: 15 },
    { header: 'Data Coverage', key: 'data_coverage', width: 15 },
    { header: 'Common Aliases', key: 'aliases', width: 40 },
  ]

  // Style header
  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  summarySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  }

  // Add data
  catalog.forEach((metric: any) => {
    summarySheet.addRow({
      metric_name: metric.metric_name,
      category: metric.category,
      description: metric.description,
      unit: metric.unit,
      data_coverage: metric.data_coverage,
      aliases: metric.common_aliases.join(', ')
    })
  })

  // Freeze header
  summarySheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]

  // ==========================================
  // SHEET 2: By Category
  // ==========================================
  const byCategory = workbook.addWorksheet('By Category')

  byCategory.columns = [
    { header: 'Category', key: 'category', width: 30 },
    { header: 'Metric Count', key: 'count', width: 15 },
    { header: 'Metrics', key: 'metrics', width: 80 },
  ]

  // Style header
  byCategory.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  byCategory.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  }

  // Group by category
  const categories = new Map<string, string[]>()
  catalog.forEach((metric: any) => {
    if (!categories.has(metric.category)) {
      categories.set(metric.category, [])
    }
    categories.get(metric.category)!.push(metric.metric_name)
  })

  // Sort and add to sheet
  Array.from(categories.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([category, metrics]) => {
      byCategory.addRow({
        category,
        count: metrics.length,
        metrics: metrics.join(', ')
      })
    })

  byCategory.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]

  // ==========================================
  // SHEET 3: Sample Data (AAPL 2020-2025)
  // ==========================================
  console.log('📥 Fetching sample data from database...')

  const { data: sampleData, error } = await supabase
    .from('financial_metrics')
    .select('metric_name, year, metric_value, metric_category')
    .eq('symbol', 'AAPL')
    .gte('year', 2020)
    .order('metric_name')
    .order('year', { ascending: false })

  if (error) {
    console.error('Error fetching sample data:', error)
  } else {
    console.log(`✅ Fetched ${sampleData.length} data points\n`)

    const dataSheet = workbook.addWorksheet('Sample Data (AAPL 2020-2025)')

    dataSheet.columns = [
      { header: 'Metric Name', key: 'metric_name', width: 30 },
      { header: 'Category', key: 'category', width: 30 },
      { header: 'Year', key: 'year', width: 10 },
      { header: 'Value', key: 'value', width: 20 },
    ]

    // Style header
    dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    dataSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    }

    // Add data
    sampleData.forEach((row: any) => {
      dataSheet.addRow({
        metric_name: row.metric_name,
        category: row.metric_category,
        year: row.year,
        value: row.metric_value
      })
    })

    dataSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
  }

  // ==========================================
  // Save File
  // ==========================================
  const exportsDir = path.join(process.cwd(), 'exports')
  await fs.mkdir(exportsDir, { recursive: true })

  const timestamp = new Date().toISOString().split('T')[0]
  const filename = path.join(exportsDir, `aapl-all-metrics-${timestamp}.xlsx`)

  await workbook.xlsx.writeFile(filename)

  console.log('✅ Export complete!')
  console.log(`📁 File: ${filename}`)
  console.log(`\n📊 Sheets:`)
  console.log(`   1. All Metrics - ${catalog.length} metrics with descriptions`)
  console.log(`   2. By Category - Grouped by ${categories.size} categories`)
  console.log(`   3. Sample Data - Recent data for AAPL (2020-2025)`)
}

exportAllMetrics().catch(console.error)
