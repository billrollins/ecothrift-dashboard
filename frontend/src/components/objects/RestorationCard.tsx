/**
 * The Restoration job window (Dash Updates #14): one bench job, read-only, built like the Item window. Header (photo,
 * job number with copy, stage, the product, the item's SKU), Done price, Value added, Bench time and Sold for; what
 * Processing asked for; the work (grades, bench, grade prices, each action); the job's history; links to the item,
 * product, order and check-in. "Edit" opens the job on the Restoration page, where the bench work happens.
 * Data: GET /api/inventory/restoration-jobs/<id>/card/ (apps/inventory/services/restoration_card.py).
 */
import { Box, Button, Chip, CircularProgress, Divider, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { IconEdit } from '../../icons/ecoIcons';
import { restorationOverviewPath } from '../../pages/restoration/restorationRoutes';
import { gradePrices, minutes } from './ItemCard';
import { itemCardMoney, itemCardWhen } from './itemCardData';
import { useObjectModal } from './ObjectModal';
import { CopyId, Facts, Section, Stat, Timeline, type TimelineRow } from './windowParts';

export interface RestorationCardData {
  id: number;
  stage: string;
  stage_label: string;
  scale: string;
  starting_grade: string;
  final_grade: string;
  bench_owner: string;
  intended_destination: string;
  bench_disposition: string;
  grade_values: Record<string, unknown>;
  queue_note: string;
  pending_reason: string;
  pending_notes: string;
  disposition_notes: string;
  return_reason: string;
  return_notes: string;
  active_seconds: number;
  spent_parts_cost: string | null;
  value_added: string | null;
  actions: { grade: string; category: string; description: string; seconds: number }[];
  title: string;
  brand: string;
  model: string;
  product_id: number | null;
  photo_url: string | null;
  item: { id: number; sku: string; status: string; status_label: string; price: string | null; sold_for: string | null; sold_at: string | null } | null;
  order: { id: number; order_number: string } | null;
  check_in_id: number | null;
  request: { needs: string[]; found_needs: string[]; done_price: string | null; as_is_prices: Record<string, unknown>; value_at_stake: string | null; holdout: boolean };
  history: { type: string; at: string | null; who: string }[];
}

/** The job's history in words, in one place. */
const EVENT: Record<string, string> = {
  'processing.checked_in': 'Back to Processing', 'job.checked_in': 'Taken to the bench', 'job.moved_to_queue': 'Back in the queue',
  'job.reopened': 'Reopened', 'grade.claimed': 'Grade set', 'action.started': 'Work started', 'work.performed': 'Work done',
  'test.added': 'Tested', 'hold.placed': 'On hold', 'hold.resumed': 'Off hold', 'note.added': 'Note',
  'note.queue_changed': 'Queue note changed', 'plan.estimated': 'Estimated', 'plan.estimate_changed': 'Estimate changed',
  'parts.order_requested': 'Parts asked for', 'parts.order_withdrawn': 'Parts request withdrawn',
  'condition.current_grade.set': 'Condition graded', 'disposition.completed': 'Finished',
};
const DOT: Record<string, string> = { 'disposition.completed': '#2e7d32', 'hold.placed': '#ef6c00', 'parts.order_requested': '#0277bd' };
const NEED: Record<string, string> = { test: 'Test', clean: 'Clean', assemble: 'Assemble', repair: 'Repair', check_parts: 'Check parts' };

export function RestorationCardBody({ jobId }: { jobId: number }) {
  const { openObject, closeObject } = useObjectModal();
  const navigate = useNavigate();
  const { data: c, isLoading, isError } = useQuery({
    queryKey: ['restoration-card', jobId],
    queryFn: async () => (await api.get<RestorationCardData>(`/inventory/restoration-jobs/${jobId}/card/`)).data,
    staleTime: 15_000,
  });
  if (isLoading) return <CircularProgress size={28} sx={{ m: 4 }} />;
  if (isError || !c) return <Typography sx={{ p: 3 }}>This restoration job could not be loaded.</Typography>;
  const go = (path: string) => {
    closeObject();
    navigate(path);
  };
  const brandModel = [c.brand !== 'Generic' ? c.brand : '', c.model].filter(Boolean).join(' · ');
  const needs = (list: string[]) => list.map((n) => NEED[n] ?? n).join(', ');
  const asIs = Object.entries(c.request.as_is_prices).filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ')} ${itemCardMoney(String(v))}`).join(' · ');
  const history: TimelineRow[] = c.history.map((e, i) => ({
    key: `${e.type}-${i}`, label: EVENT[e.type] ?? e.type, detail: null,
    when: `${itemCardWhen(e.at)}${e.who ? ` · ${e.who}` : ''}`, dot: DOT[e.type] ?? '#757575',
  }));
  const sold = c.item?.status === 'sold' && c.item.sold_for;

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'flex-start' }}>
        <Stack direction="row" spacing={{ xs: 1.5, md: 2.5 }} alignItems="flex-start" sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ width: { xs: 88, md: 120 }, height: { xs: 88, md: 120 }, flexShrink: 0, borderRadius: 2, overflow: 'hidden', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {c.photo_url ? <Box component="img" src={c.photo_url} alt={c.title} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>No photo</Typography>}
          </Box>
          <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <CopyId value={`R-${c.id}`} label="Copy job number" />
              <Chip size="small" label={c.stage_label} color={c.stage === 'done' ? 'success' : 'info'} variant="outlined" sx={{ fontWeight: 700 }} />
              {c.request.holdout ? <Chip size="small" label="Hold-out" color="warning" variant="outlined" /> : null}
              {c.item ? <Button size="small" sx={{ fontFamily: 'monospace', minWidth: 0 }} onClick={() => openObject({ type: 'item', id: c.item!.id })}>{c.item.sku}</Button> : null}
            </Stack>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: 18, md: 22 }, lineHeight: 1.2 }}>{c.title || 'Restoration job'}</Typography>
            {brandModel ? <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>{brandModel}</Typography> : null}
            <Stack direction="row" spacing={{ xs: 2, md: 3 }} sx={{ pt: 0.5 }} flexWrap="wrap" useFlexGap>
              <Stat label="Done price" value={itemCardMoney(c.request.done_price)} />
              <Stat label="Value added" value={itemCardMoney(c.value_added)} muted />
              <Stat label="Bench time" value={minutes(c.active_seconds) ?? '-'} muted />
              {sold ? <Stat label="Sold for" value={itemCardMoney(c.item!.sold_for)} /> : null}
            </Stack>
          </Stack>
        </Stack>
        <Button variant="contained" startIcon={<IconEdit fontSize="small" />} onClick={() => go(restorationOverviewPath(c.id, c.item?.sku))} sx={{ flexShrink: 0 }}>
          Edit
        </Button>
      </Stack>

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.15fr) minmax(0, 1fr)' } }}>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="Asked for">
            <Facts rows={[
              ['Needs', needs(c.request.needs) || null],
              ['Found on the bench', needs(c.request.found_needs) || null],
              ['Done price', c.request.done_price ? itemCardMoney(c.request.done_price) : null],
              ['As is', asIs || null],
              ['Value at stake', c.request.value_at_stake ? itemCardMoney(c.request.value_at_stake) : null],
              ['Queue note', c.queue_note],
              ['Waiting on', [c.pending_reason, c.pending_notes].filter(Boolean).join(' · ')],
            ]} />
          </Section>
          <Section title="Work">
            <Facts rows={[
              ['Scale', c.scale],
              ['Grade', [c.starting_grade, c.final_grade].filter(Boolean).join(' → ')],
              ['Grade prices', gradePrices(c.grade_values)],
              ['Bench', c.bench_owner],
              ['Meant for', c.intended_destination],
              ['Went to', c.bench_disposition],
              ['Parts cost', c.spent_parts_cost && Number(c.spent_parts_cost) > 0 ? itemCardMoney(c.spent_parts_cost) : null],
              ['Finish notes', c.disposition_notes],
              ['Sent back', [c.return_reason, c.return_notes].filter(Boolean).join(' · ')],
            ]} />
            {c.actions.length ? (
              <>
                <Divider sx={{ my: 1.25 }} />
                <Stack spacing={0.5}>
                  {c.actions.map((a, i) => (
                    <Typography key={i} sx={{ fontSize: 13 }}>
                      <b style={{ textTransform: 'capitalize' }}>{a.category}</b>
                      {a.grade ? ` · ${a.grade}` : ''}{a.description ? ` · ${a.description}` : ''}{a.seconds ? ` · ${minutes(a.seconds)}` : ''}
                    </Typography>
                  ))}
                </Stack>
              </>
            ) : null}
          </Section>
        </Stack>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <Section title="History"><Timeline rows={history} empty="Nothing recorded yet." /></Section>
          <Section title="Links">
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {c.item ? <Button size="small" variant="outlined" onClick={() => openObject({ type: 'item', id: c.item!.id })}>Item {c.item.sku}</Button> : null}
              {c.product_id != null ? <Button size="small" variant="outlined" onClick={() => openObject({ type: 'product', id: c.product_id! })}>Product</Button> : null}
              {c.order ? <Button size="small" variant="outlined" onClick={() => openObject({ type: 'order', id: c.order!.id })}>Order {c.order.order_number}</Button> : null}
              {c.check_in_id != null ? <Button size="small" variant="outlined" onClick={() => openObject({ type: 'checkin', id: c.check_in_id! })}>Check-in</Button> : null}
            </Stack>
          </Section>
        </Stack>
      </Box>
    </Stack>
  );
}
