/**
 * The Drawer window (Retail 2 step 1, Bill 2026-11-02): who has the drawer, when it opened, the cash in it now by bill
 * and coin, every count with what Dash expected, and the day's journey. Built like the Register window. Counts are
 * blind: while the drawer is open a cashier sees what was counted, never what was expected (the server leaves it out).
 * Opens with `openObject({ type: 'drawer', id })` from the Drawers page, the Register window and the terminal.
 */
import { useState } from 'react';
import { Alert, Box, Button, ButtonBase, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import api from '../../../api/client';
import { useObjectModal } from '../../objects/ObjectModal';
import { Facts, Section, Timeline } from '../../objects/windowParts';
import { DrawerContentsGrid } from '../DrawerContentsDialog';
import type { CashCount } from '../../../utils/cashCounts';
import { historyKey } from './historyScope';
import { journeyRows, type RegisterCardData } from './RegisterWindow';
import { money, useRetailCopy, type CopyKey } from './retailCopy';

interface CountRow {
  key: string;
  label: string;
  counted: number | string;
  expected?: number | string;
  difference?: number | string;
}

export interface DrawerCount {
  kind: 'opening' | 'handoff' | 'close';
  at: string | null;
  who: string | null;
  from?: string | null;
  note?: string;
  bills_only: boolean;
  counted_total: string;
  expected_total: string | null;
  difference: string | null;
  rows: CountRow[];
}

export interface DrawerCardData {
  id: number;
  register: { id: number; name: string; code: string; is_training: boolean };
  date: string;
  status: 'open' | 'closed';
  blind: boolean;
  cashier: string | null;
  covered_by: string | null;
  opened_by: string | null;
  opened_at: string | null;
  opening_total: string;
  closed_by: string | null;
  closed_at: string | null;
  variance: string | null;
  cash_now: { count: CashCount; coins_total?: string | null; total: string };
  counts: DrawerCount[];
  sales: RegisterCardData['sales'];
  journey: RegisterCardData['journey'];
}

export function useDrawerCard(id: number) {
  return useQuery({
    queryKey: ['drawer-card', id],
    queryFn: async () => (await api.get<DrawerCardData>(`/pos/drawers/${id}/card/`)).data,
    refetchInterval: 60_000,
  });
}

const off = (v: string | null | undefined) => v != null && Number.parseFloat(v) !== 0;

function CountItem({ c }: { c: DrawerCount }) {
  const { tr, when } = useRetailCopy();
  const [open, setOpen] = useState(false);
  const title = `${tr(`count_${c.kind}` as CopyKey)}${c.bills_only ? ` (${tr('bills')})` : ''}`;
  const who = c.from ? `${c.from} → ${c.who ?? ''}` : c.who;
  return (
    <Box>
      <ButtonBase
        onClick={() => setOpen((v) => !v)}
        disabled={!c.rows.length}
        data-testid={`count-${c.kind}`}
        sx={{ display: 'flex', width: '100%', gap: 1.5, py: 0.75, px: 0.5, textAlign: 'left', borderRadius: 1, alignItems: 'flex-start' }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{title}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            {[when(c.at, 'h:mm a'), who].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{tr('counted')} {money(c.counted_total)}</Typography>
          {c.expected_total != null && (
            <Typography sx={{ fontSize: 13, color: off(c.difference) ? 'error.main' : 'success.main', fontWeight: 600 }}>
              {tr('expected')} {money(c.expected_total)}
              {off(c.difference) ? ` · ${tr('offBy')} ${money(c.difference)}` : ' ✓'}
            </Typography>
          )}
        </Box>
      </ButtonBase>
      {open && (
        <Box
          sx={{
            display: 'grid', gridTemplateColumns: c.expected_total != null ? 'auto 1fr 1fr 1fr' : 'auto 1fr',
            columnGap: 2, rowGap: 0.25, px: 0.5, pb: 1, fontSize: 13,
          }}
          data-testid={`count-rows-${c.kind}`}
        >
          <Box />
          <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'right' }}>{tr('counted')}</Typography>
          {c.expected_total != null && (
            <>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'right' }}>{tr('expected')}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', textAlign: 'right' }}>{tr('offBy')}</Typography>
            </>
          )}
          {c.rows.map((r) => (
            <Box key={r.key} sx={{ display: 'contents' }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{r.label}</Typography>
              <Typography sx={{ fontSize: 13, textAlign: 'right' }}>{r.counted}</Typography>
              {c.expected_total != null && (
                <>
                  <Typography sx={{ fontSize: 13, textAlign: 'right' }}>{r.expected}</Typography>
                  <Typography sx={{ fontSize: 13, textAlign: 'right', color: off(String(r.difference)) ? 'error.main' : 'text.secondary' }}>
                    {r.difference}
                  </Typography>
                </>
              )}
            </Box>
          ))}
        </Box>
      )}
      {c.note && <Typography sx={{ fontSize: 13, px: 0.5, pb: 0.5 }}>{c.note}</Typography>}
    </Box>
  );
}

