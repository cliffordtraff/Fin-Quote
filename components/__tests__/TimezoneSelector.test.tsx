import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TimezoneSelector from '@/components/TimezoneSelector'

const setTimezone = vi.fn()
const resetToAutoDetect = vi.fn()

vi.mock('@/lib/timezone-context', () => ({
  TIMEZONE_OPTIONS: [
    { value: 'America/New_York', label: 'Eastern (ET)', offset: 'UTC-5/-4' },
    { value: 'America/Los_Angeles', label: 'Pacific (PT)', offset: 'UTC-8/-7' },
  ],
  getTimezoneAbbr: () => 'ET',
  useTimezone: () => ({
    timezone: 'America/New_York',
    setTimezone,
    isAutoDetected: false,
    resetToAutoDetect,
  }),
}))

describe('TimezoneSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes independently tabbable pressed buttons without radio semantics', () => {
    render(<TimezoneSelector />)

    fireEvent.click(screen.getByRole('button', { name: /change timezone/i }))

    const group = screen.getByRole('group', { name: 'Timezone' })
    const eastern = within(group).getByRole('button', { name: /Eastern/ })
    const pacific = within(group).getByRole('button', { name: /Pacific/ })
    expect(group).toContainElement(eastern)
    expect(eastern).toHaveAttribute('aria-pressed', 'true')
    expect(pacific).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()

    fireEvent.click(pacific)
    expect(setTimezone).toHaveBeenCalledWith('America/Los_Angeles')
    expect(screen.getByRole('button', { name: /change timezone/i })).toHaveFocus()
  })

  it('uses the context auto-detect reset instead of persisting a manual zone', () => {
    render(<TimezoneSelector />)

    fireEvent.click(screen.getByRole('button', { name: /change timezone/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Auto-detect' }))

    expect(resetToAutoDetect).toHaveBeenCalledOnce()
    expect(setTimezone).not.toHaveBeenCalled()
  })
})
