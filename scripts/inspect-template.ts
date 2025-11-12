import ExcelJS from 'exceljs'
import * as path from 'path'

async function inspectTemplate() {
  const templatePath = path.join(process.cwd(), 'templates/TemplateBase.xlsx')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)

  console.log(`\n📋 Template: ${templatePath}`)
  console.log(`\n📊 Sheets (${workbook.worksheets.length} total):`)

  workbook.worksheets.forEach((sheet, index) => {
    console.log(`   ${index + 1}. "${sheet.name}" (${sheet.rowCount} rows used)`)
  })

  console.log('\n')
}

inspectTemplate()
