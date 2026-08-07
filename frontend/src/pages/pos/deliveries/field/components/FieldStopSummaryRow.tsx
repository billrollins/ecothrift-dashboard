import { Box, Chip, Stack, Typography } from '@mui/material';
import CheckRounded from '@mui/icons-material/CheckRounded';
import type { DeliveryRunStop } from '../../../../../types/pos.types';
import { stopDisplayName, type DotTone } from '../fieldStepUtils';
import {
  ecoField,
  ecoFieldDotColor,
  ecoFieldStatusChipSx,
  ecoFieldSummaryCardCompleteSx,
} from '../ecoFieldTheme';

type Props = {
  stop: DeliveryRunStop;
  tone: DotTone;
  /** Primary line right of the name, e.g. "3 items". */
  titleMeta?: string;
  /** Second line - address or truncated item summary. */
  subtitle: string;
  statusLabel?: string;
  /** Nested controls (inline status/actions). Clicks should stop propagation. */
  trailing?: React.ReactNode;
  complete?: boolean;
  /** Full-card activation - opens the stop action card / decision surface. */
  onActivate?: () => void;
  /** When set with statusLabel, status chip is clickable (inline edit) and does not activate the card. */
  onStatusClick?: () => void;
  disabled?: boolean;
  /** Routes uses compact; Contact/Load/Finish keep the default comfortable size. */
  density?: 'comfortable' | 'compact';
};

/**
 * Compact summary card. Whole card is the primary hit target; nested status/actions
 * use stopPropagation so inline edits do not open the action card.
 */
export function FieldStopSummaryRow({
  stop,
  tone,
  titleMeta,
  subtitle,
  statusLabel,
  trailing,
  complete = tone === 'complete',
  onActivate,
  onStatusClick,
  disabled = false,
  density = 'comfortable',
}: Props) {
  const interactive = Boolean(onActivate) && !disabled;
  const compact = density === 'compact';
  const dotSize = compact ? 18 : 22;

  const activate = () => {
    if (!interactive) return;
    onActivate?.();
  };

  return (
    <Box
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-disabled={interactive ? disabled : undefined}
      onClick={activate}
      onKeyDown={(event) => {
        if (!interactive) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      }}
      sx={{
        ...ecoFieldSummaryCardCompleteSx(complete, density),
        cursor: interactive ? 'pointer' : 'default',
        transition: 'transform 120ms ease, box-shadow 120ms ease, filter 120ms ease',
        ...(interactive
          ? {
              '&:hover': { filter: 'brightness(0.985)', boxShadow: '0 6px 18px rgba(20,32,26,.1)' },
              '&:active': { transform: 'scale(.985)' },
              '&:focus-visible': {
                outline: `2px solid ${ecoField.green}`,
                outlineOffset: 2,
              },
            }
          : {}),
        ...(disabled ? { opacity: 0.72 } : {}),
      }}
    >
      <Box
        sx={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          bgcolor: complete ? ecoField.green : ecoFieldDotColor(tone),
          color: '#fff',
        }}
      >
        {complete ? (
          <CheckRounded sx={{ fontSize: compact ? 12 : 14, fontWeight: 800 }} />
        ) : (
          <Box
            sx={{
              width: compact ? 6 : 8,
              height: compact ? 6 : 8,
              borderRadius: '50%',
              bgcolor: '#fff',
              opacity: 0.9,
            }}
          />
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="baseline" spacing={0.75} sx={{ minWidth: 0 }}>
          <Typography fontWeight={800} noWrap sx={{ minWidth: 0 }}>
            {stopDisplayName(stop)}
          </Typography>
          {titleMeta && (
            <Typography
              variant="caption"
              fontWeight={750}
              noWrap
              sx={{ color: complete ? ecoField.greenDeep : ecoField.muted, flexShrink: 0 }}
            >
              {titleMeta}
            </Typography>
          )}
        </Stack>
        <Typography
          variant="caption"
          noWrap
          display="block"
          sx={{ color: complete ? ecoField.greenDeep : 'text.secondary', fontWeight: 650 }}
        >
          {subtitle}
        </Typography>
      </Box>
      {(statusLabel || trailing) && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          sx={{ flexShrink: 0, maxWidth: '46%' }}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {statusLabel && (
            <Chip
              size="small"
              label={statusLabel}
              onClick={
                onStatusClick
                  ? (event) => {
                      event.stopPropagation();
                      onStatusClick();
                    }
                  : undefined
              }
              sx={{
                height: 22,
                fontWeight: 750,
                ...ecoFieldStatusChipSx(tone),
                ...(onStatusClick
                  ? {
                      cursor: 'pointer',
                      '&:hover': { filter: 'brightness(0.96)' },
                    }
                  : {}),
              }}
            />
          )}
          {trailing}
        </Stack>
      )}
    </Box>
  );
}
