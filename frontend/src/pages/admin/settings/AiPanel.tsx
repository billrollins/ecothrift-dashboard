import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  Divider,
  DialogContent,
  DialogTitle,
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
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import { useSnackbar } from 'notistack';
import {
  PROVIDER_LABEL,
  TIER_LABEL,
  type AiCatalogModel,
  type AiCatalogModelWrite,
  type AiModality,
  type AiProvider,
  type AiRefreshSummary,
} from '../../../api/aiSettings.api';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import {
  useAiActions,
  useAiModelPriceFlag,
  useAiModels,
  useAiRefreshSummary,
  useAiTiers,
  useArchiveAiModel,
  useCreateAiModel,
  useRunAiRefresh,
  useUnarchiveAiModel,
  useUpdateAiModel,
} from '../../../hooks/useAiSettings';
import { formatApiError } from '../labelStudio/labelStudioUtils';
import { AiActionsCard } from './AiActionsCard';
import { AiTiersCard, byPerf } from './AiTiersCard';
import { AiTryDialog } from './AiTryDialog';
import { PriceCell } from './AiPriceCell';
import { InlineTextCell } from './InlineTextCell';
import { Segmented } from './Segmented';
import { IconAdd, IconArchive, IconRefresh, IconUndo } from '../../../icons/ecoIcons';
import { longDate, monthYear, plain, timeOf, usd } from './aiFormat';

const PROVIDER_ORDER: AiProvider[] = ['anthropic', 'openai', 'xai', 'google', 'meta'];
const SOURCE_LABEL: Record<string, string> = { aa: 'AA', triage: '2 of 3', typed: 'Typed', list: 'Provider' };

interface NewModel {
  slug: string;
  label: string;
  provider: AiProvider;
  modality: AiModality;
}

const NEW_MODEL: NewModel = { slug: '', label: '', provider: 'anthropic', modality: 'text' };

/** One line for the last Refresh: when, how long, what changed. The full detail is its tooltip. */
function refreshLine(s: AiRefreshSummary | undefined): { line: string; detail: string } {
  if (!s?.finished_at) return { line: 'Not refreshed yet', detail: '' };
  const added = (s.providers ?? []).flatMap((p) => p.added);
  const failed = (s.providers ?? []).filter((p) => !p.ok);
  const p = s.prices ?? { filled: 0, confirmed: 0, flagged: 0, none: 0 };
  const parts = [
    `Refreshed ${timeOf(s.finished_at)} in ${s.seconds ?? 0} s`,
    added.length ? `${added.length} new` : 'no new models',
    s.aa?.ok ? `AA matched ${s.aa.matched}` : 'no AA data',
    `${p.filled} prices filled, ${p.confirmed} confirmed`,
  ];
  if (p.flagged) parts.push(`${p.flagged} to check`);
  if (s.gone?.length) parts.push(`${s.gone.length} no longer listed`);
  if (failed.length) parts.push(`${failed.map((f) => PROVIDER_LABEL[f.provider]).join(', ')} failed`);
  const detail = [
    added.length ? `New: ${added.join(', ')}` : '',
    s.gone?.length ? `No longer listed by the provider: ${s.gone.join(', ')}` : '',
    s.aa?.error ? s.aa.error : '',
    ...failed.map((f) => `${PROVIDER_LABEL[f.provider]}: ${f.error}`),
    ...(s.triage ?? []).map((t) => `Triage ${t.model}: ${t.ok ? `${t.priced} prices known` : t.error}`),
  ].filter(Boolean).join('\n');
  return { line: parts.join(' · '), detail };
}

