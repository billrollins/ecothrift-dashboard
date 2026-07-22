import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
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
  const [hydratedId, setHydratedId] = useState<number | null>(null);

  const readOnly = audit?.status === 'submitted';

  useEffect(() => {
    if (!audit) return;
    if (hydratedId === audit.id) return;
    setResponses(audit.responses);
    setSummaryNotes(audit.summary_notes || '');
    const sectionCount = audit.responses?.sections?.length ?? 0;
    // Review mode opens on the summary; new/in-progress drafts start at section 0.
    setStep(audit.status === 'submitted' ? sectionCount : 0);
    setHydratedId(audit.id);
  }, [audit, hydratedId]);

  const sections = responses?.sections ?? [];
  const stepLabels = useMemo(
    () => [...sections.map((section) => section.title), 'Summary'],
    [sections],
  );
  const summaryIndex = sections.length;
  const isSummary = step === summaryIndex;

  const persist = useCallback(
    async (nextResponses: QualityAuditResponses, nextSummaryNotes?: string) => {
      if (!id || readOnly) return;
      await updateAudit.mutateAsync({
        id,
        responses: nextResponses,
        summary_notes: nextSummaryNotes ?? summaryNotes,
      });
    },
    [id, readOnly, summaryNotes, updateAudit],
  );

  function updateSection(sectionIndex: number, updater: (section: QualityAuditSection) => QualityAuditSection) {
    if (!responses || readOnly) return;
    const nextSections = responses.sections.map((section, index) =>
      index === sectionIndex ? updater(section) : section,
    );
    setResponses({ ...responses, sections: nextSections });
  }

  function handleCheckChange(sectionIndex: number, checkId: string, patch: CheckPatch) {
    if (readOnly) return;
    updateSection(sectionIndex, (section) => ({
      ...section,
      checks: section.checks.map((check) =>
        check.id === checkId ? ({ ...check, ...patch } as QualityAuditCheck) : check,
      ),
    }));
  }

  async function handleNext() {
    if (!responses || isSummary || readOnly) return;
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
    if (responses && !isSummary && !readOnly) {
      try {
        await persist(responses);
      } catch {
        enqueueSnackbar('Could not save progress.', { variant: 'warning' });
      }
    }
    setStep((prev) => prev - 1);
  }

  async function handleSubmitConfirmed() {
    if (!responses || !id || readOnly) return;
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
  const liveGrade = readOnly ? audit.overall_grade || overallGrade(responses) : overallGrade(responses);
  const liveRate = passRate(responses);
  const pct = completionPct(responses);

  return (
    <Box>
      <QualityAuditMobileShell
        title={audit.form_title || 'Quality audit'}
        intro={readOnly ? 'Submitted audit — review only' : audit.form_title ? undefined : 'Floor QA'}
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
          isSummary ? (
            readOnly ? (
              <Button
                variant="contained"
                onClick={() => navigate('/admin/quality-audit')}
                fullWidth
                sx={{ minHeight: 48, fontWeight: 800 }}
              >
                Back to audits
              </Button>
            ) : null
          ) : (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
              <Button
                onClick={handleBack}
                disabled={!readOnly && (updateAudit.isPending || submitAudit.isPending)}
                sx={{ minHeight: 48 }}
              >
                {step === 0 ? 'Exit' : 'Back'}
              </Button>
              <Box sx={{ flex: 1 }} />
              {readOnly ? (
                <>
                  <Chip size="small" label="Review" color="default" />
                  <Button
                    variant="contained"
                    onClick={() => setStep(summaryIndex)}
                    sx={{ minHeight: 48, fontWeight: 800, px: 3 }}
                  >
                    Summary
                  </Button>
                </>
              ) : (
                <>
                  <Typography variant="caption" color="text.secondary" fontWeight={700}>
                    {isSectionComplete(currentSection) ? 'Ready' : 'Answer all'}
                  </Typography>
                  <Button
                    variant="contained"
                    onClick={handleNext}
                    disabled={updateAudit.isPending || !isSectionComplete(currentSection)}
                    sx={{ minHeight: 48, fontWeight: 800, px: 3 }}
                  >
                    {updateAudit.isPending ? (
                      <CircularProgress size={22} color="inherit" />
                    ) : step === sections.length - 1 ? (
                      'Review'
                    ) : (
                      'Next'
                    )}
                  </Button>
                </>
              )}
            </Stack>
          )
        }
      >
        {!isSummary && currentSection ? (
          <QualityAuditSectionStep
            section={currentSection}
            onChange={(checkId, patch) => handleCheckChange(step, checkId, patch)}
            readOnly={readOnly}
          />
        ) : null}

        {isSummary ? (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {readOnly
                ? 'Browse each section to see how checks were answered.'
                : 'Review each section, edit as needed, then submit. The grade updates the dashboard.'}
            </Typography>
            <QualityAuditSummaryStep
              responses={responses}
              summaryNotes={summaryNotes}
              onSummaryNotesChange={setSummaryNotes}
              onEditSection={(sectionIndex) => setStep(sectionIndex)}
              onSubmit={() => setConfirmSubmitOpen(true)}
              submitting={submitAudit.isPending}
              error={submitError}
              readOnly={readOnly}
              finalGrade={audit.overall_grade}
            />
            {!readOnly ? (
              <Button onClick={handleBack} sx={{ mt: 2, minHeight: 44 }} fullWidth variant="outlined">
                Back to sections
              </Button>
            ) : null}
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
