/** The one dark anchor. Graphite-green, same family as the sage paper below it. */
export const DECK = {
  bg: '#1f2a26',
  bgTop: '#26332e',
  border: '#3a4a43',
  rule: '#33423b',
  ink: '#f4f7f5',
  muted: '#c3d0c8',
  label: '#93a69b',
  faint: '#7c8d84',
  accent: '#7fc79a',
  warn: '#e0b45a',
  danger: '#e79c93',
} as const;

/** Paper. Every panel below the deck. */
export const PANEL = {
  bg: '#ffffff',
  bgZebra: '#fafcfa',
  bgSubtle: '#f2f6f3',
  border: '#dbe4dd',
  borderStrong: '#c2cfc6',
  ink: '#16211c',
  inkMuted: '#4a5a52',
  label: '#5c6f65',
  faint: '#98a79e',
  accent: '#2e7d32',
} as const;

/** Six roles. Nothing on the bench may invent a seventh. */
export const TYPE = {
  micro: {
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
  },
  meta: { fontSize: '11px', fontWeight: 600 },
  body: { fontSize: '13px', fontWeight: 500 },
  value: { fontSize: '14px', fontWeight: 600 },
  title: { fontSize: '20px', fontWeight: 700, letterSpacing: '-0.01em' },
  figure: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontVariantNumeric: 'tabular-nums' as const,
    fontSize: '24px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
} as const;

/** 4px grid. Gaps and padding come from here, as px strings, never MUI units. */
export const SP = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16 } as const;
export const RADIUS = { sm: 6, md: 8, lg: 10 } as const;

/** Fixed slots. Every number here is a no-shift contract. */
export const SLOT = {
  deck: 180,
  paneLabel: 14,
  noteBlock: 32,
  noteMeta: 12,
  noteBody: 19,
  addNote: 32,
  factLabel: 12,
  factValue: 18,
  picker: 30,
  figure: 28,
  figureLabel: 12,
  historyHead: 22,
  historyRow: 30,
  rowAction: 28,
} as const;
