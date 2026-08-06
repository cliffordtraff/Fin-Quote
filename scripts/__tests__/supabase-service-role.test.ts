import { describe, expect, it } from 'vitest'

import { requireSupabaseServiceRoleCredentials } from '../lib/require-supabase-service-role'

describe('requireSupabaseServiceRoleCredentials', () => {
  it('returns the server-only credentials used by ingestion scripts', () => {
    expect(
      requireSupabaseServiceRoleCredentials({
        NEXT_PUBLIC_SUPABASE_URL: ' https://project.supabase.co ',
        SUPABASE_SERVICE_ROLE_KEY: ' service-secret ',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'browser-key',
      }),
    ).toEqual({
      url: 'https://project.supabase.co',
      serviceRoleKey: 'service-secret',
    })
  })

  it.each([
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'browser-key',
    },
    {
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: '   ',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'browser-key',
    },
    {
      SUPABASE_SERVICE_ROLE_KEY: 'service-secret',
    },
  ])('fails closed when service-role credentials are incomplete', (environment) => {
    expect(() =>
      requireSupabaseServiceRoleCredentials(environment),
    ).toThrow('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  })
})
