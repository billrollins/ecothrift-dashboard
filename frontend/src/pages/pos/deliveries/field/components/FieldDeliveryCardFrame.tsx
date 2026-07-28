import { Box, Chip, IconButton, Stack, Typography } from '@mui/material';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import type { DeliveryRunStop } from '../../../../../types/pos.types';
import { stopDisplayName } from '../fieldStepUtils';
import {
  ecoField,
  ecoFieldActionCardSx,
  ecoFieldMetaChipSx,
  ecoFieldStatusChipSx,
  type EcoFieldStepKey,
  type FrameStatusTone,
} from '../ecoFieldTheme';

type Props = {
  stop: DeliveryRunStop;
  statusLabel?: string;
  statusTone?: FrameStatusTone;
  stepAccent?: EcoFieldStepKey;
  onOpenDetails: () => void;
  onOpenItems?: () => void;
  children: React.ReactNode;
};

export function FieldDeliveryCardFrame({
  stop,
  statusLabel,
  statusTone = 'muted',
  stepAccent,
  onOpenDetails,
  onOpenItems,
  children,
}: Props) {
  return (
    <Box
      sx={{
        px: 2,
        pb: 1,
        flex: 1,
        minHeight: 0,
        display: 'flex',
        touchAction: 'pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      <Box
        sx={{
          ...ecoFieldActionCardSx(stepAccent),
          p: 2.25,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehaviorX: 'none',
          touchAction: 'pan-y',
          position: 'relative',
          WebkitOverflowScrolling: 'touch',
          ...(statusTone === 'ok'
            ? {
                border: `1.5px solid ${ecoField.green}`,
                bgcolor: ecoField.tint,
              }
            : {}),
        }}
      >
        <IconButton
          aria-label="Delivery details"
          onClick={onOpenDetails}
          sx={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 40,
            height: 40,
            border: `1px solid ${ecoField.line}`,
            bgcolor: '#fff',
            zIndex: 2,
            touchAction: 'manipulation',
          }}
        >
          <MoreHorizRounded />
        </IconButton>
        <Stack spacing={0.5} sx={{ pr: 5, touchAction: 'pan-y' }}>
          <Typography sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1.05 }}>
            {stopDisplayName(stop)}
          </Typography>
          <Typography color="text.secondary" fontWeight={600}>
            {stop.address}
            {stop.unit ? ` · Unit ${stop.unit}` : ''}
          </Typography>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ pt: 0.5 }}>
            <Chip
              label={`${stop.item_count || stop.stop_items?.length || 0} items`}
              onClick={onOpenItems}
              sx={{
                ...ecoFieldMetaChipSx,
                cursor: onOpenItems ? 'pointer' : 'default',
                touchAction: 'manipulation',
              }}
            />
            {statusLabel && (
              <Chip
                label={statusLabel}
                sx={{ fontWeight: 750, ...ecoFieldStatusChipSx(statusTone) }}
              />
            )}
            {stop.is_apt && (
              <Chip
                label={`Apartment${stop.unit ? ` · ${stop.unit}` : ''}`}
                sx={{ bgcolor: ecoField.amberTint, color: ecoField.amber, fontWeight: 700 }}
              />
            )}
          </Stack>
        </Stack>
        <Box sx={{ mt: 2, touchAction: 'pan-y' }}>{children}</Box>
      </Box>
    </Box>
  );
}
