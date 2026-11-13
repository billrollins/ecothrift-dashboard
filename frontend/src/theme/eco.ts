/**
 * The Eco-Thrift app theme (Dash Update #134, Design Lab phase 1), built from the sign brand board
 * (design/signage/brand-board.md on lane/brand-board): green, brown and blue around warm neutrals.
 *
 * One file holds every colour, font, radius and shadow. Pages never write a hex code: they use MUI components and
 * the page kit (components/page/PageKit.tsx), which read this theme. To change the look, change a token here, judge
 * it in the Design Lab (/admin/design-lab), then roll it out page by page.
 *
 * Readability beats subtlety (Bill, via Dark Horse): secondary text is about 9:1 on a card, hints at least 4.5:1,
 * no text under 12px. When in doubt, the more legible option.
 *
 * Phase 1: only the Design Lab wears this theme (it wraps itself in a ThemeProvider). The rest of the app still uses
 * theme/index.ts until pages move over, one template at a time.
 */
import { alpha, createTheme, type ThemeOptions } from '@mui/material/styles';

/** Named tokens. Contrast figures are WCAG against a white card unless marked. */
export const eco = {
  // Grounds
  canvas: '#F2F2EE', // page background (board "Page")
  card: '#FFFFFF', // cards, menus, fields (board "Paper")
  fill: '#ECEEE7', // quiet fills: table heads, chips, hover
  line: '#D9DDD3', // hairline borders
  // Type
  ink: '#1B1F1B', // all text, 16.7:1
  inkSoft: '#454B45', // secondary text, 9.0:1 (8.0:1 on canvas)
  inkFaint: '#5F655F', // hints and disabled, 6.0:1
  // Brand
  forest: '#1D5424', // primary: main buttons, links, the selected page, 9.0:1
  forestDeep: '#153E1A', // forest pressed or hovered
  leaf: '#3F9F35', // the one accent: active tab, focus ring, progress, one detail. Never small text (3.4:1)
  mint: '#E7F1E3', // leaf wash: selected rows, the accent behind an icon
  kraft: '#B98E65', // the icon detail (the kraft tag); materials, never text
  oat: '#F1E8DA', // warm paper: a quiet warm panel
  bark: '#4B3424', // dark warm panel, 11.6:1
  denim: '#22406B', // information, 10.4:1
  sky: '#92B6D0', // Thrift+ sky; decoration only
  mist: '#E6EFF5', // denim wash
  // Status: each with a soft wash and a text shade that reads on that wash (4.5:1 or better)
  good: '#2E6B2A', // done, ok, approved, 6.5:1
  goodSoft: '#E4EFE1',
  goodText: '#24561F',
  wait: '#8A5D13', // waiting, needs a look, 5.7:1
  waitSoft: '#F7EDD6',
  waitText: '#6E4A0F',
  problem: '#B3261E', // problem, overdue, delete, 6.5:1
  problemSoft: '#FBE3E0',
  problemText: '#8E1E18',
  info: '#22406B', // new, for your information (denim), 10.4:1
  infoSoft: '#E6EFF5',
  infoText: '#1B3356',
} as const;

export type EcoToken = keyof typeof eco;

/** Title font (Nunito, rounded and friendly, board pairing 1) for titles only; Manrope for everything you read or type. */
export const ecoFonts = {
  title: '"Nunito", "Manrope", "Segoe UI", system-ui, sans-serif',
  body: '"Manrope", "Inter", "Segoe UI", system-ui, sans-serif',
  mono: '"DM Mono", ui-monospace, Consolas, monospace',
} as const;

/** Google Fonts for this theme. Phase 1 loads it from the Design Lab only (useEcoFonts); phase 2 moves it to index.html. */
export const ECO_FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Nunito:wght@700;800;900&display=swap';

/** Three levels of depth only. */
export const ecoShadow = {
  rest: '0 1px 2px rgba(27, 31, 27, 0.06)',
  raised: '0 6px 20px rgba(27, 31, 27, 0.08)',
  overlay: '0 18px 48px rgba(27, 31, 27, 0.16)',
} as const;

const title = { fontFamily: ecoFonts.title, fontWeight: 800, letterSpacing: '-0.005em' } as const;

