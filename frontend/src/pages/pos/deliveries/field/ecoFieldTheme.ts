import type { DotTone, FieldUiStep } from './fieldStepUtils';

export const ecoField = {
  ink: '#14201A',
  paper: '#FFFFFF',
  green: '#0E8A4E',
  greenDeep: '#0A6B3C',
  greenGlow: '#4BE38A',
  tint: '#E9F6EF',
  line: '#E4E9E6',
  muted: '#66736C',
  amber: '#B45D00',
  amberTint: '#FFF4E3',
  red: '#C6362B',
  redTint: '#FBEAE8',
  map: '#EDF2EE',
  pending: '#C9D4CE',
  pendingSoft: '#F1F4F2',
  radius: 16,
  cardRadius: 26,
  actionRadius: 18,
  summaryRadius: 20,
  shadow: '0 10px 30px rgba(20,32,26,.10)',
  sheetShadow: '0 -12px 40px rgba(20,32,26,.18)',
} as const;

/** Subtle step identity — outline / tint only; status greens stay for outcomes. */
export const ecoFieldStepAccent = {
  days: { accent: '#355C4A', tint: '#F2F6F3' },
  contact: { accent: '#2F6F8F', tint: '#EFF7FA' },
  load: { accent: '#665B8E', tint: '#F5F2FA' },
  routes: { accent: '#355C4A', tint: '#F2F6F3' },
  deliveries: { accent: '#355C4A', tint: '#F2F6F3' },
  finish: { accent: '#0A6B3C', tint: '#E9F6EF' },
} as const;

export type EcoFieldStepKey = keyof typeof ecoFieldStepAccent;

export function ecoFieldStepForUi(step: FieldUiStep): EcoFieldStepKey {
  return step;
}

export type FrameStatusTone = 'ok' | 'warn' | 'bad' | 'muted';

export function frameToneFromDotTone(tone: DotTone): FrameStatusTone {
  if (tone === 'complete') return 'ok';
  if (tone === 'issue') return 'bad';
  if (tone === 'caution') return 'warn';
  return 'muted';
}

export function ecoFieldDotColor(tone: DotTone): string {
  if (tone === 'complete') return ecoField.green;
  if (tone === 'issue') return ecoField.red;
  if (tone === 'caution') return ecoField.amber;
  if (tone === 'active') return ecoField.greenDeep;
  return ecoField.pending;
}

export function ecoFieldDotRing(tone: DotTone): string {
  if (tone === 'complete') return ecoField.tint;
  if (tone === 'issue') return ecoField.redTint;
  if (tone === 'caution') return ecoField.amberTint;
  return '#EEF2F0';
}

export function ecoFieldStatusChipSx(tone: DotTone | FrameStatusTone) {
  if (tone === 'complete' || tone === 'ok') {
    return { bgcolor: ecoField.tint, color: ecoField.greenDeep };
  }
  if (tone === 'issue' || tone === 'bad') {
    return { bgcolor: ecoField.redTint, color: ecoField.red };
  }
  if (tone === 'caution' || tone === 'warn') {
    return { bgcolor: ecoField.amberTint, color: ecoField.amber };
  }
  return { bgcolor: ecoField.pendingSoft, color: ecoField.muted };
}

export const ecoFieldMetaChipSx = {
  bgcolor: ecoField.pendingSoft,
  color: ecoField.muted,
  fontWeight: 750,
} as const;

export const ecoFieldPrimaryButtonSx = {
  minHeight: 58,
  borderRadius: `${ecoField.actionRadius}px`,
  bgcolor: ecoField.green,
  color: '#fff',
  fontSize: 17,
  fontWeight: 800,
  boxShadow: 'none',
  '&:hover': { bgcolor: ecoField.greenDeep, boxShadow: 'none' },
  '&:active': { transform: 'scale(.985)' },
  '&.Mui-disabled': { bgcolor: ecoField.pending, color: '#fff' },
} as const;

export const ecoFieldCardSx = {
  border: `1.5px solid ${ecoField.line}`,
  borderRadius: `${ecoField.cardRadius}px`,
  bgcolor: ecoField.paper,
  boxShadow: ecoField.shadow,
} as const;

/** Compact list / board rows (Contact + Load summaries). */
export const ecoFieldSummaryCardSx = {
  border: `1.5px solid ${ecoField.line}`,
  borderRadius: `${ecoField.summaryRadius}px`,
  bgcolor: ecoField.paper,
  boxShadow: '0 4px 14px rgba(20,32,26,.06)',
  p: 1.5,
  display: 'flex',
  alignItems: 'center',
  gap: 1.25,
  minHeight: 64,
} as const;

/** Denser list rows for Routes (and other long boards). */
export const ecoFieldSummaryCardCompactSx = {
  ...ecoFieldSummaryCardSx,
  p: 1,
  gap: 1,
  minHeight: 52,
  borderRadius: 14,
} as const;

export function ecoFieldSummaryCardCompleteSx(
  complete: boolean,
  density: 'comfortable' | 'compact' = 'comfortable',
) {
  const base = density === 'compact' ? ecoFieldSummaryCardCompactSx : ecoFieldSummaryCardSx;
  if (!complete) return base;
  return {
    ...base,
    border: `1.5px solid ${ecoField.green}`,
    bgcolor: ecoField.tint,
  };
}

/** Soft tint action tiles (Call / Text / Scan). */
export const ecoFieldActionTileSx = {
  minHeight: 76,
  borderRadius: `${ecoField.actionRadius}px`,
  bgcolor: ecoField.tint,
  color: ecoField.greenDeep,
  flexDirection: 'column' as const,
  fontWeight: 800,
  boxShadow: 'none',
  '&:hover': { bgcolor: ecoField.tint, filter: 'brightness(0.97)' },
  '&:active': { transform: 'scale(.985)' },
};

export const ecoFieldSecondaryOutlineSx = {
  minHeight: 52,
  borderRadius: `${ecoField.actionRadius}px`,
  borderWidth: 1.5,
  borderColor: ecoField.line,
  color: ecoField.ink,
  fontWeight: 750,
  touchAction: 'manipulation',
} as const;

export function ecoFieldActionCardSx(step?: EcoFieldStepKey) {
  const accent = step ? ecoFieldStepAccent[step] : null;
  return {
    ...ecoFieldCardSx,
    ...(accent
      ? {
          border: `1.5px solid ${accent.accent}33`,
          boxShadow: `0 10px 28px rgba(20,32,26,.08), inset 0 0 0 1px ${accent.tint}`,
        }
      : {}),
  };
}

export function ecoFieldBucketTone(kind: 'future' | 'past' | 'days' = 'days') {
  if (kind === 'past') {
    return {
      accent: ecoField.ink,
      accentSoft: ecoField.pendingSoft,
      headerBg: `linear-gradient(135deg, ${ecoField.pendingSoft} 0%, #FAFBFA 100%)`,
      rowHover: 'rgba(20, 32, 26, 0.05)',
    };
  }
  const days = ecoFieldStepAccent.days;
  return {
    accent: days.accent,
    accentSoft: days.tint,
    headerBg: `linear-gradient(135deg, ${days.tint} 0%, #F8FCFA 100%)`,
    rowHover: 'rgba(53, 92, 74, 0.06)',
  };
}
