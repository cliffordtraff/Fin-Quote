import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function parseArgs(argv: string[]) {
  const args = new Map<string, string>()
  for (let i = 2; i < argv.length; i += 2) {
    args.set(argv[i], argv[i + 1])
  }
  return args
}

type EvalRow = {
  symbol: string
  summary_date: string
  config_version: string | null
  score: number | null
  topic_match: boolean | null
  bucket: string | null
  miss_reason: string | null
  feedback: string | null
}

async function main() {
  const args = parseArgs(process.argv)
  const limit = Number(args.get('--limit') || 50)
  const summaryDate = args.get('--summary-date') || new Date().toISOString().slice(0, 10)
  const configVersion = args.get('--config-version') || null

  let query = supabase
    .from('summary_evals')
    .select('symbol, summary_date, config_version, score, topic_match, bucket, miss_reason, feedback')
    .eq('summary_date', summaryDate)
    .order('id', { ascending: false })
    .limit(limit)

  if (configVersion) {
    query = query.eq('config_version', configVersion)
  }

  const { data, error } = await query
  if (error) throw error

  const rows = (data || []) as EvalRow[]
  const scored = rows.filter((row) => typeof row.score === 'number')
  const avgScore = scored.length ? Number((scored.reduce((sum, row) => sum + (row.score || 0), 0) / scored.length).toFixed(1)) : 0
  const matches = rows.filter((row) => row.topic_match === true).length
  const misses = rows.filter((row) => row.topic_match === false).length
  const byBucket = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.bucket || 'unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const missReasons = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.miss_reason || 'none'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const sortedWeakest = [...rows]
    .filter((row) => typeof row.score === 'number')
    .sort((a, b) => (a.score || 0) - (b.score || 0))
    .slice(0, 5)
    .map((row) => ({
      symbol: row.symbol,
      score: row.score,
      missReason: row.miss_reason,
      feedback: row.feedback,
    }))

  const payload = {
    summaryDate,
    configVersion,
    rowCount: rows.length,
    matches,
    misses,
    avgScore,
    matchRate: rows.length ? Number(((matches / rows.length) * 100).toFixed(1)) : 0,
    byBucket,
    missReasons,
    weakestExamples: sortedWeakest,
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
