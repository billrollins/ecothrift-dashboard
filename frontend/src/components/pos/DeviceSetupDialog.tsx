import { useState, useEffect } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@mui/material';
import { useRegisters } from '../../hooks/usePOS';
import { useDeviceConfig, saveDeviceConfig } from '../../hooks/useDeviceConfig';
import type { POSDeviceType } from '../../types/pos.types';

const DEVICE_TYPE_OPTIONS: { value: POSDeviceType; label: string }[] = [
  { value: 'register', label: 'POS Terminal (Register)' },
  { value: 'manager', label: 'Manager / Office' },
  { value: 'online_sales', label: 'Online Sales' },
  { value: 'processing', label: 'Restoration & Processing' },
  { value: 'mobile', label: 'Mobile / Tablet (Inventory, Repricing)' },
];

export interface DeviceSetupDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function DeviceSetupDialog({ open, onClose, onSaved }: DeviceSetupDialogProps) {
  const { config } = useDeviceConfig();
  const { data: registersData } = useRegisters();
  const registers = registersData?.results ?? [];

  const [deviceType, setDeviceType] = useState<POSDeviceType>(config?.deviceType ?? 'register');
  const [registerId, setRegisterId] = useState<number | ''>(config?.registerId ?? '');

  useEffect(() => {
    if (open && config) {
      setDeviceType(config.deviceType);
      setRegisterId(config.registerId ?? '');
    } else if (open) {
      setDeviceType('register');
      setRegisterId('');
    }
  }, [open, config]);

  const handleSave = () => {
    if (deviceType === 'register') {
      const reg = registers.find((r: { id: number }) => r.id === registerId);
      if (!reg) return;
      saveDeviceConfig(deviceType, { id: reg.id, name: reg.name, code: reg.code });
    } else {
      saveDeviceConfig(deviceType);
    }
    onSaved?.();
    onClose();
  };

  const canSave =
    deviceType !== 'register' ||
    (registerId !== '' && registers.some((r: { id: number }) => r.id === registerId));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Device setup</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Identify this device so the app can remember your register or role. This is stored on
          this computer only.
        </Typography>
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>Device type</InputLabel>
          <Select
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
            <InputLabel>Register</InputLabel>
            <Select
              value={registerId}
              label="Register"
              onChange={(e) => setRegisterId(e.target.value as number | '')}
            >
              <MenuItem value="">Select register...</MenuItem>
              {registers.map((reg: { id: number; name: string; code: string }) => (
                <MenuItem key={reg.id} value={reg.id}>
                  {reg.name} ({reg.code})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
