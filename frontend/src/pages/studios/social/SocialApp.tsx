/**
 * Social Studio as a home-screen app (owner 2026-10-22, F7): dash.ecothrift.us/social, staff sign-in, its own manifest
 * id and scope (/social/), name, icon and brand green, so it installs beside Thrift+ Staff on one phone. The same
 * pages as Studios → Social Studio in Dash.
 *
 * Every job is a button on the bar at the bottom, so staff flick through: **Post** (today's post), **Photos** (the
 * library: take and file photos all week), **Scan** (scan a tag with the camera, then photograph the item), **Schedule**
 * (the week) and **Me**. Tabs switch in place (the address is replaced, never stacked), so the phone's Back never
 * walks through them. A post opened from the Schedule keeps Schedule lit.
 */
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Alert, BottomNavigation, BottomNavigationAction, Box, Button, CircularProgress, Paper, Typography } from '@mui/material';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import PhotoLibraryRounded from '@mui/icons-material/PhotoLibraryRounded';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import { useQuery } from '@tanstack/react-query';
import VersionTag from '../../../components/common/VersionTag';
import { getTodaysPost } from '../../../api/marketing.api';
import MePage from '../../me/MePage';
import { canInstall, installAppHead, installPrompt, isStandalone } from '../../thriftplus/scanner/installApp';
import SocialPhotosPage from './SocialPhotosPage';
import SocialPostEditorPage from './SocialPostEditorPage';
import SocialScanPage from './SocialScanPage';
import SocialStudioPage from './SocialStudioPage';
import { pageSx } from './socialParts';
import { APP_PATHS, StudioPathsContext } from './studioPaths';

export const SOCIAL_GREEN = '#1b5e20';
export const SOCIAL_LIGHT = '#c8e6c9';

export const SOCIAL_APP_HEAD = {
  manifest: '/social/manifest.webmanifest',
  icon: '/social/icons/apple-touch-icon.png',
  title: 'Social Studio',
  theme: SOCIAL_GREEN,
} as const;

export type SocialTab = 'post' | 'photos' | 'scan' | 'week' | 'me';

export const SOCIAL_TABS: Array<{ value: SocialTab; label: string; icon: React.ReactNode }> = [
  { value: 'post', label: 'Post', icon: <EditNoteRounded /> },
  { value: 'photos', label: 'Photos', icon: <PhotoLibraryRounded /> },
  { value: 'scan', label: 'Scan', icon: <QrCodeScannerRounded /> },
  { value: 'week', label: 'Schedule', icon: <CalendarMonthRounded /> },
  { value: 'me', label: 'Me', icon: <PersonRounded /> },
];

export function socialTabOf(pathname: string): SocialTab {
  const [part, id] = pathname.replace(/^\/social\/?/, '').split('/');
  if (part === 'post') return id ? 'week' : 'post'; // a post opened from the Schedule keeps Schedule lit
  if (part === 'photos' || part === 'scan' || part === 'week' || part === 'me') return part;
  return 'post';
}

/** The page head while the app is open: the manifest, its iPhone icon and title, the brand green. */
function useSocialAppHead() {
  useEffect(() => {
    const prev = document.title;
    document.title = SOCIAL_APP_HEAD.title;
    const remove = installAppHead({ ...SOCIAL_APP_HEAD });
    return () => {
      document.title = prev;
      remove();
    };
  }, []);
}

/** Install on a phone that offers it (Android's prompt), or the iPhone's Share → Add to Home Screen hint. */
function InstallHint() {
  const [, setTick] = useState(0);
  useEffect(() => installPrompt.listen(() => setTick((t) => t + 1)), []);
  if (isStandalone()) return null;
  const how = canInstall();
  if (how === 'prompt') {
    return (
      <Button size="small" variant="contained" onClick={() => installPrompt.show()} sx={{ bgcolor: '#fff', color: SOCIAL_GREEN, '&:hover': { bgcolor: SOCIAL_LIGHT } }}>
        Install
      </Button>
    );
  }
  if (how === 'ios') return <Typography sx={{ fontSize: 12, color: SOCIAL_LIGHT }}>Share → Add to Home Screen</Typography>;
  return null;
}

