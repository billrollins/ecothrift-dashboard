/**
 * A new document to sign (adapted from Dark Horse's, D22). Two kinds:
 * - From a template: the template, who it is about, the signers in order (staff from Dash, or someone outside by
 *   email), the fill-ins, a preview of the exact words, then Save as draft or Send.
 * - Upload a PDF: the file, its title and kind, who it is about, the signers in order, any statements to tick; then
 *   the boxes are placed on its pages (PdfBoxEditor) and it is sent from there.
 *
 * Contractors (#21): the contractor signs first by link, then the owner countersigns in Dash (already in the list);
 * the W-9 step is offered to the contractor (optional for them, owner-only after). Nobody is "about" a contractor:
 * they have no record in Dash.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import {
  createEnvelope, createPdfEnvelope, errText, getMeta, getVersion, listEveryone, listTemplates, previewText, sendEnvelope, type EsignMeta,
  type EsignTemplate, type EveryonePerson, type PartyInput, type TemplateVersion,
} from '@/esign/api';
import { useAuth } from '../../hooks/useAuth';
import { FieldInputs } from '@/esign/FieldInputs';
import { DocumentText } from '@/esign/SignerFlow';
import CopyLink from './CopyLink';
import { NOT_EMAILED, type EsignScope } from './scope';

interface Signer extends PartyInput {
  key: string;
}

let nextKey = 1;
const newKey = () => `s${nextKey++}`;

export default function NewDocumentDialog({ scope, onClose, onDone }: { scope: EsignScope; onClose: () => void; onDone: (id: number) => void }) {
  const { user } = useAuth();
  const contractor = !scope.staffSigners;
  const [templates, setTemplates] = useState<EsignTemplate[]>([]);
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [version, setVersion] = useState<TemplateVersion | null>(null);
  const [employees, setEmployees] = useState<EveryonePerson[]>([]);
  const [title, setTitle] = useState('');
  const [about, setAbout] = useState<EveryonePerson | null>(null);
  // A contractor agreement: the owner countersigns last.
  const [signers, setSigners] = useState<Signer[]>(() => (contractor && user
    ? [{ key: newKey(), user_id: user.id, name: `${user.first_name} ${user.last_name}`.trim(), role_label: 'Owner' }] : []));
  const [w9, setW9] = useState(contractor);
  const [values, setValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentLink, setSentLink] = useState<{ id: number; link: string; name: string } | null>(null);
  const [outsider, setOutsider] = useState({ name: '', email: '' });
  const [mode, setMode] = useState<'template' | 'pdf'>('template');
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState(scope.defaultKind);
  const [statements, setStatements] = useState('');
  const [meta, setMeta] = useState<EsignMeta | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    listTemplates().then((list) => setTemplates(list.filter((t) => !t.archived && scope.owns(t.kind)))).catch((e) => setError(errText(e)));
    getMeta().then(setMeta).catch(() => undefined);
    // Contractors: only the owner signs from Dash; nobody on staff is a party to a contractor's agreement.
    listEveryone().then((list) => setEmployees(contractor ? list.filter((p) => p.user_id === user?.id) : list)).catch(() => undefined);
  }, [scope, contractor, user?.id]);
  useEffect(() => {
    const t = templates.find((x) => x.id === templateId);
    if (!t?.latest) return;
    getVersion(t.latest.id).then((v) => {
      setVersion(v);
      setTitle(v.title);
      setPreview('');
    }).catch((e) => setError(errText(e)));
  }, [templateId, templates]);

  const userIds = useMemo(() => new Set(signers.map((s) => s.user_id).filter(Boolean)), [signers]);
  const addStaff = (e: EveryonePerson | null) => {
    if (!e || userIds.has(e.user_id)) return;
    setSigners([...signers, { key: newKey(), user_id: e.user_id, name: e.name, role_label: e.title || '' }]);
    if (!about && signers.length === 0 && !contractor) setAbout(e);
  };
  const addOutsider = () => {
    if (outsider.name.trim().length < 2 || !outsider.email.includes('@')) {
      setError('Give the outside signer a name and an email.');
      return;
    }
    setError('');
    const added = { key: newKey(), name: outsider.name.trim(), email: outsider.email.trim(), role_label: contractor ? 'Contractor' : '' };
    // A contractor signs before the owner countersigns.
    const ownerAt = contractor ? signers.findIndex((s) => s.user_id === user?.id) : -1;
    setSigners(ownerAt >= 0 ? [...signers.slice(0, ownerAt), added, ...signers.slice(ownerAt)] : [...signers, added]);
    setOutsider({ name: '', email: '' });
  };
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= signers.length) return;
    const copy = [...signers];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    setSigners(copy);
  };
  const setRole = (i: number, role: string) => setSigners(signers.map((s, j) => (j === i ? { ...s, role_label: role } : s)));

  const parties = (): PartyInput[] => signers.map(({ key: _key, ...p }) => p);

  const showPreview = async () => {
    if (!version) return;
    try {
      setPreview(await previewText(version.id, values, parties()));
    } catch (e) {
      setError(errText(e));
    }
  };

  const save = async (send: boolean) => {
    if (!version) return;
    setBusy(true);
    setError('');
    try {
      const made = await createEnvelope({
        version: version.id, title, parties: parties(), values, requires_w9: w9,
        ...(about ? { attached_type: 'user', attached_id: String(about.user_id) } : {}),
      });
      if (!send) return onDone(made.id);
      const sent = await sendEnvelope(made.id);
      // The link comes back only when the email could not go; then the owner hands it over.
      const first = signers[0];
      if (first && !first.user_id && !sent.emailed && sent.link) setSentLink({ id: made.id, link: sent.link, name: first.name ?? '' });
      else onDone(made.id);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const choosePdf = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim());
  };

  const createPdf = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const made = await createPdfEnvelope({
        file, title, kind, parties: parties(), acknowledgments: statements.split('\n').map((x) => x.trim()).filter(Boolean),
        ...(about ? { attached_type: 'user', attached_id: String(about.user_id) } : {}),
      });
      navigate(`${scope.base}/${made.id}/boxes`);
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  };

  const signersBox = (
    <Box>
      <Typography variant="overline" color="text.secondary">Signers, in order</Typography>
      {signers.length === 0 ? <Typography variant="body2" color="text.secondary">Add who signs, first to last.</Typography> : null}
      <Stack spacing={1} sx={{ mt: 0.5 }}>
        {signers.map((s, i) => (
          <Stack key={s.key} direction="row" spacing={1} alignItems="center" data-testid={`signer-${i}`}>
            <Typography sx={{ width: 22, color: 'text.secondary' }}>{i + 1}.</Typography>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }}>{s.name}</Typography>
              <Typography variant="caption">{s.user_id ? 'Signs in Dash' : `By link · ${s.email}`}</Typography>
            </Box>
            <TextField size="small" label="Signs as" value={s.role_label ?? ''} onChange={(e) => setRole(i, e.target.value)} sx={{ width: 170 }} />
            <IconButton aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>↑</IconButton>
            <IconButton aria-label="Move down" onClick={() => move(i, 1)} disabled={i === signers.length - 1}>↓</IconButton>
            <IconButton aria-label="Remove" onClick={() => setSigners(signers.filter((_, j) => j !== i))}>✕</IconButton>
          </Stack>
        ))}
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
        <Autocomplete size="small" sx={{ flex: 1 }} options={employees.filter((e) => !userIds.has(e.user_id))} value={null}
          onChange={(_, v) => addStaff(v)} getOptionLabel={(e) => e.name} blurOnSelect
          renderInput={(p) => <TextField {...p} label="Add someone from Dash" />} />
        <TextField size="small" label={contractor ? 'Contractor: name' : 'Or outside: name'} value={outsider.name} onChange={(e) => setOutsider({ ...outsider, name: e.target.value })} />
        <TextField size="small" label="Email" value={outsider.email} onChange={(e) => setOutsider({ ...outsider, email: e.target.value })} />
        <Button onClick={addOutsider}>Add</Button>
      </Stack>
    </Box>
  );
  const aboutBox = contractor ? null : (
    <Autocomplete size="small" options={employees} value={about} onChange={(_, v) => setAbout(v)}
      getOptionLabel={(e) => e.name} isOptionEqualToValue={(a, b) => a.user_id === b.user_id}
      renderInput={(p) => <TextField {...p} label="About (optional)" helperText="It is filed on this person's record." slotProps={{ inputLabel: { shrink: about ? true : undefined } }} />} />
  );

  if (sentLink) {
    return (
      <Dialog open onClose={() => onDone(sentLink.id)} maxWidth="sm" fullWidth>
        <DialogTitle>Sent</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>{`${NOT_EMAILED} It goes to ${sentLink.name}.`}</Typography>
          <CopyLink link={sentLink.link} />
        </DialogContent>
        <DialogActions><Button variant="contained" onClick={() => onDone(sentLink.id)}>Done</Button></DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{contractor ? 'New contractor agreement' : 'New document'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, v) => v && setMode(v)}>
            <ToggleButton value="template" data-testid="mode-template">From a template</ToggleButton>
            <ToggleButton value="pdf" data-testid="mode-pdf">Upload a PDF</ToggleButton>
          </ToggleButtonGroup>
          {mode === 'pdf' ? (
            <>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <input ref={picker} hidden type="file" accept="application/pdf" data-testid="pdf-input" onChange={(e) => choosePdf(e.target.files?.[0])} />
                <Button variant="outlined" onClick={() => picker.current?.click()}>{file ? 'Choose another PDF' : 'Choose the PDF'}</Button>
                <Typography variant="body2" color="text.secondary" noWrap>{file ? file.name : 'Up to 20 MB.'}</Typography>
              </Stack>
              <TextField size="small" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <TextField select size="small" label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                {(meta?.kinds ?? [{ key: scope.defaultKind, label: scope.defaultKind }]).filter((k) => scope.owns(k.key)).map((k) => <MenuItem key={k.key} value={k.key}>{k.label}</MenuItem>)}
              </TextField>
              {aboutBox}
              {signersBox}
              <TextField size="small" multiline minRows={2} label="Statements each signer ticks (optional, one per line)" value={statements}
                onChange={(e) => setStatements(e.target.value)} placeholder="I have read every page." />
            </>
          ) : (
            <TextField select size="small" label="Template" value={templateId} onChange={(e) => setTemplateId(Number(e.target.value))}
              helperText={templates.length ? undefined : 'Make a template first (Templates tab).'}>
              {templates.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            </TextField>
          )}
          {mode === 'template' && version ? (
            <>
              <TextField size="small" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              {aboutBox}

              {signersBox}
              {contractor ? (
                <FormControlLabel control={<Checkbox checked={w9} onChange={(e) => setW9(e.target.checked)} />}
                  label="Offer the contractor a W-9 upload (optional for them; only you can open it)" />
              ) : null}

              {version.fields?.length ? (
                <Box>
                  <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>Fill in</Typography>
                  <FieldInputs fields={version.fields} values={values} onChange={(k, v) => setValues({ ...values, [k]: v })} />
                </Box>
              ) : null}

              <Box>
                <Button onClick={() => void showPreview()} disabled={!signers.length}>Preview the exact words</Button>
                {preview ? (
                  <Box sx={{ mt: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, maxHeight: 360, overflowY: 'auto' }}>
                    <DocumentText text={preview} compact />
                  </Box>
                ) : null}
              </Box>
            </>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        {mode === 'pdf' ? (
          <Button variant="contained" onClick={() => void createPdf()} disabled={busy || !file || !signers.length || title.trim().length < 2} data-testid="pdf-next">
            Next: place the boxes
          </Button>
        ) : (
          <>
            <Button onClick={() => void save(false)} disabled={busy || !version || !signers.length}>Save as draft</Button>
            <Button variant="contained" onClick={() => void save(true)} disabled={busy || !version || !signers.length} data-testid="send-document">Send</Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
