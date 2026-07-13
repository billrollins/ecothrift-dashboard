import ArrowBack from '@mui/icons-material/ArrowBack';
import ArrowForward from '@mui/icons-material/ArrowForward';
import PauseCircle from '@mui/icons-material/PauseCircle';
import ShoppingCart from '@mui/icons-material/ShoppingCart';
import {
  Box,
  Button,
  Chip,
  Collapse,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { ProcessingHandoff } from '../../../../types/inventory.types';
import {
  TARS_DECISION_RESULT_OPTIONS,
  TARS_MANDATORY_STOP_OUTS,
  TARS_SALE_STATE_LABELS,
} from '../tarsDecisionCatalog';
import type { TarsCompletenessStatus, TarsSaleState, TarsTestedStatus } from '../tarsDecisionTypes';
import { recalculateDecisionEconomics } from '../tarsDecisionEngine';
import { fmtUsd } from '../tarsProfit';
import type { TarsItem } from '../tarsTypes';
import {
  TARS_ACTION_TYPE_LABELS,
  type TarsActionType,
  type TarsWorkSession,
} from '../tarsWorkTypes';
import { StudioFlashToast, StudioReservedSlot, type StudioFlashTone } from './StudioFlashToast';
import { StudioChoiceButton, StudioMetric, StudioSectionHeader, StudioSurface } from './TarsStudioPrimitives';
import { StudioStepper } from './TarsStudioStepper';
import { stepComplete, stepHint } from './tarsStudioStepGuards';
import { studio, TARS_STUDIO_STEPS } from './tarsStudioTheme';
import { useTarsDecisionSession } from './useTarsDecisionSession';

const SALE_STATES = Object.keys(TARS_SALE_STATE_LABELS) as TarsSaleState[];
const ACTIONS = Object.keys(TARS_ACTION_TYPE_LABELS) as TarsActionType[];

function perMinute(value: number): string {
  return Number.isFinite(value)
    ? `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(2)}/min`
    : '—';
}

export interface TarsDecisionWizardProps {
  item: TarsItem;
  session: TarsWorkSession;
  processingHandoff?: ProcessingHandoff | null;
  editable: boolean;
  onSessionChange: (session: TarsWorkSession) => void;
  onOpenParts?: () => void;
  onOpenHold?: () => void;
  onRequestComplete?: (session: TarsWorkSession) => void;
}

export function TarsDecisionWizard({
  item,
  session,
  processingHandoff,
  editable,
  onSessionChange,
  onOpenParts,
  onOpenHold,
  onRequestComplete,
}: TarsDecisionWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [flash, setFlash] = useState<{ message: string; tone: StudioFlashTone } | null>(null);
  const [showUnknowns, setShowUnknowns] = useState(false);
  const step = TARS_STUDIO_STEPS[stepIndex]?.id ?? 'handoff';
  const {
    prepared,
    decision,
    economics,
    ranked,
    gates,
    patchHandoff,
    patchCondition,
    patchSelection,
    patchTest,
    patchUnknown,
    patchOutcome,
    selectOutcome,
    setStopOut,
    setTestResult,
    addTest,
    addUnknown,
  } = useTarsDecisionSession(item, session, onSessionChange);

  const processingUnknowns = useMemo(
    () => Array.isArray(processingHandoff?.unknowns)
      ? processingHandoff.unknowns
      : processingHandoff?.unknowns ? [processingHandoff.unknowns] : [],
    [processingHandoff],
  );

  const best = ranked[0];
  const stepStatuses = useMemo(
    () => TARS_STUDIO_STEPS.map((entry) => stepComplete(entry.id, decision)),
    [decision],
  );

  // Surface gate messages as overlays — never insert Alerts into the flow.
  useEffect(() => {
    if (step !== 'decide') return;
    const msg = gates.mandatoryBlockers[0] ?? gates.requiredBlockers[0] ?? null;
    if (msg) setFlash({ message: msg, tone: 'error' });
  }, [step, gates.mandatoryBlockers, gates.requiredBlockers]);

  const goNext = () => {
    if (editable && !stepComplete(step, decision)) {
      setFlash({ message: stepHint(step, decision), tone: 'warning' });
      return;
    }
    setStepIndex((i) => Math.min(i + 1, TARS_STUDIO_STEPS.length - 1));
  };
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));
  const jumpTo = (id: string) => {
    const idx = TARS_STUDIO_STEPS.findIndex((s) => s.id === id);
    if (idx >= 0) setStepIndex(idx);
  };

  const isLast = stepIndex === TARS_STUDIO_STEPS.length - 1;
  const needsOverride = gates.ordinaryBlockers.length > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, position: 'relative' }}>
      <StudioFlashToast
        message={flash?.message ?? null}
        tone={flash?.tone ?? 'info'}
        onDismiss={() => setFlash(null)}
      />

      <StudioStepper
        steps={TARS_STUDIO_STEPS}
        activeIndex={stepIndex}
        completed={stepStatuses}
        onStepClick={editable ? jumpTo : undefined}
      />

      <StudioSurface sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 1 }}>
        <StudioSectionHeader
          title={TARS_STUDIO_STEPS[stepIndex]?.label ?? 'Guided decision'}
          subtitle={stepHint(step, decision)}
        />

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {step === 'handoff' ?
            <Stack spacing={1}>
              <Box
                sx={{
                  px: 1,
                  py: 0.75,
                  borderRadius: `${studio.radius.sm}px`,
                  bgcolor: studio.accentSoft,
                  border: `1px solid ${studio.accentSoftBorder}`,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 900, color: studio.accentDark }}>
                  Processing · {item.skuLabel ?? item.sku}
                </Typography>
                {processingHandoff ?
                  <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                    <Chip size="small" label={processingHandoff.tested_status.replace(/_/g, ' ')} sx={{ height: 22, fontWeight: 800 }} />
                    {processingHandoff.quick_tests?.slice(0, 3).map((test, index) => (
                      <Chip
                        key={`${test.test_id ?? test.name}-${index}`}
                        size="small"
                        variant="outlined"
                        label={`${test.name ?? test.test_id}: ${test.result}`}
                        sx={{ height: 22 }}
                      />
                    ))}
                  </Stack>
                :
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35 }}>
                    No structured handoff — verify on bench.
                  </Typography>
                }
                {processingHandoff?.condition_evidence ?
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                    {processingHandoff.condition_evidence}
                  </Typography>
                : null}
                {processingUnknowns.length ?
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }} color="text.secondary">
                    Unknowns: {processingUnknowns.join('; ')}
                  </Typography>
                : null}
              </Box>
              <TextField
                fullWidth
                size="small"
                label="Context"
                disabled={!editable}
                value={decision.handoff.contextSummary}
                onChange={(e) => patchHandoff({ contextSummary: e.target.value })}
              />
              <TextField
                fullWidth
                size="small"
                label="Corrections"
                disabled={!editable}
                value={decision.handoff.correctionNotes}
                onChange={(e) => patchHandoff({ correctionNotes: e.target.value })}
              />
              {editable ?
                <Button
                  size="small"
                  variant={decision.handoff.acknowledged ? 'outlined' : 'contained'}
                  onClick={() => {
                    patchHandoff({
                      acknowledged: true,
                      acknowledgedAt: decision.handoff.acknowledgedAt ?? new Date().toISOString(),
                    });
                    setFlash({ message: 'Handoff acknowledged', tone: 'success' });
                  }}
                  sx={{ alignSelf: 'flex-start', fontWeight: 800 }}
                >
                  {decision.handoff.acknowledged ? 'Acknowledged' : 'Acknowledge handoff'}
                </Button>
              : null}
            </Stack>
          : null}

          {step === 'stopouts' ?
            <Stack spacing={0.85}>
              {TARS_MANDATORY_STOP_OUTS.map((entry) => {
                const response = decision.stopOut.responses.find((r) => r.stopOutId === entry.id);
                const value = response?.response ?? 'unanswered';
                const blocked = value === 'blocked';
                return (
                  <Box
                    key={entry.id}
                    sx={{
                      px: 1,
                      py: 0.75,
                      borderRadius: `${studio.radius.sm}px`,
                      border: `1.5px solid ${blocked ? studio.danger : studio.panelBorder}`,
                      bgcolor: blocked ? studio.blockedWash : '#fff',
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 900 }}>{entry.title}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.65 }}>
                      {entry.prompt}
                    </Typography>
                    <Stack direction="row" gap={0.75}>
                      <StudioChoiceButton
                        selected={value === 'clear'}
                        tone="positive"
                        label="Clear"
                        disabled={!editable}
                        onClick={() => setStopOut(entry.id, 'clear')}
                      />
                      <StudioChoiceButton
                        selected={blocked}
                        tone="negative"
                        label="Stop"
                        disabled={!editable}
                        onClick={() => {
                          setStopOut(entry.id, 'blocked');
                          setFlash({ message: entry.blockedGuidance, tone: 'error' });
                        }}
                      />
                    </Stack>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder={blocked ? 'Stop details' : 'Notes'}
                      disabled={!editable || value === 'unanswered'}
                      value={response?.notes ?? ''}
                      onChange={(e) => {
                        if (value === 'clear' || value === 'blocked') {
                          setStopOut(entry.id, value, e.target.value);
                        }
                      }}
                      sx={{ mt: 0.65 }}
                    />
                  </Box>
                );
              })}
              {decision.stopOut.blocked && editable && onOpenHold ?
                <Button size="small" variant="contained" color="warning" startIcon={<PauseCircle />} onClick={onOpenHold}
                  sx={{ alignSelf: 'flex-start', fontWeight: 800 }}>
                  Place on hold
                </Button>
              : null}
            </Stack>
          : null}

          {step === 'evidence' ?
            <Stack spacing={1}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 0.85 }}>
                <TextField size="small" fullWidth label="Condition" disabled={!editable}
                  value={decision.condition.condition}
                  onChange={(e) => patchCondition({ condition: e.target.value })} />
                <TextField select size="small" fullWidth label="Completeness" disabled={!editable}
                  value={decision.condition.completeness}
                  onChange={(e) => patchCondition({ completeness: e.target.value as TarsCompletenessStatus })}>
                  <MenuItem value="unknown">Unknown</MenuItem>
                  <MenuItem value="complete">Complete</MenuItem>
                  <MenuItem value="incomplete">Incomplete</MenuItem>
                  <MenuItem value="not_applicable">N/A</MenuItem>
                </TextField>
                <TextField select size="small" fullWidth label="Tested" disabled={!editable}
                  value={decision.condition.testedStatus}
                  onChange={(e) => patchCondition({ testedStatus: e.target.value as TarsTestedStatus })}>
                  <MenuItem value="not_tested">Not tested</MenuItem>
                  <MenuItem value="partially_tested">Partial</MenuItem>
                  <MenuItem value="tested">Tested</MenuItem>
                </TextField>
              </Box>
              <TextField size="small" fullWidth label="Evidence" multiline minRows={2} disabled={!editable}
                value={decision.condition.evidence}
                onChange={(e) => patchCondition({ evidence: e.target.value })} />
            </Stack>
          : null}

          {step === 'tests' ?
            <Stack spacing={0.75}>
              {decision.tests.map((test) => (
                <Box key={test.id} sx={{ px: 1, py: 0.65, borderRadius: `${studio.radius.sm}px`, border: `1px solid ${studio.panelBorder}` }}>
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    <Typography variant="body2" sx={{ fontWeight: 800, flex: 1 }} noWrap>{test.name}</Typography>
                    <FormControlLabel
                      label={<Typography variant="caption" fontWeight={700}>Relevant</Typography>}
                      sx={{ mr: 0 }}
                      control={
                        <Switch size="small" checked={test.relevant} disabled={!editable}
                          onChange={(e) => patchTest(test.id, { relevant: e.target.checked })} />
                      }
                    />
                  </Stack>
                  {/* Always reserve result row height so toggling Relevant never jumps layout */}
                  <Box sx={{ mt: 0.5, opacity: test.relevant ? 1 : 0.35, pointerEvents: test.relevant && editable ? 'auto' : 'none' }}>
                    <Stack direction="row" gap={0.5} flexWrap="wrap">
                      {TARS_DECISION_RESULT_OPTIONS.map((option) => (
                        <Chip
                          key={option.value}
                          size="small"
                          label={option.label}
                          clickable={test.relevant && editable}
                          color={test.result === option.value ? 'success' : 'default'}
                          variant={test.result === option.value ? 'filled' : 'outlined'}
                          onClick={() => test.relevant && editable && setTestResult(test.id, option.value)}
                          sx={{ height: 24 }}
                        />
                      ))}
                    </Stack>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Evidence"
                      disabled={!editable || !test.relevant}
                      value={test.evidence}
                      onChange={(e) => setTestResult(test.id, test.result, e.target.value)}
                      sx={{ mt: 0.5 }}
                    />
                  </Box>
                </Box>
              ))}
              {editable ?
                <Stack direction="row" gap={1}>
                  <Button size="small" onClick={() => addTest()}>Add test</Button>
                  <Button size="small" onClick={() => setShowUnknowns((v) => !v)}>
                    {showUnknowns ? 'Hide unknowns' : `Unknowns (${decision.unknowns.length})`}
                  </Button>
                </Stack>
              : null}
              <Collapse in={showUnknowns} unmountOnExit={false}>
                <Stack spacing={0.75} sx={{ pt: 0.5 }}>
                  {decision.unknowns.map((unknown) => (
                    <TextField
                      key={unknown.id}
                      size="small"
                      fullWidth
                      label="Unknown"
                      disabled={!editable}
                      value={unknown.description}
                      onChange={(e) => patchUnknown(unknown.id, { description: e.target.value })}
                    />
                  ))}
                  {editable ? <Button size="small" onClick={addUnknown} sx={{ alignSelf: 'flex-start' }}>Add unknown</Button> : null}
                </Stack>
              </Collapse>
            </Stack>
          : null}

          {step === 'paths' ?
            <Stack spacing={0.75}>
              <Stack direction="row" alignItems="center" gap={1}>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  Contribution / labor minute · $19.80/hr
                </Typography>
                {onOpenParts ?
                  <Button size="small" startIcon={<ShoppingCart />} onClick={onOpenParts}>Parts</Button>
                : null}
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 0.75 }}>
                {decision.outcomes.map((outcome) => {
                  const money = economics.find((e) => e.outcomeId === outcome.id);
                  const selected = decision.selection.outcomeId === outcome.id;
                  const recommended = best?.outcomeId === outcome.id;
                  const blocked = Boolean(money?.blocked);
                  return (
                    <Box
                      key={outcome.id}
                      sx={{
                        px: 1,
                        py: 0.75,
                        borderRadius: `${studio.radius.sm}px`,
                        border: selected ? `2px solid ${studio.accent}` : `1px solid ${studio.panelBorder}`,
                        bgcolor: blocked ? studio.blockedWash : '#fff',
                      }}
                    >
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        <Typography variant="body2" sx={{ fontWeight: 900, flex: 1 }}>{outcome.grade}</Typography>
                        {recommended ? <Chip size="small" color="success" label="Best" sx={{ height: 20 }} /> : null}
                      </Stack>
                      <Stack direction="row" gap={1.5} sx={{ mt: 0.5 }}>
                        <StudioMetric
                          label="/min"
                          value={money ? perMinute(money.contributionPerLaborMinute) : '—'}
                          tone={money && money.contribution >= 0 ? 'positive' : 'negative'}
                        />
                        <StudioMetric label="Contrib" value={money ? fmtUsd(money.contribution) : '—'} />
                        <StudioMetric label="Min" value={String(outcome.estimatedMinutes)} />
                      </Stack>
                      {editable ?
                        <Stack direction="row" gap={0.5} sx={{ mt: 0.65 }} flexWrap="wrap">
                          <TextField
                            select size="small" label="Sale" value={outcome.saleState}
                            onChange={(e) => patchOutcome(outcome.id, { saleState: e.target.value as TarsSaleState })}
                            sx={{ minWidth: 100 }}
                          >
                            {SALE_STATES.map((v) => <MenuItem key={v} value={v}>{TARS_SALE_STATE_LABELS[v]}</MenuItem>)}
                          </TextField>
                          <TextField
                            select size="small" label="Action" value={outcome.action}
                            onChange={(e) => patchOutcome(outcome.id, { action: e.target.value as TarsActionType })}
                            sx={{ minWidth: 90 }}
                          >
                            {ACTIONS.map((v) => <MenuItem key={v} value={v}>{TARS_ACTION_TYPE_LABELS[v]}</MenuItem>)}
                          </TextField>
                          <Button
                            size="small"
                            variant={selected ? 'contained' : 'outlined'}
                            disabled={!outcome.viable || blocked}
                            onClick={() => {
                              selectOutcome(outcome.id);
                              if (money?.exclusionReason) setFlash({ message: money.exclusionReason, tone: 'error' });
                            }}
                            sx={{ fontWeight: 800 }}
                          >
                            {selected ? 'Selected' : 'Choose'}
                          </Button>
                        </Stack>
                      : null}
                    </Box>
                  );
                })}
              </Box>
            </Stack>
          : null}

          {step === 'decide' ?
            <Stack spacing={1}>
              <Box
                sx={{
                  px: 1,
                  py: 0.75,
                  borderRadius: `${studio.radius.sm}px`,
                  bgcolor: studio.accentSoft,
                  border: `1px solid ${studio.accentSoftBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  minHeight: 40,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 800, flex: 1 }}>
                  {best
                    ? `Recommend ${best.grade} · ${perMinute(best.contributionPerLaborMinute)}`
                    : 'No viable unblocked path'}
                </Typography>
                {best && editable ?
                  <Button size="small" onClick={() => selectOutcome(best.outcomeId)} sx={{ fontWeight: 800 }}>
                    Use
                  </Button>
                : null}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0.75 }}>
                <StudioMetric label="Grade" value={decision.selection.grade ?? '—'} />
                <StudioMetric label="Action" value={decision.selection.action ? TARS_ACTION_TYPE_LABELS[decision.selection.action] : '—'} />
                <StudioMetric label="Sale" value={decision.selection.saleState ? TARS_SALE_STATE_LABELS[decision.selection.saleState] : '—'} />
              </Box>
              <TextField
                size="small"
                fullWidth
                label="Decision reason"
                multiline
                minRows={2}
                disabled={!editable}
                value={decision.selection.reason}
                onChange={(e) => patchSelection({ reason: e.target.value })}
              />
              {/* Always reserve override slot — opacity only, no layout jump */}
              <StudioReservedSlot show={needsOverride} height={64}>
                <TextField
                  size="small"
                  fullWidth
                  label="Ordinary override reason"
                  disabled={!editable}
                  value={decision.selection.overrideReason}
                  onChange={(e) => patchSelection({ overrideReason: e.target.value })}
                  helperText="Cannot override mandatory stop-outs"
                />
              </StudioReservedSlot>
            </Stack>
          : null}
        </Box>

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ pt: 0.75, mt: 0.75, borderTop: `1px solid ${studio.panelBorder}` }}
        >
          <Button size="small" startIcon={<ArrowBack />} disabled={stepIndex === 0} onClick={goBack}>
            Back
          </Button>
          <Stack direction="row" gap={0.75}>
            {isLast && editable && onRequestComplete ?
              <Button
                size="small"
                variant="contained"
                color="success"
                disabled={!gates.canFinalize}
                onClick={() => {
                  if (!gates.canFinalize) {
                    setFlash({
                      message: gates.mandatoryBlockers[0] ?? gates.requiredBlockers[0] ?? gates.ordinaryBlockers[0] ?? 'Finish required fields',
                      tone: 'error',
                    });
                    return;
                  }
                  onRequestComplete(recalculateDecisionEconomics(item, prepared));
                }}
                sx={{ fontWeight: 900 }}
              >
                Complete
              </Button>
            : null}
            {!isLast ?
              <Button
                size="small"
                variant="contained"
                endIcon={<ArrowForward />}
                onClick={goNext}
                sx={{ fontWeight: 900, bgcolor: studio.accent, '&:hover': { bgcolor: studio.accentDark } }}
              >
                Continue
              </Button>
            : null}
          </Stack>
        </Stack>
      </StudioSurface>
    </Box>
  );
}
