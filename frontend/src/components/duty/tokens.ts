/**
 * Routines + Documents chrome. Colours come from `.ai/extended/brand.md`.
 * Brand green is the action and the “good” outcome. Ink is near-black, not navy.
 */
export const dutyColors = {
  paper: '#F3F6F3',
  desk: '#F4F7F5',
  /** Deep sage stage behind the desktop phone — the wings, not the device. */
  stage: '#2e4636',
  stageGlow: '#3f5c46',
  card: '#FFFFFF',
  ink: '#1A1F1C',
  ink60: 'rgba(26,31,28,0.62)',
  ink40: 'rgba(26,31,28,0.40)',
  ink15: 'rgba(26,31,28,0.15)',
  ink08: 'rgba(26,31,28,0.08)',
  brand: '#2e7d32',
  brandDark: '#1b5e20',
  brandSoft: '#E8F5E9',
  brandTint: '#F0F7F0',
  red: '#C0301C',
  amberBg: '#F0C766',
  amberInk: '#4A3200',
  green: '#2e7d32',
  blue: '#2F5FA8',
  violet: '#6A3FA0',
} as const;

export type StatusTagTone = 'red' | 'amber' | 'green' | 'blue' | 'violet' | 'plain';

/** Thin, quiet scrollbar for every routine scroll area. Overlay on phones stays as is. */
export const thinScrollSx = {
  scrollbarWidth: 'thin',
  scrollbarColor: 'rgba(26,31,28,0.22) transparent',
  '&::-webkit-scrollbar': { width: 6, height: 6 },
  '&::-webkit-scrollbar-track': { background: 'transparent' },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: 'rgba(26,31,28,0.22)',
    borderRadius: 999,
  },
  '&:hover::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(26,31,28,0.38)' },
} as const;
