import { Fragment, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
  AI_EFFORTS,
  EFFORT_LABEL,
  PROVIDER_LABEL,
  TEXT_TIERS,
  TIER_LABEL,
  type AiActionRow,
  type AiActionWrite,
  type AiCatalogModel,
  type AiEffort,
  type AiTier,
  type AiTierKey,
} from '../../../api/aiSettings.api';
import {
  useAiTierReview,
  useDismissAiSuggestion,
  useStartAiTierReview,
  useUpdateAiAction,
} from '../../../hooks/useAiSettings';
import { IconAiAssist, IconEdit as EditIcon } from '../../../icons/ecoIcons';
import { formatApiError } from '../labelStudio/labelStudioUtils';
import { timeOf, usd } from './aiFormat';

function reviewLine(review: ReturnType<typeof useAiTierReview>['data']): string {
  if (!review?.status) return 'No review yet';
  if (review.status === 'running') return 'Reviewing every action...';
  if (review.status === 'failed') return `Review failed: ${review.error ?? ''}`;
  const n = review.proposed ?? 0;
  return `Reviewed ${timeOf(review.finished_at)} by ${review.model}: ${n ? `${n} change${n === 1 ? '' : 's'} proposed` : 'every tier fits'}`;
}

interface Override {
  row: AiActionRow;
  model: string;
  effort: AiEffort | '';
}

