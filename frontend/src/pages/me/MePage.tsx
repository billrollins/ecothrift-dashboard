/**
 * Me (critic review 2026-10-21, digest point 3): one page for every staff login. My details and emergency contact,
 * my password and register PIN, Hours & pay, my weekly shifts, my onboarding and check-ins, and sign out on all
 * devices. Opened from the account menu (Dash) and the Me tab (Thrift+ Staff on the store phones).
 *
 * My drawers and covers join here once the register's drawer life ships (the `drawers` slot in the API).
 */
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getMePage } from '../../api/accounts.api';
import { getMyCheckins, getMyOnboarding } from '../../api/hiring.api';
import { getThreads } from '../../api/messages.api';
import { getSupplyLists } from '../../api/supplies.api';
import { HoursPayPanel } from '../../components/hr/HoursPayPanel';
import { MyWeek } from '../../components/hr/MyWeek';
import ChangePasswordDialog from '../../components/users/ChangePasswordDialog';
import { ccTokens } from '../../theme';
import { DetailsDialog, ME_KEY, PinDialog, SignOutEverywhere } from './MeDialogs';

function Section({ title, action, children, testId }: { title: string; action?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <Box data-testid={testId} sx={{ p: 2, mb: 1.5, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography fontWeight={800} sx={{ flex: 1 }}>{title}</Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, py: 0.25 }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: { xs: 112, sm: 130 }, flexShrink: 0 }}>{label}</Typography>
      <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{value || '-'}</Typography>
    </Box>
  );
}

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = ((h + 11) % 12) + 1;
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

function MyOnboardingAndCheckIns() {
  const onboarding = useQuery({ queryKey: ['hiring', 'my-onboarding'], queryFn: async () => (await getMyOnboarding()).data, retry: false, staleTime: 5 * 60 * 1000 });
  const checkins = useQuery({ queryKey: ['hiring', 'my-checkins'], queryFn: async () => (await getMyCheckins()).data, retry: false, staleTime: 5 * 60 * 1000 });
  const o = onboarding.data?.onboarding;
  const rows = checkins.data ?? [];
  if (!o && rows.length === 0) return null;
  const next = rows.find((c) => c.status === 'scheduled');
  const signed = rows.filter((c) => c.status === 'done').length;
  return (
    <Section title="Onboarding and check-ins" testId="me-onboarding">
      {o ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
          <Typography variant="body2" sx={{ flex: 1 }}>
            {o.done < o.total ? `My onboarding: ${o.done} of ${o.total} done` : 'My onboarding is done'}
          </Typography>
          <Button size="small" component={RouterLink} to="/onboarding">Open</Button>
        </Box>
      ) : null}
      {rows.length ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
          <Typography variant="body2" sx={{ flex: 1 }}>
            {next ? `Next check-in: ${next.day}-day` : 'My check-ins'}
            {signed ? ` · ${signed} signed` : ''}
          </Typography>
          <Button size="small" component={RouterLink} to="/check-ins">Open</Button>
        </Box>
      ) : null}
    </Section>
  );
}

/** The weekly supply count (owner, 2026-10-26): shown only while a list still needs this week's count. */
function SupplyCount() {
  const query = useQuery({ queryKey: ['supplies', 'lists'], queryFn: () => getSupplyLists(), retry: false, staleTime: 60_000 });
  const waiting = (query.data?.lists ?? []).filter((l) => !l.count && l.item_count);
  if (!waiting.length || !query.data) return null;
  const due = new Date(query.data.cycle.deadline).toLocaleString('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit',
  });
  return (
    <Section title="Supply count" testId="me-supplies">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>Due {due}</Typography>
      {waiting.map((l) => (
        <Box key={l.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
          <Typography variant="body2" sx={{ flex: 1 }}>{l.name}</Typography>
          <Button size="small" variant="contained" component={RouterLink} to={`/supplies/count/${l.id}`}>Count</Button>
        </Box>
      ))}
    </Section>
  );
}

/** My messages: the newest three threads and what is unread; the envelope at the top opens them all. */
function MyMessages({ basePath }: { basePath: string }) {
  const threads = useQuery({ queryKey: ['messages', 'threads'], queryFn: async () => (await getThreads()).data, staleTime: 30_000 });
  const rows = threads.data ?? [];
  const unread = rows.reduce((n, t) => n + t.unread, 0);
  return (
    <Section
      title={unread ? `Messages (${unread} unread)` : 'Messages'}
      testId="me-messages"
      action={<Button size="small" component={RouterLink} to={basePath}>Open</Button>}
    >
      {rows.length ? rows.slice(0, 3).map((t) => (
        <Box key={t.id} component={RouterLink} to={`${basePath}/${t.id}`} sx={{ display: 'flex', gap: 1, py: 0.5, color: 'inherit', textDecoration: 'none' }}>
          <Typography variant="body2" fontWeight={t.unread ? 800 : 400} noWrap sx={{ flex: 1 }}>{t.subject}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{t.preview_from}</Typography>
        </Box>
      )) : (
        <Typography variant="body2" color="text.secondary">{threads.isLoading ? 'Loading…' : 'No messages yet.'}</Typography>
      )}
    </Section>
  );
}

