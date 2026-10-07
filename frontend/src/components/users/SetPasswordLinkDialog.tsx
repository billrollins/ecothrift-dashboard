/**
 * Set password (T61, Bill 2026-10-06; house standard D16): a one-time link, good for 48 hours, shown here once with
 * a QR. The person scans it on their phone (or opens the link) and picks their own password. Nothing is emailed,
 * and nobody types a password for anyone else.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import QRCode from 'qrcode';
import { getSetPasswordLink, type SetPasswordLink } from '../../api/accounts.api';

type Props = {
  userId: number | null;
  name: string;
  onClose: () => void;
  /** Where the link comes from (default: Admin → Users). Onboarding passes its own, open to managers for new hires. */
  fetchLink?: (userId: number) => Promise<{ data: SetPasswordLink }>;
};

export function SetPasswordLinkDialog({ userId, name, onClose, fetchLink = getSetPasswordLink }: Props) {
  const [link, setLink] = useState<SetPasswordLink | null>(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLink(null);
    setQr('');
    setError('');
    setCopied(false);
    if (userId == null) return;
    fetchLink(userId)
      .then(({ data }) => {
        setLink(data);
        return QRCode.toDataURL(data.link, { margin: 1, width: 240 });
      })
      .then(setQr)
      .catch((e: unknown) => {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(detail || 'Could not make the link.');
      });
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={userId != null} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Set password: {name}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{error}</Alert>}
        {!error && !link && (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Box>
        )}
        {link && (
          <Stack spacing={1.5} alignItems="center">
            <Typography sx={{ textAlign: 'center' }}>
              {name.split(' ')[0] || 'They'} scans this with their phone and picks their own password (8 or more characters).
            </Typography>
            {qr && <Box component="img" src={qr} alt="Set password QR code" sx={{ width: 240, height: 240 }} />}
            <Typography sx={{ fontSize: 15 }}>
              Their username: <b>{link.username}</b>
            </Typography>
            <TextField value={link.link} size="small" fullWidth InputProps={{ readOnly: true }} onFocus={(e) => e.target.select()} />
            <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'center' }}>
              Works once, for 48 hours (until {new Date(link.expires_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}).
              Their current password keeps working until they use it. Making a new link cancels this one.
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {link && (
          <Button onClick={() => void copy()} sx={{ textTransform: 'none' }}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        )}
        <Button variant="contained" onClick={onClose} sx={{ textTransform: 'none' }}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
