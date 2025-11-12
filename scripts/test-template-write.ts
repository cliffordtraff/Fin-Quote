import ExcelJS from 'exceljs'
import * as path from 'path'

async function testTemplateWrite() {
  console.log('🧪 Testing TemplateBase.xlsx with direct cell writes...\n')

  const templatePath = path.join(process.cwd(), 'templates/TemplateBase.xlsx')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)

  const sheet = workbook.getWorksheet('Sheet1')!

  // Write headers directly to row 1 (preserving existing formatting)
  sheet.getCell(1, 1).value = 'Year'
  sheet.getCell(1, 2).value = 'Revenue'
  sheet.getCell(1, 3).value = 'Net Income'

  // Write data directly to rows 2-5 (preserving existing formatting)
  sheet.getCell(2, 1).value = 2023
  sheet.getCell(2, 2).value = 383000000
  sheet.getCell(2, 3).value = 97000000

  sheet.getCell(3, 1).value = 2022
  sheet.getCell(3, 2).value = 394000000
  sheet.getCell(3, 3).value = 99800000

  sheet.getCell(4, 1).value = 2021
  sheet.getCell(4, 2).value = 365000000
  sheet.getCell(4, 3).value = 94700000

  // Save
  const outputPath = 'exports/test-template-write.xlsx'
  await workbook.xlsx.writeFile(outputPath)

  console.log(`✅ Test file saved: ${outputPath}`)
  console.log('📋 Open it to see if dark theme is preserved!\n')
}

testTemplateWrite()
