import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddLocationAltIcon from '@mui/icons-material/AddLocationAlt';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
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
  signsQueryKey,
  useAddSignVersion,
  useApproveSign,
  useCreateSign,
  useDeleteSign,
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
import { SIGN_REF_TYPE, SIGN_STATUSES, type Sign, type SignStage, type SignStatus } from '../../types/signage.types';
import DraftDialog, { errorText } from './DraftDialog';
import { AddVersionDialog, emptyForm, formOf, SignEditDialog, SignThumb, VersionViewer, type SignForm } from './SignParts';

const STATUS_COLOR: Record<SignStatus, 'default' | 'warning' | 'success'> = {
  to_make: 'default',
  printed: 'warning',
  up: 'success',
};

function safeFilename(name: string) {
  return `${name.replace(/[^\w\- ]+/g, '').trim() || 'sign'}.pdf`;
}

/** One compact row: a small preview, the name, one line under it, and whatever belongs on the right. */
function SignRow({
  sign,
  sub,
  right,
  selected,
  onOpen,
  rowRef,
}: {
  sign: Sign;
  sub: string;
  right: React.ReactNode;
  selected?: boolean;
  onOpen: () => void;
  rowRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <Box
      ref={rowRef}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Open ${sign.name}`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 1,
        py: 0.75,
        minHeight: 56,
        cursor: 'pointer',
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: selected ? 'action.selected' : 'transparent',
        '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <SignThumb signId={sign.id} versionId={sign.preview_version} size={36} height={46} alt={sign.name} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="body2"
          sx={{ fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {sign.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">{sub}</Typography>
      </Box>
      <Box sx={{ flexShrink: 0, textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>{right}</Box>
    </Box>
  );
}

/** The right side of a draft's row: the % who say it is needed and the top runner, once you have voted. */
function DraftResult({ sign }: { sign: Sign }) {
  const r = sign.votes?.results;
  if (!sign.votes?.has_voted || !r) {
    return <Chip size="small" color="primary" variant="outlined" label="Vote on the best" />;
  }
  return (
    <Box sx={{ maxWidth: { xs: 112, sm: 220 } }}>
      <Typography variant="caption" component="div" sx={{ fontWeight: 600 }}>
        {r.needed_pct != null ? `${r.needed_pct}% needed` : 'No yes/no yet'}
      </Typography>
      {r.top_version_label && (
        <Typography variant="caption" color="text.secondary" component="div" noWrap>Top: {r.top_version_label}</Typography>
      )}
    </Box>
  );
}

/**
 * Facilities → Signage (#106, #122). **Drafts**: staff vote whether each sign is needed and rank its versions; a
 * manager approves the winner into production once 3 people have voted (#128); themes are the owner's. **Production**: the signs to make, printed and up, with their preview,
 * versions, print file, and where each hangs on the store map.
 */
export default function SignagePage() {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const canEdit = canAccess(user, ['signage:manage', 'admin:manage']);
  const theme = useTheme();
  // Below lg the list and an open sign take turns (Back returns to the list); from lg they sit side by side.
  const narrow = useMediaQuery(theme.breakpoints.down('lg'));
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [params, setParams] = useSearchParams();

  const signsQuery = useSigns();
  const signs = useMemo(() => signsQuery.data ?? [], [signsQuery.data]);
  const drafts = useMemo(() => signs.filter((s) => s.stage === 'draft'), [signs]);
  const production = useMemo(() => signs.filter((s) => s.stage !== 'draft'), [signs]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value == null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  // A pin on the store map opens ?sign=<id>, which is a production sign.
  const tab: SignStage = params.get('tab') === 'production' || params.get('sign') ? 'production' : 'draft';
  const setTab = (t: SignStage) => {
    const next = new URLSearchParams(params);
    next.set('tab', t === 'draft' ? 'drafts' : 'production');
    next.delete('sign');
    next.delete('draft');
    setParams(next, { replace: true });
  };

  const [filter, setFilter] = useState<SignStatus | 'all'>('all');
  const shown = filter === 'all' ? production : production.filter((s) => s.status === filter);
  const countOf = (status: SignStatus) => production.filter((s) => s.status === status).length;

  const selectedId = Number(params.get('sign')) || null;
  const selected = production.find((s) => s.id === selectedId) ?? null;
  const select = (id: number | null) => setParam('sign', id == null ? null : String(id));
  const openDraftId = Number(params.get('draft')) || null;
  const openDraft = drafts.find((s) => s.id === openDraftId) ?? null;

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
  const addVersion = useAddSignVersion();
  const approve = useApproveSign();
  const queryClient = useQueryClient();
  // A spot added or removed changes the sign's count on the list.
  const refreshSigns = () => queryClient.invalidateQueries({ queryKey: signsQueryKey });
  const createPin = useCreateMapPin();
  const updatePin = useUpdateMapPin();
  const deletePin = useDeleteMapPin();
  const [form, setForm] = useState<SignForm | null>(null);
  const [formFile, setFormFile] = useState<File | null>(null);
  const [uploadFor, setUploadFor] = useState<Sign | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busyPdf, setBusyPdf] = useState<number | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [addingVersion, setAddingVersion] = useState(false);

  const failed = (fallback: string) => (err: unknown) => enqueueSnackbar(errorText(err, fallback), { variant: 'error' });

  const openForm = (next: SignForm | null) => {
    setFormFile(null);
    setForm(next);
  };

  const saveForm = async () => {
    if (!form || !form.name.trim()) return;
    const payload = {
      name: form.name.trim(), stage: form.stage, location: form.location.trim(), quantity: form.quantity,
      note: form.note.trim(), ...(form.stage === 'production' ? { status: form.status, copies_up: form.copies_up } : {}),
    };
    try {
      const sign = form.id == null
        ? await createSign.mutateAsync(payload)
        : await updateSign.mutateAsync({ id: form.id, ...payload });
      if (formFile) await uploadPdf.mutateAsync({ id: sign.id, file: formFile });
      openForm(null);
      if (form.id == null) {
        const next = new URLSearchParams(params);
        next.set('tab', sign.stage === 'draft' ? 'drafts' : 'production');
        next.set(sign.stage === 'draft' ? 'draft' : 'sign', String(sign.id));
        setParams(next, { replace: true });
      }
    } catch (err) {
      failed('Could not save the sign.')(err);
    }
  };

  const setStatus = (sign: Sign, status: SignStatus) =>
    updateSign.mutate({ id: sign.id, status }, { onError: failed('Could not change the status.') });

  const removeSign = (sign: Sign) => {
    const spots = sign.stage === 'draft' ? '' : ` Its ${sign.pins} spot(s) leave the store map.`;
    if (!window.confirm(`Remove "${sign.name}" from the list?${spots}`)) return;
    deleteSign.mutate(sign.id, {
      onSuccess: () => {
        if (selectedId === sign.id) select(null);
        if (openDraftId === sign.id) setParam('draft', null);
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

  const selectedVersions = selected ? [...selected.versions].sort((a, b) => a.position - b.position || a.id - b.id) : [];
  const chosenIndex = selected ? selectedVersions.findIndex((v) => v.id === selected.chosen_version) : -1;
  const editingSign = form?.id != null ? signs.find((s) => s.id === form.id) ?? null : null;

  // ── Production: the selected sign, then its spots on the map ───────────────
  const detail = selected && (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <SignThumb
          signId={selected.id}
          versionId={selected.preview_version}
          size={phone ? 96 : 120}
          height={phone ? 124 : 155}
          alt={selected.name}
          onOpen={selected.preview_version ? () => setViewing(Math.max(0, selectedVersions.findIndex((v) => v.id === selected.preview_version))) : undefined}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.25 }}>{selected.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {selected.location || 'No place given'} · {selected.quantity} needed · {selected.copies_up} up
          </Typography>
          {selected.note && <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>{selected.note}</Typography>}
          <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
            {selected.pdf_name ? (
              <>
                <Button size="small" variant="contained" startIcon={<PrintIcon />} disabled={busyPdf === selected.id} onClick={() => void printPdf(selected)}>
                  Print
                </Button>
                <Button size="small" startIcon={<DownloadIcon />} disabled={busyPdf === selected.id} onClick={() => void downloadPdf(selected)}>
                  Download
                </Button>
                <Tooltip title={`Open ${selected.pdf_name}`}>
                  <IconButton size="small" aria-label={`Open the PDF of ${selected.name}`} disabled={busyPdf === selected.id} onClick={() => void openPdf(selected)}>
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            ) : (
              <Typography variant="caption" color="text.secondary">No PDF yet</Typography>
            )}
            {canEdit && (
              <>
                <Tooltip title={selected.pdf_name ? 'Replace the PDF' : 'Add the PDF'}>
                  <IconButton
                    size="small"
                    aria-label={`${selected.pdf_name ? 'Replace' : 'Add'} the PDF of ${selected.name}`}
                    onClick={() => {
                      setUploadFor(selected);
                      fileRef.current?.click();
                    }}
                  >
                    <UploadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Edit">
                  <IconButton size="small" aria-label={`Edit ${selected.name}`} onClick={() => openForm(formOf(selected))}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Remove">
                  <IconButton size="small" color="error" aria-label={`Remove ${selected.name}`} onClick={() => removeSign(selected)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Stack>
        </Box>
      </Stack>
      {(selectedVersions.length > 0 || canEdit) && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">Versions</Typography>
          <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5, mt: 0.5 }}>
            {selectedVersions.map((v, i) => {
              const inUse = v.id === selected.chosen_version;
              return (
                <Box key={v.id} sx={{ width: 76, flex: '0 0 auto' }}>
                  <Box sx={{ outline: inUse ? 2 : 0, outlineColor: 'success.main', borderRadius: 1 }}>
                    <SignThumb signId={selected.id} versionId={v.has_preview ? v.id : null} size={76} height={98} alt={`${selected.name}: ${v.label}`} onOpen={() => setViewing(i)} />
                  </Box>
                  <Typography variant="caption" component="div" noWrap title={v.label} sx={{ fontWeight: inUse ? 700 : 400 }}>
                    {inUse ? 'In use' : v.label}
                  </Typography>
                  {canEdit && !inUse && (selected.kind !== 'theme' || user?.is_superuser) && (
                    <Button
                      size="small"
                      sx={{ minWidth: 0, p: 0, fontSize: 12 }}
                      onClick={() =>
                        approve.mutate(
                          { id: selected.id, version: v.id },
                          { onSuccess: () => enqueueSnackbar(`Now printing ${v.label}.`, { variant: 'success' }), onError: failed('Could not switch the version.') },
                        )
                      }
                    >
                      Use this
                    </Button>
                  )}
                </Box>
              );
            })}
            {canEdit && (
              <Button variant="outlined" onClick={() => setAddingVersion(true)} sx={{ width: 76, height: 98, flex: '0 0 auto', minWidth: 0, borderStyle: 'dashed', fontSize: 12 }}>
                Add a version
              </Button>
            )}
          </Box>
        </Box>
      )}
      {chosenIndex < 0 && selectedVersions.length > 0 && (
        <Typography variant="caption" color="text.secondary">No version chosen yet: the PDF above is the one that prints.</Typography>
      )}
    </Paper>
  );

  const map = plan && doc && signLayer && (
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
            const target = production.find((s) => s.id === pin.ref_id);
            if (filter !== 'all' && target?.status !== filter) setFilter('all');
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
  );

  const showList = !(narrow && selected);

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Signage</Typography>
          <Typography variant="body2" color="text.secondary">
            {tab === 'draft' ? 'Vote on the signs in the making.' : 'Every store sign, its file to print, and where it hangs.'}
          </Typography>
        </Box>
        {canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openForm(emptyForm(tab))} sx={{ flexShrink: 0 }}>
            {tab === 'draft' ? 'New draft' : 'New sign'}
          </Button>
        )}
      </Stack>

      <Tabs value={tab} onChange={(_, t: SignStage) => setTab(t)} sx={{ mb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="draft" label={`Drafts (${drafts.length})`} />
        <Tab value="production" label={`Production (${production.length})`} />
      </Tabs>

      {signsQuery.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}
      {signsQuery.isError && <Alert severity="error">Could not load the signs.</Alert>}

      {tab === 'draft' && signsQuery.data && (
        <Paper variant="outlined" sx={{ maxWidth: 820 }}>
          {drafts.length === 0 && (
            <Alert severity="info" sx={{ m: 1 }}>No drafts right now.{canEdit ? ' Add one with New draft.' : ''}</Alert>
          )}
          {drafts.map((sign) => (
            <SignRow
              key={sign.id}
              sign={sign}
              sub={[sign.kind === 'theme' ? 'Theme' : null, sign.location || 'No place given', `${sign.quantity} needed`, `${sign.versions.length} ${sign.versions.length === 1 ? 'version' : 'versions'}`].filter(Boolean).join(' · ')}
              right={<DraftResult sign={sign} />}
              onOpen={() => setParam('draft', String(sign.id))}
            />
          ))}
        </Paper>
      )}

      {tab === 'production' && signsQuery.data && (
        <>
          {showList && (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
              <Chip size="small" label={`All (${production.length})`} onClick={() => setFilter('all')} color={filter === 'all' ? 'primary' : 'default'} variant={filter === 'all' ? 'filled' : 'outlined'} />
              {SIGN_STATUSES.map((s) => (
                <Chip
                  key={s.value}
                  size="small"
                  label={`${s.label} (${countOf(s.value)})`}
                  onClick={() => setFilter(s.value)}
                  color={filter === s.value ? 'primary' : 'default'}
                  variant={filter === s.value ? 'filled' : 'outlined'}
                />
              ))}
            </Stack>
          )}
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(320px, 400px) minmax(0, 1fr)' }, alignItems: 'start' }}>
            {showList && (
              <Paper variant="outlined" sx={{ maxHeight: { lg: '78vh' }, overflow: { lg: 'auto' } }}>
                {shown.length === 0 && (
                  <Alert severity="info" sx={{ m: 1 }}>
                    {production.length === 0 ? `No signs in production yet.${canEdit ? ' Approve a draft, or add one with New sign.' : ''}` : 'No signs with that status.'}
                  </Alert>
                )}
                {shown.map((sign) => (
                  <SignRow
                    key={sign.id}
                    sign={sign}
                    selected={sign.id === selectedId}
                    rowRef={(el) => {
                      rowRefs.current.set(sign.id, el);
                    }}
                    sub={[sign.location || null, `${sign.copies_up} up`, sign.pins === 0 ? 'not on the map' : `${sign.pins} on the map`].filter(Boolean).join(' · ')}
                    right={
                      canEdit ? (
                        <TextField
                          select
                          size="small"
                          value={sign.status}
                          onChange={(e) => setStatus(sign, e.target.value as SignStatus)}
                          sx={{ minWidth: 104, '& .MuiSelect-select': { py: 0.5, fontSize: 13 } }}
                          inputProps={{ 'aria-label': `Status of ${sign.name}` }}
                        >
                          {SIGN_STATUSES.map((s) => (
                            <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                          ))}
                        </TextField>
                      ) : (
                        <Chip size="small" label={sign.status_label} color={STATUS_COLOR[sign.status]} />
                      )
                    }
                    onOpen={() => select(sign.id === selectedId ? null : sign.id)}
                  />
                ))}
              </Paper>
            )}
            <Stack spacing={1.5} sx={{ minWidth: 0 }}>
              {narrow && selected && (
                <Box>
                  <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => select(null)}>All signs</Button>
                </Box>
              )}
              {detail}
              {mapQuery.data && !plan && (
                <Alert severity="info">
                  The store map is not set up yet: no floor plan is marked Current (Studios → Floorplans, the star).
                </Alert>
              )}
              {(!narrow || selected) && map}
            </Stack>
          </Box>
        </>
      )}

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

      <DraftDialog
        sign={openDraft}
        canManage={canEdit}
        meId={(user as { id?: number } | null)?.id ?? null}
        onClose={() => setParam('draft', null)}
        onEdit={(sign) => openForm(formOf(sign))}
        onRemove={removeSign}
      />

      {selected && (
        <VersionViewer sign={selected} versions={selectedVersions} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
      )}
      <AddVersionDialog
        open={addingVersion && Boolean(selected)}
        onClose={() => setAddingVersion(false)}
        saving={addVersion.isPending}
        onSave={(v) =>
          selected &&
          addVersion.mutate(
            { id: selected.id, ...v },
            { onSuccess: () => enqueueSnackbar('Version added.', { variant: 'success' }), onError: failed('Could not add the version.') },
          )
        }
      />

      <SignEditDialog
        form={form}
        onChange={setForm}
        onClose={() => openForm(null)}
        onSave={() => void saveForm()}
        saving={createSign.isPending || updateSign.isPending || uploadPdf.isPending}
        extra={
          form?.stage === 'production' && (
            <>
              <Button component="label" variant="outlined" startIcon={<UploadIcon />}>
                {formFile ? formFile.name : 'PDF to print (optional)'}
                <input hidden type="file" accept="application/pdf,.pdf" onChange={(e) => setFormFile(e.target.files?.[0] ?? null)} />
              </Button>
              {editingSign?.pdf_name && !formFile && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }} noWrap>
                    Now: {editingSign.pdf_name}
                  </Typography>
                  <Button size="small" color="error" onClick={() => removePdf.mutate(editingSign.id, { onError: failed('Could not take the PDF off.') })}>
                    Take the PDF off
                  </Button>
                </Stack>
              )}
            </>
          )
        }
      />
    </Box>
  );
}
