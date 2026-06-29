import { Box, LinearProgress, Stack, TextField, Typography, alpha } from '@mui/material';
import type { QualityAuditCheck, QualityAuditSection } from '../../types/qualityAudit.types';
import { QaControl, type CheckPatch } from './QaControl';
import { controlLabel, countSectionAnswered, deriveResult } from './qaScoring';

interface QualityAuditSectionStepProps {
  section: QualityAuditSection;
  onChange: (checkId: string, patch: CheckPatch) => void;
}

const ACCENT: Record<string, string> = {
  pass: '#2f7a48',
  fail: '#b3261e',
  na: '#9e9e9e',
  '': '#bd8618',
};

export function QualityAuditSectionStep({ section, onChange }: QualityAuditSectionStepProps) {
  const answered = countSectionAnswered(section);
  const total = section.checks.length;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6" fontWeight={800}>
          {section.title}
        </Typography>
        {section.intro ? (
          <Typography variant="body2" color="text.secondary">
            {section.intro}
          </Typography>
        ) : null}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
          <LinearProgress
            variant="determinate"
            value={total ? (answered / total) * 100 : 0}
            sx={{ flex: 1, height: 6, borderRadius: 3 }}
          />
          <Typography variant="caption" color="text.secondary" fontWeight={700}>
            {answered}/{total}
          </Typography>
        </Stack>
      </Box>

      {section.checks.map((check, index) => {
        const result = deriveResult(check);
        const accent = ACCENT[result] ?? ACCENT[''];
        return (
          <Box
            key={check.id}
            sx={{
              p: 1.75,
              borderRadius: 2.5,
              border: 1,
              borderColor: result ? alpha(accent, 0.4) : 'divider',
              borderLeft: `5px solid ${accent}`,
              bgcolor: 'background.paper',
              transition: 'border-color 0.2s ease',
            }}
          >
            <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ mb: 1.25 }}>
              <Typography
                variant="overline"
                sx={{ color: 'text.disabled', fontSize: '0.65rem', lineHeight: 1 }}
              >
                {index + 1}
              </Typography>
              <Typography variant="body1" fontWeight={700} sx={{ flex: 1 }}>
                {check.label}
              </Typography>
            </Stack>
            {check.hint ? (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
                {check.hint}
              </Typography>
            ) : null}
            <QaControl check={check} onChange={(patch) => onChange(check.id, patch)} />
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
              {controlLabel(check.control)}
            </Typography>
            {result === 'fail' || result === 'na' ? (
              <TextField
                label="Optional note"
                fullWidth
                multiline
                minRows={2}
                size="small"
                sx={{ mt: 1.25 }}
                value={check.notes || ''}
                onChange={(e) => onChange(check.id, { notes: e.target.value })}
              />
            ) : null}
          </Box>
        );
      })}
    </Stack>
  );
}

export { countSectionAnswered };

export type { QualityAuditCheck };
