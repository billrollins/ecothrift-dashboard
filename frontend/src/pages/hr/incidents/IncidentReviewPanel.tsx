/**
 * The AI review of one incident report (Bill, Dash Updates #133, 2026-11-13). Each tidied box shows the original and
 * the tidied wording with Keep / Revert; each question has an answer box that adds the answer to the report; Keep all /
 * Revert all; Done closes the review. Nothing changes until a person picks, and the original stays in the history.
 * Sizes stay put while choices change (no layout shift): the buttons keep their width, the status line keeps its row.
 */
import { useEffect, useState } from 'react';
import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import type { IncidentReview, IncidentTextField } from '../../../api/incidents.api';
import { FIELD_COPY, useIncidentCopy } from './incidentCopy';

export interface IncidentReviewPanelProps {
  review: IncidentReview;
  busy: boolean;
  onDecide: (choice: 'keep' | 'revert', field: IncidentTextField | null) => Promise<unknown>;
  onAnswer: (index: number, answer: string) => Promise<unknown>;
  onDone: () => Promise<unknown>;
}

function Wording({ label, text, strong }: { label: string; text: string; strong?: boolean }) {
  return (
    <Box sx={{ p: 1, borderRadius: 1, bgcolor: strong ? 'action.selected' : 'action.hover' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{label}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</Typography>
    </Box>
  );
}

export function IncidentReviewPanel({ review, busy, onDecide, onAnswer, onDone }: IncidentReviewPanelProps) {
  const { t, pick } = useIncidentCopy();
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  useEffect(() => setDrafts({}), [review.id]);
  const open = review.fields.filter((f) => f.now !== 'changed');
  const nothing = !review.fields.length && !review.questions.length;

  return (
    <Paper variant="outlined" data-testid="incident-ai-review" sx={{ p: 1.5, borderColor: 'primary.main' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <AutoAwesomeRounded color="primary" fontSize="small" />
        <Typography sx={{ fontWeight: 800, flex: 1 }}>{t('aiReview')}</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {nothing ? t('aiNothing') : t('aiIntro')}
      </Typography>

      {review.fields.length ? (
        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
          <Button size="small" variant="contained" disabled={busy || !open.length} sx={{ flex: { xs: 1, sm: 'none' } }}
            onClick={() => void onDecide('keep', null).catch(() => undefined)} data-testid="incident-ai-keep-all">
            {t('aiKeepAll')}
          </Button>
          <Button size="small" variant="outlined" disabled={busy || !open.length} sx={{ flex: { xs: 1, sm: 'none' } }}
            onClick={() => void onDecide('revert', null).catch(() => undefined)} data-testid="incident-ai-revert-all">
            {t('aiRevertAll')}
          </Button>
        </Stack>
      ) : null}

      <Stack spacing={1.5}>
        {review.fields.map((f) => {
          const kept = f.now === 'new';
          const changed = f.now === 'changed';
          const reverted = f.now === 'old' && f.choice === 'reverted';
          return (
            <Box key={f.field} data-testid={`incident-ai-field-${f.field}`}
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}>
              <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{pick(FIELD_COPY[f.field], f.field)}</Typography>
              <Stack spacing={0.75}>
                <Wording label={t('aiOriginal')} text={f.old} strong={!changed && !kept} />
                <Wording label={t('aiTidied')} text={f.new} strong={!changed && kept} />
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                {/* The picked one is filled; both keep their width either way. */}
                <Button size="small" variant={kept ? 'contained' : 'outlined'} disabled={busy || changed}
                  startIcon={<CheckRounded sx={{ visibility: kept ? 'visible' : 'hidden' }} />} sx={{ minWidth: 104 }}
                  onClick={() => void onDecide('keep', f.field).catch(() => undefined)}
                  data-testid={`incident-ai-keep-${f.field}`} aria-pressed={kept}>
                  {t('aiKeep')}
                </Button>
                <Button size="small" variant={reverted ? 'contained' : 'outlined'}
                  color="inherit" disabled={busy || changed} sx={{ minWidth: 104 }}
                  startIcon={<CheckRounded sx={{ visibility: reverted ? 'visible' : 'hidden' }} />}
                  onClick={() => void onDecide('revert', f.field).catch(() => undefined)}
                  data-testid={`incident-ai-revert-${f.field}`} aria-pressed={reverted}>
                  {t('aiRevert')}
                </Button>
              </Stack>
              {/* One line kept for this note, shown or not. */}
              <Typography variant="caption" color="warning.main"
                sx={{ display: 'block', minHeight: '1.66em', mt: 0.5, visibility: changed ? 'visible' : 'hidden' }}>
                {t('aiChangedSince')}
              </Typography>
            </Box>
          );
        })}
      </Stack>

      {review.questions.length ? (
        <Box sx={{ mt: 2 }}>
          <Typography sx={{ fontWeight: 700 }}>{t('aiQuestions')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('aiQuestionsHint')}</Typography>
          <Stack spacing={1.5}>
            {review.questions.map((q) => {
              const done = Boolean(q.answer);
              const draft = done ? q.answer : drafts[q.index] ?? '';
              return (
                <Box key={q.index} data-testid={`incident-ai-question-${q.index}`}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{q.question}</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
                    <TextField size="small" fullWidth value={draft} disabled={done || busy}
                      placeholder={t('aiAnswer')}
                      helperText={`${done ? t('aiAnswered') : t('aiGoesInto')} ${pick(FIELD_COPY[q.field], q.field)}`}
                      onChange={(e) => setDrafts((d) => ({ ...d, [q.index]: e.target.value }))}
                      slotProps={{ htmlInput: { maxLength: 1000, 'data-testid': `incident-ai-answer-${q.index}` } }} />
                    <Button variant="outlined" disabled={done || busy || !draft.trim()} sx={{ flexShrink: 0, minWidth: 140 }}
                      startIcon={<CheckRounded sx={{ visibility: done ? 'visible' : 'hidden' }} />}
                      onClick={() => void onAnswer(q.index, draft.trim()).catch(() => undefined)}
                      data-testid={`incident-ai-answer-save-${q.index}`}>
                      {t('aiSaveAnswer')}
                    </Button>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Box>
      ) : null}

      <Box sx={{ mt: 2 }}>
        <Button variant="text" disabled={busy} onClick={() => void onDone().catch(() => undefined)}
          data-testid="incident-ai-done">
          {t('aiDone')}
        </Button>
      </Box>
    </Paper>
  );
}
