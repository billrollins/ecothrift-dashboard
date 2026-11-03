/**
 * HR (Bill, Dash Updates #56, 2026-11-03): one HR app on the avatar menu, all in one place. Step 1 is the shell: tabs
 * around the HR pages Dash already has, each with its own URL (/hr/<tab>/<section>). A tab or section shows when the
 * person can open its page (the same permission dials as the sidebar), so staff see Me and Schedule, managers also
 * People, Hiring and Onboarding, and the owner Time & payroll. Requests, time off and schedule changes come next.
 */
import { Box, LinearProgress, Tab, Tabs, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { resolveNavItems, type NavAccessUser } from '../../navigation/navResolve';

const MePage = lazy(() => import('../me/MePage'));
const SchedulePage = lazy(() => import('../people/SchedulePage'));
const UsersPage = lazy(() => import('../admin/users/UsersPage'));
const PermissionsPage = lazy(() => import('../people/permissions/PermissionsPage'));
const ApplicantsPage = lazy(() => import('../people/ApplicantsPage'));
const InterviewsPage = lazy(() => import('../people/InterviewsPage'));
const JobsPage = lazy(() => import('../people/JobsPage'));
const EmailsPage = lazy(() => import('../people/EmailsPage'));
const OnboardingPage = lazy(() => import('../people/OnboardingPage'));
const CheckInsPage = lazy(() => import('../people/CheckInsPage'));
const TimePayrollPage = lazy(() => import('../admin/TimePayrollPage'));
const PayrollDeductionsPage = lazy(() => import('../people/PayrollDeductionsPage'));

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
  { key: 'me', label: 'Me', sections: [{ key: 'me', label: 'Me', page: MePage }] },
  { key: 'schedule', label: 'Schedule', sections: [{ key: 'week', label: 'Schedule', page: SchedulePage }] },
  {
    key: 'people',
    label: 'People',
    sections: [
      { key: 'staff', label: 'Staff', item: 'users', page: UsersPage },
      { key: 'permissions', label: 'Permissions', item: 'permissions', page: PermissionsPage },
    ],
  },
  {
    key: 'hiring',
    label: 'Hiring',
    sections: [
      { key: 'applicants', label: 'Applicants', item: 'applicants', page: ApplicantsPage },
      { key: 'interviews', label: 'Interviews', item: 'interviews', page: InterviewsPage },
      { key: 'jobs', label: 'Jobs & careers page', item: 'jobs', page: JobsPage },
      { key: 'emails', label: 'Emails', item: 'hiringEmails', page: EmailsPage },
    ],
  },
  {
    key: 'onboarding',
    label: 'Onboarding',
    sections: [
      { key: 'onboarding', label: 'Onboarding', item: 'onboarding', page: OnboardingPage },
      { key: 'checkins', label: 'Check-ins', item: 'checkins', page: CheckInsPage },
    ],
  },
  {
    key: 'payroll',
    label: 'Time & payroll',
    sections: [
      { key: 'periods', label: 'Time & payroll', item: 'payrollHours', page: TimePayrollPage },
      { key: 'deductions', label: 'Payroll deductions', item: 'payrollDeductions', page: PayrollDeductionsPage },
    ],
  },
];

/** The tabs this person can open, each with only the sections they can open. */
export function hrTabsFor(user: NavAccessUser): HrTab[] {
  return HR_TABS.map((tab) => ({
    ...tab,
    sections: tab.sections.filter((s) => !s.item || resolveNavItems(user, [s.item]).length > 0),
  })).filter((tab) => tab.sections.length > 0);
}

export const hrPath = (tab: string, section?: string) => (tab === 'me' ? '/hr' : `/hr/${tab}${section ? `/${section}` : ''}`);

export default function HrPage() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tabs = hrTabsFor(user);
  const [, , tabKey = 'me', sectionKey] = pathname.replace(/\/$/, '').split('/');
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
