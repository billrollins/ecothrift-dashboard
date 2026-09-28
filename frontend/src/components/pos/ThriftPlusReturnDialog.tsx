import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import {
  lookupThriftReturns,
  returnThriftItem,
  thriftErrorMessage,
  type ThriftReturnLookup,
} from '../../api/thriftplusRegister.api';
import { formatCurrency } from '../../utils/format';
import { thriftCardCode } from '../../utils/thriftPlusCard';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * A Thrift+ member return at the register (thrift_plus_rewards Phase 3). Scan the member's card,
 * pick an item they bought as a member in the last 3 days (open days), confirm its main function
 * fails, and give store credit for what they paid. Guest sales are final.
 */
export default function ThriftPlusReturnDialog({ open, onClose }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [scan, setScan] = useState('');
  const [code, setCode] = useState('');
  const [found, setFound] = useState<ThriftReturnLookup | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setScan('');
    setCode('');
    setFound(null);
    setPicked(null);
    setConfirmed(false);
    setNote('');
  }

  async function lookUp() {
    const card = thriftCardCode(scan, true);
    if (!card) {
      enqueueSnackbar('That is not a Thrift+ card number.', { variant: 'warning' });
      return;
    }
    setBusy(true);
    try {
      setFound(await lookupThriftReturns(card));
      setCode(card);
      setPicked(null);
    } catch (err) {
      enqueueSnackbar(thriftErrorMessage(err), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function giveCredit() {
    if (picked == null) return;
    setBusy(true);
    try {
      const done = await returnThriftItem({ code, cart_line: picked, confirmed, note });
      enqueueSnackbar(`Store credit added: ${formatCurrency(done.credit)}`, { variant: 'success' });
      reset();
      onClose();
    } catch (err) {
      enqueueSnackbar(thriftErrorMessage(err), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const line = found?.lines.find((l) => l.cart_line === picked) ?? null;
  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} maxWidth="sm" fullWidth>
      <DialogTitle>Thrift+ member return</DialogTitle>
      <DialogContent>
        {!found ? (
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Scan the member's card"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void lookUp()}
            sx={{ mt: 1 }}
          />
        ) : (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar src={found.member.photo_url ?? undefined} sx={{ width: 56, height: 56 }}>{found.member.name.slice(0, 1)}</Avatar>
              <Box>
                <Typography fontWeight={800}>{found.member.name}</Typography>
                <Typography variant="body2" color="text.secondary">Store credit {formatCurrency(found.member.credit)}</Typography>
              </Box>
            </Stack>
            {found.lines.length === 0 ? (
              <Alert severity="info">No purchases on this membership in the last 10 days.</Alert>
            ) : (
              <List dense disablePadding>
                {found.lines.map((l) => (
                  <ListItemButton
                    key={l.cart_line}
                    selected={picked === l.cart_line}
                    disabled={!l.ok}
                    onClick={() => setPicked(l.cart_line)}
                  >
                    <ListItemText
                      primary={`${l.title} · ${formatCurrency(l.paid)}`}
                      secondary={l.ok
                        ? `Bought ${format(parseISO(l.sold_at), 'MMM d')} · returns until ${format(parseISO(l.deadline), 'MMM d')}${l.photos.length ? ' · photo on file' : ''}`
                        : l.problems.join(' ')}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
            {line ? (
              <>
                {line.photos.length ? (
                  <Stack direction="row" spacing={1}>
                    {line.photos.map((src) => (
                      <Box key={src} component="img" src={src} alt="Serial and condition at sale" sx={{ height: 96, borderRadius: 1 }} />
                    ))}
                  </Stack>
                ) : null}
                <FormControlLabel
                  control={<Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />}
                  label="Its main function doesn't work (not cosmetic, not a missing part, not a change of mind)"
                />
                <TextField size="small" label="What doesn't work?" value={note} onChange={(e) => setNote(e.target.value)} />
              </>
            ) : null}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }}>Cancel</Button>
        {!found ? (
          <Button variant="contained" disabled={busy || !scan.trim()} onClick={() => void lookUp()}>Look up</Button>
        ) : (
          <Button variant="contained" color="success" disabled={busy || !line || !confirmed} onClick={() => void giveCredit()}>
            {line ? `Give ${formatCurrency(line.paid)} store credit` : 'Pick an item'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
