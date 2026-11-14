/**
 * Home > Profile (Dash Update #139; Bill 2026-11-13, decision 7 of .ai/extended/home-and-hr-structure.md: the old one
 * was "ugly"). Me as one record:
 *   - my photo (a phone offers the camera or the library; the server keeps the middle square),
 *   - contact: phone and emergency contact are mine to change, as on the Me page; name and email are a manager's,
 *   - work: department, job, level, employment, pay rate, overtime allowance, start date (read only: a manager changes
 *     them in the staff window, which shows the same person to the owner),
 *   - my next review (a scheduled 30/60/90-day check-in, or the review date a manager set),
 *   - sign-in: password, register PIN, sign out on all devices.
 * Not the clock, pay totals or requests: those are the Time clock and HR tabs. The /me page stays as it is (Thrift+
 * Staff, Social, HR > Me).
 *
 * Built from the page kit (Section, FieldRow, StatusPill) inside the Home band, which already names the tab, so the
 * body never repeats it. Phone first: one column; a desk puts Work and Next review beside Contact and Sign-in. Slots
 * that change (the photo while it uploads, a missing emergency contact, the review's status) keep their size.
 */
import { useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Chip, Skeleton, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { getMePage, removeMyPhoto, uploadMyPhoto, type MePage, type MeNextReview } from '../../api/accounts.api';
import { FieldRow, Section, StatusPill, type Tone } from '../../components/page/PageKit';
import { StaffPhoto } from '../../components/staff/StaffPhoto';
import { tenureFrom } from '../../components/users/userChrome';
import ChangePasswordDialog from '../../components/users/ChangePasswordDialog';
import { useAuth } from '../../contexts/AuthContext';
import { maskPhoneInput } from '../../utils/formatPhone';
import { DetailsDialog, errorText, ME_KEY, PinDialog, SignOutEverywhere } from '../me/MeDialogs';

const EMPLOYMENT: Record<string, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  seasonal: 'Seasonal',
  as_needed: 'As needed',
};

const LEVEL: Record<string, string> = { entry: 'Entry', senior: 'Senior', manager: 'Manager' };

/** The owner's name for the Admin role (as in the staff window). */
const ROLE: Record<string, string> = { Admin: 'Owner', Manager: 'Manager', Employee: 'Employee' };

