import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useManagerOk, type ManagerOkFields } from './ManagerOkDialog';

function apiError(data: Record<string, unknown>) {
  return Object.assign(new Error('http'), { response: { data } });
}

function Harness({ attempt, reason }: { attempt: (extra: Partial<ManagerOkFields>) => Promise<string>; reason?: string }) {
  const { run, dialog } = useManagerOk();
  const [out, setOut] = useState('');
  return (
    <>
      <button
        onClick={() => {
          run(attempt, { reason })
            .then((r) => setOut(r === null ? 'cancelled' : r))
            .catch((e: Error) => setOut(`error:${e.message}`));
        }}
      >
        go
      </button>
      <div data-testid="out">{out}</div>
      {dialog}
    </>
  );
}

describe('useManagerOk', () => {
  it('goes straight through when no OK is needed', async () => {
    const attempt = vi.fn().mockResolvedValue('done');
    render(<Harness attempt={attempt} />);
    await userEvent.click(screen.getByText('go'));
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('done'));
    expect(attempt).toHaveBeenCalledWith({});
    expect(screen.queryByText('Manager OK')).toBeNull();
  });

  it('asks for the PIN and reason, keeps asking on a wrong PIN, then sends the same change again', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(apiError({ code: 'MANAGER_OK_NEEDED', detail: 'A void needs a manager PIN and a reason.' }))
      .mockRejectedValueOnce(apiError({ code: 'PIN_WRONG', detail: 'That PIN is wrong.', tries_left: 4 }))
      .mockResolvedValueOnce('voided');
    render(<Harness attempt={attempt} />);
    await userEvent.click(screen.getByText('go'));
    expect(await screen.findByText('A void needs a manager PIN and a reason.')).toBeTruthy();

    await userEvent.type(screen.getByLabelText('Manager PIN'), '1357');
    await userEvent.type(screen.getByLabelText(/Reason/), 'Rang twice');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/That PIN is wrong\. 4 tries left\./)).toBeTruthy();
    expect(attempt).toHaveBeenLastCalledWith({ manager_pin: '1357', override_reason: 'Rang twice' });

    await userEvent.type(screen.getByLabelText('Manager PIN'), '4826');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('voided'));
    expect(attempt).toHaveBeenLastCalledWith({ manager_pin: '4826', override_reason: 'Rang twice' });
  });

  it('uses the reason it was given and asks for the PIN only', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(apiError({ code: 'MANAGER_OK_NEEDED', detail: 'A discount over 20% needs a manager PIN.' }))
      .mockResolvedValueOnce('ok');
    render(<Harness attempt={attempt} reason="Damaged" />);
    await userEvent.click(screen.getByText('go'));
    expect(await screen.findByText('Reason: Damaged')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Manager PIN'), '4826');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('ok'));
    expect(attempt).toHaveBeenLastCalledWith({ manager_pin: '4826', override_reason: 'Damaged' });
  });

  it('answers null on Cancel and passes other errors on', async () => {
    const cancelled = vi.fn().mockRejectedValue(apiError({ code: 'MANAGER_OK_NEEDED', detail: 'Needs a PIN.' }));
    const { unmount } = render(<Harness attempt={cancelled} />);
    await userEvent.click(screen.getByText('go'));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('cancelled'));
    unmount();

    const other = vi.fn().mockRejectedValue(apiError({ code: 'SALE_FINISHED', detail: 'Finished.' }));
    render(<Harness attempt={other} />);
    await userEvent.click(screen.getByText('go'));
    await waitFor(() => expect(screen.getByTestId('out').textContent).toBe('error:http'));
  });
});
