import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { verifyPassword } from '../../api/kiosk.api';
import { tk, type AppLanguage } from '../../i18n/kiosk';

/** Exit needs the host's own password. Typed here, checked server-side, never stored. */
export function ExitDialog({ open, lang, onCancel, onConfirmed }: { open: boolean; lang: AppLanguage; onCancel: () => void; onConfirmed: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await verifyPassword(password);
      setPassword('');
      onConfirmed();
    } catch {
      setError(tk('wrongPassword', lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>{tk('exitTitle', lang)}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{tk('exitHint', lang)}</Typography>
        <TextField
          autoFocus
          fullWidth
          type="password"
          label={tk('password', lang)}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && password) void submit();
          }}
          error={Boolean(error)}
          helperText={error || ' '}
          inputProps={{ 'data-testid': 'exit-password' }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel}>{tk('cancel', lang)}</Button>
        <Button variant="contained" disabled={busy || !password} onClick={() => void submit()}>{tk('exit', lang)}</Button>
      </DialogActions>
    </Dialog>
  );
}
