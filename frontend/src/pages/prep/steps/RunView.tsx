// One truck in Truck Prep A: the step rail, the step's header (what ran, time, cost), its batch tools, its table.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  Box, Button, ButtonGroup, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  LinearProgress, Menu, MenuItem, MenuList, ListSubheader, TextField, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BuildIcon from '@mui/icons-material/Build';
import UndoIcon from '@mui/icons-material/Undo';
import {
  prepStepsApi, STEP_KEYS, type PrepAction, type PrepActionDetail, type PrepLine, type PrepRun, type PrepState, type StepKey,
} from '../../../api/prepSteps.api';
import LineTable, { sortLines } from './LineTable';
import { columnsFor } from './columns';
import PreviewDialog from './PreviewDialog';
import SendBar from './SendBar';
import LineDetail from './LineDetail';
import StepRail from './StepRail';
import { CUSTOM_DEFAULT, CUSTOM_FIELDS, STEP_INFO, type SetField } from './stepTools';
import { cost, modelName, money, pct, secs, tone } from './tokens';

type Filter = 'all' | 'open' | 'changed' | `flag:${string}`;

const COLUMN_FIELDS = ['title', 'brand', 'model', 'qty', 'retail', 'ext_retail', 'category', 'subcategory', 'condition', 'upc',
  'item_number', 'image_url', 'page_url'];

function errText(e: unknown): string {
  const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return d || (e as Error)?.message || 'Something went wrong';
}

const STEP_FIELDS: Record<StepKey, string[]> = {
  load: [],
  clean: ['title', 'brand', 'model', 'qty'],
  match: ['match_product_id', 'match_kind'],
  category: ['category', 'subcategory'],
  retail: ['retail'],
  price: ['price', 'price_class'],
  packs: ['unit_count', 'pack_units', 'sell_as', 'pieces'],
  send: ['search_tags'],
};

function stepStats(step: StepKey, lines: PrepLine[]): string {
  const n = (f: (l: PrepLine) => boolean) => lines.filter(f).length.toLocaleString();
  const tags = (l: PrepLine) => l.qty * Math.max(1, l.pieces || 1);
  switch (step) {
    case 'load':
      return `${lines.length.toLocaleString()} lines · ${lines.reduce((s, l) => s + l.src_qty, 0).toLocaleString()} units · ${money(lines.reduce((s, l) => s + (l.src_retail || 0) * l.src_qty, 0), false)} retail`;
    case 'clean':
      return `${n((l) => !!l.brand)} with a brand · ${n((l) => l.title !== l.src_title)} titles cleaned`;
    case 'match':
      return `${n((l) => l.match_kind === 'is')} is · ${n((l) => l.match_kind === 'like')} like · ${n((l) => l.match_kind === 'new')} new`;
    case 'category': {
      const c: Record<string, number> = {};
      lines.forEach((l) => { c[l.category || '(none)'] = (c[l.category || '(none)'] || 0) + 1; });
      const top = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(' · ');
      return `${Object.keys(c).length} categories · ${top} · ${n((l) => !!l.subcategory)} with a subcategory`;
    }
    case 'retail':
      return `${money(lines.reduce((s, l) => s + (l.retail || 0) * tags(l), 0), false)} retail · ${n((l) => l.retail !== l.src_retail && (l.pieces || 1) === 1)} changed from the manifest`;
    case 'price': {
      const r = lines.reduce((s, l) => s + (l.price ? (l.retail || 0) * tags(l) : 0), 0);
      const t = lines.reduce((s, l) => s + (l.price || 0) * tags(l), 0);
      return `${money(t, false)} tag · ${r ? pct(t / r) : ''} of retail · ${n((l) => ['S1', 'PL'].includes(l.price_class))} commodities`;
    }
    case 'packs':
      return `${n((l) => (l.pack_units || 1) > 1)} packs · ${n((l) => l.sell_as === 'units')} sold by unit · ${lines.reduce((s, l) => s + tags(l), 0).toLocaleString()} tags`;
    default:
      return `${n((l) => !!l.price && !!l.match_kind)} of ${lines.length.toLocaleString()} ready`;
  }
}

