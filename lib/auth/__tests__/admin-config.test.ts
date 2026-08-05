import { afterEach, describe, expect, it } from 'vitest'
import {
  isAdminAllowlistConfigured,
  isAdminUserEmail,
} from '@/lib/auth/admin-config'

const originalAdminEmails = process.env.ADMIN_EMAILS

afterEach(() => {
  if (originalAdminEmails === undefined) {
    delete process.env.ADMIN_EMAILS
  } else {
    process.env.ADMIN_EMAILS = originalAdminEmails
  }
})

describe('admin allowlist', () => {
  it('fails closed when ADMIN_EMAILS is not configured', () => {
    delete process.env.ADMIN_EMAILS

    expect(isAdminAllowlistConfigured()).toBe(false)
    expect(isAdminUserEmail('anyone@example.com')).toBe(false)
  })

  it('matches configured addresses without case sensitivity', () => {
    process.env.ADMIN_EMAILS = 'owner@example.com, Editor@Example.com'

    expect(isAdminUserEmail('editor@example.com')).toBe(true)
    expect(isAdminUserEmail('reader@example.com')).toBe(false)
  })
})
