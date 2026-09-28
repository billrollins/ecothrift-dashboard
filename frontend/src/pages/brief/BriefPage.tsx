import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  LinearProgress,
  Link,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { fetchDailyBrief, writeDailyBrief } from '../../api/brief.api';

type BriefItem = string | { text: string; link?: string };

function Section({ title, items, tone }: { title: string; items?: BriefItem[]; tone?: 'warning' }) {
  if (!items?.length) return null;
  return (
    <Paper variant="outlined" sx={{ p: 1.75, borderColor: tone === 'warning' ? 'warning.main' : undefined }}>
      <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: '0.1em' }}>{title}</Typography>
      <Stack spacing={0.75} sx={{ mt: 0.5 }}>
        {items.map((item, i) => {
          const text = typeof item === 'string' ? item : item.text;
          const link = typeof item === 'string' ? undefined : item.link;
          return (
            <Typography key={`${i}-${text}`} variant="body1">
              • {text}
              {link && link.startsWith('/') ? <> <Link href={link} underline="hover">Open</Link></> : null}
            </Typography>
          );
        })}
      </Stack>
    </Paper>
  );
}

function value(v: unknown): string {
  if (v == null || v === '') return '-';
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join('; ') : 'none';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** The snapshot the brief was written from, section by section, so any number can be checked. */
function Numbers({ snapshot }: { snapshot: Record<string, unknown> }) {
  const sections = Object.entries(snapshot).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v));
  return (
    <Stack spacing={1.5}>
      {sections.map(([name, data]) => (
        <Box key={name}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, textTransform: 'capitalize' }}>{name.replace(/_/g, ' ')}</Typography>
          {Object.entries(data as Record<string, unknown>).map(([k, v]) => (
            <Typography key={k} variant="body2" sx={{ wordBreak: 'break-word' }}>
              <Box component="span" sx={{ color: 'text.secondary' }}>{k.replace(/_/g, ' ')}:</Box> {value(v)}
            </Typography>
          ))}
        </Box>
      ))}
    </Stack>
  );
}

/**
 * Dash → Brief: the AI supervisor's morning brief for the owner, written from yesterday's
 * Context snapshot (data_platform Phase 2). Superuser only.
 */
export default function BriefPage() {
  const queryClient = useQueryClient();
  const [day, setDay] = useState<string | undefined>(undefined);
  const query = useQuery({
    queryKey: ['daily-brief', day ?? 'default'],
    queryFn: () => fetchDailyBrief(day),
    refetchInterval: (q) => (q.state.data?.writing ? 4000 : false),
  });
  const rewrite = useMutation({
    mutationFn: () => writeDailyBrief(query.data?.day),
    onSuccess: (data) => queryClient.setQueryData(['daily-brief', day ?? 'default'], data),
  });
  const data = query.data;
  const brief = data?.brief;
  const body = brief?.body ?? {};

  return (
    <Box sx={{ maxWidth: 900 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>Morning brief</Typography>
          <Typography variant="body2" color="text.secondary">
            {data ? `About ${format(parseISO(data.day), 'EEEE, MMM d')}` : ' '}
            {brief?.model_used ? ` · written by ${brief.model_used}` : ''}
          </Typography>
        </Box>
        {data?.days.length ? (
          <TextField select size="small" label="Day" value={data.day} onChange={(e) => setDay(e.target.value)} sx={{ minWidth: 170 }}>
            {data.days.includes(data.day) ? null : <MenuItem value={data.day}>{data.day}</MenuItem>}
            {data.days.map((d) => <MenuItem key={d} value={d}>{format(parseISO(d), 'EEE, MMM d')}</MenuItem>)}
          </TextField>
        ) : null}
        <Button variant="outlined" onClick={() => rewrite.mutate()} disabled={!data || data.writing || rewrite.isPending}>
          Rewrite
        </Button>
      </Stack>

      {query.isError ? <Alert severity="error">Could not load the brief.</Alert> : null}
      {data?.writing ? (
        <Box sx={{ mb: 2 }}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Writing the brief from yesterday&apos;s numbers…</Typography>
        </Box>
      ) : null}
      {brief?.status === 'failed' && !data?.writing ? (
        <Alert severity="error" sx={{ mb: 2 }}>The brief could not be written: {brief.error.split('\n')[0]}</Alert>
      ) : null}

      {brief?.status === 'ready' ? (
        <Stack spacing={1.5}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{body.headline}</Typography>
          <Section title="Needs you" items={body.needs_you} tone="warning" />
          <Section title="Numbers" items={body.numbers} />
          <Section title="Watch" items={body.watch} />
        </Stack>
      ) : null}

      {data?.snapshot ? (
        <Accordion disableGutters sx={{ mt: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreRounded />}>
            <Typography sx={{ fontWeight: 700 }}>The numbers behind it</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Numbers snapshot={data.snapshot} />
          </AccordionDetails>
        </Accordion>
      ) : null}

      {data?.prompt ? (
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreRounded />}>
            <Typography sx={{ fontWeight: 700 }}>Exactly what the AI was given</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="caption" color="text.secondary">Instructions (today's version):</Typography>
            <Box component="pre" sx={{ m: 0, mb: 1.5, fontSize: 12, whiteSpace: 'pre-wrap' }}>{data.prompt.system}</Box>
            <Typography variant="caption" color="text.secondary">Message:</Typography>
            <Box component="pre" sx={{ m: 0, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 480, overflow: 'auto' }}>{data.prompt.user}</Box>
          </AccordionDetails>
        </Accordion>
      ) : null}
    </Box>
  );
}
