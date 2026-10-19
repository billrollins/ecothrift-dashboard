/**
 * Thrift+ → Families (thrift_plus_families Phase 1, owner 2026-10-13): every pricing family on the floor, worked as a
 * queue in order of money at stake. Since 2026-10-16 every new family is approved by default at the suggested target
 * (clear the floor in 90 days), so nothing sits frozen; the page opens on **To review** (approved by default, not yet
 * reviewed), and the owner's save stamps a family as his. A family still to decide holds its ThriftBucks:
 * - **Approve** with a sell target (units per 90 days; suggested: clear the floor in 90 days): its units then share one
 *   ThriftBucks %, rising 0.25% of the tag a night while it sells slower than the target;
 * - **Not a family**: each unit grows on its own again; **Exit**: it holds, for the exit list.
 * Each card: units, prices, retail and cost, age, sales (90 and 180 days), the conservative estimate ((sold + 1) ÷
 * days), today's ThriftBucks % and flags (huge lot, volume, cost, junk, fast seller). In bulk: approve what's shown at
 * its suggestion (never a lot of 50+), and "Mark the rest not a family" so everything is decided by launch.
 * Keyboard on a card: A approve, N not a family, X exit. Managers can look; only the owner decides.
 */
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { bulkApproveFamilies, decideFamily, fetchFamilies, findFamilies, markRestNotFamily } from '../../api/thriftplus.api';
import { useAuth } from '../../hooks/useAuth';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { FamilyRow, FamilyView } from '../../types/thriftplus.types';
import { formatCurrency, formatNumber } from '../../utils/format';

const STATUSES: { key: FamilyView; label: string }[] = [
  { key: 'review', label: 'To review' },
  { key: 'possible', label: 'To decide' },
  { key: 'approved', label: 'Families' },
  { key: 'not_family', label: 'Not a family' },
  { key: 'exit', label: 'Exit' },
];
const BANDS = ['', '2-3', '4-9', '10-49', '50+'];
const FLAGS: { key: string; label: string }[] = [
  { key: '', label: 'Any flag' },
  { key: 'huge', label: 'Huge lot (50+)' },
  { key: 'volume', label: "Won't sell in 90 days" },
  { key: 'cost', label: 'Bought to sell near the tag' },
  { key: 'junk', label: 'Junk volume' },
  { key: 'fast', label: 'Fast seller' },
];
const FLAG_COLOR: Record<string, 'error' | 'warning' | 'info' | 'success' | 'default'> = {
  huge: 'error', volume: 'warning', cost: 'info', junk: 'warning', fast: 'success',
};
const plain = { textTransform: 'none' as const };
const PAGE = 50;

