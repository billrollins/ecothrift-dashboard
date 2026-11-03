/**
 * The Register window (Retail 2, Bill 2026-11-02): which drawer is in it, who is on it, today's sales, status.
 * Built like the Item window: header (name, code with copy, status, today's numbers), sections, today's timeline,
 * links. Read-only; Edit hands over to POS setup (managers). Opens from anywhere with `openObject({type:'register', id})`.
 */
import { useState } from 'react';
import { Alert, Box, Button, ButtonBase, Chip, CircularProgress, Link, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, startOfWeek } from 'date-fns';
import api from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';
import { IconEdit } from '../../../icons/ecoIcons';
import { useObjectModal } from '../../objects/ObjectModal';
import { CopyId, Facts, Section, Stat, Timeline, type TimelineRow } from '../../objects/windowParts';
import { historyKey } from './historyScope';
import { money, useRetailCopy, type CopyKey } from './retailCopy';

export interface RegisterCardData {
  id: number;
  name: string;
  code: string;
  location: string | null;
  is_active: boolean;
  is_training: boolean;
  starting_cash: string;
  status: 'open' | 'closed' | 'not_opened' | 'off';
  today: string;
  drawer: null | {
    id: number;
    status: string;
    cashier: string | null;
    covered_by: string | null;
    opened_by: string | null;
    opened_at: string | null;
    opening_total: string;
    closed_by: string | null;
    closed_at: string | null;
    variance: string | null;
  };
  last_drawer: null | { id: number; date: string; status: string };
  sales: {
    count: number;
    total: string;
    average: string;
    by_method: Record<string, string>;
    voided: number;
    thrift_count: number;
    practice: number;
    last_sale_at: string | null;
  };
  last_sales: {
    id: number;
    receipt: string | null;
    status: string;
    at: string;
    cashier: string | null;
    payment_method: string;
    total: string;
  }[];
  journey: {
    kind: string;
    at: string;
    who: string | null;
    from?: string | null;
    amount?: string;
    variance?: string | null;
    note?: string;
  }[];
}

const STATUS: Record<RegisterCardData['status'], { key: CopyKey; color: 'success' | 'default' | 'warning' }> = {
  open: { key: 'open', color: 'success' },
  closed: { key: 'closedToday', color: 'default' },
  not_opened: { key: 'notOpened', color: 'warning' },
  off: { key: 'off', color: 'default' },
};

const DOT: Record<string, string> = {
  opened: '#2e7d32', closed: '#424242', handoff: '#0277bd', cover: '#6a1b9a', cover_end: '#9e9e9e',
  drop: '#00838f', paid_in: '#558b2f', paid_out: '#ef6c00', open_drawer: '#c62828',
  reprint: '#757575', print_failed: '#c62828', tax_exempt: '#0277bd', tax_exempt_off: '#757575',
};

/** Today's journey as timeline rows (the Register and Drawer windows). */
export function journeyRows(
  events: RegisterCardData['journey'],
  tr: (key: CopyKey) => string,
  when: (iso: string | null | undefined, pattern?: string) => string,
): TimelineRow[] {
  return events.map((e, i) => {
    const label = (COPY_EVENT.has(e.kind) ? tr(`ev_${e.kind}` as CopyKey) : e.kind);
    const parts = [
      e.amount && e.kind !== 'cover' && e.kind !== 'cover_end' ? money(e.amount) : '',
      e.from ? `${tr('from')} ${e.from}` : '',
      e.variance && Number.parseFloat(e.variance) !== 0 ? `${tr('countOff')} ${money(e.variance)}` : '',
      e.note ?? '',
    ].filter(Boolean);
    return {
      key: `${e.kind}-${e.at}-${i}`,
      label,
      detail: parts.join(' · ') || null,
      when: `${when(e.at, 'h:mm a')}${e.who ? ` · ${e.who}` : ''}`,
      dot: DOT[e.kind] ?? '#999',
    };
  });
}

export function useRegisterCard(id: number) {
  return useQuery({
    queryKey: ['register-card', id],
    queryFn: async () => (await api.get<RegisterCardData>(`/pos/registers/${id}/card/`)).data,
    refetchInterval: 60_000,
  });
}

