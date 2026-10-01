import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  FormControlLabel,
  LinearProgress,
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
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useEffect, useState } from 'react';
import { fetchFloorCompare, fetchFloorPlan } from '../../api/thriftplus.api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { FloorPlanChoices, FloorPlanRow } from '../../types/thriftplus.types';
import { formatCurrencyWhole, formatNumber } from '../../utils/format';

const LAUNCH = '2026-10-20';
const DEFAULTS = { maxAge: 1, useRealAge: true, offset: 0, waitDays: 7, horizon: 90, launch: LAUNCH };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, minWidth: 160, flex: '1 1 160px' }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>
        {value}
      </Typography>
      {hint ? (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      ) : null}
    </Paper>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: FloorPlanRow[] }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
        {title}
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell align="right">Items</TableCell>
              <TableCell align="right">Current prices</TableCell>
              <TableCell align="right">Rewards</TableCell>
              <TableCell align="right">New prices</TableCell>
              <TableCell align="right">Off</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.label}</TableCell>
                <TableCell align="right">{formatNumber(r.units)}</TableCell>
                <TableCell align="right">{formatCurrencyWhole(r.tag_total)}</TableCell>
                <TableCell align="right">{formatCurrencyWhole(r.reward_total)}</TableCell>
                <TableCell align="right">{formatCurrencyWhole(r.member_total)}</TableCell>
                <TableCell align="right">{r.pct_off}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}

const dayLabel = (iso: string) => format(parseISO(iso), 'EEE MMM d');

/**
 * Thrift+ → Floor stock: a what-if calculator for the stock already on the floor when Thrift+ starts.
 * It replays the reward engine's own rules over today's on-shelf items. Nothing here changes a price
 * or a setting.
 */
