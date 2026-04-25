import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

export interface CodexCliMessage {
  role: 'system' | 'user'
  content: string
}

const DEFAULT_CODEX_TIMEOUT_MS = 5 * 60 * 1000

function quoteWindowsArg(value: string): string {
  if (!/[\s"]/u.test(value)) {
    return value
  }

  return `"${value.replace(/"/g, '\\"')}"`
}

function getDefaultCodexCliPath(): string {
  const override = process.env.NEWSLETTER_CODEX_CLI_PATH?.trim()
  if (override) {
    const resolved = resolve(override)
    if (!existsSync(resolved)) {
      throw new Error(`NEWSLETTER_CODEX_CLI_PATH does not exist: ${resolved}`)
    }
    return resolved
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (!appData) {
      throw new Error('APPDATA is required to locate the Codex CLI on Windows.')
    }

    const windowsCliPath = join(appData, 'npm', 'codex.cmd')
    if (!existsSync(windowsCliPath)) {
      throw new Error(
        'Codex CLI is not installed. Run `npm i -g @openai/codex@latest` and sign in before using NEWSLETTER_MODEL_BACKEND=codex_cli.',
      )
    }

    return windowsCliPath
  }

  return 'codex'
}

function getCodexTimeoutMs(): number {
  const raw = process.env.NEWSLETTER_CODEX_TIMEOUT_MS
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_CODEX_TIMEOUT_MS
}

function buildCodexExecPrompt(messages: CodexCliMessage[]): string {
  const sections = [
    'You are the local newsletter generation engine for The Intraday.',
    'All required context is included below.',
    'Do not inspect files, browse, or run commands unless absolutely necessary.',
    'Return only the JSON requested by the prompt, with no markdown fences and no extra prose.',
  ]

  for (const message of messages) {
    sections.push(
      '',
      `<${message.role.toUpperCase()}>`,
      message.content,
      `</${message.role.toUpperCase()}>`,
    )
  }

  return sections.join('\n')
}

export function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('empty model output')
  }

  try {
    JSON.parse(trimmed)
    return trimmed
  } catch {
    // continue
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    const fenced = fencedMatch[1].trim()
    try {
      JSON.parse(fenced)
      return fenced
    } catch {
      // continue
    }
  }

  const objectStart = trimmed.indexOf('{')
  const objectEnd = trimmed.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) {
    const candidate = trimmed.slice(objectStart, objectEnd + 1)
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      // continue
    }
  }

  const arrayStart = trimmed.indexOf('[')
  const arrayEnd = trimmed.lastIndexOf(']')
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    const candidate = trimmed.slice(arrayStart, arrayEnd + 1)
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      // continue
    }
  }

  throw new Error(`No valid JSON payload found in Codex output: ${trimmed.slice(0, 160)}`)
}

export async function runCodexCliJsonPrompt(
  messages: CodexCliMessage[],
  options?: {
    model?: string
  },
): Promise<string> {
  const cliPath = getDefaultCodexCliPath()
  const timeoutMs = getCodexTimeoutMs()
  const prompt = buildCodexExecPrompt(messages)
  const tempDir = mkdtempSync(join(tmpdir(), 'newsletter-codex-'))
  const outputPath = join(tempDir, 'last-message.txt')

  return new Promise<string>((resolveResult, rejectResult) => {
    let stdout = ''
    let stderr = ''
    let didTimeout = false

    const args = [
      'exec',
      '-',
      '--ephemeral',
      '--skip-git-repo-check',
      '--ignore-rules',
      '--color',
      'never',
      '--sandbox',
      'read-only',
      '--output-last-message',
      outputPath,
      '-C',
      tempDir,
    ]

    if (options?.model?.trim()) {
      args.push('--model', options.model.trim())
    }

    const child =
      process.platform === 'win32' && cliPath.toLowerCase().endsWith('.cmd')
        ? spawn(
            process.env.ComSpec || 'cmd.exe',
            [
              '/d',
              '/s',
              '/c',
              `${quoteWindowsArg(cliPath)} ${args.map(quoteWindowsArg).join(' ')}`,
            ],
            {
              cwd: tempDir,
              env: {
                ...process.env,
                NO_COLOR: '1',
              },
              stdio: ['pipe', 'pipe', 'pipe'],
            },
          )
        : spawn(cliPath, args, {
            cwd: tempDir,
            env: {
              ...process.env,
              NO_COLOR: '1',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
          })

    const cleanup = () => {
      rmSync(tempDir, { recursive: true, force: true })
    }

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
      cleanup()
      rejectResult(new Error(`Failed to launch Codex CLI: ${error.message}`))
    })

    child.on('close', (code) => {
      clearTimeout(timeout)

      if (didTimeout) {
        cleanup()
        rejectResult(
          new Error(
            `Codex CLI timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
          ),
        )
        return
      }

      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `exit code ${code}`
        cleanup()
        rejectResult(new Error(`Codex CLI failed: ${detail}`))
        return
      }

      try {
        if (!existsSync(outputPath)) {
          throw new Error('Codex CLI produced no final output file')
        }

        const finalMessage = readFileSync(outputPath, 'utf8')
        const payload = extractJsonPayload(finalMessage)
        cleanup()
        resolveResult(payload)
      } catch (error) {
        cleanup()
        const detail = error instanceof Error ? error.message : 'invalid JSON'
        rejectResult(new Error(`Codex CLI returned invalid output: ${detail}`))
      }
    })

    child.stdin.end(prompt)
  })
}
