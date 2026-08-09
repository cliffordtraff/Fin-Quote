import { describe, expect, it } from 'vitest'
import { ChatbotHistoryGenerationFence } from '@/lib/chatbot/history-generation'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

describe('chatbot history publication generation', () => {
  it('prevents a deferred initial revision from overwriting recovered N+1', async () => {
    const fence = new ChatbotHistoryGenerationFence()
    const oldLoad = deferred<{ revision: number; value: string }>()
    const oldGeneration = fence.begin()
    let published = { revision: 0, value: 'empty' }
    const publishOld = oldLoad.promise.then(result => {
      if (fence.isCurrent(oldGeneration)) published = result
    })

    fence.invalidate()
    published = { revision: 2, value: 'recovered N+1' }
    oldLoad.resolve({ revision: 1, value: 'deferred N' })
    await publishOld

    expect(published).toEqual({ revision: 2, value: 'recovered N+1' })
  })
})
