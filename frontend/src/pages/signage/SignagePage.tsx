import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddLocationAltIcon from '@mui/icons-material/AddLocationAlt';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
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
import type { MapPin, MapPinStatus, PlanDocument } from '../../types/floorplan.types';
import { SIGN_REF_TYPE, type Sign, type SignStage, type SignVersion } from '../../types/signage.types';
import DraftDialog, { errorText } from './DraftDialog';
import { AddVersionDialog, emptyForm, formOf, SignEditDialog, SignThumb, VersionViewer, type SignForm } from './SignParts';

/** #129: each spot on the map is still to hang, or its copy is up. */
const SPOT_STATUS: Record<MapPinStatus, { label: string; color: string }> = {
  wanted: { label: 'To hang', color: '#ea580c' },
  up: { label: 'Up', color: '#16a34a' },
};

type Filter = 'all' | 'to_hang' | 'up';

/** Copies still to hang: spots not up, plus copies not on the map yet. */
const toHang = (sign: Sign) => Math.max(sign.quantity, sign.pins) - sign.pins_up;

/** Height of the fixed rows (filters, the map's bar): they never grow, so nothing below them moves. */
const BAR_HEIGHT = 44;
/** One list row; every row is this tall, selected or not. */
const ROW_HEIGHT = 64;

function safeFilename(name: string) {
  return `${name.replace(/[^\w\- ]+/g, '').trim() || 'sign'}.pdf`;
}

function sortedVersions(sign: Sign) {
  return [...sign.versions].sort((a, b) => a.position - b.position || a.id - b.id);
}

