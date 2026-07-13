import Add from '@mui/icons-material/Add';
import ExpandMore from '@mui/icons-material/ExpandMore';
import PauseCircle from '@mui/icons-material/PauseCircle';
import ShoppingCart from '@mui/icons-material/ShoppingCart';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Divider,
  FormControlLabel, MenuItem, Paper, Stack, Switch, TextField, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import { useMemo } from 'react';
import {
  TARS_DECISION_RESULT_OPTIONS, TARS_MANDATORY_STOP_OUTS, TARS_SALE_STATE_LABELS,
} from './tarsDecisionCatalog';
import {
  decisionGates, ensureDecisionSession, evaluateDecisionOutcomes, rankDecisionOutcomes,
  recalculateDecisionEconomics, selectDecisionOutcome, updateDecisionOutcome,
  updateStopOutResponse, updateStructuredTestResult,
} from './tarsDecisionEngine';
import type {
  TarsCompletenessStatus, TarsDecisionTest, TarsDecisionTestResult, TarsDecisionUnknown,
  TarsDecisionWork, TarsQueuePressure, TarsSaleState, TarsStopOutResponseValue,
  TarsTestedStatus, TarsViableOutcome,
} from './tarsDecisionTypes';
import { fmtUsd } from './tarsProfit';
import type { TarsItem } from './tarsTypes';
import {
  TARS_ACTION_TYPE_LABELS, type TarsActionType, type TarsWorkSession,
} from './tarsWorkTypes';
import type { ProcessingHandoff } from '../../../types/inventory.types';

const SALE_STATES = Object.keys(TARS_SALE_STATE_LABELS) as TarsSaleState[];
const ACTIONS = Object.keys(TARS_ACTION_TYPE_LABELS) as TarsActionType[];

export interface TarsDecisionWorkbenchProps {
  item: TarsItem;
  session: TarsWorkSession;
  processingHandoff?: ProcessingHandoff | null;
  onSessionChange: (session: TarsWorkSession) => void;
  onOpenParts?: () => void;
  onOpenHold?: () => void;
  onRequestComplete?: (session: TarsWorkSession) => void;
}

function Summary({ children }: { children: React.ReactNode }) {
  return <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', pr: 1 }}>{children}</Typography>;
}

function perMinute(value: number): string {
  return Number.isFinite(value)
    ? `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(2)}/min`
    : '—';
}

