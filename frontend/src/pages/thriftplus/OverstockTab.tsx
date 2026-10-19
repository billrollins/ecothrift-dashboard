/**
 * Thrift+ → Overstock (rulebook P6, owner 2026-10-19): every product with 10+ units on the floor and more than a year
 * of supply at its current sales (floor units ÷ sales a day, as if one more sold now). ThriftBucks already grow on these
 * by the supply rule; this list is for what a discount can't fix. The owner looks weekly and marks one action per lot
 * (back stock, bundle, dollar bin, liquidate, donate, keep), stamped; staff do the physical work. Not yet marked first,
 * then the biggest tag dollars. Managers can look; only the owner marks.
 */
import { Alert, Box, Button, Chip, LinearProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchOverstock, markOverstock } from '../../api/thriftplus.api';
import { useAuth } from '../../hooks/useAuth';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { OverstockAction, OverstockRow, OverstockShow } from '../../types/thriftplus.types';
import { formatCurrency, formatNumber } from '../../utils/format';

const ACTIONS: { key: OverstockAction; label: string }[] = [
  { key: 'back_stock', label: 'Back stock' },
  { key: 'bundle', label: 'Bundle' },
  { key: 'dollar_bin', label: 'Dollar bin' },
  { key: 'liquidate', label: 'Liquidate' },
  { key: 'donate', label: 'Donate' },
  { key: 'keep', label: 'Keep' },
];
const VIEWS: { key: OverstockShow; label: string }[] = [{ key: 'undecided', label: 'To mark' }, { key: 'all', label: 'All' }, ...ACTIONS];
const plain = { textTransform: 'none' as const };
const PAGE = 50;

function supplyText(days: number): string {
  return days >= 730 ? `${formatNumber(days)} days (${(days / 365).toFixed(1)} years)` : `${formatNumber(days)} days`;
}

export default function OverstockTab() {
  const { user } = useAuth();
  const owner = Boolean(user?.is_superuser);
  const qc = useQueryClient();
  const [show, setShow] = useState<OverstockShow>('undecided');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [notice, setNotice] = useState('');
  const q = useDebouncedValue(search, 300);
  const params = { show, q, offset };
  const list = useQuery({ queryKey: ['thriftplus', 'overstock', params], queryFn: () => fetchOverstock(params), placeholderData: keepPreviousData });
  const mark = useMutation({
    mutationFn: ({ id, action, note }: { id: number; action: OverstockAction | 'clear'; note: string }) => markOverstock(id, action, note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['thriftplus', 'overstock'] }),
    onError: (e) => setNotice((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Could not save.'),
  });

  const data = list.data;
  const rows = data?.rows ?? [];
  const done = data && data.total ? Math.round((100 * (data.total - data.undecided)) / data.total) : 0;

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" alignItems="baseline" spacing={1} flexWrap="wrap" useFlexGap>
          <Typography sx={{ fontWeight: 800, fontSize: 18 }}>
            {data ? `${formatNumber(data.undecided)} of ${formatNumber(data.total)} lots to mark` : 'Overstock'}
          </Typography>
          {data ? (
            <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
              {formatNumber(data.units)} units, {formatCurrency(data.tag_total)} in tags
            </Typography>
          ) : null}
        </Stack>
        <Typography sx={{ color: 'text.secondary', fontSize: 14, mt: 0.5 }}>
          Products with {data?.settings.group_min_units ?? 10}+ units on the floor and more than a year of supply at their
          current sales. Their ThriftBucks already grow; mark what a discount can&apos;t fix. Staff do the work.
        </Typography>
        <LinearProgress variant="determinate" value={done} sx={{ my: 1.25, height: 8, borderRadius: 4 }} />
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {VIEWS.map((v) => (
            <Chip
              key={v.key}
              clickable
              color={show === v.key ? 'primary' : 'default'}
              variant={show === v.key ? 'filled' : 'outlined'}
              onClick={() => {
                setShow(v.key);
                setOffset(0);
              }}
              label={`${v.label}: ${formatNumber(v.key === 'all' ? data?.total ?? 0 : data?.counts[v.key] ?? 0)}`}
              data-testid={`show-${v.key}`}
            />
          ))}
        </Stack>
      </Paper>

      <TextField size="small" label="Search" value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} sx={{ mb: 2, minWidth: 260 }} />
      {notice ? <Alert severity="error" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert> : null}
      {list.isFetching ? <LinearProgress sx={{ mb: 1 }} /> : null}

      <Stack spacing={1.25}>
        {rows.map((r) => (
          <LotCard key={r.product_id} row={r} owner={owner} busy={mark.isPending}
            onMark={(action, note) => mark.mutate({ id: r.product_id, action, note })} />
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

function LotCard({ row, owner, busy, onMark }: {
  row: OverstockRow;
  owner: boolean;
  busy: boolean;
  onMark: (action: OverstockAction | 'clear', note: string) => void;
}) {
  const [note, setNote] = useState(row.mark?.note ?? '');
  const price = row.price_min === row.price_max ? formatCurrency(row.price_min) : `${formatCurrency(row.price_min)} to ${formatCurrency(row.price_max)}`;
  return (
    <Paper variant="outlined" data-testid="lot-card" sx={{ p: 1.75, borderLeft: 4, borderLeftColor: row.mark ? 'success.main' : 'warning.main' }}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography sx={{ fontWeight: 800, fontSize: 16 }}>{row.title}</Typography>
        {row.brand && row.brand.toLowerCase() !== 'generic' ? <Chip size="small" label={row.brand} /> : null}
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
        <Fact label="Est. per 90 days" value={row.per_90} />
        <Fact label="Supply" value={supplyText(row.days_of_supply)} />
      </Stack>
      {row.flags.length ? (
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          {row.flags.map((f) => (
            <Stack key={f.key} direction="row" spacing={1} alignItems="center">
              <Chip size="small" color={f.key === 'cost' ? 'info' : 'warning'} label={f.key === 'cost' ? 'Bought to sell near the tag' : 'Mixed tags'} />
              <Typography sx={{ fontSize: 13 }}>{f.text}</Typography>
            </Stack>
          ))}
        </Stack>
      ) : null}
      {row.mark ? (
        <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 1 }}>
          {row.mark.label}{row.mark.by ? ` · ${row.mark.by}` : ''} on {new Date(row.mark.at).toLocaleDateString()}{row.mark.note ? ` · ${row.mark.note}` : ''}
        </Typography>
      ) : null}
      {owner ? (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1.25 }} alignItems={{ md: 'center' }}>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {ACTIONS.map((a) => (
              <Button key={a.key} size="small" sx={plain} disabled={busy}
                variant={row.mark?.action === a.key ? 'contained' : 'outlined'}
                onClick={() => onMark(a.key, note)} data-testid={`mark-${a.key}`}>
                {a.label}
              </Button>
            ))}
            {row.mark ? <Button size="small" sx={plain} color="inherit" disabled={busy} onClick={() => onMark('clear', '')}>Clear</Button> : null}
          </Stack>
          <TextField size="small" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)}
            inputProps={{ maxLength: 200 }} sx={{ flex: 1, minWidth: 200 }} />
        </Stack>
      ) : null}
    </Paper>
  );
}
