import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WorkspaceFooter from '@/components/WorkspaceFooter'

const mockUsePathname = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}))

describe('WorkspaceFooter', () => {
  it('shows on the fundamentals workspace route', () => {
    mockUsePathname.mockReturnValue('/workspace/fundamentals')

    render(<WorkspaceFooter />)

    expect(screen.getByText(/The Intraday\. All rights reserved\./i)).toBeInTheDocument()
  })

  it('hides on the chart workspace route', () => {
    mockUsePathname.mockReturnValue('/workspace/chart')

    const { container } = render(<WorkspaceFooter />)

    expect(container).toBeEmptyDOMElement()
  })
})
