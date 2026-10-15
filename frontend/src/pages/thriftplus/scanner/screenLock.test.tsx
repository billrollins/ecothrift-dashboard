import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SidewaysGotIt, SidewaysScanPill, TurnUprightScreen } from './Sideways';
import { isSidewaysAngle } from './screenLock';

describe('a phone held sideways (owner 2026-10-15, APP D16 v2)', () => {
  it('is sideways at 90 and 270 degrees, on phones only', () => {
    expect(isSidewaysAngle(0, true)).toBe(false);
    expect(isSidewaysAngle(180, true)).toBe(false);
    expect(isSidewaysAngle(90, true)).toBe(true);
    expect(isSidewaysAngle(270, true)).toBe(true);
    expect(isSidewaysAngle(-90, true)).toBe(true); // older iPhones say -90
    expect(isSidewaysAngle(90, false)).toBe(false); // tablets and computers are left alone
  });

  it('asks to turn the phone upright, and offers the lock only where the browser can lock', async () => {
    const toggle = vi.fn();
    const { rerender } = render(<TurnUprightScreen lock={null} />);
    expect(screen.getByText('Turn your phone upright')).toBeInTheDocument();
    expect(screen.queryByTestId('lock-upright')).not.toBeInTheDocument();
    rerender(<TurnUprightScreen lock={{ locked: false, toggle }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Lock the screen upright' }));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('keeps the camera scanning with a note on top, and answers a read code with "Got it!"', () => {
    render(<SidewaysScanPill lock={null} />);
    expect(screen.getByText('Turn your phone upright for the full app')).toBeInTheDocument();
    render(<SidewaysGotIt />);
    expect(screen.getByText('Got it!')).toBeInTheDocument();
    expect(screen.getByText('Turn your phone upright to see it.')).toBeInTheDocument();
  });

  it('shows a locked state that unlocks on a tap', () => {
    render(<TurnUprightScreen lock={{ locked: true, toggle: () => undefined }} />);
    expect(screen.getByRole('button', { name: 'Screen locked upright. Tap to let it turn again' })).toHaveAttribute('aria-pressed', 'true');
  });
});
