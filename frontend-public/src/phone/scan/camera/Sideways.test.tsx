// Ported from frontend/src/pages/thriftplus/scanner/screenLock.test.tsx, its three screen cases (the first, the logic,
// is core/screenLock.test.ts), with the same words and assertions; plus the layers' own checks.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SidewaysGotIt, SidewaysScanPill, TurnUpright } from './index'

describe('a phone held sideways (owner 2026-10-15, APP D16 v2)', () => {
  it('asks to turn the phone upright, and offers the lock only where the browser can lock', async () => {
    const toggle = vi.fn()
    const { rerender } = render(<TurnUpright lock={null} />)
    expect(screen.getByText('Turn your phone upright')).toBeInTheDocument()
    expect(screen.getByText('The scanner works best held upright.')).toBeInTheDocument()
    expect(screen.queryByTestId('lock-upright')).not.toBeInTheDocument()
    rerender(<TurnUpright lock={{ locked: false, toggle }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Lock the screen upright' }))
    expect(toggle).toHaveBeenCalledOnce()
  })

  it('keeps the camera scanning with a note on top, and answers a read code with "Got it!"', () => {
    render(<SidewaysScanPill lock={null} />)
    expect(screen.getByText('Turn your phone upright for the full app')).toBeInTheDocument()
    render(<SidewaysGotIt />)
    expect(screen.getByText('Got it!')).toBeInTheDocument()
    expect(screen.getByText('Turn your phone upright to see it.')).toBeInTheDocument()
  })

  it('shows a locked state that unlocks on a tap', () => {
    render(<TurnUpright lock={{ locked: true, toggle: () => undefined }} />)
    expect(screen.getByRole('button', { name: 'Screen locked upright. Tap to let it turn again' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Locked upright')).toBeInTheDocument()
  })

  it('the sideways note offers the lock beside it where the browser can lock', async () => {
    const toggle = vi.fn()
    render(<SidewaysScanPill lock={{ locked: false, toggle }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Lock the screen upright' }))
    expect(toggle).toHaveBeenCalledOnce()
  })
})
