/**
 * Template editor (`${scope.base}/templates/:id`: /admin/documents/... for HR documents, /admin/contractors/... for
 * contractor agreements; the owner): the document in sections, {{blank}} fill-ins, the
 * statements each signer ticks, and the kind (what it is filed as). Every save is a new version; a document already
 * sent keeps its words. Adapted from the Eco-Thrift seed (D22).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, FormControlLabel, IconButton, List, ListItemButton, ListItemText, MenuItem, Stack, TextField,
  Typography,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { PageShell, Section } from './kit';
import type { EsignScope } from './scope';
import {
  createTemplate, errText, getMeta, getTemplate, getVersion, saveTemplateVersion, type EsignField, type EsignMeta, type EsignSection,
  type EsignTemplate, type FieldKind,
} from '@/esign/api';

const BLANK = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;
const PARTY = /^party_\d_(name|title|role)$/;
const BUILTIN = ['signer_name', 'signer_title', 'signer_email', 'company_name', 'agreement_date'];

/** The blanks in the text, in order, minus the built-ins the app fills itself. */
export function blanksIn(sections: EsignSection[]): string[] {
  const seen: string[] = [];
  for (const s of sections) {
    for (const m of `${s.heading}\n${s.body}`.matchAll(BLANK)) {
      if (!seen.includes(m[1]) && !BUILTIN.includes(m[1]) && !PARTY.test(m[1])) seen.push(m[1]);
    }
  }
  return seen;
}

