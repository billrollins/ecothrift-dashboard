import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSnackbar } from 'notistack';
import { describe, expect, it } from 'vitest';
import { AppSnackbarProvider, stickyErrorOptions } from './AppSnackbarProvider';

function Buttons() {
  const { enqueueSnackbar } = useSnackbar();
  return (
    <>
      <button onClick={() => enqueueSnackbar('Payment failed', { variant: 'error' })}>error</button>
      <button onClick={() => enqueueSnackbar('Saved', { variant: 'success' })}>success</button>
      <button onClick={() => enqueueSnackbar({ message: 'Print failed', variant: 'error' })}>error-object</button>
    </>
  );
}

describe('stickyErrorOptions', () => {
  it('makes errors persist with a dismiss button and no duplicates', () => {
    const out = stickyErrorOptions({ variant: 'error' });
    expect(out?.persist).toBe(true);
    expect(out?.preventDuplicate).toBe(true);
    expect(typeof out?.action).toBe('function');
  });

  it('leaves other variants and explicit durations alone', () => {
    const success = { variant: 'success' as const };
    expect(stickyErrorOptions(success)).toBe(success);
    const timed = { variant: 'error' as const, autoHideDuration: 2000 };
    expect(stickyErrorOptions(timed)).toBe(timed);
    expect(stickyErrorOptions(undefined)).toBeUndefined();
  });
});

describe('AppSnackbarProvider', () => {
  // A short fade so the test can watch success go while the error stays (real timers: the exit transition needs them).
  it('keeps an error on screen after success toasts fade, until it is dismissed', async () => {
    const user = userEvent.setup();
    render(
      <AppSnackbarProvider maxSnack={3} autoHideDuration={50} transitionDuration={{ enter: 0, exit: 0 }}>
        <Buttons />
      </AppSnackbarProvider>,
    );
    await user.click(screen.getByText('error'));
    await user.click(screen.getByText('error-object'));
    await user.click(screen.getByText('success'));
    expect(screen.getByText('Saved')).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByText('Saved')).not.toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('Payment failed')).toBeInTheDocument();
    expect(screen.getByText('Print failed')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]!);
    await waitFor(() => expect(screen.queryByText('Payment failed')).not.toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('Print failed')).toBeInTheDocument();
  });
});
