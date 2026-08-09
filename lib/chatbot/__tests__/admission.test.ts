import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHATBOT_PHYSICAL_MAX,
  CHATBOT_REQUEST_DEADLINE_MS,
  ChatbotCapacityError,
  ChatbotRequestAbortedError,
  ChatbotRequestTimeoutError,
  ChatbotScopeBusyError,
  getChatbotAdmissionStateForTests,
  reserveChatbotRequest,
  resetChatbotAdmissionForTests,
} from '@/lib/chatbot/admission'

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  resetChatbotAdmissionForTests()
})

afterEach(() => {
  resetChatbotAdmissionForTests()
  vi.useRealTimers()
})

describe('chatbot physical admission', () => {
  it('rejects a second request for the same authenticated scope', () => {
    reserveChatbotRequest('user-1')

    expect(() => reserveChatbotRequest('user-1')).toThrow(ChatbotScopeBusyError)
    expect(getChatbotAdmissionStateForTests()).toMatchObject({
      scopes: ['user-1'],
      physicalCount: 1,
    })
  })

  it('rejects a fifth global request before any loader is started', () => {
    for (let index = 0; index < CHATBOT_PHYSICAL_MAX; index += 1) {
      reserveChatbotRequest(`user-${index}`)
    }

    expect(() => reserveChatbotRequest('user-overflow')).toThrow(ChatbotCapacityError)
    expect(getChatbotAdmissionStateForTests().physicalCount).toBe(CHATBOT_PHYSICAL_MAX)
  })

  it('aborts at the owned deadline but retains an abort-ignoring physical slot', async () => {
    vi.useFakeTimers()
    const physical = deferred()
    const lease = reserveChatbotRequest('slow-user')
    let ownedSignal: AbortSignal | undefined
    void lease.start(async signal => {
      ownedSignal = signal
      await physical.promise
    })
    await Promise.resolve()

    const logicalResult = lease.completion.catch(error => error)
    await vi.advanceTimersByTimeAsync(CHATBOT_REQUEST_DEADLINE_MS)

    expect(await logicalResult).toBeInstanceOf(ChatbotRequestTimeoutError)
    expect(ownedSignal?.aborted).toBe(true)
    expect(getChatbotAdmissionStateForTests()).toEqual({
      scopes: ['slow-user'],
      physicalCount: 1,
      timedOutScopes: ['slow-user'],
    })
    expect(() => reserveChatbotRequest('slow-user')).toThrow(ChatbotRequestTimeoutError)

    physical.resolve()
    await lease.physicalCompletion
    expect(getChatbotAdmissionStateForTests().physicalCount).toBe(0)
  })

  it('consumer abort detaches logical work without releasing capacity early', async () => {
    const physical = deferred()
    const lease = reserveChatbotRequest('disconnecting-user')
    let ownedSignal: AbortSignal | undefined
    void lease.start(async signal => {
      ownedSignal = signal
      await physical.promise
    })
    await Promise.resolve()

    const logicalResult = lease.completion.catch(error => error)
    lease.abortCaller(new DOMException('reader cancelled', 'AbortError'))

    expect(await logicalResult).toBeInstanceOf(ChatbotRequestAbortedError)
    expect(ownedSignal?.aborted).toBe(true)
    expect(getChatbotAdmissionStateForTests().physicalCount).toBe(1)
    expect(() => reserveChatbotRequest('disconnecting-user')).toThrow(ChatbotScopeBusyError)

    physical.resolve()
    await lease.physicalCompletion
    expect(getChatbotAdmissionStateForTests().physicalCount).toBe(0)
  })

  it('late stale work cannot delete a newer exact-scope lease after reset', async () => {
    const oldPhysical = deferred()
    const oldLease = reserveChatbotRequest('same-user')
    void oldLease.start(async () => {
      await oldPhysical.promise
    })
    await Promise.resolve()

    resetChatbotAdmissionForTests()
    const newPhysical = deferred()
    const newLease = reserveChatbotRequest('same-user')
    void newLease.start(async () => {
      await newPhysical.promise
    })
    await Promise.resolve()

    oldPhysical.resolve()
    await oldLease.physicalCompletion
    expect(getChatbotAdmissionStateForTests()).toMatchObject({
      scopes: ['same-user'],
      physicalCount: 1,
    })

    newPhysical.resolve()
    await newLease.physicalCompletion
    expect(getChatbotAdmissionStateForTests().physicalCount).toBe(0)
  })

  it('cleans the exact scope and physical slot after normal settlement', async () => {
    const lease = reserveChatbotRequest('user-1')
    await lease.start(async signal => {
      expect(signal.aborted).toBe(false)
    })

    await expect(lease.completion).resolves.toBeUndefined()
    expect(getChatbotAdmissionStateForTests()).toEqual({
      scopes: [],
      physicalCount: 0,
      timedOutScopes: [],
    })
  })

  it('does not report physical completion before the loader settles', async () => {
    const physical = deferred()
    const lease = reserveChatbotRequest('user-1')
    let completed = false
    void lease.physicalCompletion.then(() => {
      completed = true
    })
    void lease.start(async () => {
      await physical.promise
    })
    await Promise.resolve()

    expect(completed).toBe(false)
    physical.resolve()
    await lease.physicalCompletion
    expect(completed).toBe(true)
  })

  it('still aborts and settles when a timeout transport listener throws', async () => {
    vi.useFakeTimers()
    const physical = deferred()
    const lease = reserveChatbotRequest('user-1')
    let ownedSignal: AbortSignal | undefined
    lease.onTimeout(() => {
      throw new Error('closed transport')
    })
    void lease.start(async signal => {
      ownedSignal = signal
      await physical.promise
    })
    const logical = lease.completion.catch(error => error)

    await vi.advanceTimersByTimeAsync(CHATBOT_REQUEST_DEADLINE_MS)

    expect(await logical).toBeInstanceOf(ChatbotRequestTimeoutError)
    expect(ownedSignal?.aborted).toBe(true)
    expect(getChatbotAdmissionStateForTests().physicalCount).toBe(1)

    physical.resolve()
    await lease.physicalCompletion
  })
})
