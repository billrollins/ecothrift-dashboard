import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { QualityAuditMobileShell } from '../../components/quality-audit/QualityAuditMobileShell';
import { QualityAuditSectionStep } from '../../components/quality-audit/QualityAuditSectionStep';
import { QualityAuditSummaryStep } from '../../components/quality-audit/QualityAuditSummaryStep';
import type { CheckPatch } from '../../components/quality-audit/QaControl';
import {
  useQualityAudit,
  useSubmitQualityAudit,
  useUpdateQualityAudit,
} from '../../hooks/useQualityAudit';
import { useSnackbar } from 'notistack';
import type {
  QualityAuditCheck,
  QualityAuditResponses,
  QualityAuditSection,
} from '../../types/qualityAudit.types';
import {
  completionPct,
  isSectionComplete,
  overallGrade,
  passRate,
} from '../../components/quality-audit/qaScoring';

export default function QualityAuditWizardPage() {
  const { auditId } = useParams<{ auditId: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const id = auditId ? Number.parseInt(auditId, 10) : null;
  const { data: audit, isLoading, error } = useQualityAudit(Number.isFinite(id) ? id : null);
  const updateAudit = useUpdateQualityAudit();
  const submitAudit = useSubmitQualityAudit();

  const [step, setStep] = useState(0);
  const [responses, setResponses] = useState<QualityAuditResponses | null>(null);
  const [summaryNotes, setSummaryNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  useEffect(() => {
    if (!audit) return;
    setResponses(audit.responses);
    setSummaryNotes(audit.summary_notes || '');
    if (audit.status === 'submitted') {
      navigate('/admin/quality-audit', { replace: true });
    }
  }, [audit, navigate]);

  const sections = responses?.sections ?? [];
  const stepLabels = useMemo(
    () => [...sections.map((section) => section.title), 'Summary'],
    [sections],
  );
  const summaryIndex = sections.length;
  const isSummary = step === summaryIndex;

  const persist = useCallback(
    async (nextResponses: QualityAuditResponses, nextSummaryNotes?: string) => {
      if (!id) return;
      await updateAudit.mutateAsync({
        id,
        responses: nextResponses,
        summary_notes: nextSummaryNotes ?? summaryNotes,
      });
    },
    [id, summaryNotes, updateAudit],
  );

  function updateSection(sectionIndex: number, updater: (section: QualityAuditSection) => QualityAuditSection) {
    if (!responses) return;
    const nextSections = responses.sections.map((section, index) =>
      index === sectionIndex ? updater(section) : section,
    );
    setResponses({ ...responses, sections: nextSections });
  }

  function handleCheckChange(sectionIndex: number, checkId: string, patch: CheckPatch) {
    updateSection(sectionIndex, (section) => ({
      ...section,
      checks: section.checks.map((check) =>
        check.id === checkId ? ({ ...check, ...patch } as QualityAuditCheck) : check,
      ),
    }));
  }

  async function handleNext() {
    if (!responses || isSummary) return;
    const currentSection = sections[step];
    if (!isSectionComplete(currentSection)) {
      enqueueSnackbar('Answer every check before continuing.', { variant: 'warning' });
      return;
    }
    try {
      await persist(responses);
      setStep((prev) => prev + 1);
    } catch {
      enqueueSnackbar('Could not save progress. Try again.', { variant: 'error' });
    }
  }

  async function handleBack() {
    if (step <= 0) {
      navigate('/admin/quality-audit');
      return;
    }
    if (responses && !isSummary) {
      try {
        await persist(responses);
      } catch {
        enqueueSnackbar('Could not save progress.', { variant: 'warning' });
      }
    }
    setStep((prev) => prev - 1);
  }

  async function handleSubmitConfirmed() {
    if (!responses || !id) return;
    setSubmitError(null);
    try {
      const result = await submitAudit.mutateAsync({
        id,
        responses,
        summary_notes: summaryNotes,
      });
      setConfirmSubmitOpen(false);
      enqueueSnackbar(`Audit submitted — grade ${result.overall_grade || 'saved'}.`, {
        variant: 'success',
      });
      navigate('/admin/quality-audit');
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Could not submit audit.';
      setSubmitError(typeof detail === 'string' ? detail : 'Could not submit audit.');
      setConfirmSubmitOpen(false);
    }
  }

  if (!Number.isFinite(id)) {
    return <Alert severity="error">Invalid audit id.</Alert>;
  }

  if (isLoading || !audit || !responses) {
    return <LoadingScreen message="Loading audit…" />;
  }

  if (error) {
    return <Alert severity="error">Could not load this audit.</Alert>;
  }

  const currentSection = sections[step];
  const sectionCompleteFlags = sections.map(isSectionComplete);
  const liveGrade = overallGrade(responses);
  const liveRate = passRate(responses);
  const pct = completionPct(responses);

  return (
    <Box>
      <QualityAuditMobileShell
        title={audit.form_title || 'Quality audit'}
        intro={audit.form_title ? undefined : 'Floor QA'}
        auditorName={audit.conducted_by_name || '—'}
        startedAt={audit.started_at}
        step={step}
        stepLabels={stepLabels}
        completionPct={pct}
        liveGrade={liveGrade}
        passRate={liveRate}
        sectionComplete={sectionCompleteFlags}
        onJumpStep={(s) => setStep(s)}
        footer={
          isSummary ? null : (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
              <Button onClick={handleBack} disabled={updateAudit.isPending || submitAudit.isPending} sx={{ minHeight: 48 }}>
                {step === 0 ? 'Exit' : 'Back'}
              </Button>
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                {isSectionComplete(currentSection) ? 'Ready' : 'Answer all'}
              </Typography>
              <Button
                variant="contained"
                onClick={handleNext}
                disabled={updateAudit.isPending || !isSectionComplete(currentSection)}
                sx={{ minHeight: 48, fontWeight: 800, px: 3 }}
              >
                {updateAudit.isPending ? <CircularProgress size={22} color="inherit" /> : step === sections.length - 1 ? 'Review' : 'Next'}
              </Button>
            </Stack>
          )
        }
      >
        {!isSummary && currentSection ? (
          <QualityAuditSectionStep
            section={currentSection}
            onChange={(checkId, patch) => handleCheckChange(step, checkId, patch)}
          />
        ) : null}

        {isSummary ? (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Review each section, edit as needed, then submit. The grade updates the dashboard.
            </Typography>
            <QualityAuditSummaryStep
              responses={responses}
              summaryNotes={summaryNotes}
              onSummaryNotesChange={setSummaryNotes}
              onEditSection={(sectionIndex) => setStep(sectionIndex)}
              onSubmit={() => setConfirmSubmitOpen(true)}
              submitting={submitAudit.isPending}
              error={submitError}
            />
            <Button onClick={handleBack} sx={{ mt: 2, minHeight: 44 }} fullWidth variant="outlined">
              Back to sections
            </Button>
          </Box>
        ) : null}
      </QualityAuditMobileShell>

      <ConfirmDialog
        open={confirmSubmitOpen}
        title="Submit audit?"
        message="This finalizes the QA and updates the dashboard grade. You cannot edit it afterward."
        confirmLabel="Submit"
        onConfirm={handleSubmitConfirmed}
        onCancel={() => setConfirmSubmitOpen(false)}
        loading={submitAudit.isPending}
      />
    </Box>
  );
}
