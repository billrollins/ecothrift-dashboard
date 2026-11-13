/**
 * The staff window (#136, Bill 2026-11-13): one universal window for a staff member (the owner, family, regular staff,
 * managers). It opens wherever a staff avatar, name or EMP number is clicked (`StaffLink`, `openObject({ type: 'staff',
 * id: userId })`), and from Users → Employees. It replaces the Employee drawer.
 *
 * - Header: avatar, name with a small View as, EMP number, role and state chips (Inactive, Not on payroll, Locked out,
 *   No password), a quick overview line, Password reset and an actions menu (Deactivate, Unlock).
 * - Tabs: Access, Profile, Employment, Schedule and time. Profile and Employment share one Save.
 *
 * Who sees it: whoever could open the Employee drawer before (Users → Employees: the owner, or a grant at Full). For
 * anyone else a staff name stays plain text (`canOpenStaffWindow`). Rights are unchanged.
 */
import { useEffect, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, FormControlLabel, IconButton, InputAdornment, ListItemIcon, ListItemText, Menu,
  MenuItem, Stack, Switch, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import LockReset from '@mui/icons-material/LockReset';
import LockOpen from '@mui/icons-material/LockOpen';
import MoreVert from '@mui/icons-material/MoreVert';
import PersonOff from '@mui/icons-material/PersonOff';
import PersonAdd from '@mui/icons-material/PersonAdd';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { getDepartments, mergeCurrentDepartment } from '../../api/hr.api';
import { unlockSignIn } from '../../api/accounts.api';
import type { User, UserRole } from '../../types/accounts.types';
import { useUpdateEmployeeProfile, useUpdateUser, useUser } from '../../hooks/useEmployees';
import { maskPhoneInput, stripPhone } from '../../utils/formatPhone';
import { useAuth } from '../../contexts/AuthContext';
import { canViewAs } from '../viewAs/viewAs';
import { useStartViewAs } from '../viewAs/useStartViewAs';
import { PersonAvatar, formatDay, tenureFrom } from '../users/userChrome';
import { RegisterPinBlock } from '../users/RegisterPinBlock';
import { PayLevelField } from '../hr/PayLevelField';
import { OverHoursAlert } from '../hr/OverHoursFlag';
import { CopyId, Facts, Section } from '../objects/windowParts';
import { PasswordResetDialog } from './PasswordResetDialog';
import { StaffScheduleTime } from './StaffScheduleTime';

const STAFF_ROLES: UserRole[] = ['Admin', 'Manager', 'Employee'];

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  seasonal: 'Seasonal',
  as_needed: 'As needed',
};

const TERMINATION_TYPES: [string, string][] = [
  ['voluntary_resignation', 'Voluntary resignation'],
  ['job_abandonment', 'Job abandonment'],
  ['retirement', 'Retirement'],
  ['mutual_agreement', 'Mutual agreement'],
  ['layoff', 'Layoff / reduction in force'],
  ['termination_for_cause', 'Termination for cause'],
  ['termination_poor_performance', 'Termination - poor performance'],
  ['end_of_contract', 'End of contract / seasonal'],
  ['other', 'Other'],
];

/** The owner's name for the Admin role (the Admin group is the Owner since #53). */
const ROLE_LABEL: Record<string, string> = { Admin: 'Owner', Manager: 'Manager', Employee: 'Employee' };

type StaffTab = 'access' | 'profile' | 'employment' | 'time';

function actionError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail;
  const first = data ? Object.values(data)[0] : null;
  if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
  return fallback;
}

type AccountForm = { first_name: string; last_name: string; username: string; email: string; phone: string; role: string };

type ProfileForm = {
  position: string;
  employment_type: string;
  pay_rate: string;
  on_payroll: boolean;
  level: string;
  overtime_allowance_hours: string;
  hire_date: string;
  department: string;
  emergency_name: string;
  emergency_phone: string;
  termination_date: string;
  termination_type: string;
  termination_notes: string;
  notes: string;
};

const EMPTY_ACCOUNT: AccountForm = { first_name: '', last_name: '', username: '', email: '', phone: '', role: 'Employee' };

const EMPTY_PROFILE: ProfileForm = {
  position: '', employment_type: 'full_time', pay_rate: '', on_payroll: true, level: 'entry', overtime_allowance_hours: '0',
  hire_date: '', department: '', emergency_name: '', emergency_phone: '', termination_date: '', termination_type: '',
  termination_notes: '', notes: '',
};