/** `compact`: inside Thrift+ Staff (the phone app has its own bar; no page title). */
export default function MePage({ compact = false }: { compact?: boolean }) {
  const query = useQuery({ queryKey: ME_KEY, queryFn: async () => (await getMePage()).data });
  const wide = useMediaQuery(useTheme().breakpoints.up('md'));
  const [details, setDetails] = useState(false);
  const [pin, setPin] = useState(false);
  const [password, setPassword] = useState(false);

  if (query.isLoading) return <CircularProgress sx={{ m: 4 }} />;
  if (query.isError || !query.data) return <Alert severity="error" sx={{ m: 2 }}>Could not load your page.</Alert>;
  const data = query.data;
  const d = data.details;
  const e = data.employee;

  const blocks = {
    details: (
      <Section
        title={`${d.first_name} ${d.last_name}`}
        testId="me-details"
        action={<Button size="small" onClick={() => setDetails(true)}>Edit</Button>}
      >
        <Line label="Role" value={[d.role, e?.position, e?.department].filter(Boolean).join(' · ')} />
        <Line label="Sign-in name" value={d.username} />
        <Line label="Email" value={d.email} />
        <Line label="Phone" value={d.phone} />
        {e ? (
          <>
            <Line label="Emergency contact" value={e.emergency_name ? `${e.emergency_name} · ${e.emergency_phone}` : ''} />
            <Line label="Employee number" value={e.employee_number} />
          </>
        ) : null}
        {e && !e.emergency_name ? (
          <Alert severity="warning" sx={{ mt: 1 }}>Add someone to call in an emergency.</Alert>
        ) : null}
      </Section>
    ),
    security: (
      <Section title="Password and register PIN" testId="me-security">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
          <Typography variant="body2" sx={{ flex: 1 }}>Dash password</Typography>
          <Button size="small" onClick={() => setPassword(true)}>Change</Button>
        </Box>
        {data.pin.can_set ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
            <Typography variant="body2" sx={{ flex: 1 }} data-testid="me-pin-status">
              Register PIN: {data.pin.set ? 'set' : 'not set yet'}
            </Typography>
            <Button size="small" variant={data.pin.set ? 'text' : 'contained'} onClick={() => setPin(true)}>
              {data.pin.set ? 'Change' : 'Set PIN'}
            </Button>
          </Box>
        ) : null}
      </Section>
    ),
    hours: (
      <Box sx={{ mb: 1.5 }}>
        <HoursPayPanel openByDefault />
      </Box>
    ),
    week: (
      <Section title="My week" testId="me-week">
        <MyWeek />
      </Section>
    ),
    usual: data.schedule.length ? (
      <Section title="My usual shifts" testId="me-schedule">
        {data.schedule.map((row) => (
          <Box key={`${row.shift}-${row.time_in}`} sx={{ display: 'flex', gap: 1, py: 0.5, flexWrap: 'wrap' }}>
            <Typography variant="body2" fontWeight={700} sx={{ minWidth: 140 }}>{row.shift}</Typography>
            <Typography variant="body2" sx={{ flex: 1 }}>
              {row.day_names.join(', ')} · {clock(row.time_in)} to {clock(row.time_out)}
            </Typography>
          </Box>
        ))}
      </Section>
    ) : null,
    messages: <MyMessages basePath={compact ? '/staff/messages' : '/messages'} />,
    onboarding: <MyOnboardingAndCheckIns />,
    supplies: <SupplyCount />,
    signOut: (
      <Box sx={{ mt: 1, mb: 2 }}>
        <SignOutEverywhere />
      </Box>
    ),
  };
  // Desk (owner 2026-10-21: the desktop Me page is used): me and my access on the left, my time on the right.
  // Phone and Thrift+ Staff: one column, the same order a person reads top to bottom.
  const twoColumns = wide && !compact;

  return (
    <Box data-testid="me-page" sx={{ width: '100%', maxWidth: twoColumns ? 1240 : 760, mx: 'auto', p: compact ? 1.5 : 0 }}>
      {!compact ? (
        <Typography variant="h4" fontWeight={700} sx={{ mb: 1.5 }}>
          Me
        </Typography>
      ) : null}

      {twoColumns ? (
        <Box data-testid="me-columns" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)', gap: 2.5, alignItems: 'start' }}>
          <Box>
            {blocks.details}
            {blocks.security}
            {blocks.messages}
            {blocks.onboarding}
            {blocks.signOut}
          </Box>
          <Box>
            {blocks.supplies}
            {blocks.hours}
            {blocks.week}
            {blocks.usual}
          </Box>
        </Box>
      ) : (
        <>
          {blocks.supplies}
          {blocks.details}
          {blocks.security}
          {blocks.hours}
          {blocks.week}
          {blocks.usual}
          {blocks.messages}
          {blocks.onboarding}
          {blocks.signOut}
        </>
      )}

      <DetailsDialog key={details ? 'open' : 'closed'} data={data} open={details} onClose={() => setDetails(false)} />
      <PinDialog open={pin} again={data.pin.set} onClose={() => setPin(false)} />
      <ChangePasswordDialog open={password} onClose={() => setPassword(false)} />
    </Box>
  );
}
