import { useEffect, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Divider, Stack, Typography } from '@mui/material';
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined';
import GestureRounded from '@mui/icons-material/GestureRounded';
import LocalPhoneRounded from '@mui/icons-material/LocalPhoneRounded';
import NavigationRounded from '@mui/icons-material/NavigationRounded';
import SmsRounded from '@mui/icons-material/SmsRounded';
import { useSnackbar } from 'notistack';
import type {
  DeliveryAttachment,
  DeliveryDayDetail,
  DeliveryRun,
} from '../../../../../types/pos.types';
import type { useFieldDeliveryRunMutations } from '../../../../../hooks/useFieldDeliveryRun';
import type { useFieldPhotoUpload } from '../useFieldPhotoUpload';
import { SignaturePad } from '../../../../../components/pos/delivery/SignaturePad';
import {
  deliverySmsTemplates,
  hasPhoneDigits,
  mapsNavigateUrl,
  smsComposerUrl,
  telHref,
} from '../fieldRunUtils';
import {
  clampSelectedStopId,
  compactStopItemSummary,
  defaultSelectedStopId,
  deliveryStopTone,
  nextPendingStopId,
  stopDisplayName,
  stopItemCountLabel,
  stopsForUiStep,
} from '../fieldStepUtils';
import { resolveStepCompletionControl, resolveStepSurface } from '../fieldStepSurface';
import { finalActionThenAdvance } from '../finalActionAdvance';
import { FieldDeliveryPager } from '../components/FieldDeliveryPager';
import { FieldDeliveryCardFrame } from '../components/FieldDeliveryCardFrame';
import { FieldDeliveryDetailsSheet } from '../components/FieldDeliveryDetailsSheet';
import { FieldHoldToComplete } from '../components/FieldHoldToComplete';
import { FieldStopSummaryRow } from '../components/FieldStopSummaryRow';
import { FieldStepSummaryShell } from '../components/FieldStepSummaryShell';
import { FieldSheet } from '../components/FieldSheet';
import { ImageViewerDialog } from '../../../../../components/common/ImageViewerDialog';
import { ecoField, ecoFieldPrimaryButtonSx, ecoFieldSecondaryOutlineSx } from '../ecoFieldTheme';

type Mutations = ReturnType<typeof useFieldDeliveryRunMutations>;
type Photo = ReturnType<typeof useFieldPhotoUpload>;

type Props = {
  day: DeliveryDayDetail;
  run: DeliveryRun;
  mutations: Mutations;
  photo: Photo;
  busy: boolean;
  canManage?: boolean;
  onContinueFinish: () => void;
};

function newestAttachment(
  attachments: DeliveryAttachment[] | undefined,
  kind: DeliveryAttachment['kind'],
): DeliveryAttachment | null {
  const list = (attachments ?? []).filter((a) => a.kind === kind);
  return list.length ? list[list.length - 1] : null;
}

type EvidenceButtonProps = {
  label: string;
  done: boolean;
  uploading?: boolean;
  thumbUrl?: string | null;
  fallbackIcon: React.ReactNode;
  onActivate: () => void;
  onViewThumb?: () => void;
};

function EvidenceButton({
  label,
  done,
  uploading,
  thumbUrl,
  fallbackIcon,
  onActivate,
  onViewThumb,
}: EvidenceButtonProps) {
  const leading = uploading ? (
    <CircularProgress size={20} sx={{ color: ecoField.greenDeep }} />
  ) : thumbUrl ? (
    <Box
      component="img"
      src={thumbUrl}
      alt=""
      onClick={(e) => {
        e.stopPropagation();
        onViewThumb?.();
      }}
      sx={{
        width: 40,
        height: 40,
        borderRadius: 1.25,
        objectFit: 'cover',
        border: `1px solid ${ecoField.line}`,
        flexShrink: 0,
        cursor: onViewThumb ? 'zoom-in' : 'inherit',
      }}
    />
  ) : (
    fallbackIcon
  );

  return (
    <Button
      variant="outlined"
      onClick={onActivate}
      startIcon={
        <Box
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: 40,
            height: 40,
            mr: 0.25,
            '& .MuiSvgIcon-root': { fontSize: 22 },
          }}
        >
          {leading}
        </Box>
      }
      sx={{
        minHeight: 56,
        borderRadius: 2,
        justifyContent: 'flex-start',
        fontWeight: 750,
        bgcolor: done ? ecoField.tint : '#fff',
        '& .MuiButton-startIcon': { m: 0, mr: 1 },
      }}
    >
      {label}
    </Button>
  );
}

