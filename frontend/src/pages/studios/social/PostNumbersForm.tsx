/**
 * A posted post's numbers (Lane F Phase 5): typed from Facebook's insights after 1 day and after 7 days. Open the
 * post on Facebook (the link is above), read its insights, type the six numbers, Save. Typing again replaces them.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  NUMBER_FIELDS,
  NUMBER_LABELS,
  savePostNumbers,
  type NumberField,
  type PostNumbers,
} from '../../../api/marketing.api';
import { ccTokens } from '../../../theme';

type ApiError = { response?: { data?: { detail?: string } } };

function errorText(err: unknown, fallback: string): string {
  const detail = (err as ApiError)?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

type Draft = Record<NumberField, string>;

function draftOf(numbers: PostNumbers, mark: 1 | 7): Draft {
  const row = mark === 1 ? numbers.day1 : numbers.day7;
  return Object.fromEntries(NUMBER_FIELDS.map((f) => [f, row ? String(row[f]) : ''])) as Draft;
}

export default function PostNumbersForm({ postId, numbers, onSaved }: {
  postId: number;
  numbers: PostNumbers;
  onSaved: (next: PostNumbers) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  // Open on the mark that is due (the later one first), else the 7-day.
  const [mark, setMark] = useState<1 | 7>(numbers.due.includes(7) ? 7 : numbers.due.includes(1) ? 1 : 7);
  const [draft, setDraft] = useState<Draft>(() => draftOf(numbers, mark));
  useEffect(() => { setDraft(draftOf(numbers, mark)); }, [numbers, mark]);
  const save = useMutation({
    mutationFn: () => savePostNumbers(postId, mark, Object.fromEntries(NUMBER_FIELDS.map((f) => [f, draft[f] || '0']))),
    onSuccess: (next) => { enqueueSnackbar('Numbers saved', { variant: 'success' }); onSaved(next); },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not save the numbers.'), { variant: 'error' }),
  });
  const row = mark === 1 ? numbers.day1 : numbers.day7;
  const due = numbers.due.length
    ? `Due: ${numbers.due.map((m) => (m === 1 ? 'after 1 day' : 'after 7 days')).join(' and ')}.`
    : '';

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 140 }}>Numbers</Typography>
        <ToggleButtonGroup exclusive size="small" value={mark} onChange={(_e, v: 1 | 7 | null) => v && setMark(v)}>
          <ToggleButton value={1} sx={{ textTransform: 'none' }}>After 1 day{numbers.day1 ? ' ✓' : ''}</ToggleButton>
          <ToggleButton value={7} sx={{ textTransform: 'none' }}>After 7 days{numbers.day7 ? ' ✓' : ''}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {due ? <Alert severity="info" sx={{ mb: 1, py: 0 }}>{due} Read them from the post's insights on Facebook.</Alert> : null}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
        {NUMBER_FIELDS.map((f) => (
          <TextField
            key={f}
            size="small"
            label={NUMBER_LABELS[f]}
            value={draft[f]}
            onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value.replace(/[^\d]/g, '') }))}
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" size="small" disabled={save.isPending} onClick={() => save.mutate()}>
          Save {mark === 1 ? '1-day' : '7-day'} numbers
        </Button>
        {row ? (
          <Typography sx={{ fontSize: 12.5, color: ccTokens.ink3 }}>
            Engagement {row.engagement}{row.entered_by_name ? ` · ${row.entered_by_name}` : ''}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
