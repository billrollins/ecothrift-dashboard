import type { SxProps, Theme } from '@mui/material/styles';

/** Typography scoped to preprocessing wizard - aligns with `preprocessing-mockup.jsx` `st`. */
export const preprocessingFonts = {
  sans: '"DM Sans", "Inter", system-ui, sans-serif',
  mono: '"Fira Code", "SF Mono", "Consolas", ui-monospace, monospace',
} as const;

/** Page shell: applies DM Sans + monospace where needed. */
export const preprocessingRootSx: SxProps<Theme> = {
  fontFamily: preprocessingFonts.sans,
  boxSizing: 'border-box',
  minWidth: 0,
  maxWidth: '100%',
  overflowX: 'hidden',
  '& code, & .MuiTableCell-root .MuiTypography-monospace, & pre': {
    fontFamily: preprocessingFonts.mono,
  },
  '& *, & *::before, & *::after': {
    boxSizing: 'border-box',
  },
};

/** Density + type scale for Step 1 and shared preprocessing tables (mock `st`). */
export const preprocessingStep1 = {
  pageTitleSx: {
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.2,
    color: 'primary.dark',
    m: 0,
  } satisfies SxProps<Theme>,
  cardTitleSx: {
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.25,
    color: 'primary.dark',
    m: 0,
  } satisfies SxProps<Theme>,
  cardDescSx: {
    fontSize: 13,
    color: 'text.secondary',
    m: 0,
    mb: 2,
    lineHeight: 1.5,
  } satisfies SxProps<Theme>,
  /** Section/card interior padding (mock `st.card`: 20px). Use on outer card only - never on `width:100%` scroll containers. */
  cardPaddingSx: { p: 2.5 } satisfies SxProps<Theme>,
  /** Full Step 1 card shell (mock `st.card`). Includes border-box so padding cannot widen the layout. */
  cardSurfaceSx: {
    boxSizing: 'border-box',
    bgcolor: '#fff',
    border: '1px solid #DDD5C9',
    borderRadius: '8px',
    p: 2.5,
    mb: 2,
    maxWidth: '100%',
  } satisfies SxProps<Theme>,
  /** Horizontal scroll strip inside a padded card (mock `st.tableWrap`). No extra padding here. */
  tableWrapSx: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '100%',
    overflowX: 'hidden',
  } satisfies SxProps<Theme>,
  /** Horizontal scroll strip - thin scrollbar, stable gutter to avoid layout shift. */
  tableHorizontalScrollSx: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '100%',
    overflowX: 'auto',
    scrollbarGutter: 'stable',
    scrollbarWidth: 'thin',
    scrollbarColor: '#c9c2b6 #f2efe8',
    '&::-webkit-scrollbar': { height: 6 },
    '&::-webkit-scrollbar-track': {
      backgroundColor: '#f2efe8',
      borderRadius: 3,
    },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: '#c9c2b6',
      borderRadius: 3,
    },
  } satisfies SxProps<Theme>,
  /** Mock `st.cardHeader`: title row inside a card. */
  cardHeaderRowSx: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    mb: 1.5,
    gap: 1,
  } satisfies SxProps<Theme>,
  /** Mock `st.templateRow`. */
  templateRowSx: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 1,
    py: '10px',
    px: '14px',
    bgcolor: '#FAFAF6',
    borderRadius: '6px',
    border: '1px solid #EDE8E0',
    mb: 2,
  } satisfies SxProps<Theme>,
  templateDropdownBtnSx: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '4px',
    py: '6px',
    px: '14px',
    minWidth: 240,
    bgcolor: '#fff',
    border: '1px solid #DDD5C9',
    borderRadius: '6px',
    color: '#1B4332',
    textAlign: 'left',
    cursor: 'pointer',
  } satisfies SxProps<Theme>,
  /** Mock `st.badge`. */
  badgeSx: {
    fontSize: 12,
    py: '3px',
    px: '10px',
    borderRadius: '12px',
    bgcolor: '#EDE8E0',
    color: '#666',
    fontWeight: 600,
    flexShrink: 0,
  } satisfies SxProps<Theme>,
  /** Mock `st.badgeMuted`. */
  badgeMutedSx: {
    fontSize: 11,
    py: '2px',
    px: '8px',
    borderRadius: '10px',
    bgcolor: '#f0ece4',
    color: '#999',
    fontWeight: 500,
    flexShrink: 0,
  } satisfies SxProps<Theme>,
  /** Compact headers (mock `st.thSm`). */
  tableHeaderSmallSx: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    color: '#1B4332',
    borderBottom: '2px solid #DDD5C9',
    py: '6px',
    px: '10px',
    bgcolor: '#FAFAF6',
    whiteSpace: 'nowrap',
  } satisfies SxProps<Theme>,
  /** Compact body cells (mock `st.tdSm`). */
  tableBodySmallSx: {
    fontSize: 12,
    py: '5px',
    px: '10px',
    borderBottom: '1px solid #EDE8E0',
    color: '#444',
  } satisfies SxProps<Theme>,
  tableHeaderCellSx: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#1B4332',
    borderBottom: '2px solid #DDD5C9',
    py: '10px',
    px: '12px',
    bgcolor: '#FAFAF6',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  } satisfies SxProps<Theme>,
  tableBodyCellSx: {
    fontSize: 13,
    py: '10px',
    px: '12px',
    borderBottom: '1px solid #EDE8E0',
    color: 'text.primary',
    lineHeight: 1.25,
  } satisfies SxProps<Theme>,
  fieldKeyCaptionSx: {
    fontSize: 10,
    color: 'text.secondary',
    display: 'block',
    lineHeight: 1.2,
    mt: 0.25,
  } satisfies SxProps<Theme>,
  standardFieldLabelSx: {
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.2,
  } satisfies SxProps<Theme>,
  formulaInputSx: {
    '& .MuiOutlinedInput-root': {
      height: 'auto',
    },
    '& .MuiInputBase-root': {
      fontFamily: preprocessingFonts.mono,
      fontSize: 13,
      lineHeight: 1.35,
      py: '7px',
      px: '10px',
      minHeight: 0,
      borderRadius: 1,
      bgcolor: 'background.paper',
    },
    '& .MuiInputBase-input': {
      py: 0,
      px: 0,
      height: 'auto',
      boxSizing: 'border-box',
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: '#DDD5C9',
    },
    '& .MuiFormHelperText-root': {
      fontSize: 11,
      m: 0,
      mt: 0.25,
    },
  } satisfies SxProps<Theme>,
  sampleCellSx: {
    fontSize: 12,
    fontWeight: 500,
    fontFamily: preprocessingFonts.sans,
    wordBreak: 'break-word',
    py: '4px',
    px: '8px',
    borderRadius: 1,
    bgcolor: '#F0F7F4',
    color: '#2D6A4F',
  } satisfies SxProps<Theme>,
  collapsibleTitleSx: {
    fontSize: 14,
    fontWeight: 600,
    color: 'primary.dark',
    textTransform: 'none',
  } satisfies SxProps<Theme>,
} as const;
