import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { createMember } from '../../api/thriftplus.api';
import { attachThriftCard, reringThriftCard, thriftErrorMessage } from '../../api/thriftplusRegister.api';
import type { Cart } from '../../types/pos.types';
import type { NewMember } from '../../types/thriftplus.types';
import { formatCurrency } from '../../utils/format';
import { thriftCardCode } from '../../utils/thriftPlusCard';
import PersonFields from '../thriftplus/PersonFields';

interface Props {
  open: boolean;
  onClose: () => void;
  /** The open sale to put the new card on, if there is one. */
  cart: Cart | null;
  /** A sale finished in the last 30 minutes that the new member can re-ring. */
  lastSale: { id: number; total: string } | null;
  onCart: (cart: Cart) => void;
}

const EMPTY: NewMember = { first_name: '', last_name: '', phone: '', id_checked: false, verified_18: false, card_code: '', photo: null };

/**
 * Thrift+ signup at the register (thrift_plus_rewards Phase 4). Check the ID (it sets 18+), take
 * the photo, scan a blank card. The card then goes on the current sale, or re-rings the last one
 * if they paid before signing up. No ID means an unverified card: rewards, but no returns and no 18+.
 */
export default function ThriftPlusSignupDialog({ open, onClose, cart, lastSale, onCart }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [value, setValue] = useState<NewMember>(EMPTY);
  const [rering, setRering] = useState(true);
  const [busy, setBusy] = useState(false);
  const code = thriftCardCode(value.card_code ?? '', true);
  const openSale = cart && cart.status === 'open' ? cart : null;

  function close() {
    setValue(EMPTY);
    onClose();
  }

  async function signUp() {
    if (!code) return;
    setBusy(true);
    try {
      await createMember({ ...value, card_code: code });
      if (openSale) {
        onCart(await attachThriftCard(openSale.id, code));
        enqueueSnackbar(`Welcome, ${value.first_name}. The card is on this sale.`, { variant: 'success' });
      } else if (lastSale && rering) {
        const done = await reringThriftCard(lastSale.id, code);
        enqueueSnackbar(
          `Welcome, ${value.first_name}. Re-rung: ${formatCurrency(done.thrift_plus?.totals.savings ?? 0)} store credit.`,
          { variant: 'success' },
        );
      } else {
        enqueueSnackbar(`Welcome, ${value.first_name}.`, { variant: 'success' });
      }
      close();
    } catch (err) {
      enqueueSnackbar(thriftErrorMessage(err, 'Could not sign them up.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
      <DialogTitle>Thrift+ sign up</DialogTitle>
      <DialogContent>
        {!value.id_checked ? (
          <Alert severity="info" sx={{ mt: 1 }}>
            Without an ID check the card still earns rewards, but has no returns and no 18+ items.
          </Alert>
        ) : null}
        <PersonFields value={value} onChange={setValue} />
        {!openSale && lastSale ? (
          <FormControlLabel
            control={<Checkbox checked={rering} onChange={(e) => setRering(e.target.checked)} />}
            label={`Re-ring the last sale (${formatCurrency(lastSale.total)}) for them`}
          />
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button variant="contained" disabled={busy || !value.first_name.trim() || !code} onClick={() => void signUp()}>
          {code ? 'Sign up' : 'Scan a blank card'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
