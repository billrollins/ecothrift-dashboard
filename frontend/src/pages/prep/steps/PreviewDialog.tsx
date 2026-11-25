// An AI job's preview: every change it would make (old, new, why), each can be left out; then Apply or Discard.
import { useMemo, useState } from 'react';
import { Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, TextField } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { PrepActionDetail } from '../../../api/prepSteps.api';
import { cost, modelName, money, secs, tone } from './tokens';

const show = (field: string, v: unknown) => {
  if (v === null || v === undefined || v === '') return '';
  if ((field === 'retail' || field === 'price') && typeof v === 'number') return money(v);
  if (Array.isArray(v)) return v.join(' | ');
  return String(v);
};

interface Props {
  action: PrepActionDetail | null;
  onClose: () => void;
  onApply: (skip: number[]) => void;
  onDiscard: () => void;
  busy: boolean;
}

export default function PreviewDialog({ action, onClose, onApply, onDiscard, busy }: Props) {
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [q, setQ] = useState('');
  // A callback ref: the dialog mounts its content after the first render, so the list re-measures once it exists.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const applied = !!action && action.status !== 'preview' && action.status !== 'running';
  const rows = useMemo(() => {
    const all = action?.preview?.length
      ? action.preview
      : (action?.changes || []).map((c, i) => ({ ...c, i, title: (c as { title?: string }).title || '' }));
    const t = q.trim().toLowerCase();
    return t ? all.filter((c) => `${c.row_number} ${c.title} ${c.field} ${show(c.field, c.new)} ${c.reason}`.toLowerCase().includes(t)) : all;
  }, [action, q]);
  const rv = useVirtualizer({ count: rows.length, getScrollElement: () => scrollEl, estimateSize: () => 32, overscan: 10 });
  if (!action) return null;
  const running = action.status === 'running';
  const lines = new Set((action.preview || []).filter((c) => !skip.has(c.i)).map((c) => c.line)).size;
  const grid = '36px 64px minmax(220px, 1.3fr) 120px minmax(160px, 1fr) minmax(160px, 1fr) minmax(200px, 1.2fr)';
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xl" slotProps={{ paper: { sx: { height: '86vh' } } }}>
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
          <Box component="span" sx={{ fontWeight: 800 }}>{action.label}</Box>
          <Box component="span" sx={{ fontSize: 14, color: tone.inkSoft }}>
            {modelName(action.model)}{action.effort ? ` (${action.effort})` : ''} · {action.line_count} lines in · {action.calls} calls ·{' '}
            {secs(action.seconds)} · {cost(action.cost)} · {action.input_tokens.toLocaleString()} in / {action.output_tokens.toLocaleString()} out tokens
          </Box>
        </Box>
        {action.prompt && <Box sx={{ fontSize: 13, color: tone.inkSoft, mt: 0.5 }}>Prompt: {action.prompt}</Box>}
        {action.error && <Box sx={{ fontSize: 13, color: tone.bad, mt: 0.5 }}>Some batches failed: {action.error}</Box>}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0 }}>
        <Box sx={{ height: 4 }}>{running && <LinearProgress variant="determinate" value={action.batches_total ? (100 * action.batches_done) / action.batches_total : 0} />}</Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField size="small" placeholder="Search the changes" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: 320 }} />
          <Box sx={{ fontSize: 13, color: tone.inkSoft }}>
            {applied
              ? `${rows.length} changes, ${action.status}`
              : `${(action.preview || []).length - skip.size} of ${(action.preview || []).length} changes on ${lines} lines will apply`}
          </Box>
          <Box sx={{ flex: 1 }} />
          <Button size="small" onClick={() => setSkip(new Set())}>Keep all</Button>
          <Button size="small" onClick={() => setSkip(new Set(rows.map((c) => c.i)))}>Leave out shown</Button>
        </Box>
        <Box ref={setScrollEl} sx={{ flex: 1, overflow: 'auto', border: `1px solid ${tone.line}`, borderRadius: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: grid, position: 'sticky', top: 0, zIndex: 1, bgcolor: tone.head, fontSize: 12, fontWeight: 700, height: 32, alignItems: 'center', borderBottom: `1px solid ${tone.line}` }}>
            <span />
            <Box sx={{ px: 0.75, textAlign: 'right' }}>#</Box>
            <Box sx={{ px: 0.75 }}>Line</Box>
            <Box sx={{ px: 0.75 }}>Field</Box>
            <Box sx={{ px: 0.75, color: tone.inkSoft }}>Now</Box>
            <Box sx={{ px: 0.75, color: tone.after }}>{applied ? 'Set to' : 'AI says'}</Box>
            <Box sx={{ px: 0.75 }}>Why</Box>
          </Box>
          <Box sx={{ height: rv.getTotalSize(), position: 'relative' }}>
            {rv.getVirtualItems().map((vi) => {
              const c = rows[vi.index];
              const off = skip.has(c.i);
              return (
                <Box
                  key={c.i}
                  sx={{
                    display: 'grid', gridTemplateColumns: grid, position: 'absolute', top: 0, left: 0, right: 0, height: 32,
                    transform: `translateY(${vi.start}px)`, alignItems: 'center', fontSize: 13, borderBottom: `1px solid ${tone.lineSoft}`,
                    opacity: off ? 0.45 : 1, '& > *': { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', px: 0.75 },
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={!off}
                    onChange={() => {
                      const n = new Set(skip);
                      if (off) n.delete(c.i);
                      else n.add(c.i);
                      setSkip(n);
                    }}
                    sx={{ p: 0.25 }}
                    slotProps={{ input: { 'aria-label': `Keep ${c.field} on line ${c.row_number}` } }}
                  />
                  <Box sx={{ textAlign: 'right', color: tone.inkSoft }}>{c.row_number}</Box>
                  <Box title={c.title}>{c.title}</Box>
                  <Box>{c.field}</Box>
                  <Box sx={{ color: tone.inkSoft, textDecoration: off ? 'none' : 'line-through' }} title={show(c.field, c.old)}>{show(c.field, c.old)}</Box>
                  <Box sx={{ color: tone.after, fontWeight: 600 }} title={show(c.field, c.new)}>{show(c.field, c.new)}</Box>
                  <Box sx={{ color: tone.inkSoft }} title={c.reason}>{c.reason}</Box>
                </Box>
              );
            })}
          </Box>
          {!running && rows.length === 0 && <Box sx={{ p: 4, textAlign: 'center', color: tone.inkSoft }}>The AI would change nothing.</Box>}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
        {!applied && <Button color="error" onClick={onDiscard} disabled={busy || running}>Discard</Button>}
        {!applied && <Button variant="contained" onClick={() => onApply(Array.from(skip))} disabled={busy || running || action.status !== 'preview' || lines === 0}>
          Apply to {lines} lines
        </Button>}
      </DialogActions>
    </Dialog>
  );
}
