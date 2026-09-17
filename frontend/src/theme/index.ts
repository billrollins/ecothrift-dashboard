import { createTheme } from '@mui/material/styles';

/** Verbatim from command-center-mock-v2 :root */
export const ccTokens = {
  bg: '#f1f2ee',
  card: '#fff',
  line: '#e2e4dd',
  line2: '#cfd3c9',
  ink: '#22271f',
  ink2: '#5b6356',
  ink3: '#8e948a',
  brand: '#4a7a45',
  brandDeep: '#3a5a3d',
  brandDeeper: '#2f4a32',
  kraft: '#b8955f',
  kraftTint: '#eadfcc',
  kraftDeep: '#6b5335',
  good: '#4a8a47',
  goodTint: '#e4efe1',
  goodText: '#2f6a30',
  warn: '#c98a1e',
  warnTint: '#f7edd6',
  warnText: '#8a5d13',
  bad: '#d92b1f',
  badTint: '#fbe3e0',
  badText: '#b01f14',
  neu: '#8e948a',
  neuTint: '#edeee9',
  r: '12px',
  rSm: '8px',
  shCard: '0 1px 2px rgba(34,39,31,.06), 0 1px 1px rgba(34,39,31,.04)',
  shBand: '0 6px 20px rgba(47,74,50,.22)',
  font: 'Inter, "Segoe UI", system-ui, sans-serif',
} as const;

const theme = createTheme({
  palette: {
    primary: {
      main: '#2e7d32',      // Eco green
      light: '#60ad5e',
      dark: '#1b5e20',
      contrastText: '#fff',
    },
    secondary: {
      main: '#558b2f',
      light: '#85bb5c',
      dark: '#255d00',
      contrastText: '#fff',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
    error: {
      main: '#d32f2f',
    },
    warning: {
      main: '#ed6c02',
    },
    success: {
      main: '#2e7d32',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 600,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiIconButton: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: {
          transition: 'none',
        },
      },
    },
    MuiCheckbox: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: {
          transition: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: ccTokens.card,
          color: ccTokens.ink,
          borderRadius: ccTokens.r,
          border: `1px solid ${ccTokens.line}`,
          boxShadow: '0 12px 32px rgba(16,24,32,.18)',
          fontFamily: ccTokens.font,
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: 15,
          fontWeight: 600,
          color: ccTokens.ink,
        },
      },
    },
  },
});

export default theme;
