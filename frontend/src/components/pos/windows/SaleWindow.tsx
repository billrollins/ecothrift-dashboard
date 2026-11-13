/**
 * The Transaction window (Retail 2, Dash Updates #15): one sale, the same wherever it opens (`openObject({ type: 'sale',
 * id })`): the Transactions page, the Transactions and Register windows, a member's trips.
 * Built like the Item window: header (receipt with copy, status, when, total), the sale (its lines, each SKU opening the
 * Item window, totals, how it was paid, Reprint / Fix card type / Void), the lines that came back as Thrift+ returns,
 * its history, and links. A return is not a sale of its own: it shows here, on the sale it came from.
 */
import { useState } from 'react';
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../api/client';
import { getCart } from '../../../api/pos.api';
import { canAccess } from '../../../auth/access';
import { useAuth } from '../../../hooks/useAuth';
import type { Cart } from '../../../types/pos.types';
import { useObjectModal } from '../../objects/ObjectModal';
import { CopyId, Section, Stat, Timeline, type TimelineRow } from '../../objects/windowParts';
import { SaleDetail } from '../SaleDetail';
import { PriceFixDialog } from './PriceFixDialog';
import { money, useRetailCopy, type CopyKey } from './retailCopy';
import { StaffLink } from '../../staff/StaffLink';

interface SaleCardData {
  id: number;
  register: { id: number; name: string; is_training: boolean } | null;
  drawer: number | null;
  member: { person_id: number; name: string } | null;
  items: Record<string, { id: number; sku: string }>;
  returns: {
    line: number;
    description: string;
    at: string;
    credit: string;
    bucks_taken: string;
    status: 'open' | 'done';
    by: string | null;
  }[];
  /** Price fixes (owner, 11-09): a wrong price made right on the day fixed. */
  price_fixes?: {
    line: number;
    description: string;
    at: string;
    old_unit_price: string;
    new_unit_price: string;
    money_back: string;
    back_as: 'credit' | 'cash' | 'card';
    note: string;
    by: string | null;
  }[];
  journey: { kind: string; at: string; who: string | null; note?: string }[];
}

const STATUS: Record<string, { key: CopyKey; color: 'success' | 'error' | 'warning' | 'default' }> = {
  completed: { key: 'st_completed', color: 'success' },
  voided: { key: 'st_voided', color: 'error' },
  training: { key: 'st_training', color: 'warning' },
  open: { key: 'st_open', color: 'default' },
  suspended: { key: 'st_suspended', color: 'default' },
};

const EVENT: Record<string, { key: CopyKey; dot: string }> = {
  opened: { key: 'ev_sale_opened', dot: '#9e9e9e' },
  completed: { key: 'ev_completed', dot: '#2e7d32' },
  card_fixed: { key: 'ev_card_fixed', dot: '#0277bd' },
  price_fixed: { key: 'ev_price_fixed', dot: '#ef6c00' },
  returned: { key: 'ev_returned', dot: '#ef6c00' },
  voided: { key: 'ev_voided', dot: '#c62828' },
  open_drawer: { key: 'ev_open_drawer', dot: '#c62828' },
  reprint: { key: 'ev_reprint', dot: '#757575' },
  print_failed: { key: 'ev_print_failed', dot: '#c62828' },
  tax_exempt: { key: 'ev_tax_exempt', dot: '#0277bd' },
  tax_exempt_off: { key: 'ev_tax_exempt_off', dot: '#757575' },
};