/** The Post tab: today's post, or what to do on a day without one. */
function TodayPost() {
  const navigate = useNavigate();
  const today = useQuery({ queryKey: ['marketing', 'today'], queryFn: getTodaysPost });
  if (today.isLoading) return <Box sx={{ ...pageSx, display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>;
  if (today.isError) return <Box sx={pageSx}><Alert severity="error">Could not load today's post.</Alert></Box>;
  const post = today.data?.post;
  if (!post) {
    return (
      <Box sx={pageSx}>
        <Alert severity="info" action={<Button color="inherit" size="small" onClick={() => navigate('/social/week', { replace: true })}>Schedule</Button>}>
          No post today. Take photos for the next one, or open a day on the Schedule.
        </Alert>
      </Box>
    );
  }
  return <SocialPostEditorPage key={post.id} postId={post.id} />;
}

export default function SocialApp() {
  useSocialAppHead();
  const location = useLocation();
  const navigate = useNavigate();
  const tab = socialTabOf(location.pathname);

  return (
    <StudioPathsContext.Provider value={APP_PATHS}>
      <Box data-testid="social-app" sx={{ position: 'fixed', inset: 0, top: 'var(--view-as-band, 0px)', display: 'flex', flexDirection: 'column', bgcolor: '#f4f7f5' }}>
        <Box
          component="header"
          sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1, px: 1.5, minHeight: 48, bgcolor: SOCIAL_GREEN, color: '#fff', pt: 'env(safe-area-inset-top, 0px)' }}
        >
          <Typography fontWeight={800} sx={{ flex: 1 }}>Social Studio</Typography>
          <InstallHint />
        </Box>
        <Box data-testid="social-app-content" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
          <Routes>
            <Route index element={<Navigate to="/social/post" replace />} />
            <Route path="post" element={<TodayPost />} />
            <Route path="post/:id" element={<SocialPostEditorPage />} />
            <Route path="photos" element={<SocialPhotosPage />} />
            <Route path="scan" element={<SocialScanPage />} />
            <Route path="week" element={<SocialStudioPage />} />
            <Route path="me" element={<MePage compact />} />
            <Route path="*" element={<Navigate to="/social/post" replace />} />
          </Routes>
        </Box>
        <Paper
          square
          elevation={0}
          component="nav"
          aria-label="Social Studio"
          sx={{ flexShrink: 0, bgcolor: SOCIAL_GREEN, pb: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <BottomNavigation
            showLabels
            value={tab}
            onChange={(_e, value: SocialTab) => {
              if (value !== tab || location.pathname.startsWith('/social/post/')) navigate(`/social/${value}`, { replace: true });
            }}
            sx={{
              height: 68, bgcolor: 'transparent',
              '& .MuiBottomNavigationAction-root': { color: 'rgba(255,255,255,0.75)', minWidth: 0, py: 1 },
              '& .MuiBottomNavigationAction-root.Mui-selected': { color: '#fff' },
              '& .MuiBottomNavigationAction-label': { fontSize: '0.8rem', fontWeight: 700, mt: 0.25 },
              '& .MuiBottomNavigationAction-label.Mui-selected': { fontSize: '0.85rem' },
              '& .MuiSvgIcon-root': { fontSize: 28 },
            }}
          >
            {SOCIAL_TABS.map((t) => (
              <BottomNavigationAction key={t.value} value={t.value} label={t.label} icon={t.icon} data-testid={`social-tab-${t.value}`} />
            ))}
          </BottomNavigation>
        </Paper>
        <VersionTag bottom={72} />
      </Box>
    </StudioPathsContext.Provider>
  );
}
