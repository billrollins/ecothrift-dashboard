import { useState, type ReactNode } from 'react';
import {
  Avatar,
  Badge,
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import BuildCircleOutlined from '@mui/icons-material/BuildCircleOutlined';
import FeedbackOutlined from '@mui/icons-material/FeedbackOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import LockReset from '@mui/icons-material/LockReset';
import Logout from '@mui/icons-material/Logout';
import Person from '@mui/icons-material/Person';
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import StarOutlineRounded from '@mui/icons-material/StarOutlineRounded';
import SummarizeOutlined from '@mui/icons-material/SummarizeOutlined';
import TranslateOutlined from '@mui/icons-material/TranslateOutlined';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { t } from '../../i18n/routines';
import { dashboardTabHref, saveDashboardTab } from '../../navigation/dashboardTabs';
import { resolveNavItems } from '../../navigation/navResolve';
import { ReportFixDialog } from '../dashFixes/ReportFixDialog';
import { sourcePage } from '../dashFixes/rememberPage';
import ChangePasswordDialog from '../users/ChangePasswordDialog';
import ViewAsDialog from '../viewAs/ViewAsDialog';
import { VIEW_AS_BRIGHT, VIEW_AS_INK } from '../viewAs/ViewAsBanner';

/** Section label ink: #1F2937 on white is about 14:1 (needs 4.5:1). */
export const SECTION_LABEL_INK = '#1F2937';

const ROLE_KEYS: Record<string, string> = {
  Employee: 'roleEmployee',
  Manager: 'roleManager',
  Admin: 'roleAdmin',
};

function SectionLabel({ children }: { children: ReactNode }) {
  // One element (a Menu does not take Fragments): the divider above is this row's top border.
  return (
    <ListSubheader
      component="li"
      disableSticky
      sx={{
        bgcolor: 'transparent',
        color: SECTION_LABEL_INK,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        lineHeight: '32px',
        mt: 0.5,
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      {children}
    </ListSubheader>
  );
}

/**
 * The avatar menu is "me" (the HR side): who I am, my day, my schedule, my PIN, my requests, and
 * for the owner the Owner page and Reports. Language, View as and sign out close it.
 */
export function AccountMenu() {
  const { user, logout, setLanguage, viewAs, stopViewAs } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [viewAsOpen, setViewAsOpen] = useState(false);
  // "Ask for an update" remembers the page you were on, not /dash-updates.
  const [reportPage, setReportPage] = useState<string | null>(null);

  if (!user) return null;

  const close = () => setAnchorEl(null);
  const go = (path: string) => {
    close();
    navigate(path);
  };
  const goMyDay = () => {
    saveDashboardTab(user.id, 'myday');
    go(dashboardTabHref('myday'));
  };

  // Role gates come from the catalog: Schedule is Manager / Admin, Owner and Reports are the owner's.
  const [schedule] = resolveNavItems(user, ['schedule']);
  const ownerItems = resolveNavItems(user, ['owner', 'reports']);
  const ownerPage = ownerItems.find((item) => item.id === 'owner');
  const reports = ownerItems.find((item) => item.id === 'reports');
  const roleText = user.role ? (ROLE_KEYS[user.role] ? t(ROLE_KEYS[user.role], lang) : user.role) : '';

  const handleLogout = async () => {
    close();
    await logout();
    navigate('/login');
  };

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={t('accountMenu', lang)}
        aria-haspopup="menu"
        data-testid="account-menu-button"
        sx={{ width: 44, height: 44 }}
      >
        {/* View as: the employee's initials with a small eye badge. */}
        <Badge
          overlap="circular"
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          invisible={!viewAs}
          badgeContent={<VisibilityRounded sx={{ fontSize: 12 }} />}
          data-testid={viewAs ? 'avatar-viewing-badge' : undefined}
          sx={{
            '& .MuiBadge-badge': {
              bgcolor: VIEW_AS_BRIGHT, color: VIEW_AS_INK, border: `2px solid ${VIEW_AS_INK}`,
              minWidth: 20, width: 20, height: 20, p: 0, borderRadius: '50%',
            },
          }}
        >
          <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 14 }}>
            {user.first_name?.[0]}{user.last_name?.[0]}
          </Avatar>
        </Badge>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={close}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { minWidth: 260, maxWidth: 'calc(100vw - 16px)' } } }}
      >
        {viewAs ? (
          <MenuItem
            key="view-as-back"
            data-testid="account-menu-view-as-back"
            onClick={() => {
              close();
              void stopViewAs();
            }}
            sx={{ bgcolor: VIEW_AS_BRIGHT, '&:hover': { bgcolor: '#ffd54f' } }}
          >
            <ListItemIcon><VisibilityRounded fontSize="small" sx={{ color: VIEW_AS_INK }} /></ListItemIcon>
            <ListItemText
              primary={`Back to ${viewAs.real_user.name.split(' ')[0]}`}
              secondary={`Viewing as ${viewAs.target.name} · read only`}
            />
          </MenuItem>
        ) : null}
        <Box key="header" component="li" data-testid="account-menu-header" sx={{ px: 2, py: 1, listStyle: 'none' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3 }}>{user.full_name}</Typography>
          {roleText ? (
            <Typography sx={{ fontSize: 12.5, color: SECTION_LABEL_INK }}>{roleText}</Typography>
          ) : null}
        </Box>

        <SectionLabel key="sec-me">{t('sectionMe', lang)}</SectionLabel>
        <MenuItem key="my-day" data-testid="account-menu-my-day" onClick={goMyDay}>
          <ListItemIcon><SpaceDashboardOutlined fontSize="small" /></ListItemIcon>
          <ListItemText primary={t('myDay', lang)} />
        </MenuItem>
        {schedule ? (
          <MenuItem key="schedule" data-testid="account-menu-schedule" onClick={() => go(schedule.path)}>
            <ListItemIcon><CalendarMonthOutlined fontSize="small" /></ListItemIcon>
            <ListItemText primary={t('schedule', lang)} />
          </MenuItem>
        ) : null}
        <MenuItem key="me" data-testid="account-menu-me" onClick={() => go('/me')}>
          <ListItemIcon><Person fontSize="small" /></ListItemIcon>
          <ListItemText primary={t('myProfilePin', lang)} />
        </MenuItem>

        <SectionLabel key="sec-requests">{t('sectionMyRequests', lang)}</SectionLabel>
        <MenuItem key="supplies" data-testid="account-menu-supplies" onClick={() => go('/supplies')}>
          <ListItemIcon><Inventory2Outlined fontSize="small" /></ListItemIcon>
          <ListItemText primary={t('supplies', lang)} />
        </MenuItem>
        <MenuItem key="dash-fixes" data-testid="account-menu-dash-fixes" onClick={() => go('/dash-updates')}>
          <ListItemIcon><BuildCircleOutlined fontSize="small" /></ListItemIcon>
          <ListItemText primary={t('dashFixes', lang)} />
        </MenuItem>
        <MenuItem
          key="report-fix"
          data-testid="account-menu-report-fix"
          onClick={() => {
            const page = sourcePage(location.pathname);
            close();
            setReportPage(page);
          }}
        >
          <ListItemIcon><FeedbackOutlined fontSize="small" /></ListItemIcon>
          <ListItemText primary={t('reportFix', lang)} />
        </MenuItem>

        {ownerItems.length > 0 ? <SectionLabel key="sec-owner">{t('sectionOwner', lang)}</SectionLabel> : null}
        {ownerPage ? (
          <MenuItem key="owner" data-testid="account-menu-owner" onClick={() => go(ownerPage.path)}>
            <ListItemIcon><StarOutlineRounded fontSize="small" /></ListItemIcon>
            <ListItemText primary={t('ownerPage', lang)} />
          </MenuItem>
        ) : null}
        {reports ? (
          <MenuItem key="reports" data-testid="account-menu-reports" onClick={() => go(reports.path)}>
            <ListItemIcon><SummarizeOutlined fontSize="small" /></ListItemIcon>
            <ListItemText primary={t('reports', lang)} />
          </MenuItem>
        ) : null}

        <Divider key="div-prefs" component="li" sx={{ my: 0.5 }} />
        <MenuItem
          key="language"
          disableRipple
          sx={{ cursor: 'default', py: 1.25, pr: 2, alignItems: 'center' }}
          onClick={(event) => event.stopPropagation()}
        >
          <ListItemIcon><TranslateOutlined fontSize="small" /></ListItemIcon>
          <ListItemText primary={t('language', lang)} />
          <ToggleButtonGroup
            size="small"
            exclusive
            value={lang}
            onClick={(event) => event.stopPropagation()}
            onChange={(_, value) => {
              if (value === 'en' || value === 'es') void setLanguage(value);
            }}
            sx={{
              ml: 2,
              '& .MuiToggleButton-root': { px: 1.5, py: 0.5, minWidth: 44, lineHeight: 1.2 },
            }}
          >
            <ToggleButton value="en">{t('english', lang)}</ToggleButton>
            <ToggleButton value="es">{t('spanish', lang)}</ToggleButton>
          </ToggleButtonGroup>
        </MenuItem>
        {user.is_superuser && !viewAs ? (
          <MenuItem
            key="view-as"
            data-testid="account-menu-view-as"
            onClick={() => {
              close();
              setViewAsOpen(true);
            }}
          >
            <ListItemIcon><VisibilityRounded fontSize="small" /></ListItemIcon>
            <ListItemText primary="View as…" secondary="See Dash as an employee" />
          </MenuItem>
        ) : null}
        <MenuItem
          key="password"
          onClick={() => {
            close();
            setPasswordOpen(true);
          }}
        >
          <ListItemIcon><LockReset fontSize="small" /></ListItemIcon>
          <ListItemText primary={t('changePassword', lang)} />
        </MenuItem>
        <MenuItem key="signout" data-testid="account-menu-sign-out" onClick={handleLogout}>
          <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
          <ListItemText primary={t('signOut', lang)} />
        </MenuItem>
      </Menu>
      <ReportFixDialog open={reportPage !== null} pagePath={reportPage ?? ''} onClose={() => setReportPage(null)} />
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      {user.is_superuser ? <ViewAsDialog open={viewAsOpen} onClose={() => setViewAsOpen(false)} /> : null}
    </>
  );
}
