import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, ButtonBase, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import BoltRounded from '@mui/icons-material/BoltRounded';
import { useNavigate } from 'react-router-dom';
import type { DeliveryDayDetail, DeliveryRun } from '../../../../types/pos.types';
import { useFieldDeliveryRunMutations } from '../../../../hooks/useFieldDeliveryRun';
import { formatElapsed, liveElapsedSeconds } from './fieldRunUtils';
import {
  FIELD_UI_STEP_LABELS,
  type FieldUiStep,
  isBehindLiveStep,
  isUiStepUnlocked,
  resolveUiStepSync,
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
  liveLabel,
  onFollowLive,
}: {
  run: DeliveryRun;
  tick: number;
  eyebrow: string;
  stepAccent: EcoFieldStepKey;
  liveLabel?: string;
  onFollowLive?: () => void;
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
        {liveLabel && onFollowLive ? (
          <ButtonBase
            onClick={onFollowLive}
            sx={{
              mt: 0.25,
              px: 0.9,
              py: 0.2,
              borderRadius: 99,
              gap: 0.4,
              bgcolor: ecoField.ink,
              color: '#fff',
              fontWeight: 800,
              fontSize: 12,
              '& .MuiSvgIcon-root': { fontSize: 14 },
            }}
          >
            <BoltRounded />
            Live: {liveLabel}
          </ButtonBase>
        ) : (
          <Typography variant="body2" fontWeight={800} noWrap>
            Field run
          </Typography>
        )}
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
  // Manual navigation earns the driver the right to stay put when the run advances.
  const manualStepRef = useRef(false);
  const previousServerStepRef = useRef(serverStep);

  useEffect(() => {
    setUiStep((prev) => {
      if (isUiStepUnlocked(run, prev)) return prev;
      manualStepRef.current = false;
      return serverStep;
    });
  }, [run, serverStep]);

  useEffect(() => {
    const previousServerStep = previousServerStepRef.current;
    previousServerStepRef.current = serverStep;
    if (previousServerStep === serverStep) return;
    setUiStep((prev) => {
      const next = resolveUiStepSync({
        uiStep: prev,
        serverStep,
        previousServerStep,
        manual: manualStepRef.current,
      });
      if (next !== prev) manualStepRef.current = false;
      return next;
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

  const behindLive = isBehindLiveStep(uiStep, serverStep);
  const eyebrow = FIELD_UI_STEP_LABELS[uiStep];

  /** Rail / follow-live taps: remember that the driver chose this step themselves. */
  const selectStep = (step: FieldUiStep) => {
    if (!isUiStepUnlocked(run, step)) return;
    manualStepRef.current = step !== serverStep;
    setUiStep(step);
  };

  /** Step transitions the driver just committed - they ride the live edge again. */
  const advanceToStep = (step: FieldUiStep) => {
    manualStepRef.current = false;
    setUiStep(step);
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
      <TimerChrome
        run={run}
        tick={tick}
        eyebrow={eyebrow}
        stepAccent={uiStep}
        liveLabel={behindLive ? FIELD_UI_STEP_LABELS[serverStep] : undefined}
        onFollowLive={behindLive ? () => advanceToStep(serverStep) : undefined}
      />
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
            {photo.uploading.progress != null
              ? ` ${Math.round(photo.uploading.progress * 100)}%`
              : ''}
          </Typography>
          <LinearProgress
            variant={photo.uploading.progress != null ? 'determinate' : 'indeterminate'}
            value={
              photo.uploading.progress != null
                ? Math.round(photo.uploading.progress * 100)
                : undefined
            }
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
                () => advanceToStep('load'),
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
            onContinueRoutes={() => advanceToStep('routes')}
          />
        )}
        {uiStep === 'routes' && (
          <RoutesStep
            day={day}
            run={run}
            mutations={mutations}
            busy={busy}
            canManage={canManage}
            onContinueDeliveries={() => advanceToStep('deliveries')}
            onGoToLoad={() => selectStep('load')}
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
            onContinueFinish={() => advanceToStep('finish')}
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
