import { dutyColors } from '../../components/duty/tokens';

/** Large-type palette for a tablet read from a few feet away. */
export const kioskColors = {
  bg: '#101613',
  panel: '#182019',
  panelEdge: 'rgba(255,255,255,0.08)',
  ink: '#F3F6F3',
  ink60: 'rgba(243,246,243,0.66)',
  ink40: 'rgba(243,246,243,0.42)',
  brand: '#4CAF50',
  brandDark: dutyColors.brandDark,
  amber: '#F0C766',
  amberInk: '#4A3200',
  red: '#E5533D',
  blue: '#6FA3F0',
  overlayScrim: 'rgba(8,12,10,0.78)',
} as const;

export const chipTone: Record<string, { bg: string; fg: string }> = {
  in: { bg: '#2E7D32', fg: '#fff' },
  break: { bg: '#2F5FA8', fg: '#fff' },
  expected: { bg: 'rgba(243,246,243,0.14)', fg: kioskColors.ink },
  late: { bg: '#B8860B', fg: '#fff' },
  called_in: { bg: 'rgba(229,83,61,0.22)', fg: '#FFB3A8' },
  left: { bg: 'rgba(243,246,243,0.10)', fg: kioskColors.ink60 },
  out: { bg: 'rgba(243,246,243,0.10)', fg: kioskColors.ink60 },
};

export const bigButtonSx = {
  minHeight: 72,
  px: 4,
  borderRadius: 3,
  fontSize: 22,
  fontWeight: 800,
  textTransform: 'none' as const,
  letterSpacing: 0,
};

export const mediumButtonSx = {
  minHeight: 56,
  px: 3,
  borderRadius: 2.5,
  fontSize: 18,
  fontWeight: 700,
  textTransform: 'none' as const,
  letterSpacing: 0,
};
