/**
 * The owner's e-sign tracker, adapted from Dark Horse's Documents page (D22). Eco-Thrift shows it in two places
 * (`scope.ts`): Contractors (/admin/contractors, #21) and HR documents (HR > Requests > Documents, #62). Each sees only
 * its own kinds; Dark Horse's filing guide is left out (Eco-Thrift has no Training or Resources to point to).
 *
 * - Signing: the tracker. What is out and whose turn it is, whose link has expired, what is signed, drafts, voided,
 *   being deleted. A document is written from a template or is an uploaded PDF with boxes placed on it.
 * - Sent to everyone (HR only): one document per person (handbook acknowledgments), and who hasn't signed.
 * - Templates: written documents with fill-ins, versioned (apps/esign).
 * - Purge log: what was deleted for good, who asked, and why.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Stack, Tab, Tabs, Typography,
} from '@mui/material';
import { EmptyState, PageShell, PageToolbar, Section, StatTile, StatusPill, type Tone } from './kit';
import { ICONS } from './kit';
import type { EsignScope } from './scope';
import {
  errText, listEnvelopes, listPurgeLog, listTemplates, type Envelope, type EsignTemplate, type Party, type PurgeLogEntry,
} from '@/esign/api';
import DocumentDetail from './DocumentDetail';
import EveryonePanel from './EveryonePanel';
import NewDocumentDialog from './NewDocumentDialog';

const I = ICONS;
type View = 'out' | 'signed' | 'draft' | 'void' | 'deleting';
const VIEWS: { id: View; label: string; statuses: string }[] = [
  { id: 'out', label: 'Out for signature', statuses: 'out' },
  { id: 'signed', label: 'Signed', statuses: 'signed,ended' },
  { id: 'draft', label: 'Drafts', statuses: 'draft' },
  { id: 'void', label: 'Voided', statuses: 'void' },
  { id: 'deleting', label: 'Being deleted', statuses: '' },
];
/** Documents sent to everyone (a handbook acknowledgment each) are followed on their own tab, not listed one by one here. */
const inView = (e: Envelope, view: View) =>
  view === 'deleting' ? e.deleting
    : !e.deleting && !e.batch && VIEWS.find((v) => v.id === view)!.statuses.split(',').includes(e.status);

export function day(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}

const PARTY_TONE: Record<Party['status'], Tone> = { signed: 'good', ready: 'wait', waiting: 'quiet' };

/** The signers in order: ✓ signed, the one whose turn it is, then the rest. */
export function PartyChain({ parties }: { parties: Party[] }) {
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
      {parties.map((p) => (
        <StatusPill key={p.id} tone={p.status === 'ready' && p.link_state === 'expired' ? 'problem' : PARTY_TONE[p.status]}
          label={`${p.status === 'signed' ? '✓ ' : p.status === 'ready' ? '→ ' : ''}${p.name}${p.status === 'ready' && p.link_state === 'expired' ? ' (link expired)' : ''}`} />
      ))}
    </Stack>
  );
}