export function DeliveriesStep({
  day,
  run,
  mutations,
  photo,
  busy,
  canManage,
  onContinueFinish,
}: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const stops = useMemo(() => stopsForUiStep(run, 'deliveries'), [run]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setSelectedId((prev) =>
      clampSelectedStopId(stops, prev, defaultSelectedStopId(run, 'deliveries')),
    );
  }, [stops, run]);

  const stop = stops.find((s) => s.id === selectedId) ?? null;
  const pendingLeft = stops.filter((s) => deliveryStopTone(s) === 'pending').length;
  const workComplete = !stops.length || pendingLeft === 0;
  const surface = resolveStepSurface({ workComplete, editing });

  useEffect(() => {
    if (!workComplete) setEditing(false);
  }, [workComplete]);

  if (surface === 'summary') {
    const delivered = stops.filter((s) => deliveryStopTone(s) === 'complete');
    const held = stops.filter((s) => deliveryStopTone(s) === 'issue');
    const completion = resolveStepCompletionControl({
      step: 'deliveries',
      run,
      workComplete,
      editing,
    });
    return (
      <FieldStepSummaryShell
        header={`${delivered.length} delivered · ${held.length} held`}
        completion={completion}
        onCompletionAction={() => {
          if (completion.mode === 'reopen') {
            setEditing(true);
            return;
          }
          void finalActionThenAdvance(
            () => mutations.returnToStore.mutateAsync(run.id),
            onContinueFinish,
          ).catch(() => enqueueSnackbar('Could not mark returned', { variant: 'error' }));
        }}
        primaryDisabled={busy}
        primaryBusy={busy}
      >
        <Stack spacing={1}>
          {stops.map((s) => {
            const tone = deliveryStopTone(s);
            return (
              <FieldStopSummaryRow
                key={s.id}
                stop={s}
                tone={tone}
                titleMeta={stopItemCountLabel(s)}
                subtitle={
                  tone === 'issue'
                    ? s.hold_reason || 'Held'
                    : compactStopItemSummary(s)
                }
                statusLabel={tone === 'complete' ? 'Delivered' : tone === 'issue' ? 'Held' : 'Pending'}
                complete={tone === 'complete'}
                onActivate={() => {
                  setSelectedId(s.id);
                  setEditing(true);
                }}
                disabled={busy}
              />
            );
          })}
        </Stack>
      </FieldStepSummaryShell>
    );
  }

  if (!stop) return null;

  const arrived = Boolean(stop.contact_present_at);
  const canComplete = Boolean(stop.has_proof_photo && stop.has_signature);
  const queuedKinds = photo.pendingKindsByStop[stop.id] ?? [];
  const proofQueued =
    queuedKinds.includes('delivery_proof') || queuedKinds.includes('signature');
  const holdDisabledLabel = proofQueued
    ? 'Proof uploading — hold to complete when it lands'
    : 'Finish proof first';
  const eta = stop.eta_arrive_at
    ? new Date(stop.eta_arrive_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : 'ETA unavailable';
  const firstName = stopDisplayName(stop).split(' ')[0];
  const smsOptions = deliverySmsTemplates({ firstName, eta, date: run.date });
  const routeIndex = Math.max(0, stops.findIndex((s) => s.id === stop.id));
  const tone = deliveryStopTone(stop);
  const proofAtt = newestAttachment(stop.attachments, 'delivery_proof');
  const signatureAtt = newestAttachment(stop.attachments, 'signature');
  const issueAtt = newestAttachment(stop.attachments, 'issue');

  const saveSignature = async (blob: Blob) => {
    await photo.uploadBlob(blob, 'signature', {
      stopId: stop.id,
      filename: 'signature.png',
    });
    setSignatureOpen(false);
  };

  const completeStop = async () => {
    try {
      await mutations.complete.mutateAsync({ stopId: stop.id });
      const nextId = nextPendingStopId(
        stops,
        stop.id,
        (s) => deliveryStopTone(s) !== 'pending',
      );
      if (nextId) setSelectedId(nextId);
    } catch {
      enqueueSnackbar('Could not complete stop', { variant: 'error' });
    }
  };

  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <FieldDeliveryPager
        stops={stops}
        selectedId={selectedId}
        toneFor={deliveryStopTone}
        onSelect={setSelectedId}
      >
        <FieldDeliveryCardFrame
          stop={stop}
          statusLabel={
            stop.state === 'completed'
              ? 'Delivered'
              : tone === 'issue'
                ? 'Held / issue'
                : arrived
                  ? 'At stop'
                  : `ETA ${eta}`
          }
          statusTone={tone === 'complete' ? 'ok' : tone === 'issue' ? 'bad' : 'warn'}
          onOpenDetails={() => setDetailsOpen(true)}
          onOpenItems={() => setItemsOpen(true)}
        >
          <Typography
            variant="caption"
            fontWeight={800}
            sx={{ color: ecoField.muted, letterSpacing: '.1em', textTransform: 'uppercase' }}
          >
            Stop {routeIndex + 1} of {stops.length}
            {arrived ? ' · You’re here' : ''}
          </Typography>

          {!arrived && stop.state !== 'completed' && tone !== 'issue' && (
            <>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mt: 1 }}>
                <Typography color="text.secondary">Arriving</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 800, color: ecoField.greenDeep }}>
                  {eta}
                </Typography>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, mt: 2 }}>
                <Button
                  component="a"
                  href={mapsNavigateUrl(stop.address)}
                  target="_blank"
                  rel="noreferrer"
                  sx={{
                    minHeight: 70,
                    borderRadius: 2,
                    bgcolor: ecoField.ink,
                    color: '#fff',
                    flexDirection: 'column',
                    fontWeight: 800,
                  }}
                >
                  <NavigationRounded />
                  Navigate
                </Button>
                {hasPhoneDigits(stop.phone) ? (
                  <Button
                    component="a"
                    href={telHref(stop.phone)}
                    sx={{
                      minHeight: 70,
                      borderRadius: 2,
                      border: `1.5px solid ${ecoField.line}`,
                      color: ecoField.ink,
                      flexDirection: 'column',
                      fontWeight: 800,
                    }}
                  >
                    <LocalPhoneRounded />
                    Call
                  </Button>
                ) : (
                  <Button
                    disabled
                    sx={{
                      minHeight: 70,
                      borderRadius: 2,
                      border: `1.5px solid ${ecoField.line}`,
                      color: ecoField.ink,
                      flexDirection: 'column',
                      fontWeight: 800,
                    }}
                  >
                    <LocalPhoneRounded />
                    No phone
                  </Button>
                )}
                <Button
                  disabled={!hasPhoneDigits(stop.phone)}
                  onClick={() => setSmsOpen(true)}
                  sx={{
                    minHeight: 70,
                    borderRadius: 2,
                    border: `1.5px solid ${ecoField.line}`,
                    color: ecoField.ink,
                    flexDirection: 'column',
                    fontWeight: 800,
                  }}
                >
                  <SmsRounded />
                  Text ETA
                </Button>
              </Box>
              <Button
                fullWidth
                variant="contained"
                disabled={busy}
                onClick={() => void mutations.contactPresent.mutateAsync({ stopId: stop.id })}
                sx={{ ...ecoFieldPrimaryButtonSx, mt: 2 }}
              >
                I’ve arrived
              </Button>
            </>
          )}

          {arrived && stop.state !== 'completed' && tone !== 'issue' && (
            <>
              <Stack spacing={1.25} sx={{ mt: 2 }}>
                <EvidenceButton
                  label={stop.has_proof_photo ? 'Replace proof photo' : 'Proof photo at the door'}
                  done={Boolean(stop.has_proof_photo)}
                  uploading={photo.uploading?.kind === 'delivery_proof'}
                  thumbUrl={proofAtt?.url}
                  fallbackIcon={<CameraAltOutlined />}
                  onActivate={() => photo.pickPhoto('delivery_proof', { stopId: stop.id })}
                  onViewThumb={proofAtt ? () => setViewerUrl(proofAtt.url) : undefined}
                />
                <EvidenceButton
                  label={stop.has_signature ? 'Replace signature' : 'Customer signature'}
                  done={Boolean(stop.has_signature)}
                  uploading={photo.uploading?.kind === 'signature'}
                  thumbUrl={signatureAtt?.url}
                  fallbackIcon={<GestureRounded />}
                  onActivate={() => setSignatureOpen(true)}
                  onViewThumb={signatureAtt ? () => setViewerUrl(signatureAtt.url) : undefined}
                />
              </Stack>
              <FieldHoldToComplete
                disabledLabel={holdDisabledLabel}
                disabled={busy || !canComplete}
                onComplete={completeStop}
              />
            </>
          )}

          {stop.state !== 'completed' && (
            <Button
              fullWidth
              onClick={() => setProblemOpen(true)}
              startIcon={
                issueAtt ? (
                  <Box
                    component="img"
                    src={issueAtt.url}
                    alt=""
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewerUrl(issueAtt.url);
                    }}
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: 0.75,
                      objectFit: 'cover',
                      border: `1px solid ${ecoField.line}`,
                    }}
                  />
                ) : undefined
              }
              sx={{
                mt: 0.5,
                minHeight: 44,
                color: ecoField.muted,
                textDecoration: 'underline',
              }}
            >
              Problem at this stop
            </Button>
          )}
        </FieldDeliveryCardFrame>
      </FieldDeliveryPager>

      {surface === 'edit' && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => setEditing(false)}
            sx={{ ...ecoFieldSecondaryOutlineSx, minHeight: 48 }}
          >
            Done editing
          </Button>
        </Box>
      )}

      <FieldSheet
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        eyebrow="Hand the phone to the customer"
        title={`${firstName}, sign below`}
      >
        <SignaturePad onCapture={(blob) => void saveSignature(blob)} disabled={busy} />
      </FieldSheet>

      <FieldSheet open={smsOpen} onClose={() => setSmsOpen(false)} title="Text customer">
        <Stack spacing={1}>
          {smsOptions.map((opt) => (
            <Button
              key={opt.key}
              fullWidth
              variant="outlined"
              component="a"
              href={smsComposerUrl(stop.phone, opt.body)}
              onClick={() => setSmsOpen(false)}
              sx={{ minHeight: 56, borderRadius: 2, fontWeight: 750, justifyContent: 'flex-start' }}
            >
              {opt.label}
            </Button>
          ))}
        </Stack>
      </FieldSheet>

      <ImageViewerDialog
        open={Boolean(viewerUrl)}
        onClose={() => setViewerUrl(null)}
        src={viewerUrl}
        alt="Delivery evidence"
        title="Delivery evidence"
        canEdit={false}
        onReplaceFile={
          stop
            ? (file) =>
                void photo.uploadPhoto(file, 'delivery_proof', { stopId: stop.id }).then(() =>
                  setViewerUrl(null),
                )
            : undefined
        }
      />

      <FieldSheet open={problemOpen} onClose={() => setProblemOpen(false)} title="Problem at this stop?">
        <Stack spacing={1}>
          {[
            { label: 'No one home · hold items', code: 'no_customer', note: 'No one home' },
            { label: 'Won’t fit', code: 'item_issue', note: 'Item will not fit' },
            { label: 'Damaged', code: 'item_issue', note: 'Item damaged at delivery' },
          ].map((issue) => (
            <Button
              key={issue.label}
              fullWidth
              variant="outlined"
              disabled={busy}
              onClick={async () => {
                await mutations.reportIssue.mutateAsync({
                  stopId: stop.id,
                  issue_code: issue.code,
                  note: issue.note,
                  hold: true,
                });
                setProblemOpen(false);
                const nextId = nextPendingStopId(
                  stops,
                  stop.id,
                  (s) => deliveryStopTone(s) === 'pending',
                );
                if (nextId) setSelectedId(nextId);
              }}
              sx={{ minHeight: 58, borderRadius: 2, fontWeight: 800 }}
            >
              {issue.label}
            </Button>
          ))}
          <Divider sx={{ my: 0.5 }} />
          <Button
            fullWidth
            variant="contained"
            startIcon={
              photo.uploading?.kind === 'issue' ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <CameraAltOutlined />
              )
            }
            onClick={() => {
              setProblemOpen(false);
              photo.pickPhoto('issue', { stopId: stop.id });
            }}
            sx={ecoFieldPrimaryButtonSx}
          >
            Capture issue photo
          </Button>
        </Stack>
      </FieldSheet>

      <FieldSheet open={itemsOpen} onClose={() => setItemsOpen(false)} title="Items on this delivery">
        <Stack spacing={1}>
          {(stop.stop_items ?? stop.line_items ?? []).map((item, idx) => (
            <Typography key={`${'id' in item ? item.id : idx}-${item.description}`} fontWeight={700}>
              ×{item.quantity} {item.description}
            </Typography>
          ))}
        </Stack>
      </FieldSheet>

      <FieldDeliveryDetailsSheet
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        day={day}
        stop={stop}
        canManage={canManage}
      />
    </Stack>
  );
}
