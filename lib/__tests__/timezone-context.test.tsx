import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { TimezoneProvider, useTimezone } from '@/lib/timezone-context'

function TimezoneProbe() {
  const { timezone, isAutoDetected, resetToAutoDetect } = useTimezone()
  return (
    <>
      <span data-testid="timezone">{timezone}</span>
      <span data-testid="mode">{isAutoDetected ? 'auto' : 'manual'}</span>
      <button type="button" onClick={resetToAutoDetect}>Reset automatically</button>
    </>
  )
}

describe('TimezoneProvider', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('clears a saved preference and restores auto-detected state immediately', async () => {
    localStorage.setItem('user-timezone-preference', 'America/Los_Angeles')
    render(
      <TimezoneProvider>
        <TimezoneProbe />
      </TimezoneProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('manual'))
    expect(screen.getByTestId('timezone')).toHaveTextContent('America/Los_Angeles')

    fireEvent.click(screen.getByRole('button', { name: 'Reset automatically' }))

    expect(screen.getByTestId('mode')).toHaveTextContent('auto')
    expect(localStorage.getItem('user-timezone-preference')).toBeNull()
  })
})
