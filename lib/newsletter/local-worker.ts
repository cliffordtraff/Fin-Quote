import { existsSync } from 'fs'
import { spawn } from 'child_process'
import { resolve } from 'path'
import type { NewsletterOptions, NewsletterResult } from './types'

interface NewsletterWorkerRequest {
  ticker?: string
  options?: NewsletterOptions
}

interface NewsletterWorkerResponse {
  result: NewsletterResult
}

const DEFAULT_LOCAL_WORKER_TIMEOUT_MS = 10 * 60 * 1000

function getTsxCliPath(): string {
  const path = resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')
  if (!existsSync(path)) {
    throw new Error(
      'Local newsletter worker requires tsx. Run `npm install` before using NEWSLETTER_GENERATION_BACKEND=local_worker.',
    )
  }
  return path
}

function getWorkerScriptPath(): string {
  const path = resolve(process.cwd(), 'scripts', 'generate-newsletter-local.ts')
  if (!existsSync(path)) {
    throw new Error(`Local newsletter worker script not found: ${path}`)
  }
  return path
}

function getLocalWorkerTimeoutMs(): number {
  const raw = process.env.NEWSLETTER_LOCAL_WORKER_TIMEOUT_MS
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_LOCAL_WORKER_TIMEOUT_MS
}

function parseWorkerResponse(stdout: string): NewsletterWorkerResponse {
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw new Error('empty stdout')
  }

  try {
    return JSON.parse(trimmed) as NewsletterWorkerResponse
  } catch {
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const candidate = lines[index]
      if (!candidate?.startsWith('{')) continue
      try {
        return JSON.parse(candidate) as NewsletterWorkerResponse
      } catch {
        continue
      }
    }

    throw new Error(`Unexpected token in worker stdout: ${trimmed.slice(0, 120)}`)
  }
}

export async function runLocalNewsletterWorker(
  ticker?: string,
  options?: NewsletterOptions,
): Promise<NewsletterResult> {
  const tsxCliPath = getTsxCliPath()
  const workerScriptPath = getWorkerScriptPath()
  const timeoutMs = getLocalWorkerTimeoutMs()

  return new Promise<NewsletterResult>((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, [tsxCliPath, workerScriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEWSLETTER_GENERATION_BACKEND: 'openai_api',
        NEWSLETTER_LOCAL_WORKER_CHILD: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let didTimeout = false

    const timeout = setTimeout(() => {
      didTimeout = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })

    child.on('error', (error) => {
      clearTimeout(timeout)
      rejectResult(
        new Error(`Failed to launch local newsletter worker: ${error.message}`),
      )
    })

    child.on('close', (code, signal) => {
      clearTimeout(timeout)

      if (didTimeout) {
        rejectResult(
          new Error(
            `Local newsletter worker timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
          ),
        )
        return
      }

      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || signal || 'unknown failure'
        rejectResult(new Error(`Local newsletter worker failed: ${detail}`))
        return
      }

      try {
        const payload = parseWorkerResponse(stdout)
        if (!payload?.result) {
          throw new Error('Worker returned no result payload')
        }
        resolveResult(payload.result)
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'invalid JSON'
        rejectResult(
          new Error(
            `Local newsletter worker returned invalid output: ${detail}`,
          ),
        )
      }
    })

    const request: NewsletterWorkerRequest = {
      ticker,
      options,
    }
    child.stdin.end(JSON.stringify(request))
  })
}
