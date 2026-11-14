/**
 * HR (Bill, Dash Updates #56, 2026-11-03): one HR app on the avatar menu, all in one place. Step 1 is the shell: tabs
 * around the HR pages Dash already has, each with its own URL (/hr/<tab>/<section>). A tab or section shows when the
 * person can open its page (the same permission dials as the sidebar), so staff see Me and Schedule, managers also
 * People, Hiring and Onboarding, and the owner Time & payroll. Requests (#59) is first: every HR request in one place.
 * Its Documents section (#62, the owner) sends documents to staff to e-sign; staff sign theirs on Requests.
 * Incidents (#131): anyone reports an incident on site; managers and the owner follow up.
 * The split (#140, Bill 2026-11-13, .ai/extended/home-and-hr-structure.md decision 6): the managers' pages (People,
 * Hiring, Onboarding, Time & payroll) live in the HR workspace sidebar only, so this page is everyone's own HR. The
 * week is read on Home > Time clock > Everyone (#137) and built in the HR workspace, so the Schedule tab went too. An
 * old /hr address of a page that moved lands on the page itself (MOVED).
 */
import { Box, LinearProgress, Tab, Tabs, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { resolveNavItems, type NavAccessUser } from '../../navigation/navResolve';

const HrRequests = lazy(() => import('./HrRequests'));
const HrIncidents = lazy(() => import('./HrIncidents'));
const HrDocumentsPage = lazy(() => import('../esign/HrDocumentsPage'));
const MePage = lazy(() => import('../me/MePage'));

type Section = {
  key: string;
  label: string;
  /** The sidebar catalog item whose access opens this section; none = every staff login. */
  item?: string;
  page: LazyExoticComponent<ComponentType>;
};
type HrTab = { key: string; label: string; sections: Section[] };

/** Every tab and its sections, in reading order. */
export const HR_TABS: HrTab[] = [
  {
    key: 'requests',
    label: 'Requests',
    sections: [
      { key: 'all', label: 'Requests', page: HrRequests },
      { key: 'documents', label: 'Documents', item: 'hrDocuments', page: HrDocumentsPage },
    ],
  },
  { key: 'me', label: 'Me', sections: [{ key: 'me', label: 'Me', page: MePage }] },
  // Incident reports (#131): every staff login files one; managers and the owner see them all.
  { key: 'incidents', label: 'Incidents', sections: [{ key: 'all', label: 'Incidents', page: HrIncidents }] },
];

/** The managers' pages that moved to the HR workspace (#140): old /hr/<tab>[/<section>] -> the page itself. */
export const MOVED: Record<string, string> = {
  // The Schedule route sends staff to Time clock > Everyone and managers to the builder (App.tsx ScheduleRoute).
  schedule: '/people/schedule',
  'schedule/week': '/people/schedule',
  people: '/admin/users',
  'people/staff': '/admin/users',
  'people/permissions': '/people/permissions',
  hiring: '/people/applicants',
  'hiring/applicants': '/people/applicants',
  'hiring/interviews': '/people/interviews',
  'hiring/jobs': '/people/jobs',
  'hiring/emails': '/people/emails',
  onboarding: '/people/onboarding',
  'onboarding/onboarding': '/people/onboarding',
  'onboarding/checkins': '/people/checkins',
  payroll: '/admin/time-payroll',
  'payroll/periods': '/admin/time-payroll',
  'payroll/deductions': '/people/payroll-deductions',
};

/** The tabs this person can open, each with only the sections they can open. */
export function hrTabsFor(user: NavAccessUser): HrTab[] {
  return HR_TABS.map((tab) => ({
    ...tab,
    sections: tab.sections.filter((s) => !s.item || resolveNavItems(user, [s.item]).length > 0),
  })).filter((tab) => tab.sections.length > 0);
}

/** The first tab's first section (Requests) is plain /hr. */
export const hrPath = (tab: string, section?: string) =>
  (tab === 'requests' && (!section || section === 'all') ? '/hr' : `/hr/${tab}${section ? `/${section}` : ''}`);

export default function HrPage() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tabs = hrTabsFor(user);
  const [, , tabKey = 'requests', sectionKey] = pathname.replace(/\/$/, '').split('/');
  const moved = (sectionKey && MOVED[`${tabKey}/${sectionKey}`]) || MOVED[tabKey];
  if (moved) return <Navigate to={moved} replace />;
  const tab = tabs.find((t) => t.key === tabKey);
  if (!tab) return <Navigate to="/hr" replace />;
  const section = sectionKey ? tab.sections.find((s) => s.key === sectionKey) : tab.sections[0];
  if (!section) return <Navigate to={hrPath(tab.key)} replace />;
  const Page = section.page;
  return (
    <Box data-testid="hr-page">
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>HR</Typography>
      <Tabs
        value={tab.key}
        onChange={(_, key: string) => navigate(hrPath(key))}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ mb: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        {tabs.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} data-testid={`hr-tab-${t.key}`} sx={{ textTransform: 'none', fontWeight: 700 }} />
        ))}
      </Tabs>
      {tab.sections.length > 1 ? (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={section.key}
          onChange={(_, key: string | null) => key && navigate(hrPath(tab.key, key))}
          aria-label={`${tab.label} sections`}
          sx={{ mb: 1.5, flexWrap: 'wrap' }}
        >
          {tab.sections.map((s) => (
            <ToggleButton key={s.key} value={s.key} data-testid={`hr-section-${s.key}`} sx={{ textTransform: 'none' }}>{s.label}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      ) : null}
      <Suspense fallback={<LinearProgress />}>
        <Page />
      </Suspense>
    </Box>
  );
}