function ActionRow({ a, onOpen, onUndo, busy }: { a: PrepAction; onOpen: (a: PrepAction) => void; onUndo: (a: PrepAction) => void; busy: boolean }) {
  const who = a.kind === 'edit' ? 'By hand' : a.model ? `${modelName(a.model)}${a.effort ? ` (${a.effort})` : ''}` : 'Code, no AI';
  const running = a.status === 'running';
  return (
    <Box
      sx={{
        display: 'grid', gridTemplateColumns: '150px minmax(180px, 1fr) 120px 120px 80px 80px 170px', alignItems: 'center',
        fontSize: 13, height: 28, borderBottom: `1px solid ${tone.lineSoft}`, '& > *': { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', px: 0.75 },
        opacity: a.status === 'undone' ? 0.5 : 1,
      }}
    >
      <Box sx={{ fontWeight: 700, color: a.model ? tone.ai : a.kind === 'edit' ? tone.good : tone.inkSoft }}>{who}</Box>
      <Box title={a.prompt || a.label}>
        {a.label}
        {a.status === 'undone' && ' (undone)'}
        {a.status === 'failed' && <Box component="span" sx={{ color: tone.bad }}> failed: {a.error}</Box>}
      </Box>
      <Box sx={{ textAlign: 'right' }}>{a.line_count.toLocaleString()} lines in</Box>
      <Box sx={{ textAlign: 'right', fontWeight: 700 }}>
        {running ? `${a.batches_done}/${a.batches_total || '?'} batches` : `${(a.status === 'preview' ? a.changed_count : a.changed_count).toLocaleString()} ${a.status === 'preview' ? 'to change' : 'changed'}`}
      </Box>
      <Box sx={{ textAlign: 'right' }}>{running ? '' : secs(a.seconds)}</Box>
      <Box sx={{ textAlign: 'right' }}>{a.model ? cost(a.cost) : '$0'}</Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
        {running && <Box sx={{ width: 90, alignSelf: 'center' }}><LinearProgress variant="determinate" value={a.batches_total ? (100 * a.batches_done) / a.batches_total : 5} /></Box>}
        {a.status === 'preview' && (
          <Button size="small" variant="contained" color="secondary" sx={{ height: 22, fontSize: 12 }} onClick={() => onOpen(a)}>
            Review {a.preview_count}
          </Button>
        )}
        {a.status === 'applied' && a.name !== 'load' && a.name !== 'send' && (
          <>
            {a.model && <Button size="small" sx={{ height: 22, fontSize: 12, minWidth: 0 }} onClick={() => onOpen(a)}>See</Button>}
            <Button size="small" startIcon={<UndoIcon sx={{ fontSize: 14 }} />} sx={{ height: 22, fontSize: 12 }} disabled={busy} onClick={() => onUndo(a)}>
              Undo
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
}

function TargetBar({ run, onTarget, onScale, onReprice, busy }: { run: PrepRun; onTarget: (share: number, band: number) => void; onScale: () => void; onReprice: () => void; busy: boolean }) {
  const [share, setShare] = useState(String(Math.round(run.target.share * 100)));
  const [band, setBand] = useState(String(Math.round(run.target.band * 100)));
  useEffect(() => {
    setShare(String(Math.round(run.target.share * 100)));
    setBand(String(Math.round(run.target.band * 100)));
  }, [run.target.share, run.target.band]);
  const tag = run.totals.tag;
  const goal = run.target.total;
  const gap = goal ? (tag - goal) / goal : 0;
  const outliers = (run.steps.find((s) => s.key === 'price')?.flags || {});
  const commit = () => {
    const s = Number(share) / 100;
    const b = Number(band) / 100;
    if (s >= 0.05 && s <= 1 && b >= 0.01 && b <= 0.5 && (s !== run.target.share || b !== run.target.band)) onTarget(s, b);
  };
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 1.5, height: 52, border: `1px solid ${tone.line}`, borderRadius: 1, bgcolor: '#fff' }}>
      <Box sx={{ fontWeight: 800, fontSize: 14 }}>Truck target</Box>
      <TextField size="small" label="Tag % of retail" value={share} onChange={(e) => setShare(e.target.value.replace(/[^\d]/g, ''))} onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()} sx={{ width: 120 }} slotProps={{ htmlInput: { 'aria-label': 'Target percent' } }} />
      <TextField size="small" label="Outlier band +/- %" value={band} onChange={(e) => setBand(e.target.value.replace(/[^\d]/g, ''))} onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()} sx={{ width: 140 }} />
      <Divider orientation="vertical" flexItem />
      <Box sx={{ fontSize: 14 }}>
        Tag total <b>{money(tag, false)}</b> vs target <b>{money(goal, false)}</b>{' '}
        <Box component="span" sx={{ fontWeight: 800, color: Math.abs(gap) > 0.03 ? tone.bad : tone.good }}>
          {gap >= 0 ? '+' : ''}{pct(gap)}
        </Box>
      </Box>
      <Box sx={{ fontSize: 13, color: tone.inkSoft }}>
        {(outliers.below_band || 0) + (outliers.above_band || 0)} outliers ({outliers.below_band || 0} under, {outliers.above_band || 0} over)
        · tag is {run.totals.cost ? `${(tag / run.totals.cost).toFixed(2)}x` : '-'} truck cost
      </Box>
      <Box sx={{ flex: 1 }} />
      <Button size="small" variant="outlined" disabled={busy} onClick={onReprice}>Price all to target</Button>
      <Button size="small" variant="outlined" disabled={busy} onClick={onScale}>Scale to hit target</Button>
    </Box>
  );
}