/** Keep the field settings of blanks still in the text; new blanks start as required text. */
export function syncFields(sections: EsignSection[], fields: EsignField[]): EsignField[] {
  return blanksIn(sections).map(
    (key) => fields.find((f) => f.key === key) ?? { key, label: key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), kind: 'text', required: true, options: [], default: '' },
  );
}

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TemplateEditorPage({ scope }: { scope: EsignScope }) {
  const { id } = useParams();
  const templateId = id && id !== 'new' ? Number(id) : null;
  const navigate = useNavigate();
  const [meta, setMeta] = useState<EsignMeta | null>(null);
  const [template, setTemplate] = useState<EsignTemplate | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState(scope.defaultKind);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [sections, setSections] = useState<EsignSection[]>([{ heading: '', body: '' }]);
  const [fields, setFields] = useState<EsignField[]>([]);
  const [acks, setAcks] = useState<string[]>([]);
  const [shownVersion, setShownVersion] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  const load = (v: { title: string; sections?: EsignSection[]; fields?: EsignField[]; acknowledgments?: string[]; number: number }) => {
    setTitle(v.title);
    setSections(v.sections?.length ? v.sections : [{ heading: '', body: '' }]);
    setFields(v.fields ?? []);
    setAcks(v.acknowledgments ?? []);
    setShownVersion(v.number);
  };

  useEffect(() => { getMeta().then(setMeta).catch(() => undefined); }, []);
  useEffect(() => {
    if (templateId == null) return;
    getTemplate(templateId).then(async (t) => {
      setTemplate(t);
      setName(t.name);
      setKind(t.kind);
      if (t.latest) load(await getVersion(t.latest.id));
    }).catch((e) => setErr(errText(e)));
  }, [templateId]);

  const shownFields = useMemo(() => syncFields(sections, fields), [sections, fields]);
  const setField = (key: string, patch: Partial<EsignField>) => setFields(shownFields.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const setSection = (i: number, patch: Partial<EsignSection>) => setSections(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= sections.length) return;
    const copy = [...sections];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setSections(copy);
  };

  const save = async () => {
    setBusy(true);
    try {
      const input = { name, kind, title, note, sections, fields: shownFields, acknowledgments: acks.map((a) => a.trim()).filter(Boolean) };
      const t = templateId ? await saveTemplateVersion(templateId, input) : await createTemplate(input);
      setTemplate(t);
      setSaved(`Saved as version ${t.latest?.number}.`);
      setErr('');
      setNote('');
      if (t.latest) setShownVersion(t.latest.number);
      if (!templateId) navigate(`${scope.base}/templates/${t.id}`, { replace: true });
    } catch (e) {
      setSaved('');
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell width="wide">
      <Box><Button onClick={() => navigate(`${scope.home}?tab=templates`)}>Back to templates</Button></Box>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} alignItems="flex-start">
        <Stack spacing={2} sx={{ flex: 1, minWidth: 0, width: '100%' }}>
          {shownVersion != null ? <Alert severity="info">Showing version {shownVersion}. Saving makes a new version from what you see.</Alert> : null}
          <Section title="About it">
            <Stack spacing={2}>
              <TextField size="small" label="Template name (for you)" value={name} onChange={(e) => setName(e.target.value)} disabled={templateId != null} slotProps={{ htmlInput: { 'data-testid': 'tpl-name' } }} />
              <TextField select size="small" label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} disabled={templateId != null}>
                {(meta?.kinds ?? [{ key: scope.defaultKind, label: scope.defaultKind }]).filter((k) => scope.owns(k.key)).map((k) => <MenuItem key={k.key} value={k.key}>{k.label}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Document title (what signers see)" value={title} onChange={(e) => setTitle(e.target.value)} slotProps={{ htmlInput: { 'data-testid': 'tpl-title' } }} />
            </Stack>
          </Section>
          <Section title="The words" hint="Put {{blank_name}} where something is filled in each time. Built in: {{party_1_name}}, {{party_1_role}}, {{party_2_name}} ..., {{company_name}}, {{agreement_date}}.">
            <Stack spacing={2}>
              {sections.map((s, i) => (
                <Box key={i} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1}>
                      <TextField size="small" fullWidth label={`Section ${i + 1} heading`} value={s.heading} onChange={(e) => setSection(i, { heading: e.target.value })} slotProps={{ htmlInput: { 'data-testid': `sec-heading-${i}` } }} />
                      <IconButton aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</IconButton>
                      <IconButton aria-label="Move down" onClick={() => move(i, 1)} disabled={i === sections.length - 1}>↓</IconButton>
                      <IconButton aria-label="Remove section" onClick={() => setSections(sections.filter((_, j) => j !== i))} disabled={sections.length === 1}>✕</IconButton>
                    </Stack>
                    <TextField multiline minRows={4} label="Text (a line starting '- ' is a bullet)" value={s.body} onChange={(e) => setSection(i, { body: e.target.value })} slotProps={{ htmlInput: { 'data-testid': `sec-body-${i}` } }} />
                  </Stack>
                </Box>
              ))}
              <Box><Button onClick={() => setSections([...sections, { heading: '', body: '' }])} data-testid="add-section">Add a section</Button></Box>
            </Stack>
          </Section>
          <Section title={`Fill-ins (${shownFields.length})`}>
            <Stack spacing={1.5}>
              {!shownFields.length ? <Typography variant="body2" color="text.secondary">No fill-ins yet. Type {'{{name}}'} in the text to add one.</Typography> : null}
              {shownFields.map((f) => (
                <Stack key={f.key} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} data-testid={`blank-${f.key}`}>
                  <Typography sx={{ minWidth: 150, fontFamily: 'ui-monospace, Consolas, monospace' }}>{`{{${f.key}}}`}</Typography>
                  <TextField size="small" label="Label" value={f.label} onChange={(e) => setField(f.key, { label: e.target.value })} />
                  <TextField size="small" select label="Kind" value={f.kind} onChange={(e) => setField(f.key, { kind: e.target.value as FieldKind })} sx={{ minWidth: 120 }}>
                    {(['text', 'textarea', 'date', 'choice'] as FieldKind[]).map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                  </TextField>
                  {f.kind === 'choice' ? (
                    <TextField size="small" label="Options (comma separated)" value={f.options.join(', ')} onChange={(e) => setField(f.key, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} />
                  ) : null}
                  <FormControlLabel control={<Checkbox checked={f.required} onChange={(e) => setField(f.key, { required: e.target.checked })} />} label="Required" />
                </Stack>
              ))}
            </Stack>
          </Section>
          <Section title="Statements each signer ticks" hint="Optional. For example: I have read the 2027 handbook. Each tick is recorded with the signature.">
            <Stack spacing={1}>
              {acks.map((a, i) => (
                <Stack key={i} direction="row" spacing={1}>
                  <TextField size="small" fullWidth value={a} onChange={(e) => setAcks(acks.map((x, j) => (j === i ? e.target.value : x)))} slotProps={{ htmlInput: { 'data-testid': `ack-${i}` } }} />
                  <IconButton aria-label="Remove statement" onClick={() => setAcks(acks.filter((_, j) => j !== i))}>✕</IconButton>
                </Stack>
              ))}
              <Box><Button onClick={() => setAcks([...acks, ''])}>Add a statement</Button></Box>
            </Stack>
          </Section>
          <TextField size="small" label="What changed (optional note for the history)" value={note} onChange={(e) => setNote(e.target.value)} />
          {err ? <Alert severity="error">{err}</Alert> : null}
          {saved ? <Alert severity="success">{saved}</Alert> : null}
          <Box>
            <Button variant="contained" onClick={() => void save()} disabled={busy} data-testid="tpl-save">
              {templateId ? 'Save as a new version' : 'Create template'}
            </Button>
          </Box>
        </Stack>
        {template?.versions ? (
          <Section title="Version history" flush sx={{ width: { xs: '100%', lg: 280 }, flexShrink: 0 }}>
            <List dense data-testid="version-history">
              {template.versions.map((v) => (
                <ListItemButton key={v.id} selected={shownVersion === v.number} onClick={() => void getVersion(v.id).then(load)}>
                  <ListItemText primary={`Version ${v.number}${v.frozen ? ' · in use' : ''}`} secondary={`${when(v.created_at)}${v.note ? ` · ${v.note}` : ''}`} />
                </ListItemButton>
              ))}
            </List>
          </Section>
        ) : null}
      </Stack>
    </PageShell>
  );
}
