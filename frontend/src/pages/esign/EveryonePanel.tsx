/**
 * Sent to everyone (Documents, the owner): one template sent to many people at once, one document each, each person
 * the only signer. The first use is each handbook version's acknowledgment (Bill, 2026-11-02). Every batch shows how
 * many have signed, who hasn't, and who on the staff list has not been sent it (joined later, or left out), with a
 * button to send it to them.
 *
 * `?tab=everyone&start=handbook&name=...` opens the dialog with a handbook template and the name filled in (from the
 * Handbook versions page).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress,
  MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import { EmptyState, PageToolbar, Section, StatusPill } from './kit';
import { ICONS } from './kit';
import {
  addToBatch, errText, getVersion, listBatches, listEveryone, listTemplates, sendToEveryone, type Batch, type EsignTemplate,
  type EveryonePerson, type TemplateVersion,
} from '@/esign/api';
import { FieldInputs } from '@/esign/FieldInputs';
import { day } from './DocumentsPage';
import type { EsignScope } from './scope';

const I = ICONS;

function SendDialog({ scope, start, startName, onClose, onDone }: {
  scope: EsignScope;
  start: string; startName: string; onClose: () => void; onDone: () => void;
}) {
  const [templates, setTemplates] = useState<EsignTemplate[]>([]);
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [version, setVersion] = useState<TemplateVersion | null>(null);
  const [name, setName] = useState(startName);
  const [values, setValues] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<EveryonePerson[]>([]);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listTemplates().then((list) => {
      list = list.filter((t) => !t.archived && scope.owns(t.kind));
      setTemplates(list);
      const first = list.find((t) => t.kind === start) ?? (start ? undefined : list[0]);
      if (first) setTemplateId(first.id);
    }).catch((e) => setError(errText(e)));
    listEveryone().then((list) => { setPeople(list); setChosen(new Set(list.map((p) => p.user_id))); }).catch((e) => setError(errText(e)));
  }, [start, scope]);
  useEffect(() => {
    const t = templates.find((x) => x.id === templateId);
    if (!t?.latest) return;
    getVersion(t.latest.id).then((v) => { setVersion(v); if (!name.trim()) setName(v.title); }).catch((e) => setError(errText(e)));
  }, [templateId, templates]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: number) => setChosen((all) => {
    const next = new Set(all);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const send = async () => {
    if (!version) return;
    setBusy(true);
    setError('');
    try {
      await sendToEveryone({ version: version.id, name, people: [...chosen], values });
      onDone();
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Send to everyone</DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ mt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="body2" color="text.secondary">
            Each person gets their own copy to sign in Dash (it shows in their HR {'>'} Requests). Only they sign it.
          </Typography>
          <TextField select size="small" label="Template" value={templateId} onChange={(e) => setTemplateId(Number(e.target.value))}
            helperText={templates.length ? (start === 'handbook' && !templates.some((t) => t.kind === 'handbook')
              ? 'No handbook acknowledgment template yet: make one in Templates (kind: Handbook acknowledgment).' : undefined)
              : 'Make a template first (Templates tab).'}>
            {templates.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Name (shown on the tracker and as each document's title)" value={name} onChange={(e) => setName(e.target.value)} />
          {version?.fields?.length ? (
            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Fill in (the same for everyone)</Typography>
              <FieldInputs fields={version.fields} values={values} onChange={(k, v) => setValues({ ...values, [k]: v })} />
            </Box>
          ) : null}
          <Box>
            <Stack direction="row" alignItems="center">
              <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>Who ({chosen.size} of {people.length})</Typography>
              <Button size="small" onClick={() => setChosen(chosen.size === people.length ? new Set() : new Set(people.map((p) => p.user_id)))}>
                {chosen.size === people.length ? 'None' : 'All'}
              </Button>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, maxHeight: 280, overflowY: 'auto' }}>
              {people.map((p) => (
                <FormControlLabel key={p.user_id} control={<Checkbox size="small" checked={chosen.has(p.user_id)} onChange={() => toggle(p.user_id)} />}
                  label={<Typography variant="body2">{p.name}{p.title ? <Typography component="span" variant="caption"> · {p.title}</Typography> : null}</Typography>} />
              ))}
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void send()} disabled={busy || !version || !chosen.size || !name.trim()} data-testid="send-everyone">
          Send to {chosen.size}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function BatchCard({ batch, onOpen, onChanged }: { batch: Batch; onOpen: (id: number) => void; onChanged: (b: Batch) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const waiting = batch.people.filter((p) => p.status === 'waiting' && !p.deleting);
  const pct = batch.total ? Math.round((batch.signed / batch.total) * 100) : 0;
  const sendMissing = async () => {
    setBusy(true);
    setError('');
    try {
      onChanged(await addToBatch(batch.id, batch.missing.map((m) => m.user_id)));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section>
      <Stack spacing={1.25} data-testid="batch-card">
        <Stack direction="row" alignItems="baseline" spacing={1.5}>
          <Typography sx={{ fontWeight: 600, flex: 1 }}>{batch.name}</Typography>
          <Typography variant="caption">sent {day(batch.created_at)}</Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <LinearProgress variant="determinate" value={pct} sx={{ flex: 1, height: 8, borderRadius: 99 }} />
          <Typography sx={{ fontWeight: 600, minWidth: 110, textAlign: 'right' }}>{batch.signed} of {batch.total} signed</Typography>
        </Stack>
        {waiting.length ? (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>Hasn't signed ({waiting.length})</Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {waiting.map((p) => (
                <Box key={p.party} component="button" type="button" onClick={() => onOpen(p.envelope)} sx={{ border: 0, bgcolor: 'transparent', p: 0, cursor: 'pointer' }}>
                  <StatusPill tone="wait" label={p.name} />
                </Box>
              ))}
            </Stack>
          </Box>
        ) : <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>Everyone it went to has signed.</Typography>}
        {batch.missing.length ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <Typography variant="body2" sx={{ flex: 1 }}>
              Not sent it yet: {batch.missing.map((m) => m.name).join(', ')}
            </Typography>
            <Button size="small" variant="outlined" disabled={busy} onClick={() => void sendMissing()}>Send to {batch.missing.length === 1 ? 'them' : `these ${batch.missing.length}`}</Button>
          </Stack>
        ) : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
      </Stack>
    </Section>
  );
}

export default function EveryonePanel({ scope, onOpen }: { scope: EsignScope; onOpen: (id: number) => void }) {
  const [rows, setRows] = useState<Batch[] | null>(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<{ start: string; name: string } | null>(null);

  const load = useCallback(() => {
    listBatches().then(setRows).catch((e) => setError(errText(e, 'Did not load.')));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    const start = params.get('start');
    if (start) {
      setDialog({ start, name: params.get('name') ?? '' });
      params.delete('start');
      params.delete('name');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);
  const sorted = useMemo(() => rows ?? [], [rows]);

  return (
    <Stack spacing={2}>
      <PageToolbar lead={<Typography variant="body2" color="text.secondary">One document for each person, like a handbook acknowledgment. See who hasn't signed.</Typography>}>
        <Button variant="contained" onClick={() => setDialog({ start: '', name: '' })} data-testid="open-send-everyone">Send to everyone</Button>
      </PageToolbar>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {!rows ? <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress size={26} /></Box>
        : sorted.length === 0 ? (
          <Section flush><EmptyState Icon={I.description} title="Nothing sent to everyone yet" body="When a new handbook is published, send its acknowledgment from here." /></Section>
        ) : sorted.map((b) => (
          <BatchCard key={b.id} batch={b} onOpen={onOpen} onChanged={(nb) => setRows((all) => (all ?? []).map((x) => (x.id === nb.id ? nb : x)))} />
        ))}
      {dialog ? <SendDialog scope={scope} start={dialog.start} startName={dialog.name} onClose={() => setDialog(null)} onDone={() => { setDialog(null); load(); }} /> : null}
    </Stack>
  );
}
