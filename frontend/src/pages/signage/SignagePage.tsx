import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddLocationAltIcon from '@mui/icons-material/AddLocationAlt';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { getSignPdf } from '../../api/signage.api';
import { canAccess } from '../../auth/access';
import { useAuth } from '../../contexts/AuthContext';
import { useCreateMapPin, useDeleteMapPin, useStoreMap, useUpdateMapPin } from '../../hooks/useFloorplans';
import { useFloorPlanAssets } from '../../hooks/useFloorplanAssets';
import { useFloorPlanElementKinds } from '../../hooks/useFloorplanElementKinds';
import {
  useCreateSign,
  useDeleteSign,
  signsQueryKey,
  useRemoveSignPdf,
  useSigns,
  useUpdateSign,
  useUploadSignPdf,
} from '../../hooks/useSignage';
import { migratePlanDocument } from '../../features/floorplan/migrations';
import { buildPaletteIndex, elementKindToPaletteEntry, STATIC_PALETTE } from '../../features/floorplan/palette';
import StoreMapView from '../../features/floorplan/StoreMapView';
import { IconAdd as AddIcon, IconDelete as DeleteIcon, IconDownload as DownloadIcon, IconEdit as EditIcon, IconPrint as PrintIcon, IconUpload as UploadIcon } from '../../icons/ecoIcons';
import type { MapPin, PlanDocument } from '../../types/floorplan.types';
import { SIGN_REF_TYPE, SIGN_STATUSES, type Sign, type SignStatus } from '../../types/signage.types';

const STATUS_COLOR: Record<SignStatus, 'default' | 'warning' | 'success'> = {
  to_make: 'default',
  printed: 'warning',
  up: 'success',
};

type SignDraft = { id: number | null; name: string; status: SignStatus; copies_up: number; note: string; file: File | null };

const emptyDraft = (): SignDraft => ({ id: null, name: '', status: 'to_make', copies_up: 0, note: '', file: null });

function safeFilename(name: string) {
  return `${name.replace(/[^\w\- ]+/g, '').trim() || 'sign'}.pdf`;
}

/**
 * Facilities → Signage (#106): every store sign with its print PDF, where it is in the making (to make, printed,
 * up), how many copies are up, and where each one hangs (pins on the store map's Signage layer). Tapping a sign
 * shows its pins; tapping a pin shows its sign. Staff look and print; managers change it.
 */
