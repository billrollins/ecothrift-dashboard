/**
 * One document: who has signed and whose turn it is, the exact words (or the uploaded PDF's boxes) and the fingerprint,
 * every step in its history, and what can be done next (send it, a new link, void it, the signed copy, delete it).
 *
 * Deleting is never silent: it takes a reason, it can be restored for 90 days, then it is purged and only the purge
 * log keeps a line about it. A document out for signature is voided first.
 *
 * Eco-Thrift (adapted from Dark Horse's, D22): when it is the owner's own turn (a contractor agreement's countersign),
 * "Countersign now" opens the signing screens here; a signed contractor agreement can record notice (ends in 14
 * days); the contractor's W-9, when they gave one, downloads for the owner only.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Divider, Drawer, IconButton, Stack, TextField, Typography,
} from '@mui/material';
import { StatusPill } from './kit';
import {
  downloadSignedPdf, downloadW9, errText, getEnvelope, purgeNow, recordNotice, requestDelete, restoreEnvelope, sendEnvelope, voidEnvelope, type Envelope,
} from '@/esign/api';
import { useAuth } from '../../hooks/useAuth';
import { DocumentText } from '@/esign/SignerFlow';
import CopyLink from './CopyLink';
import { day } from './DocumentsPage';
import { NOT_EMAILED, type EsignScope } from './scope';

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function DocumentDetail({ scope, id, onClose, onChanged }: { scope: EsignScope; id: number; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const [doc, setDoc] = useState<Envelope | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [showText, setShowText] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [purging, setPurging] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    getEnvelope(id).then(setDoc).catch((e) => setError(errText(e, 'That document did not load.')));
  }, [id]);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<Envelope>) => {
    setBusy(true);
    setError('');
    try {
      const out = await fn();
      // Send and New link return the link only when the email could not go.
      setLink(out.emailed === false && out.link ? out.link : '');
      setDoc(out);
      onChanged();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const current = doc?.parties.find((p) => p.status === 'ready');

  return (
    <Drawer anchor="right" open onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, p: { xs: 2, sm: 3 } } }}>
      {!doc ? (
        <Box sx={{ display: 'grid', placeItems: 'center', flex: 1 }}>{error ? <Alert severity="error">{error}</Alert> : <CircularProgress size={26} />}</Box>
      ) : (
        <Stack spacing={2.25} data-testid="document-detail">
          <Stack direction="row" alignItems="flex-start" spacing={1}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6">{doc.title}</Typography>
              <Typography variant="caption" component="div">
                {[doc.attached_label,
                  doc.source === 'pdf' ? `Uploaded PDF, ${doc.page_count} page${doc.page_count === 1 ? '' : 's'}` : `${doc.template_name} v${doc.version}`,
                  doc.imported_from.startsWith('mydocs:') ? 'from MyDocs' : '', doc.batch_name ? `sent to everyone: ${doc.batch_name}` : '',
                ].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <StatusPill tone={doc.status === 'signed' ? 'good' : doc.status === 'out' ? 'wait' : doc.status === 'void' ? 'problem' : 'quiet'} label={doc.status_label} />
            <IconButton aria-label="Close" onClick={onClose}>✕</IconButton>
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {doc.deleting ? (
            <Alert severity="warning" data-testid="being-deleted" action={
              <Stack direction="row" spacing={0.5}>
                <Button color="inherit" size="small" disabled={busy} onClick={() => void act(() => restoreEnvelope(doc.id))}>Restore</Button>
                <Button color="error" size="small" disabled={busy} onClick={() => setPurging(true)}>Purge now</Button>
              </Stack>
            }>
              Being deleted: {doc.delete_reason}. It is purged on {day(doc.purge_after)} unless restored.
            </Alert>
          ) : null}
          {purging ? (
            <Alert severity="error" action={
              <Stack direction="row" spacing={0.5}>
                <Button color="error" variant="contained" size="small" disabled={busy} data-testid="purge-confirm" onClick={() => {
                  setBusy(true);
                  purgeNow(doc.id).then(() => { onChanged(); onClose(); }).catch((e) => { setError(errText(e)); setBusy(false); });
                }}>Purge it</Button>
                <Button color="inherit" size="small" onClick={() => setPurging(false)}>Keep it</Button>
              </Stack>
            }>
              Purge it now? The document, its signatures and its files are removed for good. Only a line in the purge log stays.
            </Alert>
          ) : null}

          <Box>
            <Typography variant="overline" color="text.secondary">Signers</Typography>
            <Stack spacing={1}>
              {doc.parties.map((p) => (
                <Stack key={p.id} direction="row" spacing={1.5} alignItems="center">
                  <Typography sx={{ width: 20, color: 'text.secondary' }}>{p.order}.</Typography>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontWeight: 600 }}>{p.name}{p.role_label ? `, ${p.role_label}` : ''}</Typography>
                    <Typography variant="caption">
                      {p.status === 'signed' ? `Signed ${when(p.signed_at!)}`
                        : doc.status === 'void' ? 'Did not sign (voided)'
                        : p.status === 'ready' ? (p.user_id ? 'Their turn: signs in Dash (HR > Requests)' : `Their turn: by link${p.link_state === 'expired' ? ', link expired' : `, good until ${day(p.link_expires_at)}`}`)
                          : 'Waiting'}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Box>

          {link && !current?.user_id ? (
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }}>{`${NOT_EMAILED} It goes to ${current?.name ?? 'the signer'}.`}</Typography>
              <CopyLink link={link} />
            </Box>
          ) : null}
          {doc.end_date ? <Alert severity="info">Notice recorded: it ends {day(doc.end_date)}.</Alert> : null}

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {doc.status === 'out' && current && current.user_id === user?.id ? (
              <Button variant="contained" onClick={() => navigate(`/hr/sign/${current.id}`)} data-testid="countersign">Countersign now</Button>
            ) : null}
            {doc.source === 'pdf' && doc.status === 'draft' ? (
              <Button variant="contained" onClick={() => navigate(`${scope.base}/${doc.id}/boxes`)} data-testid="place-boxes">Place the boxes and send</Button>
            ) : null}
            {doc.source === 'text' && doc.status === 'draft' ? <Button variant="contained" disabled={busy} onClick={() => void act(() => sendEnvelope(doc.id))}>Send</Button> : null}
            {doc.source === 'pdf' && doc.status !== 'draft' && !doc.imported_from ? (
              <Button variant="outlined" onClick={() => navigate(`${scope.base}/${doc.id}/boxes`)}>See the boxes</Button>
            ) : null}
            {doc.status === 'out' && current && current.user_id !== user?.id ? (
              <Button variant="outlined" disabled={busy} onClick={() => void act(() => sendEnvelope(doc.id))}>
                New link for {current.name}
              </Button>
            ) : null}
            {doc.has_pdf ? <Button variant="contained" onClick={() => void downloadSignedPdf(doc.id, `${doc.title}.pdf`).catch((e) => setError(errText(e)))}>Signed copy</Button> : null}
            {doc.has_w9 ? <Button variant="outlined" onClick={() => void downloadW9(doc.id, `W-9 ${doc.parties[0]?.name ?? doc.title}`).catch((e) => setError(errText(e)))} data-testid="w9">W-9</Button> : null}
            {scope.key === 'contractors' && doc.status === 'signed' && !doc.end_date ? (
              <Button variant="outlined" disabled={busy} onClick={() => void act(() => recordNotice(doc.id))} data-testid="record-notice">Record notice (ends in 14 days)</Button>
            ) : null}
            {(doc.status === 'draft' || doc.status === 'out') && !doc.deleting ? <Button color="error" disabled={busy} onClick={() => setVoiding(true)}>Void</Button> : null}
            {doc.status !== 'out' && !doc.deleting ? <Button color="error" disabled={busy} onClick={() => { setReason(''); setDeleting(true); }} data-testid="delete-document">Delete</Button> : null}
          </Stack>
          {deleting ? (
            <Stack spacing={1}>
              <TextField size="small" label="Why is it deleted?" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
                helperText="It can be restored for 90 days, then it is purged. The purge log keeps a line about it." />
              <Stack direction="row" spacing={1}>
                <Button color="error" variant="contained" disabled={busy || reason.trim().length < 3}
                  onClick={() => void act(() => requestDelete(doc.id, reason)).then(() => setDeleting(false))}>Delete it</Button>
                <Button onClick={() => setDeleting(false)}>Keep it</Button>
              </Stack>
            </Stack>
          ) : null}
          {voiding ? (
            <Stack spacing={1}>
              <TextField size="small" label="Why is it voided?" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              <Stack direction="row" spacing={1}>
                <Button color="error" variant="contained" disabled={busy || !reason.trim()} onClick={() => void act(() => voidEnvelope(doc.id, reason)).then(() => setVoiding(false))}>Void it</Button>
                <Button onClick={() => setVoiding(false)}>Keep it</Button>
              </Stack>
            </Stack>
          ) : null}
          {doc.status === 'void' ? <Alert severity="info">Voided: {doc.void_reason}</Alert> : null}

          <Divider />
          {doc.body_text ? (
            <Box>
              <Button size="small" onClick={() => setShowText(!showText)}>{showText ? 'Hide the words' : 'Show the exact words'}</Button>
              {showText ? (
                <Box sx={{ mt: 1, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                  <DocumentText text={doc.body_text} compact />
                </Box>
              ) : null}
              <Typography variant="caption" component="div" sx={{ mt: 1, wordBreak: 'break-all', fontFamily: 'ui-monospace, Consolas, monospace' }}>
                Fingerprint (SHA-256): {doc.body_sha256}
              </Typography>
            </Box>
          ) : doc.source === 'pdf' ? (
            <Typography variant="caption" component="div" sx={{ wordBreak: 'break-all', fontFamily: 'ui-monospace, Consolas, monospace' }}>
              PDF fingerprint (SHA-256): {doc.fingerprint || 'not recorded'}
            </Typography>
          ) : <Typography variant="body2" color="text.secondary">The words are fixed when it is sent.</Typography>}

          <Box>
            <Typography variant="overline" color="text.secondary">History</Typography>
            <Stack spacing={0.5}>
              {(doc.events ?? []).map((ev, i) => (
                <Typography key={i} variant="caption" component="div">
                  {when(ev.at)} · <b>{ev.kind.replace(/_/g, ' ')}</b>{ev.actor ? ` · ${ev.actor}` : ''}{ev.detail && !ev.detail.includes('SHA-256') ? ` · ${ev.detail}` : ''}
                </Typography>
              ))}
            </Stack>
          </Box>
        </Stack>
      )}
    </Drawer>
  );
}
