import { Box, ThemeProvider, createTheme, useTheme } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Phone-first pages are drawn once, at phone size, and never grow a second
 * desktop layout. On a desk we show that same page inside a portrait device
 * frame instead of stretching it across the window.
 *
 * The frame fills the available height and takes its width from the aspect
 * ratio, so it is fixed for the life of the screen - nothing inside it can
 * change the frame's size and shift the page.
 */
export const PHONE_ASPECT_RATIO = '9 / 20';

const DESK_BACKDROP = '#D8DCE4';

/**
 * Breakpoints scaled so window-width media queries answer as if the window
 * were the frame's width.
 *
 * Every `useMediaQuery(theme.breakpoints.down('md'))` and every responsive
 * `sx={{ xs: 1, md: 3 }}` inside the frame measures the real window, not the
 * frame. Multiplying each breakpoint by `window / frame` makes those queries
 * resolve to the phone answer, so a page needs no knowledge of the frame.
 */
function useViewportScaledTheme(frameWidth: number, enabled: boolean): Theme {
  const base = useTheme();
  const [windowWidth, setWindowWidth] = useState(
    () => (typeof window === 'undefined' ? 0 : window.innerWidth),
  );

  useEffect(() => {
    if (!enabled) return;
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [enabled]);

  return useMemo(() => {
    if (!enabled || !frameWidth || !windowWidth || frameWidth >= windowWidth) return base;
    const scale = windowWidth / frameWidth;
    const values = Object.fromEntries(
      Object.entries(base.breakpoints.values).map(([key, value]) => [key, Math.round(value * scale)]),
    ) as Theme['breakpoints']['values'];
    return createTheme(base, { breakpoints: { values } });
  }, [base, enabled, frameWidth, windowWidth]);
}

function useMeasuredWidth(enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  // Measured before paint, so a page never shows one frame of its desktop
  // layout while waiting on the observer.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return;
    setWidth(node.getBoundingClientRect().width);
  }, [enabled]);

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      setWidth((current) => (Math.abs(current - measured) < 1 ? current : measured));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return { ref, width };
}

export function PhoneFrame({
  framed,
  background,
  contentSx,
  deskBackground,
  flush,
  stage,
  inset,
  children,
}: {
  /** False on a real phone, where the page already owns the whole screen. */
  framed: boolean;
  background: string;
  contentSx?: SxProps<Theme>;
  /** Colour behind the device. Defaults to the desk slab. */
  deskBackground?: string;
  /** Run the device the full height of the pane: no gutter, no rounded shell. */
  flush?: boolean;
  /** Dark stage behind a flush device - spotlight, not a desk slab. */
  stage?: boolean;
  /** Round the stage and keep a gutter so the phone sits inside a framed panel. */
  inset?: boolean;
  children: ReactNode;
}) {
  const { ref, width } = useMeasuredWidth(framed);
  const scaledTheme = useViewportScaledTheme(width, framed);

  const page = (
    <ThemeProvider theme={scaledTheme}>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflowX: 'hidden',
          overflowY: 'auto',
          ...contentSx,
        }}
      >
        {children}
      </Box>
    </ThemeProvider>
  );

  if (!framed) {
    return (
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background }}>
        {page}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'stretch',
        p: flush ? 0 : 2,
        borderRadius: inset ? '16px' : 0,
        overflow: inset ? 'hidden' : undefined,
        background: stage
          ? 'radial-gradient(ellipse 75% 95% at 50% 40%, #3f5c46 0%, #2e4636 55%, #22352a 100%)'
          : (deskBackground ?? DESK_BACKDROP),
      }}
    >
      <Box
        ref={ref}
        sx={{
          flex: '0 0 auto',
          height: '100%',
          width: 'auto',
          aspectRatio: PHONE_ASPECT_RATIO,
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background,
          ...(flush
            ? stage
              ? {
                  borderLeft: '1px solid rgba(255,255,255,0.18)',
                  borderRight: '1px solid rgba(255,255,255,0.18)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.25), 0 20px 60px rgba(0,0,0,0.35)',
                }
              : {
                  borderLeft: '1px solid rgba(15,23,42,0.10)',
                  borderRight: '1px solid rgba(15,23,42,0.10)',
                  boxShadow: '0 0 60px rgba(15,23,42,0.10)',
                }
            : {
                borderRadius: '18px',
                border: '1px solid rgba(15,23,42,0.22)',
                boxShadow: '0 18px 44px rgba(15,23,42,0.20)',
              }),
        }}
      >
        {page}
      </Box>
    </Box>
  );
}