export function RegisterWindow({ id }: { id: number }) {
  const { tr, paid, when } = useRetailCopy();
  const { hasRole } = useAuth();
  const { openObject, closeObject } = useObjectModal();
  const navigate = useNavigate();
  const { data: c, isLoading, isError } = useRegisterCard(id);
  const [allDay, setAllDay] = useState(false);

  if (isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (isError || !c) return <Typography sx={{ p: 3 }}>{tr('couldNotLoad')}</Typography>;

  const d = c.drawer;
  const s = c.sales;
  const status = STATUS[c.status];
  const go = (path: string) => {
    closeObject();
    navigate(path);
  };
  const history = (from: string, to: string) =>
    openObject({ type: 'history', id: historyKey({ register: c.id, from, to, title: c.name }) });
  const weekStart = format(startOfWeek(new Date(`${c.today}T12:00:00`), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const journey = journeyRows(c.journey, tr, when);

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <CopyId value={c.code} label={tr('code')} copied={tr('copied')} />
            <Chip size="small" label={tr(status.key)} color={status.color} variant="outlined" sx={{ fontWeight: 700 }} />
            {c.is_training && <Chip size="small" label={tr('practice')} color="warning" />}
            {c.location && <Chip size="small" label={c.location} variant="outlined" />}
          </Stack>
          <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 18, md: 22 }, lineHeight: 1.2 }}>{c.name}</Typography>
          {d && (
            <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
              {d.covered_by ? `${d.covered_by} (${tr('coveredBy').toLowerCase()})` : d.cashier}
            </Typography>
          )}
          <Stack direction="row" spacing={{ xs: 2, md: 3 }} sx={{ pt: 0.5 }} flexWrap="wrap" useFlexGap>
            {c.is_training ? (
              <Stat label={tr('practiceSales')} value={s.practice} />
            ) : (
              <>
                <Stat label={tr('todaySales')} value={money(s.total)} />
                <Stat label={tr('sales')} value={s.count} muted />
                <Stat label={tr('average')} value={money(s.average)} muted />
              </>
            )}
          </Stack>
        </Stack>
        {hasRole('Manager') && (
          <Button variant="contained" startIcon={<IconEdit fontSize="small" />} onClick={() => go('/admin/pos-setup')} sx={{ flexShrink: 0 }}>
            {tr('edit')}
          </Button>
        )}
      </Stack>
      {c.is_training && <Alert severity="warning">{tr('practiceNote')}</Alert>}

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.15fr) minmax(0, 1fr)' } }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title={tr('now')}>
            <Facts
              rows={[
                [tr('drawer'), d ? (
                  <Link component="button" onClick={() => openObject({ type: 'drawer', id: d.id })} data-testid="register-drawer-link">
                    {tr(d.status === 'open' ? 'open' : 'closedToday')}
                  </Link>
                ) : tr('notOpened')],
                [tr('cashier'), d?.cashier],
                [tr('coveredBy'), d?.covered_by],
                [tr('openedBy'), d?.opened_at ? `${when(d.opened_at, 'h:mm a')}${d.opened_by ? ` · ${d.opened_by}` : ''}` : null],
                [tr('startedWith'), d ? money(d.opening_total) : null],
                [tr('closedBy'), d?.closed_at ? `${when(d.closed_at, 'h:mm a')}${d.closed_by ? ` · ${d.closed_by}` : ''}` : null],
                [tr('countOff'), d?.variance != null ? money(d.variance) : null],
                [tr('lastDrawer'), c.last_drawer ? when(`${c.last_drawer.date}T12:00:00`, 'EEE MMM d') : null],
              ]}
            />
          </Section>
          {!c.is_training && (
            <Section title={tr('todaysMoney')}>
              <Facts
                empty={tr('noSales')}
                rows={[
                  ...Object.entries(s.by_method).map(([m, v]) => [paid(m), money(v)] as [string, string]),
                  [tr('voided'), s.voided ? String(s.voided) : null],
                  [tr('thriftSales'), s.thrift_count ? String(s.thrift_count) : null],
                  [tr('lastSaleAt'), s.last_sale_at ? when(s.last_sale_at, 'h:mm a') : null],
                ]}
              />
            </Section>
          )}
          <Section
            title={tr('lastSales')}
            action={c.last_sales.length ? (
              <Button size="small" onClick={() => history(c.today, c.today)}>{tr('allToday')}</Button>
            ) : undefined}
          >
            {c.last_sales.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{tr('noSales')}</Typography>
            ) : (
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                {c.last_sales.map((r) => (
                  <ButtonBase
                    key={r.id}
                    onClick={() => openObject({ type: 'sale', id: r.id })}
                    sx={{ display: 'flex', gap: 1.5, py: 0.75, px: 0.5, textAlign: 'left', borderRadius: 1, justifyContent: 'flex-start' }}
                  >
                    <Typography sx={{ width: 64, flexShrink: 0, fontSize: 14 }}>{when(r.at, 'h:mm a')}</Typography>
                    <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14 }} noWrap>
                      {[r.receipt ?? `#${r.id}`, r.cashier, paid(r.payment_method)].filter(Boolean).join(' · ')}
                    </Typography>
                    {r.status === 'voided' && <Chip size="small" label={tr('voided')} color="error" variant="outlined" />}
                    <Typography sx={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{money(r.total)}</Typography>
                  </ButtonBase>
                ))}
              </Stack>
            )}
          </Section>
        </Stack>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title={tr('today')}>
            <Timeline rows={allDay ? journey : journey.slice(0, 10)} empty={tr('nothingToday')} />
            {!allDay && journey.length > 10 && (
              <Button size="small" onClick={() => setAllDay(true)}>{tr('showMore')} ({journey.length})</Button>
            )}
          </Section>
          <Section title={tr('links')}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button size="small" variant="outlined" onClick={() => history(c.today, c.today)}>{tr('allToday')}</Button>
              <Button size="small" variant="outlined" onClick={() => history(weekStart, c.today)}>{tr('thisWeekBtn')}</Button>
              <Button size="small" variant="outlined" onClick={() => go('/pos/drawers')}>{tr('drawersPage')}</Button>
              <Button size="small" variant="outlined" onClick={() => go('/pos/cash')}>{tr('cashPage')}</Button>
            </Stack>
          </Section>
        </Stack>
      </Box>
    </Stack>
  );
}

const COPY_EVENT = new Set([
  'opened', 'closed', 'handoff', 'cover', 'cover_end', 'drop', 'paid_in', 'paid_out', 'open_drawer', 'reprint',
  'print_failed', 'tax_exempt', 'tax_exempt_off',
]);
