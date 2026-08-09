'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useCurrentUser } from '@/components/CurrentUserProvider'
import {
  ACCOUNT_WATCHLIST_CACHE_KEY,
  createWatchlistIdempotencyKey,
  fingerprintLocalWatchlist,
  parseAccountWatchlistReadResponse,
  parseAccountWatchlistSyncResponse,
  readCachedAccountWatchlist,
  writeCachedAccountWatchlist,
  type CachedAccountWatchlist,
} from '@/lib/dashboard/account-watchlist-client'
import {
  normalizeWatchlistSymbols,
  type AccountWatchlistSnapshot,
  type AccountWatchlistSyncCommand,
} from '@/lib/dashboard/watchlist-contract'
import {
  ACCOUNT_WATCHLIST_EXPECTED_USER_HEADER,
  isAccountWatchlistUserId,
} from '@/lib/dashboard/watchlist-http-contract'
import { isSupabaseAccessToken } from '@/lib/supabase/access-token'

export type AccountWatchlistStatus =
  | 'local'
  | 'loading'
  | 'ready'
  | 'saving'
  | 'conflict'
  | 'uncertain'
  | 'unavailable'

export interface UseAccountWatchlistOptions {
  localSymbols: string[] | null
  localLoaded: boolean
  onLocalSymbolsChange: (symbols: string[]) => void
}

export interface UseAccountWatchlistResult {
  symbols: string[] | null
  source: 'local' | 'account'
  status: AccountWatchlistStatus
  message: string | null
  cacheAvailable: boolean
  canEdit: boolean
  canRetry: boolean
  setSymbols: (symbols: string[]) => void
  retry: () => void
}

interface AccountControllerBinding {
  /** Opaque render/controller epoch. Deliberately contains no bearer token. */
  userId: string
}

interface AccountControllerState {
  binding: AccountControllerBinding | null
  snapshot: AccountWatchlistSnapshot | null
  status: Exclude<AccountWatchlistStatus, 'local'>
  message: string | null
  cacheAvailable: boolean
}

interface LocalWatchlistInput {
  loaded: boolean
  symbols: string[] | null
}

interface ControllerOptions {
  binding: AccountControllerBinding
  accessToken: string
  storage: Storage | null
  initialEntry: CachedAccountWatchlist | null
  physicalLane: AccountWatchlistPhysicalLane
  getLocal: () => LocalWatchlistInput
  isCurrent: () => boolean
  publish: (state: AccountControllerState) => void
  reauthenticate: () => void
}

type CommandOutcome =
  | 'ready'
  | 'conflict'
  | 'uncertain'
  | 'refresh'
  | 'reauthenticate'

const ACCOUNT_WATCHLIST_ENDPOINT = '/api/watchlist'
export const ACCOUNT_WATCHLIST_CLIENT_DEADLINE_MS = 8_000

function isAccountWatchlistEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_WATCHLIST_SYNC === 'true'
}

function accountStorage(): Storage | null {
  try {
    const storage = window.localStorage
    storage.getItem(ACCOUNT_WATCHLIST_CACHE_KEY)
    return storage
  } catch {
    return null
  }
}

function sameSymbols(
  left: string[] | null,
  right: string[] | null,
): boolean {
  if (left === null || right === null) return left === right
  return left.length === right.length
    && left.every((symbol, index) => symbol === right[index])
}

function isOlderOrInconsistent(
  current: AccountWatchlistSnapshot | null,
  incoming: AccountWatchlistSnapshot,
): boolean {
  if (!current) return false
  if (incoming.revision < current.revision) return true
  return incoming.revision === current.revision
    && !sameSymbols(incoming.symbols, current.symbols)
}

async function readJson(response: Response): Promise<unknown> {
  return response.json() as Promise<unknown>
}