/** The two-line overview under the name: job, department, tenure. */
function jobLine(user: User): string {
  const e = user.employee;
  if (!e) return 'No employee record';
  return [e.position || null, e.department_name || null, e.hire_date ? tenureFrom(e.hire_date) : null]
    .filter(Boolean)
    .join(' · ') || 'No job on file';
}

export function StaffWindow({ userId }: { userId: number }) {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  const { user: viewer } = useAuth();
  const viewAs = useStartViewAs();
  const { data: user, isLoading, isError } = useUser(userId);
  const updateUser = useUpdateUser();
  const updateProfile = useUpdateEmployeeProfile();
  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await getDepartments()).data,
    staleTime: 300_000,
  });

  const [tab, setTab] = useState<StaffTab>('access');
  const [account, setAccount] = useState<AccountForm>(EMPTY_ACCOUNT);
  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (!user) return;
    setAccount({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      username: user.username || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'Employee',
    });
    const p = user.employee;
    setProfile({
      position: p?.position || '',
      employment_type: p?.employment_type || 'full_time',
      pay_rate: p?.pay_rate || '',
      on_payroll: p?.on_payroll !== false,
      level: p?.level || 'entry',
      overtime_allowance_hours: String(Number(p?.overtime_allowance_hours ?? 0)),
      hire_date: p?.hire_date || '',
      department: p?.department != null ? String(p.department) : '',
      emergency_name: p?.emergency_name || '',
      emergency_phone: p?.emergency_phone || '',
      termination_date: p?.termination_date || '',
      termination_type: p?.termination_type || '',
      termination_notes: p?.termination_notes || '',
      notes: p?.notes || '',
    });
  }, [user]);

  if (isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (isError || !user) return <Typography sx={{ p: 3 }}>This staff record could not be loaded.</Typography>;

  const setA = (key: keyof AccountForm, value: string) => setAccount((prev) => ({ ...prev, [key]: value }));
  const setP = (key: keyof ProfileForm, value: string | boolean) => setProfile((prev) => ({ ...prev, [key]: value }));
  const saving = updateUser.isPending || updateProfile.isPending;
  const employee = user.employee;
  const departmentOptions = mergeCurrentDepartment(
    Array.isArray(departments.data) ? departments.data : [],
    employee ? { id: employee.department, name: employee.department_name } : null,
  );

  const save = async () => {
    if (!account.email.trim()) {
      enqueueSnackbar('Email is required', { variant: 'warning' });
      return;
    }
    try {
      await updateUser.mutateAsync({
        id: user.id,
        data: {
          first_name: account.first_name.trim(),
          last_name: account.last_name.trim(),
          username: account.username.trim().toLowerCase() || null,
          email: account.email.trim(),
          phone: account.phone,
          role: account.role,
        },
      });
      if (employee) {
        await updateProfile.mutateAsync({
          userId: user.id,
          data: {
            position: profile.position.trim(),
            employment_type: profile.employment_type,
            pay_rate: profile.pay_rate || 0,
            on_payroll: profile.on_payroll,
            level: profile.level,
            overtime_allowance_hours: profile.overtime_allowance_hours || 0,
            hire_date: profile.hire_date || null,
            department: profile.department ? Number(profile.department) : null,
            emergency_name: profile.emergency_name.trim(),
            emergency_phone: profile.emergency_phone,
            termination_date: profile.termination_date || null,
            termination_type: profile.termination_type,
            termination_notes: profile.termination_notes,
            notes: profile.notes,
          },
        });
      }
      enqueueSnackbar('Saved', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(actionError(err, 'Could not save'), { variant: 'error' });
    }
  };

  const setActive = async (isActive: boolean) => {
    try {
      await updateUser.mutateAsync({ id: user.id, data: { is_active: isActive } });
      enqueueSnackbar(isActive ? `${user.full_name} reactivated` : `${user.full_name} deactivated`, { variant: 'success' });
      setConfirmDeactivate(false);
    } catch (err) {
      enqueueSnackbar(actionError(err, 'Could not change access'), { variant: 'error' });
    }
  };

  const unlock = async () => {
    setMenuAt(null);
    setUnlocking(true);
    try {
      const { data } = await unlockSignIn(user.id);
      enqueueSnackbar(data.detail || 'Unlocked', { variant: 'success' });
      await qc.invalidateQueries({ queryKey: ['users', user.id] });
    } catch (err) {
      enqueueSnackbar(actionError(err, 'Could not unlock'), { variant: 'error' });
    } finally {
      setUnlocking(false);
    }
  };

  const showViewAs = canViewAs(viewer, user);
  const saveBar = (
    <Box sx={{ pt: 1 }}>
      <Button variant="contained" onClick={() => void save()} disabled={saving} fullWidth data-testid="staff-save">
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </Box>
  );

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }} data-testid="staff-window">
      {/* ── Header ─────────────────────────────────────────────── */}
      <Stack direction="row" spacing={{ xs: 1.5, md: 2.5 }} alignItems="flex-start">
        <PersonAvatar name={user.full_name || '?'} seed={user.email || String(user.id)} muted={!user.is_active} size={64} />
        <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ minHeight: 30 }}>
            {employee?.employee_number ? <CopyId value={employee.employee_number} label="Copy EMP number" /> : null}
            <Chip size="small" variant="outlined" label={ROLE_LABEL[user.role || ''] || user.role || 'No role'} sx={{ fontWeight: 700 }} />
            {!user.is_active ? <Chip size="small" color="warning" label="Inactive" /> : null}
            {employee && employee.on_payroll === false ? <Chip size="small" color="info" variant="outlined" label="Not on payroll" /> : null}
            {user.locked_out ? <Chip size="small" color="error" label="Locked out" /> : null}
            {!user.has_password ? <Chip size="small" color="warning" variant="outlined" label="No password" /> : null}
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography component="h2" noWrap sx={{ fontWeight: 800, fontSize: { xs: 18, md: 22 }, lineHeight: 1.2, minWidth: 0 }}>
              {user.full_name || user.email}
            </Typography>
            {/* View as (owner only): see Dash as this person, read only. Small, next to the name (Bill 11-13). */}
            {showViewAs ? (
              <Button
                size="small"
                color="inherit"
                startIcon={<VisibilityRounded sx={{ fontSize: '16px !important' }} />}
                onClick={() => void viewAs.start(user.id)}
                disabled={viewAs.pendingId != null}
                data-testid="staff-view-as"
                sx={{ textTransform: 'none', fontSize: 12, py: 0, px: 0.75, minWidth: 0, color: 'text.secondary', flexShrink: 0 }}
              >
                View as
              </Button>
            ) : null}
          </Stack>
          <Typography sx={{ color: 'text.secondary', fontSize: 14 }} noWrap>{jobLine(user)}</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12 }} noWrap>
            {user.has_password ? 'Can sign in' : 'Cannot sign in yet'}
            {' · '}Last signed in {formatDay(user.last_login) || 'not recorded'}
            {employee && employee.pay_rate && Number(employee.pay_rate) > 0 ? ` · $${Number(employee.pay_rate).toFixed(2)}/h` : ''}
          </Typography>
          {viewAs.error ? <Typography variant="caption" color="error">{viewAs.error}</Typography> : null}
        </Stack>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<LockReset />}
            onClick={() => setResetOpen(true)}
            disabled={!user.is_active}
            sx={{ textTransform: 'none', display: { xs: 'none', sm: 'inline-flex' } }}
            data-testid="staff-password-reset"
          >
            Password reset
          </Button>
          <Tooltip title="Actions">
            <IconButton aria-label="Actions" onClick={(e) => setMenuAt(e.currentTarget)} data-testid="staff-actions">
              <MoreVert />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Menu anchorEl={menuAt} open={menuAt != null} onClose={() => setMenuAt(null)}>
        <MenuItem
          onClick={() => {
            setMenuAt(null);
            setResetOpen(true);
          }}
          disabled={!user.is_active}
          sx={{ display: { sm: 'none' } }}
        >
          <ListItemIcon><LockReset fontSize="small" /></ListItemIcon>
          <ListItemText>Password reset</ListItemText>
        </MenuItem>
        {user.locked_out ? (
          <MenuItem onClick={() => void unlock()} disabled={unlocking}>
            <ListItemIcon><LockOpen fontSize="small" /></ListItemIcon>
            <ListItemText>Unlock sign-in</ListItemText>
          </MenuItem>
        ) : null}
        {user.is_active ? (
          <MenuItem
            onClick={() => {
              setMenuAt(null);
              setConfirmDeactivate(true);
            }}
            disabled={saving}
            sx={{ color: 'warning.main' }}
            data-testid="staff-deactivate"
          >
            <ListItemIcon><PersonOff fontSize="small" color="warning" /></ListItemIcon>
            <ListItemText>Deactivate</ListItemText>
          </MenuItem>
        ) : (
          <MenuItem
            onClick={() => {
              setMenuAt(null);
              void setActive(true);
            }}
            disabled={saving}
          >
            <ListItemIcon><PersonAdd fontSize="small" color="success" /></ListItemIcon>
            <ListItemText>Reactivate</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {user.hours_flag ? <OverHoursAlert flag={user.hours_flag} /> : null}

      {/* ── Sections ───────────────────────────────────────────── */}
      <Tabs
        value={tab}
        onChange={(_, v: StaffTab) => setTab(v)}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40, '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 600 } }}
      >
        <Tab value="access" label="Access" />
        <Tab value="profile" label="Profile" />
        <Tab value="employment" label="Employment" />
        <Tab value="time" label="Schedule and time" />
      </Tabs>

      {/* One height for every tab, so switching never jumps the window. */}
      <Box sx={{ minHeight: { xs: 360, md: 500 } }}>
        {tab === 'access' ? (
          <Stack spacing={2}>
            <Section
              title="Sign-in"
              action={
                <Button size="small" startIcon={<LockReset />} onClick={() => setResetOpen(true)} disabled={!user.is_active}>
                  Password reset
                </Button>
              }
            >
              <Facts
                rows={[
                  ['Can sign in', user.has_password ? 'Yes' : 'No password set'],
                  ['Sign-in lock', user.locked_out ? 'Locked: too many wrong tries (Unlock is in the menu)' : 'Not locked'],
                  ['Username', user.username || 'None yet'],
                  ['Email', user.email || 'None'],
                  ['Phone', user.phone ? maskPhoneInput(user.phone) : 'None'],
                  // Blank means no record, not never: sign-in times were only stamped from Aug 2026 on.
                  ['Last signed in', formatDay(user.last_login) || 'Not recorded'],
                  ['Account created', formatDay(user.date_joined)],
                  ['Account', user.is_active ? 'Active' : 'Deactivated'],
                ]}
              />
            </Section>
            {employee ? (
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: { xs: 1.5, md: 2 } }}>
                <RegisterPinBlock userId={user.id} fullName={user.full_name} hasPin={Boolean(user.has_register_pin)} />
              </Box>
            ) : null}
          </Stack>
        ) : null}

        {tab === 'profile' ? (
          <Stack spacing={2}>
            <Section title="Profile">
              <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField label="First name" size="small" fullWidth value={account.first_name} onChange={(e) => setA('first_name', e.target.value)} />
                  <TextField label="Last name" size="small" fullWidth value={account.last_name} onChange={(e) => setA('last_name', e.target.value)} />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    label="Username"
                    size="small"
                    fullWidth
                    value={account.username}
                    onChange={(e) => setA('username', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    helperText="What they sign in with."
                  />
                  <TextField label="Email" size="small" fullWidth value={account.email} onChange={(e) => setA('email', e.target.value)} helperText="Signs in too." />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    label="Phone"
                    size="small"
                    fullWidth
                    value={maskPhoneInput(account.phone)}
                    onChange={(e) => setA('phone', stripPhone(e.target.value))}
                    placeholder="(555) 123-4567"
                    helperText="Password reset texts go here."
                  />
                  <TextField select label="Role" size="small" fullWidth value={account.role} onChange={(e) => setA('role', e.target.value)} helperText=" ">
                    {STAFF_ROLES.map((r) => (
                      <MenuItem key={r} value={r}>{ROLE_LABEL[r] === r ? r : `${r} (${ROLE_LABEL[r]})`}</MenuItem>
                    ))}
                  </TextField>
                </Stack>
              </Stack>
            </Section>
            <Section title="Emergency contact">
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 0.5 }}>
                <TextField label="Name" size="small" fullWidth value={profile.emergency_name} onChange={(e) => setP('emergency_name', e.target.value)} disabled={!employee} />
                <TextField
                  label="Phone"
                  size="small"
                  fullWidth
                  value={maskPhoneInput(profile.emergency_phone)}
                  onChange={(e) => setP('emergency_phone', stripPhone(e.target.value))}
                  placeholder="(555) 123-4567"
                  disabled={!employee}
                />
              </Stack>
            </Section>
            {saveBar}
          </Stack>
        ) : null}

        {tab === 'employment' ? (
          <Stack spacing={2}>
            <Section title="Job and pay">
              {employee ? (
                <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    <TextField label="Position" size="small" fullWidth value={profile.position} onChange={(e) => setP('position', e.target.value)} />
                    <TextField select label="Employment" size="small" fullWidth value={profile.employment_type} onChange={(e) => setP('employment_type', e.target.value)}>
                      {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => (
                        <MenuItem key={value} value={value}>{label}</MenuItem>
                      ))}
                    </TextField>
                  </Stack>
                  <TextField select label="Department" size="small" fullWidth value={profile.department} onChange={(e) => setP('department', e.target.value)}>
                    <MenuItem value="">Not assigned</MenuItem>
                    {departmentOptions.map((d) => (
                      <MenuItem key={d.id} value={String(d.id)}>{d.name}</MenuItem>
                    ))}
                  </TextField>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    <TextField
                      label="Hire date"
                      type="date"
                      size="small"
                      fullWidth
                      value={profile.hire_date}
                      onChange={(e) => setP('hire_date', e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      helperText={tenureFrom(profile.hire_date) || 'Sets tenure'}
                    />
                    <TextField
                      label="Pay rate"
                      type="number"
                      size="small"
                      fullWidth
                      value={profile.pay_rate}
                      onChange={(e) => setP('pay_rate', e.target.value)}
                      InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                      helperText="Per hour"
                    />
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="flex-start">
                    <PayLevelField value={profile.level} pay={profile.pay_rate} onChange={(level) => setP('level', level)} />
                    <TextField
                      label="Overtime allowed"
                      type="number"
                      size="small"
                      fullWidth
                      value={profile.overtime_allowance_hours}
                      onChange={(e) => setP('overtime_allowance_hours', e.target.value)}
                      InputProps={{ endAdornment: <InputAdornment position="end">h over 40</InputAdornment> }}
                      inputProps={{ min: 0, max: 40, step: 0.5 }}
                      helperText="0 means no overtime. Past 40 plus this is flagged red."
                    />
                  </Stack>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={profile.on_payroll}
                        onChange={(e) => setP('on_payroll', e.target.checked)}
                        inputProps={{ 'aria-label': 'On payroll' }}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{profile.on_payroll ? 'On payroll' : 'Not on payroll'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Off: left out of pay sheets, pay exports and labor cost. Still on the schedule and the time clock.
                        </Typography>
                      </Box>
                    }
                    sx={{ alignItems: 'flex-start', ml: 0, '& .MuiSwitch-root': { mt: -0.5 } }}
                  />
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  This account has no employee record, so there is no job, department, or pay to show. Changing the role to a
                  staff role on Profile creates one.
                </Typography>
              )}
            </Section>
            <Section title="Departure">
              <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    label="Last day"
                    type="date"
                    size="small"
                    fullWidth
                    value={profile.termination_date}
                    onChange={(e) => setP('termination_date', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    disabled={!employee}
                    helperText={profile.termination_date ? 'On file' : 'Still employed'}
                  />
                  <TextField select label="Reason" size="small" fullWidth value={profile.termination_type} onChange={(e) => setP('termination_type', e.target.value)} disabled={!employee} helperText=" ">
                    <MenuItem value="">Not recorded</MenuItem>
                    {TERMINATION_TYPES.map(([value, label]) => (
                      <MenuItem key={value} value={value}>{label}</MenuItem>
                    ))}
                  </TextField>
                </Stack>
                <TextField
                  label="Departure notes"
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  value={profile.termination_notes}
                  onChange={(e) => setP('termination_notes', e.target.value)}
                  disabled={!employee}
                  helperText="Deactivating the account (the menu at the top) is separate: do both."
                />
              </Stack>
            </Section>
            <Section title="Notes">
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={3}
                value={profile.notes}
                onChange={(e) => setP('notes', e.target.value)}
                disabled={!employee}
                helperText="Internal only."
              />
            </Section>
            {saveBar}
          </Stack>
        ) : null}

        {tab === 'time' ? <StaffScheduleTime userId={user.id} /> : null}
      </Box>

      <PasswordResetDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        userId={user.id}
        name={user.full_name}
        email={user.email || ''}
        phone={user.phone || ''}
      />

      <ConfirmDialog
        open={confirmDeactivate}
        title={`Deactivate ${user.full_name}?`}
        message="They will not be able to sign in. Time entries and employment history stay on file."
        confirmLabel="Deactivate"
        severity="warning"
        loading={saving}
        onConfirm={() => void setActive(false)}
        onCancel={() => setConfirmDeactivate(false)}
      />
    </Stack>
  );
}
