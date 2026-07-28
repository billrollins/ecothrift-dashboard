import { useEffect, useMemo, useState } from 'react';
import { Box, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import { useNavigate } from 'react-router-dom';
import type { DeliveryDayDetail, DeliveryRun } from '../../../../types/pos.types';
import { useFieldDeliveryRunMutations } from '../../../../hooks/useFieldDeliveryRun';
import { formatElapsed, liveElapsedSeconds } from './fieldRunUtils';
import {
  FIELD_UI_STEP_LABELS,
  type FieldUiStep,
  isUiStepUnlocked,
  uiStepFromPhase,
} from './fieldStepUtils';
import { useFieldPhotoUpload } from './useFieldPhotoUpload';
import { FieldStepRail } from './components/FieldStepRail';
import { ContactStep } from './steps/ContactStep';
import { LoadStep } from './steps/LoadStep';
import { RoutesStep } from './steps/RoutesStep';
import { DeliveriesStep } from './steps/DeliveriesStep';
import { FinishStep } from './steps/FinishStep';
import { finalActionThenAdvance } from './finalActionAdvance';
import { ecoField, ecoFieldStepAccent, type EcoFieldStepKey } from './ecoFieldTheme';

type Props = {
  day: DeliveryDayDetail;
  run: DeliveryRun;
  canManage?: boolean;
};

function TimerChrome({
  run,
  tick,
  eyebrow,
  stepAccent,
}: {
  run: DeliveryRun;
  tick: number;
  eyebrow: string;
  stepAccent: EcoFieldStepKey;
}) {
  const navigate = useNavigate();
  const accent = ecoFieldStepAccent[stepAccent];
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1.25}
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        px: 2,
        pt: 'calc(12px + env(safe-area-inset-top))',
        pb: 1.25,
        bgcolor: 'rgba(255,255,255,.96)',
        backdropFilter: 'blur(10px)',
        flexShrink: 0,
        borderBottom: `2px solid ${accent.accent}33`,
        boxShadow: `inset 0 -2px 0 ${accent.tint}`,
      }}
    >
      <IconButton
        aria-label="Back to delivery days"
        onClick={() => navigate('/pos/deliveries/field/days')}
        sx={{ border: `1px solid ${ecoField.line}`, width: 42, height: 42 }}
      >
        <ArrowBackRounded />
      </IconButton>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: accent.accent,
              flexShrink: 0,
            }}
          />
          <Typography
            variant="caption"
            fontWeight={800}
            sx={{ color: accent.accent, letterSpacing: '.12em', textTransform: 'uppercase' }}
          >
            {eyebrow}
          </Typography>
        </Stack>
        <Typography variant="body2" fontWeight={800} noWrap>
          Field run
        </Typography>
      </Box>
      {run.status !== 'completed' && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          sx={{
            bgcolor: ecoField.ink,
            color: '#fff',
            borderRadius: 99,
            px: 1.5,
            py: 0.9,
            fontWeight: 800,
          }}
        >
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: ecoField.greenGlow,
              animation: 'ecoFieldPulse 1.6s infinite',
              '@keyframes ecoFieldPulse': {
                '0%,100%': { opacity: 1 },
                '50%': { opacity: 0.35 },
              },
            }}
          />
          <Typography variant="body2" fontWeight={800}>
            {formatElapsed(liveElapsedSeconds(run, tick))}
          </Typography>
        </Stack>
      )}
    </Stack>
  );
}

export function EcoFieldRunShell({ day, run, canManage }: Props) {
  const mutations = useFieldDeliveryRunMutations(day.id);
  const photo = useFieldPhotoUpload(run, mutations);
  const [tick, setTick] = useState(0);
  const serverStep = uiStepFromPhase(run.phase);
  const [uiStep, setUiStep] = useState<FieldUiStep>(serverStep);

  useEffect(() => {
    setUiStep((prev) => {
      if (isUiStepUnlocked(run, prev)) return prev;
      return serverStep;
    });
  }, [run, serverStep]);

  useEffect(() => {
    // Follow server forward when phase advances past the user's review step.
    setUiStep((prev) => {
      const order: FieldUiStep[] = ['contact', 'load', 'routes', 'deliveries', 'finish'];
      if (order.indexOf(serverStep) > order.indexOf(prev)) return serverStep;
      return prev;
    });
  }, [serverStep]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const busy = useMemo(
    () =>
      Object.values(mutations).some(
        (m) => typeof m === 'object' && m != null && 'isPending' in m && Boolean(m.isPending),
      ),
    [mutations],
  );

  const eyebrow = `${FIELD_UI_STEP_LABELS[uiStep]} · ${FIELD_UI_STEP_LABELS[serverStep]} live`;

  const selectStep = (step: FieldUiStep) => {
    if (isUiStepUnlocked(run, step)) setUiStep(step);
  };

  return (
    <Stack
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '100dvh',
        maxHeight: '100dvh',
        zIndex: 30,
        maxWidth: 430,
        mx: 'auto',
        bgcolor: '#fff',
        color: ecoField.ink,
        overflow: 'hidden',
      }}
    >
      <input
        ref={photo.fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          void photo.onFilePicked(file);
        }}
      />
      <TimerChrome run={run} tick={tick} eyebrow={eyebrow} stepAccent={uiStep} />
      {photo.uploading && (
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: ecoField.tint,
            borderBottom: `1px solid ${ecoField.line}`,
          }}
          role="status"
          aria-live="polite"
        >
          <Typography variant="caption" fontWeight={750} sx={{ color: ecoField.greenDeep }}>
            {photo.uploading.label}
          </Typography>
          <LinearProgress
            sx={{
              mt: 0.75,
              height: 6,
              borderRadius: 999,
              bgcolor: 'rgba(14,138,78,.15)',
              '& .MuiLinearProgress-bar': { bgcolor: ecoField.green },
            }}
          />
        </Box>
      )}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {uiStep === 'contact' && (
          <ContactStep
            day={day}
            run={run}
            mutations={mutations}
            busy={busy}
            canManage={canManage}
            onContinueLoad={() => {
              void finalActionThenAdvance(
                () => mutations.setPhase.mutateAsync({ runId: run.id, phase: 'load' }),
                () => setUiStep('load'),
              );
            }}
          />
        )}
        {uiStep === 'load' && (
          <LoadStep
            day={day}
            run={run}
            mutations={mutations}
            photo={photo}
            busy={busy}
            canManage={canManage}
            onContinueRoutes={() => setUiStep('routes')}
          />
        )}
        {uiStep === 'routes' && (
          <RoutesStep
            day={day}
            run={run}
            mutations={mutations}
            busy={busy}
            canManage={canManage}
            onContinueDeliveries={() => setUiStep('deliveries')}
            onGoToLoad={() => setUiStep('load')}
          />
        )}
        {uiStep === 'deliveries' && (
          <DeliveriesStep
            day={day}
            run={run}
            mutations={mutations}
            photo={photo}
            busy={busy}
            canManage={canManage}
            onContinueFinish={() => setUiStep('finish')}
          />
        )}
        {uiStep === 'finish' && (
          <FinishStep
            day={day}
            run={run}
            mutations={mutations}
            busy={busy}
            canManage={canManage}
          />
        )}
      </Box>
      <FieldStepRail run={run} step={uiStep} onChange={selectStep} />
    </Stack>
  );
}
