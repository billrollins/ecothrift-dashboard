// One line, input to output: the manifest row as uploaded, every field now (who set it and why), its candidates,
// and every change made to it.
import { useQuery } from '@tanstack/react-query';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Link } from '@mui/material';
import { prepStepsApi } from '../../../api/prepSteps.api';
import { KindChip } from './columns';
import { modelName, money, tone } from './tokens';

const FIELDS: [string, string][] = [
  ['title', 'Title'], ['brand', 'Brand'], ['model', 'Model'], ['qty', 'Qty'], ['match_kind', 'Match'], ['category', 'Category'],
  ['subcategory', 'Subcategory'], ['retail', 'Retail / tag'], ['price', 'Price / tag'], ['price_class', 'Class'],
  ['pack_units', 'Units in pack'], ['unit_count', 'Count per unit'], ['unit_name', 'Unit'], ['sell_as', 'Sell as'],
  ['pieces', 'Tags per unit'], ['search_tags', 'Search words'],
];

const show = (v: unknown, f = '') => {
  if (v === null || v === undefined || v === '') return '';
  if ((f === 'retail' || f === 'price') && typeof v === 'number') return money(v);
  if (Array.isArray(v)) return v.join(' | ');
  return String(v);
};

const who = (s: string) => (!s ? '' : s === 'staff' ? 'You' : s === 'manifest' ? 'Manifest' : s.startsWith('ai:') ? `AI (${modelName(s.slice(3))})` : `Rule: ${s.slice(5)}`);

export default function LineDetail({ orderId, lineId, onClose }: { orderId: number; lineId: number | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['prepSteps', 'line', orderId, lineId],
    queryFn: () => prepStepsApi.line(orderId, lineId!),
    enabled: lineId !== null,
  });
  const l = data?.line;
  const cell = { px: 1, py: 0.5, fontSize: 13, borderBottom: `1px solid ${tone.lineSoft}`, verticalAlign: 'top' } as const;
  return (
    <Dialog open={lineId !== null} onClose={onClose} fullWidth maxWidth="xl" slotProps={{ paper: { sx: { height: '88vh' } } }}>
      <DialogTitle sx={{ pb: 1 }}>
        {l ? <>Line {l.row_number}: {l.title}</> : 'Line'}
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(420px, 1.4fr) minmax(320px, 1fr)', gap: 2, minHeight: 0 }}>
        {isLoading && <CircularProgress size={22} />}
        {l && (
          <>
            <Box sx={{ overflow: 'auto' }}>
              <Box sx={{ fontWeight: 800, mb: 1 }}>Manifest (as uploaded)</Box>
              <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%' }}>
                <tbody>
                  {Object.entries(l.raw || {}).map(([k, v]) => (
                    <tr key={k}>
                      <Box component="td" sx={{ ...cell, color: tone.inkSoft, whiteSpace: 'nowrap' }}>{k}</Box>
                      <Box component="td" sx={{ ...cell, wordBreak: 'break-word' }}>{String(v)}</Box>
                    </tr>
                  ))}
                </tbody>
              </Box>
              {l.image_url && (
                <Box sx={{ mt: 1.5 }}>
                  <Box component="img" src={l.image_url} alt="" sx={{ maxWidth: '100%', maxHeight: 260, borderRadius: 1, border: `1px solid ${tone.line}` }} />
                </Box>
              )}
              {l.page_url && <Link href={l.page_url} target="_blank" rel="noreferrer" sx={{ fontSize: 13 }}>Seller page</Link>}
            </Box>
            <Box sx={{ overflow: 'auto' }}>
              <Box sx={{ fontWeight: 800, mb: 1 }}>Now</Box>
              <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    {['Field', 'Value', 'Set by', 'Why'].map((h) => (
                      <Box component="th" key={h} sx={{ ...cell, textAlign: 'left', fontSize: 12, color: tone.inkSoft }}>{h}</Box>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map(([f, label]) => (
                    <tr key={f}>
                      <Box component="td" sx={{ ...cell, color: tone.inkSoft, whiteSpace: 'nowrap' }}>{label}</Box>
                      <Box component="td" sx={{ ...cell, fontWeight: 600 }}>
                        {f === 'match_kind' ? <KindChip kind={l.match_kind} conf={l.match_confidence} /> : show((l as unknown as Record<string, unknown>)[f], f)}
                      </Box>
                      <Box component="td" sx={{ ...cell, whiteSpace: 'nowrap', color: tone.inkSoft }}>{who(l.sources?.[f] || '')}</Box>
                      <Box component="td" sx={cell}>{l.reasons?.[f] || ''}</Box>
                    </tr>
                  ))}
                </tbody>
              </Box>
              <Box sx={{ fontWeight: 800, mt: 2, mb: 1 }}>Product candidates</Box>
              {(l.match_candidates || []).length === 0 && <Box sx={{ fontSize: 13, color: tone.inkFaint }}>None found</Box>}
              {(l.match_candidates || []).map((c) => (
                <Box key={c.product_id} sx={{ fontSize: 13, py: 0.5, borderBottom: `1px solid ${tone.lineSoft}`, display: 'flex', gap: 1 }}>
                  <Box sx={{ width: 90, color: tone.inkSoft }}>{c.number}</Box>
                  <Box sx={{ flex: 1, fontWeight: c.product_id === l.match_product_id ? 800 : 400 }}>{c.brand} {c.title}</Box>
                  <Box sx={{ width: 80, textAlign: 'right' }}>{Math.round(c.sim * 100)}{c.id ? ` ${c.id}` : ''}</Box>
                  <Box sx={{ width: 160, textAlign: 'right', color: tone.inkSoft }}>
                    {c.retail_avg ? `retail ${money(c.retail_avg)}` : ''}{c.sold ? ` · sold ${c.sold}` : ''}
                  </Box>
                </Box>
              ))}
            </Box>
            <Box sx={{ overflow: 'auto' }}>
              <Box sx={{ fontWeight: 800, mb: 1 }}>Changes</Box>
              {(data?.history || []).map((h, i) => (
                <Box key={i} sx={{ fontSize: 12.5, py: 0.75, borderBottom: `1px solid ${tone.lineSoft}`, opacity: h.status === 'undone' ? 0.5 : 1 }}>
                  <Box sx={{ color: tone.inkSoft }}>
                    {h.step} · {h.model ? modelName(h.model) : h.kind === 'edit' ? 'You' : 'Code'} · {h.label}{h.status === 'undone' ? ' (undone)' : ''}
                  </Box>
                  <Box>
                    <b>{h.field}</b>: <Box component="span" sx={{ textDecoration: 'line-through', color: tone.inkSoft }}>{show(h.old, h.field)}</Box>{' '}
                    {'→'} <Box component="span" sx={{ color: tone.after, fontWeight: 700 }}>{show(h.new, h.field)}</Box>
                  </Box>
                  {h.reason && <Box sx={{ color: tone.inkSoft }}>{h.reason}</Box>}
                </Box>
              ))}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