class AccountWatchlistAuthenticationChangedError extends Error {
  constructor() {
    super('Account watchlist authentication changed')
    this.name = 'AccountWatchlistAuthenticationChangedError'
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function requiresAuthenticationRefresh(
  response: Response,
  body: unknown,
): boolean {
  if (response.status === 401) return true
  return response.status === 409
    && isPlainRecord(body)
    && body.code === 'WATCHLIST_PRINCIPAL_MISMATCH'
}

/**
 * One hook instance owns one physical lane for its whole lifetime. Controller
 * generations come and go as auth changes, but an abort-ignoring request keeps
 * this lane occupied until it really settles. That bounds browser work to one
 * physical account request without allowing a stale user to publish results.
 */
class AccountWatchlistPhysicalLane {
  private tail: Promise<void> = Promise.resolve()

  enqueue(task: () => Promise<void>): Promise<void> {
    const physical = this.tail.then(task)
    this.tail = physical.then(
      () => undefined,
      () => undefined,
    )
    return physical
  }
}

class AccountWatchlistController {
  private disposed = false
  private activeController: AbortController | null = null
  private queue: Promise<void> = Promise.resolve()
  private refreshQueued = false
  private mergeQueued = false
  private mutationQueued = false
  private pendingGeneration = 0
  private entry: CachedAccountWatchlist | null
  private state: AccountControllerState

  constructor(private readonly options: ControllerOptions) {
    this.entry = options.initialEntry
    this.state = {
      binding: options.binding,
      snapshot: this.entry?.snapshot ?? null,
      status: 'loading',
      message: null,
      cacheAvailable: options.storage !== null,
    }
    this.publish(this.state)
  }

  start(): void {
    this.requestRefresh()
  }

  isBoundTo(binding: AccountControllerBinding | null): boolean {
    return binding !== null
      && this.options.binding === binding
      && this.isActive()
  }

  dispose(): void {
    this.disposed = true
    this.activeController?.abort(new DOMException('Account changed.', 'AbortError'))
  }

  change(symbols: string[]): void {
    if (!this.isActive() || this.state.status !== 'ready' || !this.state.snapshot) return
    const canonical = normalizeWatchlistSymbols(symbols)
    if (sameSymbols(canonical, this.state.snapshot.symbols)) return

    const command: AccountWatchlistSyncCommand = {
      mode: 'replace',
      symbols: canonical,
      expectedRevision: this.state.snapshot.revision,
      idempotencyKey: createWatchlistIdempotencyKey(),
    }
    this.mutationQueued = true
    this.publish({ ...this.state, status: 'saving', message: 'Saving account watchlist…' })
    this.enqueue(async () => {
      try {
        const outcome = await this.sendCommand(command)
        if (outcome === 'refresh') {
          this.mutationQueued = false
          await this.readAuthoritative()
        }
      } finally {
        this.mutationQueued = false
      }
    })
  }

  retry(): void {
    if (!this.isActive()) return
    this.requestRefresh()
  }

  localChanged(): void {
    if (
      !this.isActive()
      || this.mergeQueued
      || this.state.status !== 'ready'
      || !this.state.snapshot
    ) return
    this.mergeQueued = true
    this.enqueue(async () => {
      this.mergeQueued = false
      await this.mergeLocalOnce()
    })
  }

  refreshFromCache(): void {
    if (!this.isActive()) return
    const storage = this.options.storage
    const cached = storage
      ? readCachedAccountWatchlist(storage, this.options.binding.userId)
      : null

    // A pending receipt written by another tab is more important than a read.
    // Never replace this tab's own in-flight receipt with a different command.
    if (cached?.pendingCommand && !this.entry?.pendingCommand) {
      this.replaceEntry(cached)
    } else if (
      cached
      && !this.entry?.pendingCommand
      && (!this.entry || cached.snapshot.revision > this.entry.snapshot.revision)
    ) {
      this.replaceEntry(cached)
    }
    this.requestRefresh()
  }

  private publish(next: AccountControllerState): void {
    if (!this.isActive()) return
    this.state = next
    this.options.publish(next)
  }

  private isActive(): boolean {
    return !this.disposed && this.options.isCurrent()
  }

  private enqueue(task: () => Promise<void>): void {
    const run = async () => {
      if (!this.isActive()) return
      await task()
    }
    this.queue = this.queue.then(run, run).catch(() => undefined)
  }

  private requestRefresh(): void {
    if (!this.isActive() || this.refreshQueued) return
    this.refreshQueued = true
    this.enqueue(async () => {
      this.refreshQueued = false
      await this.reconcile()
    })
  }

  private withSignal<T>(
    task: (signal: AbortSignal) => Promise<T>,
    onStart: () => void,
  ): Promise<T> {
    let logicalSettled = false
    let resolveLogical!: (value: T) => void
    let rejectLogical!: (reason?: unknown) => void
    const logical = new Promise<T>((resolve, reject) => {
      resolveLogical = resolve
      rejectLogical = reject
    })
    const settleLogical = (
      outcome: { value: T } | { error: unknown },
    ) => {
      if (logicalSettled) return
      logicalSettled = true
      if ('value' in outcome) resolveLogical(outcome.value)
      else rejectLogical(outcome.error)
    }

    const physical = this.options.physicalLane.enqueue(async () => {
      if (!this.isActive()) {
        settleLogical({
          error: new DOMException('Account changed.', 'AbortError'),
        })
        return
      }

      const controller = new AbortController()
      this.activeController = controller
      onStart()
      const deadline = window.setTimeout(() => {
        controller.abort(new DOMException(
          'Account watchlist request exceeded its deadline.',
          'TimeoutError',
        ))
        settleLogical({ error: controller.signal.reason })
      }, ACCOUNT_WATCHLIST_CLIENT_DEADLINE_MS)

      try {
        settleLogical({ value: await task(controller.signal) })
      } catch (error) {
        settleLogical({ error })
      } finally {
        window.clearTimeout(deadline)
        if (this.activeController === controller) this.activeController = null
      }
    })
    void physical.catch((error) => settleLogical({ error }))
    return logical
  }

  private replaceEntry(next: CachedAccountWatchlist): void {
    const previousKey = this.entry?.pendingCommand?.idempotencyKey ?? null
    const nextKey = next.pendingCommand?.idempotencyKey ?? null
    if (previousKey !== nextKey) this.pendingGeneration += 1
    this.entry = next
  }

  private persistEntry(next: CachedAccountWatchlist): void {
    this.replaceEntry(next)
    const storage = this.options.storage
    const persisted = storage
      ? writeCachedAccountWatchlist(storage, next)
      : false
    if (!persisted && this.state.cacheAvailable) {
      this.publish({ ...this.state, cacheAvailable: false })
    }
  }

  private currentEntry(
    snapshot: AccountWatchlistSnapshot,
    changes: Partial<CachedAccountWatchlist> = {},
  ): CachedAccountWatchlist {
    return {
      userId: this.options.binding.userId,
      snapshot,
      mergedLocalFingerprint: this.entry?.mergedLocalFingerprint ?? null,
      pendingCommand: this.entry?.pendingCommand ?? null,
      touchedAt: Date.now(),
      ...changes,
    }
  }

  private async reconcile(): Promise<void> {
    if (!this.isActive()) return
    if (this.entry?.pendingCommand) {
      const outcome = await this.sendCommand(this.entry.pendingCommand)
      if (outcome === 'refresh') await this.readAuthoritative()
      if (outcome !== 'ready' && outcome !== 'refresh') return
    } else {
      const read = await this.readAuthoritative()
      if (!read) return
    }
    await this.mergeLocalOnce()
  }

  private async readAuthoritative(): Promise<boolean> {
    const pendingGenerationAtInvocation = this.pendingGeneration
    try {
      const snapshot = await this.withSignal(async (signal) => {
        const response = await fetch(ACCOUNT_WATCHLIST_ENDPOINT, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'omit',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.options.accessToken}`,
            [ACCOUNT_WATCHLIST_EXPECTED_USER_HEADER]: this.options.binding.userId,
          },
          signal,
        })
        const body = await readJson(response)
        if (requiresAuthenticationRefresh(response, body)) {
          throw new AccountWatchlistAuthenticationChangedError()
        }
        if (!response.ok) {
          throw new Error(`Account watchlist read failed (${response.status})`)
        }
        return parseAccountWatchlistReadResponse(body)
      }, () => {
        this.publish({
          ...this.state,
          status: this.mutationQueued ? 'saving' : 'loading',
          message: this.mutationQueued
            ? 'Saving account watchlist…'
            : 'Loading account watchlist…',
        })
      })
      if (!this.isActive()) return false

      if (
        this.entry?.pendingCommand
        && this.pendingGeneration !== pendingGenerationAtInvocation
      ) {
        this.publish({
          ...this.state,
          snapshot: this.entry.snapshot,
          status: 'loading',
          message: 'Applying an account watchlist change from another tab…',
        })
        this.requestRefresh()
        return false
      }

      if (isOlderOrInconsistent(this.entry?.snapshot ?? null, snapshot)) {
        this.publish({
          ...this.state,
          status: 'unavailable',
          message: 'The server returned an older account watchlist. Retry to refresh it.',
        })
        return false
      }

      const nextEntry = this.currentEntry(snapshot, { pendingCommand: null })
      this.persistEntry(nextEntry)
      this.publish({
        binding: this.options.binding,
        snapshot,
        status: this.mutationQueued ? 'saving' : 'ready',
        message: this.mutationQueued ? 'Saving account watchlist…' : null,
        cacheAvailable: this.state.cacheAvailable,
      })
      return true
    } catch (error) {
      if (!this.isActive()) return false
      if (error instanceof AccountWatchlistAuthenticationChangedError) {
        this.publish({
          ...this.state,
          status: 'unavailable',
          message: 'Your account session changed. Rechecking sign-in…',
        })
        this.options.reauthenticate()
        return false
      }
      this.publish({
        ...this.state,
        status: 'unavailable',
        message: 'Account watchlist is unavailable. Your local watchlist was not changed.',
      })
      return false
    }
  }

  private async mergeLocalOnce(): Promise<void> {
    if (!this.isActive() || this.state.status !== 'ready' || !this.state.snapshot) return
    const local = this.options.getLocal()
    if (!local.loaded) return
    const symbols = normalizeWatchlistSymbols(local.symbols)
    if (symbols.length === 0) return

    const fingerprint = fingerprintLocalWatchlist(symbols)
    if (this.entry?.mergedLocalFingerprint === fingerprint) return

    const command: AccountWatchlistSyncCommand = {
      mode: 'merge',
      symbols,
      expectedRevision: this.state.snapshot.revision,
      idempotencyKey: createWatchlistIdempotencyKey(),
    }
    const outcome = await this.sendCommand(command, fingerprint)
    if (outcome === 'refresh') await this.readAuthoritative()
  }

  private async sendCommand(
    command: AccountWatchlistSyncCommand,
    mergeFingerprint = command.mode === 'merge'
      ? fingerprintLocalWatchlist(command.symbols)
      : null,
  ): Promise<CommandOutcome> {
    const snapshot = this.entry?.snapshot ?? this.state.snapshot
    if (!snapshot) return 'uncertain'

    // The receipt reaches durable browser storage before the request leaves.
    // If the response is lost, retrying uses this exact key and command body.
    this.persistEntry(this.currentEntry(snapshot, { pendingCommand: command }))
    try {
      const { response, result } = await this.withSignal(async (signal) => {
        const response = await fetch(ACCOUNT_WATCHLIST_ENDPOINT, {
          method: 'PUT',
          cache: 'no-store',
          credentials: 'omit',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.options.accessToken}`,
            'Content-Type': 'application/json',
            [ACCOUNT_WATCHLIST_EXPECTED_USER_HEADER]: this.options.binding.userId,
          },
          body: JSON.stringify({
            expectedUserId: this.options.binding.userId,
            ...command,
          }),
          signal,
        })
        const body = await readJson(response)
        if (requiresAuthenticationRefresh(response, body)) {
          throw new AccountWatchlistAuthenticationChangedError()
        }
        if (response.status !== 409 && !response.ok) {
          throw new Error(`Account watchlist update failed (${response.status})`)
        }
        return {
          response,
          result: parseAccountWatchlistSyncResponse(body),
        }
      }, () => {
        this.publish({
          ...this.state,
          status: 'saving',
          message: command.mode === 'merge'
            ? 'Merging this browser watchlist into your account…'
            : 'Saving account watchlist…',
        })
      })
      if (!this.isActive()) return 'uncertain'
      if (
        (response.status === 409) !== (result.disposition === 'conflict')
      ) {
        throw new Error('Account watchlist response status did not match its result')
      }

      const current = this.entry?.snapshot ?? this.state.snapshot
      if (isOlderOrInconsistent(current, result.watchlist)) {
        // A replay receipt can legitimately describe a revision that another
        // tab has since advanced. Clear the proven receipt, keep the newer
        // local snapshot, and get a fresh authoritative read.
        this.persistEntry(this.currentEntry(current ?? snapshot, {
          pendingCommand: null,
          mergedLocalFingerprint: result.disposition === 'conflict'
            ? this.entry?.mergedLocalFingerprint ?? null
            : mergeFingerprint ?? this.entry?.mergedLocalFingerprint ?? null,
        }))
        return 'refresh'
      }

      if (result.disposition === 'conflict') {
        this.persistEntry(this.currentEntry(result.watchlist, {
          pendingCommand: null,
          mergedLocalFingerprint: this.entry?.mergedLocalFingerprint ?? null,
        }))
        this.publish({
          binding: this.options.binding,
          snapshot: result.watchlist,
          status: 'conflict',
          message: 'This watchlist changed elsewhere. The latest account version is shown.',
          cacheAvailable: this.state.cacheAvailable,
        })
        return 'conflict'
      }

      this.persistEntry(this.currentEntry(result.watchlist, {
        pendingCommand: null,
        mergedLocalFingerprint: mergeFingerprint
          ?? this.entry?.mergedLocalFingerprint
          ?? null,
      }))

      this.publish({
        binding: this.options.binding,
        snapshot: result.watchlist,
        status: 'ready',
        message: result.droppedSymbols.length > 0
          ? `${result.droppedSymbols.length} local symbol${result.droppedSymbols.length === 1 ? '' : 's'} did not fit in the account watchlist.`
          : null,
        cacheAvailable: this.state.cacheAvailable,
      })
      return 'ready'
    } catch (error) {
      if (!this.isActive()) return 'uncertain'
      if (error instanceof AccountWatchlistAuthenticationChangedError) {
        this.publish({
          ...this.state,
          status: 'unavailable',
          message: 'Your account session changed. Rechecking sign-in…',
        })
        this.options.reauthenticate()
        return 'reauthenticate'
      }
      this.publish({
        ...this.state,
        status: 'uncertain',
        message: 'The save may have completed. Retry safely to check the same change.',
      })
      return 'uncertain'
    }
  }
}

