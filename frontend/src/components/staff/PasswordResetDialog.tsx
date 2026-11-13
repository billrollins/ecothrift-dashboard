/**
 * Password reset (#136, Bill 2026-11-13): one button in the staff window, one window here. "Set password" and "Send
 * reset link" looked like the same thing, and there was no text: now it is one link, sent by email, by text from our
 * number, or both. A new link spends the last one, so "both" is one link sent two ways (the server does both).
 *
 * In person, "Show a QR instead" opens the on-screen link (scan it on their phone), as Set password did.
 */
import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { sendStaffPasswordReset, type StaffResetResult } from '../../api/accounts.api';
import { getTextingStatus } from '../../api/texting.api';
import { formatPhone } from '../../utils/formatPhone';
import { SetPasswordLinkDialog } from '../users/SetPasswordLinkDialog';

type Props = {
  open: boolean;
  onClose: () => void;
  userId: number;
  name: string;
  email: string;
  phone: string;
};

function errorOf(err: unknown): string {
  const data = (err as { response?: { data?: Partial<StaffResetResult> & { detail?: string } } })?.response?.data;
  return data?.detail || 'Could not send the reset link.';
}

export function PasswordResetDialog({ open, onClose, userId, name, email, phone }: Props) {
  const texting = useQuery({
    queryKey: ['texting', 'status'],
    queryFn: () => getTextingStatus().then((r) => r.data),
    enabled: open,
    retry: false,
  });
  const textsLive = Boolean(texting.data?.staff_texts_live);
  const canEmail = Boolean(email.trim());
  const canText = Boolean(phone.replace(/\D/g, '')) && textsLive;
  const [byEmail, setByEmail] = useState(true);
  const [byText, setByText] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const send = useMutation({
    mutationFn: () => sendStaffPasswordReset(userId, { email: byEmail && canEmail, text: byText && canText }).then((r) => r.data),
  });

  useEffect(() => {
    if (open) {
      send.reset();
      setByEmail(true);
      setByText(true);
    }
  }, [open, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = name.split(' ')[0] || 'They';
  const picked = (byEmail && canEmail) || (byText && canText);
  const result = send.data ?? (send.error as { response?: { data?: StaffResetResult } } | null)?.response?.data;
  const done = send.isSuccess;
  const textHint = !phone.replace(/\D/g, '')
    ? 'No mobile number on file. Add one on Profile.'
    : !textsLive
      ? texting.isLoading
        ? 'Checking texts…'
        : 'Texts from our number are not on yet. Use email or the QR.'
      : `${formatPhone(phone)}, from (888) 812-7905`;

  const line = (label: string, r: StaffResetResult['email']) =>
    r ? (
      <Typography sx={{ fontSize: 14, color: r.sent ? 'success.main' : 'error.main' }}>
        {label}: {r.sent ? `sent to ${r.to}` : `not sent${r.reason ? ` (${r.reason})` : ''}`}
      </Typography>
    ) : null;

  return (
    <>
      <Dialog open={open && !showQr} onClose={onClose} fullWidth maxWidth="xs">
        <DialogTitle>Password reset: {name}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, mb: 1.5 }}>
            {first} gets one link and picks their own password. It works once, for 48 hours. Their current password keeps
            working until they use it.
          </Typography>
          <Stack spacing={0.5}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={byEmail && canEmail}
                  disabled={!canEmail || send.isPending || done}
                  onChange={(e) => setByEmail(e.target.checked)}
                  inputProps={{ 'aria-label': 'Email' }}
                />
              }
              label={
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Email</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{canEmail ? email : 'No email on file.'}</Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', m: 0, '& .MuiCheckbox-root': { pt: 0.5 } }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={byText && canText}
                  disabled={!canText || send.isPending || done}
                  onChange={(e) => setByText(e.target.checked)}
                  inputProps={{ 'aria-label': 'Text' }}
                />
              }
              label={
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Text</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{textHint}</Typography>
                </Box>
              }
              sx={{ alignItems: 'flex-start', m: 0, '& .MuiCheckbox-root': { pt: 0.5 } }}
            />
          </Stack>
          {/* A fixed slot: the result arrives without moving the buttons. */}
          <Box sx={{ minHeight: 48, mt: 1.5 }} data-testid="password-reset-result">
            {result && (result.email || result.text) ? (
              <>
                {line('Email', result.email)}
                {line('Text', result.text)}
              </>
            ) : send.isError ? (
              <Alert severity="error" sx={{ py: 0 }}>{errorOf(send.error)}</Alert>
            ) : null}
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Button onClick={() => setShowQr(true)} sx={{ textTransform: 'none' }} data-testid="password-reset-qr">
            Show a QR instead
          </Button>
          <Stack direction="row" spacing={1}>
            <Button onClick={onClose} sx={{ textTransform: 'none' }}>{done ? 'Done' : 'Cancel'}</Button>
            {done ? null : (
              <Button
                variant="contained"
                disabled={!picked || send.isPending}
                onClick={() => send.mutate()}
                sx={{ textTransform: 'none' }}
                data-testid="password-reset-send"
              >
                {send.isPending ? 'Sending…' : 'Send link'}
              </Button>
            )}
          </Stack>
        </DialogActions>
      </Dialog>
      <SetPasswordLinkDialog
        userId={open && showQr ? userId : null}
        name={name}
        phone={phone}
        onClose={() => {
          setShowQr(false);
          onClose();
        }}
      />
    </>
  );
}
