import ExcelJS from 'exceljs'
import * as path from 'path'
import * as fs from 'fs'

// Helper function to apply dark theme to entire sheet
function applyDarkThemeToSheet(sheet: ExcelJS.Worksheet, maxRows: number = 10000, maxCols: number = 20) {
  console.log(`  Formatting ${sheet.name}... (${maxRows} rows x ${maxCols} cols)`)

  // Apply black background and white text to all cells
  for (let row = 1; row <= maxRows; row++) {
    for (let col = 1; col <= maxCols; col++) {
      const cell = sheet.getRow(row).getCell(col)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF000000' }, // Black background
      }
      cell.font = {
        color: { argb: 'FFFFFFFF' }, // White text
        name: 'Arial',
        size: 11,
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF444444' } },
        left: { style: 'thin', color: { argb: 'FF444444' } },
        bottom: { style: 'thin', color: { argb: 'FF444444' } },
        right: { style: 'thin', color: { argb: 'FF444444' } },
      }
    }

    // Progress indicator every 1000 rows
    if (row % 1000 === 0) {
      console.log(`    ${row} rows formatted...`)
    }
  }

  console.log(`  ✅ ${sheet.name} complete`)
}

async function createDarkTemplate() {
  console.log('🎨 Creating dark-themed Excel template...\n')

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Fin Quote'
  workbook.created = new Date()

  // Create all sheets needed for both export scripts
  const sheets = [
    // For export-to-excel.ts
    { name: 'AAPL Financials', frozen: true },
    { name: 'Calculated Metrics', frozen: true },
    { name: 'Summary', frozen: false },

    // For export-metrics-catalog.ts
    { name: 'Metrics Overview', frozen: true },
    { name: 'Raw Metrics', frozen: true },
    { name: 'Calculated Metrics 2', frozen: true }, // Different from above
    { name: 'By Category', frozen: false },
    { name: 'Catalog Summary', frozen: false },
  ]

  for (const sheetDef of sheets) {
    console.log(`\n📄 Creating sheet: ${sheetDef.name}`)

    const sheet = workbook.addWorksheet(sheetDef.name, {
      views: sheetDef.frozen
        ? [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
        : undefined
    })

    // Apply dark theme to first 10,000 rows
    applyDarkThemeToSheet(sheet, 10000, 20)
  }

  // Create templates directory if it doesn't exist
  const templatesDir = path.join(process.cwd(), 'templates')
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true })
    console.log('\n📁 Created templates/ directory')
  }

  // Save template
  const templatePath = path.join(templatesDir, 'dark-template.xlsx')
  await workbook.xlsx.writeFile(templatePath)

  console.log(`\n✅ Template created successfully!`)
  console.log(`📁 Location: ${templatePath}`)
  console.log(`\n📊 Sheets included:`)
  sheets.forEach((s, i) => console.log(`   ${i + 1}. ${s.name}`))
  console.log(`\n💡 This template has 10,000 rows pre-formatted with:`)
  console.log(`   • Black background (#000000)`)
  console.log(`   • White text (#FFFFFF)`)
  console.log(`   • Gray borders (#444444)`)
}

// Run the script
createDarkTemplate()
  .then(() => {
    console.log('\n✅ Done!')
    process.exit(0)
  })
  .catch((err) => {
    console.error('❌ Error creating template:', err)
    process.exit(1)
  })
