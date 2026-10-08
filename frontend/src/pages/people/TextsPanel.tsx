import { Alert, Box, Button, Chip, Collapse, Stack, TextField, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { getTextsLog, saveCareers, TEXT_TEMPLATES, type TextLogRow } from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { fillTemplate, textStats } from './emailTemplate';
import { errorText, shortDate } from './peopleUi';

/** The 10DLC campaign's opt-in sample, word for word (the server's OPT_IN_TEXT). Not editable. */
export const OPT_IN_TEXT =
  "Eco-Thrift: You'll get texts about your job application. Msg frequency varies. Msg & data rates may apply. " +
  'Reply HELP for help, STOP to cancel.';

const SAMPLE: Record<string, string> = {
  first_name: 'Dana',
  role: 'Retail Associate',
  when: 'Thu, Oct 8 at 2:00 PM',
  link: 'https://ecothrift.us/careers/interview?t=Xk2…',
  start_date: 'Mon, Oct 19',
  start_time: '9:00 AM',
  supervisor: 'Bill Rollins',
};

const STATUS_COLOR: Record<TextLogRow['status'], 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  held: 'info',
  sent: 'success',
  failed: 'error',
  no_consent: 'default',
  opted_out: 'warning',
  no_number: 'default',
  practice: 'default',
};

