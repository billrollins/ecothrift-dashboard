import Analytics from '@mui/icons-material/Analytics';
import Build from '@mui/icons-material/Build';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Close from '@mui/icons-material/Close';
import FactCheck from '@mui/icons-material/FactCheck';
import Gavel from '@mui/icons-material/Gavel';
import Done from '@mui/icons-material/Done';
import PauseCircle from '@mui/icons-material/PauseCircle';
import Science from '@mui/icons-material/Science';
import ShoppingCart from '@mui/icons-material/ShoppingCart';
import Undo from '@mui/icons-material/Undo';
import WarningAmber from '@mui/icons-material/WarningAmber';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { ProcessingHandoff, RestorationJobDTO } from '../../../../types/inventory.types';
import {
  TARS_DECISION_RESULT_OPTIONS,
  TARS_SALE_STATE_LABELS,
  TARS_UNIVERSAL_TEST_CATALOG,
  TARS_VISUAL_CHECKLIST_KEYS,
  TARS_VISUAL_CHECKLIST_LABELS,
} from '../tarsDecisionCatalog';
import type { TarsSaleState, TarsViableOutcome } from '../tarsDecisionTypes';
import { fmtUsd, gradesForScale } from '../tarsProfit';
import type { TarsItem } from '../tarsTypes';
import {
  TARS_ACTION_TYPE_LABELS,
  type TarsActionType,
  type TarsWorkSession,
} from '../tarsWorkTypes';
import { StudioFlashToast, type StudioFlashTone } from './StudioFlashToast';
import { StudioSurface } from './TarsStudioPrimitives';
import { studio } from './tarsStudioTheme';
import { useTarsDecisionSession } from './useTarsDecisionSession';
import { TarsWorkBenchTable } from '../TarsWorkBenchTable';

const SALE_STATES = Object.keys(TARS_SALE_STATE_LABELS) as TarsSaleState[];
const ACTIONS = Object.keys(TARS_ACTION_TYPE_LABELS) as TarsActionType[];

type CockpitToolId = 'grade' | 'tests' | 'options' | 'decision' | 'work';

interface CockpitTool {
  id: CockpitToolId;
  label: string;
  purpose: string;
  status: string;
  color: string;
  tint: string;
  icon: ReactNode;
  done: boolean;
  attention?: boolean;
}

function perMinute(value: number): string {
  return Number.isFinite(value)
    ? `${value < 0 ? '-' : ''}$${Math.abs(value).toFixed(2)}/min`
    : '—';
}

