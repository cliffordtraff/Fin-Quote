import ExcelJS from 'exceljs'
import * as path from 'path'

async function debugTemplate() {
  const templatePath = path.join(process.cwd(), 'templates/TemplateBase.xlsx')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)

  const sheet = workbook.getWorksheet('Sheet1')!

  console.log('\n🔍 Inspecting TemplateBase.xlsx Sheet1...\n')

  // Check first 5 cells
  for (let row = 1; row <= 5; row++) {
    for (let col = 1; col <= 5; col++) {
      const cell = sheet.getCell(row, col)

      console.log(`\nCell ${cell.address}:`)
      console.log(`  Value: ${cell.value || '(empty)'}`)
      console.log(`  Fill: ${JSON.stringify(cell.fill)}`)
      console.log(`  Font: ${JSON.stringify(cell.font)}`)
      console.log(`  Border: ${JSON.stringify(cell.border)}`)
    }
  }

  console.log('\n\n📊 Sheet Properties:')
  console.log(`  Default row height: ${sheet.properties.defaultRowHeight}`)
  console.log(`  Default col width: ${sheet.properties.defaultColWidth}`)
  console.log(`  Tab color: ${JSON.stringify(sheet.properties.tabColor)}`)

  console.log('\n')
}

debugTemplate()
