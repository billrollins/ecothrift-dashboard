import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { useSnackbar } from 'notistack';
import {
  AI_EFFORTS,
  EFFORT_LABEL,
  PROVIDER_LABEL,
  type AiActionSetting,
  type AiCatalogModel,
  type AiDiscoverProviderResult,
  type AiEffort,
  type AiModality,
  type AiProvider,
} from '../../../api/aiSettings.api';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import {
  useAiActions,
  useAiModels,
  useArchiveAiModel,
  useCreateAiModel,
  useDiscoverAiModels,
  useUnarchiveAiModel,
  useUpdateAiAction,
  useUpdateAiModel,
} from '../../../hooks/useAiSettings';
import { formatApiError } from '../labelStudio/labelStudioUtils';

const MODALITY_LABEL: Record<AiModality, string> = { text: 'Text', image: 'Image' };

const ACTION_TIPS: Record<string, string> = {
  AI_CHAT: 'A model picked in the chat box wins over this one.',
  INVENTORY_CLASSIFY: 'Answers in about 50 tokens. Keep effort Off and do not pick Claude Opus 5.5 (it always thinks), or answers can come back empty.',
  LABEL_IMAGE: 'Only xAI image models work here. No effort setting.',
  FLOORPLAN_SVG: 'Must answer within 25 seconds. If it times out, pick a faster model or lower effort.',
  FLOORPLAN_ADJUST: 'Must answer within 25 seconds. If it times out, pick a faster model or lower effort.',
};

interface ModelDraft {
  id: number | null;
  slug: string;
  label: string;
  provider: AiProvider;
  modality: AiModality;
}

const NEW_DRAFT: ModelDraft = { id: null, slug: '', label: '', provider: 'anthropic', modality: 'text' };

