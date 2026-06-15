import { processingTokens } from '../processing/processingTokens';

export type WorkbenchSearchFieldTone = 'order' | 'product';

const toneColors = {
  order: {
    border: '#94a3b8',
    label: '#475569',
  },
  product: {
    border: '#9b8ec4',
    label: '#5b4d8a',
  },
} as const;

/** Amber outline for required pane fields that are not yet filled. */
export const workbenchRequiredIncompleteBorder = '#d97706';

export function workbenchSearchShellSx(
  tone: WorkbenchSearchFieldTone,
  opts?: { incomplete?: boolean },
) {
  const incomplete = opts?.incomplete;
  return {
    px: 0.85,
    py: 0.65,
    borderRadius: 1.25,
    border: incomplete ? '2px solid' : '1.5px solid',
    borderColor: incomplete ? workbenchRequiredIncompleteBorder : toneColors[tone].border,
    bgcolor: '#fff',
    minWidth: 0,
    width: '100%',
    minHeight: 52,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
  } as const;
}

export const workbenchSearchContentSx = {
  display: 'flex',
  alignItems: 'center',
  minHeight: 28,
  flex: 1,
  minWidth: 0,
} as const;

export function workbenchSearchLabelSx(tone: WorkbenchSearchFieldTone) {
  return {
    display: 'block',
    mb: 0.35,
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontSize: '0.58rem',
    color: toneColors[tone].label,
    lineHeight: 1,
  } as const;
}

export const workbenchPaneAutocompleteInputSx = {
  m: 0,
  width: '100%',
  '& input': {
    fontSize: '0.8125rem',
    fontWeight: 700,
    py: 0,
    color: processingTokens.textStrong,
  },
  '& .MuiAutocomplete-inputRoot': {
    py: 0,
    pr: '28px !important',
    bgcolor: '#fff',
    minHeight: '28px !important',
    height: 28,
    alignItems: 'center',
  },
} as const;
