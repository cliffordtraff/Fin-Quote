import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'app/actions/account-settings.ts'),
  'utf8',
)

describe('account settings session boundary', () => {
  it('never loads, refreshes, updates, or removes an SSR cookie session', () => {
    expect(source).toContain("from '@/lib/supabase/stateless-user'")
    expect(source).toContain('client.auth.getUser(accessToken)')
    expect(source).toContain("client.auth.admin.signOut(parsed.accessToken, 'local')")
    expect(source).not.toContain("from '@/lib/supabase/server'")
    expect(source).not.toContain('.auth.updateUser(')
    expect(source).not.toContain('.auth.signOut(')
  })
})
