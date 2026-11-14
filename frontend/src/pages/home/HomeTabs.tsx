import { lazy, Suspense, type ReactNode } from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { FloorPage } from '../../components/layout/FloorPage';
import { dutyColors } from '../../components/duty/tokens';
import { t } from '../../i18n/routines';
import { useAuth } from '../../hooks/useAuth';
import { ProfileTab } from './ProfileTab';

/*
 * Dash Home tabs beyond Store, Time clock, Routines and HR (Bill 2026-11-13, .ai/extended/home-and-hr-structure.md). This is the
 * skeleton (step 1): Calendar and Profile get their real pages in later Dash Updates; until then each tab shows
 * the pages that exist today so nothing is lost.
 */

const MessagesPage = lazy(() => import('../messages/MessagesPage'));

function useLang(): 'en' | 'es' {
  const { user } = useAuth();
  return user?.language === 'es' ? 'es' : 'en';
}

function Tile({ title, text, to, soon }: { title: string; text: string; to?: string; soon?: boolean }) {
  const navigate = useNavigate();
  const body: ReactNode = (
    <Box sx={{ p: 2, textAlign: 'left', width: '100%' }}>
      <Typography sx={{ fontWeight: 700, fontSize: 17, color: dutyColors.ink }}>{title}</Typography>
      <Typography sx={{ mt: 0.5, fontSize: 14, color: dutyColors.ink60 }}>{text}</Typography>
      {soon ? (
        <Typography sx={{ mt: 1, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: dutyColors.ink60 }}>
          Coming soon
        </Typography>
      ) : null}
    </Box>
  );
  const sx = {
    display: 'flex',
    alignItems: 'stretch',
    borderRadius: '12px',
    border: `1px solid ${dutyColors.ink15}`,
    bgcolor: dutyColors.card,
    minHeight: 104,
  } as const;
  if (!to) return <Box sx={{ ...sx, opacity: 0.75 }}>{body}</Box>;
  return (
    <ButtonBase onClick={() => navigate(to)} sx={{ ...sx, '&:hover': { borderColor: dutyColors.ink60 } }}>
      {body}
    </ButtonBase>
  );
}

const grid = {
  display: 'grid',
  gap: 2,
  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
} as const;

/** Calendar: being designed (store hours and holidays, my shifts, meetings, trucks, sales; filters and presets). */
export function CalendarHomeTab() {
  const lang = useLang();
  return (
    <FloorPage title={t('calendarTab', lang)} subtitle="Store events, my shifts, trucks and meetings in one place">
      <Box sx={grid}>
        <Tile title="Coming soon" text="The calendar is being designed: store hours and holidays, your shifts, meetings, trucks arriving and sales, with filters you can stack." soon />
        <Tile title="This week's schedule" text="Who works when, for now." to="/dashboard?tab=myday&view=everyone" />
      </Box>
    </FloorPage>
  );
}

export function MessagesHomeTab() {
  const lang = useLang();
  return (
    <FloorPage title={t('messagesTab', lang)}>
      <Suspense fallback={<LoadingScreen message="Loading…" />}>
        <MessagesPage />
      </Suspense>
    </FloorPage>
  );
}

/** Profile (#139): my photo, contact, work details and next review (pages/home/ProfileTab.tsx). */
export function ProfileHomeTab() {
  const lang = useLang();
  return (
    <FloorPage title={t('profileTab', lang)}>
      <ProfileTab />
    </FloorPage>
  );
}
