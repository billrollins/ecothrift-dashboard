import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDeviceConfig } from '../../hooks/useDeviceConfig';
import { useAckQaNudge, usePendingQaNudges } from '../../hooks/useRetailQa';
import type { QaNudgeRow } from '../../api/routines.api';

function deviceLabel(config: { registerName?: string } | null) {
  return config?.registerName?.trim() || 'Browser';
}

export function NudgeBlockingDialog() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { config } = useDeviceConfig();
  const pending = usePendingQaNudges(Boolean(user));
  const ack = useAckQaNudge();
  const rows = pending.data?.nudges ?? [];
  const first = user?.first_name?.trim() || 'me';

  async function respond(kind: 'heard' | 'not_me', row?: QaNudgeRow) {
    const targets = row ? [row] : rows;
    for (const item of targets) {
      await ack.mutateAsync({ id: item.id, kind, device: deviceLabel(config) });
    }
    if (kind === 'not_me') {
      await logout();
      navigate('/login');
    }
  }

  if (!rows.length) return null;
  return (
    <Dialog
      open
      fullScreen
      disableEscapeKeyDown
      onClose={() => undefined}
    >
      <DialogTitle>You were nudged</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {rows.map((row) => (
            <Stack key={row.id} spacing={0.5}>
              <Typography variant="body1">{row.message || 'Please finish this routine.'}</Typography>
              <Typography variant="body2" color="text.secondary">
                {row.created_by?.name ? `From ${row.created_by.name}` : 'Automatic'}
                {row.at_label ? ` · ${row.at_label}` : ''}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1, justifyContent: 'space-between' }}>
        <Button
          variant="outlined"
          onClick={() => void respond('not_me')}
          disabled={ack.isPending}
        >
          I&apos;m not {first}
        </Button>
        <Button
          variant="contained"
          onClick={() => void respond('heard')}
          disabled={ack.isPending}
        >
          Heard
        </Button>
      </DialogActions>
    </Dialog>
  );
}
