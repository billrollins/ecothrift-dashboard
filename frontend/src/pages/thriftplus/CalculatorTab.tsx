/**
 * Rewards calculator (owner, 2026-10-07): the stock from the last inventory under any set of reward rules.
 * Guests pay the tag; members pay the tag minus the reward. What-if only: no price, setting or reward changes.
 * The defaults are today's engine: wait 7 days, then the tag ÷ 90 a day, every night, in a straight line, never
 * below 10% of the tag.
 */
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Slider,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchCalculator } from '../../api/thriftplus.api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { CalculatorChoices, CalculatorRow } from '../../types/thriftplus.types';
import { formatCurrency, formatCurrencyWhole, formatNumber } from '../../utils/format';

const DEFAULTS: CalculatorChoices = {
  population: 'counted',
  launch: '2026-10-20',
  offset: 0,
  wait_days: 7,
  pct_per_day: 1.11,
  step_days: 1,
  curve: 'linear',
  floor_share: 0.1,
  same_slowdown: 0,
  count_back_stock: true,
  similar_slowdown: 0,
  max_slowdown: 75,
  demand: false,
  demand_strength: 1,
  max_age: null,
  age_factor: 1,
  max_start_pct: null,
};

const GUEST = '#9e9d97';
const MEMBER = '#2a78d6';
const GRID = '#e6e5e0';
const plain = { textTransform: 'none' as const };
const pct = (v: number | null | undefined) => (v == null ? '-' : `${v}%`);

function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{title}</Typography>
      {hint ? <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>{hint}</Typography> : null}
      <Stack spacing={1.25} sx={{ mt: hint ? 0 : 1 }}>
        {children}
      </Stack>
    </Box>
  );
}

function Num({ label, value, onChange, step = 1, helper, blankable, suffix }: {
  label: string; value: number | null; onChange: (v: number | null) => void; step?: number; helper?: string;
  blankable?: boolean; suffix?: string;
}) {
  return (
    <TextField
      size="small"
      type="number"
      label={label}
      value={value ?? ''}
      placeholder={blankable ? 'none' : undefined}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') return onChange(blankable ? null : 0);
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
      helperText={helper}
      inputProps={{ step }}
      InputProps={suffix ? { endAdornment: <Typography sx={{ fontSize: 13, color: 'text.secondary', ml: 0.5 }}>{suffix}</Typography> } : undefined}
      fullWidth
    />
  );
}

function Side({ title, sub, side, color }: { title: string; sub: string; side: CalculatorRow['guest']; color: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: '1 1 260px', borderTop: 4, borderTopColor: color }}>
      <Typography sx={{ fontWeight: 800 }}>{title}</Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>{sub}</Typography>
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Box>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Total price</Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 800 }}>{formatCurrencyWhole(side.total)}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Avg price</Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 800 }}>{formatCurrency(side.avg)}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Avg % of retail</Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 800 }}>{pct(side.pct_of_retail)}</Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

function Breakdown({ title, rows }: { title: string; rows: CalculatorRow[] }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography sx={{ fontWeight: 800, mb: 1 }}>{title}</Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell align="right">Items</TableCell>
              <TableCell align="right">Guests pay</TableCell>
              <TableCell align="right">Members pay</TableCell>
              <TableCell align="right">Guest % of retail</TableCell>
              <TableCell align="right">Member % of retail</TableCell>
              <TableCell align="right">Avg off</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label} sx={{ opacity: r.items ? 1 : 0.5 }}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.label}</TableCell>
                <TableCell align="right">{formatNumber(r.items)}</TableCell>
                <TableCell align="right">{formatCurrencyWhole(r.guest.total)}</TableCell>
                <TableCell align="right">{formatCurrencyWhole(r.member.total)}</TableCell>
                <TableCell align="right">{pct(r.guest.pct_of_retail)}</TableCell>
                <TableCell align="right">{pct(r.member.pct_of_retail)}</TableCell>
                <TableCell align="right">{pct(r.pct_off)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}

