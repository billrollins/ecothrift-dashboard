/**
 * Focus numbers (critic review digest point 4, 2026-10-21): the staff Dashboard shows one number per department, the
 * one that department can move today. The owner picks which (Settings, `dashboard.focus_numbers`).
 */
import { Box, Card, CardContent, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import ShoppingBag from '@mui/icons-material/ShoppingBag';
import PrecisionManufacturing from '@mui/icons-material/PrecisionManufacturing';
import Handyman from '@mui/icons-material/Handyman';
import Storefront from '@mui/icons-material/Storefront';
import type { FocusDepartment, FocusNumber } from '../../types/pos.types';
import { formatDashboardCurrency } from './dashboardFormatters';
import { dashboardAccentLeftSx, dashboardPalette, dashboardRaisedDeptCardSx } from './dashboardCardStyles';

const DEPARTMENTS: Record<FocusDepartment, { label: string; accent: string; icon: ReactNode }> = {
  retail: { label: 'Retail', accent: dashboardPalette.gold, icon: <Storefront fontSize="small" /> },
  processing: { label: 'Processing', accent: dashboardPalette.amber, icon: <PrecisionManufacturing fontSize="small" /> },
  restoration: { label: 'Restoration', accent: dashboardPalette.violet, icon: <Handyman fontSize="small" /> },
  buying: { label: 'Buying', accent: dashboardPalette.teal, icon: <ShoppingBag fontSize="small" /> },
};

export function formatFocusValue(kind: FocusNumber['kind'], value: string | null): string {
  if (value == null) return '-';
  if (kind === 'money') return formatDashboardCurrency(value);
  if (kind === 'percent') return `${value}%`;
  return Number(value).toLocaleString('en-US');
}

/** The small line under the number: what to compare it with. */
export function focusCompareText(focus: FocusNumber): string {
  if (focus.compare_value == null) return focus.compare_label;
  return `${formatFocusValue(focus.kind, focus.compare_value)} ${focus.compare_label}`;
}

export function FocusNumbers({ focus }: { focus: FocusNumber[] }) {
  return (
    <Box
      sx={{
        display: 'grid',
        // Two a row on a phone (all four on one screen), four a row on a wide desktop.
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
        gap: { xs: 1, md: 1.5 },
      }}
    >
      {focus.map((item) => {
        const dept = DEPARTMENTS[item.department];
        return (
          <Card
            key={item.department}
            elevation={0}
            sx={{ borderRadius: 3, ...dashboardRaisedDeptCardSx, ...dashboardAccentLeftSx(dept.accent) }}
            aria-label={`${dept.label}: ${item.label}`}
          >
            <CardContent sx={{ p: { xs: 1.25, md: 1.5 }, '&:last-child': { pb: { xs: 1.25, md: 1.5 } } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: dept.accent, mb: 0.5 }}>
                {dept.icon}
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: dashboardPalette.greenDark }}>{dept.label}</Typography>
              </Box>
              <Typography sx={{ fontSize: { xs: '1.7rem', md: '2.4rem' }, fontWeight: 800, lineHeight: 1.1 }}>
                {formatFocusValue(item.kind, item.value)}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.label}</Typography>
              <Typography variant="caption" sx={{ color: dashboardPalette.muted }}>{focusCompareText(item)}</Typography>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
