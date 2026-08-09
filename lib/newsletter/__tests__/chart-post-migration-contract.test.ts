import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260809100000_durable_newsletter_chart_post_admission.sql',
)
const PGTAP_PATH = resolve(
  process.cwd(),
  'supabase/tests/newsletter_chart_post_admission.sql',
)

const migration = readFileSync(MIGRATION_PATH, 'utf8')
const pgTap = readFileSync(PGTAP_PATH, 'utf8')

function functionBody(name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = migration.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${escapedName}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`,
  ))
  if (!match?.[1]) throw new Error(`Missing migration function: ${name}`)
  return match[1]
}

describe('durable newsletter chart admission migration contract', () => {
  it('keeps one balanced transactional migration with three complete RPC bodies', () => {
    expect(migration.match(/\$\$/g)).toHaveLength(6)
    expect(migration).toMatch(/\bBEGIN;/)
    expect(migration.trimEnd()).toMatch(/COMMIT;$/)
    expect(functionBody('acquire_newsletter_chart_post')).toContain('END;')
    expect(functionBody('complete_newsletter_chart_post')).toContain('END;')
    expect(functionBody('fail_newsletter_chart_post')).toContain('END;')

    // Regression for a duplicate bare `10;` that made the migration invalid.
    expect(migration).not.toMatch(/^\s*10;\s*\n\s*10;/m)
    expect(migration.match(/^\s+10;$/gm)).toHaveLength(3)
  })

  it('fixes the lease at 180 seconds and refreshes time after every global lock wait', () => {
    const acquire = functionBody('acquire_newsletter_chart_post')
    expect(acquire).toMatch(
      /lease_duration integer := greatest\(\s*180,\s*least\(coalesce\(/,
    )
    expect(migration).not.toContain('pg_catalog.coalesce')
    for (const name of [
      'acquire_newsletter_chart_post',
      'complete_newsletter_chart_post',
      'fail_newsletter_chart_post',
    ]) {
      const body = functionBody(name)
      const lockIndex = body.indexOf('PERFORM pg_catalog.pg_advisory_xact_lock')
      const refreshedClockIndex = body.indexOf(
        'now_at := pg_catalog.clock_timestamp();',
        lockIndex,
      )
      expect(lockIndex).toBeGreaterThanOrEqual(0)
      expect(refreshedClockIndex).toBeGreaterThan(lockIndex)
    }
  })

  it('retains the locked service-role-only and rollback-only database boundaries', () => {
    expect(migration.match(/SECURITY DEFINER/g)).toHaveLength(3)
    expect(migration.match(/SET search_path = ''/g)).toHaveLength(3)
    expect(migration).toContain(
      'REFERENCES auth.users(id) ON DELETE CASCADE',
    )
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.acquire_newsletter_chart_post',
    )
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.complete_newsletter_chart_post',
    )
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.fail_newsletter_chart_post',
    )
    expect(pgTap.trimEnd()).toMatch(/ROLLBACK;$/)
    expect(pgTap).not.toMatch(/\b(?:reset|db push|migration up)\b/i)
  })
})
