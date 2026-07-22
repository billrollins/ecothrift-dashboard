import { Alert, Box, Button, LinearProgress, Stack, TextField, Typography, alpha } from '@mui/material';
import type { QualityAuditResponses, QualityAuditSection } from '../../types/qualityAudit.types';
import {
  answeredChecks,
  countSectionAnswered,
  deriveResult,
  isSectionComplete,
  overallGrade,
  passRate,
  summarizeCheck,
  totalChecks,
} from './qaScoring';
import { QaGradeRing } from './QaGradeRing';

interface QualityAuditSummaryStepProps {
  responses: QualityAuditResponses;
  summaryNotes: string;
  onSummaryNotesChange: (value: string) => void;
  onEditSection: (sectionIndex: number) => void;
  onSubmit: () => void;
  submitting?: boolean;
  error?: string | null;
  /** Submitted audit: browse only (no submit / notes edit). */
  readOnly?: boolean;
  finalGrade?: string;
}

const RESULT_DOT: Record<string, string> = {
  pass: '#2f7a48',
  fail: '#b3261e',
  na: '#9e9e9e',
  '': '#bd8618',
};

export function QualityAuditSummaryStep({
  responses,
  summaryNotes,
  onSummaryNotesChange,
  onEditSection,
  onSubmit,
  submitting,
  error,
  readOnly = false,
  finalGrade,
}: QualityAuditSummaryStepProps) {
  const total = totalChecks(responses);
  const answered = answeredChecks(responses);
  const allAnswered = answered === total;
  const rate = passRate(responses);
  const grade = (readOnly && finalGrade ? finalGrade : overallGrade(responses)) || overallGrade(responses);
  const failCount = responses.sections.reduce(
    (sum, s) => sum + s.checks.filter((c) => deriveResult(c) === 'fail').length,
    0,
  );

  return (
    <Stack spacing={2.25}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ p: 1.5, borderRadius: 3, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
        <QaGradeRing grade={grade} value={rate} size={104} label="grade" sublabel={`${Math.round(rate * 100)}%`} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={800}>
            {readOnly ? 'Final grade' : 'Projected grade'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {answered}/{total} answered · {failCount} fail{failCount === 1 ? '' : 's'}
          </Typography>
          {!readOnly && !allAnswered ? (
            <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
              Answer every check to submit.
            </Alert>
          ) : null}
        </Box>
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <Stack spacing={1.25}>
        {responses.sections.map((section, index) => (
          <SectionSummaryCard
            key={section.id}
            section={section}
            onEdit={() => onEditSection(index)}
            readOnly={readOnly}
          />
        ))}
      </Stack>

      <TextField
        label={readOnly ? 'Overall notes' : 'Overall notes (optional)'}
        fullWidth
        multiline
        minRows={3}
        value={summaryNotes}
        onChange={(e) => onSummaryNotesChange(e.target.value)}
        InputProps={{ readOnly }}
      />

      {readOnly ? null : (
        <Button
          variant="contained"
          fullWidth
          size="large"
          onClick={onSubmit}
          disabled={submitting || !allAnswered}
          sx={{ minHeight: 52, fontWeight: 800 }}
        >
          {submitting ? 'Submitting…' : 'Submit audit'}
        </Button>
      )}
    </Stack>
  );
}

function SectionSummaryCard({
  section,
  onEdit,
  readOnly,
}: {
  section: QualityAuditSection;
  onEdit: () => void;
  readOnly?: boolean;
}) {
  const answered = countSectionAnswered(section);
  const total = section.checks.length;
  const complete = isSectionComplete(section);
  const fails = section.checks.filter((c) => deriveResult(c) === 'fail');

  return (
    <Box sx={{ p: 1.75, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography fontWeight={800} noWrap>{section.title}</Typography>
          <Typography variant="caption" color="text.secondary">
            {answered}/{total} answered{complete ? ' · complete' : ''}
          </Typography>
        </Box>
        <Button size="small" onClick={onEdit} sx={{ minHeight: 44, flexShrink: 0 }}>
          {readOnly ? 'View' : 'Edit'}
        </Button>
      </Stack>
      <Stack direction="row" spacing={0.5} sx={{ mb: 1.25, flexWrap: 'wrap', rowGap: 0.5 }}>
        {section.checks.map((check) => {
          const result = deriveResult(check);
          return (
            <Box
              key={check.id}
              sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: RESULT_DOT[result] ?? RESULT_DOT[''] }}
            />
          );
        })}
      </Stack>
      <LinearProgress
        variant="determinate"
        value={total ? (answered / total) * 100 : 0}
        sx={{ height: 5, borderRadius: 3, mb: fails.length ? 1.25 : 0 }}
      />
      {fails.length > 0 ? (
        <Stack spacing={0.5}>
          {fails.map((check) => (
            <Box key={check.id} sx={{ pl: 1.25, borderLeft: `3px solid ${alpha('#b3261e', 0.6)}` }}>
              <Typography variant="body2" fontWeight={700}>{check.label}</Typography>
              <Typography variant="body2" color="text.secondary">{summarizeCheck(check)}</Typography>
            </Box>
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}
