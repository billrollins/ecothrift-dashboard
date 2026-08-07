import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { upsertDashboardSalesGoal } from '../../api/pos.api';
import type { DashboardMetrics, DashboardSalesGoal } from '../../types/pos.types';
import { dashboardPalette } from './dashboardCardStyles';
import { formatDashboardCurrency } from './dashboardFormatters';

interface SalesGoalDialogProps {
  open: boolean;
  onClose: () => void;
  goal: DashboardSalesGoal | null;
  isSuperuser: boolean;
}

const STEP = 100;
const GOLD = dashboardPalette.gold;

function toDollars(value: string): number {
  const parsed = Math.floor(Number.parseFloat(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function groupDigits(dollars: number): string {
  return dollars.toLocaleString('en-US');
}

export function SalesGoalDialog({ open, onClose, goal, isSuperuser }: SalesGoalDialogProps) {
  const queryClient = useQueryClient();
  const [dollars, setDollars] = useState(0);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDollars(toDollars(goal?.amount ?? '0'));
    setDescription(goal?.description ?? '');
    setError(null);
  }, [open, goal]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (dollars <= 0) {
        throw new Error('Enter a valid goal amount greater than zero.');
      }
      return upsertDashboardSalesGoal({
        amount: dollars.toFixed(2),
        description: description.trim(),
      });
    },
    onSuccess: ({ data }) => {
      queryClient.setQueryData<DashboardMetrics>(['dashboard', 'metrics'], (current) => {
        if (!current) return current;
        return {
          ...current,
          sales: { ...current.sales, goal: data },
        };
      });
      onClose();
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to save the sales goal. Please try again.';
      setError(message);
    },
  });

  const adjust = (delta: number) => {
    setDollars((prev) => Math.max(0, prev + delta));
  };

  const handleChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    setDollars(digits ? Math.min(Number.parseInt(digits, 10), 999999999) : 0);
  };

  const title = isSuperuser && !goal ? 'Set Weekly Sales Goal' : 'Weekly Sales Goal';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          textAlign: 'center',
          fontWeight: 900,
          fontSize: '1.4rem',
          letterSpacing: '-0.01em',
          pb: 0.5,
        }}
      >
        {title}
        <Box
          aria-hidden
          sx={{
            mx: 'auto',
            mt: 1,
            width: 56,
            height: 3,
            borderRadius: 99,
            background: `linear-gradient(90deg, ${dashboardPalette.goldBright}, ${dashboardPalette.gold})`,
          }}
        />
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1, overflow: 'visible' }}>
        {error && <Alert severity="error">{error}</Alert>}

        {isSuperuser ? (
          <>
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
                Goal Amount
              </Typography>
              <Box
                sx={{
                  position: 'relative',
                  borderRadius: 3,
                  px: 2,
                  py: 1.5,
                  background:
                    `linear-gradient(145deg, rgba(255,250,224,0.95), ${dashboardPalette.surface})`,
                  border: '1px solid',
                  borderColor: 'rgba(189, 134, 24, 0.45)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 10px 28px rgba(189, 134, 24, 0.14)',
                }}
              >
                <TextField
                  variant="standard"
                  fullWidth
                  value={groupDigits(dollars)}
                  onChange={(e) => handleChange(e.target.value)}
                  inputRef={inputRef}
                  onFocus={(e) => e.target.select()}
                  inputProps={{
                    inputMode: 'numeric',
                    'aria-label': 'Goal amount in dollars',
                    style: { textAlign: 'center' },
                  }}
                  InputProps={{
                    disableUnderline: true,
                    startAdornment: (
                      <InputAdornment position="start" sx={{ mr: 0.5 }}>
                        <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: GOLD, lineHeight: 1 }}>
                          $
                        </Typography>
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <Stack spacing={0}>
                          <IconButton
                            size="small"
                            aria-label="Increase by 100"
                            onClick={() => adjust(STEP)}
                            sx={{ p: 0, width: 44, height: 44, color: GOLD }}
                          >
                            <KeyboardArrowUp fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            aria-label="Decrease by 100"
                            onClick={() => adjust(-STEP)}
                            sx={{ p: 0, width: 44, height: 44, color: GOLD }}
                          >
                            <KeyboardArrowDown fontSize="small" />
                          </IconButton>
                        </Stack>
                      </InputAdornment>
                    ),
                    sx: {
                      fontSize: '2.4rem',
                      fontWeight: 900,
                      color: GOLD,
                      letterSpacing: '-0.5px',
                    },
                  }}
                />
              </Box>
              <Typography
                variant="caption"
                sx={{ display: 'block', mt: 0.75, textAlign: 'center', color: 'text.secondary' }}
              >
                Arrows adjust by ${STEP.toLocaleString('en-US')}. Whole dollars only.
              </Typography>
            </Box>

            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this goal represents…"
              fullWidth
              multiline
              minRows={3}
            />
          </>
        ) : (
          <>
            <Box sx={{ textAlign: 'center', py: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  fontWeight: 800,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color: 'text.secondary',
                }}
              >
                Goal Amount
              </Typography>
              <Typography sx={{ fontSize: '2.4rem', fontWeight: 900, color: GOLD, lineHeight: 1.2 }}>
                {goal ? formatDashboardCurrency(goal.amount) : '-'}
              </Typography>
            </Box>
            <TextField
              label="Description"
              value={goal?.description?.trim() ? goal.description : 'No description provided.'}
              fullWidth
              multiline
              minRows={3}
              InputProps={{ readOnly: true }}
            />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saveMutation.isPending}>
          {isSuperuser ? 'Cancel' : 'Close'}
        </Button>
        {isSuperuser && (
          <Button
            variant="contained"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || dollars <= 0}
          >
            Save Goal
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
