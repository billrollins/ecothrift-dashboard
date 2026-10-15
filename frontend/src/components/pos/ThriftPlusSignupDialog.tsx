import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { createMember } from '../../api/thriftplus.api';
import {
  attachThriftMember,
  reringThriftMember,
  thriftErrorMessage,
  type ThriftPendingPerson,
} from '../../api/thriftplusRegister.api';
import ThriftPlusPendingFind from './ThriftPlusPendingFind';
import type { Cart } from '../../types/pos.types';
import type { NewMember } from '../../types/thriftplus.types';
import { formatCurrency } from '../../utils/format';
import { reringMessage } from '../../utils/thriftPlusRegister';
import PersonFields from '../thriftplus/PersonFields';

interface Props {
  open: boolean;
  onClose: () => void;
  /** The open sale to put the new member on, if there is one. */
  cart: Cart | null;
  /** A sale finished in the last 30 minutes that the new member can re-ring. */
  lastSale: { id: number; total: string } | null;
  onCart: (cart: Cart) => void;
  /** The training register: the sign-up makes a practice member. */
  training?: boolean;
  /** They joined online already (J8): finish joining instead of a new sign-up. */
  onFinishJoin?: (person: ThriftPendingPerson) => void;
}

const EMPTY: NewMember = { first_name: '', last_name: '', phone: '', id_checked: false, verified_18: false, photo: null };

/** Where a member opens the Thrift+ app to show their member QR (owner 2026-10-14). */
export const THRIFT_APP_ADDRESS = 'ecothrift.us/scan';

/** At least a 10-digit phone: with no Thrift+ card, the phone is how the register finds a member. */
function hasPhone(phone: string | undefined): boolean {
  return (phone ?? '').replace(/\D/g, '').length >= 10;
}

/**
 * Thrift+ signup at the register (thrift_plus_rewards Phase 4; owner 2026-10-14: there is no Thrift+ card). Check
 * the ID (it sets 18+), take the photo, and the phone. The server makes the member's code; they show it as the QR in
 * the Thrift+ app, or give their phone. The new member then goes on the current sale, or re-rings the last one if
 * they paid before signing up. No ID means an unverified member: they collect ThriftBucks, but have no 3-day returns
 * and no 18+ items.
 *
 * Joined online already (owner 2026-10-15, J8)? Don't sign them up again: find them by name or email (or scan their
 * app QR) and finish joining. The phone typed here is verified in person (the server records who and when, J12).
 */
export default function ThriftPlusSignupDialog({ open, onClose, cart, lastSale, onCart, training = false, onFinishJoin }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [value, setValue] = useState<NewMember>(EMPTY);
  const [rering, setRering] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; where: string } | null>(null);
  const [joinedOnline, setJoinedOnline] = useState(false);
  const openSale = cart && cart.status === 'open' ? cart : null;
  const ready = Boolean(value.first_name.trim()) && (training || hasPhone(value.phone));

  function close() {
    setValue(EMPTY);
    setDone(null);
    setJoinedOnline(false);
    onClose();
  }

  async function signUp() {
    if (!ready) return;
    setBusy(true);
    try {
      // No card_code: the server makes the member's code (owner 2026-10-14).
      const made = await createMember({ ...value, card_code: undefined, practice: training || undefined });
      const personId = made.people[0]?.id;
      let where = '';
      try {
        if (openSale && personId) {
          onCart(await attachThriftMember(openSale.id, personId));
          where = 'They are on this sale.';
        } else if (lastSale && rering && personId && !training) {
          where = reringMessage(value.first_name, await reringThriftMember(lastSale.id, personId));
        }
      } catch (err) {
        where = `Signed up, but not on the sale: ${thriftErrorMessage(err)} Find them by phone.`;
      }
      setDone({ name: value.first_name.trim(), where });
    } catch (err) {
      enqueueSnackbar(thriftErrorMessage(err, 'Could not sign them up.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle>{training ? 'Thrift+ sign up (practice)' : 'Thrift+ sign up'}</DialogTitle>
      <DialogContent>
        {done ? (
          <Alert severity="success" sx={{ mt: 1 }} data-testid="thrift-signup-done">
            <Typography fontWeight={800}>{`Welcome, ${done.name}.`}</Typography>
            {done.where ? <Typography variant="body2">{done.where}</Typography> : null}
            <Typography variant="body2" sx={{ mt: 1 }}>
              {`Next time: they open the Thrift+ app at ${THRIFT_APP_ADDRESS} and show their member QR, or give their phone number.`}
            </Typography>
          </Alert>
        ) : (
          <>
            {training ? (
              <Alert severity="warning" sx={{ mt: 1 }}>
                Training register: this makes a practice member. It gets a made-up 555 phone and no emails.
              </Alert>
            ) : (
              <Alert
                severity="info"
                sx={{ mt: 1 }}
                action={onFinishJoin && !joinedOnline ? (
                  <Button color="inherit" size="small" onClick={() => setJoinedOnline(true)}>Find them</Button>
                ) : undefined}
              >
                Joined online already? Don&apos;t sign them up again: find them by name or email, or scan their Thrift+ app
                QR, and finish joining.
              </Alert>
            )}
            {joinedOnline && onFinishJoin && !training ? (
              <Box sx={{ mt: 1 }}>
                <ThriftPlusPendingFind
                  autoFocus
                  onPick={(person) => {
                    close();
                    onFinishJoin(person);
                  }}
                />
              </Box>
            ) : null}
            {!value.id_checked ? (
              <Alert severity="info" sx={{ mt: 1 }}>
                Without an ID check they still collect ThriftBucks, but have no returns and no 18+ items.
              </Alert>
            ) : null}
            <PersonFields value={value} onChange={setValue} blankCard={false} />
            {!openSale && lastSale && !training ? (
              <FormControlLabel
                control={<Checkbox checked={rering} onChange={(e) => setRering(e.target.checked)} />}
                label={`Re-ring the last sale (${formatCurrency(lastSale.total)}) for them`}
              />
            ) : null}
          </>
        )}
      </DialogContent>
      <DialogActions>
        {done ? (
          <Button variant="contained" onClick={close}>Done</Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="contained" disabled={busy || !ready} onClick={() => void signUp()}>
              {ready || !value.first_name.trim() ? 'Sign up' : 'Add their phone number'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