export default function CalculatorTab() {
  const [c, setC] = useState<CalculatorChoices>(DEFAULTS);
  const set = <K extends keyof CalculatorChoices>(k: K, v: CalculatorChoices[K]) => setC((prev) => ({ ...prev, [k]: v }));
  const asked = useDebouncedValue(c, 400);
  const { data, isFetching, error } = useQuery({
    queryKey: ['thriftplus', 'calculator', asked],
    queryFn: () => fetchCalculator(asked),
    placeholderData: keepPreviousData,
  });
  const detail = (error as { response?: { data?: { detail?: string } } } | null)?.response?.data?.detail;
  const t = data?.totals;
  const on = data ? format(parseISO(data.params.on), 'EEE MMM d') : '';
  const chart = (data?.timeline ?? []).map((x) => ({ day: x.offset, Guests: x.guest.pct_of_retail, Members: x.member.pct_of_retail }));

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        What-if only: nothing changes. The defaults are today&apos;s engine: wait 7 days, then 1.11% of the tag a day (the tag ÷ 90),
        every night, in a straight line, never below 10% of the tag. Guests pay the tag; members pay the tag minus the reward.
      </Alert>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Section title="Which stock">
            <ToggleButtonGroup size="small" exclusive value={c.population} onChange={(_e, v) => v && set('population', v)} fullWidth>
              <ToggleButton value="counted" sx={plain}>Last inventory</ToggleButton>
              <ToggleButton value="shelf" sx={plain}>On the shelf today</ToggleButton>
            </ToggleButtonGroup>
            <TextField size="small" type="date" label="Launch" value={c.launch} onChange={(e) => set('launch', e.target.value)} InputLabelProps={{ shrink: true }} />
            <Box>
              <Typography sx={{ fontSize: 13 }}>Show {c.offset ? `${c.offset} days after launch` : 'launch day'}</Typography>
              <Slider size="small" min={0} max={90} step={1} value={c.offset} onChange={(_e, v) => set('offset', v as number)} />
            </Box>
          </Section>

          <Section title="Basic discount">
            <Num label="Wait before the first reward" suffix="days" value={c.wait_days} onChange={(v) => set('wait_days', v ?? 0)} />
            <Num label="Off each day" suffix="% of tag" step={0.05} value={c.pct_per_day} onChange={(v) => set('pct_per_day', v ?? 0)} helper="1.11 = the tag ÷ 90 (today)" />
            <TextField select size="small" label="How often it steps" value={c.step_days} onChange={(e) => set('step_days', Number(e.target.value))}>
              <MenuItem value={1}>Every night</MenuItem>
              <MenuItem value={3}>Every 3 days</MenuItem>
              <MenuItem value={7}>Once a week</MenuItem>
              <MenuItem value={14}>Every 2 weeks</MenuItem>
            </TextField>
            <TextField select size="small" label="Curve" value={c.curve} onChange={(e) => set('curve', e.target.value as CalculatorChoices['curve'])}
              helperText="All three reach the floor on the same day.">
              <MenuItem value="linear">Straight line</MenuItem>
              <MenuItem value="slow_start">Slow start, faster later</MenuItem>
              <MenuItem value="fast_start">Fast start, slower later</MenuItem>
            </TextField>
            <Num label="Lowest a member pays" suffix="% of tag" value={Math.round(c.floor_share * 100)} onChange={(v) => set('floor_share', (v ?? 0) / 100)} />
          </Section>

          <Section title="More than one" hint="Today's engine holds a group's reward while it sells on pace; that needs real sales, so here it is a slowdown instead.">
            <Num label="Same product: slower per extra unit" suffix="%" value={c.same_slowdown} onChange={(v) => set('same_slowdown', v ?? 0)} />
            <FormControlLabel control={<Switch size="small" checked={c.count_back_stock} onChange={(e) => set('count_back_stock', e.target.checked)} />}
              label={<Typography sx={{ fontSize: 13 }}>Count back-stock estimates (last inventory)</Typography>} />
            <Num label="Similar (same brand and category): slower per extra item" suffix="%" step={0.5} value={c.similar_slowdown} onChange={(v) => set('similar_slowdown', v ?? 0)} />
            <Num label="Most it can slow" suffix="%" value={c.max_slowdown} onChange={(v) => set('max_slowdown', v ?? 0)} />
          </Section>

          <Section title="Demand (beta)" hint="Each category's days to sell (last 180 days), blended with the store's by how many sales back it. Fast sellers discount slower, slow sellers faster (½× to 2×).">
            <FormControlLabel control={<Switch size="small" checked={c.demand} onChange={(e) => set('demand', e.target.checked)} />}
              label={<Typography sx={{ fontSize: 13 }}>Use category demand</Typography>} />
            {c.demand ? (
              <Box>
                <Typography sx={{ fontSize: 13 }}>Strength: {c.demand_strength.toFixed(1)}</Typography>
                <Slider size="small" min={0} max={2} step={0.1} value={c.demand_strength} onChange={(_e, v) => set('demand_strength', v as number)} />
              </Box>
            ) : null}
          </Section>

          <Section title="Shotgun start" hint="Stock already on the floor at launch, so nothing starts at 90% off.">
            <Num label="Oldest it can count on launch day" suffix="days" blankable value={c.max_age} onChange={(v) => set('max_age', v)}
              helper={c.max_age && data?.params.start_equivalent ? `Same as the rewards start ${format(parseISO(data.params.start_equivalent), 'MMM d')}` : 'Blank = its real age'} />
            <Box>
              <Typography sx={{ fontSize: 13 }}>Count old stock at {Math.round(c.age_factor * 100)}% of its real age</Typography>
              <Slider size="small" min={0} max={1} step={0.05} value={c.age_factor} onChange={(_e, v) => set('age_factor', v as number)} />
            </Box>
            <Num label="Most off on launch day" suffix="%" blankable value={c.max_start_pct} onChange={(v) => set('max_start_pct', v)} helper="Blank = no cap. From launch it grows at the normal rate." />
          </Section>

          <Button fullWidth variant="outlined" onClick={() => setC(DEFAULTS)} sx={plain}>Reset to today&apos;s engine</Button>
        </Paper>

        <Box sx={{ minWidth: 0 }}>
          {isFetching ? <LinearProgress sx={{ mb: 1 }} /> : <Box sx={{ height: 4, mb: 1 }} />}
          {error ? <Alert severity="error" sx={{ mb: 2 }}>{detail || 'Could not run the calculator.'}</Alert> : null}
          {data && t ? (
            <Stack spacing={2}>
              <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
                {data.source.count
                  ? `${formatNumber(t.items)} items ${data.source.count.name.replace(/^Count /, 'the inventory of ')} counted that are still on the shelf`
                  : `${formatNumber(t.items)} items on the shelf today`}
                , on {on}. Consignment is left out ({formatNumber(data.excluded.consignment)}).
              </Typography>
              <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.5}>
                <Paper variant="outlined" sx={{ p: 1.5, flex: '1 1 140px' }}>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Items</Typography>
                  <Typography sx={{ fontSize: 20, fontWeight: 800 }}>{formatNumber(t.items)}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{formatNumber(t.with_retail)} with a retail</Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.5, flex: '1 1 140px' }}>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Retail</Typography>
                  <Typography sx={{ fontSize: 20, fontWeight: 800 }}>{formatCurrencyWhole(t.retail_total)}</Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.5, flex: '1 1 140px' }}>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Rewards</Typography>
                  <Typography sx={{ fontSize: 20, fontWeight: 800 }}>{formatCurrencyWhole(t.reward_total)}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {pct(t.pct_off)} off on average · {formatNumber(t.with_reward)} items
                  </Typography>
                </Paper>
              </Stack>
              <Stack direction="row" flexWrap="wrap" useFlexGap gap={1.5}>
                <Side title="Guests" sub="Pay the tag" side={t.guest} color={GUEST} />
                <Side title="Members" sub="Pay the tag minus the reward" side={t.member} color={MEMBER} />
              </Stack>
              {data.rate_changes.slower || data.rate_changes.faster ? (
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                  Rate changed for {formatNumber(data.rate_changes.slower)} items (slower) and {formatNumber(data.rate_changes.faster)} (faster).
                </Typography>
              ) : null}

              <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography sx={{ fontWeight: 800 }}>Average % of retail paid, by day after launch</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>If nothing sold: the same stock, day by day.</Typography>
                <Box sx={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="day" tickFormatter={(d: number) => (d ? `+${d}` : 'Launch')} tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 12 }} width={44} />
                      <Tooltip formatter={(v: unknown) => `${v}%`} labelFormatter={(d: unknown) => (Number(d) ? `${d} days after launch` : 'Launch day')} />
                      <Legend />
                      <Line type="monotone" dataKey="Guests" stroke={GUEST} strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Members" stroke={MEMBER} strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>

              <Breakdown title="By age on launch day (real age)" rows={data.by_age} />
              <Breakdown title="By % off" rows={data.by_off} />
              <Breakdown title="By price" rows={data.by_band} />
              <Breakdown title="Biggest categories" rows={data.by_category} />
              {data.demand ? (
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography sx={{ fontWeight: 800 }}>Demand by category (beta)</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 1 }}>
                    The store sells an item in {data.demand.store_median_days ?? '-'} days (median of {formatNumber(data.demand.sales)} sales with a floor date).
                  </Typography>
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Category</TableCell>
                          <TableCell align="right">Sales</TableCell>
                          <TableCell align="right">Median days</TableCell>
                          <TableCell align="right">Credibility</TableCell>
                          <TableCell align="right">Blended days</TableCell>
                          <TableCell align="right">Rate ×</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.demand.categories.map((d) => (
                          <TableRow key={d.category}>
                            <TableCell>{d.category}</TableCell>
                            <TableCell align="right">{formatNumber(d.sales)}</TableCell>
                            <TableCell align="right">{d.median_days}</TableCell>
                            <TableCell align="right">{Math.round(d.credibility * 100)}%</TableCell>
                            <TableCell align="right">{d.blended_days}</TableCell>
                            <TableCell align="right">{d.multiplier ?? '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                </Paper>
              ) : null}
            </Stack>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