export default function RunView({ run, lines }: { run: PrepRun; lines: PrepLine[] }) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const orderId = run.order_id;
  const step = run.step;
  const info = STEP_INFO[step];
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [menu, setMenu] = useState<{ el: HTMLElement; kind: 'fix' | 'ai' | 'set' } | null>(null);
  const [setDlg, setSetDlg] = useState<SetField | null>(null);
  const [setVal, setSetVal] = useState('');
  const [shareDlg, setShareDlg] = useState(false);
  const [shareVal, setShareVal] = useState('55');
  const [custom, setCustom] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [fields, setFields] = useState<string[]>(CUSTOM_DEFAULT[step]);
  const [strength, setStrength] = useState<'fast' | 'strong'>('fast');
  const tableBox = useRef<HTMLDivElement>(null);
  const [tableH, setTableH] = useState(500);
  const [openLine, setOpenLine] = useState<number | null>(null);
  const [colMenu, setColMenu] = useState<{ el: HTMLElement; field: string } | null>(null);

  useEffect(() => {
    setFilter('all');
    setSelected(new Set());
    setSort(null);
    setFields(CUSTOM_DEFAULT[step]);
  }, [step]);

  useLayoutEffect(() => {
    const fit = () => {
      const top = tableBox.current?.getBoundingClientRect().top ?? 300;
      setTableH(Math.max(320, window.innerHeight - top - 16));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [step]);

  const absorb = useCallback((s: PrepState) => {
    qc.setQueryData(['prepSteps', 'run', orderId], { run: s.run });
    if (s.lines) {
      qc.setQueryData<{ lines: PrepLine[] }>(['prepSteps', 'lines', orderId], (old) => {
        if (!old || s.lines!.length >= (old.lines.length || 0)) return { lines: s.lines! };
        const byId = new Map(s.lines!.map((l) => [l.id, l]));
        return { lines: old.lines.map((l) => byId.get(l.id) || l) };
      });
    }
  }, [qc, orderId]);

  const go = useCallback(async (fn: () => Promise<PrepState>, done?: string) => {
    setBusy(true);
    try {
      const s = await fn();
      absorb(s);
      if (done) enqueueSnackbar(done, { variant: 'success' });
      return s;
    } catch (e) {
      enqueueSnackbar(errText(e), { variant: 'error' });
      return null;
    } finally {
      setBusy(false);
    }
  }, [absorb, enqueueSnackbar]);

  // The AI job being watched: poll until it has a preview.
  const watch = useQuery({
    queryKey: ['prepSteps', 'action', watchId],
    queryFn: () => prepStepsApi.action(watchId!).then((r) => r.action),
    enabled: watchId !== null,
    refetchInterval: (query) => ((query.state.data as PrepActionDetail | undefined)?.status === 'running' ? 1000 : false),
  });
  const watched = watch.data || null;
  const lastStatus = useRef<string>('');
  useEffect(() => {
    if (!watched) return;
    if (lastStatus.current === 'running' && watched.status !== 'running') {
      qc.invalidateQueries({ queryKey: ['prepSteps', 'run', orderId] });
      if (watched.status === 'preview') setPreviewOpen(true);
      if (watched.status === 'failed') enqueueSnackbar(`AI job failed: ${watched.error}`, { variant: 'error' });
    }
    if (watched.status === 'running') {
      qc.setQueryData<{ run: PrepRun }>(['prepSteps', 'run', orderId], (old) =>
        old ? { run: { ...old.run, actions: old.run.actions.map((a) => (a.id === watched.id ? { ...a, ...watched } : a)) } } : old);
    }
    lastStatus.current = watched.status;
  }, [watched, qc, orderId, enqueueSnackbar]);

  const flagText = run.flag_text;
  const stepState = run.steps.find((s) => s.key === step)!;
  const categories = useMemo(() => run.categories || {}, [run.categories]);
  const jobs = run.ai_jobs || {};
  const est = (name: string) => {
    const j = jobs[name];
    if (!j) return '';
    const c = j.per_line * target.length;
    return `${modelName(j.model)} · ~${c < 0.01 ? '<$0.01' : cost(c)}`;
  };
  const columns = useMemo(
    () => columnsFor(step, { flagText, categories, targetShare: run.target.share, band: run.target.band, onOpen: (l) => setOpenLine(l.id) }),
    [step, flagText, categories, run.target.share, run.target.band],
  );
  const openIds = useMemo(() => new Set(lines.filter((l) => l.open.includes(step)).map((l) => l.id)), [lines, step]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    let out = lines;
    if (filter === 'open') out = out.filter((l) => openIds.has(l.id));
    else if (filter === 'changed') out = out.filter((l) => STEP_FIELDS[step].some((f) => l.sources?.[f] && l.sources[f] !== 'manifest'));
    else if (filter.startsWith('flag:')) {
      const f = filter.slice(5);
      out = out.filter((l) => (l.flags[step] || []).includes(f));
    }
    if (t) {
      out = out.filter((l) => `${l.row_number} ${l.title} ${l.src_title} ${l.brand} ${l.category} ${l.upc} ${l.item_number} ${l.product?.number || ''}`.toLowerCase().includes(t));
    }
    return sortLines(out, columns, sort);
  }, [lines, filter, q, openIds, step, columns, sort]);
  const target = selected.size ? shown.filter((l) => selected.has(l.id)) : shown;
  const targetIds = target.map((l) => l.id);
  const stepActions = run.actions.filter((a) => a.step === step);
  const i = STEP_KEYS.indexOf(step);

  const runRule = (name: string, label: string) =>
    go(() => prepStepsApi.rule(orderId, name, targetIds, undefined, true), `${label}: done on ${targetIds.length.toLocaleString()} lines`);
  const runAi = async (name: string, extra?: { prompt?: string; fields?: string[]; strength?: string }) => {
    setBusy(true);
    try {
      const r = await prepStepsApi.ai(orderId, { name, ids: targetIds, step, ...extra });
      lastStatus.current = 'running';
      setWatchId(r.action.id);
      qc.invalidateQueries({ queryKey: ['prepSteps', 'run', orderId] });
      enqueueSnackbar(`${r.action.label}: running on ${targetIds.length.toLocaleString()} lines`, { variant: 'info' });
    } catch (e) {
      enqueueSnackbar(errText(e), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const openAction = (a: PrepAction) => {
    lastStatus.current = a.status;
    setWatchId(a.id);
    setPreviewOpen(true);
    qc.invalidateQueries({ queryKey: ['prepSteps', 'action', a.id] });
  };
  const onEdit = (l: PrepLine, field: string, value: string) => {
    if (field === 'match_pick') {
      const like = value.startsWith('like:');
      const pid = value === 'new' ? null : Number(like ? value.slice(5) : value);
      const kind = value === 'new' ? 'new' : like ? 'like' : 'is';
      return go(() => prepStepsApi.edit(orderId, step, [
        { line: l.id, field: 'match_product_id', new: pid, reason: 'Picked by hand' },
        { line: l.id, field: 'match_kind', new: kind, reason: 'Picked by hand' },
        { line: l.id, field: 'match_confidence', new: 100 },
      ]));
    }
    return go(() => prepStepsApi.edit(orderId, step, [{ line: l.id, field, new: value }]));
  };

  const flagChips = Object.entries(stepState.flags).sort((a, b) => b[1] - a[1]);
  const stats = useMemo(() => stepStats(step, lines), [step, lines]);
  const subOptions = Array.from(new Set(Object.values(categories).flat())).sort();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
      <StepRail steps={run.steps} current={step} busy={busy} onGo={(s) => s !== step && go(() => prepStepsApi.step(orderId, s))} />

      {/* Step header: what this step is, what ran, Back / Next */}
      <Box sx={{ border: `1px solid ${tone.line}`, borderRadius: 1, bgcolor: '#fff', px: 1.5, py: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, height: 40 }}>
          <Box sx={{ fontSize: 20, fontWeight: 800 }}>{i + 1}. {info.title}</Box>
          <Box sx={{ fontSize: 14, color: tone.inkSoft }}>{info.does}</Box>
          <Chip
            size="small"
            label={stepState.open ? `${stepState.open.toLocaleString()} open` : 'None open'}
            sx={{ fontWeight: 800, bgcolor: stepState.open ? tone.openSoft : tone.goodSoft, color: stepState.open ? '#8A5A0B' : tone.good }}
          />
          <Box sx={{ fontSize: 13, color: tone.inkSoft, whiteSpace: 'nowrap' }}>
            This step: {secs(stepState.seconds)} · {cost(stepState.cost)}
          </Box>
          <Box sx={{ fontSize: 13, color: tone.ink, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }} data-testid="step-stats">
            {stats}
          </Box>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ width: 24, display: 'flex' }}>{busy && <CircularProgress size={18} />}</Box>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} disabled={busy || i === 0} onClick={() => go(() => prepStepsApi.step(orderId, 'back'))}>
            Back
          </Button>
          {/* The last step has no Next: its one action is Send to Processing, on the bar below (#233). */}
          {i < STEP_KEYS.length - 1 && (
            <Button
              variant="contained"
              endIcon={<ArrowForwardIcon />}
              disabled={busy}
              onClick={() => go(() => prepStepsApi.step(orderId, 'next'))}
              data-testid="next-step"
            >
              Next: {STEP_INFO[STEP_KEYS[i + 1]].title}
              {stepState.open ? ` (${stepState.open.toLocaleString()} open)` : ''}
            </Button>
          )}
        </Box>
        <Box sx={{ height: 3 * 28 + 2, overflow: 'auto', mt: 0.5, borderTop: `1px solid ${tone.lineSoft}` }} data-testid="ledger">
          {stepActions.length === 0 && <Box sx={{ fontSize: 13, color: tone.inkFaint, py: 0.75 }}>Nothing has run on this step yet.</Box>}
          {stepActions.map((a) => (
            <ActionRow key={a.id} a={a} busy={busy} onOpen={openAction} onUndo={(x) => go(() => prepStepsApi.undo(x.id), 'Undone')} />
          ))}
        </Box>
      </Box>

      {step === 'price' && (
        <TargetBar
          run={run}
          busy={busy}
          onTarget={(share, band) => go(() => prepStepsApi.target(orderId, { share, band }))}
          onScale={() => go(() => prepStepsApi.rule(orderId, 'scale_to_target', null), 'Scaled to the target')}
          onReprice={() => go(() => prepStepsApi.rule(orderId, 'price_rule', null), 'Priced to the target')}
        />
      )}
      {step === 'send' && <SendBar run={run} onState={absorb} />}
      {step === 'load' && (
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', minHeight: 32, fontSize: 13 }}>
          <Box sx={{ fontWeight: 800 }}>Columns found:</Box>
          {COLUMN_FIELDS.map((f) => {
            const h = run.load_info.columns?.[f];
            return (
              <Chip
                key={f}
                size="small"
                label={`${f} ← ${h || 'none'}`}
                onClick={(e) => setColMenu({ el: e.currentTarget, field: f })}
                variant={h ? 'filled' : 'outlined'}
                sx={{ height: 22, fontSize: 12 }}
              />
            );
          })}
          <Box sx={{ color: tone.inkSoft }}>from {run.load_info.source === 'manifest' ? 'manifest rows' : 'the uploaded manifest'}</Box>
        </Box>
      )}

      {/* Toolbar: filters, search, batch tools on the selection (or every shown line) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 40, minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 0.5, overflowX: 'auto', minWidth: 0, flexShrink: 1 }}>
          <Chip label={`All ${lines.length.toLocaleString()}`} onClick={() => setFilter('all')} color={filter === 'all' ? 'primary' : 'default'} size="small" />
          <Chip label={`Open ${openIds.size.toLocaleString()}`} onClick={() => setFilter('open')} color={filter === 'open' ? 'primary' : 'default'} size="small" />
          {STEP_FIELDS[step].length > 0 && <Chip label="Changed" onClick={() => setFilter('changed')} color={filter === 'changed' ? 'primary' : 'default'} size="small" />}
          {flagChips.map(([f, n]) => (
            <Chip key={f} size="small" label={`${flagText[f] || f} ${n}`} onClick={() => setFilter(`flag:${f}`)} color={filter === `flag:${f}` ? 'primary' : 'default'} variant="outlined" />
          ))}
        </Box>
        <TextField size="small" placeholder="Search lines" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: 220, flexShrink: 0 }} />
        <Box sx={{ flex: 1 }} />
        <Box sx={{ fontSize: 13, color: tone.inkSoft, whiteSpace: 'nowrap', width: 190, textAlign: 'right' }}>
          {selected.size ? `${selected.size.toLocaleString()} selected` : `all ${shown.length.toLocaleString()} shown`}
        </Box>
        <ButtonGroup size="small" variant="outlined" disabled={busy || target.length === 0} sx={{ flexShrink: 0 }}>
          <Button onClick={() => go(() => prepStepsApi.accept(orderId, step, targetIds, true), 'Accepted')}>Accept</Button>
          <Button onClick={() => go(() => prepStepsApi.accept(orderId, step, targetIds, false))}>Unaccept</Button>
          {step !== 'load' && <Button onClick={() => go(() => prepStepsApi.rule(orderId, 'revert', targetIds, { step }), 'Back to the manifest')}>Revert</Button>}
          {info.set.length > 0 && <Button onClick={(e) => setMenu({ el: e.currentTarget, kind: 'set' })}>Set value</Button>}
          {(info.rules.length > 0 || step === 'price') && (
            <Button startIcon={<BuildIcon />} onClick={(e) => setMenu({ el: e.currentTarget, kind: 'fix' })}>Standard fix</Button>
          )}
          <Button startIcon={<AutoAwesomeIcon />} onClick={(e) => setMenu({ el: e.currentTarget, kind: 'ai' })} sx={{ color: tone.ai }}>AI</Button>
        </ButtonGroup>
        <Button size="small" onClick={() => setSelected(new Set())} sx={{ flexShrink: 0, visibility: selected.size ? 'visible' : 'hidden' }}>
          Clear
        </Button>
      </Box>

      <Box ref={tableBox} sx={{ minWidth: 0 }}>
        <LineTable
          lines={shown}
          columns={columns}
          selected={selected}
          onSelect={setSelected}
          onEdit={onEdit}
          openIds={openIds}
          height={tableH}
          sort={sort}
          onSort={setSort}
        />
      </Box>

      <Menu anchorEl={menu?.el} open={!!menu} onClose={() => setMenu(null)}>
        {menu?.kind === 'fix' && (
          <MenuList dense>
            <ListSubheader sx={{ lineHeight: '28px' }}>Code, no AI · on {target.length.toLocaleString()} lines</ListSubheader>
            {info.rules.map((t) => (
              <MenuItem key={t.name} onClick={() => { setMenu(null); runRule(t.name, t.label); }}>{t.label}</MenuItem>
            ))}
            {step === 'price' && <MenuItem onClick={() => { setMenu(null); setShareDlg(true); }}>Price at a % of retail...</MenuItem>}
          </MenuList>
        )}
        {menu?.kind === 'ai' && (
          <MenuList dense>
            <ListSubheader sx={{ lineHeight: '28px' }}>AI · preview first · on {target.length.toLocaleString()} lines</ListSubheader>
            {info.ai.map((t) => (
              <MenuItem key={t.name} onClick={() => { setMenu(null); runAi(t.name); }} sx={{ gap: 3, justifyContent: 'space-between' }}>
                <span>{t.label}</span>
                <Box component="span" sx={{ fontSize: 12, color: tone.inkSoft }}>{est(t.name)}</Box>
              </MenuItem>
            ))}
            <MenuItem onClick={() => { setMenu(null); setCustom(true); }}>Custom prompt...</MenuItem>
          </MenuList>
        )}
        {menu?.kind === 'set' && (
          <MenuList dense>
            <ListSubheader sx={{ lineHeight: '28px' }}>Set on {target.length.toLocaleString()} lines</ListSubheader>
            {info.set.map((f) => (
              <MenuItem key={f.field} onClick={() => { setMenu(null); setSetVal(''); setSetDlg(f); }}>{f.label}...</MenuItem>
            ))}
          </MenuList>
        )}
      </Menu>

      <Dialog open={!!setDlg} onClose={() => setSetDlg(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Set {setDlg?.label} on {target.length.toLocaleString()} lines</DialogTitle>
        <DialogContent>
          {setDlg && ['select', 'category', 'subcategory'].includes(setDlg.kind) ? (
            <TextField select fullWidth size="small" value={setVal} onChange={(e) => setSetVal(e.target.value)} sx={{ mt: 1 }} label={setDlg.label}>
              {(setDlg.kind === 'category' ? Object.keys(categories) : setDlg.kind === 'subcategory' ? ['', ...subOptions] : setDlg.options || []).map((o) => (
                <MenuItem key={o} value={o}>{o || '(none)'}</MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField autoFocus fullWidth size="small" value={setVal} onChange={(e) => setSetVal(e.target.value)} sx={{ mt: 1 }} label={setDlg?.label} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSetDlg(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              const f = setDlg!;
              setSetDlg(null);
              go(() => prepStepsApi.edit(orderId, step, targetIds.map((id) => ({ line: id, field: f.field, new: setVal }))), `${f.label} set`);
            }}
          >
            Set
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={shareDlg} onClose={() => setShareDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Price {target.length.toLocaleString()} lines at a % of retail</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth size="small" value={shareVal} onChange={(e) => setShareVal(e.target.value.replace(/[^\d]/g, ''))} sx={{ mt: 1 }} label="% of retail" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareDlg(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => { setShareDlg(false); go(() => prepStepsApi.rule(orderId, 'price_share', targetIds, { share: Number(shareVal) / 100 }), `Priced at ${shareVal}%`); }}>
            Price
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={custom} onClose={() => setCustom(false)} maxWidth="md" fullWidth>
        <DialogTitle>Custom prompt on {target.length.toLocaleString()} lines</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField
            autoFocus multiline minRows={4} fullWidth value={prompt} onChange={(e) => setPrompt(e.target.value)} sx={{ mt: 1 }}
            placeholder="e.g. These are Christmas lights sold by the box: put the bulb count in the title, sell by unit"
          />
          <Box>
            <Box sx={{ fontSize: 13, fontWeight: 700, mb: 0.5 }}>The AI may change</Box>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {CUSTOM_FIELDS.map((f) => {
                const on = fields.includes(f.field);
                return (
                  <Chip key={f.field} size="small" label={f.label} color={on ? 'primary' : 'default'} variant={on ? 'filled' : 'outlined'}
                    onClick={() => setFields(on ? fields.filter((x) => x !== f.field) : [...fields, f.field])} />
                );
              })}
            </Box>
          </Box>
          <ToggleButtonGroup exclusive size="small" value={strength} onChange={(_e, v) => v && setStrength(v)}>
            <ToggleButton value="fast">Fast: {est('custom_fast') || 'Spark Contributor'}</ToggleButton>
            <ToggleButton value="strong">Strong: {est('custom_strong') || 'Sonnet 5.5'}</ToggleButton>
          </ToggleButtonGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCustom(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!prompt.trim() || fields.length === 0}
            onClick={() => { setCustom(false); runAi('custom', { prompt, fields, strength }); }}
          >
            Preview changes
          </Button>
        </DialogActions>
      </Dialog>

      <LineDetail orderId={orderId} lineId={openLine} onClose={() => setOpenLine(null)} />

      <Menu anchorEl={colMenu?.el} open={!!colMenu} onClose={() => setColMenu(null)}>
        <ListSubheader sx={{ lineHeight: '28px' }}>{colMenu?.field} comes from (loads the manifest again)</ListSubheader>
        {['', ...(run.load_info.headers || [])].map((h) => (
          <MenuItem
            key={h || '(none)'}
            dense
            selected={(run.load_info.columns?.[colMenu?.field || ''] || '') === h}
            onClick={() => {
              const field = colMenu!.field;
              setColMenu(null);
              go(() => prepStepsApi.start(orderId, { ...(run.load_info.columns || {}), [field]: h }), `${field} now from ${h || 'nothing'}`)
                .then((s) => s && qc.invalidateQueries({ queryKey: ['prepSteps', 'lines', orderId] }));
            }}
          >
            {h || '(none)'}
          </MenuItem>
        ))}
      </Menu>

      {previewOpen && watched && (
        <PreviewDialog
          action={watched}
          busy={busy}
          onClose={() => setPreviewOpen(false)}
          onDiscard={() => { setPreviewOpen(false); go(() => prepStepsApi.discard(watched.id), 'Discarded'); }}
          onApply={(skip) => {
            setPreviewOpen(false);
            go(() => prepStepsApi.apply(watched.id, skip), 'Applied').then(() => qc.invalidateQueries({ queryKey: ['prepSteps', 'action', watched.id] }));
          }}
        />
      )}
    </Box>
  );
}