/** The theme's options, kept so a Design Lab frame can rebuild it with its own breakpoints. */
export const ecoThemeOptions: ThemeOptions = {
  palette: {
    primary: { main: eco.forest, light: '#2F6E37', dark: eco.forestDeep, contrastText: '#FFFFFF' },
    secondary: { main: eco.leaf, light: '#5DB453', dark: '#2F7A2A', contrastText: '#FFFFFF' },
    // Warm-green grey scale: pages written against MUI's greys (grey.50, grey.300) follow the theme as they are.
    grey: {
      50: '#F7F8F4', 100: eco.fill, 200: '#E2E5DD', 300: eco.line, 400: '#B9BEB3',
      500: '#8E948A', 600: '#6B716B', 700: eco.inkSoft, 800: '#2E332E', 900: eco.ink,
    },
    background: { default: eco.canvas, paper: eco.card },
    // Status: `light` is the soft wash and `dark` the text shade that reads on it (the kit's StatusPill uses both).
    success: { main: eco.good, light: eco.goodSoft, dark: eco.goodText, contrastText: '#FFFFFF' },
    warning: { main: eco.wait, light: eco.waitSoft, dark: eco.waitText, contrastText: '#FFFFFF' },
    error: { main: eco.problem, light: eco.problemSoft, dark: eco.problemText, contrastText: '#FFFFFF' },
    info: { main: eco.info, light: eco.infoSoft, dark: eco.infoText, contrastText: '#FFFFFF' },
    text: { primary: eco.ink, secondary: eco.inkSoft, disabled: eco.inkFaint },
    divider: eco.line,
    action: {
      hover: alpha(eco.ink, 0.04),
      selected: alpha(eco.leaf, 0.12),
      focus: alpha(eco.leaf, 0.24),
    },
  },
  typography: {
    fontFamily: ecoFonts.body,
    h1: { ...title, fontSize: '2.5rem', lineHeight: 1.15 },
    h2: { ...title, fontSize: '2rem', lineHeight: 1.2 },
    h3: { ...title, fontSize: '1.625rem', lineHeight: 1.25 },
    h4: { ...title, fontSize: '1.375rem', lineHeight: 1.3 },
    h5: { ...title, fontSize: '1.1875rem', lineHeight: 1.35 },
    h6: { ...title, fontSize: '1.0625rem', lineHeight: 1.4 },
    subtitle1: { fontWeight: 700, fontSize: '0.9375rem' },
    subtitle2: { fontWeight: 700, fontSize: '0.875rem' },
    body1: { fontSize: '0.9375rem', lineHeight: 1.6, fontWeight: 500 },
    body2: { fontSize: '0.875rem', lineHeight: 1.55, fontWeight: 500 },
    // 12.5px: the smallest text anywhere.
    caption: { fontSize: '0.78125rem', lineHeight: 1.5, fontWeight: 500, color: eco.inkSoft },
    overline: { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.1em', lineHeight: 1.6 },
    button: { fontWeight: 700, letterSpacing: '0.01em' },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '::selection': { backgroundColor: eco.mint },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', borderRadius: 999, paddingInline: 18, whiteSpace: 'nowrap' },
        sizeSmall: { paddingInline: 14, '@media (pointer: coarse)': { minHeight: 36 } },
        outlined: { borderColor: eco.line, '&:hover': { borderColor: eco.forest, backgroundColor: alpha(eco.forest, 0.04) } },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        rounded: { borderRadius: 14 },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { borderRadius: 14, border: `1px solid ${eco.line}`, boxShadow: ecoShadow.rest },
      },
    },
    MuiMenu: {
      styleOverrides: { paper: { border: `1px solid ${eco.line}`, boxShadow: ecoShadow.overlay } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 18,
          boxShadow: ecoShadow.overlay,
          '@media (max-width:599.95px)': { margin: 12, width: 'calc(100% - 24px)', maxHeight: 'calc(100% - 24px)' },
        },
        paperFullScreen: { borderRadius: 0, '@media (max-width:599.95px)': { margin: 0, width: '100%', maxHeight: '100%' } },
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { ...title, fontSize: '1.25rem' } } },
    // A text size under 16px makes an iPhone zoom the page when a field is tapped.
    MuiInputBase: {
      styleOverrides: { input: { '@media (max-width:599.95px)': { fontSize: '1rem' } } },
    },
    // Touch: small icon buttons get a finger-sized target.
    MuiIconButton: {
      styleOverrides: { sizeSmall: { '@media (pointer: coarse)': { padding: 9 } } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: eco.line, paddingBlock: 12 },
        head: {
          backgroundColor: 'transparent',
          color: eco.inkSoft,
          fontSize: '0.75rem',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          borderBottom: `1px solid ${eco.line}`,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': { backgroundColor: alpha(eco.leaf, 0.06) },
          '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: eco.mint },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 999 },
        sizeSmall: { height: 24, fontSize: '0.75rem' },
        outlined: { borderColor: eco.line },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: eco.card,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: eco.line },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: eco.inkFaint },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: eco.leaf, borderWidth: 2 },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: { root: { '&.Mui-focused': { color: eco.forest } } },
    },
    MuiTabs: {
      defaultProps: { variant: 'scrollable', scrollButtons: 'auto', allowScrollButtonsMobile: true },
      styleOverrides: {
        root: { minHeight: 44 },
        indicator: { backgroundColor: eco.leaf, height: 3, borderRadius: 3 },
        scrollButtons: { transition: 'width 150ms ease', '&.Mui-disabled': { width: 0 } },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          minHeight: 44,
          color: eco.inkSoft,
          '&.Mui-selected': { color: eco.ink, fontWeight: 800 },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          color: eco.card,
          '&.Mui-checked': { color: eco.card, '& + .MuiSwitch-track': { backgroundColor: eco.good, opacity: 1 } },
        },
        track: { backgroundColor: eco.inkFaint, opacity: 0.6 },
      },
    },
    MuiTooltip: {
      styleOverrides: { tooltip: { backgroundColor: eco.ink, color: eco.card, fontSize: '0.75rem', borderRadius: 8 } },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 6, borderRadius: 999, backgroundColor: eco.fill },
        bar: { borderRadius: 999, backgroundColor: eco.leaf },
      },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: eco.line } } },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 12, fontWeight: 500 },
        standardSuccess: { backgroundColor: eco.goodSoft, color: eco.goodText },
        standardWarning: { backgroundColor: eco.waitSoft, color: eco.waitText },
        standardError: { backgroundColor: eco.problemSoft, color: eco.problemText },
        standardInfo: { backgroundColor: eco.infoSoft, color: eco.infoText },
      },
    },
  },
};

export const ecoTheme = createTheme(ecoThemeOptions);

export default ecoTheme;