export function AiPanel() {
  const { enqueueSnackbar } = useSnackbar();
  const modelsQuery = useAiModels();
  const actionsQuery = useAiActions();
  const createModel = useCreateAiModel();
  const updateModel = useUpdateAiModel();
  const archiveModel = useArchiveAiModel();
  const unarchiveModel = useUnarchiveAiModel();
  const discover = useDiscoverAiModels();
  const updateAction = useUpdateAiAction();

  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<ModelDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [toArchive, setToArchive] = useState<AiCatalogModel | null>(null);
  const [discoverResults, setDiscoverResults] = useState<AiDiscoverProviderResult[] | null>(null);

  const models = useMemo(() => modelsQuery.data ?? [], [modelsQuery.data]);
  const actions = actionsQuery.data ?? [];
  const visibleModels = useMemo(
    () => (showArchived ? models : models.filter((m) => m.status === 'active')),
    [models, showArchived],
  );

  if (modelsQuery.isLoading || actionsQuery.isLoading) {
    return <LoadingScreen message="Loading AI settings..." />;
  }
  if (modelsQuery.isError || actionsQuery.isError) {
    return <Typography color="error">Could not load AI settings.</Typography>;
  }

  const openDraft = (next: ModelDraft) => {
    setDraftError(null);
    setDraft(next);
  };

  const saveDraft = async () => {
    if (!draft) return;
    setDraftError(null);
    const slug = draft.slug.trim();
    try {
      if (draft.id == null) {
        await createModel.mutateAsync({ slug, label: draft.label.trim(), provider: draft.provider, modality: draft.modality });
        enqueueSnackbar(`Added ${slug}`, { variant: 'success' });
      } else {
        await updateModel.mutateAsync({ id: draft.id, data: { slug, label: draft.label.trim(), provider: draft.provider } });
        enqueueSnackbar(`Saved ${slug}`, { variant: 'success' });
      }
      setDraft(null);
    } catch (err) {
      setDraftError(formatApiError(err, 'Could not save the model.'));
    }
  };

  const runArchive = async () => {
    if (!toArchive) return;
    const row = toArchive;
    try {
      const data = await archiveModel.mutateAsync(row.id);
      enqueueSnackbar(`Archived ${row.slug}. ${data.cleared_actions} action(s) now use the .env model.`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(formatApiError(err, 'Could not archive.'), { variant: 'error' });
    } finally {
      setToArchive(null);
    }
  };

  const runUnarchive = async (row: AiCatalogModel) => {
    try {
      await unarchiveModel.mutateAsync(row.id);
      enqueueSnackbar(`${row.slug} is back in the lists`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(formatApiError(err, 'Could not unarchive.'), { variant: 'error' });
    }
  };

  const runDiscover = async () => {
    try {
      const data = await discover.mutateAsync();
      setDiscoverResults(data.providers);
    } catch (err) {
      enqueueSnackbar(formatApiError(err, 'Could not check for new models.'), { variant: 'error' });
    }
  };

  const saveAction = async (row: AiActionSetting, data: { model?: number | null; effort?: AiEffort }) => {
    try {
      await updateAction.mutateAsync({ purpose: row.purpose, data });
      enqueueSnackbar(`Saved ${row.label}`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(formatApiError(err, 'Could not save.'), { variant: 'error' });
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card variant="outlined">
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="h6" sx={{ flex: 1 }}>Models</Typography>
            <FormControlLabel
              control={<Switch size="small" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />}
              label="Show archived"
            />
            <Button variant="outlined" size="small" onClick={() => void runDiscover()} disabled={discover.isPending}>
              {discover.isPending ? 'Checking...' : 'Check for new models'}
            </Button>
            <Button variant="contained" size="small" onClick={() => openDraft(NEW_DRAFT)}>
              Add model
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Model id</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleModels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>No models yet. Click Check for new models or Add model.</TableCell>
                </TableRow>
              ) : (
                visibleModels.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell sx={{ fontFamily: 'monospace' }}>{m.slug}</TableCell>
                    <TableCell>{m.label || '\u2014'}</TableCell>
                    <TableCell>{PROVIDER_LABEL[m.provider]}</TableCell>
                    <TableCell>{MODALITY_LABEL[m.modality]}</TableCell>
                    <TableCell>{m.status === 'active' ? 'Active' : 'Archived'}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title="Edit" enterDelay={250}>
                        <IconButton
                          size="small"
                          onClick={() => openDraft({ id: m.id, slug: m.slug, label: m.label, provider: m.provider, modality: m.modality })}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {m.status === 'active' ? (
                        <Button size="small" color="error" onClick={() => setToArchive(m)}>
                          Archive
                        </Button>
                      ) : (
                        <Button size="small" onClick={() => void runUnarchive(m)}>
                          Unarchive
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>Actions</Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Action</TableCell>
                <TableCell sx={{ width: '45%' }}>Model</TableCell>
                <TableCell sx={{ width: '25%' }}>Effort</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {actions.map((row) => {
                const tip = ACTION_TIPS[row.purpose];
                const options = models.filter((m) => m.status === 'active' && m.modality === row.modality);
                return (
                  <TableRow key={row.purpose}>
                    <TableCell>
                      <Tooltip title={tip ? `${row.purpose}. ${tip}` : row.purpose} enterDelay={250}>
                        <span>{row.label}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={row.model == null ? '' : String(row.model)}
                        disabled={updateAction.isPending}
                        onChange={(e) =>
                          void saveAction(row, { model: e.target.value === '' ? null : Number(e.target.value) })
                        }
                      >
                        <MenuItem value="">Use .env ({row.env_model})</MenuItem>
                        {options.map((m) => (
                          <MenuItem key={m.id} value={String(m.id)}>
                            {(m.label || m.slug) + ' (' + PROVIDER_LABEL[m.provider] + ')'}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={row.effort}
                        disabled={row.modality === 'image' || updateAction.isPending}
                        onChange={(e) => void saveAction(row, { effort: e.target.value as AiEffort })}
                      >
                        {AI_EFFORTS.map((eff) => (
                          <MenuItem key={eff} value={eff}>
                            {EFFORT_LABEL[eff]}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={draft != null} onClose={() => setDraft(null)} fullWidth maxWidth="sm">
        <DialogTitle>{draft?.id == null ? 'Add model' : 'Edit model'}</DialogTitle>
        <DialogContent>
          {draft && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              {draftError && <Alert severity="error">{draftError}</Alert>}
              <TextField
                label="Model id"
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                placeholder="claude-opus-5-5"
                fullWidth
              />
              <TextField
                label="Name"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Claude Opus 5.5"
                fullWidth
              />
              <TextField
                select
                label="Provider"
                value={draft.provider}
                onChange={(e) => setDraft({ ...draft, provider: e.target.value as AiProvider })}
                fullWidth
              >
                {(Object.keys(PROVIDER_LABEL) as AiProvider[]).map((p) => (
                  <MenuItem key={p} value={p}>
                    {PROVIDER_LABEL[p]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Type"
                value={draft.modality}
                onChange={(e) => setDraft({ ...draft, modality: e.target.value as AiModality })}
                disabled={draft.id != null}
                fullWidth
              >
                <MenuItem value="text">Text</MenuItem>
                <MenuItem value="image">Image</MenuItem>
              </TextField>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void saveDraft()}
            disabled={!draft?.slug.trim() || createModel.isPending || updateModel.isPending}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={discoverResults != null} onClose={() => setDiscoverResults(null)} fullWidth maxWidth="sm">
        <DialogTitle>Check for new models</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {(discoverResults ?? []).map((r) => (
              <Typography key={r.provider} variant="body2">
                <strong>{PROVIDER_LABEL[r.provider]}:</strong>{' '}
                {r.ok
                  ? `found ${r.found}, added ${r.added.length}${r.added.length ? ` (${r.added.join(', ')})` : ''}`
                  : `not checked - ${r.error}`}
              </Typography>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscoverResults(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={toArchive != null}
        title="Archive this model?"
        message={toArchive ? `Archive ${toArchive.slug}? It leaves every model list, and actions that use it go back to their .env model.` : ''}
        confirmLabel="Archive"
        confirmColor="error"
        loading={archiveModel.isPending}
        onCancel={() => setToArchive(null)}
        onConfirm={() => void runArchive()}
      />
    </Box>
  );
}