function num(v: unknown): number {
  const n = Number.parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

export function SaleWindow({ id }: { id: number }) {
  const { tr, when } = useRetailCopy();
  const qc = useQueryClient();
  const { openObject } = useObjectModal();
  const { user } = useAuth();
  const [fixing, setFixing] = useState(false);
  const key = ['sale-window', id];
  const sale = useQuery({ queryKey: key, queryFn: async () => (await getCart(id)).data as unknown as Cart });
  const card = useQuery({
    queryKey: ['sale-card', id],
    queryFn: async () => (await api.get<SaleCardData>(`/pos/carts/${id}/card/`)).data,
  });
  const cart = sale.data;
  const c = card.data;

  if (sale.isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (sale.isError || !cart) return <Typography sx={{ p: 3 }}>{tr('couldNotLoad')}</Typography>;

  const receipt = cart.receipt?.receipt_number;
  const status = STATUS[cart.status];
  const items = (cart.lines ?? []).filter((l) => l.line_kind !== 'discount').reduce((n, l) => n + (l.quantity || 0), 0);
  const saved = num(cart.savings?.total);
  const returned = new Set((c?.returns ?? []).map((r) => r.line));
  const fixedLines = new Set((c?.price_fixes ?? []).map((f) => f.line));
  const canFixPrice = cart.status === 'completed' && canAccess(user, ['thriftplus:owner']);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['sale-card', id] });
    void qc.invalidateQueries({ queryKey: ['register-card'] });
  };
  const history: TimelineRow[] = (c?.journey ?? []).map((e, i) => ({
    key: `${e.kind}-${e.at}-${i}`,
    label: EVENT[e.kind] ? tr(EVENT[e.kind].key) : e.kind,
    detail: e.note || null,
    when: `${when(e.at)}${e.who ? ` · ${e.who}` : ''}`,
    dot: EVENT[e.kind]?.dot ?? '#999',
  }));

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack spacing={0.5}>
        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          {receipt ? <CopyId value={receipt} label={tr('receipt')} copied={tr('copied')} /> : (
            <Typography sx={{ fontFamily: 'monospace', fontWeight: 900 }}>#{cart.id}</Typography>
          )}
          {status ? <Chip size="small" label={tr(status.key)} color={status.color} variant="outlined" sx={{ fontWeight: 700 }} /> : null}
          {returned.size ? <Chip size="small" label={tr('returnedChip')} color="warning" sx={{ fontWeight: 700 }} /> : null}
          {c?.register?.is_training && cart.status !== 'training' ? (
            <Chip size="small" label={tr('st_training')} color="warning" sx={{ fontWeight: 700 }} />
          ) : null}
        </Stack>
        <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
          {[when(cart.completed_at ?? cart.created_at), c?.register?.name].filter(Boolean).join(' · ')}
          {cart.cashier_name ? <> · <StaffLink userId={cart.cashier}>{cart.cashier_name}</StaffLink></> : null}
        </Typography>
        <Stack direction="row" spacing={{ xs: 2, md: 3 }} sx={{ pt: 0.5 }} flexWrap="wrap" useFlexGap>
          <Stat label={tr('total')} value={money(cart.total)} />
          <Stat label={tr('items')} value={items} muted />
          {saved > 0 ? <Stat label={tr('saved')} value={money(saved)} muted /> : null}
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.25fr) minmax(0, 1fr)' } }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title={tr('saleSection')}>
            <SaleDetail
              cart={cart}
              items={c?.items}
              returnedLines={returned}
              onUpdated={(updated) => {
                qc.setQueryData(key, updated);
                void qc.invalidateQueries({ queryKey: ['sale-card', id] });
              }}
              onVoided={refresh}
            />
          </Section>
          {c?.returns.length ? (
            <Section title={tr('returnsSection')}>
              <Stack spacing={1}>
                {c.returns.map((r) => (
                  <Box key={r.line}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{r.description}</Typography>
                    <Typography sx={{ fontSize: 13 }}>
                      {money(r.credit)} {tr('credit')}
                      {num(r.bucks_taken) > 0 ? ` · ${tr('bucksTaken')} ${money(r.bucks_taken)}` : ''}
                      {' · '}{tr(r.status === 'done' ? 'handled' : 'waiting')}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{when(r.at)}{r.by ? ` · ${r.by}` : ''}</Typography>
                  </Box>
                ))}
              </Stack>
            </Section>
          ) : null}
          {c?.price_fixes?.length ? (
            <Section title="Price fixes">
              <Stack spacing={1}>
                {c.price_fixes.map((f) => (
                  <Box key={f.line}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{f.description}</Typography>
                    <Typography sx={{ fontSize: 13 }}>
                      {money(f.old_unit_price)} → {money(f.new_unit_price)} · {money(f.money_back)} back as{' '}
                      {f.back_as === 'credit' ? 'Thrift+ credit' : f.back_as === 'cash' ? 'cash' : 'a card refund'}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{when(f.at)}{f.by ? ` · ${f.by}` : ''}{f.note ? ` · ${f.note}` : ''}</Typography>
                  </Box>
                ))}
              </Stack>
            </Section>
          ) : null}
          {canFixPrice ? (
            <Button variant="outlined" color="warning" onClick={() => setFixing(true)} sx={{ alignSelf: 'flex-start' }}>
              Fix a price
            </Button>
          ) : null}
        </Stack>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title={tr('historySection')}>
            {card.isLoading ? <CircularProgress size={20} /> : <Timeline rows={history} empty={tr('nothingToday')} />}
          </Section>
          {c?.register || c?.member ? (
            <Section title={tr('links')}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {c.register ? (
                  <Button size="small" variant="outlined" onClick={() => openObject({ type: 'register', id: c.register!.id })}>
                    {c.register.name}
                  </Button>
                ) : null}
                {c.member ? (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => openObject({ type: 'member', id: c.member!.person_id })}
                  >
                    {tr('memberLink')}: {c.member.name}
                  </Button>
                ) : null}
              </Stack>
            </Section>
          ) : null}
        </Stack>
      </Box>
      {canFixPrice ? (
        <PriceFixDialog
          open={fixing}
          cart={cart}
          memberName={c?.member?.name ?? null}
          blocked={new Set([...returned, ...fixedLines])}
          onClose={() => setFixing(false)}
          onDone={() => {
            refresh();
            void qc.invalidateQueries({ queryKey: ['member-window'] });
            void qc.invalidateQueries({ queryKey: ['thriftplus', 'money'] });
          }}
        />
      ) : null}
    </Stack>
  );
}
