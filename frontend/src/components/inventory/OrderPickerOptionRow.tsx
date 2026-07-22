import { Box, Typography } from '@mui/material';
import {
  formatRelevantOrderDateLine,
  orderPickerVendorGlyph,
  type OrderPickerBadgeTone,
  type OrderPickerDateFields,
} from '../../utils/orderPickerDisplay';

export type OrderPickerOptionRowProps = {
  orderNumber: string;
  description?: string | null;
  vendorCode?: string | null;
  dates: OrderPickerDateFields;
  /** Status-colored vendor glyph (Receiving / Processing pickers). */
  badge?: OrderPickerBadgeTone;
  /** Optional mono stack for order number (Processing uses JetBrains-style). */
  monoFontFamily?: string;
  mutedColor?: string;
  /** @deprecated Prefer `badge` — kept for ad-hoc callers. */
  iconBg?: string;
  /** @deprecated Prefer `badge` — kept for ad-hoc callers. */
  iconColor?: string;
};

/**
 * Shared dropdown row: vendor glyph | bold order # + description + most-relevant date.
 */
export function OrderPickerOptionRow({
  orderNumber,
  description,
  vendorCode,
  dates,
  badge,
  monoFontFamily,
  mutedColor = 'text.secondary',
  iconBg = '#ecf6ed',
  iconColor = '#475569',
}: OrderPickerOptionRowProps) {
  const dateLine = formatRelevantOrderDateLine(dates);
  const bg = badge?.iconBg ?? iconBg;
  const fg = badge?.iconColor ?? iconColor;
  const title = badge?.label;

  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, width: '100%', minWidth: 0 }}>
      <Box
        aria-hidden
        title={title}
        sx={{
          width: 32,
          height: 32,
          borderRadius: '7px',
          bgcolor: bg,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: fg,
          flexShrink: 0,
          mt: 0.15,
        }}
      >
        {orderPickerVendorGlyph(vendorCode)}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 800,
            fontFamily: monoFontFamily,
            lineHeight: 1.25,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {orderNumber}
        </Typography>
        <Typography
          sx={{
            fontSize: 11,
            color: mutedColor,
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {description?.trim() || '—'}
        </Typography>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            color: mutedColor,
            lineHeight: 1.3,
            mt: 0.15,
            whiteSpace: 'nowrap',
          }}
        >
          {dateLine}
        </Typography>
      </Box>
    </Box>
  );
}
