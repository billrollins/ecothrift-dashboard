import { Alert, Box } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import {
  useDiscardRoutineDraft,
  useRoutine,
  useRoutineRun,
  useRoutineSubmission,
  useSaveRoutineDraft,
  useRerollSection,
  useStartRoutineSubmission,
  useSubmitRoutine,
} from '../../hooks/useRoutines';
import type { AnyRoutineResponses, RoutineKind } from '../../api/routines.api';
import { RoutinePhoneBar } from './RoutinePhoneBar';
import { KindRunner } from './runners/KindRunner';
import { emptyAudit } from './runners/SectionAuditFields';
import { issuesFound, resolveRunnerKind, runnerBlockers, submitLabel } from './runners/runnerStatus';

const DRAFT_DEBOUNCE_MS = 600;
const DEFAULT_MIN_ITEMS = 20;

export function RoutineRunnerPage({ runId }: { runId?: number }) {
  const params = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const parsed = runId ?? (params.id === 'new' ? null : Number(params.id));
  const id = parsed && Number.isFinite(parsed) ? parsed : null;
  const routineId = Number(search.get('routine') || 0) || null;
  const draftId = Number(search.get('draft') || 0) || null;
  const startMode = search.get('mode') === 'shelf' || search.get('mode') === 'non_shelf'
    ? search.get('mode') as 'shelf' | 'non_shelf'
    : undefined;
  const runQuery = useRoutineRun(id);
  const routineQuery = useRoutine(id ? null : routineId);
  const draftQuery = useRoutineSubmission(id ? null : draftId);
  const start = useStartRoutineSubmission();
  const saveDraft = useSaveRoutineDraft();
  const discard = useDiscardRoutineDraft();
  const submit = useSubmitRoutine();
  const reroll = useRerollSection();
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const [responses, setResponses] = useState<AnyRoutineResponses | null>(null);
  const [error, setError] = useState('');
  const starting = useRef(false);
  const startFailed = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Typing in a number or text check must not fire a request per keystroke.
  function queueDraft(next: AnyRoutineResponses) {
    if (!submissionId) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      void saveDraft.mutateAsync({ id: submissionId, responses: next });
    }, DRAFT_DEBOUNCE_MS);
  }

  useEffect(() => () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
  }, []);

  useEffect(() => {
    if (runQuery.data?.draft) {
      setSubmissionId(runQuery.data.draft.id);
      setResponses(runQuery.data.draft.responses);
    }
  }, [runQuery.data]);

  useEffect(() => {
    if (draftQuery.data) {
      setSubmissionId(draftQuery.data.id);
      setResponses(draftQuery.data.responses);
    }
  }, [draftQuery.data]);

  const finished = runQuery.data?.status === 'done';

  useEffect(() => {
    if (finished || startFailed.current) return;
    const routine = runQuery.data?.routine || routineId;
    if (!routine || responses || submissionId || starting.current) return;
    if (id && !runQuery.data) return;
    if (!id && !routineQuery.data) return;
    if (draftId && !draftQuery.data && !draftQuery.isError) return;
    if (draftId && draftQuery.data) return;
    starting.current = true;
    void start.mutateAsync({
      routine,
      run: runQuery.data?.id,
      mode: startMode,
    }).then((row) => {
      setSubmissionId(row.id);
      setResponses(row.responses);
    }).catch(() => {
      startFailed.current = true;
      starting.current = false;
      setError('Could not start that routine.');
    });
  }, [draftId, draftQuery.data, draftQuery.isError, finished, id, responses, routineId, routineQuery.data, runQuery.data, start, startMode, submissionId]);

  const run = runQuery.data;
  const routine = routineQuery.data;
  const kind: RoutineKind = resolveRunnerKind(
    run?.kind || routine?.kind || draftQuery.data?.kind || 'checklist',
    responses,
  );
  const title = run?.title || routine?.title || 'Routine';
  const subject = run?.section_name || run?.subject || '';
  const taxonomy = run?.taxonomy ?? routine?.runner?.taxonomy ?? null;
  const verify = run?.verify ?? null;
  const minItems = run?.audit_min_items ?? DEFAULT_MIN_ITEMS;
  const sections = run?.sections ?? routine?.runner?.sections ?? [];
  const nonShelfChecks = routine?.runner?.non_shelf_checks ?? [];
  const blockers = runnerBlockers(kind, responses, minItems);

  function goBack() {
    navigate('/routines');
  }

  async function handleCancel() {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (submissionId && !finished) {
      try {
        await discard.mutateAsync(submissionId);
      } catch {
        enqueueSnackbar('Could not discard that draft', { variant: 'error' });
      }
    }
    goBack();
  }

  async function handleSave() {
    if (!submissionId || !responses) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    try {
      if (blockers.length) {
        await saveDraft.mutateAsync({ id: submissionId, responses });
        enqueueSnackbar(`Draft saved · ${blockers[0].toLowerCase()}`, { variant: 'info' });
        goBack();
        return;
      }
      await submit.mutateAsync({ id: submissionId, responses });
      const found = issuesFound(kind, responses);
      enqueueSnackbar(
        found > 0 ? `${title} submitted · ${found} logged` : `${title} submitted`,
        { variant: found > 0 ? 'warning' : 'success' },
      );
      goBack();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string | string[] } } })?.response?.data?.detail;
      const message = Array.isArray(detail) ? detail[0] : detail;
      enqueueSnackbar(typeof message === 'string' ? message : 'Could not save.', { variant: 'error' });
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') void handleCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if ((id && runQuery.isLoading && !run) || (!id && routineQuery.isLoading && !routine)) {
    return <LoadingScreen message="Opening routine..." />;
  }
  if (!id && draftId && draftQuery.isLoading && !draftQuery.data) {
    return <LoadingScreen message="Opening draft..." />;
  }
  if (id && runQuery.isError) {
    return <Alert severity="error">This routine is not available.</Alert>;
  }
  if (finished && run) {
    const submitted = run.submission?.responses;
    const outcome = run.has_critical_fail
      ? 'Critical fail'
      : run.failed_count > 0
        ? `${run.failed_count} logged`
        : 'Nothing found';
    const by = run.completed_by_name ? ` · ${run.completed_by_name}` : '';
    return (
      <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {submitted ? (
            <KindRunner
              kind={kind}
              title={title}
              subject={`${outcome}${by}`}
              responses={submitted}
              taxonomy={taxonomy}
              verify={verify}
              minItems={minItems}
              sections={sections}
              nonShelfChecks={nonShelfChecks}
              readOnly
            />
          ) : (
            <Alert severity="info" sx={{ m: 2 }}>This run was closed without a submission.</Alert>
          )}
        </Box>
        <RoutinePhoneBar mode="review" onCancel={goBack} />
      </Box>
    );
  }
  if (!responses) {
    return error ? <Alert severity="error">{error}</Alert> : <LoadingScreen message="Starting..." />;
  }

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <KindRunner
          kind={kind}
          title={title}
          subject={subject}
          responses={responses}
          taxonomy={taxonomy}
          verify={verify}
          minItems={minItems}
          sections={sections}
          nonShelfChecks={nonShelfChecks}
          onChange={(next) => {
            setResponses(next);
            queueDraft(next);
          }}
          reroll={kind === 'owner_spot' && id
            ? {
              onClick: () => {
                void reroll.mutateAsync(id).then((row) => {
                  setResponses((prev) => {
                    if (!prev || !('audit' in prev)) return prev;
                    return {
                      ...prev,
                      audit: emptyAudit(row.section, row.section_name || row.subject || ''),
                    };
                  });
                }).catch((err: unknown) => {
                  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                  enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not pick another section.', { variant: 'error' });
                });
              },
              disabled: !run?.can_reroll || reroll.isPending,
            }
            : undefined}
        />
      </Box>
      <RoutinePhoneBar
        mode="fill"
        onCancel={() => void handleCancel()}
        onSave={() => void handleSave()}
        saveLabel={blockers.length ? 'Save & close' : submitLabel(kind, responses, minItems)}
        saving={saveDraft.isPending || submit.isPending || discard.isPending}
      />
    </Box>
  );
}

export default function RoutineRunnerRoute() {
  return <RoutineRunnerPage />;
}
