import type { ReactNode } from 'react';
import { Box, Button, Chip, Typography } from '@mui/material';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import type { SocialPostStatus } from '../../../api/marketing.api';
import { ccTokens } from '../../../theme';
import { useStudioPaths } from './studioPaths';

/**
 * The Studio's one header: eyebrow, page name, the two rooms (Week, Photos), and the page's own actions. In the phone
 * app the bottom bar has the rooms, so only the actions show; on the desk a Phone app link opens `/social` (open it on
 * a phone to put Social Studio on the home screen).
 */
export function StudioHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  const { pathname } = useLocation();
  const paths = useStudioPaths();
  const onPhotos = pathname.startsWith(paths.photos);
  const onNumbers = pathname.startsWith(paths.numbers);
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1,
        mb: 1.5,
      }}
    >
      <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
        <Typography sx={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: ccTokens.ink3 }}>
          Social Studio
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2, fontSize: { xs: 20, md: 24 } }}>{title}</Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
        {!paths.inApp ? (
          <>
            <Button size="small" component={RouterLink} to={paths.week} variant={onPhotos || onNumbers ? 'outlined' : 'contained'}>
              Week
            </Button>
            <Button size="small" component={RouterLink} to={paths.photos} variant={onPhotos ? 'contained' : 'outlined'}>
              Photos
            </Button>
            <Button size="small" component={RouterLink} to={paths.numbers} variant={onNumbers ? 'contained' : 'outlined'}>
              Numbers
            </Button>
            <Button size="small" component={RouterLink} to="/social" title="Open on a phone and add it to the home screen">
              Phone app
            </Button>
          </>
        ) : null}
        {actions}
      </Box>
    </Box>
  );
}

const STATUS_CHIP: Record<SocialPostStatus, { label: string; color: 'default' | 'success' | 'primary' }> = {
  draft: { label: 'Draft', color: 'default' },
  ready: { label: 'Ready', color: 'primary' },
  posted: { label: 'Posted', color: 'success' },
};

export function StatusChip({ status }: { status: SocialPostStatus }) {
  const chip = STATUS_CHIP[status];
  return <Chip size="small" variant={status === 'draft' ? 'outlined' : 'filled'} color={chip.color} label={chip.label} />;
}

/** Page backdrop: sage desk, no wasted width on a wide screen, 12 px gutters on a phone. */
export const pageSx = {
  bgcolor: '#f4f7f5',
  minHeight: '100%',
  px: { xs: 1.5, md: 3 },
  py: { xs: 1.5, md: 2.5 },
} as const;

export function formatDay(iso: string, style: 'short' | 'long' = 'short'): string {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  return day.toLocaleDateString('en-US', style === 'long'
    ? { weekday: 'long', month: 'short', day: 'numeric' }
    : { weekday: 'short', month: 'numeric', day: 'numeric' });
}