export function useAccountWatchlist({
  localSymbols,
  localLoaded,
  onLocalSymbolsChange,
}: UseAccountWatchlistOptions): UseAccountWatchlistResult {
  const {
    accessToken,
    user,
    loading: authLoading,
    retry: retryAuth,
    status: authStatus,
  } = useCurrentUser()
  const enabled = isAccountWatchlistEnabled()
  const resolvedAuthStatus = authStatus
    ?? (authLoading ? 'loading' : user ? 'authenticated' : 'signed_out')
  const authUnavailable = enabled && (
    resolvedAuthStatus === 'unavailable'
    || (
      resolvedAuthStatus === 'authenticated'
      && (
        !isAccountWatchlistUserId(user?.id)
        || !isSupabaseAccessToken(accessToken)
      )
    )
  )
  const authenticatedAccessToken = enabled
    && resolvedAuthStatus === 'authenticated'
    && isSupabaseAccessToken(accessToken)
    ? accessToken
    : null
  const userId = enabled && resolvedAuthStatus === 'authenticated'
    && authenticatedAccessToken
    && isAccountWatchlistUserId(user?.id)
    ? user.id
    : null
  const accountBinding = useMemo<AccountControllerBinding | null>(
    () => userId && authenticatedAccessToken ? { userId } : null,
    [authenticatedAccessToken, userId],
  )
  const currentBindingRef = useRef(accountBinding)
  useLayoutEffect(() => {
    currentBindingRef.current = accountBinding
  }, [accountBinding])
  const controllerRef = useRef<AccountWatchlistController | null>(null)
  const [physicalLane] = useState(() => new AccountWatchlistPhysicalLane())
  const localRef = useRef<LocalWatchlistInput>({
    loaded: localLoaded,
    symbols: localSymbols,
  })
  localRef.current = { loaded: localLoaded, symbols: localSymbols }

  const [accountState, setAccountState] = useState<AccountControllerState>({
    binding: null,
    snapshot: null,
    status: 'loading',
    message: null,
    cacheAvailable: true,
  })

  useEffect(() => {
    controllerRef.current?.dispose()
    controllerRef.current = null

    if (
      !enabled
      || authLoading
      || authUnavailable
      || !accountBinding
      || !authenticatedAccessToken
    ) return
    const storage = accountStorage()
    const controller = new AccountWatchlistController({
      binding: accountBinding,
      accessToken: authenticatedAccessToken,
      storage,
      initialEntry: storage
        ? readCachedAccountWatchlist(storage, accountBinding.userId)
        : null,
      physicalLane,
      getLocal: () => localRef.current,
      isCurrent: () => currentBindingRef.current === accountBinding,
      publish: setAccountState,
      reauthenticate: retryAuth,
    })
    controllerRef.current = controller
    controller.start()

    return () => {
      if (controllerRef.current === controller) controllerRef.current = null
      controller.dispose()
    }
  }, [
    authLoading,
    accountBinding,
    authenticatedAccessToken,
    authUnavailable,
    enabled,
    physicalLane,
    retryAuth,
  ])

  const localFingerprint = useMemo(
    () => fingerprintLocalWatchlist(localSymbols),
    [localSymbols],
  )
  useEffect(() => {
    if (!localLoaded) return
    const controller = controllerRef.current
    if (controller?.isBoundTo(currentBindingRef.current)) {
      controller.localChanged()
    }
  }, [accountBinding, localFingerprint, localLoaded])

  useEffect(() => {
    if (!enabled || authLoading || authUnavailable || !accountBinding) return
    const currentController = () => {
      const controller = controllerRef.current
      return controller?.isBoundTo(currentBindingRef.current)
        ? controller
        : null
    }
    const onRefresh = () => currentController()?.retry()
    const onFocus = () => {
      if (document.visibilityState === 'visible') onRefresh()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACCOUNT_WATCHLIST_CACHE_KEY) return
      currentController()?.refreshFromCache()
    }
    window.addEventListener('online', onRefresh)
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('online', onRefresh)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [accountBinding, authLoading, authUnavailable, enabled])

  const setSymbols = useCallback((symbols: string[]) => {
    if (!enabled) {
      onLocalSymbolsChange(normalizeWatchlistSymbols(symbols))
      return
    }
    if (authLoading || authUnavailable) return
    if (!accountBinding) {
      onLocalSymbolsChange(normalizeWatchlistSymbols(symbols))
      return
    }
    const controller = controllerRef.current
    if (controller?.isBoundTo(accountBinding)) controller.change(symbols)
  }, [accountBinding, authLoading, authUnavailable, enabled, onLocalSymbolsChange])

  const retry = useCallback(() => {
    if (authUnavailable) {
      retryAuth()
      return
    }
    const controller = controllerRef.current
    if (controller?.isBoundTo(accountBinding)) controller.retry()
  }, [accountBinding, authUnavailable, retryAuth])

  if (!enabled || resolvedAuthStatus === 'signed_out') {
    return {
      symbols: localSymbols,
      source: 'local',
      status: 'local',
      message: null,
      cacheAvailable: true,
      canEdit: true,
      canRetry: false,
      setSymbols,
      retry,
    }
  }

  if (authLoading) {
    return {
      symbols: localSymbols,
      source: 'local',
      status: 'loading',
      message: 'Checking account watchlist…',
      cacheAvailable: true,
      canEdit: false,
      canRetry: false,
      setSymbols,
      retry,
    }
  }

  if (authUnavailable) {
    return {
      symbols: localSymbols,
      source: 'local',
      status: 'unavailable',
      message: 'Account status is temporarily unavailable. Retry before changing this watchlist.',
      cacheAvailable: true,
      canEdit: false,
      canRetry: true,
      setSymbols,
      retry,
    }
  }

  if (accountState.binding !== accountBinding) {
    return {
      symbols: null,
      source: 'account',
      status: 'loading',
      message: 'Loading account watchlist…',
      cacheAvailable: true,
      canEdit: false,
      canRetry: false,
      setSymbols,
      retry,
    }
  }

  const canRetry = accountState.status === 'conflict'
    || accountState.status === 'uncertain'
    || accountState.status === 'unavailable'

  return {
    symbols: accountState.snapshot?.symbols ?? null,
    source: 'account',
    status: accountState.status,
    message: accountState.message,
    cacheAvailable: accountState.cacheAvailable,
    canEdit: accountState.status === 'ready',
    canRetry,
    setSymbols,
    retry,
  }
}
