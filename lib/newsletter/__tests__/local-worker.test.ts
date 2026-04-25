import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NewsletterResult } from '@/lib/newsletter/types'

const { existsSyncMock, spawnMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  spawnMock: vi.fn(),
}))

vi.mock('fs', () => ({
  default: {
    existsSync: existsSyncMock,
  },
  existsSync: existsSyncMock,
}))

vi.mock('child_process', () => ({
  default: {
    spawn: spawnMock,
  },
  spawn: spawnMock,
}))

import { runLocalNewsletterWorker } from '@/lib/newsletter/local-worker'

const sampleResult: NewsletterResult = {
  ticker: 'AAPL',
  format: 'single_stock',
  featuredTickers: ['AAPL'],
  generatedAt: '2026-04-24T16:00:00.000Z',
  subjectLine: 'Apple snapshot',
  selections: [],
  blocks: [],
  chartSpecs: [],
  fullHtml: '<html />',
  beehiivHtml: '<table />',
  chartPaths: [],
  htmlPath: '/tmp/aapl.html',
  beehiivHtmlPath: '/tmp/aapl-beehiiv.html',
  previewPath: null,
  timings: {},
  autoPickedStock: false,
}

interface MockChildProcess extends EventEmitter {
  stdout: PassThrough
  stderr: PassThrough
  stdin: PassThrough
  kill: ReturnType<typeof vi.fn>
}

function createMockChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.stdin = new PassThrough()
  child.kill = vi.fn()
  return child
}

describe('runLocalNewsletterWorker', () => {
  beforeEach(() => {
    existsSyncMock.mockReset()
    spawnMock.mockReset()
    existsSyncMock.mockReturnValue(true)
    delete process.env.NEWSLETTER_LOCAL_WORKER_TIMEOUT_MS
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses the worker JSON result and forces the child backend to openai_api', async () => {
    const child = createMockChildProcess()
    spawnMock.mockReturnValue(child)

    const promise = runLocalNewsletterWorker('AAPL', {
      format: 'single_stock',
      generationPrompt: 'Focus on services',
    })

    child.stdout.write(JSON.stringify({ result: sampleResult }))
    child.stdout.end()
    child.emit('close', 0, null)

    await expect(promise).resolves.toEqual(sampleResult)

    expect(spawnMock).toHaveBeenCalledTimes(1)
    const spawnArgs = spawnMock.mock.calls[0]
    expect(spawnArgs?.[2]?.env?.NEWSLETTER_GENERATION_BACKEND).toBe('openai_api')
  })

  it('surfaces worker stderr when the child exits non-zero', async () => {
    const child = createMockChildProcess()
    spawnMock.mockReturnValue(child)

    const promise = runLocalNewsletterWorker('AAPL', {
      format: 'single_stock',
    })

    child.stderr.write('newsletter worker exploded')
    child.stderr.end()
    child.emit('close', 1, null)

    await expect(promise).rejects.toThrow(
      'Local newsletter worker failed: newsletter worker exploded',
    )
  })

  it('parses the final JSON line even when worker stdout contains startup noise', async () => {
    const child = createMockChildProcess()
    spawnMock.mockReturnValue(child)

    const promise = runLocalNewsletterWorker('AAPL', {
      format: 'single_stock',
    })

    child.stdout.write('[dotenv@17.2.3] injecting env (quiet=false)\n')
    child.stdout.write(JSON.stringify({ result: sampleResult }))
    child.stdout.end()
    child.emit('close', 0, null)

    await expect(promise).resolves.toEqual(sampleResult)
  })
})
