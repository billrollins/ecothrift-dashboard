/**
 * One customer, whole.
 *
 * Profile you can edit, what they have actually done with us, and the customer
 * service actions. Every section renders whether or not it has content - a
 * person with no holds takes up the same room as a regular, so the buttons a
 * hand is travelling toward do not move when the rollup lands.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import LockReset from '@mui/icons-material/LockReset';
import MailOutline from '@mui/icons-material/MailOutline';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import { useSnackbar } from 'notistack';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { LoadingScreen } from '../feedback/LoadingScreen';
import type { Customer } from '../../api/accounts.api';
import {
  useCustomer,
  useCustomerRollup,
  useDeleteCustomer,
  useReactivateCustomer,
  useSendCustomerPasswordReset,
  useSendCustomerSignInLink,
  useUpdateCustomer,
} from '../../hooks/useEmployees';
import { useIsMobileLayout } from '../../hooks/useIsMobileLayout';
import { formatPhone, maskPhoneInput, stripPhone } from '../../utils/formatPhone';
import { DrawerSection, Fact, PersonAvatar, formatDay, relativeDay } from './userChrome';

type Props = {
  customerId: number | null;
  open: boolean;
  onClose: () => void;
};

type FormState = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  notes: string;
};

const EMPTY: FormState = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  notes: '',
};

function formFromCustomer(c: Customer): FormState {
  return {
    first_name: c.first_name || '',
    last_name: c.last_name || '',
    email: c.email || '',
    phone: c.phone || '',
    notes: c.notes || '',
  };
}

function actionError(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail.trim() ? detail : fallback;
}

function money(raw: string | null | undefined): string {
  const n = Number.parseFloat(raw || '0');
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export default function CustomerDetailDrawer({ customerId, open, onClose }: Props) {
  const isMobile = useIsMobileLayout();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { data: customer, isLoading } = useCustomer(open ? customerId : null);
  const rollup = useCustomerRollup(customerId, { enabled: open });
  const updateCustomer = useUpdateCustomer();
  const deactivate = useDeleteCustomer();
  const reactivate = useReactivateCustomer();
  const sendLink = useSendCustomerSignInLink();
  const sendReset = useSendCustomerPasswordReset();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  useEffect(() => {
    if (customer) setForm(formFromCustomer(customer));
  }, [customer]);

  const email = (customer?.email || '').trim();
  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (!customer) return;
    if (!form.first_name.trim() || !form.last_name.trim()) {
      enqueueSnackbar('First and last name are required', { variant: 'warning' });
      return;
    }
    try {
      await updateCustomer.mutateAsync({
        id: customer.id,
        data: {
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone,
          notes: form.notes,
        },
      });
      enqueueSnackbar('Customer saved', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(actionError(err, 'Could not save customer'), { variant: 'error' });
    }
  };

  const onSendLink = async () => {
    if (!customer) return;
    try {
      await sendLink.mutateAsync(customer.id);
      enqueueSnackbar('Sign-in link emailed', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(actionError(err, 'Could not send sign-in link'), { variant: 'error' });
    }
  };

  const onSendReset = async () => {
    if (!customer) return;
    try {
      await sendReset.mutateAsync(customer.id);
      enqueueSnackbar('Password reset link emailed', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(actionError(err, 'Could not send reset link'), { variant: 'error' });
    }
  };

  const onDeactivate = async () => {
    if (!customer) return;
    try {
      await deactivate.mutateAsync(customer.id);
      enqueueSnackbar('Customer deactivated', { variant: 'success' });
      setConfirmDeactivate(false);
    } catch (err) {
      enqueueSnackbar(actionError(err, 'Could not deactivate'), { variant: 'error' });
    }
  };

  const onReactivate = async () => {
    if (!customer) return;
    try {
      await reactivate.mutateAsync(customer.id);
      enqueueSnackbar('Customer reactivated', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(actionError(err, 'Could not reactivate'), { variant: 'error' });
    }
  };

  const totals = rollup.data;

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
            : { width: { xs: '100%', sm: 460 }, maxWidth: '100%' },
        }}
      >
        {isMobile ? (
          <Box
            sx={{
              width: 40,
              height: 4,
              borderRadius: 2,
              bgcolor: 'divider',
              mx: 'auto',
              mt: 1,
              mb: 0.5,
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
            name={customer?.full_name || '?'}
            seed={customer?.email || String(customerId ?? '')}
            muted={customer ? !customer.is_active : false}
            size={44}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>
              {customer?.full_name || 'Customer'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {customer?.customer_number || '-'}
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
              <Chip
                size="small"
                label={customer?.email_verified ? 'Email verified' : 'Unverified'}
                color={customer?.email_verified ? 'success' : 'default'}
                variant={customer?.email_verified ? 'filled' : 'outlined'}
              />
              <Chip
                size="small"
                label={customer?.is_active === false ? 'Inactive' : 'Active'}
                color={customer?.is_active === false ? 'warning' : 'default'}
                variant="outlined"
              />
            </Stack>
          </Box>
          <IconButton aria-label="Close" onClick={onClose} edge="end">
            <Close />
          </IconButton>
        </Stack>

        {isLoading || !customer ? (
          <LoadingScreen message="Loading customer…" />
        ) : (
          <Box sx={{ p: 2, pb: 4, overflow: 'auto' }}>
            <DrawerSection title="Track record">
              <Fact
                label="Holds"
                value={totals ? `${totals.holds_total}` : ''}
                tone={totals?.holds_active ? 'good' : 'neutral'}
              />
              <Fact label="Open right now" value={totals ? `${totals.holds_active}` : ''} />
              <Fact label="Picked up" value={totals ? `${totals.holds_completed}` : ''} />
              <Fact
                label="Lifetime spend"
                value={totals ? money(totals.lifetime_spend) : ''}
                tone="good"
              />
              <Fact
                label="Message threads"
                value={
                  totals
                    ? totals.needs_reply
                      ? `${totals.conversations} · ${totals.needs_reply} waiting`
                      : `${totals.conversations}`
                    : ''
                }
                tone={totals?.needs_reply ? 'warn' : 'neutral'}
              />
              <Fact label="Last seen" value={totals ? relativeDay(totals.last_activity) : ''} />
              <Fact label="Customer since" value={formatDay(customer.customer_since)} />
            </DrawerSection>

            <DrawerSection title="Profile">
              <Stack spacing={1.5} sx={{ mt: 1 }}>
                <Stack direction="row" spacing={1.5}>
                  <TextField
                    label="First name"
                    size="small"
                    fullWidth
                    value={form.first_name}
                    onChange={(e) => setField('first_name', e.target.value)}
                  />
                  <TextField
                    label="Last name"
                    size="small"
                    fullWidth
                    value={form.last_name}
                    onChange={(e) => setField('last_name', e.target.value)}
                  />
                </Stack>
                <TextField
                  label="Email"
                  size="small"
                  fullWidth
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  helperText="Changing this does not re-verify the address."
                />
                <TextField
                  label="Phone"
                  size="small"
                  fullWidth
                  value={maskPhoneInput(form.phone)}
                  onChange={(e) => setField('phone', stripPhone(e.target.value))}
                  placeholder="(555) 123-4567"
                />
                <TextField
                  label="Notes"
                  size="small"
                  fullWidth
                  multiline
                  minRows={3}
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  helperText="Internal only - customers never see this."
                />
                <Button
                  variant="contained"
                  onClick={save}
                  disabled={updateCustomer.isPending}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  {updateCustomer.isPending ? 'Saving…' : 'Save profile'}
                </Button>
              </Stack>
            </DrawerSection>

            <Divider sx={{ my: 2.5 }} />

            <DrawerSection title="Customer service">
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Sign-in is magic-link by email. A reset link clears their old password so they can
                pick a new one. Hold work stays on the Holds page.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<MailOutline />}
                  onClick={onSendLink}
                  disabled={!customer.is_active || !email || sendLink.isPending}
                >
                  Send sign-in link
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<LockReset />}
                  onClick={onSendReset}
                  disabled={!customer.is_active || !email || sendReset.isPending}
                >
                  Send reset link
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ForumOutlined />}
                  onClick={() =>
                    navigate(`/online-sales/messages?q=${encodeURIComponent(email)}`)
                  }
                  disabled={!email}
                >
                  Open messages
                </Button>
                <Button
                  size="small"
                  color={customer.is_active ? 'warning' : 'success'}
                  variant="outlined"
                  onClick={
                    customer.is_active ? () => setConfirmDeactivate(true) : onReactivate
                  }
                  disabled={reactivate.isPending}
                >
                  {customer.is_active ? 'Deactivate' : 'Reactivate'}
                </Button>
              </Stack>
            </DrawerSection>
          </Box>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmDeactivate}
        title="Deactivate customer?"
        message="They will not be able to sign in. Holds and message history stay on file."
        confirmLabel="Deactivate"
        severity="warning"
        loading={deactivate.isPending}
        onConfirm={onDeactivate}
        onCancel={() => setConfirmDeactivate(false)}
      />
    </>
  );
}
