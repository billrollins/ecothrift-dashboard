// Prep Truck (Truck Prep A: Steps, Dash #225). /prep/steps lists trucks; /prep/steps/:orderId preps one.
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { Box, Button, CircularProgress, TextField } from '@mui/material';
import { prepStepsApi, type PrepOrderRow } from '../../api/prepSteps.api';
import RunView from './steps/RunView';
import { STEP_INFO } from './steps/stepTools';
import { cost, money, secs, tone } from './steps/tokens';

function Picker() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['prepSteps', 'orders', q], queryFn: () => prepStepsApi.orders(q), staleTime: 10_000 });
  const rows: PrepOrderRow[] = data?.orders || [];
  const grid = '90px 170px 120px minmax(260px, 1fr) 80px 110px 100px 170px';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ fontSize: 22, fontWeight: 800 }}>Prep Truck</Box>
        <TextField size="small" placeholder="Search trucks" value={q} onChange={(e) => setQ(e.target.value)} sx={{ width: 280 }} />
      </Box>
      <Box sx={{ border: `1px solid ${tone.line}`, borderRadius: 1, bgcolor: '#fff' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: grid, fontSize: 12, fontWeight: 700, bgcolor: tone.head, height: 34, alignItems: 'center', '& > *': { px: 1 } }}>
          <span>Order</span><span>Number</span><span>Vendor</span><span>Truck</span>
          <Box sx={{ textAlign: 'right' }}>Lines</Box><Box sx={{ textAlign: 'right' }}>Retail</Box><Box sx={{ textAlign: 'right' }}>Cost</Box><span>Prep</span>
        </Box>
        {isLoading && <Box sx={{ p: 3 }}><CircularProgress size={20} /></Box>}
        {rows.map((o) => (
          <Box
            key={o.id}
            role="link"
            onClick={() => navigate(`/prep/steps/${o.id}`)}
            sx={{
              display: 'grid', gridTemplateColumns: grid, fontSize: 13, height: 36, alignItems: 'center', cursor: 'pointer',
              borderTop: `1px solid ${tone.lineSoft}`, '&:hover': { bgcolor: tone.hover },
              '& > *': { px: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
            }}
          >
            <span>{o.id}</span><span>{o.order_number}</span><span>{o.vendor}</span><span title={o.description}>{o.description}</span>
            <Box sx={{ textAlign: 'right' }}>{o.lines.toLocaleString()}</Box>
            <Box sx={{ textAlign: 'right' }}>{money(o.retail, false)}</Box>
            <Box sx={{ textAlign: 'right' }}>{money(o.cost, false)}</Box>
            <Box sx={{ color: o.prep ? tone.good : tone.inkFaint, fontWeight: o.prep ? 700 : 400 }}>
              {o.prep ? `At ${STEP_INFO[o.prep.step].title}` : 'Not started'}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function Truck({ orderId }: { orderId: number }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [starting, setStarting] = useState(false);
  const runQ = useQuery({ queryKey: ['prepSteps', 'run', orderId], queryFn: () => prepStepsApi.run(orderId), staleTime: 5_000 });
  const run = runQ.data?.run || null;
  const linesQ = useQuery({
    queryKey: ['prepSteps', 'lines', orderId],
    queryFn: () => prepStepsApi.lines(orderId),
    enabled: !!run,
    staleTime: 60_000,
  });
  const head = run || runQ.data?.order;
  const start = async () => {
    setStarting(true);
    try {
      const s = await prepStepsApi.start(orderId);
      qc.setQueryData(['prepSteps', 'run', orderId], { run: s.run });
      qc.setQueryData(['prepSteps', 'lines', orderId], { lines: s.lines || [] });
    } catch (e) {
      enqueueSnackbar((e as Error).message, { variant: 'error' });
    } finally {
      setStarting(false);
    }
  };
  const t = run?.totals;
  const tagShare = t && t.manifest_retail ? t.tag / t.manifest_retail : 0;
  const stats = useMemo(() => (t ? [
    ['Lines', t.lines.toLocaleString()],
    ['Units', t.units.toLocaleString()],
    ['Tags', t.pieces.toLocaleString()],
    ['Manifest retail', money(t.manifest_retail, false)],
    ['Tag total', `${money(t.tag, false)} (${Math.round(tagShare * 100)}%)`],
    ['Truck cost', money(t.cost, false)],
    ['AI spend', cost(t.ai_cost)],
    ['Time run', secs(t.seconds)],
  ] : []), [t, tagShare]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 44 }}>
        <Button size="small" onClick={() => navigate('/prep/steps')}>Trucks</Button>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {head ? `${head.vendor} · ${head.order_number}` : 'Truck'}
          </Box>
          <Box sx={{ fontSize: 12.5, color: tone.inkSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 520 }}>{head?.description}</Box>
        </Box>
        <Box sx={{ flex: 1 }} />
        {stats.map(([k, v]) => (
          <Box key={k} sx={{ textAlign: 'right' }}>
            <Box sx={{ fontSize: 11, color: tone.inkSoft, textTransform: 'uppercase', letterSpacing: 0.4 }}>{k}</Box>
            <Box sx={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{v}</Box>
          </Box>
        ))}
        {run && (
          <Button size="small" color="inherit" disabled={starting} onClick={() => { if (window.confirm('Load the manifest again? Every step starts over.')) start(); }}>
            Load again
          </Button>
        )}
      </Box>
      {runQ.isLoading && <CircularProgress size={22} />}
      {!runQ.isLoading && !run && (
        <Box sx={{ border: `1px solid ${tone.line}`, borderRadius: 1, bgcolor: '#fff', p: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{ fontSize: 16 }}>Not prepped yet.</Box>
          <Button variant="contained" onClick={start} disabled={starting} data-testid="start-prep">
            {starting ? 'Loading...' : 'Step 1: load the manifest'}
          </Button>
        </Box>
      )}
      {run && linesQ.data && <RunView run={run} lines={linesQ.data.lines} />}
      {run && !linesQ.data && <CircularProgress size={22} />}
    </Box>
  );
}

export default function PrepStepsPage() {
  const { orderId } = useParams<{ orderId?: string }>();
  const id = orderId && /^\d+$/.test(orderId) ? Number(orderId) : null;
  return <Box sx={{ minWidth: 0 }}>{id ? <Truck orderId={id} /> : <Picker />}</Box>;
}
