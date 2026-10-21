/**
 * A manager's OK at the register (2026-10-21, REG-05/06/08/12): price edits, discounts over the cap, voids.
 *
 * The register sends the change as usual. When the server answers MANAGER_OK_NEEDED, `useManagerOk().run` opens
 * this dialog (the manager's register PIN and a reason), sends the same change again with `manager_pin` and
 * `override_reason`, and keeps the dialog open on a wrong PIN (tries left) or a missing reason.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';

export type ManagerOkFields = { manager_pin: string; override_reason: string };

type ErrorBody = { code?: string; detail?: string; tries_left?: number };

/** Answers that keep the dialog open for another try. */
const RETRY_CODES = new Set(['PIN_WRONG', 'PIN_NEEDED', 'REASON_REQUIRED', 'PIN_LOCKED']);

function errorBody(err: unknown): ErrorBody | undefined {
  return (err as { response?: { data?: ErrorBody } })?.response?.data;
}

export function needsManagerOk(err: unknown): boolean {
  return errorBody(err)?.code === 'MANAGER_OK_NEEDED';
}

type Ask = {
  message: string;
  error: string;
  /** The reason is already given (a discount's own reason): the dialog asks for the PIN only. */
  reason?: string;
};

type Props = {
  open: boolean;
  message: string;
  error: string;
  pending: boolean;
  fixedReason?: string;
  onSubmit: (fields: ManagerOkFields) => void;
  onCancel: () => void;
};

export function ManagerOkDialog({ open, message, error, pending, fixedReason, onSubmit, onCancel }: Props) {
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setPin('');
    setReason('');
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ manager_pin: pin.trim(), override_reason: (fixedReason ?? reason).trim() });
    setPin('');
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onCancel}
      maxWidth="xs"
      fullWidth
    >
      <form onSubmit={submit}>
        <DialogTitle>Manager OK</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography>{message}</Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Manager PIN"
              type="password"
              autoFocus
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputProps={{ inputMode: 'numeric', 'aria-label': 'Manager PIN' }}
              required
            />
            {fixedReason === undefined ? (
              <TextField
                label="Reason"
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 300))}
                placeholder="A few words: why"
                required
              />
            ) : (
              <Typography variant="body2" color="text.secondary">Reason: {fixedReason}</Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={pending || pin.length < 4}>
            {pending ? 'Checking…' : 'Approve'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/**
 * `run(attempt)` calls `attempt({})`. If the server asks for a manager's OK it opens the dialog and calls
 * `attempt(fields)` until it goes through, the server refuses for another reason (thrown), or the person cancels
 * (answers `null`). Any other error is thrown as it came.
 */
export function useManagerOk(): {
  run: <T>(attempt: (extra: Partial<ManagerOkFields>) => Promise<T>, opts?: { reason?: string }) => Promise<T | null>;
  dialog: ReactNode;
} {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [pending, setPending] = useState(false);
  const resolver = useRef<((fields: ManagerOkFields | null) => void) | null>(null);

  const waitForFields = (next: Ask) =>
    new Promise<ManagerOkFields | null>((resolve) => {
      resolver.current = resolve;
      setAsk(next);
    });

  const run = useCallback(
    async <T,>(attempt: (extra: Partial<ManagerOkFields>) => Promise<T>, opts?: { reason?: string }) => {
      let first: unknown;
      try {
        return await attempt({});
      } catch (err) {
        if (!needsManagerOk(err)) throw err;
        first = err;
      }
      let next: Ask = { message: errorBody(first)?.detail ?? 'This needs a manager PIN.', error: '', reason: opts?.reason };
      for (;;) {
        const fields = await waitForFields(next);
        if (!fields) {
          setAsk(null);
          return null;
        }
        setPending(true);
        try {
          const result = await attempt(fields);
          setAsk(null);
          return result;
        } catch (err) {
          const body = errorBody(err);
          if (!body?.code || !RETRY_CODES.has(body.code)) {
            setAsk(null);
            throw err;
          }
          const left = body.code === 'PIN_WRONG' && body.tries_left != null ? ` ${body.tries_left} tries left.` : '';
          next = { ...next, error: `${body.detail ?? 'Try again.'}${left}` };
        } finally {
          setPending(false);
        }
      }
    },
    [],
  );

  const answer = (fields: ManagerOkFields | null) => {
    const resolve = resolver.current;
    resolver.current = null;
    resolve?.(fields);
  };

  const dialog = (
    <ManagerOkDialog
      open={ask !== null}
      message={ask?.message ?? ''}
      error={ask?.error ?? ''}
      pending={pending}
      fixedReason={ask?.reason}
      onSubmit={(fields) => answer(fields)}
      onCancel={() => answer(null)}
    />
  );

  return { run, dialog };
}
