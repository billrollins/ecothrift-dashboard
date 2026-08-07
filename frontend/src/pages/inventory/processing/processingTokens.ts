/** Visual tokens - aligned with the broader EcoThrift site palette. */
export const processingTokens = {
  monoFontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  primary: '#2e7d32',
  primaryDark: '#1b5e20',
  ecoBrown: '#b4531f',
  ecoBrownDark: '#8f421a',
  ecoBrownSoft: '#f3e4d5',
  /** Kraft/cardboard action palette - used by quick check-in. */
  cardboardBrown: '#6e6a62',
  cardboardBrownDark: '#524e48',
  cardboardBrownSoft: '#f0eeea',
  cardboardBrownBorder: '#d8d4cc',
  cardboardBrownHover: 'rgba(82, 78, 72, 0.06)',
  primarySoft: '#f0f7f0',
  primarySoftStrong: '#e2f0e2',
  accentGreen: '#2e7d32',
  accentBlue: '#64748b',
  accentAmber: '#9a6a14',
  accentRed: '#c62828',
  blueSoft: '#f1f5f9',
  amberSoft: '#f8efe1',
  redSoft: '#fdecea',
  greenSoft: '#e8f5e9',
  neutralSoft: '#f8fafc',
  searchRing: '0 0 0 3px rgba(46, 125, 50, 0.12)',
  focusRing: '0 0 0 2px rgba(46, 125, 50, 0.28)',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  textSoft: '#475569',
  textMute: '#64748b',
  textStrong: '#0f172a',
  surfaceWarm: '#f8fafc',
  surfaceTint: '#ffffff',
  surfaceRaised: '#ffffff',
  /** Processing workspace hierarchy - site-aligned white/grey with green and kraft accents. */
  orderHeaderBg: '#ffffff',
  orderHeaderBorder: '#e2e8f0',
  orderHeaderText: '#0f172a',
  orderHeaderMutedText: '#64748b',
  statsHeaderBg: '#f8fafc',
  statsHeaderBorder: '#e2e8f0',
  statsHeaderText: '#0f172a',
  rowStatusHeaderBg: '#e8f5e9',
  rowStatusHeaderBorder: '#a5d6a7',
  rowStatusHeaderText: '#1b5e20',
  cardDeckBg: '#f8fafc',
  cardHeaderRowDetailBg: '#f0f7f0',
  cardHeaderRowDetailText: '#1b5e20',
  cardHeaderQuickBg: '#f0eeea',
  cardHeaderQuickText: '#524e48',
  cardHeaderPastBg: '#f1f5f9',
  cardHeaderPastText: '#475569',
  surfaceWarmDark: 'rgba(255,255,255,0.03)',
  surfaceTintDark: 'rgba(255,255,255,0.04)',
  surfaceRaisedDark: 'rgba(255,255,255,0.06)',
  rowHover: '#f8fafc',
  rowHoverDark: 'rgba(255, 255, 255, 0.05)',
  rowSelected: '#e8f5e9',
  rowSelectedDark: 'rgba(255, 255, 255, 0.08)',
  rowSelectedAccent: '#2e7d32',
  rowStripe: '#f8fafc',
  rowStripeDark: 'rgba(255, 255, 255, 0.03)',
  headerGradientStart: '#f8fafc',
  headerGradientEnd: '#f1f5f9',
  headerGradientStartDark: '#262824',
  headerGradientEndDark: '#1b1d1a',
  tableFillerBg: '#f1f5f9',
  tableFillerBgDark: 'rgba(255,255,255,0.04)',
  clearSegmentBg: '#f1f5f9',
  clearSegmentBgDark: 'rgba(255,255,255,0.06)',
  /** Row manifest toolbar - clean white card */
  manifestToolbarSurface: '#ffffff',
  /** Compatibility aliases for existing section code. */
  checkInSurface: '#e8f5e9',
  checkInBorder: '#a5d6a7',
  /** Quick check-in field shells - white on amber header card */
  checkInShellBg: '#ffffff',
} as const;

export type ProcessingPaletteMode = 'light' | 'dark';

export function processingSurfaceWarm(mode: ProcessingPaletteMode): string {
  return mode === 'dark' ? processingTokens.surfaceWarmDark : processingTokens.surfaceWarm;
}

export function processingSurfaceTint(mode: ProcessingPaletteMode): string {
  return mode === 'dark' ? processingTokens.surfaceTintDark : processingTokens.surfaceTint;
}

export function processingHeaderGradient(mode: ProcessingPaletteMode): string {
  return mode === 'dark' ?
      `linear-gradient(180deg, ${processingTokens.headerGradientStartDark} 0%, ${processingTokens.headerGradientEndDark} 100%)`
    : `linear-gradient(180deg, ${processingTokens.headerGradientStart} 0%, ${processingTokens.headerGradientEnd} 100%)`;
}

/** Column count on ProcessingQueueTable - keep in sync with header cells. */
export const PROCESSING_QUEUE_COLUMN_COUNT = 10;