/** A YYYY-MM-DD date as the calendar day it names (never shifted by the time zone). */
function localDay(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** "Mar 3, 2025" (a start date always has its year); with `soon`, "Fri, Dec 4" and the year only when it is not this one. */
function dayText(value: string | null | undefined, soon = false): string {
  const day = localDay(value);
  if (!day) return '';
  return day.toLocaleDateString('en-US', {
    ...(soon ? { weekday: 'short' as const } : {}),
    month: 'short',
    day: 'numeric',
    year: soon && day.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function phoneText(value: string): string {
  return value ? maskPhoneInput(value) || value : '';
}

function payText(employee: NonNullable<MePage['employee']>): string {
  if (employee.on_payroll === false) return 'Not on payroll';
  const rate = Number(employee.pay_rate);
  return rate > 0 ? `$${rate.toFixed(2)} an hour` : 'Not set';
}

function overtimeText(hours: string | undefined): string {
  const h = Number(hours ?? 0);
  if (!(h > 0)) return 'No overtime';
  return `Up to ${Number.isInteger(h) ? h : h.toFixed(1)} h past 40 a week`;
}

/** How far off the review is, as a pill: quiet when weeks away, info this week, wait when the date has passed. */
function reviewPill(review: MeNextReview): { tone: Tone; label: string } {
  const d = review.days;
  if (d < 0) return { tone: 'wait', label: d === -1 ? 'Was due yesterday' : `Was due ${-d} days ago` };
  if (d === 0) return { tone: 'info', label: 'Today' };
  if (d === 1) return { tone: 'info', label: 'Tomorrow' };
  return { tone: d <= 7 ? 'info' : 'quiet', label: `In ${d} days` };
}

/** Empty values read as a dash in plain type, so every row keeps its height. */
function Value({ children }: { children: ReactNode }) {
  return <>{children || <Box component="span" sx={{ color: 'text.secondary' }}>-</Box>}</>;
}

/** A row with a thing on the left and its button on the right (Sign-in). */
function ActionRow({ label, detail, action, stack = false }: { label: string; detail?: string; action: ReactNode; stack?: boolean }) {
  return (
    <Stack
      direction={stack ? { xs: 'column', sm: 'row' } : 'row'}
      spacing={stack ? { xs: 1, sm: 2 } : 2}
      alignItems={stack ? { xs: 'flex-start', sm: 'center' } : 'center'}
      sx={{ py: 1.1, minHeight: 52, borderBottom: '1px solid', borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{label}</Typography>
        {detail ? <Typography variant="caption" color="text.secondary" component="div">{detail}</Typography> : null}
      </Box>
      <Box sx={{ flexShrink: 0 }}>{action}</Box>
    </Stack>
  );
}

/** My photo (the shared circle): New photo / Remove photo; the top-bar avatar follows. */
function MyPhoto({ data, size }: { data: MePage; size: number }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { setMyPhoto } = useAuth();
  const d = data.details;
  const name = `${d.first_name} ${d.last_name}`.trim() || d.email;

  const save = async (work: () => Promise<{ data: MePage }>, message: string, fallback: string) => {
    try {
      const next = (await work()).data;
      queryClient.setQueryData(ME_KEY, next);
      setMyPhoto(next.details.photo_url ?? null);
      enqueueSnackbar(message, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(errorText(err, fallback), { variant: 'error' });
    }
  };

  return (
    <StaffPhoto
      name={name}
      seed={d.email || name}
      photo={d.photo_url}
      size={size}
      testId="profile-photo"
      onUpload={(file) => save(() => uploadMyPhoto(file), 'Photo saved', 'Could not save the photo')}
      onRemove={() => save(removeMyPhoto, 'Photo removed', 'Could not remove the photo')}
    />
  );
}

function Identity({ data, phone }: { data: MePage; phone: boolean }) {
  const d = data.details;
  const e = data.employee;
  const job = [e?.position, e?.department].filter(Boolean).join(' · ');
  const since = e?.hire_date ? tenureFrom(e.hire_date) : '';
  return (
    <Section>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={{ xs: 1.5, sm: 3 }}
        alignItems="center"
        sx={{ textAlign: { xs: 'center', sm: 'left' } }}
        data-testid="profile-identity"
      >
        <MyPhoto data={data} size={phone ? 104 : 96} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h4" component="h2" sx={{ fontWeight: 800, overflowWrap: 'anywhere' }}>
            {`${d.first_name} ${d.last_name}`.trim() || d.email}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.25 }}>{job || 'No job on file yet'}</Typography>
          <Stack
            direction="row"
            spacing={0.75}
            flexWrap="wrap"
            useFlexGap
            justifyContent={{ xs: 'center', sm: 'flex-start' }}
            sx={{ mt: 1, minHeight: 24 }}
          >
            {e?.employee_number ? <Chip size="small" variant="outlined" label={e.employee_number} /> : null}
            {d.role ? <Chip size="small" variant="outlined" label={ROLE[d.role] || d.role} /> : null}
            {since ? <Chip size="small" variant="outlined" label={since === 'new this month' ? 'New this month' : `${since} here`} /> : null}
          </Stack>
        </Box>
      </Stack>
    </Section>
  );
}

function Contact({ data, onEdit }: { data: MePage; onEdit: () => void }) {
  const d = data.details;
  const e = data.employee;
  return (
    <Section
      title="Contact"
      action={<Button size="small" variant="outlined" onClick={onEdit} data-testid="profile-edit-contact">Edit</Button>}
    >
      <Box data-testid="profile-contact">
        <FieldRow label="Phone"><Value>{phoneText(d.phone)}</Value></FieldRow>
        <FieldRow label="Email"><Value>{d.email}</Value></FieldRow>
        <FieldRow label="Sign-in name"><Value>{d.username}</Value></FieldRow>
        {e ? (
          <FieldRow label="Emergency">
            {e.emergency_name ? (
              <>
                {e.emergency_name}
                {e.emergency_phone ? (
                  <Box component="span" sx={{ display: 'block', color: 'text.secondary', fontWeight: 500 }}>
                    {phoneText(e.emergency_phone)}
                  </Box>
                ) : null}
              </>
            ) : (
              <StatusPill tone="wait" label="Add someone to call" />
            )}
          </FieldRow>
        ) : null}
      </Box>
      <Typography variant="caption" component="div" sx={{ mt: 1.5 }}>
        You can change your phone and emergency contact. A manager changes your name and email.
      </Typography>
    </Section>
  );
}

function Work({ data }: { data: MePage }) {
  const e = data.employee;
  return (
    <Section title="Work">
      {e ? (
        <Box data-testid="profile-work">
          <FieldRow label="Department"><Value>{e.department}</Value></FieldRow>
          <FieldRow label="Job"><Value>{e.position}</Value></FieldRow>
          <FieldRow label="Level"><Value>{LEVEL[e.level || ''] || ''}</Value></FieldRow>
          <FieldRow label="Employment"><Value>{EMPLOYMENT[e.employment_type || ''] || ''}</Value></FieldRow>
          <FieldRow label="Pay rate">{payText(e)}</FieldRow>
          <FieldRow label="Overtime">{overtimeText(e.overtime_allowance_hours)}</FieldRow>
          <FieldRow label="Started"><Value>{dayText(e.hire_date)}</Value></FieldRow>
          <Typography variant="caption" component="div" sx={{ mt: 1.5 }}>
            Set by your manager. Ask them if something looks wrong.
          </Typography>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          There is no employee record for you yet, so there is no job or pay to show. Ask the owner.
        </Typography>
      )}
    </Section>
  );
}

function NextReview({ data }: { data: MePage }) {
  const review = data.next_review ?? null;
  return (
    <Section title="Next review">
      {review ? (
        <Stack spacing={1} data-testid="profile-review">
          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
            <Typography variant="h5" component="p" sx={{ fontWeight: 800 }}>{dayText(review.date, true)}</Typography>
            <StatusPill {...reviewPill(review)} />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {review.label}
            {review.with ? ` with ${review.with}` : ''}
          </Typography>
          {review.kind === 'checkin' ? (
            <Box>
              <Button size="small" component={RouterLink} to="/check-ins">My check-ins</Button>
            </Box>
          ) : null}
        </Stack>
      ) : (
        <Box data-testid="profile-review-none">
          <Typography variant="h5" component="p" sx={{ fontWeight: 800, color: 'text.secondary' }}>Not set yet</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Your manager sets the date of your next review. It shows here when it is set.
          </Typography>
        </Box>
      )}
    </Section>
  );
}

function SignIn({ data, onPassword, onPin }: { data: MePage; onPassword: () => void; onPin: () => void }) {
  return (
    <Section title="Sign-in">
      <ActionRow
        label="Dash password"
        detail="What you sign in with, with your sign-in name or email."
        action={<Button size="small" variant="outlined" onClick={onPassword}>Change</Button>}
      />
      {data.pin.can_set ? (
        <ActionRow
          label="Register PIN"
          detail={data.pin.set ? 'Set. Only you know it.' : 'Not set yet. You need it at the register.'}
          action={
            <Button
              size="small"
              variant={data.pin.set ? 'outlined' : 'contained'}
              onClick={onPin}
              sx={{ minWidth: 84 }}
              data-testid="profile-pin"
            >
              {data.pin.set ? 'Change' : 'Set PIN'}
            </Button>
          }
        />
      ) : null}
      <ActionRow
        label="Lost a phone?"
        detail="Signs you out on every phone and computer, this one too."
        action={<SignOutEverywhere />}
        stack
      />
    </Section>
  );
}

export function ProfileTab() {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const query = useQuery({ queryKey: ME_KEY, queryFn: async () => (await getMePage()).data });
  const [details, setDetails] = useState(false);
  const [pin, setPin] = useState(false);
  const [password, setPassword] = useState(false);

  if (query.isLoading) {
    return (
      <Stack spacing={2} sx={{ maxWidth: 1080, mx: 'auto', width: '100%' }} data-testid="profile-loading">
        <Skeleton variant="rounded" height={140} />
        <Skeleton variant="rounded" height={260} />
      </Stack>
    );
  }
  if (query.isError || !query.data) {
    return <Alert severity="error" sx={{ maxWidth: 1080, mx: 'auto' }}>Could not load your profile. Try again in a minute.</Alert>;
  }
  const data = query.data;
  const blocks = {
    contact: <Contact data={data} onEdit={() => setDetails(true)} />,
    work: <Work data={data} />,
    review: <NextReview data={data} />,
    signIn: <SignIn data={data} onPassword={() => setPassword(true)} onPin={() => setPin(true)} />,
  };

  return (
    // A long email or name wraps instead of running off a phone screen.
    <Box data-testid="profile-tab" sx={{ maxWidth: 1080, mx: 'auto', width: '100%', overflowWrap: 'anywhere' }}>
      <Stack spacing={{ xs: 2, md: 2.5 }}>
        <Identity data={data} phone={phone} />
        {wide ? (
          <Box
            data-testid="profile-columns"
            sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}
          >
            <Stack spacing={2.5}>
              {blocks.contact}
              {blocks.signIn}
            </Stack>
            <Stack spacing={2.5}>
              {blocks.work}
              {blocks.review}
            </Stack>
          </Box>
        ) : (
          // Phone: the order a person reads top to bottom, sign-in last.
          <>
            {blocks.contact}
            {blocks.work}
            {blocks.review}
            {blocks.signIn}
          </>
        )}
      </Stack>

      <DetailsDialog key={details ? 'open' : 'closed'} data={data} open={details} onClose={() => setDetails(false)} />
      <PinDialog open={pin} again={data.pin.set} onClose={() => setPin(false)} />
      <ChangePasswordDialog open={password} onClose={() => setPassword(false)} />
    </Box>
  );
}
