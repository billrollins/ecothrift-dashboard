/** Eco-Thrift receiving — aligned with theme.palette.primary.main (#2e7d32); warm sage surfaces */

export const RCV_BRAND = '#2e7d32' as const;
/** theme.palette.primary.light */
export const RCV_PRIMARY_LIGHT = '#60ad5e' as const;
export const RCV_PRIMARY_DARK = '#1b5e20' as const;

export const rcvSurface = {
  /** Main route + workspace backdrop */
  page: '#f4f7f5',
  /** Left chrome column */
  panel: '#fbfcfb',
  /** Pallet card face */
  card: '#fdfdfa',
  /** Thumb / inset wells */
  well: '#f4f8f5',
  /** Inner drop idle */
  dropIdle: '#f9faf8',
  /** Completed row stripe */
  palletHeaderDone: 'rgba(46,125,50,0.06)',
  /** Completed card border-ish green */
  palletDoneStripe: '#c8e6c9',
} as const;

export const rcvBorder = {
  /** Cards, neutral dividers — warm sage grey */
  hairline: '#e5ebe5',
  input: '#d5e2d8',
  panelHairline: '#dde8de',
  /** 1px card outline muted green */
  sageMuted: 'rgba(46, 125, 50, 0.22)',
  sageStrong: 'rgba(46, 125, 50, 0.38)',
  sageDash: 'rgba(46, 125, 50, 0.35)',
  sageDashStrong: 'rgba(46, 125, 50, 0.55)',
} as const;

export const rcvText = {
  body: '#1e293b',
  /** Section headings (DATE & TIME…) */
  sectionLabel: '#3d6840',
  /** Field captions */
  fieldLabel: '#5a6f5e',
  muted: '#7a917c',
  mutedCool: '#94a3b8',
  /** Photo count mid-progress */
  moss: '#558b52',
  subcaption: '#9ca89a',
} as const;

export const rcvAccents = {
  dropHoverFill: 'rgba(46, 125, 50, 0.07)',
  dropHoverStrong: 'rgba(46, 125, 50, 0.12)',
  quickFillGradient: 'linear-gradient(135deg, rgba(246,251,246,1) 0%, rgba(236,246,237,1) 45%, rgba(232,242,232,1) 100%)',
  quickFillIconBg: 'rgba(46,125,50,0.1)',
  cardHoverShadow: '0 8px 24px rgba(46, 125, 50, 0.1)',
  watermark: 'rgba(46, 125, 50, 0.06)',
} as const;

/** Condition chips — good aligns with brand; mixed/damaged unchanged */
export const rcvCondition = {
  good: {
    border: RCV_BRAND,
    bg: 'rgba(46,125,50,0.08)',
    text: RCV_BRAND,
  },
  mixed: { border: '#d97706', bg: 'rgba(217,119,6,0.06)', text: '#d97706' },
  damaged: { border: '#dc2626', bg: 'rgba(220,38,38,0.06)', text: '#dc2626' },
} as const;
