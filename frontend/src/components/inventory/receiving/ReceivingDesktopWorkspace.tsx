import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Box, Button, Typography } from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import ArrowBackIosNewOutlined from '@mui/icons-material/ArrowBackIosNewOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import UploadOutlined from '@mui/icons-material/UploadOutlined';
import RecyclingOutlined from '@mui/icons-material/RecyclingOutlined';

import type { ChangeEvent } from 'react';

import { useSnackbar } from 'notistack';

import { OrderPickerOptionRow } from '../OrderPickerOptionRow';
import { ImageViewerDialog } from '../../common/ImageViewerDialog';
import { downloadReceivingPhoto, replaceReceivingPhoto } from '../../../api/inventory.api';
import type {
  OrderForReceivingRow,
  PalletSideId,
  ReceivingAttachmentDTO,
  ReceivingDetailDTO,
} from '../../../types/inventory.types';
import type { PendingPhotoKind } from '../../../services/receiving/receivingClient';
import { compressImageToJpeg, PALLET_SIDES } from '../../../services/receiving/receivingClient';
import { preventWheelChangeNumber, selectInputContentsOnFocus } from '../../../utils/formInputs';
import { orderPickerReceivingBadgeColors } from '../../../utils/orderPickerDisplay';
import { downloadBlob } from '../../../utils/downloadBlob';
import {
  buildReceivingPhotoGallery,
  galleryIndexForAttachment,
} from '../../../utils/receivingPhotoGallery';
import { attachmentFullUrl, attachmentThumbUrl } from '../../../utils/receivingPhotoUrls';

type ViewerState = {
  attachmentId: number;
  src: string;
  alt: string;
  title: string;
  filename?: string | null;
  /** Revoke on close when set (authenticated blob URL for crop/canvas). */
  objectUrl?: string;
};
import {
  RCV_BRAND,
  RCV_PRIMARY_DARK,
  RCV_PRIMARY_LIGHT,
  rcvSurface,
  rcvBorder,
  rcvText,
  rcvAccents,
  rcvCondition,
} from './receivingTheme';

interface Props {
  receiving: ReceivingDetailDTO;
  orderId: number;
  /** Order number (monospace in UI) */
  orderNumberMono: string;
  vendorDisplay: string;
  descriptionLine: string;
  eligibleOrders: OrderForReceivingRow[];
  onPickOrder: (orderId: number) => void;
  onBackToList: () => void;
  issuesDraft: string;
  palletCountDraftSynced: number;
  uploadingKey: string | null;
  onReceivedDateChange: (iso: string | null) => void;
  onStartTimeChange: (hhmmss: string | null) => void;
  onEndTimeChange: (hhmmss: string | null) => void;
  onPalletSet: (count: number) => void;
  onConditionChange: (v: NonNullable<ReceivingDetailDTO['condition']>) => void;
  onIssuesDraftChange: (v: string) => void;
  onIssuesBlur: () => void;
  onBolTruckPick: (kind: Exclude<PendingPhotoKind, 'pallet_side'>, fileList: FileList | null) => void;
  onBulkPalletPhotos: (files: File[]) => void | Promise<void>;
  onPalletPick: (pallet: number, side: PalletSideId, fileList: FileList | null) => void;
  onDamaged: (palletNumber: number, damaged: boolean) => void;
  onOpenIntakeDisputeForPallet?: (palletNumber: number, subjectPalletId: number | null) => void;
  /** Open complete dialog (photos may be missing — dialog collects overrides). */
  onRequestComplete: () => void;
  /** After in-viewer replace, refresh receiving detail. */
  onReceivingPhotosChanged?: () => void | Promise<void>;
  /** Slim offline / pending banners */
  banners?: React.ReactNode;
  loadingBar?: React.ReactNode;
  disabled?: boolean;
}

function hasBol(rec: ReceivingDetailDTO) {
  return rec.attachments.some((a) => a.kind === 'bol');
}
function hasTruck(rec: ReceivingDetailDTO) {
  return rec.attachments.some((a) => a.kind === 'truck');
}
function palletAttachment(rec: ReceivingDetailDTO, palletNumber: number, side: string) {
  return rec.attachments.find(
    (a) => a.kind === 'pallet_side' && a.pallet_number === palletNumber && a.side === side,
  );
}

const SIDE_UI: Record<(typeof PALLET_SIDES)[number], string> = {
  front: 'Front',
  right: 'Right',
  back: 'Back',
  left: 'Left',
};

/** ~−15% from original baseline (~10% + ~5%); keeps layout coherent */
const RECEIVING_LAYOUT_SCALE = 0.85;

const TOKENS = {
  pageBg: rcvSurface.page,
  border: rcvBorder.hairline,
  borderInput: rcvBorder.input,
  text: rcvText.body,
  muted: rcvText.mutedCool,
  mutedEarth: rcvText.muted,
  labelUpper: rcvText.sectionLabel,
  fieldLabel: rcvText.fieldLabel,
  dropIdle: rcvSurface.dropIdle,
  dropDash: rcvBorder.sageDash,
  completeGreen: RCV_BRAND,
  chromeSurface: rcvSurface.panel,
  panelSurface: rcvSurface.panel,
  dropWell: rcvSurface.well,
  /** ~¼ of receiving row; floor/ceiling keeps narrow/wide breakpoints readable */
  leftPanelWidth: 'clamp(300px, 26%, 392px)',
  leftPanelPad: 24,
  sectionGapPx: 28,
  bolTruckH: 112,
  topBarH: 56,
  topBarPadX: 24,
  rightPadX: 24,
  rightPadTopPx: 16,
  rightPadBottomPx: 28,
  palletGridMin: 236,
  palletGridGap: 14,
  fontSans: "'DM Sans', system-ui, -apple-system, sans-serif",
  fontMono: "'DM Mono', ui-monospace, monospace",
};

const COND_BTN: {
  api: Exclude<ReceivingDetailDTO['condition'], ''>;
  label: string;
  emoji: string;
}[] = [
  { api: 'good', label: 'Good', emoji: '👍' },
  { api: 'mixed', label: 'Mixed', emoji: '⚠️' },
  { api: 'damaged', label: 'Damaged', emoji: '🚨' },
];

