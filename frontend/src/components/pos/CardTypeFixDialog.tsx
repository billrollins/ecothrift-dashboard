import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Dialog, Typography } from '@mui/material';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useCardPreview, useSetCartCardType } from '../../hooks/usePOS';
import { useCardTypeFixWindow } from '../../hooks/useCardTypeFixWindow';
import { useAuth } from '../../contexts/AuthContext';
import { localPrintService } from '../../services/localPrintService';
import type { Cart } from '../../types/pos.types';
import { buildReceiptData } from '../../utils/posReceipt';

const FONT = '"Atkinson Hyperlegible", system-ui, sans-serif';
const NO_FILL = '#1F5FBF';
const NO_HOVER = '#EAF1FC';
const YES_FILL = '#B54F00';
const YES_PRESS = '#8F3E00';
const TYPE_BG = '#F3F6F4';
const INK = '#14211A';
const MUTED = '#5B6B62';
const LINE = '#D3DCD6';
const KBD_BG = '#F1F5F2';

function money(value: string | number | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function apiErrorDetail(err: unknown): string | undefined {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
}

type Props = {
  open: boolean;
  cart: Cart;
  onClose: () => void;
  onUpdated?: (cart: Cart) => void;
};

export function CardTypeFixDialog({ open, cart, onClose, onUpdated }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const windowState = useCardTypeFixWindow(cart, user);
  const mutation = useSetCartCardType();
  const [touchOnly, setTouchOnly] = useState(false);
  const pending = mutation.isPending;

  const { data: preview } = useCardPreview(
    cart.id,
    {
      payment_method: cart.payment_method,
      card_amount: cart.card_amount ?? undefined,
    },
    { enabled: open },
  );

  useEffect(() => {
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
    const apply = () => setTouchOnly(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const currentIsCredit = cart.card_type === 'credit';
  const currentIsDebit = cart.card_type === 'debit';
  const percent = preview ? String(preview.percent).replace(/\.0+$/, '') : '3';
  const debitCharged = preview?.no_surcharge ?? cart.card_amount ?? '0';
  const creditCharged = preview?.with_surcharge ?? cart.card_charged_total ?? '0';
  const surchargeAmt = preview?.surcharge_amount ?? cart.card_surcharge_amount ?? '0';

  const apply = useCallback(
    async (card_type: 'credit' | 'debit') => {
      if (pending) return;
      if (card_type === cart.card_type) return;
      try {
        const updated = await mutation.mutateAsync({ cartId: cart.id, card_type });
        onUpdated?.(updated);
        onClose();
        try {
          await localPrintService.printReceipt(buildReceiptData(updated), false);
          enqueueSnackbar('Card type changed · receipt printed', { variant: 'success' });
        } catch {
          enqueueSnackbar('Card type changed · receipt did not print', { variant: 'warning' });
        }
      } catch (err) {
        enqueueSnackbar(apiErrorDetail(err) || 'Could not change card type', { variant: 'error' });
      }
    },
    [pending, cart.card_type, cart.id, mutation, onUpdated, onClose, enqueueSnackbar],
  );

  useEffect(() => {
    if (!open || pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === '1') {
        e.preventDefault();
        void apply('debit');
      } else if (e.key === '2') {
        e.preventDefault();
        void apply('credit');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, pending, apply, onClose]);

  const recordedLabel = currentIsCredit ? 'SURCHARGED' : 'CARDX DIDN\'T ASK';
  const recordedCharged = cart.card_charged_total ?? cart.card_amount;
  const recordedSurcharge = parseFloat(String(cart.card_surcharge_amount ?? 0)) || 0;
  const saleLabel = cart.receipt?.receipt_number ?? `#${cart.id}`;
  const saleTime = format(new Date(cart.completed_at ?? cart.created_at), 'h:mm a');
  const windowCaption = windowState.inWindow
    ? `${windowState.minutesLeft} min left`
    : windowState.canFix
      ? 'past window'
      : 'locked';

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const choiceSx = {
    appearance: 'none',
    border: 0,
    borderRadius: '14px',
    minHeight: 112,
    px: '16px',
    py: '16px',
    fontFamily: FONT,
    cursor: pending ? 'default' : 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    textAlign: 'left',
    textTransform: 'none',
    gap: '6px',
    width: '100%',
    transition: reducedMotion ? 'none' : 'transform 80ms ease, background-color 80ms ease',
    '&:active': reducedMotion ? undefined : { transform: 'scale(0.985)' },
    '&:focus-visible': {
      outline: `4px solid ${INK}`,
      outlineOffset: '3px',
    },
    '&.Mui-disabled': { opacity: 0.55, cursor: 'default' },
  } as const;

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      maxWidth={false}
      disableAutoFocus
      slotProps={{
        paper: {
          sx: {
            width: '100%',
            maxWidth: 560,
            borderRadius: '16px',
            p: { xs: '16px 14px 12px', sm: '22px 24px 16px' },
            fontFamily: FONT,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            color: INK,
          },
        },
      }}
    >
      <Box
        sx={{
          bgcolor: TYPE_BG,
          borderRadius: '14px',
          px: '18px',
          pt: '16px',
          pb: '14px',
        }}
      >
        <Typography
          component="div"
          sx={{
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: MUTED,
            mb: '6px',
          }}
        >
          This sale is recorded as
        </Typography>
        <Typography
          component="div"
          sx={{
            fontFamily: FONT,
            fontSize: 'clamp(18px, 3vw, 22px)',
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          {recordedLabel} — card charged {money(recordedCharged)}
          {currentIsCredit && recordedSurcharge > 0 ? ` (+${money(recordedSurcharge)})` : ''}
        </Typography>
        <Typography
          component="div"
          sx={{ fontFamily: FONT, fontSize: 14, color: MUTED, mt: '8px' }}
        >
          Sale {saleLabel} · {saleTime} · {windowCaption}
        </Typography>
      </Box>

      <Button
        disableRipple
        disabled={pending || currentIsDebit}
        onClick={() => void apply('debit')}
        sx={{
          ...choiceSx,
          bgcolor: '#fff',
          color: NO_FILL,
          boxShadow: `inset 0 0 0 4px ${NO_FILL}`,
          '&:hover': { bgcolor: NO_HOVER },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <Box
            component="span"
            sx={{
              fontSize: 'clamp(15px, 2.4vw, 18px)',
              fontWeight: 700,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              lineHeight: 1.25,
              flex: 1,
            }}
          >
            Change to CARDX DIDN&apos;T ASK and print receipt
          </Box>
          {currentIsDebit && (
            <Box
              component="span"
              sx={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                border: `1px solid ${NO_FILL}`,
                borderRadius: '999px',
                px: '8px',
                py: '2px',
              }}
            >
              Current
            </Box>
          )}
        </Box>
        <Box
          component="span"
          sx={{
            fontSize: 18,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          Card charged {money(debitCharged)}
        </Box>
      </Button>

      <Button
        disableRipple
        disabled={pending || currentIsCredit}
        onClick={() => void apply('credit')}
        sx={{
          ...choiceSx,
          bgcolor: YES_FILL,
          color: '#fff',
          '&:hover': { bgcolor: YES_PRESS },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
          <Box
            component="span"
            sx={{
              fontSize: 'clamp(15px, 2.4vw, 18px)',
              fontWeight: 700,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              lineHeight: 1.25,
              flex: 1,
            }}
          >
            Change to SURCHARGED and print receipt
          </Box>
          {currentIsCredit && (
            <Box
              component="span"
              sx={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                border: '1px solid #fff',
                borderRadius: '999px',
                px: '8px',
                py: '2px',
              }}
            >
              Current
            </Box>
          )}
        </Box>
        <Box
          component="span"
          sx={{
            fontSize: 18,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          Card charged {money(creditCharged)} (+{money(surchargeAmt)}, {percent}%)
        </Box>
      </Button>

      <Button
        disabled={pending}
        onClick={onClose}
        sx={{
          alignSelf: 'center',
          appearance: 'none',
          bgcolor: 'transparent',
          border: 0,
          color: MUTED,
          fontFamily: FONT,
          fontSize: 16,
          px: '14px',
          py: '8px',
          textTransform: 'none',
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
          '&:hover': { bgcolor: 'transparent', color: INK },
          '&:focus-visible': { outline: `3px solid ${INK}`, outlineOffset: '2px' },
        }}
      >
        Keep it as is
      </Button>

      {!touchOnly && (
        <Box
          component="p"
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '6px 18px',
            color: MUTED,
            fontFamily: FONT,
            fontSize: 13,
            borderTop: `1px solid ${LINE}`,
            pt: '10px',
            m: 0,
          }}
        >
          <span>
            <Box
              component="kbd"
              sx={{
                fontFamily: FONT,
                fontSize: 12,
                fontWeight: 700,
                bgcolor: KBD_BG,
                border: `1px solid ${LINE}`,
                borderBottomWidth: '2px',
                borderRadius: '5px',
                px: '7px',
                py: '1px',
                mr: '5px',
                color: INK,
              }}
            >
              1
            </Box>
            Didn&apos;t ask
          </span>
          <span>
            <Box
              component="kbd"
              sx={{
                fontFamily: FONT,
                fontSize: 12,
                fontWeight: 700,
                bgcolor: KBD_BG,
                border: `1px solid ${LINE}`,
                borderBottomWidth: '2px',
                borderRadius: '5px',
                px: '7px',
                py: '1px',
                mr: '5px',
                color: INK,
              }}
            >
              2
            </Box>
            Surcharged
          </span>
          <span>
            <Box
              component="kbd"
              sx={{
                fontFamily: FONT,
                fontSize: 12,
                fontWeight: 700,
                bgcolor: KBD_BG,
                border: `1px solid ${LINE}`,
                borderBottomWidth: '2px',
                borderRadius: '5px',
                px: '7px',
                py: '1px',
                mr: '5px',
                color: INK,
              }}
            >
              Esc
            </Box>
            Keep as is
          </span>
        </Box>
      )}
    </Dialog>
  );
}
