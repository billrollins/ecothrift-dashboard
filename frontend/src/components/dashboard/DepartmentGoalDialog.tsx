import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
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
const WEEKDAYS = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
] as const;

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
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [auditsPerDay, setAuditsPerDay] = useState('1');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(goal?.value ?? '');
    setDescription(goal?.description ?? '');
    setWeekdays(goal?.schedule?.weekdays ?? []);
    setAuditsPerDay(String(goal?.schedule?.audits_per_day ?? 1));
    setError(null);
  }, [open, goal]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error('Enter a goal value.');
      }
      if (config.key === 'retail' && weekdays.length === 0) {
        throw new Error('Choose at least one audit day.');
      }
      const count = Math.max(1, Math.min(20, Number.parseInt(auditsPerDay, 10) || 1));
      return upsertDashboardDepartmentGoal({
        department: config.key,
        value: trimmed,
        description: description.trim(),
        ...(config.key === 'retail'
          ? {
              schedule: {
                weekdays: [...weekdays].sort((a, b) => a - b),
                audits_per_day: count,
              },
            }
          : {}),
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
      // Schedule changes also recalculate daily cells and current-week achievement.
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'metrics'] });
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
    <Dialog open={open} onClose={onClose} maxWidth={config.key === 'retail' ? 'sm' : 'xs'} fullWidth>
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
            {config.kind === 'grade' ? 'Minimum Grade' : 'Goal'}
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

        {config.key === 'retail' ? (
          <>
            <Divider />
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
                Required Audit Days
              </Typography>
              {isSuperuser ? (
                <ToggleButtonGroup
                  value={weekdays}
                  onChange={(_, next: number[]) => setWeekdays(next)}
                  aria-label="Required Retail QA weekdays"
                  size="small"
                  sx={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                    '& .MuiToggleButton-root': {
                      minWidth: 0,
                      px: 0.5,
                      textTransform: 'none',
                      fontWeight: 800,
                      borderColor: 'divider',
                    },
                    '& .Mui-selected': {
                      bgcolor: `${dashboardPalette.goldSoft} !important`,
                      color: `${dashboardPalette.goldDark} !important`,
                      borderColor: `${dashboardPalette.gold} !important`,
                    },
                  }}
                >
                  {WEEKDAYS.map((day) => (
                    <ToggleButton key={day.value} value={day.value} aria-label={day.label}>
                      {day.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              ) : (
                <Stack direction="row" spacing={0.75} justifyContent="center" flexWrap="wrap" useFlexGap>
                  {WEEKDAYS.filter((day) => weekdays.includes(day.value)).map((day) => (
                    <Box
                      key={day.value}
                      sx={{
                        px: 1.15,
                        py: 0.55,
                        borderRadius: 99,
                        bgcolor: dashboardPalette.goldSoft,
                        color: dashboardPalette.goldDark,
                        fontWeight: 800,
                        fontSize: '0.78rem',
                      }}
                    >
                      {day.label}
                    </Box>
                  ))}
                  {weekdays.length === 0 ? (
                    <Typography color="text.secondary">No days scheduled.</Typography>
                  ) : null}
                </Stack>
              )}
              <Typography variant="caption" color="text.secondary" display="block" textAlign="center" sx={{ mt: 0.75 }}>
                Each selected day is measured independently.
              </Typography>
            </Box>

            <TextField
              label="Audits required per selected day"
              value={auditsPerDay}
              onChange={(e) => setAuditsPerDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
              onBlur={() => {
                const parsed = Number.parseInt(auditsPerDay, 10) || 1;
                setAuditsPerDay(String(Math.max(1, Math.min(20, parsed))));
              }}
              fullWidth
              disabled={!isSuperuser}
              inputProps={{ min: 1, max: 20, inputMode: 'numeric' }}
              helperText={
                weekdays.length
                  ? `${weekdays.length} scheduled day${weekdays.length === 1 ? '' : 's'} × ${Number.parseInt(auditsPerDay, 10) || 1} = ${
                      weekdays.length * (Number.parseInt(auditsPerDay, 10) || 1)
                    } audit${weekdays.length * (Number.parseInt(auditsPerDay, 10) || 1) === 1 ? '' : 's'} per full week`
                  : 'Choose days above to establish the weekly schedule.'
              }
            />

            <Alert severity="info" sx={{ py: 0.25 }}>
              A scheduled day is achieved only when its audit count is met and its last submitted
              grade meets the minimum grade. Completed days—and the full week once finished—turn gold.
            </Alert>
          </>
        ) : null}

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
            disabled={
              saveMutation.isPending ||
              !value.trim() ||
              (config.key === 'retail' && weekdays.length === 0)
            }
          >
            Save Goal
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