function shortTime(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export interface TarsItemCockpitProps {
  item: TarsItem;
  job: RestorationJobDTO;
  session: TarsWorkSession;
  processingHandoff?: ProcessingHandoff | null;
  editable: boolean;
  scaleRecord: Record<string, string[]>;
  onSessionChange: (session: TarsWorkSession) => void;
  onOpenParts?: () => void;
  onOpenHold?: () => void;
  onMoveToInbox?: () => void;
  onRequestComplete?: (session: TarsWorkSession) => void;
}

export function TarsItemCockpit({
  item,
  job,
  session,
  processingHandoff,
  editable,
  scaleRecord,
  onSessionChange,
  onOpenParts,
  onOpenHold,
  onMoveToInbox,
  onRequestComplete,
}: TarsItemCockpitProps) {
  const [flash, setFlash] = useState<{ message: string; tone: StudioFlashTone } | null>(null);
  const [activeTool, setActiveTool] = useState<CockpitToolId | null>(null);
  const [activeTestId, setActiveTestId] = useState<string | null>(null);
  const [activeOutcomeId, setActiveOutcomeId] = useState<string | null>(null);
  const [candidateOutcomeId, setCandidateOutcomeId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');
  const [testChooserOpen, setTestChooserOpen] = useState(false);
  const [testSearch, setTestSearch] = useState('');

  const {
    decision,
    economics,
    ranked,
    gates,
    emit,
    patchCondition,
    patchSelection,
    patchTest,
    patchOutcome,
    setTestResult,
    addTest,
    prepared,
  } = useTarsDecisionSession(item, session, onSessionChange);

  const gradeNames = useMemo(() => {
    const fromScale = gradesForScale(item.scale || job.scale, scaleRecord);
    if (fromScale.length) return fromScale;
    return Object.keys(item.values ?? {});
  }, [item.scale, item.values, job.scale, scaleRecord]);

  const packTests = decision.tests.filter((test) => test.relevant);
  const testsDone = packTests.filter((test) => test.result !== null).length;
  const currentGrade = decision.condition.currentGrade;
  const selected = decision.selection;
  const decisionCommitted = Boolean(selected.outcomeId && selected.reason.trim());
  const best = ranked[0];
  const bestOutcome = best
    ? decision.outcomes.find((outcome) => outcome.id === best.outcomeId)
    : undefined;
  const filteredTestCatalog = TARS_UNIVERSAL_TEST_CATALOG.filter((entry) => {
    const query = testSearch.trim().toLowerCase();
    if (!query) return true;
    return `${entry.name} ${entry.prompt} ${entry.decisionUse}`.toLowerCase().includes(query);
  });

  const activeTest =
    packTests.find((test) => test.id === activeTestId) ??
    packTests.find((test) => test.result === null) ??
    packTests[0] ??
    null;

  const activeOutcome =
    decision.outcomes.find((outcome) => outcome.id === activeOutcomeId) ??
    (bestOutcome ?? null);
  const activeOutcomeEconomics = activeOutcome
    ? economics.find((entry) => entry.outcomeId === activeOutcome.id) ?? null
    : null;

  const candidateOutcome =
    decision.outcomes.find((outcome) => outcome.id === candidateOutcomeId) ??
    decision.outcomes.find((outcome) => outcome.id === selected.outcomeId) ??
    bestOutcome ??
    null;
  const candidateEconomics = candidateOutcome
    ? economics.find((entry) => entry.outcomeId === candidateOutcome.id) ?? null
    : null;

  useEffect(() => {
    setActiveTool(null);
    setActiveTestId(null);
    setActiveOutcomeId(null);
    setCandidateOutcomeId(null);
    setReasonDraft('');
    setTestChooserOpen(false);
    setTestSearch('');
  }, [job.id]);

  useEffect(() => {
    if (!activeTestId || !packTests.some((test) => test.id === activeTestId)) {
      setActiveTestId(packTests.find((test) => test.result === null)?.id ?? packTests[0]?.id ?? null);
    }
  }, [activeTestId, packTests]);

  useEffect(() => {
    if (!activeOutcomeId || !decision.outcomes.some((outcome) => outcome.id === activeOutcomeId)) {
      setActiveOutcomeId(best?.outcomeId ?? decision.outcomes[0]?.id ?? null);
    }
    if (!candidateOutcomeId && best?.outcomeId) {
      setCandidateOutcomeId(best.outcomeId);
    }
  }, [activeOutcomeId, best?.outcomeId, candidateOutcomeId, decision.outcomes]);

  const tools: CockpitTool[] = [
    {
      id: 'grade',
      label: 'Assess grade',
      purpose: 'What the item is now',
      status: currentGrade || 'Not assessed',
      color: '#4f46e5',
      tint: '#eef2ff',
      icon: <FactCheck />,
      done: Boolean(currentGrade),
      attention: !currentGrade,
    },
    {
      id: 'tests',
      label: 'Add / run test',
      purpose: 'Only evidence that changes the decision',
      status: `${testsDone}/${packTests.length} answered`,
      color: '#0284c7',
      tint: '#f0f9ff',
      icon: <Science />,
      done: packTests.length > 0 && testsDone === packTests.length,
      attention: packTests.some((test) => test.result === null),
    },
    {
      id: 'options',
      label: 'Build plan',
      purpose: 'Compare grade paths and cost',
      status: `${ranked.length} viable ${ranked.length === 1 ? 'path' : 'paths'}`,
      color: '#7c3aed',
      tint: '#f5f3ff',
      icon: <Analytics />,
      done: ranked.length > 0,
      attention: ranked.length === 0,
    },
    {
      id: 'decision',
      label: 'Commit plan',
      purpose: 'Commit one path and reason',
      status: decisionCommitted
        ? `${selected.action ?? ''} → ${selected.grade ?? ''}`
        : 'Not committed',
      color: '#15803d',
      tint: '#f0fdf4',
      icon: <Gavel />,
      done: decisionCommitted,
      attention: !decisionCommitted,
    },
    {
      id: 'work',
      label: 'Record work',
      purpose: 'TEST, REPAIR, ASSEMBLE, or SALVAGE performed',
      status: `${session.benchRows?.length ?? 0} recorded`,
      color: '#0f766e',
      tint: '#f0fdfa',
      icon: <Build />,
      done: Boolean(session.benchRows?.length),
    },
  ];

  const currentTool = tools.find((tool) => tool.id === activeTool) ?? null;
  const suggestedTool: CockpitToolId | null =
    !currentGrade ? 'grade'
    : packTests.some((test) => test.result === null) ? 'tests'
    : !ranked.length ? 'options'
    : !decisionCommitted ? 'decision'
    : null;

  const chooseCurrentGrade = (grade: string) => {
    if (!editable) return;
    const now = new Date().toISOString();
    emit({
      ...prepared,
      decisionWork: {
        ...decision,
        condition: {
          ...decision.condition,
          currentGrade: grade,
        },
        timestamps: {
          ...decision.timestamps,
          updatedAt: now,
        },
      },
    });
  };

  const commitPlan = (outcome: TarsViableOutcome) => {
    if (!editable) return;
    const reason = reasonDraft.trim() || selected.reason.trim();
    if (!reason) {
      setFlash({ message: 'Say why this is the right decision.', tone: 'warning' });
      return;
    }
    const now = new Date().toISOString();
    emit({
      ...prepared,
      selectedGrade: outcome.grade,
      decisionWork: {
        ...decision,
        selection: {
          ...selected,
          outcomeId: outcome.id,
          grade: outcome.grade,
          saleState: outcome.saleState,
          action: outcome.action,
          reason,
          selectedAt: now,
        },
        timestamps: {
          ...decision.timestamps,
          updatedAt: now,
        },
      },
    });
    setCandidateOutcomeId(outcome.id);
    setActiveTool(null);
    setFlash({ message: 'Decision committed — tool put away', tone: 'success' });
  };

  const renderGradeTool = () => (
    <Stack spacing={2}>
      {processingHandoff ? (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            bgcolor: '#eff6ff',
            borderLeft: '6px solid #2563eb',
          }}
        >
          <Typography variant="overline" sx={{ fontWeight: 900, color: '#1d4ed8', lineHeight: 1 }}>
            Processing snapshot
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.4, fontWeight: 800 }}>
            {processingHandoff.tested_status.replace(/_/g, ' ')}
          </Typography>
          {processingHandoff.condition_evidence ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
              {processingHandoff.condition_evidence}
            </Typography>
          ) : null}
        </Box>
      ) : null}

      <Box>
        <Typography variant="h6" sx={{ fontWeight: 950, color: '#1e1b4b' }}>
          What grade is it right now?
        </Typography>
        <Typography variant="body2" color="text.secondary">
          This is the observed starting grade—not the grade Mike hopes to reach.
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' },
          gap: 1,
        }}
      >
        {gradeNames.map((grade) => {
          const active = currentGrade === grade;
          return (
            <Button
              key={grade}
              disabled={!editable}
              onClick={() => chooseCurrentGrade(grade)}
              sx={{
                minHeight: 68,
                borderRadius: 2,
                border: `2px solid ${active ? '#4f46e5' : '#cbd5e1'}`,
                bgcolor: active ? '#eef2ff' : '#fff',
                color: active ? '#3730a3' : '#334155',
                fontWeight: 950,
                fontSize: '0.95rem',
                textTransform: 'none',
                boxShadow: active ? '0 0 0 3px rgba(79, 70, 229, 0.14)' : 'none',
                '&:hover': { bgcolor: active ? '#eef2ff' : '#f8fafc' },
              }}
            >
              {active ? <CheckCircle sx={{ mr: 0.75, fontSize: 20 }} /> : null}
              {grade}
            </Button>
          );
        })}
      </Box>

      <Divider />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '180px 1fr' },
          gap: 1,
        }}
      >
        <TextField
          select
          size="small"
          label="Completeness"
          value={decision.condition.completeness}
          disabled={!editable}
          onChange={(event) => patchCondition({
            completeness: event.target.value as typeof decision.condition.completeness,
          })}
          SelectProps={{ native: true }}
        >
          <option value="unknown">Unknown</option>
          <option value="complete">Complete</option>
          <option value="incomplete">Incomplete</option>
          <option value="not_applicable">N/A</option>
        </TextField>
        <TextField
          size="small"
          label="Condition evidence"
          placeholder="Only what changes grade or disclosure"
          value={decision.condition.evidence}
          disabled={!editable}
          onChange={(event) => patchCondition({ evidence: event.target.value })}
        />
      </Box>
    </Stack>
  );

  const renderTestsTool = () => {
    const nextUnfinished = packTests.find((test) => test.result === null && test.id !== activeTest?.id);
    return (
      <Stack spacing={1.25}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          gap={1}
          alignItems={{ sm: 'center' }}
          sx={{ p: 1, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #cbd5e1' }}
        >
          <TextField
            select
            size="small"
            label={`Choose test · ${testsDone}/${packTests.length} complete`}
            value={activeTest?.id ?? ''}
            onChange={(event) => setActiveTestId(event.target.value)}
            SelectProps={{ native: true }}
            sx={{ flex: 1, minWidth: 220 }}
          >
            {packTests.map((test) => (
              <option key={test.id} value={test.id}>
                {test.name} — {test.result?.replace(/_/g, ' ') ?? 'not answered'}
              </option>
            ))}
          </TextField>
          {editable ? (
            <Button
              variant="outlined"
              onClick={() => setTestChooserOpen(true)}
              sx={{ fontWeight: 900, textTransform: 'none' }}
            >
              Add test
            </Button>
          ) : null}
        </Stack>

        <Box
          sx={{
            borderRadius: 2,
            border: '2px solid #0284c7',
            bgcolor: '#fff',
            overflow: 'hidden',
          }}
        >
          {activeTest ? (
            <>
              <Box sx={{ px: 1.5, py: 1.25, bgcolor: '#f0f9ff', borderBottom: '1px solid #bae6fd' }}>
                <Typography variant="h6" sx={{ fontWeight: 950, color: '#0c4a6e' }}>
                  {activeTest.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {activeTest.prompt}
                </Typography>
              </Box>
              <Stack spacing={1.5} sx={{ p: 1.5 }}>
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 900, color: '#475569' }}>
                    RESULT
                  </Typography>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' },
                      gap: 0.75,
                      mt: 0.5,
                    }}
                  >
                    {TARS_DECISION_RESULT_OPTIONS.map((option) => {
                      const active = activeTest.result === option.value;
                      const color =
                        option.value === 'pass' ? '#16a34a'
                        : option.value === 'fail' ? '#dc2626'
                        : option.value === 'unknown' ? '#d97706'
                        : '#64748b';
                      return (
                        <Button
                          key={option.value}
                          disabled={!editable}
                          onClick={() => setTestResult(activeTest.id, option.value)}
                          sx={{
                            minHeight: 44,
                            borderRadius: 1.5,
                            border: `2px solid ${active ? color : '#cbd5e1'}`,
                            bgcolor: active ? `${color}14` : '#fff',
                            color: active ? color : '#475569',
                            fontWeight: 900,
                            textTransform: 'none',
                            '&:hover': { bgcolor: active ? `${color}14` : '#f8fafc' },
                          }}
                        >
                          {option.label}
                        </Button>
                      );
                    })}
                  </Box>
                </Box>

                {activeTest.catalogTestId === 'elec_visual_inspection' ? (
                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 900, color: '#475569' }}>
                      VISUAL CHECKS
                    </Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                        gap: 0.65,
                        mt: 0.5,
                      }}
                    >
                      {TARS_VISUAL_CHECKLIST_KEYS.map((key) => {
                        const checked = activeTest.checklist?.[key] === true;
                        return (
                          <Button
                            key={key}
                            disabled={!editable}
                            onClick={() => patchTest(activeTest.id, {
                              checklist: {
                                ...(activeTest.checklist ?? {}),
                                [key]: !checked,
                              },
                            })}
                            sx={{
                              justifyContent: 'flex-start',
                              textTransform: 'none',
                              fontWeight: 800,
                              border: `1px solid ${checked ? '#16a34a' : '#cbd5e1'}`,
                              bgcolor: checked ? '#f0fdf4' : '#fff',
                              color: checked ? '#166534' : '#475569',
                            }}
                          >
                            {checked ? <CheckCircle sx={{ mr: 0.75, fontSize: 18 }} /> : null}
                            {TARS_VISUAL_CHECKLIST_LABELS[key]}
                          </Button>
                        );
                      })}
                    </Box>
                  </Box>
                ) : null}

                <TextField
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  label="Evidence / notes"
                  placeholder="Record only decision-changing evidence"
                  disabled={!editable}
                  value={activeTest.evidence}
                  onChange={(event) => patchTest(activeTest.id, { evidence: event.target.value })}
                />

                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                  <TextField
                    select
                    size="small"
                    label="Overall tested status"
                    disabled={!editable}
                    value={decision.condition.testedStatus}
                    onChange={(event) => patchCondition({
                      testedStatus: event.target.value as typeof decision.condition.testedStatus,
                    })}
                    SelectProps={{ native: true }}
                    sx={{ minWidth: 180 }}
                  >
                    <option value="not_tested">Not tested</option>
                    <option value="partially_tested">Partially tested</option>
                    <option value="tested">Tested</option>
                  </TextField>
                  {nextUnfinished ? (
                    <Button
                      variant="contained"
                      onClick={() => setActiveTestId(nextUnfinished.id)}
                      sx={{ fontWeight: 900, bgcolor: '#0284c7' }}
                    >
                      Next unfinished test
                    </Button>
                  ) : null}
                </Stack>
              </Stack>
            </>
          ) : (
            <Box sx={{ p: 3 }}>
              <Typography color="text.secondary">No relevant tests for this item.</Typography>
            </Box>
          )}
        </Box>
      </Stack>
    );
  };

  const renderOptionsTool = () => (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 44%) minmax(0, 1fr)' },
        gap: 1.5,
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          borderRadius: 2,
          border: '1px solid #c4b5fd',
          bgcolor: '#fafafa',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ px: 1.25, py: 1, bgcolor: '#4c1d95', color: '#fff' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 950 }}>
            Compare outcomes
          </Typography>
          <Typography variant="caption" sx={{ color: '#ddd6fe' }}>
            Estimates—not work performed
          </Typography>
        </Box>
        <Stack spacing={0.65} sx={{ p: 0.75 }}>
          {ranked.map((entry, index) => {
            const outcome = decision.outcomes.find((candidate) => candidate.id === entry.outcomeId);
            if (!outcome) return null;
            const active = activeOutcome?.id === outcome.id;
            return (
              <Button
                key={outcome.id}
                onClick={() => setActiveOutcomeId(outcome.id)}
                fullWidth
                sx={{
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  textTransform: 'none',
                  px: 1,
                  py: 0.9,
                  borderRadius: 1.5,
                  border: `2px solid ${active ? '#7c3aed' : '#e2e8f0'}`,
                  bgcolor: active ? '#f5f3ff' : '#fff',
                  color: '#0f172a',
                  '&:hover': { bgcolor: active ? '#f5f3ff' : '#f8fafc' },
                }}
              >
                <Box>
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <Typography variant="body2" sx={{ fontWeight: 950 }}>
                      {outcome.action.toUpperCase()} → {outcome.grade}
                    </Typography>
                    {index === 0 ? (
                      <Chip
                        size="small"
                        label="BEST"
                        sx={{ height: 19, bgcolor: '#7c3aed', color: '#fff', fontWeight: 900, fontSize: 10 }}
                      />
                    ) : null}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {entry.estimatedMinutes}m · parts {fmtUsd(entry.partsAndOrdersCost)}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right', ml: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 950, color: '#5b21b6' }}>
                    {perMinute(entry.contributionPerLaborMinute)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {fmtUsd(entry.contribution)}
                  </Typography>
                </Box>
              </Button>
            );
          })}
          {!ranked.length ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
              Add complete valuations to compare outcomes.
            </Typography>
          ) : null}
        </Stack>
      </Box>

      <Box
        sx={{
          borderRadius: 2,
          border: '2px solid #7c3aed',
          bgcolor: '#fff',
          overflow: 'hidden',
        }}
      >
        {activeOutcome && activeOutcomeEconomics ? (
          <>
            <Box sx={{ px: 1.5, py: 1.25, bgcolor: '#f5f3ff', borderBottom: '1px solid #c4b5fd' }}>
              <Typography variant="overline" sx={{ color: '#6d28d9', fontWeight: 900, lineHeight: 1 }}>
                Estimate
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 950, color: '#3b0764' }}>
                {activeOutcome.action.toUpperCase()} → {activeOutcome.grade}
              </Typography>
            </Box>
            <Stack spacing={1.5} sx={{ p: 1.5 }}>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 1,
                }}
              >
                {[
                  ['Grade value', fmtUsd(activeOutcomeEconomics.processorValue)],
                  ['Parts', fmtUsd(activeOutcomeEconomics.partsAndOrdersCost)],
                  ['Contribution', fmtUsd(activeOutcomeEconomics.contribution)],
                  ['Per labor min', perMinute(activeOutcomeEconomics.contributionPerLaborMinute)],
                ].map(([label, value]) => (
                  <Box key={label} sx={{ p: 1, borderRadius: 1.5, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                      {label}
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 950, color: '#0f172a' }}>
                      {value}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '110px 1fr 1fr' },
                  gap: 1,
                }}
              >
                <TextField
                  size="small"
                  label="Minutes"
                  type="number"
                  value={activeOutcome.estimatedMinutes}
                  disabled={!editable}
                  onChange={(event) => patchOutcome(activeOutcome.id, {
                    estimatedMinutes: Math.max(0, Number(event.target.value) || 0),
                  })}
                  inputProps={{ min: 0, step: 1 }}
                />
                <TextField
                  select
                  size="small"
                  label="Task"
                  value={activeOutcome.action}
                  disabled={!editable}
                  onChange={(event) => patchOutcome(activeOutcome.id, {
                    action: event.target.value as TarsActionType,
                  })}
                  SelectProps={{ native: true }}
                >
                  {ACTIONS.map((action) => (
                    <option key={action} value={action}>{TARS_ACTION_TYPE_LABELS[action]}</option>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Sale state"
                  value={activeOutcome.saleState}
                  disabled={!editable}
                  onChange={(event) => patchOutcome(activeOutcome.id, {
                    saleState: event.target.value as TarsSaleState,
                  })}
                  SelectProps={{ native: true }}
                >
                  {SALE_STATES.map((state) => (
                    <option key={state} value={state}>{TARS_SALE_STATE_LABELS[state]}</option>
                  ))}
                </TextField>
              </Box>

              {activeOutcome.estimatedAt ? (
                <Typography variant="caption" color="text.secondary">
                  Estimate updated {shortTime(activeOutcome.estimatedAt)}
                </Typography>
              ) : null}

              <Button
                variant="contained"
                disabled={!editable || activeOutcomeEconomics.blocked || !activeOutcomeEconomics.viable}
                onClick={() => {
                  setCandidateOutcomeId(activeOutcome.id);
                  setActiveTool('decision');
                }}
                sx={{ alignSelf: 'flex-end', fontWeight: 950, bgcolor: '#7c3aed' }}
              >
                Take this option to Decision
              </Button>
            </Stack>
          </>
        ) : (
          <Box sx={{ p: 3 }}>
            <Typography color="text.secondary">Select an outcome to inspect its estimate.</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );

  const renderDecisionTool = () => (
    <Stack spacing={1.5}>
      {candidateOutcome && candidateEconomics ? (
        <Box
          sx={{
            borderRadius: 2,
            border: '2px solid #15803d',
            overflow: 'hidden',
            bgcolor: '#fff',
          }}
        >
          <Box sx={{ p: 1.5, bgcolor: '#14532d', color: '#fff' }}>
            <Typography variant="overline" sx={{ color: '#bbf7d0', fontWeight: 900, lineHeight: 1 }}>
              {selected.outcomeId === candidateOutcome.id ? 'Committed decision' : 'Decision candidate'}
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 950, mt: 0.25 }}>
              {candidateOutcome.action.toUpperCase()} → {candidateOutcome.grade}
            </Typography>
            <Typography variant="body2" sx={{ color: '#dcfce7' }}>
              {TARS_SALE_STATE_LABELS[candidateOutcome.saleState]} · {candidateOutcome.estimatedMinutes}m ·{' '}
              {fmtUsd(candidateEconomics.partsAndOrdersCost)} parts
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
              gap: 1,
              p: 1.5,
              bgcolor: '#f0fdf4',
            }}
          >
            {[
              ['Value', fmtUsd(candidateEconomics.processorValue)],
              ['Contribution', fmtUsd(candidateEconomics.contribution)],
              ['Labor score', perMinute(candidateEconomics.contributionPerLaborMinute)],
              ['Current grade', currentGrade ?? 'Not set'],
            ].map(([label, value]) => (
              <Box key={label}>
                <Typography variant="caption" sx={{ color: '#166534', fontWeight: 800 }}>
                  {label}
                </Typography>
                <Typography variant="body1" sx={{ color: '#14532d', fontWeight: 950 }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ) : (
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #cbd5e1' }}>
          <Typography variant="body2" color="text.secondary">
            No option is ready for a decision.
          </Typography>
        </Box>
      )}

      {gates.mandatoryBlockers.length ? (
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#fef2f2', borderLeft: '6px solid #dc2626' }}>
          <Typography variant="body2" sx={{ fontWeight: 950, color: '#991b1b' }}>
            Cannot commit this path
          </Typography>
          <Typography variant="body2" sx={{ color: '#991b1b' }}>
            {gates.mandatoryBlockers[0]}
          </Typography>
        </Box>
      ) : null}

      {!currentGrade ? (
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#fffbeb', borderLeft: '6px solid #d97706' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 950, color: '#92400e' }}>
                Current grade is required
              </Typography>
              <Typography variant="caption" sx={{ color: '#92400e' }}>
                Record what the item is now before committing what it should become.
              </Typography>
            </Box>
            <Button onClick={() => setActiveTool('grade')} sx={{ color: '#92400e', fontWeight: 900 }}>
              Open grade tool
            </Button>
          </Stack>
        </Box>
      ) : null}

      <TextField
        fullWidth
        multiline
        minRows={2}
        label="Why is this the right decision?"
        placeholder="Short, useful reason"
        disabled={!editable}
        value={reasonDraft || selected.reason}
        onChange={(event) => {
          setReasonDraft(event.target.value);
          if (selected.outcomeId === candidateOutcome?.id) {
            patchSelection({ reason: event.target.value });
          }
        }}
      />

      {gates.ordinaryBlockers.length && !gates.usesOverride ? (
        <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: '#fffbeb', border: '1px solid #f59e0b' }}>
          <Typography variant="caption" sx={{ fontWeight: 850, color: '#92400e' }}>
            Before Done: {gates.ordinaryBlockers.join(' ')}
          </Typography>
        </Box>
      ) : null}

      <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap">
        <Button onClick={() => setActiveTool('options')} sx={{ fontWeight: 850 }}>
          Review options
        </Button>
        <Button
          variant="contained"
          color="success"
          disabled={!editable || !candidateOutcome || !currentGrade || Boolean(gates.mandatoryBlockers.length)}
          onClick={() => candidateOutcome && commitPlan(candidateOutcome)}
          sx={{ fontWeight: 950, minWidth: 180 }}
        >
          {selected.outcomeId === candidateOutcome?.id ? 'Update decision' : 'Commit decision'}
        </Button>
      </Stack>

      {selected.selectedAt ? (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'right' }}>
          Last committed {shortTime(selected.selectedAt)}
        </Typography>
      ) : null}
    </Stack>
  );

  const renderWorkTool = () => (
    <Stack spacing={1}>
      <Box>
        <Typography variant="h6" sx={{ color: '#134e4a', fontWeight: 950 }}>
          What did you do?
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Record performed TEST, REPAIR, ASSEMBLE, or SALVAGE work and its result.
        </Typography>
      </Box>
      <TarsWorkBenchTable
        session={session}
        readOnly={!editable}
        onSessionChange={onSessionChange}
      />
    </Stack>
  );

  const renderActiveTool = () => {
    if (activeTool === 'grade') return renderGradeTool();
    if (activeTool === 'tests') return renderTestsTool();
    if (activeTool === 'options') return renderOptionsTool();
    if (activeTool === 'decision') return renderDecisionTool();
    if (activeTool === 'work') return renderWorkTool();
    return null;
  };

  const renderCleanBench = () => (
    <Box
      sx={{
        height: '100%',
        minHeight: 260,
        display: 'grid',
        placeItems: 'center',
        p: 2,
      }}
    >
      <Box sx={{ maxWidth: 620, width: '100%', textAlign: 'center' }}>
        <Box
          sx={{
            width: 64,
            height: 64,
            mx: 'auto',
            mb: 1.5,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            bgcolor: decisionCommitted ? '#15803d' : '#334155',
            color: '#fff',
          }}
        >
          {decisionCommitted ? <CheckCircle sx={{ fontSize: 36 }} /> : <FactCheck sx={{ fontSize: 36 }} />}
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 950, color: '#0f172a' }}>
          {decisionCommitted ? 'Plan committed' : 'Choose the next action'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {decisionCommitted
            ? `${selected.action?.toUpperCase() ?? ''} → ${selected.grade ?? ''}. Record work when it is performed.`
            : 'Open one focused action. Closing it returns to the restoration log.'}
        </Typography>

        {suggestedTool ? (
          <Button
            variant="contained"
            onClick={() => setActiveTool(suggestedTool)}
            sx={{
              mt: 2,
              fontWeight: 950,
              bgcolor: tools.find((tool) => tool.id === suggestedTool)?.color,
            }}
          >
            Open {tools.find((tool) => tool.id === suggestedTool)?.label}
          </Button>
        ) : (
          <Typography variant="caption" sx={{ display: 'block', mt: 2, color: '#166534', fontWeight: 850 }}>
            Decision ready. Use Done above when work is complete.
          </Typography>
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
      <StudioFlashToast
        message={flash?.message ?? null}
        tone={flash?.tone ?? 'info'}
        onDismiss={() => setFlash(null)}
      />
      <Dialog
        open={testChooserOpen}
        onClose={() => setTestChooserOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 950 }}>Add a test</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Search baked tests"
            value={testSearch}
            onChange={(event) => setTestSearch(event.target.value)}
            sx={{ mt: 0.5, mb: 1 }}
          />
          <Stack spacing={0.6}>
            {filteredTestCatalog.map((entry) => {
              const alreadyAdded = decision.tests.some((test) => test.catalogTestId === entry.id && test.relevant);
              return (
                <Button
                  key={entry.id}
                  disabled={alreadyAdded}
                  onClick={() => {
                    const id = addTest(entry);
                    setActiveTestId(id);
                    setTestChooserOpen(false);
                    setTestSearch('');
                  }}
                  sx={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    textTransform: 'none',
                    p: 1,
                    border: '1px solid #dce3ea',
                    color: '#172033',
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 900 }}>
                      {entry.name}{alreadyAdded ? ' · already added' : ''}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#65748a' }}>
                      {entry.prompt}
                    </Typography>
                  </Box>
                </Button>
              );
            })}
            {!filteredTestCatalog.length ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                No baked test matches that search.
              </Typography>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestChooserOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              const id = addTest();
              setActiveTestId(id);
              setTestChooserOpen(false);
              setTestSearch('');
            }}
          >
            Create custom test
          </Button>
        </DialogActions>
      </Dialog>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: `${studio.radius.md}px`,
          border: '1px solid #cbd5df',
          overflow: 'hidden',
          bgcolor: '#fff',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.07)',
        }}
      >
        <Box
          sx={{
            flexShrink: 0,
            px: 1,
            py: 0.75,
            bgcolor: '#f7f9fb',
            borderBottom: '1px solid #dce3ea',
            overflowX: 'auto',
          }}
        >
          <Stack direction="row" spacing={0.55} alignItems="center" sx={{ minWidth: 'max-content' }}>
            {tools.map((tool) => (
              <Button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
                startIcon={tool.icon}
                sx={{
                  minHeight: 34,
                  px: 1,
                  textTransform: 'none',
                  fontWeight: 900,
                  color: activeTool === tool.id ? '#fff' : '#344258',
                  bgcolor: activeTool === tool.id ? tool.color : '#fff',
                  border: `1px solid ${activeTool === tool.id ? tool.color : '#cbd5df'}`,
                  '&:hover': {
                    bgcolor: activeTool === tool.id ? tool.color : tool.tint,
                    borderColor: tool.color,
                  },
                  '& .MuiButton-startIcon': { color: activeTool === tool.id ? '#fff' : tool.color },
                }}
              >
                {tool.label}
                {tool.attention ? <WarningAmber sx={{ ml: 0.55, fontSize: 15 }} /> : null}
                {tool.done && !tool.attention ? <CheckCircle sx={{ ml: 0.55, fontSize: 15 }} /> : null}
              </Button>
            ))}
            <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            {onOpenParts ? (
              <Button
                onClick={onOpenParts}
                startIcon={<ShoppingCart />}
                sx={{ minHeight: 34, textTransform: 'none', fontWeight: 900, color: '#344258' }}
              >
                Parts
              </Button>
            ) : null}
            {onOpenHold ? (
              <Button
                onClick={onOpenHold}
                startIcon={<PauseCircle />}
                sx={{ minHeight: 34, textTransform: 'none', fontWeight: 900, color: '#8a4b08' }}
              >
                Hold
              </Button>
            ) : null}
            {onMoveToInbox ? (
              <Button
                onClick={onMoveToInbox}
                startIcon={<Undo />}
                sx={{ minHeight: 34, textTransform: 'none', fontWeight: 900, color: '#526177' }}
              >
                Inbox
              </Button>
            ) : null}
            {onRequestComplete ? (
              <Tooltip
                title={
                  job.needs_setup ? 'Processing must complete all grade values first.'
                  : !gates.canFinalize ? 'Assess the item and commit a plan first.'
                  : 'Review final grade, labor, parts, and destination.'
                }
              >
                <span>
                  <Button
                    variant="contained"
                    color="success"
                    disabled={!editable || job.needs_setup || !gates.canFinalize}
                    onClick={() => onRequestComplete(prepared)}
                    startIcon={<Done />}
                    sx={{ minHeight: 34, textTransform: 'none', fontWeight: 950 }}
                  >
                    Finish
                  </Button>
                </span>
              </Tooltip>
            ) : null}
          </Stack>
        </Box>

        <Box sx={{ flex: 1, p: { xs: 0.75, sm: 1 }, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          {currentTool ? (
            <StudioSurface
              sx={{
                height: '100%',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                border: 'none',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.12)',
              }}
            >
              <Box
                sx={{
                  flexShrink: 0,
                  px: 1.5,
                  py: 1.15,
                  bgcolor: currentTool.tint,
                  borderTop: `7px solid ${currentTool.color}`,
                  borderBottom: `1px solid ${currentTool.color}40`,
                }}
              >
                <Stack direction="row" alignItems="center" gap={1.1}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      flexShrink: 0,
                      borderRadius: 1.5,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: currentTool.color,
                      color: '#fff',
                    }}
                  >
                    {currentTool.icon}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 950, color: '#0f172a', lineHeight: 1.1 }}>
                      {currentTool.label}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#475569' }}>
                      {currentTool.purpose}
                    </Typography>
                  </Box>
                  <Tooltip title="Close action">
                    <IconButton
                      onClick={() => setActiveTool(null)}
                      aria-label="Close action"
                      sx={{
                        border: '1px solid #94a3b8',
                        bgcolor: '#fff',
                        color: '#334155',
                        '&:hover': { bgcolor: '#f8fafc' },
                      }}
                    >
                      <Close />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Box>
              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: { xs: 1.25, sm: 2 } }}>
                {renderActiveTool()}
              </Box>
            </StudioSurface>
          ) : renderCleanBench()}
        </Box>
      </Box>
    </Box>
  );
}
