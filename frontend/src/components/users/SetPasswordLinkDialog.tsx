/**
 * Set password (T61, Bill 2026-10-06; house standard D16): a one-time link, good for 48 hours, shown here once with
 * a QR. The person scans it on their phone (or opens the link) and picks their own password. Nothing is emailed,
 * and nobody types a password for anyone else.
 *
 * Text it (#132, Bill 2026-11-13): with staff texts on, Dash texts the link from our number, (888) 812-7905; otherwise
 * (or if that text fails) it opens this phone's Messages with the link written in, as before.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import QRCode from 'qrcode';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getTextingStatus, textSetPasswordLink } from '../../api/texting.api';
import { getSetPasswordLink, type SetPasswordLink } from '../../api/accounts.api';

type Props = {
  userId: number | null;
  name: string;
  onClose: () => void;
  /** Where the link comes from (default: Admin → Users). Onboarding passes its own, open to managers for new hires. */
  fetchLink?: (userId: number) => Promise<{ data: SetPasswordLink }>;
  /** Their phone (#121): Text it texts the link from our number (#132), or opens this phone's Messages with it. */
  phone?: string;
};

/** ``sms:`` with the message written in. Opens Messages on a phone; nothing is sent by Dash. */
export function smsHref(phone: string, body: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return `sms:${digits}?&body=${encodeURIComponent(body)}`;
}

export function SetPasswordLinkDialog({ userId, name, onClose, fetchLink = getSetPasswordLink, phone }: Props) {
  const [link, setLink] = useState<SetPasswordLink | null>(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const texting = useQuery({
    queryKey: ['texting', 'status'],
    queryFn: () => getTextingStatus().then((r) => r.data),
    enabled: userId != null,
    retry: false,
  });
  const ourNumber = Boolean(texting.data?.staff_texts_live);
  const sendText = useMutation({
    mutationFn: ({ url, to }: { url: string; to: string }) => textSetPasswordLink(url, to).then((r) => r.data),
  });

  useEffect(() => {
    sendText.reset();
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

  const textTo = phone || link?.phone || '';
  const smsBody =
    `Eco-Thrift Dash: set your password here (works once, for 48 hours): ${link?.link ?? ''}` +
    (link?.username ? ` Your username: ${link.username}` : '');
  // Our number failed or held it: fall back to this phone's Messages.
  const textFailed = sendText.isError || (sendText.data != null && !sendText.data.sent);
  const textNote = sendText.isPending
    ? 'Texting it from (888) 812-7905…'
    : sendText.data?.sent
      ? `Texted to ${sendText.data.to} from (888) 812-7905.`
      : textFailed
        ? `Could not text it from our number${sendText.data?.reason ? ` (${sendText.data.reason})` : ''}. Text it from your phone instead.`
        : '';

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
            {textTo && ourNumber ? (
              // A fixed slot so nothing moves when the note appears.
              <Typography
                data-testid="set-password-text-note"
                sx={{ fontSize: 13, minHeight: 20, textAlign: 'center', color: textFailed ? 'error.main' : 'text.secondary' }}
              >
                {textNote}
              </Typography>
            ) : null}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {link && textTo && ourNumber && !textFailed ? (
          <Button
            onClick={() => sendText.mutate({ url: link.link, to: textTo })}
            disabled={sendText.isPending || Boolean(sendText.data?.sent)}
            sx={{ textTransform: 'none' }}
            data-testid="set-password-text-ours"
          >
            {sendText.data?.sent ? 'Texted' : 'Text it'}
          </Button>
        ) : link && textTo ? (
          <Button component="a" href={smsHref(textTo, smsBody)} sx={{ textTransform: 'none' }} data-testid="set-password-text-phone">
            {textFailed ? 'Text from my phone' : 'Text it'}
          </Button>
        ) : null}
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
