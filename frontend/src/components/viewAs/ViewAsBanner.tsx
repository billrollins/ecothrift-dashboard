/**
 * View as (owner 2026-10-21): the bright band across the top while the owner sees Dash as an employee.
 * "Viewing as Maria K (Processing Associate) · signed in as Bill · Back to Bill". On every screen, Dash and Thrift+
 * Staff alike. Where there is a top bar it lives in the bar's empty space (Dash Updates #54), so nothing moves. Where
 * there is none (Thrift+ Staff, a field phone) it is a band across the top and sets `--view-as-band` (its height) on
 * the page so the app shells start below it.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import { useAuth } from '../../contexts/AuthContext';
import { useTopBarBanner, useTopBarHost } from '../layout/TopBarBanners';

export const VIEW_AS_BAND_VAR = '--view-as-band';
export const VIEW_AS_INK = '#111111';
export const VIEW_AS_BRIGHT = '#FFC400';

function endsAt(iso: string): string {
  const when = new Date(iso);
  return Number.isNaN(when.getTime()) ? '' : when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function ViewAsBanner() {
  const { viewAs, stopViewAs } = useAuth();
  const ref = useRef<HTMLDivElement | null>(null);
  const [leaving, setLeaving] = useState(false);
  const hasHost = useTopBarHost();
  const owner = viewAs ? viewAs.real_user.name.split(' ')[0] || viewAs.real_user.name : '';
  const ends = viewAs ? endsAt(viewAs.expires_at) : '';
  const leave = () => {
    setLeaving(true);
    void stopViewAs();
  };

  useTopBarBanner(viewAs && hasHost ? {
    kind: 'view-as',
    text: `Viewing as ${viewAs.target.name} (${viewAs.target.job})`,
    detail: `Signed in as ${owner} · read only${ends ? ` · ends ${ends}` : ''}`,
    shortText: `Viewing ${viewAs.target.name}`,
    action: { label: `Back to ${owner}`, shortLabel: 'Back', onClick: leave, disabled: leaving },
    priority: 30,
    tone: 'warning',
  } : null);

  useEffect(() => {
    const root = document.documentElement;
    const node = ref.current;
    if (!viewAs || hasHost || !node) {
      root.style.removeProperty(VIEW_AS_BAND_VAR);
      return undefined;
    }
    const measure = () => root.style.setProperty(VIEW_AS_BAND_VAR, `${node.offsetHeight}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(VIEW_AS_BAND_VAR);
    };
  }, [viewAs, hasHost]);

  if (!viewAs || hasHost) return null;

  return (
    <Box
      ref={ref}
      role="status"
      data-testid="view-as-banner"
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        // Above the app bar and sidebar; dialogs still open over it.
        zIndex: (theme) => theme.zIndex.drawer + 1,
        bgcolor: VIEW_AS_BRIGHT,
        color: VIEW_AS_INK,
        borderBottom: `3px solid ${VIEW_AS_INK}`,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, md: 1.5 },
        px: { xs: 1.5, md: 2.5 },
        py: { xs: 0.75, md: 0.5 },
        pt: { xs: 'calc(env(safe-area-inset-top, 0px) + 6px)', md: 0.5 },
        minHeight: { xs: 52, md: 44 },
      }}
    >
      <VisibilityRounded sx={{ fontSize: { xs: 22, md: 24 }, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, columnGap: 1 }}>
        {/* Desktop: one line. Phone: "Viewing as Maria K" over "Processing Associate · read only"; Back names the owner. */}
        <Typography component="span" sx={{ fontWeight: 800, fontSize: { xs: '0.95rem', md: '1rem' }, lineHeight: 1.25 }} noWrap>
          Viewing as {viewAs.target.name}
          <Box component="span" sx={{ display: { xs: 'none', md: 'inline' }, fontWeight: 600 }}> ({viewAs.target.job})</Box>
        </Typography>
        <Typography component="span" sx={{ fontSize: { xs: '0.8rem', md: '0.95rem' }, lineHeight: 1.25 }} noWrap>
          <Box component="span" sx={{ display: { xs: 'inline', md: 'none' } }}>{viewAs.target.job} · read only</Box>
          <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
            · signed in as {owner} · read only{ends ? ` · ends ${ends}` : ''}
          </Box>
        </Typography>
      </Box>
      <Button
        variant="contained"
        size="small"
        disabled={leaving}
        onClick={leave}
        data-testid="view-as-back"
        sx={{
          flexShrink: 0,
          bgcolor: VIEW_AS_INK,
          color: '#fff',
          fontWeight: 800,
          minHeight: 36,
          px: { xs: 1.5, md: 2 },
          whiteSpace: 'nowrap',
          '&:hover': { bgcolor: '#333' },
        }}
      >
        Back to {owner}
      </Button>
    </Box>
  );
}
