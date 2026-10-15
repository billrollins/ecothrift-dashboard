import { useState, useEffect, useMemo } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@mui/material';
import { useRegisters } from '../../hooks/usePOS';
import { useDeviceConfig, saveDeviceConfig } from '../../hooks/useDeviceConfig';
import { useAuth } from '../../contexts/AuthContext';
import type { POSDeviceType } from '../../types/pos.types';
import { TRAINING_REGISTER_LABEL, sortRegistersForSetup } from '../../utils/trainingRegister';

const DEVICE_TYPE_OPTIONS: { value: POSDeviceType; label: string }[] = [
  { value: 'register', label: 'POS Terminal (Register)' },
  { value: 'manager', label: 'Manager / Office' },
  { value: 'online_sales', label: 'Online Sales' },
  { value: 'processing', label: 'Restoration & Processing' },
  { value: 'mobile', label: 'Mobile / Tablet (Inventory, Repricing)' },
];

interface SetupRegister {
  id: number;
  name: string;
  code: string;
  is_training?: boolean;
}

type PendingSwitch = { kind: 'to_training' } | { kind: 'from_training'; to: SetupRegister | null };

export interface DeviceSetupDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function DeviceSetupDialog({ open, onClose, onSaved }: DeviceSetupDialogProps) {
  const { config } = useDeviceConfig();
  const { hasRole } = useAuth();
  const isManager = hasRole('Manager');
  const { data: registersData } = useRegisters();
  const registers = useMemo(
    () => (registersData?.results ?? []) as SetupRegister[],
    [registersData],
  );
  const sortedRegisters = useMemo(() => sortRegistersForSetup(registers), [registers]);

  const [deviceType, setDeviceType] = useState<POSDeviceType>(config?.deviceType ?? 'register');
  const [registerId, setRegisterId] = useState<number | ''>(config?.registerId ?? '');
  const [pending, setPending] = useState<PendingSwitch | null>(null);

  useEffect(() => {
    if (open && config) {
      setDeviceType(config.deviceType);
      setRegisterId(config.registerId ?? '');
    } else if (open) {
      setDeviceType('register');
      setRegisterId('');
    }
    setPending(null);
  }, [open, config]);

  // Is this device on the training register now, and would it be after Save?
  const currentRegister =
    config?.deviceType === 'register'
      ? registers.find((r) => r.id === config.registerId)
      : undefined;
  const currentIsTraining = currentRegister
    ? Boolean(currentRegister.is_training)
    : config?.deviceType === 'register' && (config.registerCode ?? '').toUpperCase() === 'TRAIN';
  const selectedRegister =
    deviceType === 'register' ? registers.find((r) => r.id === registerId) : undefined;
  const nextIsTraining = Boolean(selectedRegister?.is_training);
  const hasTrainingRegister = registers.some((r) => r.is_training);
  // Only a manager puts a device on the training register; anyone may take it back to a real one.
  const trainingLocked = !isManager && !currentIsTraining;

  const commit = () => {
    if (deviceType === 'register') {
      const reg = registers.find((r) => r.id === registerId);
      if (!reg) return;
      saveDeviceConfig(deviceType, { id: reg.id, name: reg.name, code: reg.code });
    } else {
      saveDeviceConfig(deviceType);
    }
    setPending(null);
    onSaved?.();
    onClose();
  };

  const handleSave = () => {
    if (nextIsTraining && !currentIsTraining) {
      setPending({ kind: 'to_training' });
      return;
    }
    if (currentIsTraining && !nextIsTraining) {
      setPending({ kind: 'from_training', to: selectedRegister ?? null });
      return;
    }
    commit();
  };

  const canSave =
    (deviceType !== 'register' ||
      (registerId !== '' && registers.some((r) => r.id === registerId))) &&
    !(nextIsTraining && trainingLocked);

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>Device setup</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Identify this device so the app can remember your register or role. This is stored on
            this computer only.
          </Typography>
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel id="device-setup-type-label">Device type</InputLabel>
            <Select
              labelId="device-setup-type-label"
              value={deviceType}
              label="Device type"
              onChange={(e) => setDeviceType(e.target.value as POSDeviceType)}
            >
              {DEVICE_TYPE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {deviceType === 'register' && (
            <FormControl fullWidth size="small">
              <InputLabel id="device-setup-register-label">Register</InputLabel>
              <Select
                labelId="device-setup-register-label"
                value={registerId}
                label="Register"
                onChange={(e) => setRegisterId(e.target.value as number | '')}
              >
                <MenuItem value="">Select register...</MenuItem>
                {sortedRegisters.map((reg) =>
                  reg.is_training ? (
                    <MenuItem
                      key={reg.id}
                      value={reg.id}
                      disabled={trainingLocked}
                      sx={{ color: 'warning.dark', fontWeight: 700 }}
                    >
                      {TRAINING_REGISTER_LABEL}
                    </MenuItem>
                  ) : (
                    <MenuItem key={reg.id} value={reg.id}>
                      {reg.name} ({reg.code})
                    </MenuItem>
                  ),
                )}
              </Select>
              {hasTrainingRegister && trainingLocked && (
                <FormHelperText>
                  Only a manager can switch a device to the training register.
                </FormHelperText>
              )}
            </FormControl>
          )}
          {nextIsTraining && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Practice only: nothing is a real sale. Do not take money or run a real card on this
              device.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={open && pending !== null}
        onClose={() => setPending(null)}
        maxWidth="xs"
        fullWidth
        aria-labelledby="device-setup-confirm-title"
      >
        <DialogTitle id="device-setup-confirm-title">
          {pending?.kind === 'to_training'
            ? 'Switch to the training register?'
            : 'Leave the training register?'}
        </DialogTitle>
        <DialogContent>
          {pending?.kind === 'to_training' ? (
            <DialogContentText>
              <strong>Practice only: nothing is a real sale.</strong> Sales on this device are not
              recorded: no money, no items sold, no deliveries. Do not take money or run a real
              card here.
            </DialogContentText>
          ) : pending?.kind === 'from_training' && pending.to ? (
            <DialogContentText>
              <strong>This is a real register: sales are real.</strong> Every sale rung up on{' '}
              {pending.to.name} ({pending.to.code}) is recorded: money, items sold and deliveries.
            </DialogContentText>
          ) : (
            <DialogContentText>
              <strong>This device leaves the training register: sales are real.</strong> Every sale
              rung up here is recorded.
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button
            variant="contained"
            color={pending?.kind === 'to_training' ? 'warning' : 'primary'}
            onClick={commit}
          >
            {pending?.kind === 'to_training' ? 'Yes, practice only' : 'Yes, real sales'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
