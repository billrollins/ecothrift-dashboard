/**
 * The Transactions window (Retail 2, Bill 2026-11-02): the sales of one register, drawer, Thrift+ membership or
 * cashier, over a day or a range. Numbers on top, newest sale first, a row opens the Sale window.
 * Opens from anywhere with `openObject({ type: 'history', id: historyKey({...}) })`.
 */
import { useMemo, useState } from 'react';
import {
  Box, Button, ButtonBase, Chip, CircularProgress, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { addDays, format, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { useCartSummary, useCarts } from '../../../hooks/usePOS';
import type { Cart } from '../../../types/pos.types';
import { IconBack } from '../../../icons/ecoIcons';
import { useObjectModal } from '../../objects/ObjectModal';
import { Section, Stat } from '../../objects/windowParts';
import { MemberName } from '../../thriftplus/MemberName';
import { parseHistoryKey } from './historyScope';
import { money, useRetailCopy, type CopyKey } from './retailCopy';

const PAGE = 25;
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const day = (s: string) => new Date(`${s}T12:00:00`);

function presets(): { key: CopyKey; from: string; to: string }[] {
  const today = new Date();
  return [
    { key: 'today', from: ymd(today), to: ymd(today) },
    { key: 'yesterday', from: ymd(subDays(today, 1)), to: ymd(subDays(today, 1)) },
    { key: 'thisWeekBtn', from: ymd(startOfWeek(today, { weekStartsOn: 1 })), to: ymd(today) },
    { key: 'thisMonth', from: ymd(startOfMonth(today)), to: ymd(today) },
    { key: 'all', from: '', to: '' },
  ];
}

export function TransactionsWindow({ scopeKey }: { scopeKey: string }) {
  const scope = useMemo(() => parseHistoryKey(scopeKey), [scopeKey]);
  const { tr, paid, when } = useRetailCopy();
  const { openObject, closeObject } = useObjectModal();
  const navigate = useNavigate();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [from, setFrom] = useState(scope.from ?? '');
  const [to, setTo] = useState(scope.to ?? '');
  const [shown, setShown] = useState(PAGE);

  const filters = useMemo(() => {
    const p: Record<string, string | number> = { status: 'all' };
    if (scope.register != null) p.register = scope.register;
    if (scope.drawer != null) p.drawer = scope.drawer;
    if (scope.member != null) p.member = scope.member;
    if (scope.cashier != null) p.cashier = scope.cashier;
    if (from) p.date_from = from;
    if (to) p.date_to = to;
    return p;
  }, [scope, from, to]);
  const { data: summary } = useCartSummary(filters);
  const { data, isLoading, isFetching } = useCarts(
    { ...filters, page: 1, page_size: shown },
    { placeholderData: keepPreviousData },
  );
  // The list API's own Cart type is loose; the rows are full sales (types/pos.types).
  const rows = (data?.results ?? []) as unknown as Cart[];
  const oneDay = Boolean(from) && from === to;
  const setRange = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
    setShown(PAGE);
  };
  const step = (n: number) => {
    const next = ymd(addDays(day(from), n));
    setRange(next, next);
  };
  const range = oneDay ? when(`${from}T12:00:00`, 'EEEE MMM d')
      : `${from ? when(`${from}T12:00:00`, 'MMM d') : '…'} - ${to ? when(`${to}T12:00:00`, 'MMM d') : '…'}`;

  const receipt = (c: Cart) => c.receipt?.receipt_number ?? `#${c.id}`;
  // A member's own history does not repeat their name on every row.
  const showMember = scope.member == null;
  const member = (c: Cart) => (showMember ? c.thrift_row?.member ?? '' : '');
  const at = (c: Cart) => c.completed_at ?? c.created_at;

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack spacing={1}>
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 18, md: 22 }, lineHeight: 1.2 }}>
          {scope.title ?? tr('transactions')}
        </Typography>
        {(from || to) && <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          {oneDay && (
            <Tooltip title={tr('prevDay')}>
              <IconButton size="small" aria-label={tr('prevDay')} onClick={() => step(-1)}><IconBack fontSize="small" /></IconButton>
            </Tooltip>
          )}
          <Typography sx={{ fontWeight: 700, fontSize: 15, mr: 0.5 }}>{range}</Typography>
          {oneDay && to < ymd(new Date()) && (
            <Tooltip title={tr('nextDay')}>
              <IconButton size="small" aria-label={tr('nextDay')} onClick={() => step(1)}>
                <IconBack fontSize="small" sx={{ transform: 'scaleX(-1)' }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>}
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {presets().map((p) => {
            const on = from === p.from && to === p.to;
            return (
              <Chip key={p.key} size="small" label={tr(p.key)} clickable color={on ? 'primary' : 'default'}
                variant={on ? 'filled' : 'outlined'} onClick={() => setRange(p.from, p.to)} />
            );
          })}
        </Stack>
        <Stack direction="row" spacing={{ xs: 2, md: 3 }} sx={{ pt: 0.5 }} flexWrap="wrap" useFlexGap>
          <Stat label={tr('total')} value={summary ? money(summary.total) : '…'} />
          <Stat label={tr('sales')} value={summary?.count ?? '…'} muted />
          <Stat label={tr('average')} value={summary ? money(summary.average) : '…'} muted />
          {!!summary?.voided_count && <Stat label={tr('voided')} value={summary.voided_count} muted />}
          {!!summary?.thrift_count && scope.member == null && <Stat label={tr('thriftSales')} value={summary.thrift_count} muted />}
        </Stack>
      </Stack>

      <Section title={tr('sales')} action={isFetching ? <CircularProgress size={14} /> : undefined}>
        {isLoading ? (
          <CircularProgress size={24} sx={{ m: 2 }} />
        ) : rows.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{tr('noSales')}</Typography>
        ) : phone ? (
          <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
            {rows.map((c) => (
              <ButtonBase key={c.id} onClick={() => openObject({ type: 'sale', id: c.id })}
                sx={{ display: 'block', textAlign: 'left', py: 1, px: 0.5, minHeight: 48 }}>
                <Stack direction="row" spacing={1} alignItems="baseline">
                  <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600 }} noWrap>
                    {when(at(c), oneDay ? 'h:mm a' : 'MMM d, h:mm a')} · {receipt(c)}
                  </Typography>
                  {c.status === 'voided' && <Chip size="small" label={tr('voided')} color="error" variant="outlined" />}
                  <Typography sx={{ fontWeight: 800, fontSize: 15 }}>{money(c.total)}</Typography>
                </Stack>
                <Typography sx={{ fontSize: 13, color: 'text.secondary' }} noWrap>
                  {[c.cashier_name, paid(c.payment_method), member(c)].filter(Boolean).join(' · ')}
                </Typography>
              </ButtonBase>
            ))}
          </Stack>
        ) : (
          <Table size="small" sx={{ '& td, & th': { px: 1 } }}>
            <TableHead>
              <TableRow>
                <TableCell>{tr('time')}</TableCell>
                <TableCell>{tr('receipt')}</TableCell>
                <TableCell>{tr('cashier')}</TableCell>
                <TableCell>{tr('how')}</TableCell>
                {showMember && <TableCell>{tr('member')}</TableCell>}
                <TableCell align="right">{tr('total')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} hover onClick={() => openObject({ type: 'sale', id: c.id })} sx={{ cursor: 'pointer' }}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{when(at(c), oneDay ? 'h:mm a' : 'MMM d, h:mm a')}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {receipt(c)}
                    {c.status === 'voided' && <Chip size="small" label={tr('voided')} color="error" variant="outlined" sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>{c.covering_for_name ? `${c.cashier_name ?? ''} (${c.covering_for_name})` : c.cashier_name}</TableCell>
                  <TableCell>{paid(c.payment_method)}</TableCell>
                  {showMember && <TableCell><MemberName personId={c.thrift_row?.person_id}>{member(c)}</MemberName></TableCell>}
                  <TableCell align="right" sx={{ fontWeight: 700, textDecoration: c.status === 'voided' ? 'line-through' : undefined }}>
                    {money(c.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {(data?.count ?? 0) > rows.length && (
          <Button size="small" sx={{ mt: 1 }} onClick={() => setShown((n) => n + PAGE)} disabled={isFetching}>
            {tr('showMore')} ({rows.length}/{data?.count})
          </Button>
        )}
      </Section>

      <Box>
        <Button size="small" variant="outlined" onClick={() => { closeObject(); navigate('/pos/transactions'); }}>
          {tr('transactionsPage')}
        </Button>
      </Box>
    </Stack>
  );
}
