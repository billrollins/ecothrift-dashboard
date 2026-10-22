import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import CashTenderPad from './CashTenderPad';
import type { CashCount } from '../../utils/cashCounts';

const FULL: CashCount = { twenties: 5, tens: 5, fives: 5, ones: 20, quarters: 20, dimes: 20, nickels: 20, pennies: 20 };

function Harness({ due = 3740, contents = FULL, split = false }: { due?: number; contents?: CashCount; split?: boolean }) {
  const [received, setReceived] = useState<CashCount>({});
  return (
    <>
      <CashTenderPad received={received} onChange={setReceived} dueCents={due} drawerContents={contents} split={split} />
      <div data-testid="state">{JSON.stringify(received)}</div>
    </>
  );
}

describe('CashTenderPad (2026-10-21, cash by denomination)', () => {
  it('taps add bills and Dash says what to give back from the drawer', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('cash-twenties'));
    expect(screen.getByTestId('cash-summary')).toHaveTextContent('$17.40 more needed');
    await user.click(screen.getByTestId('cash-twenties'));
    expect(screen.getByTestId('state')).toHaveTextContent('{"twenties":2}');
    expect(screen.getByTestId('cash-summary')).toHaveTextContent('Received $40.00');
    expect(screen.getByTestId('give-back')).toHaveTextContent('Change $2.60: give back 2 × $1, 2 × quarters, 1 × dimes');
  });

  it('keys work while the pad has focus: E adds a $20, Shift+E takes it back, Backspace undoes', () => {
    render(<Harness />);
    const pad = screen.getByTestId('cash-tender-pad');
    pad.focus();
    fireEvent.keyDown(pad, { key: 'e' });
    fireEvent.keyDown(pad, { key: 'e' });
    fireEvent.keyDown(pad, { key: 'A' });
    expect(screen.getByTestId('state')).toHaveTextContent('{"twenties":2,"quarters":1}');
    fireEvent.keyDown(pad, { key: 'E', shiftKey: true });
    expect(screen.getByTestId('state')).toHaveTextContent('{"twenties":1,"quarters":1}');
    fireEvent.keyDown(pad, { key: 'Backspace' });
    expect(screen.getByTestId('state')).toHaveTextContent('{"twenties":2,"quarters":1}');
  });

  it('a right-click takes one back; Exact cash fills the amount due; Clear empties it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Exact cash' }));
    expect(screen.getByTestId('state')).toHaveTextContent('{"twenties":1,"tens":1,"fives":1,"ones":2,"quarters":1,"dimes":1,"nickels":1}');
    expect(screen.queryByTestId('give-back')).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByTestId('cash-twenties'));
    expect(screen.getByTestId('state')).not.toHaveTextContent('twenties');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('state')).toHaveTextContent('{}');
  });

  it('a drawer without the coins says so; a split works out no change', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness due={1995} contents={{ twenties: 3 }} />);
    await user.click(screen.getByTestId('cash-twenties'));
    expect(screen.getByTestId('give-back')).toHaveTextContent('give back 1 × nickels');
    expect(screen.getByText(/The drawer may not have these/)).toBeInTheDocument();
    unmount();
    render(<Harness due={10000} split />);
    await user.click(screen.getByTestId('cash-twenties'));
    expect(screen.queryByTestId('give-back')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exact cash' })).not.toBeInTheDocument();
  });
});
