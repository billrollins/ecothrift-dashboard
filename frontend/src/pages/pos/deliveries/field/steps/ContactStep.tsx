import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import LocalPhoneRounded from '@mui/icons-material/LocalPhoneRounded';
import SmsRounded from '@mui/icons-material/SmsRounded';
import { useSnackbar } from 'notistack';
import type { DeliveryDayDetail, DeliveryRun, DeliveryRunStop } from '../../../../../types/pos.types';
import type { useFieldDeliveryRunMutations } from '../../../../../hooks/useFieldDeliveryRun';
import { interpolateTemplateTokens } from '../../../../../components/pos/delivery/driverWizardUtils';
import {
  DISPOSITION_LABELS,
  hasPhoneDigits,
  smsComposerUrl,
  telHref,
} from '../fieldRunUtils';
import {
  clampSelectedStopId,
  contactStopTone,
  contactWorkComplete,
  defaultSelectedStopId,
  hasContactOutcome,
  nextPendingStopId,
  stopDisplayName,
  stopsForUiStep,
} from '../fieldStepUtils';
import { resolveStepCompletionControl, resolveStepSurface } from '../fieldStepSurface';
import { FieldDeliveryPager } from '../components/FieldDeliveryPager';
import { FieldDeliveryCardFrame } from '../components/FieldDeliveryCardFrame';
import { FieldDeliveryDetailsSheet } from '../components/FieldDeliveryDetailsSheet';
import { FieldStopSummaryRow } from '../components/FieldStopSummaryRow';
import { FieldStepSummaryShell } from '../components/FieldStepSummaryShell';
import { FieldSheet } from '../components/FieldSheet';
import {
  ecoField,
  ecoFieldActionTileSx,
  ecoFieldPrimaryButtonSx,
  ecoFieldSecondaryOutlineSx,
  frameToneFromDotTone,
} from '../ecoFieldTheme';

type Mutations = ReturnType<typeof useFieldDeliveryRunMutations>;

type Props = {
  day: DeliveryDayDetail;
  run: DeliveryRun;
  mutations: Mutations;
  busy: boolean;
  canManage?: boolean;
  onContinueLoad: () => void;
};

function dispositionLabel(stop: DeliveryRunStop): string {
  if (!stop.contact_disposition) return 'Not contacted';
  return DISPOSITION_LABELS[stop.contact_disposition] || stop.contact_disposition;
}

