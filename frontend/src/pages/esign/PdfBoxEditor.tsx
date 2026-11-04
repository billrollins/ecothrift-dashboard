/**
 * Place the boxes on an uploaded PDF (`${scope.base}/:id/boxes`, the owner). Pick a signer and what the box is for,
 * click the page to drop it, drag it to move, drag its corner to resize, ✕ to remove. Every signer needs a signature
 * box. Then Send: the PDF and the boxes are frozen and the first signer's turn opens.
 *
 * Once sent, the same page shows where the boxes are, read-only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, ToggleButton, ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { PageShell } from './kit';
import { errText, getEnvelope, saveBoxes, sendEnvelope, sourcePdf, type BoxKind, type Envelope, type PlacedBox } from '@/esign/api';
import { PdfPages, boxWord, type PageSize } from '@/esign/PdfPages';
import CopyLink from './CopyLink';
import { NOT_EMAILED, type EsignScope } from './scope';

const SIGNER_COLOURS = ['#2e7d32', '#1565c0', '#ad1457', '#ef6c00', '#6a1b9a', '#00838f', '#5d4037', '#455a64'];
const KINDS: BoxKind[] = ['signature', 'initials', 'name', 'title', 'date'];
/** A new box's size, as a share of the page's width and height. */
const SIZE: Record<BoxKind, [number, number]> = {
  signature: [0.3, 0.055], initials: [0.08, 0.04], name: [0.3, 0.032], title: [0.25, 0.032], date: [0.16, 0.032],
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const colour = (signer: number) => SIGNER_COLOURS[(signer - 1) % SIGNER_COLOURS.length];

function BoxOnPage({ box, size, label, editable, onChange, onRemove }: {
  box: PlacedBox; size: PageSize; label: string; editable: boolean;
  onChange: (b: PlacedBox) => void; onRemove: () => void;
}) {
  const start = useRef<{ x: number; y: number; box: PlacedBox; resize: boolean } | null>(null);
  const down = (resize: boolean) => (e: React.PointerEvent) => {
    if (!editable) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, box, resize };
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = (e.clientX - s.x) / size.width;
    const dy = (e.clientY - s.y) / size.height;
    if (s.resize) {
      onChange({ ...s.box, w: clamp(s.box.w + dx, 0.02, 1 - s.box.x), h: clamp(s.box.h + dy, 0.015, 1 - s.box.y) });
    } else {
      onChange({ ...s.box, x: clamp(s.box.x + dx, 0, 1 - s.box.w), y: clamp(s.box.y + dy, 0, 1 - s.box.h) });
    }
  };
  const up = () => { start.current = null; };
  const c = colour(box.signer);
  return (
    <Box data-testid="placed-box" onClick={(e) => e.stopPropagation()} onPointerDown={down(false)} onPointerMove={move} onPointerUp={up}
      sx={{ position: 'absolute', left: box.x * size.width, top: box.y * size.height, width: box.w * size.width, height: box.h * size.height,
        border: `2px solid ${c}`, bgcolor: `${c}22`, borderRadius: '3px', cursor: editable ? 'move' : 'default', touchAction: 'none',
        display: 'flex', alignItems: 'flex-end', overflow: 'visible' }}>
      <Box component="span" sx={{ fontSize: 10.5, lineHeight: 1.15, fontWeight: 700, color: c, px: '3px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {label}
      </Box>
      {editable ? (
        <>
          <Box component="button" type="button" aria-label={`Remove ${label}`} onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            sx={{ position: 'absolute', top: -10, right: -10, width: 20, height: 20, borderRadius: '50%', border: 0, bgcolor: c, color: '#fff',
              fontSize: 11, lineHeight: '20px', p: 0, cursor: 'pointer' }}>✕</Box>
          <Box aria-hidden onPointerDown={down(true)} onPointerMove={move} onPointerUp={up}
            sx={{ position: 'absolute', right: -5, bottom: -5, width: 12, height: 12, bgcolor: c, borderRadius: '2px', cursor: 'nwse-resize' }} />
        </>
      ) : null}
    </Box>
  );
}

export default function PdfBoxEditor({ scope }: { scope: EsignScope }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const docId = Number(id);
  const [doc, setDoc] = useState<Envelope | null>(null);
  const [pdf, setPdf] = useState<ArrayBuffer | null>(null);
  const [boxes, setBoxes] = useState<PlacedBox[]>([]);
  const [signer, setSigner] = useState(1);
  const [kind, setKind] = useState<BoxKind>('signature');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [sentLink, setSentLink] = useState<{ link: string; name: string } | null>(null);

  useEffect(() => {
    getEnvelope(docId).then((d) => { setDoc(d); setBoxes(d.boxes ?? []); }).catch((e) => setError(errText(e, 'That document did not load.')));
    sourcePdf(docId).then(setPdf).catch((e) => setError(errText(e, 'The PDF did not load.')));
  }, [docId]);

  const editable = doc?.status === 'draft';
  const change = useCallback((next: PlacedBox[]) => { setBoxes(next); setDirty(true); setSaved(''); }, []);
  const place = (page: number, x: number, y: number) => {
    if (!editable) return;
    const [w, h] = SIZE[kind];
    change([...boxes, { signer, kind, page, w, h, x: clamp(x - w / 2, 0, 1 - w), y: clamp(y - h / 2, 0, 1 - h) }]);
  };
  const missing = useMemo(() => (doc?.parties ?? []).filter((p) => !boxes.some((b) => b.signer === p.order && b.kind === 'signature')), [doc, boxes]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const out = await saveBoxes(docId, boxes);
      setDoc(out);
      setBoxes(out.boxes ?? []);
      setDirty(false);
      setSaved('Saved.');
      return true;
    } catch (e) {
      setError(errText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    if (dirty && !(await save())) return;
    setBusy(true);
    setError('');
    try {
      const out = await sendEnvelope(docId);
      const first = out.parties[0];
      if (first && !first.user_id && !out.emailed && out.link) setSentLink({ link: out.link, name: first.name });
      else navigate(`${scope.home}?doc=${docId}`);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!doc) {
    return <PageShell width="standard">{error ? <Alert severity="error">{error}</Alert> : <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress size={26} /></Box>}</PageShell>;
  }
  const nameOf = (order: number) => doc.parties.find((p) => p.order === order)?.name ?? `Signer ${order}`;

  return (
    <PageShell width="standard">
      <Box sx={{ position: 'sticky', top: { xs: 56, md: 64 }, zIndex: 5, bgcolor: 'background.default', pb: 1.5, pt: 0.5 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <Button onClick={() => navigate(`${scope.home}?doc=${docId}`)}>← Back</Button>
          <Typography variant="h6" sx={{ flex: 1, minWidth: 0 }} noWrap>{doc.title}</Typography>
          {editable ? (
            <>
              <Button onClick={() => void save()} disabled={busy || !dirty}>{dirty ? 'Save boxes' : saved || 'Saved'}</Button>
              <Button variant="contained" onClick={() => void send()} disabled={busy || missing.length > 0} data-testid="send-pdf">Send</Button>
            </>
          ) : <Chip label={`${doc.status_label}: the boxes are fixed`} />}
        </Stack>
        {editable ? (
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
              <Typography variant="body2" color="text.secondary">For</Typography>
              {doc.parties.map((p) => (
                <Chip key={p.order} label={`${p.order}. ${p.name}`} onClick={() => setSigner(p.order)} data-testid={`box-signer-${p.order}`}
                  variant={signer === p.order ? 'filled' : 'outlined'}
                  sx={{ borderColor: colour(p.order), ...(signer === p.order ? { bgcolor: colour(p.order), color: '#fff' } : { color: colour(p.order) }) }} />
              ))}
            </Stack>
            <ToggleButtonGroup size="small" exclusive value={kind} onChange={(_, v) => v && setKind(v)} sx={{ flexWrap: 'wrap' }}>
              {KINDS.map((k) => <ToggleButton key={k} value={k} data-testid={`box-kind-${k}`}>{boxWord(k)}</ToggleButton>)}
            </ToggleButtonGroup>
            <Typography variant="body2" color="text.secondary">
              Click the page to add a {boxWord(kind).toLowerCase()} box for {nameOf(signer)}. Drag a box to move it; drag its corner to resize.
            </Typography>
            {missing.length ? <Alert severity="info" sx={{ py: 0 }}>Still needs a signature box: {missing.map((p) => p.name).join(', ')}.</Alert> : null}
          </Stack>
        ) : null}
        {error ? <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert> : null}
      </Box>
      <Box sx={{ maxWidth: 860, mx: 'auto', width: '100%' }}>
        {pdf ? (
          <PdfPages data={pdf} onPageClick={editable ? place : undefined}
            overlay={(size) => boxes.map((b, i) => (b.page === size.page ? (
              <BoxOnPage key={i} box={b} size={size} editable={editable} label={`${boxWord(b.kind)} · ${nameOf(b.signer)}`}
                onChange={(nb) => change(boxes.map((x, j) => (j === i ? nb : x)))} onRemove={() => change(boxes.filter((_, j) => j !== i))} />
            ) : null))} />
        ) : <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress size={26} /></Box>}
      </Box>
      {sentLink ? (
        <Dialog open onClose={() => navigate(`${scope.home}?doc=${docId}`)} maxWidth="sm" fullWidth>
          <DialogTitle>Sent</DialogTitle>
          <DialogContent>
            <Typography sx={{ mb: 2 }}>{`${NOT_EMAILED} It goes to ${sentLink.name}.`}</Typography>
            <CopyLink link={sentLink.link} />
          </DialogContent>
          <DialogActions><Button variant="contained" onClick={() => navigate(`${scope.home}?doc=${docId}`)}>Done</Button></DialogActions>
        </Dialog>
      ) : null}
    </PageShell>
  );
}