export default function FloorStockTab() {
  const [useRealAge, setUseRealAge] = useState(DEFAULTS.useRealAge);
  const [maxAge, setMaxAge] = useState(30);
  const [share, setShare] = useState<number | null>(null); // percent; null until the current setting arrives
  const [offset, setOffset] = useState(DEFAULTS.offset);
  const [waitDays, setWaitDays] = useState(DEFAULTS.waitDays);
  const [horizon, setHorizon] = useState(DEFAULTS.horizon);
  const [launch, setLaunch] = useState(DEFAULTS.launch);

  const choices: FloorPlanChoices = useDebouncedValue(
    {
      launch,
      offset,
      max_age: useRealAge ? null : maxAge,
      floor_share: share == null ? null : share / 100,
      wait_days: waitDays,
      horizon,
    },
    250,
  );

  const plan = useQuery({
    queryKey: ['thriftPlus', 'floorPlan', choices],
    queryFn: () => fetchFloorPlan(choices),
    placeholderData: keepPreviousData,
  });
  const compare = useQuery({
    queryKey: ['thriftPlus', 'floorCompare', choices.launch, choices.floor_share, choices.wait_days, choices.horizon],
    queryFn: () => fetchFloorCompare(choices),
    placeholderData: keepPreviousData,
  });

  // The first answer carries the current floor setting: start the slider there.
  const serverShare = plan.data ? Math.round(Number(plan.data.scenario.floor_share) * 100) : null;
  useEffect(() => {
    if (share == null && serverShare != null) setShare(serverShare);
  }, [share, serverShare]);

  const d = plan.data;
  const t = d?.totals;
  const reset = () => {
    setUseRealAge(DEFAULTS.useRealAge);
    setMaxAge(30);
    setShare(serverShare);
    setOffset(DEFAULTS.offset);
    setWaitDays(DEFAULTS.waitDays);
    setHorizon(DEFAULTS.horizon);
    setLaunch(DEFAULTS.launch);
  };
  const lookDate = d ? dayLabel(d.scenario.on) : '';

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        What would members pay for the stock already on the floor? Move the sliders. Nothing here changes a price or a
        setting. Members' rewards can only be held lower than this (when a family of items is selling fast), never
        higher.
      </Alert>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2.5}>
          <Box>
            <FormControlLabel
              control={<Switch checked={useRealAge} onChange={(e) => setUseRealAge(e.target.checked)} />}
              label="Count every item from the day it reached the floor"
            />
            <Typography variant="body2" color="text.secondary">
              Off: stock already on the floor is treated as no older than the days you choose below.
            </Typography>
            <Box sx={{ px: 1, opacity: useRealAge ? 0.45 : 1 }}>
              <Typography id="max-age-label" gutterBottom>
                On launch day, stock counts as at most <b>{maxAge}</b> {maxAge === 1 ? 'day' : 'days'} old
              </Typography>
              <Slider
                aria-labelledby="max-age-label"
                value={maxAge}
                min={1}
                max={120}
                disabled={useRealAge}
                valueLabelDisplay="auto"
                onChange={(_, v) => setMaxAge(v as number)}
              />
              <Typography variant="caption" color="text.secondary">
                1 means everyone starts fresh on launch day.
              </Typography>
            </Box>
          </Box>

          <Box sx={{ px: 1 }}>
            <Typography id="floor-label" gutterBottom>
              A member never pays less than <b>{share ?? '…'}%</b> of the tag
            </Typography>
            <Slider
              aria-labelledby="floor-label"
              value={share ?? 10}
              min={0}
              max={50}
              disabled={share == null}
              valueLabelDisplay="auto"
              onChange={(_, v) => setShare(v as number)}
            />
            <Typography variant="caption" color="text.secondary">
              Today's setting is {d ? Math.round(Number(d.current_settings.floor_share) * 100) : '…'}%.
            </Typography>
          </Box>

          <Box sx={{ px: 1 }}>
            <Typography id="look-label" gutterBottom>
              Look at: launch day plus <b>{offset}</b> {offset === 1 ? 'day' : 'days'} {lookDate ? `(${lookDate})` : ''}
            </Typography>
            <Slider
              aria-labelledby="look-label"
              value={offset}
              min={0}
              max={120}
              valueLabelDisplay="auto"
              onChange={(_, v) => setOffset(v as number)}
            />
          </Box>

          <Accordion variant="outlined" disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>More choices</AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                <TextField
                  label="Launch day"
                  type="date"
                  size="small"
                  value={launch}
                  onChange={(e) => e.target.value && setLaunch(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ maxWidth: 200 }}
                />
                <Box sx={{ px: 1 }}>
                  <Typography id="wait-label" gutterBottom>
                    No reward for the first <b>{waitDays}</b> days
                  </Typography>
                  <Slider aria-labelledby="wait-label" value={waitDays} min={0} max={14} valueLabelDisplay="auto" onChange={(_, v) => setWaitDays(v as number)} />
                </Box>
                <Box sx={{ px: 1 }}>
                  <Typography id="horizon-label" gutterBottom>
                    The reward reaches the full price after <b>{horizon}</b> days
                  </Typography>
                  <Slider aria-labelledby="horizon-label" value={horizon} min={45} max={180} valueLabelDisplay="auto" onChange={(_, v) => setHorizon(v as number)} />
                  <Typography variant="caption" color="text.secondary">
                    The store's rules are 7 and 90 days. Changing them here only shows what would happen.
                  </Typography>
                </Box>
              </Stack>
            </AccordionDetails>
          </Accordion>
          <Box>
            <Button variant="outlined" size="small" onClick={reset}>
              Back to the store's rules
            </Button>
          </Box>
        </Stack>
      </Paper>

      {plan.isError ? <Alert severity="error">Could not work that out. Try again.</Alert> : null}
      {plan.isFetching ? <LinearProgress /> : null}

      {t ? (
        <>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            On {lookDate}
            {d?.scenario.max_age ? `, stock counted as at most ${d.scenario.max_age} days old on launch day` : ', each item counted from its own floor date'}
          </Typography>
          <Stack direction="row" useFlexGap flexWrap="wrap" gap={1.5}>
            <Stat label="Items in the store" value={formatNumber(t.units)} hint={`${formatNumber(t.consignment_excluded)} consignment left out`} />
            <Stat
              label="Current retail"
              value={formatCurrencyWhole(t.retail_total)}
              hint={t.retail_missing ? `${formatNumber(t.retail_missing)} items have no retail` : undefined}
            />
            <Stat label="Current prices (the tags)" value={formatCurrencyWhole(t.tag_total)} hint="What guests pay" />
            <Stat label="New prices (members)" value={formatCurrencyWhole(t.member_total)} hint={`${t.pct_off}% off the tags`} />
            <Stat label="Rewards handed out" value={formatCurrencyWhole(t.reward_total)} hint={`${formatNumber(t.with_reward)} items have one`} />
            <Stat label="At the floor" value={formatNumber(t.at_floor)} hint={`${formatNumber(t.exit_list)} at day ${d?.scenario.horizon} or more`} />
          </Stack>

          {d?.scenario.start_equivalent ? (
            <Alert severity="success">
              To get this, set <b>thrift_plus_rewards_start</b> to <b>{d.scenario.start_equivalent}</b> (a Settings change, before
              the switch goes on
              {d.current_settings.start ? `; it is ${d.current_settings.start} today` : '; it is blank today'}). This page does not change it.
            </Alert>
          ) : null}
        </>
      ) : (
        <LinearProgress />
      )}

      {compare.data ? (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 0.5 }}>
            The usual choices side by side
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            New prices (members) for all the stock, on launch day and after. Lower is a bigger discount.
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Choice</TableCell>
                  {compare.data.offsets.map((o) => (
                    <TableCell key={o} align="right">
                      {o === 0 ? 'Launch day' : `+${o} days`}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {compare.data.rows.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell sx={{ minWidth: 220 }}>
                      {r.label}
                      {r.start_equivalent ? (
                        <Typography variant="caption" color="text.secondary" component="div">
                          start setting {r.start_equivalent}
                        </Typography>
                      ) : null}
                    </TableCell>
                    {r.cells.map((c) => (
                      <TableCell key={c.offset} align="right">
                        {formatCurrencyWhole(c.member_total)}
                        <Typography variant="caption" color="text.secondary" component="div">
                          {c.pct_off}% off · {formatNumber(c.with_reward)} items
                        </Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Paper>
      ) : null}

      {d ? (
        <>
          <BreakdownTable title="By how long it has been on the floor (real age on launch day)" rows={d.by_age} />
          <BreakdownTable title="By price" rows={d.by_band} />
          <BreakdownTable title="By category (the biggest by price)" rows={d.by_category} />
        </>
      ) : null}

      <Typography variant="caption" color="text.secondary">
        Retail and prices are what the system holds today for items marked On shelf. The numbers come from the same
        rules the nightly reward run uses.
      </Typography>
    </Stack>
  );
}
