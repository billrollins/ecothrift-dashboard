/**
 * Top bar banners (Bill 2026-11-03, Dash Updates #54): "this is not normal" states (viewing as someone, the training
 * register) live in the top bar's empty space between the logo and the clock, never in a band that pushes the page
 * down. One banner shows as is; several take turns, with dots to pick one. The host is a fixed height, so the top bar
 * never changes height and nothing on the page moves.
 *
 * A banner calls `useTopBarBanner(banner)` while its state is on. With no top bar on the screen (a field phone, Thrift+
 * Staff, a test), `useTopBarHost()` is false and the banner draws its own fallback instead.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Box, Button, ButtonBase } from '@mui/material';

export type TopBarBannerTone = 'warning' | 'danger';

export interface TopBarBanner {
  /** One per state, e.g. 'view-as', 'training'. Registering the same kind again replaces it. */
  kind: string;
  /** Desktop words: the main line, and an optional smaller second line. */
  text: string;
  detail?: string;
  /** Phone words: a few words at most. */
  shortText: string;
  action?: { label: string; shortLabel?: string; onClick: () => void; disabled?: boolean };
  /** Higher shows first. */
  priority: number;
  tone: TopBarBannerTone;
}

const TONES: Record<TopBarBannerTone, { bg: string; ink: string; edge: string }> = {
  // The View as yellow and the training register's red over hazard stripes. They carry their own ink, so they read
  // the same in light and dark.
  warning: { bg: '#FFC400', ink: '#111111', edge: '#111111' },
  danger: { bg: '#C62828', ink: '#FFFFFF', edge: 'repeating-linear-gradient(-45deg, #FFD400 0 12px, #111 12px 24px)' },
};

/** The top bar's empty space between the logo and the clock (MainLayout), which holds the host. */
export const TOP_BAR_SLOT_ID = 'top-bar-slot';

/** The host's height: inside the top bar (56 phone, 64 desktop) with room to spare. */
export const TOP_BAR_BANNER_HEIGHT = { xs: 40, sm: 48 } as const;
export const TOP_BAR_ROTATE_MS = 6000;

// A tiny store: banners can register from anywhere (main.tsx, a page) and the host in the top bar reads them.
let banners: TopBarBanner[] = [];
let hosts = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getBanners = () => banners;
const getHasHost = () => hosts > 0;

function setBanner(banner: TopBarBanner) {
  banners = [...banners.filter((b) => b.kind !== banner.kind), banner].sort((a, b) => b.priority - a.priority);
  emit();
}

function clearBanner(kind: string) {
  if (!banners.some((b) => b.kind === kind)) return;
  banners = banners.filter((b) => b.kind !== kind);
  emit();
}

/** True while a top bar with a banner host is on the screen. */
export function useTopBarHost(): boolean {
  return useSyncExternalStore(subscribe, getHasHost, getHasHost);
}

/** Shows `banner` in the top bar while it is not null. Pass null to take it down. */
export function useTopBarBanner(banner: TopBarBanner | null) {
  const kind = banner?.kind;
  // The action's onClick is read through a ref, so a new function each render does not re-register.
  const onClick = useRef(banner?.action?.onClick);
  onClick.current = banner?.action?.onClick;
  const key = banner ? JSON.stringify({ ...banner, action: banner.action && { ...banner.action, onClick: undefined } }) : '';
  useLayoutEffect(() => {
    if (!banner) return undefined;
    setBanner({
      ...banner,
      action: banner.action && { ...banner.action, onClick: () => onClick.current?.() },
    });
    return () => clearBanner(banner.kind);
    // `key` stands for every field of the banner except the onClick handled above.
  }, [key, kind]);
}

/** For tests: start from an empty store. */
export function resetTopBarBanners() {
  banners = [];
  hosts = 0;
  emit();
}

