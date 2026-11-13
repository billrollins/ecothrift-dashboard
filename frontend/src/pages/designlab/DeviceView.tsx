/**
 * How a page type is shown in the Design Lab: on a desk, the desktop page and the same page on a phone-sized screen
 * side by side (or one of them); on a real phone, just the page.
 *
 * Each screen answers the theme's breakpoints as if the browser window were the screen's own width (the theme is
 * rebuilt with scaled breakpoints), so a demo's `md`/`sm` rules, useMediaQuery and the phone-table wrapper behave
 * exactly as on that device, and the demo needs no knowledge of the frame. Side by side, the desktop screen is laid
 * out at 1200px (a real desktop) and zoomed down to fit when the column is narrower.
 *
 * Both screens carry a stand-in top bar that names the page: the page body never repeats its title (kit rule).
 */
import { Box, Stack, ThemeProvider, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery } from '@mui/material';
import { createTheme, useTheme, type Theme } from '@mui/material/styles';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import logoIcon from '../../assets/logo-icon-64x64.png';
import StackOnPhone from '../../components/page/StackOnPhone';
import { ecoThemeOptions } from '../../theme/eco';

export type Device = 'both' | 'desktop' | 'phone';

const DEVICES: { id: Device; label: string }[] = [
  { id: 'both', label: 'Side by side' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'phone', label: 'Phone' },
];

const PHONE = { width: 390, height: 780 };
const DESKTOP_WIDTH = 1200;

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setWidth(ref.current.getBoundingClientRect().width);
  }, []);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      setWidth((current) => (Math.abs(current - measured) < 1 ? current : measured));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** The Eco-Thrift theme with breakpoints scaled so window-width queries answer as if the window were `screenWidth`. */
function useScreenTheme(screenWidth: number): Theme {
  const base = useTheme();
  const windowWidth = useWindowWidth();
  return useMemo(() => {
    if (!screenWidth) return base;
    const scale = windowWidth / screenWidth;
    const values = Object.fromEntries(
      Object.entries(base.breakpoints.values).map(([key, value]) => [key, Math.round(value * scale)]),
    ) as Theme['breakpoints']['values'];
    return createTheme({ ...ecoThemeOptions, breakpoints: { values } });
  }, [base, screenWidth, windowWidth]);
}

/** The stand-in for the app's top bar: it, not the page, names the page. */
function TopBar({ title, compact }: { title: string; compact?: boolean }) {
  return (
    <Stack
      direction="row"
      spacing={1.25}
      alignItems="center"
      sx={{ flexShrink: 0, height: compact ? 52 : 56, px: compact ? 1.5 : 2.5, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <Box component="img" src={logoIcon} alt="" sx={{ width: 28, height: 28 }} />
      <Typography variant="h6" component="p" noWrap>{title}</Typography>
    </Stack>
  );
}

/**
 * A desktop screen. `layoutWidth` set: laid out at that width and zoomed to the column (side by side). Not set: the
 * column's own width, as it is.
 */
function DesktopScreen({ title, layoutWidth, children }: { title: string; layoutWidth?: number; children: ReactNode }) {
  const { ref, width } = useMeasuredWidth();
  const virtual = layoutWidth ? Math.max(width, layoutWidth) : width;
  const zoom = width && virtual ? width / virtual : 1;
  const theme = useScreenTheme(virtual);
  return (
    <Box ref={ref} sx={{ minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: '14px', overflow: 'hidden', bgcolor: 'background.default' }}>
      {width ? (
        <ThemeProvider theme={theme}>
          <Box sx={{ width: virtual, zoom }}>
            <TopBar title={title} />
            <StackOnPhone sx={{ p: 3 }}>{children}</StackOnPhone>
          </Box>
        </ThemeProvider>
      ) : null}
    </Box>
  );
}

function PhoneScreen({ title, children }: { title: string; children: ReactNode }) {
  const theme = useScreenTheme(PHONE.width);
  return (
    <Box sx={{ position: { lg: 'sticky' }, top: { lg: 72 }, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
      <Box
        sx={{
          width: PHONE.width + 20,
          height: PHONE.height + 20,
          p: '10px',
          borderRadius: '34px',
          bgcolor: 'text.primary',
          boxShadow: 6,
        }}
      >
        <ThemeProvider theme={theme}>
          <Box sx={{ width: PHONE.width, height: PHONE.height, borderRadius: '26px', overflow: 'hidden', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
            <TopBar title={title} compact />
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
              <StackOnPhone sx={{ p: 1.5, pb: 3 }}>{children}</StackOnPhone>
            </Box>
          </Box>
        </ThemeProvider>
      </Box>
    </Box>
  );
}

export function useDevice(): [Device, (d: Device) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('device');
  const device: Device = raw === 'desktop' || raw === 'phone' ? raw : 'both';
  const set = (d: Device) => {
    const next = new URLSearchParams(params);
    if (d === 'both') next.delete('device');
    else next.set('device', d);
    setParams(next, { replace: true });
  };
  return [device, set];
}

export function DevicePicker() {
  const theme = useTheme();
  const onPhone = useMediaQuery(theme.breakpoints.down('md'));
  const [device, setDevice] = useDevice();
  if (onPhone) return null;
  return (
    <ToggleButtonGroup size="small" exclusive value={device} onChange={(_, d: Device | null) => d && setDevice(d)} aria-label="Show the page at">
      {DEVICES.map((d) => (
        <ToggleButton key={d.id} value={d.id} sx={{ textTransform: 'none', fontWeight: 700, px: 1.5 }}>{d.label}</ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/** One page type, at desktop and phone size. On a real phone: the page as it is, nothing around it. */
export function DeviceView({ title, View }: { title: string; View: ComponentType }) {
  const theme = useTheme();
  const onPhone = useMediaQuery(theme.breakpoints.down('md'));
  const [device] = useDevice();

  if (onPhone) return <StackOnPhone><View /></StackOnPhone>;
  if (device === 'desktop') return <DesktopScreen title={title}><View /></DesktopScreen>;
  if (device === 'phone') return <PhoneScreen title={title}><View /></PhoneScreen>;
  return (
    <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { md: '1fr', lg: `minmax(0, 1fr) ${PHONE.width + 20}px` }, alignItems: 'start' }}>
      <DesktopScreen title={title} layoutWidth={DESKTOP_WIDTH}><View /></DesktopScreen>
      <PhoneScreen title={title}><View /></PhoneScreen>
    </Box>
  );
}
