import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260809130000_account_watchlist_sync.sql',
)
const PGTAP_PATH = resolve(
  process.cwd(),
  'supabase/tests/account_watchlist_sync.sql',
)

const migration = readFileSync(MIGRATION_PATH, 'utf8')
const pgTap = readFileSync(PGTAP_PATH, 'utf8')

function functionDefinition(name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = migration.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${escapedName}\\([\\s\\S]*?\\$\\$;`,
  ))
  if (!match?.[0]) throw new Error(`Missing migration function: ${name}`)
  return match[0]
}

describe('account watchlist migration contract', () => {
  it('is one migration with complete owner-scoped functions and rollback-only pgTAP', () => {
    expect(migration).toMatch(/\bBEGIN;/)
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
    expect(migration.match(/CREATE OR REPLACE FUNCTION public\./g)).toHaveLength(4)
    expect(functionDefinition('read_primary_watchlist')).toContain('auth.uid()')
    expect(functionDefinition('sync_primary_watchlist')).toContain('auth.uid()')
    expect(pgTap.trimEnd()).toMatch(/ROLLBACK;$/)
    expect(pgTap).not.toMatch(/\b(?:db push|migration up|db reset)\b/i)
  })

  it('resolves replay before canonical initialization under a per-user lock', () => {
    const sync = functionDefinition('sync_primary_watchlist')
    const lockIndex = sync.indexOf('pg_advisory_xact_lock')
    const replayIndex = sync.indexOf('SELECT receipt.*')
    const initializationIndex = sync.indexOf(
      'account_watchlist_initialize_locked(owner_id)',
    )

    expect(lockIndex).toBeGreaterThanOrEqual(0)
    expect(replayIndex).toBeGreaterThan(lockIndex)
    expect(initializationIndex).toBeGreaterThan(replayIndex)
    expect(sync).toContain("'expectedRevision', p_expected_revision")
    expect(sync).toContain("'symbols', canonical_symbols")
    expect(sync).toContain("'mode', p_mode")
  })

  it('keeps import, capacity, and privilege boundaries explicit', () => {
    const initializer = functionDefinition(
      'account_watchlist_initialize_locked',
    )
    expect(initializer).toContain('ON CONFLICT (user_id) DO NOTHING')
    expect(initializer).toContain('item.ordinality <= 128')
    expect(initializer).toContain('owned_tab.user_id = p_owner_id')
    expect(migration).toContain('OFFSET 64')
    expect(migration).toContain('ON DELETE CASCADE')
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE public.watchlists',
    )
    expect(migration).toContain(
      'GRANT SELECT ON TABLE public.watchlists TO authenticated',
    )
    expect(migration).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[\s\S]{0,80}public\.watchlists\s+TO\s+authenticated/i,
    )
  })
})
