import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import DashboardFooter from '@/components/DashboardFooter'

describe('DashboardFooter', () => {
  it('renders the dashboard footer copy', () => {
    render(<DashboardFooter />)

    expect(screen.getByText(/The Intraday\. All rights reserved\./i)).toBeInTheDocument()
  })
})