export function TarsDecisionWorkbench({
  item, session, processingHandoff, onSessionChange, onOpenParts, onOpenHold, onRequestComplete,
}: TarsDecisionWorkbenchProps) {
  const prepared = useMemo(
    () => ensureDecisionSession(session, item, session.decisionWork?.timestamps.updatedAt),
    [item, session],
  );
  const decision = prepared.decisionWork as TarsDecisionWork;
  const editable = prepared.workState === 'bench';
  const economics = useMemo(() => evaluateDecisionOutcomes(item, prepared), [item, prepared]);
  const ranked = useMemo(() => rankDecisionOutcomes(item, prepared), [item, prepared]);
  const gates = useMemo(() => decisionGates(prepared), [prepared]);
  const relevant = decision.tests.filter((test) => test.relevant);
  const testsDone = relevant.filter((test) => test.result !== null).length;
  const unanswered = decision.stopOut.responses.filter((response) => response.response === 'unanswered').length;
  const best = ranked[0];
  const processingUnknowns =
    Array.isArray(processingHandoff?.unknowns)
      ? processingHandoff.unknowns
      : processingHandoff?.unknowns ? [processingHandoff.unknowns] : [];

  const emit = (next: TarsWorkSession) => onSessionChange(recalculateDecisionEconomics(item, next));
  const patchDecision = (patch: Partial<TarsDecisionWork>) => emit({
    ...prepared,
    decisionWork: {
      ...decision,
      ...patch,
      timestamps: { ...decision.timestamps, updatedAt: new Date().toISOString() },
    },
  });
  const patchHandoff = (patch: Partial<TarsDecisionWork['handoff']>) =>
    patchDecision({ handoff: { ...decision.handoff, ...patch } });
  const patchCondition = (patch: Partial<TarsDecisionWork['condition']>) =>
    patchDecision({ condition: { ...decision.condition, ...patch } });
  const patchSelection = (patch: Partial<TarsDecisionWork['selection']>) =>
    patchDecision({ selection: { ...decision.selection, ...patch } });
  const patchTest = (id: string, patch: Partial<TarsDecisionTest>) => patchDecision({
    tests: decision.tests.map((test) => test.id === id
      ? { ...test, ...patch, updatedAt: new Date().toISOString() } : test),
  });
  const patchUnknown = (id: string, patch: Partial<TarsDecisionUnknown>) => patchDecision({
    unknowns: decision.unknowns.map((unknown) => unknown.id === id
      ? { ...unknown, ...patch, updatedAt: new Date().toISOString() } : unknown),
  });
  const patchOutcome = (id: string, patch: Partial<Omit<TarsViableOutcome, 'id'>>) =>
    emit(updateDecisionOutcome(prepared, id, patch));

  const addTest = () => {
    const now = new Date().toISOString();
    patchDecision({ tests: [...decision.tests, {
      id: `custom-test:${now}:${decision.tests.length}`, catalogTestId: null,
      name: 'Custom test', prompt: '', relevant: true, result: null, evidence: '',
      createdAt: now, updatedAt: now,
    }] });
  };
  const addUnknown = () => {
    const now = new Date().toISOString();
    patchDecision({ unknowns: [...decision.unknowns, {
      id: `unknown:${now}:${decision.unknowns.length}`, description: '', decisionImpact: '',
      resolved: false, resolution: '', createdAt: now, updatedAt: now,
    }] });
  };

  const stateMessage = prepared.workState === 'queue'
    ? 'Queue preview — decision fields unlock when the item reaches the bench.'
    : prepared.workState === 'pending'
      ? 'Pending summary — resume on the bench to continue editing.'
      : '';

  return (
    <Stack spacing={1.1} sx={{ minWidth: 0, pb: 2 }}>
      <Paper variant="outlined" sx={{ p: 1.5, borderWidth: 2, borderColor: decision.stopOut.blocked ? 'error.main' : 'divider' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between">
          <Box>
            <Typography variant="h6" fontWeight={900}>Guided decision</Typography>
            <Typography variant="body2" color="text.secondary">{item.skuLabel ?? item.sku} · {item.name}</Typography>
          </Box>
          <Stack direction="row" gap={0.75} flexWrap="wrap">
            <Chip size="small" color={!unanswered && !decision.stopOut.blocked ? 'success' : 'warning'}
              label={decision.stopOut.blocked ? 'Mandatory stop' : `${3 - unanswered}/3 stop-outs`} />
            <Chip size="small" label={`${testsDone}/${relevant.length} relevant tests`} />
            <Chip size="small" color={decision.selection.grade ? 'success' : 'default'}
              label={decision.selection.grade ? `Decision: ${decision.selection.grade}` : 'No decision'} />
          </Stack>
        </Stack>
        {stateMessage ? <Alert severity="info" sx={{ mt: 1 }}>{stateMessage}</Alert> : null}
      </Paper>

      <Accordion defaultExpanded={editable} disableGutters>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography fontWeight={850}>1. Handoff &amp; context</Typography>
          <Summary>{decision.handoff.acknowledged ? 'Acknowledged' : 'Needs acknowledgement'}</Summary>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1}>
            <Paper variant="outlined" sx={{ p: 1.1, bgcolor: '#f8fafc' }}>
              <Typography variant="caption" fontWeight={800}>PROCESSING SNAPSHOT</Typography>
              <Typography variant="body2">{item.category} · {item.condition?.replace(/_/g, ' ') || 'No condition'} · {item.source}</Typography>
              <Typography variant="body2" color="text.secondary">Scale: {item.scale || 'Not set'} · {Object.keys(item.values ?? {}).length} grade values</Typography>
              {processingHandoff ? <Stack spacing={0.5} mt={0.75}>
                <Chip
                  size="small"
                  sx={{ alignSelf: 'flex-start' }}
                  label={`Processing: ${processingHandoff.tested_status.replace(/_/g, ' ')}`}
                />
                {processingHandoff.condition_evidence ?
                  <Typography variant="body2"><strong>Evidence:</strong> {processingHandoff.condition_evidence}</Typography>
                : null}
                {processingUnknowns.length ?
                  <Typography variant="body2"><strong>Unknowns:</strong> {processingUnknowns.join('; ')}</Typography>
                : null}
                {processingHandoff.quick_tests?.length ?
                  <Stack direction="row" gap={0.5} flexWrap="wrap">
                    {processingHandoff.quick_tests.map((test, index) => (
                      <Chip
                        key={`${test.test_id ?? test.name ?? 'test'}-${index}`}
                        size="small"
                        variant="outlined"
                        label={`${test.name ?? test.test_id ?? 'Quick test'}: ${test.result.replace(/_/g, ' ')}`}
                      />
                    ))}
                  </Stack>
                : null}
              </Stack>
              : <Alert severity="info" sx={{ mt: 0.75, py: 0.25 }}>
                  No structured Processing handoff was saved. Verify the item directly.
                </Alert>}
            </Paper>
            <TextField size="small" label="Handoff context" multiline minRows={2}
              value={decision.handoff.contextSummary} disabled={!editable}
              onChange={(e) => patchHandoff({ contextSummary: e.target.value })} />
            <TextField size="small" label="Corrections / differences found"
              value={decision.handoff.correctionNotes} disabled={!editable}
              onChange={(e) => patchHandoff({ correctionNotes: e.target.value })} />
            {editable ? <Button variant={decision.handoff.acknowledged ? 'outlined' : 'contained'}
              onClick={() => patchHandoff({ acknowledged: true, acknowledgedAt: decision.handoff.acknowledgedAt ?? new Date().toISOString() })}
              sx={{ alignSelf: 'flex-start' }}>
              {decision.handoff.acknowledged ? 'Handoff acknowledged' : 'Acknowledge handoff'}
            </Button> : null}
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded={editable || decision.stopOut.blocked} disableGutters>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography fontWeight={850}>2. Stop-outs &amp; condition</Typography>
          <Summary>{decision.stopOut.blocked ? 'Blocked' : unanswered ? `${unanswered} unanswered` : 'Clear'}</Summary>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.1}>
            {TARS_MANDATORY_STOP_OUTS.map((entry) => {
              const response = decision.stopOut.responses.find((candidate) => candidate.stopOutId === entry.id);
              const value = response?.response ?? 'unanswered';
              return <Paper key={entry.id} variant="outlined" sx={{ p: 1.1, borderColor: value === 'blocked' ? 'error.main' : 'divider' }}>
                <Stack direction={{ xs: 'column', md: 'row' }} gap={1} justifyContent="space-between" alignItems={{ md: 'center' }}>
                  <Box><Typography variant="subtitle2" fontWeight={850}>{entry.title}</Typography><Typography variant="body2">{entry.prompt}</Typography></Box>
                  <ToggleButtonGroup exclusive size="small" value={value} disabled={!editable}
                    onChange={(_, next: TarsStopOutResponseValue | null) => next && emit(updateStopOutResponse(prepared, entry.id, next))}>
                    <ToggleButton value="clear" color="success">Clear</ToggleButton>
                    <ToggleButton value="blocked" color="error">Stop</ToggleButton>
                  </ToggleButtonGroup>
                </Stack>
                {value === 'blocked' ? <Stack spacing={0.75} mt={1}>
                  <Alert severity="error">{entry.blockedGuidance}</Alert>
                  <TextField size="small" label="Stop details" disabled={!editable}
                    value={response?.notes ?? ''}
                    onChange={(e) => emit(updateStopOutResponse(prepared, entry.id, 'blocked', e.target.value))} />
                </Stack> : null}
              </Paper>;
            })}
            {decision.stopOut.blocked && editable && onOpenHold ? <Button color="warning" variant="contained"
              startIcon={<PauseCircle />} onClick={onOpenHold} sx={{ alignSelf: 'flex-start' }}>Place on hold</Button> : null}
            <Divider />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr 1fr' }, gap: 1 }}>
              <TextField size="small" label="Observed condition" disabled={!editable}
                value={decision.condition.condition} onChange={(e) => patchCondition({ condition: e.target.value })} />
              <TextField select size="small" label="Completeness" disabled={!editable}
                value={decision.condition.completeness}
                onChange={(e) => patchCondition({ completeness: e.target.value as TarsCompletenessStatus })}>
                <MenuItem value="unknown">Unknown</MenuItem><MenuItem value="complete">Complete</MenuItem>
                <MenuItem value="incomplete">Incomplete</MenuItem><MenuItem value="not_applicable">N/A</MenuItem>
              </TextField>
              <TextField select size="small" label="Tested status" disabled={!editable}
                value={decision.condition.testedStatus}
                onChange={(e) => patchCondition({ testedStatus: e.target.value as TarsTestedStatus })}>
                <MenuItem value="not_tested">Not tested</MenuItem><MenuItem value="partially_tested">Partially tested</MenuItem>
                <MenuItem value="tested">Tested</MenuItem>
              </TextField>
            </Box>
            <TextField size="small" label="Condition / completeness evidence" multiline minRows={2}
              disabled={!editable} value={decision.condition.evidence}
              onChange={(e) => patchCondition({ evidence: e.target.value })} />
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded={editable} disableGutters>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography fontWeight={850}>3. Tests, results &amp; unknowns</Typography>
          <Summary>{testsDone}/{relevant.length} relevant · {decision.unknowns.length} unknowns</Summary>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.1}>
            <Alert severity="info" icon={false}>Only mark a test relevant when its result can change the decision or disclosure.</Alert>
            {decision.tests.map((test) => <Paper key={test.id} variant="outlined" sx={{ p: 1.1, opacity: test.relevant ? 1 : 0.7 }}>
              <Stack spacing={0.8}>
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
                  <TextField size="small" aria-label="Test name" sx={{ flex: 1 }} value={test.name}
                    disabled={!editable || test.catalogTestId !== null}
                    onChange={(e) => patchTest(test.id, { name: e.target.value })} />
                  <FormControlLabel label="Relevant" control={<Switch size="small" checked={test.relevant}
                    disabled={!editable} onChange={(e) => patchTest(test.id, { relevant: e.target.checked })} />} />
                </Stack>
                {test.prompt ? <Typography variant="body2" color="text.secondary">{test.prompt}</Typography>
                  : <TextField size="small" label="What can this test decide?" disabled={!editable}
                      value={test.prompt} onChange={(e) => patchTest(test.id, { prompt: e.target.value })} />}
                <ToggleButtonGroup exclusive size="small" value={test.result ?? ''} disabled={!editable || !test.relevant}
                  onChange={(_, next: TarsDecisionTestResult | null) => next && emit(updateStructuredTestResult(prepared, test.id, next))}>
                  {TARS_DECISION_RESULT_OPTIONS.map((option) =>
                    <ToggleButton key={option.value} value={option.value}>{option.label}</ToggleButton>)}
                </ToggleButtonGroup>
                <TextField size="small" label="Evidence / result detail" disabled={!editable || !test.relevant}
                  value={test.evidence}
                  onChange={(e) => emit(updateStructuredTestResult(prepared, test.id, test.result, e.target.value))} />
              </Stack>
            </Paper>)}
            {editable ? <Button startIcon={<Add />} onClick={addTest} sx={{ alignSelf: 'flex-start' }}>Add test</Button> : null}
            <Divider />
            {decision.unknowns.map((unknown) => <Paper key={unknown.id} variant="outlined" sx={{ p: 1.1 }}>
              <Stack spacing={0.8}>
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}>
                  <TextField size="small" label="Unknown" sx={{ flex: 1 }} disabled={!editable}
                    value={unknown.description} onChange={(e) => patchUnknown(unknown.id, { description: e.target.value })} />
                  <FormControlLabel label="Resolved" control={<Switch size="small" checked={unknown.resolved}
                    disabled={!editable} onChange={(e) => patchUnknown(unknown.id, { resolved: e.target.checked })} />} />
                </Stack>
                <TextField size="small" label="How could it change the decision?" disabled={!editable}
                  value={unknown.decisionImpact} onChange={(e) => patchUnknown(unknown.id, { decisionImpact: e.target.value })} />
                {unknown.resolved ? <TextField size="small" label="Resolution" disabled={!editable}
                  value={unknown.resolution} onChange={(e) => patchUnknown(unknown.id, { resolution: e.target.value })} /> : null}
              </Stack>
            </Paper>)}
            {editable ? <Button startIcon={<Add />} onClick={addUnknown} sx={{ alignSelf: 'flex-start' }}>Add unknown</Button> : null}
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded={editable} disableGutters>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography fontWeight={850}>4. Viable paths &amp; economics</Typography>
          <Summary>{ranked.length}/{decision.outcomes.length} available</Summary>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.1}>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
              <TextField select size="small" label="Queue pressure (context only)" disabled={!editable}
                value={decision.economics.queuePressure}
                onChange={(e) => patchDecision({ economics: { ...decision.economics, queuePressure: e.target.value as TarsQueuePressure, queuePressureAffectsScore: false } })}
                sx={{ minWidth: 220 }}>
                <MenuItem value="unknown">Unknown</MenuItem><MenuItem value="low">Low</MenuItem>
                <MenuItem value="normal">Normal</MenuItem><MenuItem value="high">High</MenuItem>
              </TextField>
              <Typography variant="caption" color="text.secondary">$19.80/hr effective labor · queue pressure does not change score</Typography>
              {onOpenParts ? <Button startIcon={<ShoppingCart />} onClick={onOpenParts} sx={{ ml: { sm: 'auto' } }}>Parts &amp; orders</Button> : null}
            </Stack>
            {decision.outcomes.map((outcome) => {
              const money = economics.find((entry) => entry.outcomeId === outcome.id);
              const selected = decision.selection.outcomeId === outcome.id;
              return <Paper key={outcome.id} variant="outlined" sx={{ p: 1.15, borderWidth: selected ? 2 : 1, borderColor: selected ? 'success.main' : 'divider' }}>
                <Stack spacing={0.9}>
                  <Stack direction={{ xs: 'column', md: 'row' }} gap={1} alignItems={{ md: 'center' }}>
                    <Typography fontWeight={900} sx={{ minWidth: 110 }}>{outcome.grade}</Typography>
                    <TextField select size="small" label="Sale state" disabled={!editable} value={outcome.saleState}
                      onChange={(e) => patchOutcome(outcome.id, { saleState: e.target.value as TarsSaleState })}>
                      {SALE_STATES.map((value) => <MenuItem key={value} value={value}>{TARS_SALE_STATE_LABELS[value]}</MenuItem>)}
                    </TextField>
                    <TextField select size="small" label="Next action" disabled={!editable} value={outcome.action}
                      onChange={(e) => patchOutcome(outcome.id, { action: e.target.value as TarsActionType })}>
                      {ACTIONS.map((value) => <MenuItem key={value} value={value}>{TARS_ACTION_TYPE_LABELS[value]}</MenuItem>)}
                    </TextField>
                    <TextField size="small" type="number" label="Minutes" disabled={!editable} value={outcome.estimatedMinutes}
                      slotProps={{ htmlInput: { min: 0, step: 1 } }}
                      onChange={(e) => patchOutcome(outcome.id, { estimatedMinutes: Number(e.target.value) || 0 })} sx={{ width: 110 }} />
                    <FormControlLabel label="Viable" control={<Switch size="small" checked={outcome.viable}
                      disabled={!editable} onChange={(e) => patchOutcome(outcome.id, { viable: e.target.checked })} />} />
                  </Stack>
                  {!outcome.viable ? <TextField size="small" label="Why nonviable" disabled={!editable}
                    value={outcome.nonviableReason} onChange={(e) => patchOutcome(outcome.id, { nonviableReason: e.target.value })} /> : null}
                  {money ? <Stack direction="row" gap={1.5} flexWrap="wrap">
                    <Chip size="small" label={`Value ${fmtUsd(money.processorValue)}`} />
                    <Chip size="small" label={`Labor ${fmtUsd(money.laborCost)}`} />
                    <Chip size="small" label={`Parts/orders ${fmtUsd(money.partsAndOrdersCost)}`} />
                    <Chip size="small" color={money.contribution >= 0 ? 'success' : 'error'} label={`Contribution ${fmtUsd(money.contribution)}`} />
                    <Chip size="small" label={perMinute(money.contributionPerLaborMinute)} />
                    {money.exclusionReason ? <Chip size="small" color="error" label={money.exclusionReason} /> : null}
                  </Stack> : null}
                  {editable ? <Button variant={selected ? 'contained' : 'outlined'} color="success"
                    disabled={!outcome.viable || Boolean(money?.blocked)}
                    onClick={() => emit(selectDecisionOutcome(prepared, outcome.id))} sx={{ alignSelf: 'flex-start' }}>
                    {selected ? 'Selected path' : 'Choose path'}
                  </Button> : null}
                </Stack>
              </Paper>;
            })}
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded disableGutters>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography fontWeight={850}>5. Recommendation &amp; final decision</Typography>
          <Summary>{best ? `${best.grade} · ${perMinute(best.contributionPerLaborMinute)}` : 'No available recommendation'}</Summary>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.1}>
            {best ? <Alert severity="success">
              Recommend <strong>{best.grade}</strong> — highest restoration contribution per labor minute at {perMinute(best.contributionPerLaborMinute)}.
              {editable ? <Button size="small" color="success" onClick={() => emit(selectDecisionOutcome(prepared, best.outcomeId))} sx={{ ml: 1 }}>Use recommendation</Button> : null}
            </Alert> : <Alert severity="warning">No viable, unblocked path is available.</Alert>}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 1 }}>
              <TextField size="small" label="Final grade" value={decision.selection.grade ?? ''} disabled />
              <TextField size="small" label="Final action" value={decision.selection.action ? TARS_ACTION_TYPE_LABELS[decision.selection.action] : ''} disabled />
              <TextField size="small" label="Final sale state" value={decision.selection.saleState ? TARS_SALE_STATE_LABELS[decision.selection.saleState] : ''} disabled />
            </Box>
            <TextField size="small" label="Decision reason" multiline minRows={2} disabled={!editable}
              value={decision.selection.reason} onChange={(e) => patchSelection({ reason: e.target.value })} />
            {gates.ordinaryBlockers.length ? <TextField size="small" label="Ordinary override reason"
              helperText="Explains workflow exceptions only; mandatory stop-outs cannot be overridden."
              disabled={!editable} value={decision.selection.overrideReason}
              onChange={(e) => patchSelection({ overrideReason: e.target.value })} /> : null}
            {gates.mandatoryBlockers.length ? <Alert severity="error">{gates.mandatoryBlockers.join(' ')}</Alert> : null}
            {gates.requiredBlockers.length ? <Alert severity="error">{gates.requiredBlockers.join(' ')}</Alert> : null}
            {gates.ordinaryBlockers.length ? <Alert severity={gates.usesOverride ? 'warning' : 'info'}>
              {gates.ordinaryBlockers.join(' ')}{gates.usesOverride ? ' Ordinary override recorded.' : ''}
            </Alert> : null}
            {editable && onRequestComplete ? <Button variant="contained" color="success"
              disabled={!gates.canFinalize}
              onClick={() => onRequestComplete(recalculateDecisionEconomics(item, prepared))}
              sx={{ alignSelf: 'flex-start' }}>Continue to completion</Button> : null}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Stack>
  );
}
