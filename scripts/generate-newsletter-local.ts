import dotenv from 'dotenv'
dotenv.config({ path: '.env.local', quiet: true })

import { generateNewsletter } from '../lib/newsletter/orchestrate'
import type { NewsletterOptions } from '../lib/newsletter/types'

interface NewsletterWorkerRequest {
  ticker?: string
  options?: NewsletterOptions
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8')
}

async function main() {
  const rawInput = await readStdin()

  if (!rawInput.trim()) {
    throw new Error('Local newsletter worker expected JSON input on stdin')
  }

  const request = JSON.parse(rawInput) as NewsletterWorkerRequest
  const result = await generateNewsletter(request.ticker, request.options)

  process.stdout.write(JSON.stringify({ result }))
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Local newsletter worker failed'
  process.stderr.write(message)
  process.exit(1)
})