export function ContactStep({ day, run, mutations, busy, canManage, onContinueLoad }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const stops = useMemo(() => stopsForUiStep(run, 'contact'), [run]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [focusReschedule, setFocusReschedule] = useState(false);
  const [outcomeStop, setOutcomeStop] = useState<DeliveryRunStop | null>(null);
  const [editing, setEditing] = useState(false);
  const awaitingReturn = useRef(false);
  const workComplete = contactWorkComplete(stops);
  const surface = resolveStepSurface({ workComplete, editing });

  useEffect(() => {
    setSelectedId((prev) =>
      clampSelectedStopId(stops, prev, defaultSelectedStopId(run, 'contact')),
    );
  }, [stops, run]);

  // Leaving work mode (all outcomes recorded) drops edit mode so summary shows.
  useEffect(() => {
    if (!workComplete) setEditing(false);
  }, [workComplete]);

  const stop = stops.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    const onFocus = () => {
      if (awaitingReturn.current && stop && !hasContactOutcome(stop)) {
        setOutcomeStop(stop);
        awaitingReturn.current = false;
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [stop]);

  const record = async (channel: 'call' | 'text', action: string) => {
    if (!stop) return;
    try {
      await mutations.contactAttempt.mutateAsync({ stopId: stop.id, channel, action });
    } catch {
      enqueueSnackbar('Could not record contact attempt', { variant: 'error' });
    }
  };

  const openOutcome = (s: DeliveryRunStop) => {
    setSelectedId(s.id);
    setOutcomeStop(s);
  };

  const openEdit = (s: DeliveryRunStop) => {
    setSelectedId(s.id);
    setEditing(true);
  };

  const chooseDisposition = async (value: string) => {
    const target = outcomeStop ?? stop;
    if (!target) return;
    try {
      await mutations.disposition.mutateAsync({ stopId: target.id, disposition: value });
      setOutcomeStop(null);
      if (value === 'reschedule_requested') {
        setSelectedId(target.id);
        setFocusReschedule(true);
        setDetailsOpen(true);
        return;
      }
      if (!contactWorkComplete(stops)) {
        const nextId = nextPendingStopId(stops, target.id, hasContactOutcome);
        if (nextId) setSelectedId(nextId);
      }
    } catch {
      enqueueSnackbar('Could not save outcome', { variant: 'error' });
    }
  };

  const firstName = stop ? stopDisplayName(stop).split(' ')[0] : '';
  const template = stop?.text_templates?.[0];
  const etaLabel = stop?.eta_arrive_at
    ? new Date(stop.eta_arrive_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';
  const smsBody = template
    ? interpolateTemplateTokens(template.body, {
        name: stop?.customer_name || '',
        date: run.date,
        eta: etaLabel || undefined,
      })
    : `Hi ${firstName}! Eco-Thrift here — confirming your delivery today. Reply YES to confirm.`;

  const outcomeSheet = (
    <FieldSheet
      open={Boolean(outcomeStop)}
      onClose={() => setOutcomeStop(null)}
      eyebrow="Contact outcome"
      title={
        outcomeStop
          ? `${hasContactOutcome(outcomeStop) ? 'Change outcome for' : 'What happened with'} ${stopDisplayName(outcomeStop).split(' ')[0]}${hasContactOutcome(outcomeStop) ? '' : '?'}`
          : 'Contact outcome'
      }
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        {(run.contact_dispositions ?? []).map((option, index) => (
          <Button
            key={option.value}
            variant={outcomeStop?.contact_disposition === option.value ? 'contained' : 'outlined'}
            disabled={busy}
            onClick={() => void chooseDisposition(option.value)}
            sx={
              outcomeStop?.contact_disposition === option.value
                ? {
                    ...ecoFieldPrimaryButtonSx,
                    borderWidth: 1.5,
                    minHeight: 68,
                    borderRadius: 2,
                    fontWeight: 800,
                    gridColumn: index === 0 ? '1 / -1' : undefined,
                  }
                : {
                    minHeight: 68,
                    borderRadius: 2,
                    borderWidth: 1.5,
                    fontWeight: 800,
                    ...(index === 0
                      ? {
                          gridColumn: '1 / -1',
                          borderColor: ecoField.green,
                          bgcolor: ecoField.tint,
                          color: ecoField.greenDeep,
                        }
                      : {}),
                  }
            }
          >
            {option.label || DISPOSITION_LABELS[option.value] || option.value}
          </Button>
        ))}
      </Box>
    </FieldSheet>
  );

  const actionPager = stop ? (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <FieldDeliveryPager
        stops={stops}
        selectedId={selectedId}
        toneFor={contactStopTone}
        onSelect={setSelectedId}
        disabled={busy}
      >
        <FieldDeliveryCardFrame
          stop={stop}
          statusLabel={dispositionLabel(stop)}
          statusTone={frameToneFromDotTone(contactStopTone(stop))}
          stepAccent="contact"
          onOpenDetails={() => {
            setFocusReschedule(false);
            setDetailsOpen(true);
          }}
          onOpenItems={() => setItemsOpen(true)}
        >
          <Stack direction="row" spacing={1.25}>
            {hasPhoneDigits(stop.phone) ? (
              <Button
                fullWidth
                component="a"
                href={telHref(stop.phone)}
                onClick={() => {
                  awaitingReturn.current = true;
                  void record('call', 'call_placed');
                }}
                sx={ecoFieldActionTileSx}
              >
                <LocalPhoneRounded sx={{ fontSize: 28 }} />
                Call
              </Button>
            ) : (
              <Button fullWidth disabled sx={ecoFieldActionTileSx}>
                <LocalPhoneRounded sx={{ fontSize: 28 }} />
                No phone
              </Button>
            )}
            {hasPhoneDigits(stop.phone) ? (
              <Button
                fullWidth
                component="a"
                href={smsComposerUrl(stop.phone, smsBody)}
                onClick={() => {
                  awaitingReturn.current = true;
                  void record('text', 'composer_opened');
                }}
                sx={ecoFieldActionTileSx}
              >
                <SmsRounded sx={{ fontSize: 28 }} />
                Text
              </Button>
            ) : (
              <Button fullWidth disabled sx={ecoFieldActionTileSx}>
                <SmsRounded sx={{ fontSize: 28 }} />
                No phone
              </Button>
            )}
          </Stack>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => openOutcome(stop)}
            sx={{ ...ecoFieldSecondaryOutlineSx, mt: 1.25, minHeight: 48 }}
          >
            {hasContactOutcome(stop) ? 'Change outcome' : 'Record outcome'}
          </Button>
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
      {outcomeSheet}
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
        focusReschedule={focusReschedule}
      />
    </Stack>
  ) : null;

  if (!stops.length) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" fontWeight={800}>
          No deliveries to contact
        </Typography>
      </Box>
    );
  }

  if (surface === 'summary') {
    const confirmed = stops.filter((s) => contactStopTone(s) === 'complete');
    const pending = stops.filter((s) => contactStopTone(s) === 'caution');
    const issues = stops.filter((s) => contactStopTone(s) === 'issue');
    const completion = resolveStepCompletionControl({
      step: 'contact',
      run,
      workComplete,
      editing,
    });
    return (
      <>
        <FieldStepSummaryShell
          header={`${confirmed.length} confirmed · ${pending.length} pending · ${issues.length} not today`}
          completion={completion}
          onCompletionAction={() => {
            if (completion.mode === 'reopen') {
              setEditing(true);
              return;
            }
            onContinueLoad();
          }}
          primaryDisabled={busy}
          primaryBusy={busy}
        >
          <Stack spacing={1}>
            {stops.map((s) => {
              const tone = contactStopTone(s);
              return (
                <FieldStopSummaryRow
                  key={s.id}
                  stop={s}
                  tone={tone}
                  subtitle={s.address}
                  statusLabel={dispositionLabel(s)}
                  complete={tone === 'complete'}
                  onActivate={() => openEdit(s)}
                  onStatusClick={() => openOutcome(s)}
                  disabled={busy}
                />
              );
            })}
          </Stack>
        </FieldStepSummaryShell>
        {outcomeSheet}
        <FieldDeliveryDetailsSheet
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          day={day}
          stop={stops.find((s) => s.id === selectedId) ?? stop}
          canManage={canManage}
          focusReschedule={focusReschedule}
        />
      </>
    );
  }

  return actionPager;
}