export default function FamiliesTab() {
  const { user } = useAuth();
  const owner = Boolean(user?.is_superuser);
  const qc = useQueryClient();
  const [status, setStatus] = useState<FamilyView>('review');
  const [band, setBand] = useState('');
  const [flag, setFlag] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [confirmRest, setConfirmRest] = useState(false);
  const [notice, setNotice] = useState('');
  const q = useDebouncedValue(search, 300);
  const params = { status, band, flag, q, offset };
  const list = useQuery({ queryKey: ['thriftplus', 'families', params], queryFn: () => fetchFamilies(params), placeholderData: keepPreviousData });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['thriftplus', 'families'] });
  const errorOf = (e: unknown) => (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Could not save.';

  const decide = useMutation({
    mutationFn: ({ id, action, target }: { id: number; action: 'approve' | 'not_family' | 'exit' | 'reopen'; target?: number }) =>
      decideFamily(id, action, target),
    onSuccess: refresh,
    onError: (e) => setNotice(errorOf(e)),
  });
  const bulk = useMutation({
    mutationFn: (ids: number[]) => bulkApproveFamilies(ids),
    onSuccess: (r) => {
      setNotice(`Approved ${formatNumber(r.approved)} at their suggested target${r.skipped ? `; ${formatNumber(r.skipped)} left for you (huge lots or already decided)` : ''}.`);
      refresh();
    },
  });
  const rest = useMutation({
    mutationFn: () => markRestNotFamily(),
    onSuccess: (r) => {
      setConfirmRest(false);
      setNotice(`${formatNumber(r.marked)} marked not a family: they grow on their own.`);
      refresh();
    },
  });
  const find = useMutation({
    mutationFn: () => findFamilies(),
    onSuccess: (r) => {
      setNotice(r.new ? `Found ${formatNumber(r.new)} new families; ${formatNumber(r.approved)} approved by default, to review.` : 'No new families on the floor.');
      refresh();
    },
  });

  const data = list.data;
  const pct = data && data.total ? Math.round((100 * data.reviewed) / data.total) : 0;
  const rows = data?.rows ?? [];
  const bulkIds = rows.filter((r) => !r.huge).map((r) => r.id);

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="baseline" spacing={1} flexWrap="wrap" useFlexGap>
          <Typography sx={{ fontWeight: 800, fontSize: 18 }}>
            {data ? `${formatNumber(data.reviewed)} of ${formatNumber(data.total)} families reviewed` : 'Families'}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
            Every family is approved by default to clear its floor count in 90 days, so its ThriftBucks rise slowly while it
            sells behind that. Review the big lots first: Save makes the target yours.
          </Typography>
        </Stack>
        <LinearProgress variant="determinate" value={pct} sx={{ my: 1.25, height: 8, borderRadius: 4 }} />
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {STATUSES.map((s) => (
            <Chip
              key={s.key}
              clickable
              color={status === s.key ? 'primary' : 'default'}
              variant={status === s.key ? 'filled' : 'outlined'}
              onClick={() => {
                setStatus(s.key);
                setOffset(0);
              }}
              label={`${s.label}: ${formatNumber(data?.counts[s.key] ?? 0)} (${formatNumber(data?.units[s.key] ?? 0)} units)`}
              data-testid={`status-${s.key}`}
            />
          ))}
        </Stack>
      </Paper>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }} alignItems={{ md: 'center' }} flexWrap="wrap" useFlexGap>
        <ToggleButtonGroup size="small" exclusive value={band} onChange={(_e, v) => { setBand(v ?? ''); setOffset(0); }}>
          {BANDS.map((b) => (
            <ToggleButton key={b || 'all'} value={b} sx={plain}>{b ? `${b} units` : 'All sizes'}</ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField select size="small" label="Flag" value={flag} onChange={(e) => { setFlag(e.target.value); setOffset(0); }} sx={{ minWidth: 220 }}>
          {FLAGS.map((f) => <MenuItem key={f.key || 'any'} value={f.key}>{f.label}</MenuItem>)}
        </TextField>
        <TextField size="small" label="Search" value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} sx={{ minWidth: 220 }} />
        <Box sx={{ flex: 1 }} />
        {owner && (
          <>
            <Button size="small" variant="outlined" sx={plain} disabled={find.isPending} onClick={() => find.mutate()}>Find new families</Button>
            {status === 'possible' && (
              <>
                <Button size="small" variant="contained" sx={plain} disabled={!bulkIds.length || bulk.isPending}
                  onClick={() => bulk.mutate(bulkIds)} data-testid="bulk-approve">
                  Approve these {formatNumber(bulkIds.length)} at their suggestion
                </Button>
                <Button size="small" color="warning" variant="outlined" sx={plain} disabled={!data?.counts.possible}
                  onClick={() => setConfirmRest(true)} data-testid="rest-not-family">
                  Mark the rest not a family
                </Button>
              </>
            )}
          </>
        )}
      </Stack>
      {status === 'possible' && owner && rows.length > bulkIds.length ? (
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: -1, mb: 1.5 }}>
          Lots of 50+ units aren&apos;t approved in bulk: decide those one by one.
        </Typography>
      ) : null}
      {notice ? <Alert severity="info" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert> : null}
      {list.isFetching ? <LinearProgress sx={{ mb: 1 }} /> : null}

      <Stack spacing={1.25}>
        {rows.map((r) => (
          <FamilyCard key={r.id} row={r} owner={owner} busy={decide.isPending}
            onDecide={(action, target) => decide.mutate({ id: r.id, action, target })} />
        ))}
        {data && rows.length === 0 ? <Typography sx={{ color: 'text.secondary', py: 3, textAlign: 'center' }}>Nothing here.</Typography> : null}
      </Stack>
      {data && data.matching > PAGE ? (
        <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" sx={{ mt: 2 }}>
          <Button size="small" sx={plain} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
          <Typography sx={{ fontSize: 13 }}>{offset + 1} to {Math.min(offset + PAGE, data.matching)} of {formatNumber(data.matching)}</Typography>
          <Button size="small" sx={plain} disabled={offset + PAGE >= data.matching} onClick={() => setOffset(offset + PAGE)}>Next</Button>
        </Stack>
      ) : null}

      <Dialog open={confirmRest} onClose={() => setConfirmRest(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Mark the rest not a family?</DialogTitle>
        <DialogContent>
          <Typography>
            {formatNumber(data?.counts.possible ?? 0)} families still to decide ({formatNumber(data?.units.possible ?? 0)} units) become
            &quot;not a family&quot;: each unit grows its ThriftBucks on its own again, from tonight. You can reopen any of them later.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button sx={plain} onClick={() => setConfirmRest(false)}>Cancel</Button>
          <Button sx={plain} variant="contained" color="warning" disabled={rest.isPending} onClick={() => rest.mutate()}>Mark them</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 92 }}>
      <Typography sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</Typography>
      <Typography sx={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  );
}