export default function SignagePage() {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const canEdit = canAccess(user, ['signage:manage', 'admin:manage']);
  const [params, setParams] = useSearchParams();

  const signsQuery = useSigns();
  const signs = useMemo(() => signsQuery.data ?? [], [signsQuery.data]);
  const [filter, setFilter] = useState<SignStatus | 'all'>('all');
  const shown = filter === 'all' ? signs : signs.filter((s) => s.status === filter);
  const countOf = (status: SignStatus) => signs.filter((s) => s.status === status).length;

  const selectedId = Number(params.get('sign')) || null;
  const selected = signs.find((s) => s.id === selectedId) ?? null;
  const select = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id == null) next.delete('sign');
    else next.set('sign', String(id));
    setParams(next, { replace: true });
  };
  const rowRefs = useRef(new Map<number, HTMLDivElement | null>());
  useEffect(() => {
    if (selectedId != null) rowRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  // ── The store map, Signage layer only ──────────────────────────────────────
  const mapQuery = useStoreMap();
  const plan = mapQuery.data?.plan ?? null;
  const signLayer = mapQuery.data?.layers.find((l) => l.ref_type === SIGN_REF_TYPE) ?? null;
  const signPins = useMemo(
    () => (mapQuery.data?.pins ?? []).filter((p) => signLayer && p.layer === signLayer.id),
    [mapQuery.data, signLayer],
  );
  const assetsQuery = useFloorPlanAssets(plan ? { location: plan.location } : undefined);
  const assetMap = useMemo(() => new Map((assetsQuery.data ?? []).map((a) => [a.id, a.data])), [assetsQuery.data]);
  const kindsQuery = useFloorPlanElementKinds();
  const kindIndex = useMemo(
    () => buildPaletteIndex(kindsQuery.data ? kindsQuery.data.map(elementKindToPaletteEntry) : STATIC_PALETTE),
    [kindsQuery.data],
  );
  const doc = useMemo<PlanDocument | null>(() => {
    if (!plan) return null;
    try {
      return migratePlanDocument(plan.data);
    } catch {
      return null;
    }
  }, [plan]);
  const selectedPins = useMemo(
    () => new Set(signPins.filter((p) => selected && p.ref_id === selected.id).map((p) => p.id)),
    [signPins, selected],
  );
  const [placing, setPlacing] = useState(false);
  const [tappedPin, setTappedPin] = useState<MapPin | null>(null);
  useEffect(() => {
    setPlacing(false);
    setTappedPin(null);
  }, [selectedId]);

  // ── Writes ─────────────────────────────────────────────────────────────────
  const createSign = useCreateSign();
  const updateSign = useUpdateSign();
  const deleteSign = useDeleteSign();
  const uploadPdf = useUploadSignPdf();
  const removePdf = useRemoveSignPdf();
  const queryClient = useQueryClient();
  // A spot added or removed changes the sign's count on the list.
  const refreshSigns = () => queryClient.invalidateQueries({ queryKey: signsQueryKey });
  const createPin = useCreateMapPin();
  const updatePin = useUpdateMapPin();
  const deletePin = useDeleteMapPin();
  const [draft, setDraft] = useState<SignDraft | null>(null);
  const [uploadFor, setUploadFor] = useState<Sign | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busyPdf, setBusyPdf] = useState<number | null>(null);

  const failed = (fallback: string) => (err: unknown) => {
    const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
    const first = data ? Object.values(data)[0] : null;
    enqueueSnackbar(Array.isArray(first) ? String(first[0]) : typeof first === 'string' ? first : fallback, { variant: 'error' });
  };

  const saveDraft = async () => {
    if (!draft || !draft.name.trim()) return;
    const payload = { name: draft.name.trim(), status: draft.status, copies_up: draft.copies_up, note: draft.note.trim() };
    try {
      const sign = draft.id == null
        ? await createSign.mutateAsync(payload)
        : await updateSign.mutateAsync({ id: draft.id, ...payload });
      if (draft.file) await uploadPdf.mutateAsync({ id: sign.id, file: draft.file });
      setDraft(null);
      select(sign.id);
    } catch (err) {
      failed('Could not save the sign.')(err);
    }
  };

  const setStatus = (sign: Sign, status: SignStatus) =>
    updateSign.mutate({ id: sign.id, status }, { onError: failed('Could not change the status.') });

  const removeSign = (sign: Sign) => {
    if (!window.confirm(`Remove "${sign.name}" from the list? Its ${sign.pins} spot(s) leave the store map.`)) return;
    deleteSign.mutate(sign.id, {
      onSuccess: () => {
        if (selectedId === sign.id) select(null);
      },
      onError: failed('Could not remove the sign.'),
    });
  };

  const withPdf = async (sign: Sign, use: (url: string) => void) => {
    setBusyPdf(sign.id);
    try {
      const blob = await getSignPdf(sign.id);
      use(URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })));
    } catch {
      enqueueSnackbar('Could not open the PDF.', { variant: 'error' });
    } finally {
      setBusyPdf(null);
    }
  };

  const openPdf = (sign: Sign) =>
    withPdf(sign, (url) => {
      window.open(url, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });

  const downloadPdf = (sign: Sign) =>
    withPdf(sign, (url) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = sign.pdf_name || safeFilename(sign.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

  // Print from a hidden frame; the browser's print window shows the PDF at actual size.
  const printPdf = (sign: Sign) =>
    withPdf(sign, (url) => {
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      frame.src = url;
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } catch {
          window.open(url, '_blank', 'noopener');
        }
        window.setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 60_000);
      };
      document.body.appendChild(frame);
    });

  const onPickFile = (file: File | undefined) => {
    const sign = uploadFor;
    setUploadFor(null);
    if (!file || !sign) return;
    uploadPdf.mutate(
      { id: sign.id, file },
      { onSuccess: () => enqueueSnackbar('PDF saved.', { variant: 'success' }), onError: failed('Could not save the PDF.') },
    );
  };

  const addSpot = (x: number, y: number) => {
    if (!selected || !plan || !signLayer) return;
    setPlacing(false);
    createPin.mutate(
      { plan: plan.id, layer: signLayer.id, x, y, name: selected.name, ref_id: selected.id },
      { onSuccess: refreshSigns, onError: failed('Could not add the spot.') },
    );
  };

  const removeSpot = (pin: MapPin) =>
    deletePin.mutate(pin.id, {
      onSuccess: () => {
        setTappedPin(null);
        void refreshSigns();
      },
      onError: failed('Could not remove the spot.'),
    });

  const signById = new Map(signs.map((s) => [s.id, s]));

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Signage</Typography>
          <Typography variant="body2" color="text.secondary">
            Every store sign, its file to print, and where it hangs.
          </Typography>
        </Box>
        {canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDraft(emptyDraft())}>
            New sign
          </Button>
        )}
      </Stack>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        <Chip label={`All (${signs.length})`} onClick={() => setFilter('all')} color={filter === 'all' ? 'primary' : 'default'} variant={filter === 'all' ? 'filled' : 'outlined'} />
        {SIGN_STATUSES.map((s) => (
          <Chip
            key={s.value}
            label={`${s.label} (${countOf(s.value)})`}
            onClick={() => setFilter(s.value)}
            color={filter === s.value ? 'primary' : 'default'}
            variant={filter === s.value ? 'filled' : 'outlined'}
          />
        ))}
      </Stack>

      {signsQuery.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}
      {signsQuery.isError && <Alert severity="error">Could not load the signs.</Alert>}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(320px, 420px) minmax(0, 1fr)' }, alignItems: 'start' }}>
        <Stack spacing={1} sx={{ maxHeight: { md: '75vh' }, overflow: { md: 'auto' }, pr: { md: 0.5 } }}>
          {signsQuery.data && shown.length === 0 && (
            <Alert severity="info">
              {signs.length === 0 ? `No signs yet.${canEdit ? ' Add the first with New sign.' : ''}` : 'No signs with that status.'}
            </Alert>
          )}
          {shown.map((sign) => {
            const isSelected = sign.id === selectedId;
            return (
              <Paper
                key={sign.id}
                ref={(el: HTMLDivElement | null) => {
                  rowRefs.current.set(sign.id, el);
                }}
                variant="outlined"
                onClick={() => select(isSelected ? null : sign.id)}
                sx={{ p: 1.5, cursor: 'pointer', borderColor: isSelected ? 'primary.main' : 'divider', borderWidth: isSelected ? 2 : 1 }}
              >
                <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between">
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>{sign.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {sign.copies_up} up · {sign.pins === 0 ? 'not on the map' : `${sign.pins} ${sign.pins === 1 ? 'spot' : 'spots'} on the map`}
                    </Typography>
                  </Box>
                  {canEdit ? (
                    <TextField
                      select
                      size="small"
                      value={sign.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setStatus(sign, e.target.value as SignStatus)}
                      sx={{ minWidth: 112 }}
                      inputProps={{ 'aria-label': `Status of ${sign.name}` }}
                    >
                      {SIGN_STATUSES.map((s) => (
                        <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <Chip size="small" label={sign.status_label} color={STATUS_COLOR[sign.status]} />
                  )}
                </Stack>
                {sign.note && (
                  <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{sign.note}</Typography>
                )}
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }} onClick={(e) => e.stopPropagation()}>
                  {sign.pdf_name ? (
                    <>
                      <Button size="small" startIcon={<PrintIcon />} disabled={busyPdf === sign.id} onClick={() => void printPdf(sign)}>
                        Print
                      </Button>
                      <Button size="small" startIcon={<DownloadIcon />} disabled={busyPdf === sign.id} onClick={() => void downloadPdf(sign)}>
                        Download
                      </Button>
                      <Tooltip title={`Open ${sign.pdf_name}`}>
                        <IconButton size="small" aria-label={`Open the PDF of ${sign.name}`} disabled={busyPdf === sign.id} onClick={() => void openPdf(sign)}>
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  ) : (
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>No PDF yet</Typography>
                  )}
                  <Box sx={{ flex: 1 }} />
                  {canEdit && (
                    <>
                      <Tooltip title={sign.pdf_name ? 'Replace the PDF' : 'Add the PDF'}>
                        <IconButton
                          size="small"
                          aria-label={`${sign.pdf_name ? 'Replace' : 'Add'} the PDF of ${sign.name}`}
                          onClick={() => {
                            setUploadFor(sign);
                            fileRef.current?.click();
                          }}
                        >
                          <UploadIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton
                          size="small"
                          aria-label={`Edit ${sign.name}`}
                          onClick={() => setDraft({ id: sign.id, name: sign.name, status: sign.status, copies_up: sign.copies_up, note: sign.note, file: null })}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton size="small" color="error" aria-label={`Remove ${sign.name}`} onClick={() => removeSign(sign)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Stack>

        <Box>
          {mapQuery.data && !plan && (
            <Alert severity="info">
              The store map is not set up yet: no floor plan is marked Current (Studios → Floorplans, the star).
            </Alert>
          )}
          {plan && doc && signLayer && (
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap">
                <Typography variant="body2" color="text.secondary">
                  {selected ? (
                    <>Where <b>{selected.name}</b> hangs{selectedPins.size === 0 ? ': not on the map yet' : ''}</>
                  ) : (
                    'Every sign on the store map. Tap a sign or a pin.'
                  )}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  {canEdit && selected && (
                    placing ? (
                      <Button size="small" onClick={() => setPlacing(false)}>Cancel</Button>
                    ) : (
                      <Button size="small" variant="outlined" startIcon={<AddLocationAltIcon />} onClick={() => setPlacing(true)}>
                        Add a spot
                      </Button>
                    )
                  )}
                  <Button size="small" component={RouterLink} to="/facilities/store-map">Store map</Button>
                </Stack>
              </Stack>
              <StoreMapView
                doc={doc}
                layers={[signLayer]}
                pins={signPins}
                visibleLayerIds={new Set([signLayer.id])}
                assets={assetMap}
                kindIndex={kindIndex}
                highlightedPinIds={selectedPins}
                dimOthers={Boolean(selected)}
                placing={placing}
                onMapClick={(pt) => addSpot(pt.x, pt.y)}
                onPinClick={(pin) => {
                  setTappedPin(pin);
                  if (pin.ref_id != null && pin.ref_id !== selectedId) {
                    if (filter !== 'all' && signById.get(pin.ref_id)?.status !== filter) setFilter('all');
                    select(pin.ref_id);
                  }
                }}
                onPinMove={canEdit ? (pin, pt) => updatePin.mutate({ id: pin.id, x: pt.x, y: pt.y }, { onError: failed('Could not move the spot.') }) : undefined}
                maxHeight="65vh"
              />
              {canEdit && (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ minHeight: 32 }}>
                  <Typography variant="caption" color="text.secondary">Drag a pin to move it.</Typography>
                  {tappedPin && signPins.some((p) => p.id === tappedPin.id) && (
                    <Button size="small" color="error" onClick={() => removeSpot(tappedPin)}>
                      Remove this spot of {tappedPin.name}
                    </Button>
                  )}
                </Stack>
              )}
            </Stack>
          )}
        </Box>
      </Box>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(e) => {
          onPickFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <Dialog open={Boolean(draft)} onClose={() => setDraft(null)} fullWidth maxWidth="xs">
        <DialogTitle>{draft?.id == null ? 'New sign' : 'Edit sign'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={draft?.name ?? ''}
              onChange={(e) => draft && setDraft({ ...draft, name: e.target.value })}
              autoFocus
              fullWidth
              inputProps={{ maxLength: 120 }}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                select
                label="Status"
                value={draft?.status ?? 'to_make'}
                onChange={(e) => draft && setDraft({ ...draft, status: e.target.value as SignStatus })}
                sx={{ flex: 1 }}
              >
                {SIGN_STATUSES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Copies up"
                type="number"
                value={draft?.copies_up ?? 0}
                onChange={(e) => draft && setDraft({ ...draft, copies_up: Math.max(0, Math.min(500, Number(e.target.value) || 0)) })}
                inputProps={{ min: 0, max: 500 }}
                sx={{ width: 120 }}
              />
            </Stack>
            <TextField
              label="Note"
              value={draft?.note ?? ''}
              onChange={(e) => draft && setDraft({ ...draft, note: e.target.value })}
              fullWidth
              multiline
              minRows={2}
              placeholder="Size, paper, who asked for it"
            />
            <Button component="label" variant="outlined" startIcon={<UploadIcon />}>
              {draft?.file ? draft.file.name : 'PDF to print (optional)'}
              <input
                hidden
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => draft && setDraft({ ...draft, file: e.target.files?.[0] ?? null })}
              />
            </Button>
            {draft?.id != null && signById.get(draft.id)?.pdf_name && !draft.file && (
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }} noWrap>
                  Now: {signById.get(draft.id)?.pdf_name}
                </Typography>
                <Button
                  size="small"
                  color="error"
                  onClick={() => draft.id != null && removePdf.mutate(draft.id, { onError: failed('Could not take the PDF off.') })}
                >
                  Take the PDF off
                </Button>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void saveDraft()}
            disabled={!draft?.name.trim() || createSign.isPending || updateSign.isPending || uploadPdf.isPending}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
