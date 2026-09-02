/**
 * One employee, whole.
 *
 * Six sections, all of them always present. A brand-new hire with nothing but
 * an email shows the same sections at the same heights as someone with a full
 * file - empty fields read as an em-dash rather than disappearing, so the Send
 * reset link button is always in the same place.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import LockReset from '@mui/icons-material/LockReset';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { LoadingScreen } from '../feedback/LoadingScreen';
import { getDepartments } from '../../api/hr.api';
import { getLocations } from '../../api/core.api';
import type { UserRole } from '../../types/accounts.types';
import {
  useSendEmployeePasswordReset,
  useUpdateEmployeeProfile,
  useUpdateUser,
  useUser,
} from '../../hooks/useEmployees';
import { useIsMobileLayout } from '../../hooks/useIsMobileLayout';
import { formatPhone, maskPhoneInput, stripPhone } from '../../utils/formatPhone';
import { DrawerSection, Fact, PersonAvatar, formatDay, tenureFrom } from './userChrome';

type Props = {
  userId: number | null;
  open: boolean;
  onClose: () => void;
};

const STAFF_ROLES: UserRole[] = ['Admin', 'Manager', 'Employee'];

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  seasonal: 'Seasonal',
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

function actionError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail;
  const first = data ? Object.values(data)[0] : null;
  if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
  return fallback;
}

type AccountForm = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: string;
};

type ProfileForm = {
  position: string;
  employment_type: string;
  pay_rate: string;
  hire_date: string;
  department: string;
  work_location: string;
  emergency_name: string;
  emergency_phone: string;
  termination_date: string;
  termination_type: string;
  termination_notes: string;
  notes: string;
};

const EMPTY_ACCOUNT: AccountForm = {
  first_name: '', last_name: '', email: '', phone: '', role: 'Employee',
};

const EMPTY_PROFILE: ProfileForm = {
  position: '', employment_type: 'full_time', pay_rate: '', hire_date: '',
  department: '', work_location: '', emergency_name: '', emergency_phone: '',
  termination_date: '', termination_type: '', termination_notes: '', notes: '',
};

export default function EmployeeDetailDrawer({ userId, open, onClose }: Props) {
  const isMobile = useIsMobileLayout();
  const { enqueueSnackbar } = useSnackbar();
  const { data: user, isLoading } = useUser(open ? userId : null);
  const updateUser = useUpdateUser();
  const updateProfile = useUpdateEmployeeProfile();
  const sendReset = useSendEmployeePasswordReset();

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await getDepartments()).data,
    enabled: open,
    staleTime: 300_000,
  });
  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await getLocations()).data?.results || [],
    enabled: open,
    staleTime: 300_000,
  });

  const [account, setAccount] = useState<AccountForm>(EMPTY_ACCOUNT);
  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!user) return;
    setAccount({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'Employee',
    });
    const p = user.employee;
    setProfile({
      position: p?.position || '',
      employment_type: p?.employment_type || 'full_time',
      pay_rate: p?.pay_rate || '',
      hire_date: p?.hire_date || '',
      department: p?.department != null ? String(p.department) : '',
      work_location: p?.work_location != null ? String(p.work_location) : '',
      emergency_name: p?.emergency_name || '',
      emergency_phone: p?.emergency_phone || '',
      termination_date: p?.termination_date || '',
      termination_type: p?.termination_type || '',
      termination_notes: p?.termination_notes || '',
      notes: p?.notes || '',
    });
  }, [user]);

  const setA = (key: keyof AccountForm, value: string) =>
    setAccount((prev) => ({ ...prev, [key]: value }));
  const setP = (key: keyof ProfileForm, value: string) =>
    setProfile((prev) => ({ ...prev, [key]: value }));

  const saving = updateUser.isPending || updateProfile.isPending;

  const save = async () => {
    if (!user) return;
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
          email: account.email.trim(),
          phone: account.phone,
          role: account.role,
        },
      });
      if (user.employee) {
        await updateProfile.mutateAsync({
          userId: user.id,
          data: {
            position: profile.position.trim(),
            employment_type: profile.employment_type,
            pay_rate: profile.pay_rate || 0,
            hire_date: profile.hire_date || null,
            department: profile.department ? Number(profile.department) : null,
            work_location: profile.work_location ? Number(profile.work_location) : null,
            emergency_name: profile.emergency_name.trim(),
            emergency_phone: profile.emergency_phone,
            termination_date: profile.termination_date || null,
            termination_type: profile.termination_type,
            termination_notes: profile.termination_notes,
            notes: profile.notes,
          },
        });
      }
      enqueueSnackbar('Employee saved', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(actionError(err, 'Could not save employee'), { variant: 'error' });
    }
  };

  const onSendReset = async () => {
    if (!user) return;
    try {
      const result = await sendReset.mutateAsync(user.id);
      enqueueSnackbar(result.detail || 'Reset link sent', { variant: 'success' });
      setConfirmReset(false);
    } catch (err) {
      enqueueSnackbar(actionError(err, 'Could not send the reset link'), { variant: 'error' });
    }
  };

  const setActive = async (isActive: boolean) => {
    if (!user) return;
    try {
      await updateUser.mutateAsync({ id: user.id, data: { is_active: isActive } });
      enqueueSnackbar(isActive ? 'Employee reactivated' : 'Employee deactivated', {
        variant: 'success',
      });
      setConfirmDeactivate(false);
    } catch (err) {
      enqueueSnackbar(actionError(err, 'Could not change access'), { variant: 'error' });
    }
  };

  const employee = user?.employee;
  // A picker that cannot list its options must still render at the same size.
  const departmentOptions = Array.isArray(departments.data) ? departments.data : [];
  const locationOptions = Array.isArray(locations.data) ? locations.data : [];

  return (
    <>
      <Drawer
        anchor={isMobile ? 'bottom' : 'right'}
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: isMobile
            ? {
                maxHeight: '92dvh',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                width: '100%',
              }
            : { width: { xs: '100%', sm: 520 }, maxWidth: '100%' },
        }}
      >
        {isMobile ? (
          <Box
            sx={{
              width: 40, height: 4, borderRadius: 2, bgcolor: 'divider',
              mx: 'auto', mt: 1, mb: 0.5,
            }}
          />
        ) : null}
        <Stack
          direction="row"
          alignItems="flex-start"
          spacing={1.25}
          sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
        >
          <PersonAvatar
            name={user?.full_name || '?'}
            seed={user?.email || String(userId ?? '')}
            muted={user ? !user.is_active : false}
            size={44}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>
              {user?.full_name || 'Employee'}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {employee?.employee_number || 'No employee record'}
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
              <Chip size="small" label={user?.role || 'No role'} variant="outlined" />
              <Chip
                size="small"
                label={user?.is_active === false ? 'Inactive' : 'Active'}
                color={user?.is_active === false ? 'warning' : 'default'}
                variant="outlined"
              />
              <Chip
                size="small"
                label={user?.has_password ? 'Password set' : 'No password'}
                color={user?.has_password ? 'success' : 'warning'}
                variant="outlined"
              />
            </Stack>
          </Box>
          <IconButton aria-label="Close" onClick={onClose} edge="end">
            <Close />
          </IconButton>
        </Stack>

        {isLoading || !user ? (
          <LoadingScreen message="Loading employee…" />
        ) : (
          <Box sx={{ p: 2, pb: 4, overflow: 'auto' }}>
            <DrawerSection title="Access">
              <Fact
                label="Can sign in"
                value={user.has_password ? 'Yes' : 'No password set'}
                tone={user.has_password ? 'good' : 'warn'}
              />
              {/* Blank means we have no record, not that they never signed in -
                  sign-in times were only stamped from Aug 2026 onward. */}
              <Fact
                label="Last signed in"
                value={formatDay(user.last_login) || 'Not recorded'}
                tone={user.last_login ? 'neutral' : 'muted'}
              />
              <Fact label="Account created" value={formatDay(user.date_joined)} />
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<LockReset />}
                  onClick={() => setConfirmReset(true)}
                  disabled={!user.is_active || !user.email || sendReset.isPending}
                >
                  Send reset link
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color={user.is_active ? 'warning' : 'success'}
                  onClick={
                    user.is_active ? () => setConfirmDeactivate(true) : () => setActive(true)
                  }
                  disabled={saving}
                >
                  {user.is_active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </Stack>
            </DrawerSection>

            <Divider sx={{ my: 2.5 }} />

            <DrawerSection title="Profile">
              <Stack spacing={1.5} sx={{ mt: 1 }}>
                <Stack direction="row" spacing={1.5}>
                  <TextField
                    label="First name"
                    size="small"
                    fullWidth
                    value={account.first_name}
                    onChange={(e) => setA('first_name', e.target.value)}
                  />
                  <TextField
                    label="Last name"
                    size="small"
                    fullWidth
                    value={account.last_name}
                    onChange={(e) => setA('last_name', e.target.value)}
                  />
                </Stack>
                <TextField
                  label="Email"
                  size="small"
                  fullWidth
                  value={account.email}
                  onChange={(e) => setA('email', e.target.value)}
                  helperText="This is their sign-in."
                />
                <Stack direction="row" spacing={1.5}>
                  <TextField
                    label="Phone"
                    size="small"
                    fullWidth
                    value={maskPhoneInput(account.phone)}
                    onChange={(e) => setA('phone', stripPhone(e.target.value))}
                    placeholder="(555) 123-4567"
                  />
                  <TextField
                    select
                    label="Role"
                    size="small"
                    fullWidth
                    value={account.role}
                    onChange={(e) => setA('role', e.target.value)}
                  >
                    {STAFF_ROLES.map((r) => (
                      <MenuItem key={r} value={r}>
                        {r}
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
              </Stack>
            </DrawerSection>

            <DrawerSection title="Employment">
              {employee ? (
                <Stack spacing={1.5} sx={{ mt: 1 }}>
                  <Stack direction="row" spacing={1.5}>
                    <TextField
                      label="Position"
                      size="small"
                      fullWidth
                      value={profile.position}
                      onChange={(e) => setP('position', e.target.value)}
                    />
                    <TextField
                      select
                      label="Employment"
                      size="small"
                      fullWidth
                      value={profile.employment_type}
                      onChange={(e) => setP('employment_type', e.target.value)}
                    >
                      {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => (
                        <MenuItem key={value} value={value}>
                          {label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Stack>
                  <Stack direction="row" spacing={1.5}>
                    <TextField
                      select
                      label="Department"
                      size="small"
                      fullWidth
                      value={profile.department}
                      onChange={(e) => setP('department', e.target.value)}
                    >
                      <MenuItem value="">Not assigned</MenuItem>
                      {departmentOptions.map((d) => (
                        <MenuItem key={d.id} value={String(d.id)}>
                          {d.name}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label="Work location"
                      size="small"
                      fullWidth
                      value={profile.work_location}
                      onChange={(e) => setP('work_location', e.target.value)}
                    >
                      <MenuItem value="">Not assigned</MenuItem>
                      {locationOptions.map((l) => (
                        <MenuItem key={l.id} value={String(l.id)}>
                          {l.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Stack>
                  <Stack direction="row" spacing={1.5}>
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
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      }}
                      helperText="Per hour"
                    />
                  </Stack>
                </Stack>
              ) : (
                <Box sx={{ minHeight: 200, display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    This account has no employee record, so there is no job, department, or pay to
                    show. Changing the role to a staff role creates one.
                  </Typography>
                </Box>
              )}
            </DrawerSection>

            <DrawerSection title="Emergency contact">
              <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
                <TextField
                  label="Name"
                  size="small"
                  fullWidth
                  value={profile.emergency_name}
                  onChange={(e) => setP('emergency_name', e.target.value)}
                  disabled={!employee}
                />
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
            </DrawerSection>

            <DrawerSection title="Departure">
              <Stack spacing={1.5} sx={{ mt: 1 }}>
                <Stack direction="row" spacing={1.5}>
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
                  <TextField
                    select
                    label="Reason"
                    size="small"
                    fullWidth
                    value={profile.termination_type}
                    onChange={(e) => setP('termination_type', e.target.value)}
                    disabled={!employee}
                  >
                    <MenuItem value="">Not recorded</MenuItem>
                    {TERMINATION_TYPES.map(([value, label]) => (
                      <MenuItem key={value} value={value}>
                        {label}
                      </MenuItem>
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
                  helperText="Deactivating the account is separate - do both."
                />
              </Stack>
            </DrawerSection>

            <DrawerSection title="Notes">
              <TextField
                size="small"
                fullWidth
                multiline
                minRows={3}
                value={profile.notes}
                onChange={(e) => setP('notes', e.target.value)}
                disabled={!employee}
                helperText="Internal only."
                sx={{ mt: 1 }}
              />
            </DrawerSection>

            <Button variant="contained" onClick={save} disabled={saving} fullWidth>
              {saving ? 'Saving…' : 'Save employee'}
            </Button>
          </Box>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmReset}
        title="Email a reset link?"
        message={`${user?.full_name || 'They'} will get a single-use link at ${user?.email || 'their email'} and choose their own password. Their current password keeps working until they use it.`}
        confirmLabel="Send link"
        loading={sendReset.isPending}
        onConfirm={onSendReset}
        onCancel={() => setConfirmReset(false)}
      />

      <ConfirmDialog
        open={confirmDeactivate}
        title="Deactivate employee?"
        message="They will not be able to sign in. Time entries and employment history stay on file."
        confirmLabel="Deactivate"
        severity="warning"
        loading={saving}
        onConfirm={() => setActive(false)}
        onCancel={() => setConfirmDeactivate(false)}
      />
    </>
  );
}