function FamilyCard({ row, owner, busy, onDecide }: {
  row: FamilyRow;
  owner: boolean;
  busy: boolean;
  onDecide: (action: 'approve' | 'not_family' | 'exit' | 'reopen', target?: number) => void;
}) {
  const [target, setTarget] = useState(String(row.target_per_90 ?? row.suggested_target));
  const n = Number.parseInt(target, 10);
  const okTarget = Number.isFinite(n) && n >= 1;
  const price = row.price_min === row.price_max ? formatCurrency(row.price_min) : `${formatCurrency(row.price_min)} to ${formatCurrency(row.price_max)}`;
  const toDecide = row.status === 'possible';
  const approved = row.status === 'approved';
  const open = toDecide || approved;
  return (
    <Paper
      variant="outlined"
      tabIndex={owner && open ? 0 : -1}
      data-testid="family-card"
      onKeyDown={(e) => {
        if (!owner || !open || e.target instanceof HTMLInputElement) return;
        const k = e.key.toLowerCase();
        if (k === 'a' && okTarget) onDecide('approve', n);
        if (k === 'n') onDecide('not_family');
        if (k === 'x') onDecide('exit');
      }}
      sx={{ p: 1.75, borderLeft: 4, borderLeftColor: row.huge ? 'error.main' : 'divider', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography sx={{ fontWeight: 800, fontSize: 16 }}>{row.name}</Typography>
            <Chip size="small" label={row.kind === 'identical' ? 'Same product' : `${row.products} similar products`} />
            {row.auto ? <Chip size="small" color="warning" variant="outlined" label="Approved by default" /> : null}
            {row.category ? <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{row.category}</Typography> : null}
          </Stack>
          <Stack direction="row" spacing={2.5} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
            <Fact label="On the floor" value={`${formatNumber(row.units)} units`} />
            <Fact label="Tag" value={price} />
            <Fact label="At stake" value={formatCurrency(row.tag_total)} />
            <Fact label="Retail" value={row.retail_avg ? formatCurrency(row.retail_avg) : '-'} />
            <Fact label="Cost" value={row.cost_avg ? formatCurrency(row.cost_avg) : '-'} />
            <Fact label="Age" value={row.age_newest && row.age_newest !== row.age_oldest ? `${row.age_newest} to ${row.age_oldest} days` : `${row.age_oldest} days`} />
            <Fact label="Sold 90 / 180 d" value={`${row.sold_90} / ${row.sold_180}`} />
            <Fact label="Est. per 90 days" value={row.est_per_90} />
            <Fact label="ThriftBucks now" value={`${row.pct_now}%`} />
          </Stack>
          {row.flags.length ? (
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              {row.flags.map((f) => (
                <Stack key={f.key} direction="row" spacing={1} alignItems="center">
                  <Chip size="small" color={FLAG_COLOR[f.key] ?? 'default'} label={FLAGS.find((x) => x.key === f.key)?.label ?? f.key} />
                  <Typography sx={{ fontSize: 13 }}>{f.text}</Typography>
                </Stack>
              ))}
            </Stack>
          ) : null}
          {!toDecide ? (
            <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 1 }}>
              {row.status === 'approved' ? `Target ${row.target_per_90} per 90 days; ThriftBucks ${Number(row.pct ?? 0).toFixed(2)}% of the tag. ` : ''}
              {row.decided_by ? `Decided by ${row.decided_by}` : row.auto ? 'Approved by default' : ''}
              {row.decided_at ? ` on ${new Date(row.decided_at).toLocaleDateString()}` : ''}
              {row.note && !row.auto ? ` · ${row.note}` : ''}
            </Typography>
          ) : null}
        </Box>
        {owner ? (
          <Stack spacing={1} sx={{ width: { md: 250 }, flexShrink: 0 }}>
            {open ? (
              <>
                <Stack direction="row" spacing={1}>
                  <TextField size="small" type="number" label="Target per 90 days" value={target} onChange={(e) => setTarget(e.target.value)}
                    helperText={`Suggested ${row.suggested_target}`} inputProps={{ min: 1 }} sx={{ flex: 1 }} />
                  <Button variant="contained" sx={plain} disabled={busy || !okTarget} onClick={() => onDecide('approve', n)} data-testid="family-approve">
                    {approved ? 'Save' : 'Approve'}
                  </Button>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button fullWidth variant="outlined" sx={plain} disabled={busy} onClick={() => onDecide('not_family')} data-testid="family-not">
                    Not a family
                  </Button>
                  <Button fullWidth variant="outlined" color="warning" sx={plain} disabled={busy} onClick={() => onDecide('exit')}>
                    Exit
                  </Button>
                </Stack>
              </>
            ) : (
              <Button variant="outlined" sx={plain} disabled={busy} onClick={() => onDecide('reopen')}>Reopen</Button>
            )}
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}