export function TopBarBannerHost() {
  const list = useSyncExternalStore(subscribe, getBanners, getBanners);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Before paint, so a banner on the page below never flashes in its fallback spot first.
  useLayoutEffect(() => {
    hosts += 1;
    emit();
    return () => {
      hosts -= 1;
      emit();
    };
  }, []);

  const count = list.length;
  const shown = count ? Math.min(index, count - 1) : 0;

  useEffect(() => {
    if (count < 2 || paused) return undefined;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), TOP_BAR_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  const banner = list[shown];
  const tone = TONES[banner?.tone ?? 'warning'];

  return (
    <Box
      data-testid="top-bar-banners"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
      sx={(theme) => ({
        // A plain height first (not a media query), then the desktop one: the host is always exactly this tall.
        height: TOP_BAR_BANNER_HEIGHT.xs,
        [theme.breakpoints.up('sm')]: { height: TOP_BAR_BANNER_HEIGHT.sm },
        flexShrink: 0,
        width: '100%',
        maxWidth: 680,
        minWidth: 0,
        display: count ? 'flex' : 'none',
        alignItems: 'center',
        gap: 0.75,
        overflow: 'hidden',
      })}
    >
      {banner ? (
        <Box
          data-testid={`top-bar-banner-${banner.kind}`}
          data-kind={banner.kind}
          sx={{
            flex: 1, minWidth: 0, height: '100%', boxSizing: 'border-box', borderRadius: 1, p: '3px',
            background: tone.edge,
          }}
        >
          <Box
            sx={{
              height: '100%', boxSizing: 'border-box', borderRadius: 0.5, bgcolor: tone.bg, color: tone.ink,
              display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 }, px: { xs: 0.75, sm: 1.5 }, minWidth: 0,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0, textAlign: 'center', lineHeight: 1.15 }}>
              <Box sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 15, fontWeight: 900, letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {banner.text}
              </Box>
              {banner.detail ? (
                <Box sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {banner.detail}
                </Box>
              ) : null}
              {/* Phone: the top bar is tight, so the short words may take two small lines. */}
              <Box
                sx={{
                  display: { xs: '-webkit-box', sm: 'none' }, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  fontSize: 12, lineHeight: 1.1, fontWeight: 900, overflow: 'hidden', overflowWrap: 'break-word',
                }}
              >
                {banner.shortText}
              </Box>
            </Box>
            {banner.action ? (
              <Button
                size="small"
                variant="contained"
                disabled={banner.action.disabled}
                onClick={banner.action.onClick}
                data-testid={`top-bar-banner-action-${banner.kind}`}
                sx={{
                  flexShrink: 0, minHeight: 0, height: { xs: 26, sm: 30 }, minWidth: 0, px: { xs: 0.75, sm: 1.5 }, fontWeight: 800,
                  whiteSpace: 'nowrap', bgcolor: tone.ink, color: tone.bg, boxShadow: 'none',
                  '&:hover': { bgcolor: tone.ink, opacity: 0.85, boxShadow: 'none' },
                }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{banner.action.label}</Box>
                <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>{banner.action.shortLabel ?? banner.action.label}</Box>
              </Button>
            ) : null}
          </Box>
        </Box>
      ) : null}
      {count > 1 ? (
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, flexShrink: 0 }}>
          {list.map((b, i) => (
            <ButtonBase
              key={b.kind}
              aria-label={`Show banner ${i + 1} of ${count}: ${b.shortText}`}
              aria-current={i === shown ? 'true' : undefined}
              data-testid="top-bar-banner-dot"
              onClick={() => setIndex(i)}
              sx={{ width: { xs: 14, sm: 18 }, height: { xs: 14, sm: 24 }, borderRadius: '50%' }}
            >
              <Box
                sx={{
                  width: 8, height: 8, borderRadius: '50%', border: '1.5px solid', borderColor: 'text.primary',
                  bgcolor: i === shown ? 'text.primary' : 'transparent',
                }}
              />
            </ButtonBase>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
