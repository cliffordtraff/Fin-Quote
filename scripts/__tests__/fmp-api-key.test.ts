import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()
const isolatedCwd = mkdtempSync(path.join(os.tmpdir(), 'fin-quote-fmp-test-'))
const tsxCli = path.join(repositoryRoot, 'node_modules/tsx/dist/cli.mjs')
const typescriptScripts = [
  'scripts/fetch-aapl-data.ts',
  'scripts/fetch-fmp-metrics.ts',
  'scripts/batch-fetch-sp500-20years.ts',
  'scripts/backfill-shares-outstanding.ts',
]
const javascriptScripts = [
  'scripts/test-fmp-10min.mjs',
  'scripts/test-futures.mjs',
  'scripts/test-indices.mjs',
]

function runWithoutApiKey(script: string, useTsx: boolean) {
  const args = useTsx
    ? [tsxCli, path.join(repositoryRoot, script)]
    : [path.join(repositoryRoot, script)]

  const isolatedEnvironment = { ...process.env }
  delete isolatedEnvironment.FMP_API_KEY
  delete isolatedEnvironment.DOTENV_CONFIG_PATH
  delete isolatedEnvironment.DOTENV_CONFIG_OVERRIDE

  return spawnSync(process.execPath, args, {
    cwd: isolatedCwd,
    encoding: 'utf8',
    env: {
      ...isolatedEnvironment,
      FMP_API_KEY: '   ',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    timeout: 10_000,
  })
}

afterAll(() => {
  rmSync(isolatedCwd, { recursive: true, force: true })
})

describe('FMP command-line scripts', () => {
  it.each(typescriptScripts)('%s fails before work begins when its API key is missing', (script) => {
    const result = runWithoutApiKey(script, true)

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain(
      'FMP_API_KEY environment variable is required',
    )
  })

  it.each(javascriptScripts)('%s fails before work begins when its API key is missing', (script) => {
    const result = runWithoutApiKey(script, false)

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain(
      'FMP_API_KEY environment variable is required',
    )
  })
})
