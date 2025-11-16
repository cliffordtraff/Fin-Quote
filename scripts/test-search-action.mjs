import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env.local') })

// Dynamically import the search action
const { searchFilings } = await import('../app/actions/search-filings.ts')

async function testSearch() {
  console.log('Testing searchFilings action...\n')

  const testQuery = "What are Apple's main risk factors?"
  console.log(`Query: "${testQuery}"\n`)

  const result = await searchFilings({
    query: testQuery,
    limit: 3,
  })

  if (result.error) {
    console.error('Error:', result.error)
    return
  }

  console.log(`✅ Found ${result.data?.length || 0} passages\n`)

  if (result.data && result.data.length > 0) {
    result.data.forEach((passage, i) => {
      console.log(`\n=== Passage ${i + 1} ===`)
      console.log(`Filing: ${passage.filing_type}`)
      console.log(`Date: ${passage.filing_date}`)
      console.log(`Fiscal Year: ${passage.fiscal_year}${passage.fiscal_quarter ? ` Q${passage.fiscal_quarter}` : ''}`)
      console.log(`Section: ${passage.section_name}`)
      console.log(`Text: ${passage.chunk_text.substring(0, 200)}...`)
    })
  } else {
    console.log('No passages found')
  }
}

testSearch().catch(console.error)
