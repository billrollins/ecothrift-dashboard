/**
 * The member app's bottom bar (owner 2026-10-20), like the Thrift+ Staff app's: Scan, Bucks, My QR, Account. Each tab is
 * a screen of its own, picked by `?view=` on /scan (the address is replaced, so the phone's Back never walks the tabs):
 * no view = Scan, `bucks`, `qr` (also the old `card` and `join`), `account`. `finish` (Finish joining) is none of them: it
 * is required, so the bar is hidden while it is open, and for non-members who haven't signed in.
 */
import { BottomNavigation, BottomNavigationAction, Box, Paper } from '@mui/material';
import ConfirmationNumberRounded from '@mui/icons-material/ConfirmationNumberRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import { sc, u } from './scannerTheme';

export type MemberTab = 'scan' | 'bucks' | 'qr' | 'account';

/** The bar's height in px (the version tag in the corner lifts above it). */
export const MEMBER_BAR_HEIGHT = 76;

const TABS: Array<{ value: MemberTab; label: string; icon: React.ReactNode }> = [
  { value: 'scan', label: 'Scan', icon: <QrCodeScannerRounded /> },
  { value: 'bucks', label: 'Bucks', icon: <ConfirmationNumberRounded /> },
  { value: 'qr', label: 'My QR', icon: <QrCode2Rounded /> },
  { value: 'account', label: 'Account', icon: <PersonRounded /> },
];

/** The tab an address opens (`?view=`). Anything else, including `finish`, is the scanner underneath. */
export function tabOfView(view: string | null): MemberTab {
  if (view === 'bucks') return 'bucks';
  if (view === 'qr' || view === 'card' || view === 'join') return 'qr';
  if (view === 'account') return 'account';
  return 'scan';
}

/** The `?view=` a tab sets (Scan has none). */
export function viewOfTab(tab: MemberTab): string | null {
  return tab === 'scan' ? null : tab;
}

/** The bar is for signed-in members: never for non-members or while Finish joining (required) is open, or sideways. */
export function memberBarShown({ isMember, view, sideways }: { isMember: boolean; view: string | null; sideways: boolean }): boolean {
  return isMember && view !== 'finish' && !sideways;
}

export function MemberTabBar({ tab, onTab }: { tab: MemberTab; onTab: (tab: MemberTab) => void }) {
  return (
    <Paper
      square
      elevation={0}
      component="nav"
      aria-label="Thrift+"
      data-testid="member-bar"
      sx={{ flexShrink: 0, position: 'relative', zIndex: 40, bgcolor: '#fff', borderTop: `3px solid ${sc.green}`, pb: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <BottomNavigation
        showLabels
        value={tab}
        onChange={(_e, value: MemberTab) => {
          if (value !== tab) onTab(value);
        }}
        sx={{
          height: MEMBER_BAR_HEIGHT, bgcolor: 'transparent', fontFamily: sc.font,
          '& .MuiBottomNavigationAction-root': { color: sc.ink2, minWidth: 0, py: 1 },
          '& .MuiBottomNavigationAction-root.Mui-selected': { color: sc.greenDeep },
          '& .MuiBottomNavigationAction-label': { fontSize: '0.9rem', fontWeight: 700, mt: 0.25, fontFamily: sc.font },
          '& .MuiBottomNavigationAction-label.Mui-selected': { fontSize: '0.95rem' },
          '& .MuiSvgIcon-root': { fontSize: 32 },
        }}
      >
        {TABS.map((t) => (
          <BottomNavigationAction key={t.value} value={t.value} label={t.label} icon={t.icon} data-testid={`member-tab-${t.value}`} />
        ))}
      </BottomNavigation>
    </Paper>
  );
}

/** A tab's screen: fills the space above the bar (and the header), scrolls, with the title in the app's green. */
export function TabScreen({ testId, title, children }: { testId: string; title?: string; children: React.ReactNode }) {
  return (
    <Box
      data-testid={testId}
      sx={{
        position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: 'column', fontFamily: sc.font, color: sc.ink,
        background: `radial-gradient(ellipse at 50% 30%, ${sc.pageLight} 0%, ${sc.page} 70%)`,
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: u(40), pt: `calc(env(safe-area-inset-top, 0px) + ${u(34)})`, pb: u(50) }}>
        {title && <Box component="h2" sx={{ m: 0, mb: u(20), fontFamily: sc.condensed, fontWeight: 700, fontSize: u(56), color: sc.titleGreen }}>{title}</Box>}
        {children}
      </Box>
    </Box>
  );
}
