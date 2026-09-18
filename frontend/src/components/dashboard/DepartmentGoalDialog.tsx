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
const RETAIL_GOAL_LETTERS = ['A+', 'A', 'A-', 'B+', 'B', 'B-'] as const;

export function retailGoalBand(raw?: string | null): string {
  const letter = (raw || 'B').trim().toUpperCase().replace(/\s+/g, '');
  return (RETAIL_GOAL_LETTERS as readonly string[]).includes(letter) ? letter : 'B';
}
const GRADE_SCALE = [
  { letter: 'A+', gpa: '4.0', range: '97–100%' },
  { letter: 'A', gpa: '4.0', range: '93–96%' },
  { letter: 'A-', gpa: '3.7', range: '90–92%' },
  { letter: 'B+', gpa: '3.3', range: '87–89%' },
  { letter: 'B', gpa: '3.0', range: '83–86%' },
  { letter: 'B-', gpa: '2.7', range: '80–82%' },
  { letter: 'C+', gpa: '2.3', range: '77–79%' },
  { letter: 'C', gpa: '2.0', range: '73–76%' },
  { letter: 'C-', gpa: '1.7', range: '70–72%' },
  { letter: 'D+', gpa: '1.3', range: '67–69%' },
  { letter: 'D', gpa: '1.0', range: '65–66%' },
  { letter: 'D-', gpa: '0.7', range: '60–64%' },
  { letter: 'F', gpa: '0.0', range: 'Below 60%' },
] as const;

export function formatDepartmentGoalValue(kind: DepartmentGoalKind, value: string): string {
  if (!value) return '-';
  if (kind === 'grade') {
    return value.trim().toUpperCase().replace(/\s+/g, '') || '-';
  }
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
    setValue(config.key === 'retail' ? retailGoalBand(goal?.value) : (goal?.value ?? ''));
    setDescription(goal?.description ?? '');
    setError(null);
  }, [open, goal, config.key]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmed = value.trim();
      if (config.key === 'retail') {
        const letter = trimmed.toUpperCase().replace(/\s+/g, '');
        if (!(RETAIL_GOAL_LETTERS as readonly string[]).includes(letter)) {
          throw new Error('Choose a letter grade.');
        }
        return upsertDashboardDepartmentGoal({
          department: config.key,
          value: letter,
          description: description.trim(),
        });
      }
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
        : 'Letter grade: A, B, or C.';

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
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}

        {config.key === 'retail' ? (
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
            Minimum Grade
          </Typography>
          {isSuperuser ? (
            <ToggleButtonGroup
              exclusive
              value={value}
              onChange={(_, next: string | null) => {
                if (next) setValue(next);
              }}
              aria-label="Retail goal letter"
              sx={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 0.5,
                '& .MuiToggleButton-root': {
                  minHeight: 44,
                  fontWeight: 900,
                  fontSize: '1.15rem',
                  borderRadius: '8px !important',
                  borderLeft: '1px solid',
                  marginLeft: '0 !important',
                },
                '& .Mui-selected': {
                  bgcolor: `${dashboardPalette.goldSoft} !important`,
                  color: `${dashboardPalette.goldDark} !important`,
                  borderColor: `${dashboardPalette.gold} !important`,
                },
              }}
            >
              {RETAIL_GOAL_LETTERS.map((letter) => (
                <ToggleButton key={letter} value={letter} aria-label={`Goal ${letter}`}>
                  {letter}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          ) : (
            <Typography
              sx={{ fontSize: '2.2rem', fontWeight: 900, color: GOLD, textAlign: 'center', lineHeight: 1.2 }}
            >
              {formatDepartmentGoalValue('grade', value)}
            </Typography>
          )}
        </Box>
        ) : (
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
        )}

        {config.key === 'retail' ? (
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
              Grade Scale
            </Typography>
            <Box
              component="table"
              sx={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.78rem',
                '& th, & td': {
                  py: 0.45,
                  px: 0.75,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  textAlign: 'left',
                },
                '& th': {
                  fontWeight: 800,
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  fontSize: '0.68rem',
                },
                '& td:first-of-type': { fontWeight: 800 },
              }}
            >
              <thead>
                <tr>
                  <th>Letter</th>
                  <th>GPA</th>
                  <th>Percentage</th>
                </tr>
              </thead>
              <tbody>
                {GRADE_SCALE.map((row) => (
                  <Box
                    component="tr"
                    key={row.letter}
                    sx={
                      row.letter === value
                        ? { bgcolor: dashboardPalette.goldSoft, '& td': { color: dashboardPalette.goldDark } }
                        : undefined
                    }
                  >
                    <td>{row.letter}</td>
                    <td>{row.gpa}</td>
                    <td>{row.range}</td>
                  </Box>
                ))}
              </tbody>
            </Box>
          </Box>
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
              (config.key !== 'retail' && !value.trim()) ||
              (config.key === 'retail' && !(RETAIL_GOAL_LETTERS as readonly string[]).includes(value.trim().toUpperCase().replace(/\s+/g, '')))
            }
          >
            Save Goal
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
