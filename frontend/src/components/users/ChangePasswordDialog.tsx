/**
 * Change your own password without being locked out first.
 *
 * The endpoint has existed for a long time with nothing calling it; this is the
 * missing door. Helper text under both fields is always present so validation
 * changes the words, not the height of the dialog.
 */
import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { changePassword } from '../../api/accounts.api';

const MIN_LENGTH = 6;

export default function ChangePasswordDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await changePassword(current, next);
      enqueueSnackbar('Password changed', { variant: 'success' });
      reset();
      onClose();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(detail || 'Could not change the password', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <form onSubmit={submit}>
        <DialogTitle>Change password</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              label="Current password"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              fullWidth
              required
              autoFocus
            />
            <TextField
              label="New password"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              fullWidth
              required
              error={tooShort}
              helperText={tooShort ? `At least ${MIN_LENGTH} characters.` : `${MIN_LENGTH} characters or more.`}
            />
            <TextField
              label="Confirm new password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              fullWidth
              required
              error={mismatch}
              helperText={mismatch ? 'These do not match.' : 'Type it once more.'}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={saving || !current || !next || !confirm || mismatch || tooShort}
          >
            {saving ? 'Saving…' : 'Change password'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
