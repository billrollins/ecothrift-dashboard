import { useEffect, useState } from 'react';
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
import MailOutline from '@mui/icons-material/MailOutline';
import { useSnackbar } from 'notistack';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import type { Customer } from '../../../api/accounts.api';
import {
  useCustomer,
  useDeleteCustomer,
  useReactivateCustomer,
  useSendCustomerSignInLink,
  useUpdateCustomer,
} from '../../../hooks/useEmployees';
import { useReservations } from '../../../hooks/useWebStore';
import { formatPhone, maskPhoneInput, stripPhone } from '../../../utils/formatPhone';
import { HoldStatusChip, WhenCell } from '../presentation';
import { useOnlineSalesMobile } from '../useOnlineSalesMobile';

type Props = {
  customerId: number | null;
  open: boolean;
  onClose: () => void;
  onOpenHold: (reservationId: number) => void;
  onOpenMessages: (email: string) => void;
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

export default function CustomerDetailDrawer({
  customerId,
  open,
  onClose,
  onOpenHold,
  onOpenMessages,
}: Props) {
  const isMobile = useOnlineSalesMobile();
  const { enqueueSnackbar } = useSnackbar();
  const { data: customer, isLoading } = useCustomer(open ? customerId : null);
  const updateCustomer = useUpdateCustomer();
  const deactivate = useDeleteCustomer();
  const reactivate = useReactivateCustomer();
  const sendLink = useSendCustomerSignInLink();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  useEffect(() => {
    if (customer) setForm(formFromCustomer(customer));
  }, [customer]);

  const email = (customer?.email || '').trim();
  const holds = useReservations(
    email
      ? { search: email, ordering: '-created_at', page_size: 25, archived: '0' }
      : undefined,
    { enabled: open && Boolean(email) },
  );
  // Search is substring - keep only exact email matches for this profile.
  const recentHolds = (holds.data?.results || []).filter(
    (h) => (h.email || '').trim().toLowerCase() === email.toLowerCase(),
  ).slice(0, 8);

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
    } catch {
      enqueueSnackbar('Could not save customer', { variant: 'error' });
    }
  };

  const onSendLink = async () => {
    if (!customer) return;
    try {
      await sendLink.mutateAsync(customer.id);
      enqueueSnackbar('Sign-in link emailed', { variant: 'success' });
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Could not send sign-in link';
      enqueueSnackbar(detail, { variant: 'error' });
    }
  };

  const onDeactivate = async () => {
    if (!customer) return;
    try {
      await deactivate.mutateAsync(customer.id);
      enqueueSnackbar('Customer deactivated', { variant: 'success' });
      setConfirmDeactivate(false);
    } catch {
      enqueueSnackbar('Could not deactivate', { variant: 'error' });
    }
  };

  const onReactivate = async () => {
    if (!customer) return;
    try {
      await reactivate.mutateAsync(customer.id);
      enqueueSnackbar('Customer reactivated', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not reactivate', { variant: 'error' });
    }
  };

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
            : { width: { xs: '100%', sm: 440 }, maxWidth: '100%' },
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
          spacing={1}
          sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }} noWrap>
              {customer?.full_name || 'Customer'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {customer?.customer_number || '-'}
            </Typography>
            {customer ? (
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
                <Chip
                  size="small"
                  label={customer.email_verified ? 'Email verified' : 'Unverified'}
                  color={customer.email_verified ? 'success' : 'default'}
                  variant={customer.email_verified ? 'filled' : 'outlined'}
                />
                <Chip
                  size="small"
                  label={customer.is_active ? 'Active' : 'Inactive'}
                  color={customer.is_active ? 'default' : 'warning'}
                  variant="outlined"
                />
              </Stack>
            ) : null}
          </Box>
          <IconButton aria-label="Close" onClick={onClose} edge="end">
            <Close />
          </IconButton>
        </Stack>

        {isLoading || !customer ? (
          <LoadingScreen message="Loading customer…" />
        ) : (
          <Box sx={{ p: 2, pb: 4, overflow: 'auto' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
              Profile
            </Typography>
            <Stack spacing={1.5}>
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

            <Divider sx={{ my: 2.5 }} />

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Customer service
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Sign-in is magic-link by email. Hold work stays on the Holds page.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                size="small"
                variant="outlined"
                startIcon={<MailOutline />}
                onClick={onSendLink}
                disabled={!customer.is_active || !customer.email || sendLink.isPending}
              >
                Send sign-in link
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => onOpenMessages(customer.email)}
                disabled={!customer.email}
              >
                Open messages
              </Button>
              {customer.is_active ? (
                <Button
                  size="small"
                  color="warning"
                  variant="outlined"
                  onClick={() => setConfirmDeactivate(true)}
                >
                  Deactivate
                </Button>
              ) : (
                <Button
                  size="small"
                  color="success"
                  variant="outlined"
                  onClick={onReactivate}
                  disabled={reactivate.isPending}
                >
                  Reactivate
                </Button>
              )}
            </Stack>

            <Divider sx={{ my: 2.5 }} />

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Recent holds
            </Typography>
            {!email ? (
              <Typography variant="body2" color="text.secondary">
                Add an email to look up holds for this customer.
              </Typography>
            ) : holds.isLoading ? (
              <Typography variant="body2" color="text.secondary">
                Loading holds…
              </Typography>
            ) : recentHolds.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No holds match this email.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {recentHolds.map((hold) => (
                  <Box
                    key={hold.id}
                    component="button"
                    type="button"
                    onClick={() => onOpenHold(hold.id)}
                    sx={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      p: 1.25,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      bgcolor: 'background.paper',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }} noWrap>
                        {hold.listing_title || 'Hold'}
                      </Typography>
                      <HoldStatusChip status={hold.status} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" component="div">
                      {hold.pickup_code ? `Pickup ${hold.pickup_code} · ` : ''}
                      {formatPhone(hold.phone) || hold.email}
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <WhenCell value={hold.created_at} tone="happened" />
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Customer since {customer.customer_since || '-'}
            </Typography>
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
