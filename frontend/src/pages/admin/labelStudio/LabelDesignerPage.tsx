/**
 * Full-page Label Studio designer for template labels.
 * Route: /admin/label-studio/:id
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import PrintIcon from '@mui/icons-material/Print';
import SaveIcon from '@mui/icons-material/Save';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useSnackbar } from 'notistack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import {
  clearLabelBackground,
  fetchLabelMediaBytes,
  getCustomLabel,
  updateCustomLabel,
  uploadLabelBackground,
  type LabelDefinition,
  type LabelElement,
  type LabelTextElement,
} from '../../../api/labels.api';
import AiCreateDialog from './AiCreateDialog';
import LabelCanvas from './LabelCanvas';
import LabelPrintDialog from './LabelPrintDialog';
import {
  defaultBarcodeElement,
  defaultQrElement,
  defaultTextElement,
  EMPTY_DEFINITION,
  newIncrementVariable,
  newTextVariable,
  normalizeDefinition,
  moveElement,
  patchElement,
} from './designerState';
import { INCREMENT_FORMATS, variableDefaultHint } from './variableResolve';
import type { LabelIncrementFormat } from '../../../api/labels.api';
import {
  designerSnapshotKey,
  elementDisplayName,
  formatApiError,
} from './labelStudioUtils';

const FONTS = ['arial', 'consolas', 'georgia'] as const;
const ALIGNS = ['left', 'center', 'right'] as const;
const ECCS = ['L', 'M', 'Q', 'H'] as const;

export default function LabelDesignerPage() {
  const { id } = useParams<{ id: string }>();
  const labelId = Number(id);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['custom-label', labelId],
    queryFn: async () => (await getCustomLabel(labelId)).data,
    enabled: Number.isFinite(labelId) && labelId > 0,
  });

  const [name, setName] = useState('');
  const [widthIn, setWidthIn] = useState('3');
  const [heightIn, setHeightIn] = useState('2');
  const [definition, setDefinition] = useState<LabelDefinition>(EMPTY_DEFINITION);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [bgUpload, setBgUpload] = useState<File | null>(null);
  const [clearBg, setClearBg] = useState(false);
  const [localBgUrl, setLocalBgUrl] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const [backgroundReloadToken, setBackgroundReloadToken] = useState(0);
  const [baselineKey, setBaselineKey] = useState('');
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const [deleteVariableIndex, setDeleteVariableIndex] = useState<number | null>(null);
  const initializedLabelId = useRef<number | null>(null);
  const pendingNavigation = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!data) return;
    if (data.kind !== 'template') {
      navigate('/admin/label-studio', { replace: true });
      return;
    }
    if (initializedLabelId.current === labelId) return;
    initializedLabelId.current = labelId;
    const normalized = normalizeDefinition(data.definition);
    setName(data.name);
    setWidthIn(data.width_in ?? '3');
    setHeightIn(data.height_in ?? '2');
    setDefinition(normalized);
    setBaselineKey(
      designerSnapshotKey({
        name: data.name,
        widthIn: data.width_in ?? '3',
        heightIn: data.height_in ?? '2',
        definition: normalized,
        backgroundFileId: data.background_file?.id ?? null,
      }),
    );
    setSelectedIndex(null);
    setBgUpload(null);
    setClearBg(false);
    setLocalBgUrl(null);
  }, [data, labelId, navigate]);

  const draftBackgroundFileId = bgUpload
    ? -1
    : clearBg
      ? null
      : data?.background_file?.id ?? null;
  const currentSnapshotKey = useMemo(
    () =>
      designerSnapshotKey({
        name,
        widthIn,
        heightIn,
        definition,
        backgroundFileId: draftBackgroundFileId,
      }),
    [name, widthIn, heightIn, definition, draftBackgroundFileId],
  );
  const isDirty = baselineKey !== '' && currentSnapshotKey !== baselineKey;
  const isValid =
    Boolean(name.trim()) &&
    Number(widthIn) > 0 &&
    Number(heightIn) > 0 &&
    definition.variables.every((v) => v.name.trim()) &&
    definition.variables.every(
      (v) =>
        v.kind !== 'increment' ||
        (Number.isFinite(Number(v.default_start)) && Number.isFinite(Number(v.default_step))),
    );

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const requestNavigation = useCallback(
    (action: () => void) => {
      if (!isDirty) {
        action();
        return;
      }
      pendingNavigation.current = action;
      setLeaveConfirmOpen(true);
    },
    [isDirty],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (selectedIndex == null) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        setDefinition((d) => ({
          ...d,
          elements: d.elements.filter((_, i) => i !== selectedIndex),
        }));
        setSelectedIndex(null);
        return;
      }
      const delta = e.shiftKey ? 5 : 1;
      const changes: Record<string, number> = {};
      if (e.key === 'ArrowLeft') changes.x_pct = -delta;
      else if (e.key === 'ArrowRight') changes.x_pct = delta;
      else if (e.key === 'ArrowUp') changes.y_pct = -delta;
      else if (e.key === 'ArrowDown') changes.y_pct = delta;
      else return;
      e.preventDefault();
      setDefinition((d) => {
        const element = d.elements[selectedIndex];
        if (!element) return d;
        return patchElement(d, selectedIndex, {
          x_pct: Math.max(0, Math.min(100, element.x_pct + (changes.x_pct ?? 0))),
          y_pct: Math.max(0, Math.min(100, element.y_pct + (changes.y_pct ?? 0))),
        });
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIndex]);

  // Staff media proxy requires JWT — <img src={proxyUrl}> gets 401. Load via
  // authenticated fetch → blob URL (same pattern as LabelPrintDialog).
  const [remoteBgUrl, setRemoteBgUrl] = useState<string | null>(null);
  const backgroundFileId = data?.background_file?.id ?? null;

  useEffect(() => {
    if (clearBg || localBgUrl || !backgroundFileId || !Number.isFinite(labelId)) {
      setRemoteBgUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    void fetchLabelMediaBytes(labelId, 'background', backgroundFileId)
      .then((bytes) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([bytes]));
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
          return;
        }
        setRemoteBgUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return objectUrl;
        });
        setBackgroundError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setRemoteBgUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
          setBackgroundError('Background could not be loaded. Save is safe; retry or reload.');
        }
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [clearBg, localBgUrl, backgroundFileId, labelId, backgroundReloadToken]);

  const backgroundUrl = useMemo(() => {
    if (clearBg) return null;
    if (localBgUrl) return localBgUrl;
    return remoteBgUrl;
  }, [clearBg, localBgUrl, remoteBgUrl]);

  const selected: LabelElement | null =
    selectedIndex != null ? definition.elements[selectedIndex] ?? null : null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      let saved = (
        await updateCustomLabel(labelId, {
          name,
          width_in: widthIn,
          height_in: heightIn,
          definition,
        })
      ).data;
      if (bgUpload) {
        saved = (await uploadLabelBackground(labelId, bgUpload)).data;
      } else if (clearBg && data?.background_file) {
        saved = (await clearLabelBackground(labelId)).data;
      }
      return saved;
    },
    onSuccess: async (saved) => {
      setSaveError(null);
      // Update React Query first so backgroundFileId matches the new S3 row before
      // we drop the local preview (otherwise the load effect re-fetches the old id).
      queryClient.setQueryData(['custom-label', labelId], saved);
      queryClient.invalidateQueries({ queryKey: ['custom-labels'] });
      const savedDefinition = normalizeDefinition(saved.definition);
      setDefinition(savedDefinition);
      setBaselineKey(
        designerSnapshotKey({
          name: saved.name,
          widthIn: saved.width_in ?? widthIn,
          heightIn: saved.height_in ?? heightIn,
          definition: savedDefinition,
          backgroundFileId: saved.background_file?.id ?? null,
        }),
      );

      let nextRemoteUrl: string | null = null;
      if (saved.background_file) {
        try {
          const bytes = await fetchLabelMediaBytes(
            labelId,
            'background',
            saved.background_file.id,
          );
          nextRemoteUrl = URL.createObjectURL(
            new Blob([bytes], { type: bgUpload?.type || 'image/png' }),
          );
          setBackgroundError(null);
        } catch {
          setBackgroundError('Saved, but the background preview could not reload. Try again.');
        }
      }
      setRemoteBgUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextRemoteUrl;
      });
      setBgUpload(null);
      setClearBg(false);
      setLocalBgUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      enqueueSnackbar('Label saved', { variant: 'success' });
    },
    onError: (exc: unknown) => {
      setSaveError(formatApiError(exc, 'Save failed.'));
    },
  });

  const onMove = useCallback((index: number, x_pct: number, y_pct: number) => {
    setDefinition((d) => patchElement(d, index, { x_pct, y_pct }));
  }, []);

  const onResize = useCallback((index: number, w_pct: number, h_pct: number) => {
    setDefinition((d) => patchElement(d, index, { w_pct, h_pct }));
  }, []);

  if (isLoading) return <LoadingScreen />;
  if (error || !data) {
    return (
      <Box p={3}>
        <Alert severity="error">Label not found.</Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate('/admin/label-studio')}>
          Back to library
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', minHeight: 0 }}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap', gap: 1 }}
      >
        <IconButton
          onClick={() => requestNavigation(() => navigate('/admin/label-studio'))}
          size="small"
        >
          <ArrowBackIcon />
        </IconButton>
        <TextField
          size="small"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          sx={{ minWidth: 180 }}
        />
        <TextField
          size="small"
          label="W (in)"
          type="number"
          value={widthIn}
          onChange={(e) => setWidthIn(e.target.value)}
          sx={{ width: 90 }}
          inputProps={{ min: 0.5, step: 0.25 }}
        />
        <TextField
          size="small"
          label="H (in)"
          type="number"
          value={heightIn}
          onChange={(e) => setHeightIn(e.target.value)}
          sx={{ width: 90 }}
          inputProps={{ min: 0.5, step: 0.25 }}
        />
        <Chip
          size="small"
          label={isDirty ? 'Unsaved changes' : 'Saved'}
          color={isDirty ? 'warning' : 'success'}
          variant={isDirty ? 'filled' : 'outlined'}
        />
        <Box flex={1} />
        <Button startIcon={<AutoAwesomeIcon />} onClick={() => setAiOpen(true)}>
          AI Create for me
        </Button>
        <Button startIcon={<PrintIcon />} onClick={() => setPrintOpen(true)}>
          Print
        </Button>
        <Button
          color="inherit"
          disabled={!isDirty || saveMutation.isPending}
          onClick={() => setRevertConfirmOpen(true)}
        >
          Revert
        </Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          disabled={saveMutation.isPending || !isDirty || !isValid}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </Stack>

      {saveError && (
        <Alert severity="error" sx={{ mx: 2, mt: 1 }} onClose={() => setSaveError(null)}>
          {saveError}
        </Alert>
      )}
      {backgroundError && (
        <Alert
          severity="warning"
          sx={{ mx: 2, mt: 1 }}
          onClose={() => setBackgroundError(null)}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setBackgroundReloadToken((value) => value + 1)}
            >
              Retry
            </Button>
          }
        >
          {backgroundError}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left rail */}
        <Box
          sx={{
            width: 260,
            borderRight: 1,
            borderColor: 'divider',
            p: 1.5,
            overflow: 'auto',
          }}
        >
          <Typography variant="subtitle2" gutterBottom>
            Variables
          </Typography>
          <Stack spacing={1.5}>
            {definition.variables.map((v, i) => (
              <Box
                key={v.key}
                sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
              >
                <Stack direction="row" spacing={0.5} alignItems="flex-start">
                  <Stack spacing={1} sx={{ flex: 1 }}>
                    <TextField
                      size="small"
                      label="Name"
                      value={v.name}
                      onChange={(e) =>
                        setDefinition((d) => ({
                          ...d,
                          variables: d.variables.map((x, idx) =>
                            idx === i ? { ...x, name: e.target.value } : x,
                          ),
                        }))
                      }
                      fullWidth
                    />
                    {v.kind === 'text' ? (
                      <TextField
                        size="small"
                        label="Default"
                        value={v.default}
                        onChange={(e) =>
                          setDefinition((d) => ({
                            ...d,
                            variables: d.variables.map((x, idx) =>
                              idx === i && x.kind === 'text'
                                ? { ...x, default: e.target.value }
                                : x,
                            ),
                          }))
                        }
                        fullWidth
                        helperText="Empty → preview shows Name"
                      />
                    ) : (
                      <>
                        <Stack direction="row" spacing={1}>
                          <TextField
                            size="small"
                            label="Start"
                            value={v.default_start}
                            onChange={(e) =>
                              setDefinition((d) => ({
                                ...d,
                                variables: d.variables.map((x, idx) =>
                                  idx === i && x.kind === 'increment'
                                    ? { ...x, default_start: e.target.value }
                                    : x,
                                ),
                              }))
                            }
                            sx={{ flex: 1 }}
                          />
                          <TextField
                            size="small"
                            label="Step"
                            value={v.default_step}
                            onChange={(e) =>
                              setDefinition((d) => ({
                                ...d,
                                variables: d.variables.map((x, idx) =>
                                  idx === i && x.kind === 'increment'
                                    ? { ...x, default_step: e.target.value }
                                    : x,
                                ),
                              }))
                            }
                            sx={{ flex: 1 }}
                          />
                        </Stack>
                        <TextField
                          select
                          size="small"
                          label="Format"
                          value={v.format}
                          onChange={(e) =>
                            setDefinition((d) => ({
                              ...d,
                              variables: d.variables.map((x, idx) =>
                                idx === i && x.kind === 'increment'
                                  ? {
                                      ...x,
                                      format: e.target.value as LabelIncrementFormat,
                                    }
                                  : x,
                              ),
                            }))
                          }
                          fullWidth
                        >
                          {INCREMENT_FORMATS.map((f) => (
                            <MenuItem key={f.value} value={f.value}>
                              {f.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {v.kind === 'increment' ? 'Advances once per printed copy' : 'Entered at print time'}
                    </Typography>
                  </Stack>
                  <IconButton
                    size="small"
                    onClick={() => setDeleteVariableIndex(i)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Box>
            ))}
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() =>
                  setDefinition((d) => ({
                    ...d,
                    variables: [...d.variables, newTextVariable(d.variables)],
                  }))
                }
              >
                Text
              </Button>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() =>
                  setDefinition((d) => ({
                    ...d,
                    variables: [...d.variables, newIncrementVariable(d.variables)],
                  }))
                }
              >
                Increment
              </Button>
            </Stack>
          </Stack>

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>
            Add element
          </Typography>
          <Stack spacing={1}>
            <Button
              size="small"
              variant="outlined"
              onClick={() =>
                setDefinition((d) => ({
                  ...d,
                  elements: [...d.elements, defaultTextElement(d.elements.length)],
                }))
              }
            >
              Text
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() =>
                setDefinition((d) => ({
                  ...d,
                  elements: [...d.elements, defaultQrElement()],
                }))
              }
            >
              QR code
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() =>
                setDefinition((d) => ({
                  ...d,
                  elements: [...d.elements, defaultBarcodeElement()],
                }))
              }
            >
              Barcode (Code128)
            </Button>
          </Stack>

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>
            Elements
          </Typography>
          {definition.elements.length === 0 ? (
            <Alert severity="info" sx={{ mb: 1 }}>
              Add an element, choose its Source, then drag it on the label.
            </Alert>
          ) : (
            <Stack spacing={0.5}>
              {definition.elements.map((_, index) => (
                <Button
                  key={index}
                  size="small"
                  variant={selectedIndex === index ? 'contained' : 'text'}
                  onClick={() => setSelectedIndex(index)}
                  sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                >
                  {elementDisplayName(definition, index)}
                </Button>
              ))}
            </Stack>
          )}

          <Divider sx={{ my: 2 }} />
          <Button component="label" size="small" startIcon={<UploadFileIcon />} variant="outlined" fullWidth>
            Background
            <input
              hidden
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBgUpload(f);
                setClearBg(false);
                setLocalBgUrl((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return URL.createObjectURL(f);
                });
                e.target.value = '';
              }}
            />
          </Button>
          {(backgroundUrl || data.background_file) && !clearBg && (
            <Button
              size="small"
              color="warning"
              fullWidth
              sx={{ mt: 1 }}
              onClick={() => {
                setClearBg(true);
                setBgUpload(null);
                setLocalBgUrl((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return null;
                });
              }}
            >
              Remove background
            </Button>
          )}
        </Box>

        {/* Center canvas */}
        <Box sx={{ flex: 1, p: 2, overflow: 'auto', bgcolor: 'grey.100' }}>
          <LabelCanvas
            widthIn={Number(widthIn) || 1}
            heightIn={Number(heightIn) || 1}
            definition={definition}
            backgroundUrl={backgroundUrl}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onMove={onMove}
            onResize={onResize}
            elementNames={definition.elements.map((_, index) =>
              elementDisplayName(definition, index),
            )}
          />
        </Box>

        {/* Right rail */}
        <Box
          sx={{
            width: 280,
            borderLeft: 1,
            borderColor: 'divider',
            p: 1.5,
            overflow: 'auto',
          }}
        >
          <Typography variant="subtitle2" gutterBottom>
            Properties
          </Typography>
          {!selected || selectedIndex == null ? (
            <Typography variant="body2" color="text.secondary">
              Select an element on the canvas.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              <Typography variant="caption" color="text.secondary">
                {selected.type.toUpperCase()} #{selectedIndex + 1}
              </Typography>
              <TextField
                select
                size="small"
                label="Source"
                value={selected.variable ?? '__literal__'}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '__literal__') {
                    setDefinition((d) =>
                      patchElement(d, selectedIndex, {
                        variable: undefined,
                        literal: selected.literal ?? '',
                      }),
                    );
                  } else {
                    setDefinition((d) =>
                      patchElement(d, selectedIndex, { variable: val, literal: undefined }),
                    );
                  }
                }}
              >
                <MenuItem value="__literal__">Fixed text</MenuItem>
                {definition.variables.map((v) => (
                  <MenuItem key={v.key} value={v.key}>
                    {v.name}
                    {v.kind === 'increment' ? ' (increment)' : ''}
                  </MenuItem>
                ))}
              </TextField>
              {selected.variable == null ? (
                <TextField
                  size="small"
                  label="Literal"
                  value={selected.literal ?? ''}
                  onChange={(e) =>
                    setDefinition((d) =>
                      patchElement(d, selectedIndex, { literal: e.target.value }),
                    )
                  }
                />
              ) : (
                (() => {
                  const bound = definition.variables.find((x) => x.key === selected.variable);
                  return bound ? (
                    <Typography variant="caption" color="text.secondary">
                      {variableDefaultHint(bound)}
                    </Typography>
                  ) : null;
                })()
              )}
              {selected.type === 'text' && (
                <>
                  <TextField
                    select
                    size="small"
                    label="Font"
                    value={selected.font}
                    onChange={(e) =>
                      setDefinition((d) =>
                        patchElement(d, selectedIndex, {
                          font: e.target.value as LabelTextElement['font'],
                        }),
                      )
                    }
                  >
                    {FONTS.map((f) => (
                      <MenuItem key={f} value={f}>
                        {f}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    size="small"
                    type="number"
                    label="Size (pt)"
                    value={selected.size_pt}
                    onChange={(e) =>
                      setDefinition((d) =>
                        patchElement(d, selectedIndex, { size_pt: Number(e.target.value) }),
                      )
                    }
                    inputProps={{ min: 4, max: 200 }}
                  />
                  <TextField
                    select
                    size="small"
                    label="Align"
                    value={selected.align}
                    onChange={(e) =>
                      setDefinition((d) =>
                        patchElement(d, selectedIndex, {
                          align: e.target.value as LabelTextElement['align'],
                        }),
                      )
                    }
                  >
                    {ALIGNS.map((a) => (
                      <MenuItem key={a} value={a}>
                        {a}
                      </MenuItem>
                    ))}
                  </TextField>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={Boolean(selected.bold)}
                        onChange={(e) =>
                          setDefinition((d) =>
                            patchElement(d, selectedIndex, { bold: e.target.checked }),
                          )
                        }
                      />
                    }
                    label="Bold"
                  />
                  <Typography variant="caption" color="text.secondary">
                    Keep sample values short enough to fit the label; long text does not wrap yet.
                  </Typography>
                </>
              )}
              {selected.type === 'qr' && (
                <TextField
                  select
                  size="small"
                  label="Error correction"
                  value={selected.ecc}
                  onChange={(e) =>
                    setDefinition((d) =>
                      patchElement(d, selectedIndex, {
                        ecc: e.target.value as 'L' | 'M' | 'Q' | 'H',
                      }),
                    )
                  }
                >
                  {ECCS.map((e) => (
                    <MenuItem key={e} value={e}>
                      {e}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {selected.type === 'barcode' && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selected.show_text !== false}
                      onChange={(e) =>
                        setDefinition((d) =>
                          patchElement(d, selectedIndex, { show_text: e.target.checked }),
                        )
                      }
                    />
                  }
                  label="Show text under bars"
                />
              )}
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  startIcon={<ArrowDownwardIcon />}
                  disabled={selectedIndex === 0}
                  onClick={() => {
                    const moved = moveElement(definition, selectedIndex, -1);
                    setDefinition(moved.definition);
                    setSelectedIndex(moved.selectedIndex);
                  }}
                >
                  Back
                </Button>
                <Button
                  size="small"
                  startIcon={<ArrowUpwardIcon />}
                  disabled={selectedIndex === definition.elements.length - 1}
                  onClick={() => {
                    const moved = moveElement(definition, selectedIndex, 1);
                    setDefinition(moved.definition);
                    setSelectedIndex(moved.selectedIndex);
                  }}
                >
                  Front
                </Button>
              </Stack>
              <Button
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => {
                  setDefinition((d) => ({
                    ...d,
                    elements: d.elements.filter((_, i) => i !== selectedIndex),
                  }));
                  setSelectedIndex(null);
                }}
              >
                Delete element
              </Button>
            </Stack>
          )}
        </Box>
      </Box>

      <LabelPrintDialog
        label={
          data
            ? {
                ...data,
                name,
                width_in: widthIn,
                height_in: heightIn,
                definition,
              }
            : null
        }
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        isDraft={isDirty}
        backgroundOverride={
          bgUpload
            ? { mode: 'file', file: bgUpload }
            : clearBg
              ? { mode: 'clear' }
              : undefined
        }
      />

      <AiCreateDialog
        open={aiOpen}
        labelId={labelId}
        onClose={() => setAiOpen(false)}
        onApplyDefinition={(def) => {
          setDefinition(normalizeDefinition(def));
          setSelectedIndex(null);
        }}
        onBackgroundApplied={(file) => {
          setBgUpload(file);
          setClearBg(false);
          setLocalBgUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
          });
        }}
        hasExistingLayout={definition.elements.length > 0 || definition.variables.length > 0}
        hasExistingBackground={Boolean(backgroundUrl || data.background_file)}
        labelName={name}
      />
      <ConfirmDialog
        open={leaveConfirmOpen}
        title="Discard unsaved changes?"
        message="Your label has changes that have not been saved."
        confirmLabel="Discard changes"
        confirmColor="error"
        onCancel={() => {
          pendingNavigation.current = null;
          setLeaveConfirmOpen(false);
        }}
        onConfirm={() => {
          const action = pendingNavigation.current;
          pendingNavigation.current = null;
          setLeaveConfirmOpen(false);
          action?.();
        }}
      />
      <ConfirmDialog
        open={revertConfirmOpen}
        title="Revert unsaved changes?"
        message="Restore the last saved name, dimensions, layout, and background?"
        confirmLabel="Revert"
        confirmColor="error"
        onCancel={() => setRevertConfirmOpen(false)}
        onConfirm={() => {
          const savedDefinition = normalizeDefinition(data.definition);
          setName(data.name);
          setWidthIn(data.width_in ?? '3');
          setHeightIn(data.height_in ?? '2');
          setDefinition(savedDefinition);
          setBgUpload(null);
          setClearBg(false);
          setLocalBgUrl((previous) => {
            if (previous) URL.revokeObjectURL(previous);
            return null;
          });
          setBaselineKey(
            designerSnapshotKey({
              name: data.name,
              widthIn: data.width_in ?? '3',
              heightIn: data.height_in ?? '2',
              definition: savedDefinition,
              backgroundFileId: data.background_file?.id ?? null,
            }),
          );
          setSelectedIndex(null);
          setRevertConfirmOpen(false);
        }}
      />
      <ConfirmDialog
        open={deleteVariableIndex != null}
        title="Delete variable?"
        message={
          deleteVariableIndex == null
            ? ''
            : (() => {
                const variable = definition.variables[deleteVariableIndex];
                const bound = definition.elements.filter(
                  (element) => element.variable === variable?.key,
                ).length;
                return bound > 0
                  ? `Delete “${variable?.name}” and ${bound} element${bound === 1 ? '' : 's'} using it?`
                  : `Delete “${variable?.name}”?`;
              })()
        }
        confirmLabel="Delete"
        confirmColor="error"
        onCancel={() => setDeleteVariableIndex(null)}
        onConfirm={() => {
          const index = deleteVariableIndex;
          if (index == null) return;
          setDefinition((draft) => {
            const variable = draft.variables[index];
            return {
              ...draft,
              variables: draft.variables.filter((_, i) => i !== index),
              elements: draft.elements.filter((element) => element.variable !== variable?.key),
            };
          });
          setDeleteVariableIndex(null);
          setSelectedIndex(null);
        }}
      />
    </Box>
  );
}
