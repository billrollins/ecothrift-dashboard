import { useEffect, useState } from 'react';
import { Box, Button, Dialog, Typography } from '@mui/material';
import type { CardPreview } from '../../types/pos.types';

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

function money(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

type Props = {
  open: boolean;
  preview: CardPreview | null;
  pending?: boolean;
  onConfirm: (choice: { card_type: 'credit' | 'debit'; card_charged_total: string }) => void;
  onCancel: () => void;
};

export function CardTenderDialog({ open, preview, pending, onConfirm, onCancel }: Props) {
  const [touchOnly, setTouchOnly] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
    const apply = () => setTouchOnly(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!open || pending || !preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft' || e.key === '1') {
        e.preventDefault();
        onConfirm({ card_type: 'debit', card_charged_total: preview.no_surcharge });
      } else if (e.key === 'ArrowRight' || e.key === '2') {
        e.preventDefault();
        onConfirm({ card_type: 'credit', card_charged_total: preview.with_surcharge });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, pending, preview, onConfirm, onCancel]);

  const percent = preview ? String(preview.percent).replace(/\.0+$/, '') : '3';
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const choiceSx = {
    appearance: 'none',
    border: 0,
    borderRadius: '14px',
    minHeight: 196,
    px: '14px',
    py: '20px',
    fontFamily: FONT,
    cursor: pending ? 'default' : 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    textTransform: 'none',
    gap: '4px',
    transition: reducedMotion ? 'none' : 'transform 80ms ease, background-color 80ms ease',
    '&:active': reducedMotion ? undefined : { transform: 'scale(0.985)' },
    '&:focus-visible': {
      outline: `4px solid ${INK}`,
      outlineOffset: '3px',
    },
    '&.Mui-disabled': { opacity: 0.55 },
  } as const;

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onCancel}
      maxWidth={false}
      disableAutoFocus
      slotProps={{
        paper: {
          sx: {
            width: '100%',
            maxWidth: 760,
            borderRadius: '16px',
            p: { xs: '16px 14px 12px', sm: '24px 28px 18px' },
            fontFamily: FONT,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            color: INK,
          },
        },
      }}
    >
      {preview && (
        <>
          <Box
            sx={{
              bgcolor: TYPE_BG,
              borderRadius: '14px',
              px: '20px',
              pt: '18px',
              pb: '16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Typography
              component="div"
              sx={{
                fontFamily: FONT,
                fontSize: 'clamp(15px, 2.4vw, 20px)',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: MUTED,
              }}
            >
              Type this into CardX
            </Typography>
            <Typography
              component="div"
              sx={{
                fontFamily: FONT,
                fontSize: 'clamp(56px, 12vw, 96px)',
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                my: '4px',
              }}
            >
              {money(preview.card_base)}
            </Typography>
            <Typography
              component="div"
              sx={{
                fontFamily: FONT,
                fontSize: 'clamp(16px, 2.6vw, 21px)',
                fontWeight: 700,
                lineHeight: 1.3,
              }}
            >
              If CardX asks &quot;Apply surcharge?&quot;, press{' '}
              <Box component="b" sx={{ color: YES_FILL, fontWeight: 700 }}>
                YES
              </Box>
              .
            </Typography>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: { xs: '10px', sm: '16px' },
            }}
          >
            <Button
              disableRipple
              disabled={pending}
              onClick={() =>
                onConfirm({
                  card_type: 'debit',
                  card_charged_total: preview.no_surcharge,
                })
              }
              sx={{
                ...choiceSx,
                bgcolor: '#fff',
                color: NO_FILL,
                boxShadow: `inset 0 0 0 4px ${NO_FILL}`,
                '&:hover': { bgcolor: NO_HOVER },
              }}
            >
              <Box
                component="span"
                sx={{
                  fontSize: 'clamp(16px, 3vw, 26px)',
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                CardX didn&apos;t ask
              </Box>
              <Box
                component="span"
                sx={{
                  '--h': 'clamp(40px, 8vw, 64px)',
                  height: 'var(--h)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--h)',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                  letterSpacing: '-0.01em',
                  my: '4px',
                }}
              >
                {money(preview.no_surcharge)}
              </Box>
            </Button>

            <Button
              disableRipple
              disabled={pending}
              onClick={() =>
                onConfirm({
                  card_type: 'credit',
                  card_charged_total: preview.with_surcharge,
                })
              }
              sx={{
                ...choiceSx,
                bgcolor: YES_FILL,
                color: '#fff',
                '&:hover': { bgcolor: YES_PRESS },
              }}
            >
              <Box
                component="span"
                sx={{
                  fontSize: 'clamp(16px, 3vw, 26px)',
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                Surcharged
              </Box>
              <Box
                component="span"
                sx={{
                  '--h': 'clamp(40px, 8vw, 64px)',
                  height: 'var(--h)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  my: '4px',
                }}
              >
                <Box
                  component="span"
                  sx={{ fontSize: 'calc(var(--h) * 0.52)', lineHeight: 1 }}
                >
                  {money(preview.with_surcharge)}
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontSize: 'calc(var(--h) * 0.40)',
                    lineHeight: 1,
                    mt: 'calc(var(--h) * 0.08)',
                  }}
                >
                  +{money(preview.surcharge_amount)} ({percent}%)
                </Box>
              </Box>
            </Button>
          </Box>

          <Button
            disabled={pending}
            onClick={onCancel}
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
            Cancel card payment (void on CardX if it went through)
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
                  ←
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
                  →
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
                Cancel
              </span>
            </Box>
          )}
        </>
      )}
    </Dialog>
  );
}
