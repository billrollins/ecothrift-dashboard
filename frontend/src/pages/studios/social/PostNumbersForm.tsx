/**
 * A posted post's numbers (Lane F Phase 5; per channel since Phase 6): typed from each channel's insights after 1 day
 * and after 7 days. Pick the channel (only those it went out on), open the post there, read its insights, type the
 * six numbers, Save. Typing again replaces them.
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  NUMBER_FIELDS,
  NUMBER_LABELS,
  savePostNumbers,
  type ChannelNumbers,
  type NumberField,
  type PostNumbers,
  type SocialChannel,
} from '../../../api/marketing.api';
import { ccTokens } from '../../../theme';

type ApiError = { response?: { data?: { detail?: string } } };

function errorText(err: unknown, fallback: string): string {
  const detail = (err as ApiError)?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

type Draft = Record<NumberField, string>;

function draftOf(channel: ChannelNumbers | undefined, mark: 1 | 7): Draft {
  const row = channel ? (mark === 1 ? channel.day1 : channel.day7) : null;
  return Object.fromEntries(NUMBER_FIELDS.map((f) => [f, row ? String(row[f]) : ''])) as Draft;
}

/** Open on the mark that is due (the later one first), else the 7-day. */
function startMark(channel: ChannelNumbers | undefined): 1 | 7 {
  if (!channel) return 7;
  return channel.due.includes(7) ? 7 : channel.due.includes(1) ? 1 : 7;
}

export default function PostNumbersForm({ postId, numbers, onSaved }: {
  postId: number;
  numbers: PostNumbers;
  onSaved: (next: PostNumbers) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  // Open on the first channel with numbers due, else the first channel.
  const [key, setKey] = useState<SocialChannel>(
    () => (numbers.channels.find((c) => c.due.length) ?? numbers.channels[0])?.key ?? 'facebook',
  );
  const channel = numbers.channels.find((c) => c.key === key) ?? numbers.channels[0];
  const [mark, setMark] = useState<1 | 7>(() => startMark(channel));
  const [draft, setDraft] = useState<Draft>(() => draftOf(channel, mark));
  useEffect(() => { setDraft(draftOf(channel, mark)); }, [channel, mark]);
  const save = useMutation({
    mutationFn: () => savePostNumbers(postId, key, mark, Object.fromEntries(NUMBER_FIELDS.map((f) => [f, draft[f] || '0']))),
    onSuccess: (next) => { enqueueSnackbar('Numbers saved', { variant: 'success' }); onSaved(next); },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not save the numbers.'), { variant: 'error' }),
  });
  if (!channel) return null;
  const row = mark === 1 ? channel.day1 : channel.day7;
  const due = channel.due.length
    ? `Due: after ${channel.due.map((m) => (m === 1 ? '1 day' : '7 days')).join(' and after ')}.`
    : '';

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography sx={{ fontWeight: 700, flex: 1, minWidth: 140 }}>Numbers</Typography>
        <ToggleButtonGroup exclusive size="small" value={mark} onChange={(_e, v: 1 | 7 | null) => v && setMark(v)}>
          <ToggleButton value={1} sx={{ textTransform: 'none' }}>After 1 day{channel.day1 ? ' ✓' : ''}</ToggleButton>
          <ToggleButton value={7} sx={{ textTransform: 'none' }}>After 7 days{channel.day7 ? ' ✓' : ''}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {numbers.channels.length > 1 ? (
        <Box role="group" aria-label="Channel" sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
          {numbers.channels.map((c) => (
            <Chip
              key={c.key}
              size="small"
              label={c.due.length ? `${c.label} · due` : c.label}
              color={c.key === key ? 'primary' : c.due.length ? 'warning' : 'default'}
              variant={c.key === key ? 'filled' : 'outlined'}
              onClick={() => { setKey(c.key); setMark(startMark(c)); }}
              aria-pressed={c.key === key}
            />
          ))}
        </Box>
      ) : null}
      {due ? <Alert severity="info" sx={{ mb: 1, py: 0 }}>{due} Read them from the post's insights on {channel.label}.</Alert> : null}
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
          Save {channel.label} {mark === 1 ? '1-day' : '7-day'} numbers
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
