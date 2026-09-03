import { dutyColors } from './tokens';

export const dutyCardSx = {
  bgcolor: dutyColors.card,
  border: `1px solid ${dutyColors.ink15}`,
  borderRadius: '12px',
} as const;

export const dutyHeroSx = {
  bgcolor: dutyColors.brandTint,
  border: `1px solid ${dutyColors.brand}`,
  borderRadius: '12px',
} as const;

export const dutyEmptyPanelSx = {
  flex: 1,
  minHeight: 160,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '10px',
  border: `1px dashed ${dutyColors.ink15}`,
  bgcolor: dutyColors.paper,
} as const;
