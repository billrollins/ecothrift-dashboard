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
  type ThriftReturnLine,
  type ThriftReturnLookup,
  type ThriftReturnResult,
  type ThriftReturnWho,
} from '../../api/thriftplusRegister.api';
import { tbNumber, tbText } from '../thriftplus/ThriftBucks';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils/format';
import { thriftCardCode } from '../../utils/thriftPlusCard';
import ThriftPlusPhoneFind from './ThriftPlusPhoneFind';

interface Props {
  open: boolean;
  onClose: () => void;
  /** This terminal's register code. The training register works the return out and writes nothing. */
  registerCode?: string;
  /** The training register: say so, and show the result instead of giving anything. */
  training?: boolean;
}

/** Thrift+ credit back for a line (dollars): the server's refund, or what older servers called paid. */
function refundOf(line: ThriftReturnLine): string {
  return line.refund ?? line.paid ?? '0.00';
}

function whyNot(line: ThriftReturnLine): string {
  if (line.problem) return line.problem;
  return (line.problems ?? []).join(' ');
}

/**
 * A Thrift+ 3-day return at the register (W1-W7, the 10-12 policy). Scan the member QR in their Thrift+ app, or find
 * them by phone (owner 2026-10-14: there is no Thrift+ card); pick a line marked "3-day return" from the last 3 days,
 * and give 80% of what they paid, tax included, as Thrift+ credit. No reason is asked and nothing is tested; staff
 * only glance that it isn't broken or heavily used since the sale. ThriftBucks used on it come back (80%), and 80% of
 * the ThriftBucks it collected are taken back. Never back the way they paid.
 * Past the 3 days only the owner may allow it (O1; owner 2026-10-20, closed Sun-Mon): signed in as the owner, a late
 * line can be picked, with "Owner OK: late return" ticked and a note saying why.
 */
