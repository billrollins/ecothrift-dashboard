import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import {
  detachThriftCard,
  refreshCart,
  setThriftChoice,
  spendThriftBalance,
  thriftErrorMessage,
  uploadThriftSalePhoto,
} from '../../api/thriftplusRegister.api';
import { CoverFigures, TbAmount, tbText } from '../thriftplus/ThriftBucks';
import type { Cart } from '../../types/pos.types';
import { formatCurrency } from '../../utils/format';

interface Props {
  cart: Cart;
  onCart: (cart: Cart) => void;
}

/**
 * Thrift+ on the register (thrift_plus_rewards Phase 3). The member on the sale, with their photo
 * so the cashier can check it; the cover; bank or instant; spending credit or banked rewards. For a
 * guest, what a card would have collected for them. Shown only while Thrift+ is live at this register.
 */
export default function ThriftPlusPanel({ cart, onCart }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [busy, setBusy] = useState(false);
  const [spendOpen, setSpendOpen] = useState(false);
  const [credit, setCredit] = useState('');
  const [bank, setBank] = useState('');
  const block = cart.thrift_plus;
  if (!block) return null;
  const member = block.member;

  async function run(step: () => Promise<Cart>) {
    setBusy(true);
    try {
      onCart(await step());
      return true;
    } catch (err) {
      enqueueSnackbar(thriftErrorMessage(err), { variant: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!member) {
    return (
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, flexShrink: 0 }}>
        <Typography variant="subtitle2" fontWeight={700}>Thrift+</Typography>
        <Typography variant="body2" color="text.secondary">
          Do you have a card yet? Scan it to price this sale for the member.
        </Typography>
        {block.guest_line ? (
          <Typography variant="body2" sx={{ mt: 0.5 }}>{block.guest_line}</Typography>
        ) : null}
      </Paper>
    );
  }

  const cover = member.cover;
  const coverPct = Math.min(100, (Number(cover.covered) / Math.max(0.01, Number(cover.amount))) * 100);
  const open = cart.status === 'open';
  const t = block.totals;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, flexShrink: 0, borderColor: 'success.main' }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Avatar src={member.photo_url ?? undefined} alt={member.name} sx={{ width: 64, height: 64 }}>
          {member.name.slice(0, 1)}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={800}>{member.name}</Typography>
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            <Chip size="small" label={`Card …${member.card_last4}`} />
            <Chip
              size="small"
              color={member.verified_18 ? 'success' : 'default'}
              label={member.verified_18 ? '18+ verified' : 'Not ID-checked'}
            />
            {member.rering ? <Chip size="small" color="info" label="Re-rung" /> : null}
          </Stack>
        </Box>
        {open ? (
          <Button size="small" disabled={busy} onClick={() => void run(() => detachThriftCard(cart.id))}>
            Remove
          </Button>
        ) : null}
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
        Check the photo matches the person paying.
      </Typography>
      {block.app_choice ? (
        <Alert severity={block.app_choice === 'bank' ? 'warning' : 'info'} sx={{ mt: 1, py: 0 }}>
          In the Thrift+ app they chose: {block.app_choice === 'bank' ? 'ThriftBucks (Default)' : 'InstantBucks (80% of the ThriftBucks, off today)'}. Ask to be sure.
        </Alert>
      ) : null}

      <Box sx={{ mt: 1 }}>
        <Typography variant="body2">
          Cover this month: <CoverFigures covered={cover.covered} amount={cover.amount} />
          {cover.is_covered ? ' (covered)' : ''}
        </Typography>
        <LinearProgress variant="determinate" value={coverPct} sx={{ height: 6, borderRadius: 3, mt: 0.5 }} />
      </Box>

      <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
        <Typography variant="body2">This sale: ThriftBucks <TbAmount value={t.reward_total} bare /></Typography>
        {Number(t.to_cover) > 0 ? <Typography variant="body2">to the cover <TbAmount value={t.to_cover} bare /></Typography> : null}
      </Stack>
      <Stack direction="row" spacing={2}>
        <Typography variant="body2" color="text.secondary">ThriftBucks Balance <TbAmount value={member.banked} bare /></Typography>
        <Typography variant="body2" color="text.secondary">Return $ {formatCurrency(member.credit)}</Typography>
      </Stack>

      {open ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={member.choice}
            onChange={(_, v: 'instant' | 'bank' | null) => {
              if (v && v !== member.choice) void run(() => setThriftChoice(cart.id, v));
            }}
          >
            <ToggleButton value="instant">InstantBucks {Number(t.savings) > 0 ? <TbAmount value={t.savings} bare sx={{ ml: 0.5 }} /> : ''}</ToggleButton>
            <ToggleButton value="bank">ThriftBucks (Default) {Number(t.to_bank) > 0 ? <TbAmount value={t.to_bank} bare sx={{ ml: 0.5 }} /> : ''}</ToggleButton>
          </ToggleButtonGroup>
          {Number(member.credit) > 0 || Number(member.banked) > 0 ? (
            <Button
              size="small"
              variant="outlined"
              disabled={busy}
              onClick={() => {
                setCredit(block.credit_used && Number(block.credit_used) > 0 ? block.credit_used : '');
                setBank(block.bank_used && Number(block.bank_used) > 0 ? block.bank_used : '');
                setSpendOpen(true);
              }}
            >
              Use balance
            </Button>
          ) : null}
        </Stack>
      ) : null}

      {open && (block.photo_line_ids ?? []).length > 0 ? (
        <Alert severity="warning" sx={{ mt: 1 }}>
          $100 and up: photograph the serial number and condition.
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            {(block.photo_line_ids ?? []).map((lineId) => {
              const ln = (cart.lines ?? []).find((l) => l.id === lineId);
              return (
                <Stack key={lineId} direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" sx={{ flex: 1 }}>{ln?.description ?? `Line ${lineId}`}</Typography>
                  <Button size="small" component="label" variant="outlined" disabled={busy}>
                    Photo
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) {
                          void run(async () => {
                            await uploadThriftSalePhoto(lineId, file);
                            return refreshCart(cart.id);
                          });
                        }
                      }}
                    />
                  </Button>
                </Stack>
              );
            })}
          </Stack>
        </Alert>
      ) : null}

      {Number(cart.thrift_credit ?? 0) > 0 ? (
        <Alert severity="info" sx={{ mt: 1, py: 0 }}>
          Thrift+ pays {formatCurrency(cart.thrift_credit ?? 0)}. Take {formatCurrency(block.amount_due)} by cash or card.
        </Alert>
      ) : null}

      <Dialog open={spendOpen} onClose={() => setSpendOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Use Return $ or ThriftBucks</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={`Return $ (has ${formatCurrency(member.credit)})`}
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              size="small"
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
            <TextField
              label={`ThriftBucks (has ${tbText(member.banked)})`}
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              size="small"
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSpendOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={async () => {
              if (await run(() => spendThriftBalance(cart.id, credit || '0', bank || '0'))) setSpendOpen(false);
            }}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
