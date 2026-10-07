import { useEffect, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, Switch, TextField, Typography } from '@mui/material';
import Save from '@mui/icons-material/Save';
import { useSnackbar } from 'notistack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getStaffPurchaseSettings, saveStaffPurchaseSettings } from '../../../api/pos.api';
import { useAuth } from '../../../hooks/useAuth';

/**
 * Staff purchases (owner, 2026-10-07): payroll deduction at the register, capped at a percent of the person's last
 * paycheck (new hires with no paycheck yet don't qualify), and Thrift+ free for staff (no monthly cover). Both start
 * off. Only the owner (Admin) changes them.
 */
export function StaffPurchasesEditor() {
  const { user } = useAuth();
  const isOwner = Boolean(user?.is_superuser || user?.role === 'Admin');
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const current = useQuery({
    queryKey: ['pos', 'staff-purchase-settings'],
    queryFn: async () => (await getStaffPurchaseSettings()).data,
  });
  const [payroll, setPayroll] = useState(false);
  const [percent, setPercent] = useState('25');
  const [thrift, setThrift] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!current.data) return;
    setPayroll(current.data.payroll_deduction);
    setPercent(String(current.data.payroll_max_percent));
    setThrift(current.data.thrift_plus_free);
  }, [current.data]);

  const save = async () => {
    const n = parseInt(percent, 10);
    if (Number.isNaN(n) || n < 1 || n > 100) {
      enqueueSnackbar('Enter a whole percent from 1 to 100.', { variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await saveStaffPurchaseSettings({ payroll_deduction: payroll, payroll_max_percent: n, thrift_plus_free: thrift });
      await queryClient.invalidateQueries({ queryKey: ['pos', 'staff-purchase-settings'] });
      enqueueSnackbar('Staff purchases saved', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not save. Only the owner (Admin) can change this.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!current.data) return <Typography color="text.secondary">Loading…</Typography>;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {!isOwner && <Alert severity="info">Only the owner (Admin) changes these.</Alert>}
      <FormControlLabel
        control={<Switch checked={payroll} disabled={!isOwner} onChange={(e) => setPayroll(e.target.checked)} />}
        label={payroll ? 'Payroll deduction is on at the register' : 'Payroll deduction is off'}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', pl: { sm: 6 } }}>
        <TextField
          size="small"
          label="Cap: % of the last paycheck"
          type="number"
          value={percent}
          disabled={!isOwner}
          onChange={(e) => setPercent(e.target.value)}
          slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }}
          sx={{ width: 220 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 220 }}>
          Everything bought this way in one pay period comes out of the next paycheck, all at once, and stays under
          this share of their last paycheck. New hires with no paycheck yet don&rsquo;t qualify.
        </Typography>
      </Box>
      <FormControlLabel
        control={<Switch checked={thrift} disabled={!isOwner} onChange={(e) => setThrift(e.target.checked)} />}
        label={thrift ? 'Thrift+ is free for staff (no monthly cover)' : 'Thrift+ free for staff is off'}
      />
      <Typography variant="body2" color="text.secondary" sx={{ pl: { sm: 6 } }}>
        Applies to a membership marked as a staff member&rsquo;s own (Thrift+ → Members → the member → Staff member),
        while that person is active staff.
      </Typography>
      {isOwner && (
        <Box>
          <Button size="small" variant="contained" startIcon={<Save />} onClick={() => void save()} disabled={saving}>
            Save
          </Button>
        </Box>
      )}
    </Box>
  );
}
