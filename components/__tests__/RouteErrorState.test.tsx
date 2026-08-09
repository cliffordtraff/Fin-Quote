import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RouteErrorState from '@/components/RouteErrorState'

describe('RouteErrorState', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows safe recovery copy and invokes the segment reset callback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reset = vi.fn()
    render(
      <RouteErrorState
        error={Object.assign(new Error('database password=secret'), {
          digest: 'safe-reference',
        })}
        reset={reset}
        title="Newsletter workspace could not finish loading"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Newsletter workspace could not finish loading',
    )
    expect(screen.getByRole('alert')).toHaveTextContent('safe-reference')
    expect(screen.getByRole('alert')).not.toHaveTextContent('password=secret')
    expect(screen.getByRole('link', { name: 'Return to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
