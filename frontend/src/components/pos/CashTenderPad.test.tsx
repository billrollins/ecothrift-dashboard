import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import CashTenderPad from './CashTenderPad';
import type { CashCount } from '../../utils/cashCounts';

const FULL: CashCount = { twenties: 5, tens: 5, fives: 5, ones: 20, quarters: 20, dimes: 20, nickels: 20, pennies: 20 };

function Harness({ due = 3740, contents = FULL, split = false, lang }: { due?: number; contents?: CashCount; split?: boolean; lang?: string }) {
  const [received, setReceived] = useState<CashCount>({});
  return (
    <>
      <CashTenderPad received={received} onChange={setReceived} dueCents={due} drawerContents={contents} split={split} lang={lang} />
      <div data-testid="state">{JSON.stringify(received)}</div>
    </>
  );
}

describe('CashTenderPad (2026-10-21; big tiles 2026-11-02)', () => {
  it('taps add bills and Dash says what to give back from the drawer, as pieces', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByTestId('cash-twenties'));
    expect(screen.getByTestId('cash-summary')).toHaveTextContent('$17.40 more');
    await user.click(screen.getByTestId('cash-twenties'));
    expect(screen.getByTestId('state')).toHaveTextContent('{"twenties":2}');
    expect(screen.getByTestId('cash-summary')).toHaveTextContent('Received $40.00');
    expect(screen.getByTestId('give-back')).toHaveTextContent('Give back $2.60');
    expect(screen.getByTestId('give-back-pieces')).toHaveTextContent('2 × $12 × 25¢1 × 10¢');
  });

  it('each tile wears its note colour; Oddballs opens a pop-up, counts toward received and never comes back as change', async () => {
    const user = userEvent.setup();
    render(<Harness due={350} />);
    expect(screen.getByTestId('cash-twenties')).toHaveStyle({ borderColor: '#2e7d32' });
    expect(screen.getByTestId('cash-hundreds')).toHaveStyle({ borderColor: '#1565c0' });
    const odd = screen.getByTestId('cash-oddballs');
    expect(odd).toHaveTextContent(/^Oddballs$/);
    await user.click(odd);
    const pop = await screen.findByTestId('cash-oddballs-pop');
    expect(pop).toHaveTextContent('Never given as change');
    await user.click(screen.getByTestId('cash-twos'));
    await user.click(screen.getByTestId('cash-twos'));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('cash-oddballs')).toHaveTextContent('Oddballs × 2');
    expect(screen.getByTestId('state')).toHaveTextContent('{"twos":2}');
    expect(screen.getByTestId('cash-summary')).toHaveTextContent('Received $4.00');
    expect(screen.getByTestId('give-back-pieces')).toHaveTextContent('2 × 25¢');
    expect(screen.getByTestId('give-back-pieces')).not.toHaveTextContent('$2');
  });

  it('a wrong bill is one tap from a fix: the minus edge takes one of it off; Undo and Clear', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByTestId('cash-minus-twenties')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('cash-tens'));
    await user.click(screen.getByTestId('cash-twenties'));
    await user.click(screen.getByTestId('cash-minus-twenties'));
    expect(screen.getByTestId('state')).toHaveTextContent('{"tens":1}');
    expect(screen.queryByTestId('cash-minus-twenties')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByTestId('state')).toHaveTextContent('{"tens":1,"twenties":1}');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByTestId('state')).toHaveTextContent('{}');
  });

  it('keys work while the pad has focus: E adds a $20, Shift+E takes it back, Backspace undoes; right-click takes one', () => {
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
    fireEvent.contextMenu(screen.getByTestId('cash-quarters'));
    expect(screen.getByTestId('state')).toHaveTextContent('{"twenties":2}');
  });

  it('a drawer without the coins says so; a split part shows no change; Spanish', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness due={1995} contents={{ twenties: 3 }} />);
    await user.click(screen.getByTestId('cash-twenties'));
    expect(screen.getByTestId('give-back-pieces')).toHaveTextContent('1 × 5¢');
    expect(screen.getByText(/The drawer may not have these/)).toBeInTheDocument();
    unmount();
    const second = render(<Harness due={10000} split />);
    await user.click(screen.getByTestId('cash-twenties'));
    expect(screen.queryByTestId('give-back')).not.toBeInTheDocument();
    second.unmount();
    render(<Harness due={500} lang="es" />);
    await user.click(screen.getByTestId('cash-tens'));
    expect(screen.getByTestId('give-back')).toHaveTextContent('Dar cambio $5.00');
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeInTheDocument();
  });
});