/** Is texting live, what it waits on, and every applicant text sent or held. */
export function TextingStatus() {
  const log = useQuery({ queryKey: ['hiring', 'texts-log'], queryFn: async () => (await getTextsLog()).data });
  const [showAll, setShowAll] = useState(false);
  if (!log.data) return null;
  const { waiting_on: waiting, counts, texts } = log.data;
  const shown = texts.filter((t) => t.status !== 'no_consent' && t.status !== 'no_number');
  return (
    <Box sx={{ mb: 2 }}>
      {waiting.length ? (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          <b>Texting is not live yet.</b> Waiting on: {waiting.join('; ')}. Until then each text is <b>held</b>: recorded
          on the applicant&rsquo;s history with its exact words, not sent.
        </Alert>
      ) : (
        <Alert severity="success" sx={{ mb: 1.5 }}>
          Texting is live: applicants who ticked the text box get these texts.
        </Alert>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="overline" sx={{ color: ccTokens.ink2, fontWeight: 700 }}>
          Texts so far
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {counts.held ?? 0} held · {counts.sent ?? 0} sent{counts.opted_out ? ` · ${counts.opted_out} stopped` : ''}
        </Typography>
        {shown.length > 0 && (
          <Button size="small" onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'Hide them' : 'Show them'}
          </Button>
        )}
      </Box>
      <Collapse in={showAll} unmountOnExit>
        <Stack spacing={0.75} sx={{ mt: 1 }}>
          {shown.slice(0, 50).map((t) => (
            <Box key={t.id} sx={{ p: 1.25, borderRadius: ccTokens.rSm, border: `1px solid ${ccTokens.line}`, bgcolor: '#fff' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" fontWeight={700}>
                  {t.label}
                </Typography>
                <Chip size="small" label={t.status_label} color={STATUS_COLOR[t.status]} variant="outlined" />
                {t.edited && <Chip size="small" label="edited" />}
                <Box sx={{ flex: 1 }} />
                {t.applicant?.id ? (
                  <Button size="small" component={RouterLink} to={`/people/applicants?id=${t.applicant.id}`}>
                    {t.applicant.name || 'Applicant'}
                  </Button>
                ) : null}
                <Typography variant="caption" color="text.secondary">
                  {t.phone_last4 ? `…${t.phone_last4} · ` : ''}
                  {shortDate(t.at)}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ mt: 0.5, color: ccTokens.ink2 }}>
                {t.body}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

/** One applicant text's words (careers file ``texts``), the short address, and a sample. */
export function TextTemplatePanel({ textKey, texts }: { textKey: string; texts: Record<string, string> }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const meta = TEXT_TEMPLATES.find((t) => t.key === textKey);
  const fixed = textKey === 'opt_in';
  const saved = fixed ? OPT_IN_TEXT : texts[textKey] ?? '';
  const [draft, setDraft] = useState(saved);
  const [place, setPlace] = useState(texts.place ?? '');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setDraft(saved);
    setPlace(texts.place ?? '');
  }, [textKey, saved, texts.place]);

  const sample = fillTemplate(draft, { ...SAMPLE, place: place || texts.place || '' });
  const stats = textStats(sample);
  const changed = draft !== saved || place !== (texts.place ?? '');
  const problems = [
    !draft.trim().startsWith('Eco-Thrift:') && 'Start with "Eco-Thrift:" (texts say who sent them).',
    !/\bSTOP\b/.test(draft) && 'Say how to stop, e.g. "Reply STOP to opt out."',
    stats.length > 320 && 'Keep it under 320 characters (two texts).',
    !place.trim() && 'The short address cannot be empty.',
  ].filter(Boolean) as string[];

  function insert(name: string) {
    const token = `{${name}}`;
    const el = inputRef.current;
    const at = el?.selectionStart ?? draft.length;
    setDraft((d) => d.slice(0, at) + token + d.slice(el?.selectionEnd ?? at));
  }

  async function save() {
    setBusy(true);
    try {
      await saveCareers({ format: 'ecothrift.careers/1', texts: fixed ? { place } : { [textKey]: draft, place } });
      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
      enqueueSnackbar('Text saved', { variant: 'success' });
    } catch (err) {
      const data = (err as { response?: { data?: { errors?: string[] } } }).response?.data;
      enqueueSnackbar(data?.errors?.join(' ') || errorText(err, 'Could not save.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ p: 2, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <Typography variant="h6" fontWeight={700}>
          {fixed ? 'Texts confirmation' : meta?.label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          To the applicant, only if they ticked the text box.{' '}
          {fixed ? 'The first text, before any other.' : meta?.when}
        </Typography>
      </Box>
      <TextingStatus />
      {fixed ? (
        <Alert severity="info" variant="outlined" sx={{ mb: 1.5 }}>
          This is the 10DLC campaign&rsquo;s opt-in sample, word for word, so it can&rsquo;t be edited here. Dash sends it
          before anyone&rsquo;s first text.
        </Alert>
      ) : null}
      <TextField
        label="The text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        inputRef={inputRef}
        multiline
        minRows={3}
        fullWidth
        disabled={fixed}
      />
      {!fixed && meta && (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, alignSelf: 'center' }}>
            Tap to insert:
          </Typography>
          {meta.placeholders.map((name) => (
            <Chip key={name} size="small" variant="outlined" label={`{${name}}`} onClick={() => insert(name)} />
          ))}
        </Box>
      )}
      <TextField
        label="{place}: the short address in texts"
        value={place}
        onChange={(e) => setPlace(e.target.value)}
        size="small"
        sx={{ mt: 2, minWidth: 280 }}
      />
      {problems.length > 0 && !fixed && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {problems.join(' ')}
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={save} disabled={busy || !changed || problems.length > 0}>
          Save
        </Button>
        {changed && (
          <Button
            onClick={() => {
              setDraft(saved);
              setPlace(texts.place ?? '');
            }}
            disabled={busy}
          >
            Discard changes
          </Button>
        )}
      </Box>
      <Typography variant="overline" sx={{ display: 'block', mt: 3, color: ccTokens.ink2, fontWeight: 700 }}>
        Preview (sample applicant)
      </Typography>
      <Box sx={{ maxWidth: 360, p: 1.5, borderRadius: '16px 16px 16px 4px', bgcolor: '#eef0ea', border: `1px solid ${ccTokens.line}` }}>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {sample}
        </Typography>
      </Box>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: stats.length > 320 ? ccTokens.badText : ccTokens.ink3 }}>
        {stats.length} characters · {stats.parts === 1 ? 'one text' : `${stats.parts} texts`}
        {!stats.plain ? ' · an emoji or curly quote makes each text shorter' : ''}
      </Typography>
    </Box>
  );
}
