import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import {
  attachThriftCard,
  attachThriftMember,
  detachThriftCard,
  pendingFromError,
  thriftErrorMessage,
  type ThriftPendingPerson,
} from '../../api/thriftplusRegister.api';
import { JoinQrDialog } from '../../pages/thriftplus/finalize/finalizeParts';
import type { Cart } from '../../types/pos.types';
import MemberCard from '../thriftplus/MemberCard';
import MemberFind from '../thriftplus/MemberFind';

interface Props {
  open: boolean;
  onClose: () => void;
  /** The open sale (null while there is none yet). */
  cart: Cart | null;
  /** Makes the sale first when there is none (picking a member needs one). */
  ensureCart: () => Promise<Cart | null>;
  onCart: (cart: Cart) => void;
  /** Open on this person's card instead of Find (a pending join's QR was scanned). */
  personId?: number | null;
  /** The training register: a way to practice signing someone up. */
  onPracticeSignup?: () => void;
}

/**
 * The register's one Thrift+ button (owner 2026-10-20): "Thrift+ member". With no member on the sale it is Find (their
 * QR scanned, a name, phone, email or member #); picking a member puts them on the sale. Someone who joined online and
 * is not finished opens their card to Finalize (the ID check). With a member on the sale it is their card: ThriftBucks,
 * Thrift+ credit, Add a 2nd person. Find someone else, or Remove from sale, from the card.
 */
export default function ThriftMemberDialog({ open, onClose, cart, ensureCart, onCart, personId = null, onPracticeSignup }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [viewing, setViewing] = useState<number | null>(null);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [joinQr, setJoinQr] = useState(false);
  const onSale = cart?.status === 'open' ? cart.thrift_plus?.member ?? null : null;

  useEffect(() => {
    if (!open) return;
    setError('');
    setFinding(false);
    setViewing(personId ?? onSale?.person_id ?? null);
    // Each time it opens; the sale's member is read then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, personId]);

  async function pick(person: ThriftPendingPerson, scannedCode?: string) {
    setError('');
    if (person.status !== 'active') {
      setViewing(person.person_id); // still to finish: their card has Finalize
      setFinding(false);
      return;
    }
    setBusy(true);
    try {
      const sale = cart?.status === 'open' ? cart : await ensureCart();
      if (!sale) {
        setError('Open a drawer first, then pick the member.');
        return;
      }
      // A scanned QR attaches as a scan (they are here: ThriftBucks used at once); a search pick waits for the tap.
      const updated = scannedCode
        ? await attachThriftCard(sale.id, scannedCode)
        : await attachThriftMember(sale.id, person.person_id);
      onCart(updated);
      enqueueSnackbar(`Thrift+ member: ${updated.thrift_plus?.member?.name ?? person.first_name}`, { variant: 'info' });
      onClose();
    } catch (err) {
      const pending = pendingFromError(err);
      if (pending) {
        setViewing(pending.person_id);
        setFinding(false);
      } else {
        setError(thriftErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!cart) return;
    setBusy(true);
    try {
      onCart(await detachThriftCard(cart.id));
      onClose();
    } catch (err) {
      setError(thriftErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const showCard = viewing !== null && !finding;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle sx={{ fontWeight: 800 }}>{showCard ? 'Thrift+ member' : 'Find a Thrift+ member'}</DialogTitle>
      <DialogContent dividers data-testid="thrift-member-dialog">
        {error ? <Alert severity="error" sx={{ mb: 1.5 }} data-testid="thrift-member-error">{error}</Alert> : null}
        {showCard ? (
          <MemberCard
            personId={viewing}
            cartId={cart?.status === 'open' ? cart.id : null}
            onCart={(next) => {
              onCart(next);
              onClose();
              enqueueSnackbar(`Thrift+ member: ${next.thrift_plus?.member?.name ?? ''}`, { variant: 'info' });
            }}
          />
        ) : (
          <Stack spacing={1.5}>
            <MemberFind autoFocus disabled={busy} onPick={(p, code) => void pick(p, code)} />
            <Box>
              <Button size="small" startIcon={<QrCode2Rounded />} onClick={() => setJoinQr(true)} sx={{ minHeight: 44 }}>
                Not joined yet? Show the Join QR
              </Button>
              {onPracticeSignup ? (
                <Button size="small" onClick={onPracticeSignup} sx={{ minHeight: 44 }}>Practice sign-up</Button>
              ) : null}
            </Box>
            <Typography variant="caption" color="text.secondary">
              Scan their member QR in the Thrift+ app, or search. The member goes on this sale.
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        {showCard && onSale && viewing === onSale.person_id ? (
          <Button color="error" disabled={busy} onClick={() => void remove()} sx={{ minHeight: 48 }}>Remove from sale</Button>
        ) : null}
        {showCard ? (
          <Button disabled={busy} onClick={() => setFinding(true)} sx={{ minHeight: 48 }}>
            {onSale ? 'Change member' : 'Find someone else'}
          </Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Button variant={showCard ? 'contained' : 'text'} onClick={onClose} sx={{ minHeight: 48 }}>
          {showCard ? 'Done' : 'Cancel'}
        </Button>
      </DialogActions>
      <JoinQrDialog open={joinQr} onClose={() => setJoinQr(false)} />
    </Dialog>
  );
}
