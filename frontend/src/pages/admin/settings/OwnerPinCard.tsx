import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { thriftErrorMessage } from '../../../api/thriftplusRegister.api';
import { getOwnerPin, setOwnerPin } from '../../../api/thriftplusReturns.api';

/**
 * Settings → Thrift+ → Owner PIN (owner 2026-10-20). The owner sets or resets it here; 4 to 8 digits, stored hashed and
 * never shown. Anyone may type it where the owner's OK is asked (a late return past the 3 days): the owner gives it out.
 * Five wrong tries lock it for 15 minutes; every use is logged.
 */
export function OwnerPinCard() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data } = useQuery({ queryKey: ['thriftplus', 'owner-pin'], queryFn: getOwnerPin });
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const valid = /^\d{4,8}$/.test(pin);
  const same = pin === again;

  const save = useMutation({
    mutationFn: () => setOwnerPin(pin),
    onSuccess: () => {
      enqueueSnackbar(data?.set ? 'The owner PIN is reset.' : 'The owner PIN is set.', { variant: 'success' });
      setOpen(false);
      setPin('');
      setAgain('');
      void qc.invalidateQueries({ queryKey: ['thriftplus', 'owner-pin'] });
    },
    onError: (err) => enqueueSnackbar(thriftErrorMessage(err, 'Could not save the PIN.'), { variant: 'error' }),
  });

  const when = data?.set_at ? format(parseISO(data.set_at), 'MMM d, yyyy h:mm a') : '';
  return (
    <Box sx={{ py: 1 }} data-testid="owner-pin-card">
      <Typography variant="subtitle1">Owner PIN</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Anyone can type it where the owner&apos;s OK is asked (a late return past the 3 days). You give it out. 4 to 8 digits; it is
        stored scrambled and never shown. Five wrong tries lock it for 15 minutes. Every use is logged.
      </Typography>
      {data?.set ? (
        <Alert severity="success" sx={{ mb: 1.5 }}>
          A PIN is set{data.set_by ? ` by ${data.set_by}` : ''}{when ? ` on ${when}` : ''}.
          {data.locked ? ' It is locked right now (too many wrong tries).' : ''}
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 1.5 }}>No PIN yet. Until you set one, a late return needs you signed in.</Alert>
      )}
      {open ? (
        <Stack spacing={1.5} sx={{ maxWidth: 280 }}>
          <TextField
            autoFocus
            size="small"
            type="password"
            label="New PIN (4 to 8 digits)"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': 'pin-new' } }}
          />
          <TextField
            size="small"
            type="password"
            label="Type it again"
            value={again}
            onChange={(e) => setAgain(e.target.value.replace(/\D/g, '').slice(0, 8))}
            error={again !== '' && !same}
            helperText={again !== '' && !same ? 'The two do not match.' : ' '}
            slotProps={{ htmlInput: { inputMode: 'numeric', autoComplete: 'off', 'data-testid': 'pin-again' } }}
          />
          <Stack direction="row" spacing={1}>
            <Button variant="contained" disabled={!valid || !same || save.isPending} onClick={() => save.mutate()}>
              {data?.set ? 'Save new PIN' : 'Save PIN'}
            </Button>
            <Button onClick={() => { setOpen(false); setPin(''); setAgain(''); }}>Cancel</Button>
          </Stack>
        </Stack>
      ) : (
        <Button variant="outlined" onClick={() => setOpen(true)} sx={{ textTransform: 'none' }}>
          {data?.set ? 'Reset PIN' : 'Set PIN'}
        </Button>
      )}
    </Box>
  );
}
