import {
  Alert,
  Avatar,
  Box,
  Button,
  ButtonBase,
  Chip,
  Paper,
  Stack,
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
  thriftErrorMessage,
  uploadThriftSalePhoto,
  useThriftBucks as setThriftBucksUse,
} from '../../api/thriftplusRegister.api';
import { TbAmount, tbNumber, tbText } from '../thriftplus/ThriftBucks';
import type { Cart } from '../../types/pos.types';
import { formatCurrency } from '../../utils/format';
import { instantOffer, useByText } from '../../utils/thriftPlusRegister';

interface Props {
  cart: Cart;
  onCart: (cart: Cart) => void;
  /** Tapping the member opens their member card (owner 2026-10-20). */
  onOpenCard?: () => void;
}

/**
 * Thrift+ on the register. Finding and attaching a member is the cart's one "Thrift+ member" button (owner 2026-10-20;
 * ThriftMemberDialog); this panel is the member on the sale, with their photo so the cashier can check it. Tapping them
 * opens their member card. The choice (V4): keep this trip's ThriftBucks (the Default) or redeem them instantly,
 * offered only on what is left after Thrift+ credit and kept ThriftBucks; Thrift+ credit used first; kept ThriftBucks
 * applied by the register on its own, with a one-tap "Don't use ThriftBucks today"; both balances. For a non-member,
 * what membership would have collected. Shown only while Thrift+ is live at this register.
 */
export default function ThriftPlusPanel({ cart, onCart, onOpenCard }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [busy, setBusy] = useState(false);
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

  // A guest: what the trip would have collected. Finding a member is the cart's Thrift+ member button.
  if (!member) {
    return block.guest_line ? (
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, flexShrink: 0 }}>
        <Typography variant="subtitle2" fontWeight={700}>Thrift+</Typography>
        <Typography variant="body2">{block.guest_line}</Typography>
      </Paper>
    ) : null;
  }

  const open = cart.status === 'open';
  const collected = Number(block.collected) || 0;
  const instant = member.choice === 'instant';
  const offer = instantOffer(block);
  const creditUsed = Number(block.credit_used) || 0;
  const bucksUsed = Number(block.bucks_used) || 0;
  const bucksAvailable = Number(block.bucks_available) || 0;
  const useBy = useByText(block.use_by);
  const balanceUseBy = useByText(block.balances?.bucks_use_by);
  const balanceBucks = Number(block.balances?.bucks) || 0;
  const showChoice = collected > 0 || instant;

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, flexShrink: 0, borderColor: 'success.main' }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <ButtonBase
          onClick={onOpenCard}
          disabled={!onOpenCard}
          aria-label={`Open ${member.name}'s ThriftBucks and credit`}
          data-testid="thrift-member-open"
          sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0, textAlign: 'left', borderRadius: 1 }}
        >
          <Avatar src={member.photo_url ?? undefined} alt={member.name} sx={{ width: 64, height: 64 }}>
            {member.name.slice(0, 1)}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={800}>{member.name}</Typography>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
              <Chip
                size="small"
                color={member.verified_18 ? 'success' : 'default'}
                label={member.verified_18 ? '18+ verified' : 'Not ID-checked'}
              />
              {member.practice ? <Chip size="small" color="warning" label="Practice member" /> : null}
              {member.rering ? <Chip size="small" color="info" label="Re-rung" /> : null}
            </Stack>
          </Box>
        </ButtonBase>
        {open ? (
          <Button size="small" disabled={busy} onClick={() => void run(() => detachThriftCard(cart.id))}>
            Remove
          </Button>
        ) : null}
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
        Check the photo matches the person paying.{onOpenCard ? ' Tap them for their ThriftBucks and credit.' : ''}
      </Typography>

      {open && showChoice ? (
        <Box sx={{ mt: 1 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={member.choice}
            aria-label="Keep or redeem instantly"
            sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', lineHeight: 1.25, py: 0.5 } }}
            onChange={(_, v: 'instant' | 'bank' | null) => {
              if (v && v !== member.choice) void run(() => setThriftChoice(cart.id, v));
            }}
          >
            <ToggleButton value="bank" disabled={busy}>
              {`Keep ${tbText(collected)} (Default)`}
            </ToggleButton>
            <ToggleButton value="instant" disabled={busy || (!block.instant_offered && !instant)}>
              {`or redeem instantly: ${formatCurrency(offer)} off today`}
            </ToggleButton>
          </ToggleButtonGroup>
          {block.return_note ? (
            <Alert severity="warning" sx={{ mt: 1 }} data-testid="thrift-return-note">
              Tell them: {block.return_note}
            </Alert>
          ) : null}
          {!block.instant_offered && block.instant_reason ? (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
              {block.instant_reason}
            </Typography>
          ) : null}
          {!instant && useBy ? (
            <Typography variant="caption" color="text.secondary" component="div">
              Kept: usable from tomorrow, use by {useBy}.
            </Typography>
          ) : null}
        </Box>
      ) : null}

      {!open ? (
        <Typography variant="body2" sx={{ mt: 1 }}>
          {instant
            ? `Redeemed instantly: ${tbText(block.instant_bucks)}, ${formatCurrency(block.instant_off)} off`
            : `ThriftBucks collected ${tbNumber(collected)}${useBy ? `, use by ${useBy}` : ''}`}
        </Typography>
      ) : null}

      {creditUsed > 0 ? (
        <Typography variant="body2" sx={{ mt: 1 }}>
          Thrift+ credit {formatCurrency(creditUsed)} used first
        </Typography>
      ) : null}

      {block.bucks_auto && bucksUsed > 0 ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography variant="body2">ThriftBucks used <TbAmount value={bucksUsed} bare /></Typography>
          {open ? (
            <Button size="small" variant="outlined" disabled={busy} onClick={() => void run(() => setThriftBucksUse(cart.id, false))}>
              Don&apos;t use ThriftBucks today
            </Button>
          ) : null}
        </Stack>
      ) : null}
      {!block.bucks_auto && open && bucksAvailable > 0 ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography variant="body2" color="text.secondary">Not using ThriftBucks today</Typography>
          <Button size="small" variant="outlined" disabled={busy} onClick={() => void run(() => setThriftBucksUse(cart.id, true))}>
            {`Use ${tbText(bucksAvailable)}`}
          </Button>
        </Stack>
      ) : null}

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {`Your ThriftBucks ${tbNumber(balanceBucks)}`}
        {balanceUseBy ? `, use by ${balanceUseBy}` : ''}
        {Math.abs(balanceBucks - bucksAvailable) >= 0.005 ? ` (${tbNumber(bucksAvailable)} usable today)` : ''}
        {` · Thrift+ credit ${formatCurrency(block.balances?.credit ?? 0)}`}
      </Typography>

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

      {open && creditUsed > 0 ? (
        <Alert severity="info" sx={{ mt: 1, py: 0 }}>
          Still to pay: {formatCurrency(block.amount_due)}.
        </Alert>
      ) : null}
    </Paper>
  );
}
