/**
 * Thrift+ Staff (owner 2026-10-16): the store phones' home-screen app at dash.ecothrift.us/staff, staff sign-in, to help
 * guests. Its own app beside the member app (Thrift+ Member, from ecothrift.us): its own manifest id and scope
 * (/staff/), name, near-black and amber icon, and dark colour, so one phone can install both.
 *
 * Every job is a button on the bar at the bottom of the screen: Find (owner 2026-10-20: anyone with Thrift+, by QR, name,
 * phone, email or member number; their ID check and the quick fixes: sign-in QR, retake photo, name and phone), Scan
 * (the test scanner: a tag's item card as a member sees it) and Join QR (ecothrift.us/join, full screen, for a customer
 * to scan) and Me (my details, register PIN, hours, shifts; the Me page). Find took the place of Finalize and Members. Tabs switch in place (the address is replaced, never stacked), so the phone's Back
 * never walks through them. While someone is part way through an ID check the bar hides: a customer holding the phone to
 * sign can't open another tab (J13).
 */
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Box, Paper, Typography } from '@mui/material';
import PersonSearchRounded from '@mui/icons-material/PersonSearchRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import VersionTag from '../../../components/common/VersionTag';
import FinalizeThriftPlusPage from '../finalize/FinalizeThriftPlusPage';
import { JoinQrDialog } from '../finalize/finalizeParts';
import { STAFF_APP_HEAD, installAppHead } from '../scanner/installApp';
import StaffScanPage from './StaffScanPage';
import MePage from '../../me/MePage';
import MessagesPage from '../../messages/MessagesPage';
import { MessagesEnvelope } from '../../../components/messages/MessagesEnvelope';

/** The app's colours: near-black with amber, nothing like the member app's green. */
export const STAFF_INK = '#111111';
export const STAFF_AMBER = '#F5B700';

type Tab = 'find' | 'scan' | 'me';

const TABS: Array<{ value: Tab; label: string; icon: React.ReactNode }> = [
  { value: 'find', label: 'Find', icon: <PersonSearchRounded /> },
  { value: 'scan', label: 'Scan', icon: <QrCodeScannerRounded /> },
];

/** After Join QR on the bar: the person's own page. */
const ME_TAB = { value: 'me' as const, label: 'Me', icon: <PersonRounded /> };

function tabOf(pathname: string): Tab {
  const part = pathname.replace(/^\/staff\/?/, '').split('/')[0];
  // Messages (the envelope at the top) belong with Me.
  return part === 'scan' ? 'scan' : part === 'me' || part === 'messages' ? 'me' : 'find';
}

/** The page head while the app is open: the staff manifest, its iPhone icon and title, the dark theme colour. */
function useStaffAppHead() {
  useEffect(() => {
    const prev = document.title;
    document.title = STAFF_APP_HEAD.title;
    const remove = installAppHead({ ...STAFF_APP_HEAD });
    return () => {
      document.title = prev;
      remove();
    };
  }, []);
}

export default function StaffApp() {
  useStaffAppHead();
  const location = useLocation();
  const navigate = useNavigate();
  const [midway, setMidway] = useState(false);
  const [joinQr, setJoinQr] = useState(false);
  const tab = tabOf(location.pathname);

  return (
    <Box data-testid="staff-app" sx={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      {!midway ? (
        <Box
          component="header"
          sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', px: 1.5, height: 48, bgcolor: STAFF_INK, color: '#fff', pt: 'env(safe-area-inset-top, 0px)' }}
        >
          <Typography fontWeight={800} sx={{ flex: 1, color: STAFF_AMBER }}>Thrift+ Staff</Typography>
          <MessagesEnvelope to="/staff/messages" color="#fff" />
        </Box>
      ) : null}
      <Box data-testid="staff-app-content" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        <Routes>
          <Route index element={<Navigate to="/staff/find" replace />} />
          <Route path="find" element={<FinalizeThriftPlusPage onMidway={setMidway} />} />
          {/* The old addresses (Finalize and Members, until 2026-10-20) open Find. */}
          <Route path="finalize" element={<Navigate to="/staff/find" replace />} />
          <Route path="members" element={<Navigate to="/staff/find" replace />} />
          <Route path="scan" element={<StaffScanPage />} />
          <Route path="me" element={<MePage compact />} />
          <Route path="messages" element={<MessagesPage basePath="/staff/messages" compact />} />
          <Route path="messages/:id" element={<MessagesPage basePath="/staff/messages" compact />} />
          <Route path="*" element={<Navigate to="/staff/find" replace />} />
        </Routes>
      </Box>
      {!midway ? (
        <Paper
          square
          elevation={0}
          component="nav"
          aria-label="Thrift+ Staff"
          sx={{ flexShrink: 0, bgcolor: STAFF_INK, borderTop: `3px solid ${STAFF_AMBER}`, pb: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <BottomNavigation
            showLabels
            value={tab}
            onChange={(_e, value: Tab | 'join') => {
              if (value === 'join') setJoinQr(true);
              else if (value !== tab) navigate(`/staff/${value}`, { replace: true });
            }}
            sx={{
              height: 72, bgcolor: 'transparent',
              '& .MuiBottomNavigationAction-root': { color: 'rgba(255,255,255,0.72)', minWidth: 0, py: 1 },
              '& .MuiBottomNavigationAction-root.Mui-selected': { color: STAFF_AMBER },
              '& .MuiBottomNavigationAction-label': { fontSize: '0.85rem', fontWeight: 700, mt: 0.25 },
              '& .MuiBottomNavigationAction-label.Mui-selected': { fontSize: '0.9rem' },
              '& .MuiSvgIcon-root': { fontSize: 30 },
            }}
          >
            {TABS.map((t) => (
              <BottomNavigationAction key={t.value} value={t.value} label={t.label} icon={t.icon} data-testid={`staff-tab-${t.value}`} />
            ))}
            <BottomNavigationAction value="join" label="Join QR" icon={<QrCode2Rounded />} data-testid="staff-tab-join" />
            <BottomNavigationAction value={ME_TAB.value} label={ME_TAB.label} icon={ME_TAB.icon} data-testid="staff-tab-me" />
          </BottomNavigation>
        </Paper>
      ) : null}
      <VersionTag bottom={midway ? 0 : 76} />
      <JoinQrDialog open={joinQr} onClose={() => setJoinQr(false)} />
    </Box>
  );
}
