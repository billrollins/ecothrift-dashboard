import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, ButtonBase } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useNavBadgeCounts, useNavBadgeTones } from '../../hooks/useNavBadgeCounts';
import { t } from '../../i18n/routines';
import { FLOOR_TABS } from '../../navigation/floorNav';
import { dashboardTabHref, saveDashboardTab, useDashboardTab } from '../../navigation/dashboardTabs';
import { resolveNavItem } from '../../navigation/navResolve';
import { NavWaitingBadge, type NavBadgeTone } from '../../navigation/NavWaitingBadge';
import type { ResolvedNavItem } from '../../navigation/navTypes';

/** Each tab is this tall (Bill 2026-11-14, #146: at least 48 px to tap). The safe-area inset is added below it. */
export const PHONE_TAB_BAR_HEIGHT = 60;
/** No tab is narrower than this; a longer label makes its tab wider (labels never wrap or cut). */
const TAB_MIN_WIDTH = 76;
const FADE_WIDTH = 28;

/**
 * The phone twin of FloorNav: the seven Home tabs in one row that slides sideways (#146). Each tab is as wide as its
 * full label, the row swipes with the phone's own momentum and settles on a tab edge, and the open tab is scrolled
 * into view. A soft fade at an edge says more tabs wait that way; it only changes opacity, so nothing moves.
 */
export function PhoneTabBar() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const navigate = useNavigate();
  const activeTab = useDashboardTab();
  const badges = useNavBadgeCounts({ onlineSales: false });
  const tones = useNavBadgeTones();
  const scroller = useRef<HTMLDivElement | null>(null);
  const placed = useRef(false);
  const [more, setMore] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setMore((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  // The open tab is always in view: centred when it was hidden or half under an edge, left alone when it shows.
  // `smooth` after the first placement, so a tap glides; the first paint and a turned phone jump straight there.
  const reveal = useCallback(
    (smooth: boolean) => {
      const el = scroller.current;
      const tab = el?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
      if (!el || !tab) return;
      const start = tab.offsetLeft;
      const end = start + tab.offsetWidth;
      const hidden = start < el.scrollLeft + FADE_WIDTH || end > el.scrollLeft + el.clientWidth - FADE_WIDTH;
      if (hidden) {
        const left = Math.max(0, start - (el.clientWidth - tab.offsetWidth) / 2);
        if (smooth && typeof el.scrollTo === 'function') el.scrollTo({ left, behavior: 'smooth' });
        else el.scrollLeft = left;
      }
      measure();
    },
    [activeTab, measure],
  );

  useLayoutEffect(() => {
    reveal(placed.current);
    placed.current = true;
  }, [reveal]);

  // A turned phone or a narrower window: the row's own size changes, so watch the row, not the window.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(() => reveal(false));
    watch.observe(el);
    return () => watch.disconnect();
  }, [reveal]);

  return (
    <Box
      component="nav"
      aria-label={t('dashboard', lang)}
      sx={{
        position: 'relative',
        flexShrink: 0,
        width: '100%',
        pb: 'env(safe-area-inset-bottom)',
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Box
        ref={scroller}
        onScroll={measure}
        data-testid="phone-tab-scroller"
        sx={{
          display: 'flex',
          height: PHONE_TAB_BAR_HEIGHT,
          overflowX: 'auto',
          overflowY: 'hidden',
          // Native momentum; the row settles on a tab edge when it is near one.
          scrollSnapType: 'x proximity',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          px: 0.5,
          scrollPaddingInline: '4px',
        }}
      >
        {FLOOR_TABS.map((tab) => {
          const item = resolveNavItem(tab.navId);
          if (!item) return null;
          const selected = tab.id === activeTab;
          return (
            <ButtonBase
              key={tab.id}
              data-tab={tab.id}
              aria-current={selected ? 'page' : undefined}
              className={selected ? 'Mui-selected' : undefined}
              onClick={() => {
                saveDashboardTab(user?.id, tab.id);
                if (selected) return;
                navigate(dashboardTabHref(tab.id));
              }}
              sx={{
                position: 'relative',
                // Grow to share a wide screen (tablet); never shrink below the full label (phone slides instead).
                flex: '1 0 auto',
                minWidth: TAB_MIN_WIDTH,
                height: PHONE_TAB_BAR_HEIGHT,
                px: 1.5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.5,
                scrollSnapAlign: 'start',
                color: selected ? 'primary.main' : 'text.secondary',
                // The open-tab line has its slot on every tab (transparent when closed), so nothing shifts.
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 12,
                  right: 12,
                  height: 3,
                  borderRadius: '0 0 3px 3px',
                  bgcolor: selected ? 'primary.main' : 'transparent',
                },
              }}
            >
              <TabIcon item={item} count={badges[tab.badgeId ?? tab.navId] ?? 0} tone={tones[tab.badgeId ?? tab.navId]} />
              <Box
                component="span"
                sx={{
                  fontSize: 13,
                  lineHeight: '16px',
                  // Same weight open or closed, so a label never changes width.
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {barLabel(tab.id, tab.labelKey, lang)}
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
      <EdgeFade side="left" show={more.left} />
      <EdgeFade side="right" show={more.right} />
    </Box>
  );
}

/** Bill 2026-11-16: the bar says "TimeClock" (one word). #179 renames the tab everywhere else; until then only the bar. */
function barLabel(id: string, labelKey: string, lang: 'en' | 'es'): string {
  if (id === 'myday' && lang === 'en') return 'TimeClock';
  return t(labelKey, lang);
}

function EdgeFade({ side, show }: { side: 'left' | 'right'; show: boolean }) {
  return (
    <Box
      aria-hidden
      data-testid={`phone-tab-fade-${side}`}
      data-show={show ? 'true' : 'false'}
      sx={{
        position: 'absolute',
        top: 0,
        [side]: 0,
        width: FADE_WIDTH,
        height: PHONE_TAB_BAR_HEIGHT,
        pointerEvents: 'none',
        opacity: show ? 1 : 0,
        transition: 'opacity 160ms ease',
        background: (theme) =>
          `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, ${theme.palette.background.paper}, rgba(255,255,255,0))`,
      }}
    />
  );
}

function TabIcon({ item, count, tone }: { item: ResolvedNavItem; count: number; tone?: NavBadgeTone }) {
  const Icon = item.Icon;
  return (
    <Box sx={{ position: 'relative', width: 24, height: 24 }}>
      <Icon sx={{ fontSize: 24 }} />
      <Box
        sx={{
          position: 'absolute',
          top: -8,
          right: -14,
          width: 18,
          height: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <NavWaitingBadge count={count} tone={tone} />
      </Box>
    </Box>
  );
}