function Tracker({ scope }: { scope: EsignScope }) {
  const [view, setView] = useState<View>('out');
  const [rows, setRows] = useState<Envelope[] | null>(null);
  const [all, setAll] = useState<Envelope[]>([]);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [params, setParams] = useSearchParams();

  const load = useCallback(() => {
    listEnvelopes().then((list) => setAll(list.filter((e) => scope.owns(e.kind)))).catch((e) => setError(errText(e, 'Documents did not load.')));
  }, [scope]);
  useEffect(load, [load]);
  useEffect(() => {
    setRows(all.filter((e) => inView(e, view)));
  }, [all, view]);
  useEffect(() => {
    const id = Number(params.get('doc'));
    if (id) setOpenId(id);
  }, [params]);

  const counts = useMemo(() => {
    const out = all.filter((e) => e.status === 'out' && !e.batch);
    const monthAgo = Date.now() - 30 * 86400000;
    return {
      out: out.length,
      expired: out.filter((e) => e.parties.some((p) => p.status === 'ready' && p.link_state === 'expired')).length,
      signed30: all.filter((e) => e.status === 'signed' && e.completed_at && new Date(e.completed_at).getTime() > monthAgo).length,
      drafts: all.filter((e) => e.status === 'draft').length,
      everyoneOut: all.filter((e) => e.status === 'out' && e.batch).length,
    };
  }, [all]);

  const close = () => {
    setOpenId(null);
    if (params.get('doc')) {
      params.delete('doc');
      setParams(params, { replace: true });
    }
  };

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        <StatTile label="Out for signature" value={String(counts.out)} />
        <StatTile label="Link expired" value={String(counts.expired)} note={counts.expired ? 'send a new link' : undefined} />
        <StatTile label="Signed, last 30 days" value={String(counts.signed30)} />
        <StatTile label="Drafts" value={String(counts.drafts)} />
      </Box>
      <PageToolbar lead={
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {VIEWS.filter((v) => v.id !== 'deleting' || all.some((e) => e.deleting)).map((v) => (
            <Chip key={v.id} label={v.label} color={view === v.id ? 'primary' : 'default'} variant={view === v.id ? 'filled' : 'outlined'}
              onClick={() => setView(v.id)} sx={{ height: 36, borderRadius: 999, px: 0.5 }} />
          ))}
        </Stack>
      }>
        <Button variant="contained" onClick={() => setCreating(true)} data-testid="new-document">
          {scope.key === 'contractors' ? 'New agreement' : 'New document'}
        </Button>
      </PageToolbar>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {counts.everyoneOut && view === 'out' ? (
        <Typography variant="body2" color="text.secondary">
          Also out: {counts.everyoneOut} sent to everyone (like a handbook acknowledgment).{' '}
          <Box component="button" type="button" onClick={() => setParams({ tab: 'everyone' })}
            sx={{ border: 0, p: 0, bgcolor: 'transparent', color: 'primary.main', font: 'inherit', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
            See who hasn't signed
          </Box>
        </Typography>
      ) : null}
      <Section flush>
        {!rows ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress size={26} /></Box>
        ) : rows.length === 0 ? (
          <EmptyState Icon={I.description} title="Nothing here" body={view === 'out' ? 'Nothing is out for signature.' : 'No documents in this list yet.'} />
        ) : rows.map((e) => (
          <Box key={e.id} component="button" type="button" onClick={() => setOpenId(e.id)} aria-label={`Open ${e.title}`}
            sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { md: 'center' }, gap: 1.5, width: '100%', textAlign: 'left',
              px: { xs: 2, md: 2.5 }, py: 1.5, border: 0, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'transparent', color: 'inherit',
              font: 'inherit', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, '&:first-of-type': { borderTop: 0 } }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }}>{e.title}</Typography>
              <Typography variant="caption" component="div">
                {[e.attached_label, e.source === 'pdf' ? (e.imported_from ? 'PDF from MyDocs' : 'Uploaded PDF') : e.template_name,
                  e.deleting ? `purged ${day(e.purge_after)} unless restored` : '', e.status === 'out' ? `sent ${day(e.sent_at)}` : e.status === 'signed' ? `signed ${day(e.completed_at)}` : e.status === 'void' ? `voided: ${e.void_reason}` : `started ${day(e.created_at)}`].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <PartyChain parties={e.parties} />
          </Box>
        ))}
      </Section>
      {openId != null ? <DocumentDetail scope={scope} id={openId} onClose={close} onChanged={load} /> : null}
      {creating ? <NewDocumentDialog scope={scope} onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); load(); setOpenId(id); }} /> : null}
    </Stack>
  );
}

