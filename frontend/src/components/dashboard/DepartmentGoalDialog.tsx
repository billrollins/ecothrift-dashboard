import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { upsertDashboardDepartmentGoal } from '../../api/pos.api';
import { dashboardPalette } from './dashboardCardStyles';
import type {
  DashboardDepartmentGoal,
  DashboardMetrics,
  DepartmentGoalKey,
} from '../../types/pos.types';

export type DepartmentGoalKind = 'currency' | 'count' | 'grade';

export interface DepartmentGoalConfig {
  key: DepartmentGoalKey;
  label: string;
  kind: DepartmentGoalKind;
}

interface DepartmentGoalDialogProps {
  open: boolean;
  onClose: () => void;
  config: DepartmentGoalConfig;
  goal: DashboardDepartmentGoal | null;
  isSuperuser: boolean;
}

const GOLD = dashboardPalette.gold;

export function formatDepartmentGoalValue(kind: DepartmentGoalKind, value: string): string {
  if (!value) return '—';
  if (kind === 'currency') {
    const num = Number.parseFloat(value);
    if (!Number.isFinite(num)) return value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(num);
  }
  return value;
}

function normalizeForKind(kind: DepartmentGoalKind, raw: string): string {
  if (kind === 'grade') {
    return raw.replace(/[^A-Fa-f+\-\s]/g, '').toUpperCase().slice(0, 4);
  }
  return raw.replace(/[^0-9]/g, '');
}

export function DepartmentGoalDialog({
  open,
  onClose,
  config,
  goal,
  isSuperuser,
}: DepartmentGoalDialogProps) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(goal?.value ?? '');
    setDescription(goal?.description ?? '');
    setError(null);
  }, [open, goal]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error('Enter a goal value.');
      }
      return upsertDashboardDepartmentGoal({
        department: config.key,
        value: trimmed,
        description: description.trim(),
      });
    },
    onSuccess: ({ data }) => {
      queryClient.setQueryData<DashboardMetrics>(['dashboard', 'metrics'], (current) => {
        if (!current) return current;
        return {
          ...current,
          department_metrics: {
            ...current.department_metrics,
            goals: { ...current.department_metrics.goals, [config.key]: data },
          },
        };
      });
      onClose();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to save goal. Please try again.');
    },
  });

  const helper =
    config.kind === 'currency'
      ? 'Whole dollars only.'
      : config.kind === 'count'
        ? 'Whole number target.'
        : 'Letter grade, e.g. A, B+, C.';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle
        sx={{ textAlign: 'center', fontWeight: 900, fontSize: '1.25rem', pb: 0.5 }}
      >
        {config.label} Goal
        <Box
          aria-hidden
          sx={{
            mx: 'auto',
            mt: 1,
            width: 52,
            height: 3,
            borderRadius: 99,
            background: `linear-gradient(90deg, ${dashboardPalette.goldBright}, ${dashboardPalette.gold})`,
          }}
        />
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1, overflow: 'visible' }}>
        {error && <Alert severity="error">{error}</Alert>}

        <Box>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mb: 0.75,
              textAlign: 'center',
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: 'text.secondary',
            }}
          >
            Goal
          </Typography>
          {isSuperuser ? (
            <TextField
              variant="outlined"
              fullWidth
              value={value}
              onChange={(e) => setValue(normalizeForKind(config.kind, e.target.value))}
              onFocus={(e) => e.target.select()}
              inputProps={{
                inputMode: config.kind === 'grade' ? 'text' : 'numeric',
                style: { textAlign: 'center', fontSize: '1.9rem', fontWeight: 900, color: GOLD },
              }}
              InputProps={
                config.kind === 'currency'
                  ? {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Typography sx={{ fontSize: '1.6rem', fontWeight: 900, color: GOLD }}>
                            $
                          </Typography>
                        </InputAdornment>
                      ),
                    }
                  : undefined
              }
              helperText={helper}
            />
          ) : (
            <Typography
              sx={{ fontSize: '2.2rem', fontWeight: 900, color: GOLD, textAlign: 'center', lineHeight: 1.2 }}
            >
              {formatDepartmentGoalValue(config.kind, value)}
            </Typography>
          )}
        </Box>

        <TextField
          label="Description"
          value={isSuperuser ? description : description.trim() ? description : 'No description provided.'}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this goal represents…"
          fullWidth
          multiline
          minRows={3}
          InputProps={{ readOnly: !isSuperuser }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saveMutation.isPending}>
          {isSuperuser ? 'Cancel' : 'Close'}
        </Button>
        {isSuperuser && (
          <Button
            variant="contained"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !value.trim()}
          >
            Save Goal
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