export default function ThriftPlusReturnDialog({ open, onClose, registerCode = '', training = false }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const owner = Boolean(useAuth().user?.is_superuser);
  const [scan, setScan] = useState('');
  const [who, setWho] = useState<ThriftReturnWho | null>(null);
  const [found, setFound] = useState<ThriftReturnLookup | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [practice, setPractice] = useState<ThriftReturnResult | null>(null);
  const [lateOk, setLateOk] = useState(false);

  function reset() {
    setScan('');
    setWho(null);
    setFound(null);
    setPicked(null);
    setNote('');
    setPractice(null);
    setLateOk(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function lookUp(next: ThriftReturnWho) {
    setBusy(true);
    try {
      setFound(await lookupThriftReturns(next));
      setWho(next);
      setPicked(null);
    } catch (err) {
      enqueueSnackbar(thriftErrorMessage(err), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function lookUpScan() {
    const code = thriftCardCode(scan, true);
    if (!code) {
      enqueueSnackbar('That is not a Thrift+ member QR or code.', { variant: 'warning' });
      return;
    }
    void lookUp({ code });
  }

  async function giveCredit() {
    if (picked == null || !who) return;
    setBusy(true);
    try {
      const body: ThriftReturnWho & { cart_line: number; note?: string; register: string; late_ok?: boolean } = { ...who, cart_line: picked, register: registerCode };
      if (note.trim()) body.note = note.trim();
      if (line && !line.ok && line.late_only) body.late_ok = true;
      const done = await returnThriftItem(body);
      if (done.training) {
        setPractice(done);
        return;
      }
      const bucks = [
        Number(done.bucks_back) > 0 ? `ThriftBucks back ${tbNumber(done.bucks_back)}` : '',
        Number(done.bucks_taken) > 0 ? `ThriftBucks taken back ${tbNumber(done.bucks_taken)}` : '',
      ].filter(Boolean).join(' · ');
      enqueueSnackbar(`Thrift+ credit added: ${formatCurrency(done.credit)}${bucks ? ` · ${bucks}` : ''}`, { variant: 'success' });
      close();
    } catch (err) {
      enqueueSnackbar(thriftErrorMessage(err), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const line = found?.lines.find((l) => l.cart_line === picked) ?? null;
  const late = Boolean(line && !line.ok && line.late_only);
  const ready = Boolean(line) && (!late || (lateOk && note.trim() !== ''));
  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <DialogTitle>{training ? 'Thrift+ 3-day return (practice)' : 'Thrift+ 3-day return'}</DialogTitle>
      <DialogContent>
        {training ? (
          <Alert severity="warning" sx={{ mt: 1 }}>
            Training register: this shows what the return would give. Nothing is written and no credit is given.
          </Alert>
        ) : null}
        {practice ? (
          <Alert severity="info" sx={{ mt: 1 }} data-testid="thrift-return-practice">
            <Typography fontWeight={800}>THIS IS JUST A TEST: nothing was given.</Typography>
            <Typography variant="body2">Thrift+ credit {formatCurrency(practice.credit)}</Typography>
            <Typography variant="body2">ThriftBucks back {tbNumber(practice.bucks_back)}</Typography>
            <Typography variant="body2">ThriftBucks taken back {tbNumber(practice.bucks_taken)}</Typography>
            {Number(practice.shortfall) > 0 ? (
              <Typography variant="body2">
                Already spent: {tbText(practice.shortfall)}, so the credit is that much less.
              </Typography>
            ) : null}
          </Alert>
        ) : !found ? (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                autoFocus
                fullWidth
                size="small"
                label="Scan the QR in their Thrift+ app"
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && lookUpScan()}
              />
              <Button variant="contained" disabled={busy || !scan.trim()} onClick={lookUpScan}>Look up</Button>
            </Stack>
            <Typography variant="body2" color="text.secondary">Or find them by phone:</Typography>
            <ThriftPlusPhoneFind disabled={busy} onPick={(person) => lookUp({ person: person.person_id })} />
          </Stack>
        ) : (
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar src={found.member.photo_url ?? undefined} sx={{ width: 56, height: 56 }}>{found.member.name.slice(0, 1)}</Avatar>
              <Box>
                <Typography fontWeight={800}>{found.member.name}</Typography>
                <Typography variant="body2" color="text.secondary">Thrift+ credit {formatCurrency(found.member.credit ?? 0)}</Typography>
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
                    disabled={!l.ok && !(owner && l.late_only)}
                    onClick={() => {
                      setPicked(l.cart_line);
                      setLateOk(false);
                    }}
                  >
                    <ListItemText
                      primary={`${l.title}${l.mark ? ` · ${l.mark}` : ''}`}
                      secondary={l.ok
                        ? `Bought ${format(parseISO(l.sold_at), 'MMM d')} · returns until ${format(parseISO(l.deadline), 'MMM d')} · ${formatCurrency(refundOf(l))} Thrift+ credit${l.photos.length ? ' · photo on file' : ''}`
                        : whyNot(l)}
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
                <Typography variant="body2">
                  {`ThriftBucks back ${tbNumber(line.bucks_back ?? 0)} · taken back ${tbNumber(line.bucks_take ?? 0)}`}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Any reason; don&apos;t ask why. Just check it isn&apos;t broken or heavily used since the sale.
                </Typography>
                {late ? (
                  <Alert severity="warning" data-testid="thrift-return-late">
                    {whyNot(line!)} Only the owner can allow it.
                    <FormControlLabel
                      sx={{ display: 'flex', mt: 0.5 }}
                      control={<Checkbox checked={lateOk} onChange={(e) => setLateOk(e.target.checked)} />}
                      label="Owner OK: late return"
                    />
                  </Alert>
                ) : null}
                <TextField
                  size="small"
                  label={late ? 'Why it is allowed (required)' : 'Note (optional)'}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </>
            ) : null}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{practice ? 'Done' : 'Cancel'}</Button>
        {practice || !found ? null : (
          <Button variant="contained" color="success" disabled={busy || !ready} onClick={() => void giveCredit()}>
            {line ? `Give ${formatCurrency(refundOf(line))} Thrift+ credit` : 'Pick an item'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
