/**
 * Register PIN on the employee drawer: set or not, and Clear for a forgotten one. The person sets a new PIN on their
 * own Me page; nobody else ever sees or types it.
 */
import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { clearRegisterPin } from '../../api/accounts.api';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DrawerSection } from './userChrome';

export function RegisterPinBlock({ userId, fullName, hasPin }: { userId: number; fullName: string; hasPin: boolean }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const clear = async () => {
    setBusy(true);
    try {
      await clearRegisterPin(userId);
      await queryClient.invalidateQueries({ queryKey: ['users', userId] });
      enqueueSnackbar(`${fullName} can set a new PIN on their Me page`, { variant: 'success' });
      setConfirm(false);
    } catch {
      enqueueSnackbar('Could not clear the PIN', { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DrawerSection title="Register PIN">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }} data-testid="register-pin-block">
        <Typography variant="body2" sx={{ flex: 1 }}>
          {hasPin ? 'Set. Only they know it.' : 'Not set yet. They set it on their Me page.'}
        </Typography>
        {hasPin ? (
          <Button size="small" color="warning" onClick={() => setConfirm(true)}>Clear PIN</Button>
        ) : null}
      </Box>
      <ConfirmDialog
        open={confirm}
        title="Clear the register PIN?"
        message={`For a forgotten PIN. ${fullName} sets a new one on their Me page.`}
        confirmLabel="Clear PIN"
        onConfirm={clear}
        onCancel={() => setConfirm(false)}
        loading={busy}
      />
    </DrawerSection>
  );
}