/** Every AI job in Dash: Workspace > Page > Function, its tier, what it runs on, and what it costs. */
export function AiActionsCard({ actions, tiers, models }: { actions: AiActionRow[]; tiers: AiTier[]; models: AiCatalogModel[] }) {
  const { enqueueSnackbar } = useSnackbar();
  const update = useUpdateAiAction();
  const dismiss = useDismissAiSuggestion();
  const review = useAiTierReview();
  const startReview = useStartAiTierReview();
  const [override, setOverride] = useState<Override | null>(null);
  const reviewing = review.data?.status === 'running';
  const tierByKey = Object.fromEntries(tiers.map((t) => [t.key, t])) as Partial<Record<AiTierKey, AiTier>>;

  const save = async (row: AiActionRow, data: AiActionWrite) => {
    try {
      await update.mutateAsync({ purpose: row.purpose, data });
      enqueueSnackbar(`Saved ${row.label}`, { variant: 'success' });
      return true;
    } catch (err) {
      enqueueSnackbar(formatApiError(err, 'Could not save.'), { variant: 'error' });
      return false;
    }
  };

  const runReview = async () => {
    try {
      await startReview.mutateAsync();
    } catch (err) {
      enqueueSnackbar(formatApiError(err, 'Could not start the review.'), { variant: 'error' });
    }
  };

  const saveOverride = async () => {
    if (!override) return;
    const ok = await save(override.row, {
      model: override.model === '' ? null : Number(override.model),
      effort: override.effort,
    });
    if (ok) setOverride(null);
  };

  let lastWorkspace: string | null = null;
  return (
    <Card variant="outlined">
      <CardContent>
        {/* Same shape as Models: title, its one action, then the status of that action. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, minWidth: 0 }}>
          <Typography variant="h6" sx={{ flexShrink: 0 }}>Actions</Typography>
          <Button variant="outlined" size="small" startIcon={<IconAiAssist />} onClick={() => void runReview()}
            disabled={reviewing || startReview.isPending} sx={{ height: 32, flexShrink: 0, minWidth: 168 }}>
            {reviewing ? 'Reviewing...' : 'AI: suggest tiers'}
          </Button>
          <Typography variant="body2" color={review.data?.status === 'failed' ? 'error' : 'text.secondary'} noWrap sx={{ minWidth: 0 }}>
            {reviewLine(review.data)}
          </Typography>
        </Box>
        <Table size="small" sx={{ '& td, & th': { px: 1 } }}>
          <TableHead>
            <TableRow>
              <TableCell>Page</TableCell>
              <TableCell>Function</TableCell>
              <TableCell sx={{ width: 130 }}>Tier</TableCell>
              <TableCell sx={{ width: 120 }}>AI suggests</TableCell>
              <TableCell>Runs on</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>Runs 30d</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>Per run</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>Spent 30d</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {actions.map((row) => {
              const header = row.workspace !== lastWorkspace;
              lastWorkspace = row.workspace;
              const tierChoices: AiTierKey[] = row.modality === 'image' ? ['image'] : TEXT_TIERS;
              const own = row.model_from === 'action' || row.effort_from === 'action';
              return (
                <Fragment key={row.purpose}>
                  {header && (
                    <TableRow>
                      <TableCell colSpan={9} sx={{ fontWeight: 700, bgcolor: 'action.hover' }}>
                        {row.workspace || 'Not placed yet'}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell sx={{ color: 'text.secondary' }}>{row.page}</TableCell>
                    <TableCell>
                      <Tooltip title={`${row.description} (${row.purpose})`} enterDelay={400}>
                        <span>{row.label}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={row.tier}
                        SelectProps={{ renderValue: (v) => TIER_LABEL[v as AiTierKey] }}
                        disabled={row.modality === 'image' || update.isPending}
                        inputProps={{ 'aria-label': `${row.label} tier` }}
                        onChange={(e) => void save(row, { tier: e.target.value as AiTierKey })}
                      >
                        {tierChoices.map((key) => (
                          <MenuItem key={key} value={key}>
                            {TIER_LABEL[key]}
                            {row.tier_costs[key] ? ` · ${usd(row.tier_costs[key])}` : ''}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      {row.suggested_tier ? (
                        <Tooltip title={`${row.suggested_reason} Click to use it.`} enterDelay={200}>
                          <Chip
                            size="small"
                            color="info"
                            label={TIER_LABEL[row.suggested_tier]}
                            onClick={() => void save(row, { tier: row.suggested_tier as AiTierKey })}
                            onDelete={() => void dismiss.mutateAsync(row.purpose)}
                          />
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.disabled">{'—'}</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 13, fontStyle: own ? 'italic' : 'normal' }}>
                      {row.run_model}
                      {row.modality === 'text' ? ` · ${row.run_effort}` : ''}
                      {own ? ' (own)' : row.model_from === 'env' ? ' (.env)' : ''}
                    </TableCell>
                    <TableCell align="right">{row.runs_30d || '—'}</TableCell>
                    <TableCell align="right">{usd(row.cost_per_run)}</TableCell>
                    <TableCell align="right">{usd(row.spent_30d)}</TableCell>
                    <TableCell align="right" sx={{ width: 40 }}>
                      <Tooltip title="Own model or effort" enterDelay={250}>
                        <IconButton
                          size="small"
                          aria-label={`Own model or effort for ${row.label}`}
                          onClick={() => setOverride({ row, model: row.model == null ? '' : String(row.model), effort: row.effort })}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={override != null} onClose={() => setOverride(null)} fullWidth maxWidth="sm">
        <DialogTitle>{override?.row.label}</DialogTitle>
        <DialogContent>
          {override && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {override.row.workspace} &gt; {override.row.page}. {override.row.description}
              </Typography>
              <TextField
                select
                label="Model"
                value={override.model}
                SelectProps={{ displayEmpty: true }}
                InputLabelProps={{ shrink: true }}
                onChange={(e) => setOverride({ ...override, model: e.target.value })}
                fullWidth
              >
                <MenuItem value="">
                  Follow the {TIER_LABEL[override.row.tier]} tier ({tierByKey[override.row.tier]?.model_slug ?? tierByKey[override.row.tier]?.env_model})
                </MenuItem>
                {models
                  .filter((m) => m.status === 'active' && m.modality === override.row.modality)
                  .map((m) => (
                    <MenuItem key={m.id} value={String(m.id)}>{`${m.label || m.slug} (${PROVIDER_LABEL[m.provider]})`}</MenuItem>
                  ))}
              </TextField>
              {override.row.modality === 'text' && (
                <TextField
                  select
                  label="Effort"
                  value={override.effort}
                  SelectProps={{ displayEmpty: true }}
                  InputLabelProps={{ shrink: true }}
                  onChange={(e) => setOverride({ ...override, effort: e.target.value as AiEffort | '' })}
                  fullWidth
                >
                  <MenuItem value="">The tier's ({tierByKey[override.row.tier]?.effort})</MenuItem>
                  {AI_EFFORTS.map((eff) => (
                    <MenuItem key={eff} value={eff}>{EFFORT_LABEL[eff]}</MenuItem>
                  ))}
                </TextField>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverride(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveOverride()} disabled={update.isPending}>Save</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
