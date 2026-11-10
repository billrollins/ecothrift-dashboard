import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Paper,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { listReentries, type ReentryDone, type ReentryRow, type ReentrySource } from '../../../api/reentry.api';
import { ObjectLink } from '../../../components/objects/ObjectModal';
import { formatCurrency } from '../../../utils/format';
import { ReentryActionPanel } from './ReentryActionPanel';
import { printReentryTag } from './printReentryTag';
import { cameBackLine, day, filterRows, hasTagToPrint, outcomeLine, soldLine, SOURCE_WORDS } from './reentry';

type Printed = 'printing' | 'printed' | 'failed' | 'none';

function ItemLines({ row }: { row: ReentryRow }) {
  const item = row.item;
  const sold = soldLine(row);
  return (
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography sx={{ fontWeight: 800, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
        {item.product_title || item.sku}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
        <ObjectLink type="item" id={item.id} label={item.sku} title={`Open item ${item.sku}`} />
        {item.product_brand ? ` · ${item.product_brand}` : ''}
        {` · Tag ${formatCurrency(item.price)}`}
        {item.retail && Number(item.retail) > 0 ? ` · Retail ${formatCurrency(item.retail)}` : ''}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
        {cameBackLine(row)}
        {sold ? ` · ${sold}` : ''}
        {row.sale ? <>{' · '}<ObjectLink type="sale" id={row.sale.cart} label={row.sale.receipt_number} title="Open the sale" /></> : null}
      </Typography>
      {row.reason ? (
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{`Why: ${row.reason}`}</Typography>
      ) : null}
    </Box>
  );
}

/**
 * The one list of items back in Processing (D14): the Returns page shows `source="return"`, the Floor issues page
 * `source="floor"`. Each waiting row carries the four actions (`ReentryActionPanel`); when one is done the row leaves
 * the list, its tag prints, and a line on top says what happened (with Print tag again). Done shows the last ones
 * decided, with who and when. `notOnList` draws under the find box when what was scanned or typed matches no waiting
 * row (the Returns page offers to add the item). `rowExtra` draws under a row's lines (Floor issues: the photo).
 */
export function ReentryList({
  source,
  notOnList,
  rowExtra,
}: {
  source: ReentrySource;
  notOnList?: (typed: string, clear: () => void) => ReactNode;
  rowExtra?: (row: ReentryRow) => ReactNode;
}) {
  const words = SOURCE_WORDS[source];
  const queryClient = useQueryClient();
  const [show, setShow] = useState<'waiting' | 'done'>('waiting');
  const [typed, setTyped] = useState('');
  const [last, setLast] = useState<{ done: ReentryDone; printed: Printed } | null>(null);
  const done = show === 'done';
  const query = useQuery({
    queryKey: ['reentries', source, done],
    queryFn: () => listReentries(source, done),
    refetchInterval: done ? false : 30_000,
  });
  const all = query.data?.results ?? [];
  const rows = filterRows(all, typed);
  const waiting = query.data?.waiting[source];

  async function print(result: ReentryDone) {
    setLast({ done: result, printed: 'printing' });
    const ok = await printReentryTag(result.item);
    setLast((now) => (now && now.done.row.id === result.row.id ? { done: result, printed: ok ? 'printed' : 'failed' } : now));
  }

  function handleDone(result: ReentryDone) {
    setTyped('');
    void queryClient.invalidateQueries({ queryKey: ['reentries'] });
    if (hasTagToPrint(result)) void print(result);
    else setLast({ done: result, printed: 'none' });
  }

  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        <TextField
          size="small"
          label="Scan a tag or type to find it"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          sx={{ flex: 1, minWidth: 220, maxWidth: 420 }}
          slotProps={{ htmlInput: { 'aria-label': `Find on ${words.page}` } }}
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={show}
          onChange={(_e, next) => { if (next) setShow(next); }}
          aria-label="Which ones to show"
        >
          <ToggleButton value="waiting">{waiting != null ? `Waiting (${waiting})` : 'Waiting'}</ToggleButton>
          <ToggleButton value="done">Done</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {last ? (
        <Alert
          severity={last.printed === 'failed' ? 'warning' : 'success'}
          onClose={() => setLast(null)}
          action={hasTagToPrint(last.done) && last.printed !== 'printing' ? (
            <Button color="inherit" size="small" onClick={() => void print(last.done)}>Print tag again</Button>
          ) : undefined}
        >
          {`${last.done.item.product_title || last.done.item.sku} (${last.done.item.sku}): ${outcomeLine(last.done.row)}.`}
          {last.printed === 'printing' ? ' Printing the tag.' : ''}
          {last.printed === 'printed' ? ' Tag printed.' : ''}
          {last.printed === 'failed' ? ' The tag did not print. Check the printer, then print it again.' : ''}
        </Alert>
      ) : null}

      {query.isError ? <Alert severity="error">The list did not load. Try again in a moment.</Alert> : null}
      {query.isLoading ? <Skeleton variant="rounded" height={96} /> : null}

      {!query.isLoading && !query.isError && rows.length === 0 ? (
        typed.trim() && !done ? (
          <Box>
            <Typography color="text.secondary">{`Nothing waiting on ${words.page} matches that.`}</Typography>
            {notOnList ? notOnList(typed, () => setTyped('')) : null}
          </Box>
        ) : (
          <Typography color="text.secondary">{done ? words.emptyDone : words.empty}</Typography>
        )
      ) : null}

      {rows.map((row) => (
        <Paper key={row.id} variant="outlined" sx={{ p: 1.5 }} data-testid={`reentry-row-${row.id}`}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 1.5, alignItems: { lg: 'center' }, justifyContent: 'space-between' }}>
            <Box sx={{ minWidth: 0 }}>
              <ItemLines row={row} />
              {rowExtra ? rowExtra(row) : null}
            </Box>
            {done ? (
              <Box sx={{ textAlign: { lg: 'right' }, flexShrink: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{outcomeLine(row)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {[row.decided_by, day(row.decided_at)].filter(Boolean).join(' · ')}
                </Typography>
                {row.restoration_job ? (
                  <ObjectLink type="restoration" id={row.restoration_job} label="Open the Restoration job" />
                ) : null}
              </Box>
            ) : (
              <Box sx={{ flexShrink: 0, maxWidth: { lg: 560 } }}>
                <ReentryActionPanel row={row} onDone={handleDone} />
              </Box>
            )}
          </Box>
        </Paper>
      ))}
    </Stack>
  );
}