export function AiPanel() {
  const { enqueueSnackbar } = useSnackbar();
  const modelsQuery = useAiModels();
  const tiersQuery = useAiTiers();
  const actionsQuery = useAiActions();
  const summaryQuery = useAiRefreshSummary();
  const createModel = useCreateAiModel();
  const updateModel = useUpdateAiModel();
  const archiveModel = useArchiveAiModel();
  const unarchiveModel = useUnarchiveAiModel();
  const refresh = useRunAiRefresh();
  const priceFlag = useAiModelPriceFlag();

  const [view, setView] = useState<'active' | 'archived'>('active');
  const [kind, setKind] = useState<AiModality>('text');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [trying, setTrying] = useState<AiCatalogModel[] | null>(null);
  const [adding, setAdding] = useState<NewModel | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<AiCatalogModel | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const models = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);
  // One type and one status at a time; by provider, then best Perf first.
  const visibleModels = useMemo(
    () =>
      models.filter((m) => m.status === view && m.modality === kind).slice().sort(
        (a, b) => PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider) || byPerf(a, b),
      ),
    [models, view, kind],
  );
  const count = (k: AiModality, v: 'active' | 'archived') => models.filter((m) => m.modality === k && m.status === v).length;

  if (modelsQuery.isLoading || actionsQuery.isLoading || tiersQuery.isLoading) {
    return <LoadingScreen message="Loading AI settings..." />;
  }
  if (modelsQuery.isError || actionsQuery.isError || tiersQuery.isError) {
    return <Typography color="error">Could not load AI settings.</Typography>;
  }
  const tiers = tiersQuery.data ?? [];
  const actions = actionsQuery.data ?? [];
  const summary = refreshLine(refresh.data ?? summaryQuery.data);
  const chosen = visibleModels.filter((m) => picked.has(m.id));
  const allPicked = visibleModels.length > 0 && chosen.length === visibleModels.length;

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const switchView = (next: 'active' | 'archived') => {
    setView(next);
    setPicked(new Set());
  };

  const switchKind = (next: AiModality) => {
    setKind(next);
    setPicked(new Set());
  };
  const image = kind === 'image';

  const saveField = async (m: AiCatalogModel, data: Partial<AiCatalogModelWrite>) => {
    try {
      await updateModel.mutateAsync({ id: m.id, data: { provider: m.provider, ...data } });
    } catch (err) {
      enqueueSnackbar(formatApiError(err, 'Could not save.'), { variant: 'error' });
      throw err;
    }
  };

  const runBulk = async (archive: boolean) => {
    setBulkBusy(true);
    const results = await Promise.allSettled(
      chosen.map((m) => (archive ? archiveModel.mutateAsync(m.id) : unarchiveModel.mutateAsync(m.id))),
    );
    setBulkBusy(false);
    setPicked(new Set());
    const failed = results.filter((r) => r.status === 'rejected').length;
    const tiersCleared = results.flatMap((r) =>
      r.status === 'fulfilled' && r.value && 'cleared_tiers' in r.value ? (r.value.cleared_tiers as string[]) : [],
    );
    const done = results.length - failed;
    const verb = archive ? 'Archived' : 'Unarchived';
    const tierNote = tiersCleared.length ? ` Pick a new model for ${tiersCleared.join(', ')}.` : '';
    const failNote = failed ? ` ${failed} could not be changed.` : '';
    enqueueSnackbar(`${verb} ${done} model${done === 1 ? '' : 's'}.${tierNote}${failNote}`, {
      variant: failed ? 'error' : tiersCleared.length ? 'warning' : 'success',
    });
  };

  const runRefresh = async () => {
    try {
      await refresh.mutateAsync();
    } catch (err) {
      enqueueSnackbar(formatApiError(err, 'Could not refresh.'), { variant: 'error' });
    }
  };

  const saveNew = async () => {
    if (!adding) return;
    setAddError(null);
    try {
      await createModel.mutateAsync({ ...adding, slug: adding.slug.trim(), label: adding.label.trim() });
      enqueueSnackbar(`Added ${adding.slug.trim()}`, { variant: 'success' });
      setAdding(null);
    } catch (err) {
      setAddError(formatApiError(err, 'Could not add the model.'));
    }
  };

  const answerFlag = async (accept: boolean) => {
    if (!flagged) return;
    try {
      await priceFlag.mutateAsync({ id: flagged.id, accept });
      enqueueSnackbar(accept ? `Saved the new price for ${flagged.slug}` : `Kept the saved price for ${flagged.slug}`, { variant: 'success' });
      setFlagged(null);
    } catch (err) {
      enqueueSnackbar(formatApiError(err, 'Could not save.'), { variant: 'error' });
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {trying && <AiTryDialog models={trying} onClose={() => setTrying(null)} />}

      <Card variant="outlined">
        <CardContent>
          {/* Title, the one main action, and what the last Refresh did: one line, read left to right. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            <Typography variant="h6" sx={{ flexShrink: 0 }}>Models</Typography>
            <Button variant="contained" size="small" startIcon={<IconRefresh />} onClick={() => void runRefresh()}
              disabled={refresh.isPending} sx={{ height: 32, flexShrink: 0, minWidth: 116 }}>
              {refresh.isPending ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Tooltip title={summary.detail ? <Box sx={{ whiteSpace: 'pre-line' }}>{summary.detail}</Box> : ''} enterDelay={250}>
              <Typography variant="body2" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                {refresh.isPending ? 'Asking every provider, Artificial Analysis and three models...' : summary.line}
              </Typography>
            </Tooltip>
          </Box>

          {/* What you see, then what you can do with what you picked: one group from the left, divided by kind. */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 2, mb: 1.5 }}>
            <Segmented label="Model type" value={kind} onChange={switchKind} options={[
              { value: 'text', label: 'Text', count: count('text', view) },
              { value: 'image', label: 'Image', count: count('image', view) },
            ]} />
            <Segmented label="Live or archived" value={view} onChange={switchView} options={[
              { value: 'active', label: 'Live', count: count(kind, 'active') },
              { value: 'archived', label: 'Archived', count: count(kind, 'archived') },
            ]} />
            <Divider orientation="vertical" flexItem sx={{ mx: 1, my: 0.5 }} />
            {view === 'active' ? (
              <>
                <Button size="small" variant="outlined" startIcon={<PlayArrowRounded />} disabled={!chosen.length}
                  onClick={() => setTrying(chosen)} sx={{ height: 32 }}>
                  Try
                </Button>
                <Button size="small" variant="outlined" startIcon={<IconArchive />} disabled={!chosen.length || bulkBusy}
                  onClick={() => void runBulk(true)} sx={{ height: 32 }}>
                  Archive
                </Button>
              </>
            ) : (
              <Button size="small" variant="outlined" startIcon={<IconUndo />} disabled={!chosen.length || bulkBusy}
                onClick={() => void runBulk(false)} sx={{ height: 32 }}>
                Unarchive
              </Button>
            )}
            <Divider orientation="vertical" flexItem sx={{ mx: 1, my: 0.5 }} />
            <Button size="small" startIcon={<IconAdd />} sx={{ height: 32 }}
              onClick={() => { setAddError(null); setAdding({ ...NEW_MODEL, modality: kind }); }}>
              Add model
            </Button>
            {chosen.length > 0 && (
              <Chip size="small" label={`${chosen.length} picked`} onDelete={() => setPicked(new Set())} sx={{ ml: 1 }} />
            )}
          </Box>
          <Table size="small" sx={{ '& td, & th': { px: 1 } }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={allPicked}
                    indeterminate={chosen.length > 0 && !allPicked}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(visibleModels.map((m) => m.id)))}
                    inputProps={{ 'aria-label': 'Pick every model' }}
                  />
                </TableCell>
                <TableCell>Model id</TableCell>
                <TableCell>Name · AA model</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell>Released</TableCell>
                <TableCell>Tier</TableCell>
                {image ? (
                  <TableCell align="right">$ per image</TableCell>
                ) : (
                  <>
                    <TableCell align="right">Input $/1M</TableCell>
                    <TableCell align="right">Output $/1M</TableCell>
                  </>
                )}
                <TableCell>Price from</TableCell>
                <TableCell align="right">
                  <Tooltip title={image ? "Artificial Analysis text-to-image arena ELO" : 'Artificial Analysis Intelligence Index'} enterDelay={250}>
                    <span>Perf</span>
                  </Tooltip>
                </TableCell>
                {!image && (
                  <>
                    <TableCell align="right">
                      <Tooltip title="What one Artificial Analysis test task cost on this model, thinking included (AA's spend, not ours): performance for the money" enterDelay={250}>
                        <span>AA $/task</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">Tokens/s</TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleModels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={image ? 9 : 12}>{view === 'active' ? 'No models yet. Click Refresh.' : 'Nothing archived.'}</TableCell>
                </TableRow>
              ) : (
                visibleModels.map((m) => (
                  <TableRow key={m.id} hover selected={picked.has(m.id)}>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={picked.has(m.id)} onChange={() => toggle(m.id)}
                        inputProps={{ 'aria-label': `Pick ${m.slug}` }} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <InlineTextCell mono value={m.slug} label={`${m.slug} model id`} onSave={(slug) => saveField(m, { slug })} />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <InlineTextCell value={m.label} label={`${m.slug} name`} placeholder="name" onSave={(label) => saveField(m, { label })} />
                      <br />
                      <InlineTextCell caption mono value={m.aa_slug} label={`${m.slug} AA model`} placeholder="AA: no match"
                        onSave={(aa_slug) => saveField(m, { aa_slug })} />
                    </TableCell>
                    <TableCell>{PROVIDER_LABEL[m.provider]}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', color: m.release_date ? 'text.primary' : 'text.disabled' }}>
                      <Tooltip title={longDate(m.release_date)} enterDelay={300}><span>{monthYear(m.release_date)}</span></Tooltip>
                    </TableCell>
                    <TableCell>{m.tier_keys.map((k) => TIER_LABEL[k]).join(', ') || '—'}</TableCell>
                    {image ? (
                      <TableCell align="right"><PriceCell model={m} field="image_price" /></TableCell>
                    ) : (
                      <>
                        <TableCell align="right"><PriceCell model={m} field="input_price" /></TableCell>
                        <TableCell align="right"><PriceCell model={m} field="output_price" /></TableCell>
                      </>
                    )}
                    <TableCell>
                      {m.price_flag ? (
                        <Chip size="small" color="warning" label="Check" onClick={() => setFlagged(m)} />
                      ) : (
                        <Typography variant="body2" color="text.secondary">{SOURCE_LABEL[m.price_source] ?? '—'}</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">{plain(m.aa_intelligence, image ? 0 : 1)}</TableCell>
                    {!image && (
                      <>
                        <TableCell align="right">{m.aa_task_cost != null ? usd(m.aa_task_cost) : '—'}</TableCell>
                        <TableCell align="right">{plain(m.aa_speed, 0)}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
            Scores and prices: Artificial Analysis (artificialanalysis.ai)
          </Typography>
        </CardContent>
      </Card>

      <AiTiersCard tiers={tiers} models={models} actions={actions} />

      <AiActionsCard actions={actions} tiers={tiers} models={models} />

      <Dialog open={flagged != null} onClose={() => setFlagged(null)} fullWidth maxWidth="xs">
        <DialogTitle>{flagged?.slug}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{flagged?.price_flag}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => void answerFlag(false)} disabled={priceFlag.isPending}>Keep saved</Button>
          <Button variant="contained" onClick={() => void answerFlag(true)} disabled={priceFlag.isPending}>
            {flagged?.modality === 'image'
              ? `Use ${usd(flagged?.flag_input)} per image`
              : `Use ${usd(flagged?.flag_input)} / ${usd(flagged?.flag_output)}`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={adding != null} onClose={() => setAdding(null)} fullWidth maxWidth="sm">
        <DialogTitle>Add model</DialogTitle>
        <DialogContent>
          {adding && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {addError && <Alert severity="error">{addError}</Alert>}
              <TextField label="Model id" value={adding.slug} onChange={(e) => setAdding({ ...adding, slug: e.target.value })}
                placeholder="claude-opus-5-5" fullWidth />
              <TextField label="Name" value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value })}
                placeholder="Claude Opus 5.5" fullWidth />
              <TextField select label="Provider" value={adding.provider}
                onChange={(e) => setAdding({ ...adding, provider: e.target.value as AiProvider })} fullWidth>
                {PROVIDER_ORDER.map((p) => <MenuItem key={p} value={p}>{PROVIDER_LABEL[p]}</MenuItem>)}
              </TextField>
              <TextField select label="Type" value={adding.modality}
                onChange={(e) => setAdding({ ...adding, modality: e.target.value as AiModality })} fullWidth>
                <MenuItem value="text">Text</MenuItem>
                <MenuItem value="image">Image</MenuItem>
              </TextField>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdding(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void saveNew()} disabled={!adding?.slug.trim() || createModel.isPending}>
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
