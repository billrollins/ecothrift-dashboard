import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CountWindow from './CountWindow';
import type { CountCheck } from '../../types/pos.types';

const CHECK: CountCheck = {
  rows: [
    { key: 'twenties', label: '$20', counted: 2, expected: 2, difference: 0 },
    { key: 'ones', label: '$1', counted: 8, expected: 10, difference: -2 },
  ],
  counted_total: '48.00', expected_total: '50.00', difference_total: '-2.00',
};

function setup(onSubmit: (c: unknown) => Promise<CountCheck | null>) {
  const onCancel = vi.fn();
  render(<CountWindow open title="Opening count" submitLabel="Open drawer" onCancel={onCancel} onSubmit={onSubmit} />);
  return onCancel;
}

describe('CountWindow (Retail 4, 2026-11-02)', () => {
  it('counts with + and typing, shows the total on the button, then only what is off', async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async () => CHECK);
    setup(submit);
    await user.click(screen.getByRole('button', { name: '+ $20' }));
    await user.click(screen.getByRole('button', { name: '+ $20' }));
    fireEvent.change(screen.getByTestId('count-ones'), { target: { value: '8' } });
    expect(screen.getByTestId('count-total')).toHaveTextContent('$48.00');
    expect(screen.getByTestId('count-submit')).toHaveTextContent('Open drawer · $48.00');
    await user.click(screen.getByRole('button', { name: '− $20' }));
    await user.click(screen.getByRole('button', { name: '+ $20' }));
    await user.click(screen.getByTestId('count-submit'));
    expect(submit).toHaveBeenCalledWith({ twenties: 2, ones: 8 });
    const result = await screen.findByTestId('count-result');
    expect(result).toHaveTextContent('Short $2.00');
    expect(result).toHaveTextContent('$1Short 2');
    expect(result).not.toHaveTextContent('$20');
  });

  it('oddballs sit behind one Oddballs row and are counted with the rest (2026-11-03)', async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async () => null);
    setup(submit);
    await user.click(screen.getByTestId('count-oddballs'));
    await screen.findByTestId('count-oddballs-pop');
    await user.click(screen.getByRole('button', { name: '+ $1 coin' }));
    await user.click(screen.getByRole('button', { name: '+ 50¢' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByTestId('count-oddballs')).toHaveTextContent('Oddballs × 2');
    expect(screen.getByTestId('count-total')).toHaveTextContent('$1.50');
    await user.click(screen.getByTestId('count-submit'));
    expect(submit).toHaveBeenCalledWith({ dollar_coins: 1, halves: 1 });
  });

  it('a double tap posts once; an error keeps the count', async () => {
    const user = userEvent.setup();
    let fail: (e: unknown) => void = () => undefined;
    const submit = vi.fn(() => new Promise<CountCheck | null>((_res, rej) => { fail = rej; }));
    setup(submit);
    fireEvent.change(screen.getByTestId('count-tens'), { target: { value: '5' } });
    const btn = screen.getByTestId('count-submit');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(submit).toHaveBeenCalledTimes(1);
    fail(new Error('no'));
    await waitFor(() => expect(screen.getByTestId('count-submit')).not.toBeDisabled());
    expect(screen.getByTestId('count-tens')).toHaveValue('5');
    await user.click(screen.getByTestId('count-submit'));
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it('nothing counted cannot be sent', () => {
    setup(async () => null);
    expect(screen.getByTestId('count-submit')).toBeDisabled();
    expect(screen.getByTestId('count-submit')).toHaveTextContent('$0.00');
  });

  it('with no till to compare it just closes', async () => {
    const user = userEvent.setup();
    const onCancel = setup(async () => null);
    await user.click(screen.getByRole('button', { name: '+ $5' }));
    await user.click(screen.getByTestId('count-submit'));
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
  });
});