function apiTimeToTimeInputValue(t: string | null): string {
  if (!t || !String(t).trim()) return '';
  const p = String(t).trim().split(':');
  const h = Number.parseInt(p[0] ?? '0', 10);
  const mi = Number.parseInt(p[1] ?? '0', 10);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return '';
  const hh = Math.min(23, Math.max(0, h));
  const mm = Math.min(59, Math.max(0, mi));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** HH:MM (from `<input type="time" step={60}>`) → Django TimeField HH:MM:SS */
function timePickerValueToApi(hhmm: string): string | null {
  const t = hhmm.trim();
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length < 2) return null;
  const h = Number.parseInt(parts[0]!, 10);
  const m = Number.parseInt(parts[1]!, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function timeApiToSecondsOfDay(api: string | null): number | null {
  if (!api || !api.trim()) return null;
  const p = api.split(':');
  if (p.length < 2) return null;
  const h = Number.parseInt(p[0]!, 10);
  const m = Number.parseInt(p[1]!, 10);
  const s = Number.parseInt(p[2] ?? '0', 10);
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
  return h * 3600 + m * 60 + s;
}

function formatDurationSecsDelta(totalSecs: number): string {
  if (!Number.isFinite(totalSecs) || totalSecs <= 0) return '';
  const ss = Math.floor(totalSecs % 60);
  const mins = Math.floor(totalSecs / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hr`);
  if (h > 0 || m > 0) parts.push(`${m} min`);
  if (h === 0 && m === 0 && ss > 0) parts.push(`${ss} sec`);
  if (parts.length === 0) return '< 1 min';
  return parts.join(' ');
}


function panelLabelSx() {
  return {
    fontSize: 11,
    fontWeight: 700,
    color: TOKENS.labelUpper,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    mb: 1.5,
  } as const;
}

function fieldLabelSx() {
  return {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: TOKENS.fieldLabel,
    mb: 0.5,
  } as const;
}

function inputSx() {
  return {
    width: '100%',
    px: '12px',
    py: '9px',
    minHeight: 40,
    fontSize: 13,
    fontFamily: TOKENS.fontSans,
    border: `1px solid ${TOKENS.borderInput}`,
    borderRadius: '8px',
    outline: 'none',
    color: TOKENS.text,
    bgcolor: '#ffffff',
    boxSizing: 'border-box' as const,
  };
}

function ThumbBolTruck({
  url,
  name,
  alt,
  small,
  onOpen,
}: {
  url: string | null;
  name?: string | null;
  alt: string;
  small?: boolean;
  onOpen?: () => void;
}) {
  return (
    <Box
      role={url && onOpen ? 'button' : undefined}
      tabIndex={url && onOpen ? 0 : undefined}
      aria-label={url && onOpen ? `View ${alt}` : undefined}
      onClick={url && onOpen ? onOpen : undefined}
      onKeyDown={
        url && onOpen
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      sx={{
        width: '100%',
        height: '100%',
        borderRadius: small ? '6px' : '10px',
        bgcolor: TOKENS.dropWell,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        cursor: url && onOpen ? 'zoom-in' : 'default',
      }}
    >
      {url ? (
        <Box
          component="img"
          alt={alt}
          src={url}
          loading="lazy"
          decoding="async"
          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <>
          <ImageOutlined sx={{ fontSize: small ? 16 : 20, color: TOKENS.mutedEarth }} />
          {name ? (
            <Typography
              sx={{
                position: 'absolute',
                bottom: 2,
                left: 4,
                fontSize: 9,
                color: 'rgba(0,0,0,0.4)',
                fontWeight: 600,
                maxWidth: '90%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </Typography>
          ) : null}
        </>
      )}
    </Box>
  );
}



function DropZoneBox({
  onDropFiles,
  children,
  hasContent,
  label,
  sublabel,
  small,
  pickMultiple = false,
}: {
  onDropFiles: (files: File[]) => void;
  children?: React.ReactNode;
  hasContent: boolean;
  label?: string;
  sublabel?: string;
  small?: boolean;
  /** When true, file picker accepts multiple images (Quick Fill banner only) */
  pickMultiple?: boolean;
}) {
  const [over, setOver] = useState(false);
  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
      if (files.length) onDropFiles(files);
    },
    [onDropFiles],
  );

  if (hasContent) {
    return <Box sx={{ width: '100%', height: '100%' }}>{children}</Box>;
  }

  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = pickMultiple;
    input.onchange = () => {
      const f = Array.from(input.files ?? []);
      if (!f.length) return;
      if (!pickMultiple && small) {
        onDropFiles([f[0]!]);
      } else {
        onDropFiles(f);
      }
    };
    input.click();
  };

  return (
    <Box
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      onClick={() => pick()}
      sx={{
        position: 'relative',
        border: `2px dashed ${over ? rcvBorder.sageDashStrong : rcvBorder.sageDash}`,
        borderRadius: small ? '6px' : '10px',
        bgcolor: over ? rcvAccents.dropHoverFill : TOKENS.dropIdle,
        display: 'flex',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <RecyclingOutlined
        sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: small ? 28 : 56,
          color: rcvAccents.watermark,
        pointerEvents: 'none',
        zIndex: 0,
        }}
        aria-hidden
      />
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: small ? 0.25 : 0.75,
          width: '100%',
          height: '100%',
          px: 0.25,
        }}
      >
        {!small ? (
          <UploadOutlined sx={{ fontSize: 18, color: TOKENS.mutedEarth }} />
        ) : null}
        {label ? (
          <Typography
            sx={{
              fontSize: small ? 10 : 12,
              color: TOKENS.mutedEarth,
              fontWeight: 500,
              textAlign: 'center',
            }}
          >
            {label}
          </Typography>
        ) : null}
        {sublabel ? (
          <Typography sx={{ fontSize: 10, color: rcvText.subcaption }}>{sublabel}</Typography>
        ) : null}
      </Box>
    </Box>
  );
}

function filesToInput(files: File[]): FileList {
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  return dt.files;
}

function PalletCard({
  palletNumber,
  palletDbId,
  rec,
  uploadingKey,
  onPhotoAdd,
  onViewPhoto,
  onToggleDamage,
  onOpenIntakeDispute,
  disabled,
}: {
  palletNumber: number;
  palletDbId: number | null;
  rec: ReceivingDetailDTO;
  uploadingKey: string | null;
  onPhotoAdd: (side: PalletSideId, files: FileList | null) => void;
  onViewPhoto: (att: ReceivingAttachmentDTO, title: string) => void;
  onToggleDamage: () => void;
  onOpenIntakeDispute?: () => void;
  disabled?: boolean;
}) {
  const dmg = rec.pallets.find((p) => p.pallet_number === palletNumber)?.damaged ?? false;
  const { enqueueSnackbar } = useSnackbar();
  const filled = PALLET_SIDES.filter((side) => palletAttachment(rec, palletNumber, side)).length;
  const done = PALLET_SIDES.every((side) => Boolean(palletAttachment(rec, palletNumber, side)));
  const progressTone =
    filled <= 0 ? TOKENS.muted : filled >= 4 ? RCV_BRAND : rcvText.moss;

  return (
    <Box
      sx={{
        bgcolor: rcvSurface.card,
        borderRadius: '12px',
        border:
          dmg
            ? `1px solid #fecaca`
            : done
              ? `1px solid ${rcvSurface.palletDoneStripe}`
              : `1px solid ${rcvBorder.sageMuted}`,
        overflow: 'hidden',
        transition: 'border-color 200ms ease, box-shadow 220ms ease',
        minWidth: 0,
        '&:hover': {
          ...(dmg
            ? { borderColor: '#fca5a5', boxShadow: '0 6px 20px rgba(220,38,38,0.12)' }
            : done
              ? {
                  borderColor: RCV_PRIMARY_LIGHT,
                  boxShadow: '0 8px 24px rgba(46,125,50,0.14)',
                }
              : {
                  borderColor: rcvBorder.sageStrong,
                  boxShadow: rcvAccents.cardHoverShadow,
                }),
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: '14px',
          py: '10px',
          minHeight: 44,
          borderBottom: `1px solid ${rcvBorder.hairline}`,
          bgcolor: dmg ? '#fef2f2' : done ? rcvSurface.palletHeaderDone : '#ffffff',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            sx={{
              fontSize: 15,
              fontWeight: 700,
              fontFamily: TOKENS.fontMono,
              color: done ? TOKENS.completeGreen : TOKENS.text,
            }}
          >
            #{palletNumber}
          </Typography>
          <Typography
            sx={{
              fontSize: 11,
              color: progressTone,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {filled}/4
          </Typography>
          {done ? (
            <CheckCircleOutlineOutlined sx={{ fontSize: 16, color: TOKENS.completeGreen }} />
          ) : null}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Button
            type="button"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              if (!palletDbId) {
                enqueueSnackbar('Save pallet rows first, then open a dispute.', { variant: 'warning' });
                return;
              }
              onOpenIntakeDispute?.();
            }}
            disabled={disabled}
            sx={{
              borderRadius: '5px',
              px: '6px',
              py: '2px',
              minWidth: 0,
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'none',
              color: TOKENS.mutedEarth,
              border: `1px solid ${TOKENS.borderInput}`,
            }}
          >
            Open dispute
          </Button>
        <Button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleDamage();
          }}
          disabled={disabled}
          sx={{
            background: dmg ? '#dc2626' : 'transparent',
            border: `1px solid ${dmg ? '#dc2626' : TOKENS.borderInput}`,
            borderRadius: '5px',
            px: '8px',
            py: '3px',
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            color: dmg ? 'white' : '#cbd5e1',
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          <FlagOutlined sx={{ fontSize: 11 }} />
          {dmg ? 'DMG' : 'Flag'}
        </Button>
        </Box>
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
          p: '10px',
        }}
      >
        {PALLET_SIDES.map((side) => {
          const att = palletAttachment(rec, palletNumber, side);
          const pk = `${palletNumber}-${side}`;
          const uploading = uploadingKey === pk;
          const thumbUrl = attachmentThumbUrl(att);
          const title = `Pallet ${palletNumber} · ${SIDE_UI[side]}`;
          return (
            <Box key={pk} sx={{ aspectRatio: '4/3', position: 'relative' }}>
              {thumbUrl && att ? (
                <>
                  <Box
                    component="img"
                    alt={title}
                    src={thumbUrl}
                    loading="lazy"
                    decoding="async"
                    onClick={() => onViewPhoto(att, title)}
                    sx={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      display: 'block',
                      cursor: 'zoom-in',
                    }}
                  />
                  {!disabled && !rec.completed_at ? (
                    <Box
                      component="label"
                      sx={{
                        position: 'absolute',
                        right: 4,
                        bottom: 4,
                        px: 0.75,
                        py: 0.25,
                        borderRadius: '4px',
                        bgcolor: 'rgba(15,23,42,0.72)',
                        color: 'white',
                        fontSize: 9,
                        fontWeight: 700,
                        cursor: 'pointer',
                        zIndex: 1,
                      }}
                    >
                      Replace
                      <Box
                        component="input"
                        type="file"
                        accept="image/*"
                        disabled={disabled || uploading}
                        sx={{ display: 'none' }}
                        onChange={(ev: ChangeEvent<HTMLInputElement>) => {
                          onPhotoAdd(side, ev.target.files);
                          ev.target.value = '';
                        }}
                      />
                    </Box>
                  ) : null}
                </>
              ) : (
                <DropZoneBox
                  small
                  hasContent={false}
                  label={SIDE_UI[side]}
                  pickMultiple={false}
                  onDropFiles={(files) => onPhotoAdd(side, filesToInput(files.slice(0, 1)))}
                />
              )}
              {uploading ? (
                <Typography variant="caption" sx={{ px: 0.5 }}>
                  …
                </Typography>
              ) : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default function ReceivingDesktopWorkspace({
  receiving: m,
  orderId,
  orderNumberMono,
  vendorDisplay,
  descriptionLine,
  eligibleOrders,
  onPickOrder,
  onBackToList,
  issuesDraft,
  palletCountDraftSynced,
  uploadingKey,
  onReceivedDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onPalletSet,
  onConditionChange,
  onIssuesDraftChange,
  onIssuesBlur,
  onBolTruckPick,
  onBulkPalletPhotos,
  onPalletPick,
  onDamaged,
  onOpenIntakeDisputeForPallet,
  onRequestComplete,
  onReceivingPhotosChanged,
  banners,
  loadingBar,
  disabled,
}: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerAnchor = useRef<HTMLDivElement>(null);
  const endSyncedToStartPending = useRef(false);
  const [viewer, setViewer] = useState<ViewerState | null>(null);

  const [bulkOver, setBulkOver] = useState(false);
  const bol = m.attachments.find((a) => a.kind === 'bol');
  const truck = m.attachments.find((a) => a.kind === 'truck');

  const bolThumbUrl = attachmentThumbUrl(bol);
  const truckThumbUrl = attachmentThumbUrl(truck);

  const photoGallery = useMemo(() => buildReceivingPhotoGallery(m), [m]);
  const viewerIndex =
    viewer != null ? galleryIndexForAttachment(photoGallery, viewer.attachmentId) : -1;

  const closeViewer = () => {
    setViewer((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  };

  const openAttachment = (att: ReceivingAttachmentDTO, title: string) => {
    const fallback = attachmentFullUrl(att);
    if (!fallback) return;
    setViewer((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return {
        attachmentId: att.id,
        src: fallback,
        alt: title,
        title,
        filename: att.s3_file?.filename,
      };
    });
    void (async () => {
      try {
        const { data } = await downloadReceivingPhoto(orderId, att.id);
        const objectUrl = URL.createObjectURL(data);
        setViewer((prev) => {
          if (!prev || prev.attachmentId !== att.id) {
            URL.revokeObjectURL(objectUrl);
            return prev;
          }
          if (prev.objectUrl) URL.revokeObjectURL(prev.objectUrl);
          return { ...prev, src: objectUrl, objectUrl };
        });
      } catch {
        // Keep presigned URL for view; crop/save may still fail if S3 CORS blocks canvas.
      }
    })();
  };

  const goGalleryDelta = (delta: number) => {
    if (viewerIndex < 0) return;
    const next = photoGallery[viewerIndex + delta];
    if (!next) return;
    openAttachment(next.attachment, next.title);
  };

  const applyReplacedPhoto = async (
    blob: Blob,
    messages: { success: string; failure: string },
  ) => {
    if (!viewer) return;
    try {
      const { data: updated } = await replaceReceivingPhoto(
        orderId,
        viewer.attachmentId,
        blob,
        viewer.filename || 'photo.jpg',
      );
      const nextUrl = attachmentFullUrl(updated) ?? URL.createObjectURL(blob);
      setViewer((prev) => {
        if (!prev) return prev;
        if (prev.objectUrl) URL.revokeObjectURL(prev.objectUrl);
        const objectUrl = nextUrl.startsWith('blob:') ? nextUrl : URL.createObjectURL(blob);
        return {
          ...prev,
          attachmentId: updated.id,
          src: objectUrl,
          objectUrl,
          filename: updated.s3_file?.filename ?? prev.filename,
        };
      });
      await onReceivingPhotosChanged?.();
      enqueueSnackbar(messages.success, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(messages.failure, { variant: 'error' });
      throw err;
    }
  };

  const [palletDraft, setPalletDraft] = useState('');
  useEffect(() => {
    setPalletDraft(palletCountDraftSynced > 0 ? String(palletCountDraftSynced) : '');
  }, [palletCountDraftSynced, m.draft_version]);

  const startDisplay = apiTimeToTimeInputValue(m.start_time);
  const endDisplay = apiTimeToTimeInputValue(m.end_time);

  const [startEdit, setStartEdit] = useState(startDisplay);
  const [endEdit, setEndEdit] = useState(endDisplay);

  useEffect(() => {
    setStartEdit(startDisplay);
  }, [startDisplay]);

  useEffect(() => {
    setEndEdit(endDisplay);
  }, [endDisplay]);

  const timeSessionHint = useMemo(() => {
    const rawS = startEdit.trim();
    const rawE = endEdit.trim();
    const sApi = rawS ? timePickerValueToApi(rawS) : null;
    const eApi = rawE ? timePickerValueToApi(rawE) : null;
    if (!rawS || !rawE || sApi === null || eApi === null) return null;
    const ts = timeApiToSecondsOfDay(sApi);
    const te = timeApiToSecondsOfDay(eApi);
    if (ts == null || te == null || te < ts) return null;
    const deltaSec = te - ts;
    const readable =
      deltaSec === 0 ? '0 min' : formatDurationSecsDelta(deltaSec) || `${Math.max(0, deltaSec)} sec`;
    const totalMinRounded = Math.round(deltaSec / 60);
    return {
      readable,
      totalMinRounded,
      deltaSec,
    };
  }, [startEdit, endEdit]);
  const condTrim = (m.condition || '').trim() as NonNullable<ReceivingDetailDTO['condition']> | '';

  const palletsPlanned = m.received_pallet_count > 0;
  let completedPallets = 0;
  for (let n = 1; n <= m.received_pallet_count; n++) {
    const ok = PALLET_SIDES.every((s) => palletAttachment(m, n, s));
    if (ok) completedPallets++;
  }

  const totalPalletPhotos = m.attachments.filter((a) => a.kind === 'pallet_side').length;
  const totalPhotos =
    totalPalletPhotos + (hasBol(m) ? 1 : 0) + (hasTruck(m) ? 1 : 0);
  const damagedCount = (m.pallets ?? []).filter((p) => p.damaged).length;

  const canOpenComplete =
    !m.completed_at && condTrim !== '' && palletsPlanned && !(disabled ?? false);

  useEffect(() => {
    if (!pickerOpen) return;
    const fn = (e: MouseEvent) => {
      if (pickerAnchor.current && !pickerAnchor.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    window.addEventListener('mousedown', fn);
    return () => window.removeEventListener('mousedown', fn);
  }, [pickerOpen]);

  const handleBolDrop = useCallback(
    (files: File[]) => void onBolTruckPick('bol', filesToInput(files.slice(0, 1))),
    [onBolTruckPick],
  );
  const handleTruckDrop = useCallback(
    (files: File[]) => void onBolTruckPick('truck', filesToInput(files.slice(0, 1))),
    [onBolTruckPick],
  );

  const handleBulkDrop = useCallback(
    async (e: DragEvent) => {
      if (disabled ?? false) return;
      e.preventDefault();
      setBulkOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      await onBulkPalletPhotos(files);
    },
    [onBulkPalletPhotos, disabled],
  );

  const quickFillClickPick = () => {
    if (disabled ?? false) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (files.length) void onBulkPalletPhotos(files);
    };
    input.click();
  };

  useEffect(() => {
    endSyncedToStartPending.current = false;
  }, [startDisplay, endDisplay, m.draft_version]);

  const blurStartTime = () => {
    const apiS = timePickerValueToApi(startEdit);
    onStartTimeChange(apiS);

    const apiE = timePickerValueToApi(endEdit);
    if (
      apiS != null &&
      apiE !== null &&
      timeApiToSecondsOfDay(apiE)! < timeApiToSecondsOfDay(apiS)!
    ) {
      const fixed = apiTimeToTimeInputValue(apiS);
      setEndEdit(fixed);
      onEndTimeChange(apiS);
      endSyncedToStartPending.current = false;
    } else if (endSyncedToStartPending.current && apiS != null) {
      onEndTimeChange(apiS);
      endSyncedToStartPending.current = false;
    } else if (apiS !== null) {
      endSyncedToStartPending.current = false;
    }
  };
  const blurEndTime = () => {
    let apiE = timePickerValueToApi(endEdit);
    const apiS = timePickerValueToApi(startEdit);
    if (apiE != null && apiS != null) {
      const ts = timeApiToSecondsOfDay(apiS)!;
      const teOrig = timeApiToSecondsOfDay(apiE)!;
      if (teOrig < ts) {
        apiE = apiS;
        setEndEdit(apiTimeToTimeInputValue(apiS));
      }
    }
    onEndTimeChange(apiE);
    endSyncedToStartPending.current = false;
  };

  const timeInputSx = {
    ...inputSx(),
    fontVariantNumeric: 'tabular-nums' as const,
    '&::-webkit-calendar-picker-indicator': {
      cursor: 'pointer',
      opacity: 0.72,
      filter: 'grayscale(0.2)',
    },
  };

  return (
    <Box
      sx={{
        zoom: RECEIVING_LAYOUT_SCALE,
        fontFamily: TOKENS.fontSans,
        bgcolor: TOKENS.pageBg,
        minHeight: '100vh',
        color: TOKENS.text,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {loadingBar != null ? (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 4,
            pointerEvents: 'none',
            '& .MuiLinearProgress-root': { height: 3 },
          }}
          aria-hidden
        >
          {loadingBar}
        </Box>
      ) : null}
      {banners ?? null}

      {/* ── TOP BAR ── */}
      <Box
        sx={{
          bgcolor: TOKENS.chromeSurface,
          borderBottom: `1px solid ${TOKENS.border}`,
          minHeight: TOKENS.topBarH,
          height: TOKENS.topBarH,
          px: `${TOKENS.topBarPadX}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            flex: 1,
            minWidth: 0,
          }}
        >
          <Button
            type="button"
            onClick={onBackToList}
            sx={{ minWidth: 0, px: 0.5, color: '#64748b', height: 40, flexShrink: 0 }}
            aria-label="Back to receiving list"
          >
            <ArrowBackIosNewOutlined sx={{ fontSize: 14 }} />
          </Button>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <LocalShippingOutlined sx={{ fontSize: 18, color: '#64748b' }} />
            <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Receiving</Typography>
          </Box>

          <Box
            ref={pickerAnchor}
            sx={{
              position: 'relative',
              flexShrink: 0,
              width: 'clamp(260px, 34vw, 520px)',
              minWidth: 0,
              maxWidth: '100%',
            }}
          >
            <Button
              type="button"
              variant="text"
              onClick={() => setPickerOpen((o) => !o)}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 1,
                py: '6px',
                px: '12px',
                minHeight: 40,
                borderRadius: '8px',
                border: `1px solid ${TOKENS.borderInput}`,
                bgcolor: TOKENS.chromeSurface,
                color: TOKENS.text,
                fontFamily: TOKENS.fontSans,
                fontSize: 13,
                fontWeight: 500,
                textTransform: 'none',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  minWidth: 0,
                  flex: 1,
                  overflow: 'hidden',
                }}
              >
                <Typography
                  component="span"
                  sx={{
                    fontFamily: TOKENS.fontMono,
                    fontWeight: 600,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: '2 1 0%',
                  }}
                  title={orderNumberMono}
                >
                  {orderNumberMono}
                </Typography>
                <Typography
                  component="span"
                  sx={{
                    color: TOKENS.muted,
                    flexShrink: 0,
                    maxWidth: '180px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={vendorDisplay}
                >
                  {vendorDisplay}
                </Typography>
              </Box>
              <ExpandMoreIcon sx={{ fontSize: 18, color: TOKENS.muted, flexShrink: 0 }} />
            </Button>

            {pickerOpen ? (
              <Box
                sx={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  bgcolor: TOKENS.chromeSurface,
                  borderRadius: '10px',
                  border: `1px solid ${TOKENS.borderInput}`,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.08)',
                  zIndex: 50,
                  width: 'min(calc(100vw - 48px), 560px)',
                  maxWidth: 560,
                  overflow: 'hidden',
                }}
              >
                {eligibleOrders.map((row) => (
                  <Button
                    type="button"
                    key={row.id}
                    fullWidth
                    onClick={() => {
                      setPickerOpen(false);
                      if (row.id !== m.purchase_order_id) onPickOrder(row.id);
                    }}
                    sx={{
                      justifyContent: 'flex-start',
                      py: '12px',
                      px: '14px',
                      borderBottom: `1px solid ${rcvBorder.hairline}`,
                      borderRadius: 0,
                      bgcolor: row.id === m.purchase_order_id ? 'rgba(46,125,50,0.08)' : TOKENS.chromeSurface,
                      textAlign: 'left',
                      fontFamily: TOKENS.fontSans,
                      textTransform: 'none',
                    }}
                  >
                    <OrderPickerOptionRow
                      orderNumber={row.order_number}
                      description={row.description}
                      vendorCode={row.vendor_code}
                      monoFontFamily={TOKENS.fontMono}
                      mutedColor={TOKENS.muted}
                      badge={orderPickerReceivingBadgeColors({
                        status: row.status,
                        receiving_status: row.receiving_status,
                        shipped_date: row.shipped_date,
                      })}
                      dates={{
                        delivered_date: row.delivered_date,
                        shipped_date: row.shipped_date,
                        paid_date: row.paid_date,
                        ordered_date: row.ordered_date,
                      }}
                    />
                  </Button>
                ))}
              </Box>
            ) : null}
          </Box>
          {descriptionLine ? (
            <Typography
              sx={{
                ml: 0.5,
                flex: 1,
                minWidth: 0,
                display: { xs: 'none', md: 'block' },
                fontSize: 11,
                color: TOKENS.muted,
                fontWeight: 400,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={descriptionLine}
            >
              {descriptionLine}
            </Typography>
          ) : null}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {palletsPlanned ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 13 }}>
              <Typography component="span" sx={{ color: '#64748b' }}>
                <Typography component="strong" sx={{ color: TOKENS.text, fontWeight: 700 }}>
                  {completedPallets}
                </Typography>
                /{m.received_pallet_count} pallets
              </Typography>
              <Typography component="span" sx={{ color: '#64748b' }}>
                <Typography component="strong" sx={{ color: TOKENS.text, fontWeight: 700 }}>
                  {totalPhotos}
                </Typography>{' '}
                photos
              </Typography>
              {damagedCount > 0 ? (
                <Typography sx={{ color: '#ef4444', fontWeight: 600 }}>
                  {damagedCount} damaged
                </Typography>
              ) : null}
            </Box>
          ) : null}
          <Button
            type="button"
            onClick={onRequestComplete}
            disabled={!canOpenComplete}
            sx={{
              px: '22px',
              py: '9px',
              minHeight: 40,
              borderRadius: '8px',
              border: 'none',
              bgcolor: canOpenComplete ? RCV_BRAND : rcvBorder.input,
              color: canOpenComplete ? 'white' : TOKENS.muted,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: TOKENS.fontSans,
              textTransform: 'none',
              cursor: canOpenComplete ? 'pointer' : 'default',
              ...(canOpenComplete
                ? {
                    '&:hover': { bgcolor: RCV_PRIMARY_DARK },
                  }
                : {}),
              '&.Mui-disabled': {
                bgcolor: '#e8efe9',
                color: '#9ca89a',
              },
            }}
          >
            Complete Receiving
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* LEFT */}
        <Box
          sx={{
            width: TOKENS.leftPanelWidth,
            flexShrink: 0,
            borderRight: `1px solid ${TOKENS.border}`,
            bgcolor: TOKENS.panelSurface,
            overflowY: 'auto',
            p: `${TOKENS.leftPanelPad}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: `${TOKENS.sectionGapPx}px`,
          }}
        >
          {/* DATE & TIME */}
          <Box>
            <Typography sx={panelLabelSx()}>Date &amp; Time</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Box>
                <Typography component="label" sx={fieldLabelSx()}>
                  Received Date
                </Typography>
                <Box
                  component="input"
                  type="date"
                  value={m.received_date ?? ''}
                  disabled={!!m.completed_at || disabled}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    onReceivedDateChange(e.target.value || null)
                  }
                  sx={inputSx()}
                />
              </Box>
              <Box sx={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <Box sx={{ flex: '1 1 min(140px, 48%)', minWidth: 0 }}>
                  <Typography component="label" sx={fieldLabelSx()}>
                    Start
                  </Typography>
                  <Box
                    component="input"
                    type="time"
                    step={60}
                    disabled={!!m.completed_at || disabled}
                    aria-label="Session start time"
                    title="Start time — adjust if needed"
                    value={startEdit}
                    onChange={(e) => {
                      const next = e.target.value;
                      setStartEdit(next);
                      const apiS = timePickerValueToApi(next);
                      const apiE = timePickerValueToApi(endEdit);
                      if (apiS !== null && apiE !== null) {
                        const ts = timeApiToSecondsOfDay(apiS)!;
                        const te = timeApiToSecondsOfDay(apiE)!;
                        if (te < ts) {
                          setEndEdit(apiTimeToTimeInputValue(apiS));
                          endSyncedToStartPending.current = true;
                        }
                      }
                    }}
                    onBlur={blurStartTime}
                    sx={timeInputSx}
                  />
                </Box>
                <Box sx={{ flex: '1 1 min(140px, 48%)', minWidth: 0 }}>
                  <Typography component="label" sx={fieldLabelSx()}>
                    End
                  </Typography>
                  <Box
                    component="input"
                    type="time"
                    step={60}
                    disabled={!!m.completed_at || disabled}
                    aria-label="Session end time"
                    title="End time — fills when unloading ends or receiving completes"
                    value={endEdit}
                    onChange={(e) => {
                      const next = e.target.value;
                      let apiEn = timePickerValueToApi(next);
                      const apiS = timePickerValueToApi(startEdit);
                      if (
                        apiS !== null &&
                        apiEn !== null &&
                        timeApiToSecondsOfDay(apiEn)! < timeApiToSecondsOfDay(apiS)!
                      ) {
                        setEndEdit(apiTimeToTimeInputValue(apiS));
                      } else {
                        setEndEdit(next);
                      }
                    }}
                    onBlur={blurEndTime}
                    sx={timeInputSx}
                  />
                </Box>
              </Box>
              {timeSessionHint ? (
                <Typography sx={{ fontSize: 10.5, color: TOKENS.muted, fontWeight: 500 }}>
                  Duration {timeSessionHint.readable}
                  {timeSessionHint.totalMinRounded > 0 ? (
                    <Box
                      component="span"
                      sx={{ color: '#cbd5e1', ml: 0.75, fontStyle: 'italic', fontWeight: 400 }}
                    >
                      · {timeSessionHint.totalMinRounded} minutes total
                    </Box>
                  ) : null}
                </Typography>
              ) : (
                <Typography sx={{ fontSize: 10.5, color: '#cbd5e1', fontStyle: 'italic', fontWeight: 400 }}>
                  Set both times to see elapsed duration.
                </Typography>
              )}
            </Box>
          </Box>

          {/* BOL */}
          <Box>
            <Typography sx={panelLabelSx()}>Bill of Lading</Typography>
            <Box sx={{ height: TOKENS.bolTruckH }}>
              {hasBol(m) && bol ? (
                <Box sx={{ height: '100%', position: 'relative', borderRadius: '10px', overflow: 'hidden' }}>
                  <ThumbBolTruck
                    url={bolThumbUrl}
                    name={bol.s3_file?.filename ?? 'BOL'}
                    alt="Bill of Lading"
                    onOpen={() => openAttachment(bol, 'Bill of Lading')}
                  />
                  {!m.completed_at && !(disabled ?? false) ? (
                    <Box
                      component="label"
                      sx={{
                        position: 'absolute',
                        right: 8,
                        bottom: 8,
                        px: 1,
                        py: 0.35,
                        borderRadius: '6px',
                        bgcolor: 'rgba(15,23,42,0.75)',
                        color: 'white',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        zIndex: 1,
                      }}
                    >
                      Replace
                      <Box
                        component="input"
                        type="file"
                        accept="image/*"
                        sx={{ display: 'none' }}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          void onBolTruckPick('bol', e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </Box>
                  ) : null}
                </Box>
              ) : (
                <DropZoneBox
                  small={false}
                  hasContent={false}
                  label="Drop BOL photo"
                  onDropFiles={handleBolDrop}
                />
              )}
            </Box>
          </Box>

          {/* TRUCK */}
          <Box>
            <Typography sx={panelLabelSx()}>Truck Photo</Typography>
            <Box sx={{ height: TOKENS.bolTruckH }}>
              {hasTruck(m) && truck ? (
                <Box sx={{ height: '100%', position: 'relative', borderRadius: '10px', overflow: 'hidden' }}>
                  <ThumbBolTruck
                    url={truckThumbUrl}
                    name={truck.s3_file?.filename ?? 'Truck'}
                    alt="Truck photo"
                    onOpen={() => openAttachment(truck, 'Truck photo')}
                  />
                  {!m.completed_at && !(disabled ?? false) ? (
                    <Box
                      component="label"
                      sx={{
                        position: 'absolute',
                        right: 8,
                        bottom: 8,
                        px: 1,
                        py: 0.35,
                        borderRadius: '6px',
                        bgcolor: 'rgba(15,23,42,0.75)',
                        color: 'white',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        zIndex: 1,
                      }}
                    >
                      Replace
                      <Box
                        component="input"
                        type="file"
                        accept="image/*"
                        sx={{ display: 'none' }}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          void onBolTruckPick('truck', e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </Box>
                  ) : null}
                </Box>
              ) : (
                <DropZoneBox
                  hasContent={false}
                  label="Drop truck photo"
                  onDropFiles={handleTruckDrop}
                />
              )}
            </Box>
          </Box>

          {/* PALLET COUNT */}
          <Box>
            <Typography sx={panelLabelSx()}>Pallet Count</Typography>
            <Box sx={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
              <Box
                component="input"
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={palletDraft}
                onChange={(e) => setPalletDraft(e.target.value)}
                placeholder="0"
                disabled={!!m.completed_at || disabled}
                onFocus={selectInputContentsOnFocus}
                onWheel={preventWheelChangeNumber}
                sx={{
                  ...inputSx(),
                  flex: 1,
                  fontFamily: TOKENS.fontMono,
                  fontSize: 16,
                  fontWeight: 700,
                  minHeight: 40,
                }}
              />
              <Button
                type="button"
                onClick={() => {
                  const n = Number.parseInt(palletDraft, 10);
                  if (Number.isFinite(n) && n >= 1 && n <= 99) onPalletSet(n);
                }}
                disabled={!!m.completed_at || disabled}
                sx={{
                  px: '18px',
                  minHeight: 40,
                  borderRadius: '8px',
                  border: 'none',
                  bgcolor:
                    palletDraft.trim() && Number.parseInt(palletDraft, 10) > 0
                      ? RCV_BRAND
                      : rcvBorder.input,
                  color:
                    palletDraft.trim() && Number.parseInt(palletDraft, 10) > 0 ? 'white' : TOKENS.muted,
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'none',
                  fontFamily: TOKENS.fontSans,
                  ...(palletDraft.trim() &&
                  Number.parseInt(palletDraft, 10) > 0 &&
                  !Number.isNaN(Number.parseInt(palletDraft, 10))
                    ? {
                        '&:hover': { bgcolor: RCV_PRIMARY_DARK },
                      }
                    : {}),
                }}
              >
                Set
              </Button>
            </Box>
          </Box>

          {/* CONDITION */}
          <Box>
            <Typography sx={panelLabelSx()}>Condition</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {COND_BTN.map(({ api, label, emoji }) => {
                const cc = rcvCondition[api];
                const active = condTrim === api;
                return (
                  <Button
                    key={api}
                    type="button"
                    disabled={!!m.completed_at || disabled}
                    onClick={() => onConditionChange(api)}
                    sx={{
                      flex: 1,
                      py: '14px',
                      px: 0.75,
                      borderRadius: '10px',
                      border: `2px solid ${active ? cc.border : rcvBorder.panelHairline}`,
                      bgcolor: active ? cc.bg : '#ffffff',
                      color: active ? cc.text : TOKENS.muted,
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: 'none',
                      minWidth: 0,
                      transition: 'all 150ms ease',
                    }}
                  >
                    <Box>
                      <Typography sx={{ fontSize: 18, lineHeight: 1 }}>{emoji}</Typography>
                      {label}
                    </Box>
                  </Button>
                );
              })}
            </Box>
          </Box>

          {/* ISSUES */}
          <Box>
            <Typography sx={panelLabelSx()}>Issues / Notes</Typography>
            <Box
              component="textarea"
              value={issuesDraft}
              disabled={!!m.completed_at || disabled}
              onChange={(e) => onIssuesDraftChange(e.target.value)}
              onBlur={onIssuesBlur}
              placeholder="Damage details, missing items..."
              rows={4}
              sx={{
                ...inputSx(),
                resize: 'none',
                height: 'auto',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            />
          </Box>
        </Box>

        {/* RIGHT */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {!palletsPlanned ? (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 1.5,
                color: TOKENS.muted,
              }}
            >
              <LocalShippingOutlined sx={{ fontSize: 48, strokeWidth: 0.75, color: rcvBorder.sageMuted }} />
              <Typography sx={{ fontSize: 16, fontWeight: 600, color: rcvText.fieldLabel }}>
                No pallets set up
              </Typography>
              <Typography sx={{ fontSize: 13 }}>
                Select an order and set the pallet count to begin
              </Typography>
            </Box>
          ) : (
            <>
              {/* Quick Fill — only when pallets exist */}
              {!m.completed_at ? (
                <Box
                  onDragOver={(e) => {
                    e.preventDefault();
                    setBulkOver(true);
                  }}
                  onDragLeave={() => setBulkOver(false)}
                  onDrop={handleBulkDrop}
                  onClick={quickFillClickPick}
                  sx={{
                    m: `18px ${TOKENS.rightPadX}px 8px`,
                    p: bulkOver ? '26px 24px' : '14px 24px',
                    borderRadius: '12px',
                    border: `2px dashed ${
                      bulkOver ? rcvBorder.sageDashStrong : rcvBorder.sageMuted
                    }`,
                    background: bulkOver
                      ? `linear-gradient(135deg, rgba(46,125,50,0.16) 0%, rgba(230,246,231,1) 55%, rgba(222,239,223,1) 100%)`
                      : rcvAccents.quickFillGradient,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1.25,
                    cursor: disabled ? 'default' : 'pointer',
                    transition: 'all 200ms ease',
                  }}
                >
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: '8px',
                      bgcolor: bulkOver ? rcvAccents.quickFillIconBg : rcvSurface.well,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <BoltIcon
                      sx={{
                        fontSize: 18,
                        color: bulkOver ? RCV_BRAND : rcvText.muted,
                      }}
                    />
                  </Box>
                  <Box>
                    <Typography
                      sx={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: bulkOver ? RCV_BRAND : TOKENS.text,
                      }}
                    >
                      Quick Fill: Drop all pallet photos here
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: TOKENS.muted }}>
                      Photos auto-assign sequentially: Pallet 1 (F, R, B, L), Pallet 2 (F, R, B, L), ...
                    </Typography>
                  </Box>
                </Box>
              ) : null}

              <Box
                sx={{
                  flex: 1,
                  px: `${TOKENS.rightPadX}px`,
                  pt: `${TOKENS.rightPadTopPx}px`,
                  pb: `${TOKENS.rightPadBottomPx}px`,
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fill, minmax(min(${TOKENS.palletGridMin}px, 100%), 1fr))`,
                  gap: `${TOKENS.palletGridGap}px`,
                  alignContent: 'start',
                }}
              >
                {Array.from({ length: m.received_pallet_count }, (_, i) => i + 1).map((palletNumber) => {
                  const palletDbId =
                    m.pallets.find((p) => p.pallet_number === palletNumber)?.id ?? null;
                  return (
                  <PalletCard
                    key={palletNumber}
                    palletNumber={palletNumber}
                    palletDbId={palletDbId}
                    rec={m}
                    uploadingKey={uploadingKey}
                    disabled={!!m.completed_at || disabled}
                    onPhotoAdd={(side, files) =>
                      void onPalletPick(palletNumber, side, files ?? null)
                    }
                    onViewPhoto={openAttachment}
                    onToggleDamage={() =>
                      onDamaged(
                        palletNumber,
                        !(m.pallets.find((p) => p.pallet_number === palletNumber)?.damaged ?? false),
                      )
                    }
                    onOpenIntakeDispute={() =>
                      onOpenIntakeDisputeForPallet?.(palletNumber, palletDbId)
                    }
                  />
                );
                })}
              </Box>
            </>
          )}
        </Box>
      </Box>

      <ImageViewerDialog
        open={viewer != null}
        onClose={closeViewer}
        src={viewer?.src ?? null}
        alt={viewer?.alt ?? 'Photo'}
        title={viewer?.title}
        filename={viewer?.filename}
        canEdit={!disabled && !m.completed_at}
        hasPrev={viewerIndex > 0}
        hasNext={viewerIndex >= 0 && viewerIndex < photoGallery.length - 1}
        positionLabel={
          viewerIndex >= 0 && photoGallery.length > 0
            ? `${viewerIndex + 1} / ${photoGallery.length}`
            : null
        }
        onPrev={photoGallery.length > 1 ? () => goGalleryDelta(-1) : undefined}
        onNext={photoGallery.length > 1 ? () => goGalleryDelta(1) : undefined}
        onDownload={
          viewer
            ? async () => {
                const { data } = await downloadReceivingPhoto(orderId, viewer.attachmentId);
                downloadBlob(data, viewer.filename || 'photo.jpg');
              }
            : undefined
        }
        onSaveEdited={
          viewer && !disabled && !m.completed_at
            ? async (blob) => {
                await applyReplacedPhoto(blob, {
                  success: 'Photo saved',
                  failure: 'Could not save edited photo',
                });
              }
            : undefined
        }
        onReplaceFile={
          viewer && !disabled && !m.completed_at
            ? async (file) => {
                const blob = await compressImageToJpeg(file);
                await applyReplacedPhoto(blob, {
                  success: 'Photo replaced',
                  failure: 'Could not replace photo',
                });
              }
            : undefined
        }
      />
    </Box>
  );
}
