import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('account watchlist stateless-auth source boundary', () => {
  it('keeps the route off the mutable SSR cookie client', () => {
    const route = source('app/api/watchlist/route.ts')
    const statelessClient = source('lib/supabase/stateless-user.ts')

    expect(route).toContain("from '@/lib/supabase/stateless-user'")
    expect(route).toContain('client.auth.getUser(accessToken)')
    expect(route).not.toContain("from '@/lib/supabase/server'")
    expect(route).not.toContain('cookies(')
    expect(route).not.toContain('Set-Cookie')
    expect(route).not.toContain('safeErrorMessage')
    expect(route).not.toMatch(/\.auth\.getUser\(\s*\)/)
    expect(statelessClient).toMatch(/^import 'server-only'/)
    expect(statelessClient).toContain('autoRefreshToken: false')
    expect(statelessClient).toContain('detectSessionInUrl: false')
    expect(statelessClient).toContain('persistSession: false')
    expect(statelessClient).toContain('Authorization: `Bearer ${accessToken}`')
    expect(statelessClient).not.toContain("from 'next/headers'")
    expect(statelessClient).not.toContain('cookies(')
  })

  it('omits cookies on browser requests and keeps bearer tokens out of persistence', () => {
    const hook = source('components/useAccountWatchlist.ts')
    const cache = source('lib/dashboard/account-watchlist-client.ts')
    const commandContract = source('lib/dashboard/watchlist-contract.ts')

    expect(hook.match(/credentials: 'omit'/g)).toHaveLength(2)
    expect(hook).not.toContain("credentials: 'same-origin'")
    expect(cache).not.toMatch(/accessToken|authorization|bearer/i)
    expect(commandContract).not.toMatch(/accessToken|authorization|bearer/i)
  })
})