export function DrawerWindow({ id }: { id: number }) {
  const { tr, when, lang } = useRetailCopy();
  const { openObject } = useObjectModal();
  const { data: c, isLoading, isError, error } = useDrawerCard(id);
  const [allDay, setAllDay] = useState(false);

  if (isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (isError || !c) {
    const forbidden = (error as { response?: { status?: number } } | null)?.response?.status === 403;
    return <Typography sx={{ p: 3 }}>{tr(forbidden ? 'managerOnly' : 'couldNotLoad')}</Typography>;
  }

  const open = c.status === 'open';
  const journey = journeyRows(c.journey, tr, when);
  const day = when(`${c.date}T12:00:00`, 'EEE MMM d');

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack spacing={0.5}>
        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip size="small" label={tr(open ? 'open' : 'closedBy')} color={open ? 'success' : 'default'} variant="outlined" sx={{ fontWeight: 700 }} />
          {c.register.is_training && <Chip size="small" label={tr('practice')} color="warning" />}
        </Stack>
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 18, md: 22 }, lineHeight: 1.2 }}>
          {c.register.name} · {day}
        </Typography>
        {(c.covered_by || c.cashier) && (
          <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
            {c.covered_by ? `${c.covered_by} (${tr('coveredBy').toLowerCase()})` : c.cashier}
          </Typography>
        )}
      </Stack>
      {c.register.is_training && <Alert severity="warning">{tr('practiceNote')}</Alert>}

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1.15fr)' } }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title={tr(open ? 'cashNow' : 'cashAtClose')}>
            <DrawerContentsGrid
              contents={c.cash_now.count}
              lang={lang}
              hideZero
              coinsCents={c.cash_now.coins_total ? Math.round(Number.parseFloat(c.cash_now.coins_total) * 100) : null}
              totalCents={Math.round(Number.parseFloat(c.cash_now.total) * 100)}
            />
          </Section>
          <Section title={tr('now')}>
            <Facts
              rows={[
                [tr('cashier'), c.cashier],
                [tr('coveredBy'), c.covered_by],
                [tr('openedBy'), c.opened_at ? `${when(c.opened_at, 'h:mm a')}${c.opened_by ? ` · ${c.opened_by}` : ''}` : null],
                [tr('startedWith'), money(c.opening_total)],
                [tr('closedBy'), c.closed_at ? `${when(c.closed_at, 'h:mm a')}${c.closed_by ? ` · ${c.closed_by}` : ''}` : null],
                [tr('countOff'), c.variance != null ? money(c.variance) : null],
                [tr('sales'), c.register.is_training ? String(c.sales.practice) : `${c.sales.count} · ${money(c.sales.total)}`],
              ]}
            />
          </Section>
        </Stack>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title={tr('counts')}>
            <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
              {c.counts.map((n, i) => <CountItem key={`${n.kind}-${i}`} c={n} />)}
            </Stack>
            {c.blind && <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1 }}>{tr('blindNote')}</Typography>}
          </Section>
          <Section title={tr('today')}>
            <Timeline rows={allDay ? journey : journey.slice(0, 10)} empty={tr('nothingToday')} />
            {!allDay && journey.length > 10 && (
              <Button size="small" onClick={() => setAllDay(true)}>{tr('showMore')} ({journey.length})</Button>
            )}
          </Section>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              onClick={() => openObject({
                type: 'history',
                id: historyKey({ drawer: c.id, from: c.date, to: c.date, title: `${c.register.name} · ${day}` }),
              })}
            >
              {tr('drawerSales')}
            </Button>
            <Button variant="outlined" onClick={() => openObject({ type: 'register', id: c.register.id })}>
              {tr('registerBtn')}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Stack>
  );
}
