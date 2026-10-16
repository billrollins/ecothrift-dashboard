/**
 * Thrift+ Staff (owner 2026-10-16): the store phones' home-screen app at dash.ecothrift.us/staff, staff sign-in, to help
 * guests. Its own app beside the member app (Thrift+ Member, from ecothrift.us): its own manifest id and scope
 * (/staff/), name, near-black and amber icon, and dark colour, so one phone can install both.
 *
 * Every job is a button on the bar at the bottom of the screen: Finalize (finish a membership started online), Members
 * (find a member), Scan (the test scanner: a tag's item card as a member sees it) and Join QR (ecothrift.us/join, full
 * screen, for a customer to scan). Tabs switch in place (the address is replaced, never stacked), so the phone's Back
 * never walks through them. While someone is part way through Finalize the bar hides: a customer holding the phone to
 * sign can't open another tab (J13).
 */
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Box, Paper, Typography } from '@mui/material';
import HowToRegRounded from '@mui/icons-material/HowToRegRounded';
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import { useAuth } from '../../../contexts/AuthContext';
import MembersPanel from '../../admin/users/MembersPanel';
import FinalizeThriftPlusPage from '../finalize/FinalizeThriftPlusPage';
import { JoinQrDialog } from '../finalize/finalizeParts';
import { STAFF_APP_HEAD, installAppHead } from '../scanner/installApp';
import StaffScanPage from './StaffScanPage';

/** The app's colours: near-black with amber, nothing like the member app's green. */
export const STAFF_INK = '#111111';
export const STAFF_AMBER = '#F5B700';

type Tab = 'finalize' | 'members' | 'scan';

const TABS: Array<{ value: Tab; label: string; icon: React.ReactNode }> = [
  { value: 'finalize', label: 'Finalize', icon: <HowToRegRounded /> },
  { value: 'members', label: 'Members', icon: <PeopleAltRounded /> },
  { value: 'scan', label: 'Scan', icon: <QrCodeScannerRounded /> },
];

function tabOf(pathname: string): Tab {
  const part = pathname.replace(/^\/staff\/?/, '').split('/')[0];
  return part === 'members' || part === 'scan' ? part : 'finalize';
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

/** Members (owner 2026-10-16: "search members"): Dash's member list and drawer, its phone layout. Managers and up. */
function StaffMembers() {
  const { user } = useAuth();
  const allowed = Boolean(user?.is_superuser) || user?.role === 'Manager' || user?.role === 'Admin';
  return (
    <Box sx={{ px: 2, pt: 'calc(env(safe-area-inset-top, 0px) + 16px)', pb: 2, maxWidth: 720, mx: 'auto', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <Typography variant="h5" fontWeight={800} sx={{ mb: 1.5 }}>Members</Typography>
      {allowed ? (
        <MembersPanel />
      ) : (
        <Typography color="text.secondary" data-testid="staff-members-managers">
          Finding members is for managers. Ask a manager, or use Finalize to find someone who joined online.
        </Typography>
      )}
    </Box>
  );
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
      <Box data-testid="staff-app-content" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
        <Routes>
          <Route index element={<Navigate to="/staff/finalize" replace />} />
          <Route path="finalize" element={<FinalizeThriftPlusPage onMidway={setMidway} />} />
          <Route path="members" element={<StaffMembers />} />
          <Route path="scan" element={<StaffScanPage />} />
          <Route path="*" element={<Navigate to="/staff/finalize" replace />} />
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
          </BottomNavigation>
        </Paper>
      ) : null}
      <JoinQrDialog open={joinQr} onClose={() => setJoinQr(false)} />
    </Box>
  );
}