/** One list row: the picture (tap = the gallery), the name, one line under it, and its control on the right. */
function SignRow({
  sign,
  sub,
  right,
  selected,
  onOpen,
  onPicture,
  rowRef,
}: {
  sign: Sign;
  sub: string;
  right: React.ReactNode;
  selected?: boolean;
  onOpen: () => void;
  onPicture?: () => void;
  rowRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <Box
      ref={rowRef}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Open ${sign.name}`}
      aria-pressed={selected}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        height: ROW_HEIGHT,
        flexShrink: 0,
        cursor: 'pointer',
        borderBottom: 1,
        borderColor: 'divider',
        // The selected row is marked by colour and a left bar drawn inside its box: no size change.
        bgcolor: selected ? 'action.selected' : 'transparent',
        boxShadow: selected ? (t) => `inset 3px 0 0 ${t.palette.primary.main}` : 'none',
        '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
      }}
    >
      <SignThumb signId={sign.id} versionId={sign.preview_version} size={38} height={50} alt={sign.name} onOpen={onPicture} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" noWrap title={sign.name} sx={{ fontWeight: 600, lineHeight: 1.3 }}>
          {sign.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div" title={sub}>{sub}</Typography>
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
    <Box sx={{ width: { xs: 96, sm: 120 } }}>
      <Typography variant="caption" component="div" noWrap sx={{ fontWeight: 600 }}>
        {r.needed_pct != null ? `${r.needed_pct}% needed` : 'No yes/no yet'}
      </Typography>
      {r.top_version_label && (
        <Typography variant="caption" color="text.secondary" component="div" noWrap title={r.top_version_label}>Top: {r.top_version_label}</Typography>
      )}
    </Box>
  );
}

/**
 * Facilities → Signage (#106, #122, #129). The list and its controls on the left; the store map fills the rest of the
 * screen on the right and never moves when a sign is picked. **Drafts**: staff vote; a manager approves the winner
 * once 3 people have voted (#128); themes are the owner's. **Production**: every sign to print, its picture (tap it
 * for the gallery), a drop-down with Versions / Print / Download, and its spots on the map, each To hang or Up.
 */
export default function SignagePage() {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const canEdit = canAccess(user, ['signage:manage', 'admin:manage']);
  const theme = useTheme();
  // Below md the list sits over the map (a fixed share of the height each); from md the list is on the left.
  const stacked = useMediaQuery(theme.breakpoints.down('md'));
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

  const [filter, setFilter] = useState<Filter>('all');
  const matches = (sign: Sign, f: Filter) => f === 'all' || (f === 'to_hang' ? toHang(sign) > 0 : toHang(sign) === 0);
  const shown = production.filter((s) => matches(s, filter));
  const countOf = (f: Filter) => production.filter((s) => matches(s, f)).length;

  const selectedId = Number(params.get('sign')) || null;
  const selected = production.find((s) => s.id === selectedId) ?? null;
  const select = (id: number | null) => setParam('sign', id == null ? null : String(id));
  const openDraftId = Number(params.get('draft')) || null;
  const openDraft = drafts.find((s) => s.id === openDraftId) ?? null;

  // A pin tapped on the map brings its row into view inside the list (the list scrolls, the page does not).
  const rowRefs = useRef(new Map<number, HTMLDivElement | null>());
  useEffect(() => {
    if (selectedId != null) rowRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
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
  const [placing, setPlacing] = useState(false);
  const [tappedPinId, setTappedPinId] = useState<number | null>(null);
  // Read from the live pins, so a status change shows at once.
  const tappedPin = signPins.find((p) => p.id === tappedPinId) ?? null;
  useEffect(() => {
    setPlacing(false);
    setTappedPinId((id) => (id != null && signPins.find((p) => p.id === id)?.ref_id === selectedId ? id : null));
    // Only when the sign changes; signPins is read for the check, not watched.
  }, [selectedId]);
  const highlighted = useMemo(() => {
    if (tappedPin) return new Set([tappedPin.id]);
    return new Set(signPins.filter((p) => selected && p.ref_id === selected.id).map((p) => p.id));
  }, [signPins, selected, tappedPin]);

  // ── Writes ─────────────────────────────────────────────────────────────────
  const createSign = useCreateSign();
  const updateSign = useUpdateSign();
  const deleteSign = useDeleteSign();
  const uploadPdf = useUploadSignPdf();
  const removePdf = useRemoveSignPdf();
  const addVersion = useAddSignVersion();
  const approve = useApproveSign();
  const queryClient = useQueryClient();
  // A spot added, removed or marked Up changes the sign's counts on the list.
  const refreshSigns = () => queryClient.invalidateQueries({ queryKey: signsQueryKey });
  const createPin = useCreateMapPin();
  const updatePin = useUpdateMapPin();
  const deletePin = useDeleteMapPin();
  const [form, setForm] = useState<SignForm | null>(null);
  const [formFile, setFormFile] = useState<File | null>(null);
  const [uploadFor, setUploadFor] = useState<Sign | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busyPdf, setBusyPdf] = useState<number | null>(null);
  // The gallery: which sign, and which of its versions is showing.
  const [gallery, setGallery] = useState<{ signId: number; index: number } | null>(null);
  const [addingVersionFor, setAddingVersionFor] = useState<Sign | null>(null);
  const [menu, setMenu] = useState<{ sign: Sign; anchor: HTMLElement } | null>(null);

  const failed = (fallback: string) => (err: unknown) => enqueueSnackbar(errorText(err, fallback), { variant: 'error' });

  const openForm = (next: SignForm | null) => {
    setFormFile(null);
    setForm(next);
  };

  const saveForm = async () => {
    if (!form || !form.name.trim()) return;
    const payload = {
      name: form.name.trim(), stage: form.stage, location: form.location.trim(), quantity: form.quantity, note: form.note.trim(),
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

  /** The gallery opens on the version that stands for the sign (the one in use), else the first. */
  const openGallery = (sign: Sign) => {
    const versions = sortedVersions(sign);
    if (versions.length === 0) return;
    setGallery({ signId: sign.id, index: Math.max(0, versions.findIndex((v) => v.id === sign.preview_version)) });
  };
  const gallerySign = gallery ? signs.find((s) => s.id === gallery.signId) ?? null : null;

  const switchVersion = (sign: Sign, v: SignVersion) =>
    approve.mutate(
      { id: sign.id, version: v.id },
      { onSuccess: () => enqueueSnackbar(`Now printing ${v.label}.`, { variant: 'success' }), onError: failed('Could not switch the version.') },
    );

  const addSpot = (x: number, y: number) => {
    if (!selected || !plan || !signLayer) return;
    setPlacing(false);
    createPin.mutate(
      { plan: plan.id, layer: signLayer.id, x, y, name: selected.name, ref_id: selected.id },
      {
        onSuccess: (pin) => {
          setTappedPinId(pin.id);
          void refreshSigns();
        },
        onError: failed('Could not add the spot.'),
      },
    );
  };

  const setSpotStatus = (pin: MapPin, status: MapPinStatus) =>
    updatePin.mutate({ id: pin.id, status }, { onSuccess: refreshSigns, onError: failed('Could not change the spot.') });

  const removeSpot = (pin: MapPin) =>
    deletePin.mutate(pin.id, {
      onSuccess: () => {
        setTappedPinId(null);
        void refreshSigns();
      },
      onError: failed('Could not remove the spot.'),
    });

  // ── The left side: title, tabs, filters, list ─────────────────────────────
  const productionSub = (sign: Sign) => {
    const placed = sign.pins === 0 ? 'Not on the map' : `${sign.pins_up} of ${sign.pins} up`;
    const unplaced = sign.quantity > sign.pins && sign.pins > 0 ? `${sign.quantity - sign.pins} to place` : null;
    return [placed, unplaced, sign.location || null].filter(Boolean).join(' · ');
  };

  const rowMenuButton = (sign: Sign) =>
    stacked ? (
      <IconButton size="small" aria-label={`Versions, print and more for ${sign.name}`} onClick={(e) => setMenu({ sign, anchor: e.currentTarget })}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
    ) : (
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        endIcon={<ArrowDropDownIcon />}
        aria-label={`Versions, print and more for ${sign.name}`}
        onClick={(e) => setMenu({ sign, anchor: e.currentTarget })}
        sx={{ width: 100, justifyContent: 'space-between', borderColor: 'divider', fontSize: 13, py: 0.25 }}
      >
        {busyPdf === sign.id ? <CircularProgress size={14} /> : 'Options'}
      </Button>
    );

  const list = (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {signsQuery.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}
      {signsQuery.isError && <Alert severity="error" sx={{ m: 1 }}>Could not load the signs.</Alert>}
      {tab === 'draft' && signsQuery.data && (
        <>
          {drafts.length === 0 && (
            <Alert severity="info" sx={{ m: 1 }}>No drafts right now.{canEdit ? ' Add one with New.' : ''}</Alert>
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
        </>
      )}
      {tab === 'production' && signsQuery.data && (
        <>
          {shown.length === 0 && (
            <Alert severity="info" sx={{ m: 1 }}>
              {production.length === 0 ? `No signs in production yet.${canEdit ? ' Approve a draft, or add one with New.' : ''}` : 'No signs here.'}
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
              sub={productionSub(sign)}
              right={rowMenuButton(sign)}
              onOpen={() => select(sign.id === selectedId ? null : sign.id)}
              onPicture={sign.versions.length > 0 ? () => openGallery(sign) : undefined}
            />
          ))}
        </>
      )}
    </Box>
  );

  const left = (
    <Box
      sx={{
        width: { xs: '100%', md: 380, lg: 420 },
        height: { xs: '42%', md: '100%' },
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        borderRight: { md: 1 },
        borderBottom: { xs: 1, md: 0 },
        borderColor: { xs: 'divider', md: 'divider' },
        bgcolor: 'background.paper',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, pt: 1, flexShrink: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>Signage</Typography>
        {canEdit && (
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => openForm(emptyForm(tab))}>
            New
          </Button>
        )}
      </Stack>
      <Tabs
        value={tab}
        onChange={(_, t: SignStage) => setTab(t)}
        variant="fullWidth"
        sx={{ minHeight: 40, flexShrink: 0, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 40, py: 0 } }}
      >
        <Tab value="draft" label={`Drafts (${drafts.length})`} />
        <Tab value="production" label={`Production (${production.length})`} />
      </Tabs>
      {/* One fixed-height row under the tabs on both: filters on Production, a line of help on Drafts. */}
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ height: BAR_HEIGHT, px: 1.5, flexShrink: 0, borderBottom: 1, borderColor: 'divider', overflow: 'hidden' }}>
        {tab === 'production' ? (
          ([['all', 'All'], ['to_hang', 'To hang'], ['up', 'All up']] as [Filter, string][]).map(([f, label]) => (
            <Chip
              key={f}
              size="small"
              label={`${label} (${countOf(f)})`}
              onClick={() => setFilter(f)}
              color={filter === f ? 'primary' : 'default'}
              variant={filter === f ? 'filled' : 'outlined'}
            />
          ))
        ) : (
          <Typography variant="caption" color="text.secondary" noWrap>Vote on the signs in the making. Tap one to see it.</Typography>
        )}
      </Stack>
      {list}
    </Box>
  );

  // ── The right side: one fixed bar, then the map filling the rest ─────────
  const spotOf = tappedPin ? production.find((s) => s.id === tappedPin.ref_id) ?? null : null;
  const legend = (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexShrink: 0 }}>
      {(Object.keys(SPOT_STATUS) as MapPinStatus[]).map((k) => (
        <Stack key={k} direction="row" spacing={0.5} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: SPOT_STATUS[k].color }} />
          <Typography variant="caption" color="text.secondary">{SPOT_STATUS[k].label}</Typography>
        </Stack>
      ))}
    </Stack>
  );
  let barText: React.ReactNode;
  let barActions: React.ReactNode = null;
  if (placing && selected) {
    barText = <>Tap the map where <b>{selected.name}</b> goes</>;
    barActions = <Button size="small" onClick={() => setPlacing(false)}>Cancel</Button>;
  } else if (tappedPin) {
    barText = <>A spot of <b>{tappedPin.name}</b></>;
    barActions = (
      <Stack direction="row" spacing={0.5} alignItems="center">
        {canEdit ? (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={tappedPin.status}
            onChange={(_, v: MapPinStatus | null) => v && v !== tappedPin.status && setSpotStatus(tappedPin, v)}
            aria-label="This spot"
          >
            {(Object.keys(SPOT_STATUS) as MapPinStatus[]).map((k) => (
              <ToggleButton key={k} value={k} sx={{ py: 0.25, px: 1.25, textTransform: 'none' }}>{SPOT_STATUS[k].label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        ) : (
          <Chip size="small" label={SPOT_STATUS[tappedPin.status].label} sx={{ bgcolor: SPOT_STATUS[tappedPin.status].color, color: '#fff' }} />
        )}
        {canEdit && (
          <Tooltip title="Take this spot off the map">
            <IconButton size="small" color="error" aria-label={`Remove this spot of ${tappedPin.name}`} onClick={() => removeSpot(tappedPin)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    );
  } else if (selected) {
    barText = selected.pins === 0
      ? <><b>{selected.name}</b>: not on the map yet</>
      : <><b>{selected.name}</b>: {selected.pins_up} of {selected.pins} up</>;
    barActions = canEdit ? (
      <Button size="small" variant="outlined" startIcon={<AddLocationAltIcon />} onClick={() => setPlacing(true)}>
        Add a spot
      </Button>
    ) : null;
  } else {
    barText = 'Every sign on the store map. Tap a sign or a pin.';
    barActions = <Button size="small" component={RouterLink} to="/facilities/store-map">Store map</Button>;
  }

  const right = (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', p: 1, gap: 0.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ height: BAR_HEIGHT, flexShrink: 0, minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>{barText}</Typography>
        {!stacked && legend}
        <Box sx={{ flexShrink: 0 }}>{barActions}</Box>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {mapQuery.isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        )}
        {mapQuery.data && !plan && (
          <Alert severity="info">
            The store map is not set up yet: no floor plan is marked Current (Studios → Floorplans, the star).
          </Alert>
        )}
        {plan && doc && signLayer && (
          <StoreMapView
            fill
            doc={doc}
            layers={[signLayer]}
            pins={signPins}
            visibleLayerIds={new Set([signLayer.id])}
            assets={assetMap}
            kindIndex={kindIndex}
            highlightedPinIds={highlighted}
            dimOthers={Boolean(selected) || Boolean(tappedPin)}
            pinColor={(pin) => SPOT_STATUS[pin.status]?.color}
            placing={placing}
            onMapClick={(pt) => addSpot(pt.x, pt.y)}
            onPinClick={(pin) => {
              setTappedPinId(pin.id);
              if (pin.ref_id != null && pin.ref_id !== selectedId) {
                const target = production.find((s) => s.id === pin.ref_id);
                if (target && !matches(target, filter)) setFilter('all');
                select(pin.ref_id);
              }
            }}
            onPinMove={canEdit ? (pin, pt) => updatePin.mutate({ id: pin.id, x: pt.x, y: pt.y }, { onError: failed('Could not move the spot.') }) : undefined}
          />
        )}
      </Box>
      {stacked && <Box sx={{ flexShrink: 0, display: 'flex', justifyContent: 'center' }}>{legend}</Box>}
    </Box>
  );

  // ── The row's drop-down: versions, print, download (and a manager's tools) ──
  const menuSign = menu ? signs.find((s) => s.id === menu.sign.id) ?? menu.sign : null;
  const closeMenu = () => setMenu(null);
  const menuItems = menuSign
    ? [
        <MenuItem key="versions" disabled={menuSign.versions.length === 0} onClick={() => { closeMenu(); openGallery(menuSign); }}>
          <ListItemIcon><CollectionsOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Versions ({menuSign.versions.length})</ListItemText>
        </MenuItem>,
        <MenuItem key="print" disabled={!menuSign.pdf_name} onClick={() => { closeMenu(); void printPdf(menuSign); }}>
          <ListItemIcon><PrintIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Print</ListItemText>
        </MenuItem>,
        <MenuItem key="download" disabled={!menuSign.pdf_name} onClick={() => { closeMenu(); void downloadPdf(menuSign); }}>
          <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Download</ListItemText>
        </MenuItem>,
        <MenuItem key="open" disabled={!menuSign.pdf_name} onClick={() => { closeMenu(); void openPdf(menuSign); }}>
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Open the PDF" secondary={menuSign.pdf_name ?? 'No PDF yet'} secondaryTypographyProps={{ noWrap: true, sx: { maxWidth: 200 } }} />
        </MenuItem>,
        ...(canEdit
          ? [
              <Divider key="d" />,
              <MenuItem key="add-version" onClick={() => { closeMenu(); setAddingVersionFor(menuSign); }}>
                <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Add a version</ListItemText>
              </MenuItem>,
              <MenuItem key="pdf" onClick={() => { closeMenu(); setUploadFor(menuSign); fileRef.current?.click(); }}>
                <ListItemIcon><UploadIcon fontSize="small" /></ListItemIcon>
                <ListItemText>{menuSign.pdf_name ? 'Replace the PDF' : 'Add the PDF'}</ListItemText>
              </MenuItem>,
              <MenuItem key="edit" onClick={() => { closeMenu(); openForm(formOf(menuSign)); }}>
                <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Edit</ListItemText>
              </MenuItem>,
              <MenuItem key="remove" onClick={() => { closeMenu(); removeSign(menuSign); }} sx={{ color: 'error.main' }}>
                <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
                <ListItemText>Remove</ListItemText>
              </MenuItem>,
            ]
          : []),
      ]
    : [];

  const editingSign = form?.id != null ? signs.find((s) => s.id === form.id) ?? null : null;
  const galleryVersions = gallerySign ? sortedVersions(gallerySign) : [];

  return (
    <Box sx={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: stacked ? 'column' : 'row', overflow: 'hidden' }}>
      {left}
      {right}

      <Menu anchorEl={menu?.anchor ?? null} open={Boolean(menu)} onClose={closeMenu} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        {menuItems}
      </Menu>

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

      {gallerySign && (
        <VersionViewer
          sign={gallerySign}
          versions={galleryVersions}
          index={gallery?.index ?? null}
          onIndex={(index) => setGallery({ signId: gallerySign.id, index })}
          onClose={() => setGallery(null)}
          onUse={canEdit && (gallerySign.kind !== 'theme' || user?.is_superuser) ? (v) => switchVersion(gallerySign, v) : undefined}
        />
      )}
      <AddVersionDialog
        open={Boolean(addingVersionFor)}
        onClose={() => setAddingVersionFor(null)}
        saving={addVersion.isPending}
        onSave={(v) =>
          addingVersionFor &&
          addVersion.mutate(
            { id: addingVersionFor.id, ...v },
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