function PurgeLog({ scope }: { scope: EsignScope }) {
  const [rows, setRows] = useState<PurgeLogEntry[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { listPurgeLog().then((list) => setRows(list.filter((r) => scope.owns(r.kind)))).catch((e) => setError(errText(e))); }, [scope]);
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        A document asked to be deleted is purged 90 days later (or at once, if the owner says so). This is what remains: what it was,
        who asked, and why. The files themselves are gone.
      </Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Section flush>
        {!rows ? <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress size={26} /></Box>
          : rows.length === 0 ? <EmptyState Icon={I.description} title="Nothing purged" body="No document has been deleted for good." />
            : rows.map((r) => (
              <Box key={r.id} sx={{ px: { xs: 2, md: 2.5 }, py: 1.5, borderTop: '1px solid', borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
                <Typography sx={{ fontWeight: 600 }}>{r.title}</Typography>
                <Typography variant="caption" component="div">
                  {[r.attached_label, r.parties && `signers: ${r.parties}`, `was ${r.status}`].filter(Boolean).join(' · ')}
                </Typography>
                <Typography variant="caption" component="div">
                  Asked by {r.requested_by || 'someone'} on {day(r.requested_at)}: {r.reason} · purged {day(r.purged_at)} ({r.purged_by}) · {r.files} file{r.files === 1 ? '' : 's'} removed
                </Typography>
              </Box>
            ))}
      </Section>
    </Stack>
  );
}

function Templates({ scope }: { scope: EsignScope }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<EsignTemplate[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { listTemplates().then((list) => setRows(list.filter((t) => scope.owns(t.kind)))).catch((e) => setError(errText(e))); }, [scope]);
  return (
    <Stack spacing={2}>
      <PageToolbar lead={<Typography variant="body2" color="text.secondary">Written documents with fill-ins. Every save is a new version; a document already sent keeps its words.</Typography>}>
        <Button variant="contained" onClick={() => navigate(`${scope.base}/templates/new`)}>New template</Button>
      </PageToolbar>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Section flush>
        {!rows ? <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress size={26} /></Box>
          : rows.length === 0 ? <EmptyState Icon={I.description} title="No templates yet" body="Make one for each kind of document you send." />
            : rows.map((t) => (
              <Box key={t.id} component="button" type="button" onClick={() => navigate(`${scope.base}/templates/${t.id}`)}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', textAlign: 'left', px: { xs: 2, md: 2.5 }, py: 1.5, border: 0,
                  borderTop: '1px solid', borderColor: 'divider', bgcolor: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' }, '&:first-of-type': { borderTop: 0 } }}>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 600 }}>{t.name}</Typography>
                  <Typography variant="caption">{t.latest ? `Version ${t.latest.number} · ${t.latest.title}` : 'No version yet'}</Typography>
                </Box>
                <I.chevronDown sx={{ color: 'text.disabled', transform: 'rotate(-90deg)' }} />
              </Box>
            ))}
      </Section>
    </Stack>
  );
}

export default function DocumentsPage({ scope }: { scope: EsignScope }) {
  const [params, setParams] = useSearchParams();
  const wanted = params.get('tab');
  const tab = (wanted === 'everyone' && scope.everyone) || wanted === 'templates' || wanted === 'purged' ? wanted : 'signing';
  return (
    <PageShell width="standard">
      <Tabs value={tab} onChange={(_, v) => setParams({ tab: v })} variant="scrollable" allowScrollButtonsMobile
        sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="signing" label={scope.key === 'contractors' ? 'Agreements' : 'Signing'} />
        {scope.everyone ? <Tab value="everyone" label="Sent to everyone" /> : null}
        <Tab value="templates" label="Templates" />
        <Tab value="purged" label="Purge log" />
      </Tabs>
      {tab === 'signing' ? <Tracker scope={scope} />
        : tab === 'everyone' ? <EveryonePanel scope={scope} onOpen={(id) => setParams({ tab: 'signing', doc: String(id) })} />
          : tab === 'templates' ? <Templates scope={scope} /> : <PurgeLog scope={scope} />}
    </PageShell>
  );
}
