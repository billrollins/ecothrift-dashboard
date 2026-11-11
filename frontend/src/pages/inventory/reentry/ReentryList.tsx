import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  IconButton,
  InputAdornment,
  Link,
  Paper,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ClearRounded from '@mui/icons-material/ClearRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import PrintRounded from '@mui/icons-material/PrintRounded';
import {
  findReentry,
  listReentries,
  type ReentryDone,
  type ReentryFound,
  type ReentryList as ReentryListData,
  type ReentryRow,
  type ReentrySource,
} from '../../../api/reentry.api';
import { ObjectLink } from '../../../components/objects/ObjectModal';
import { useIsPhoneDevice } from '../../../components/photos/photoMethods';
import { formatCurrency } from '../../../utils/format';
import { skuFromScan } from '../../../utils/scanCode';
import { ReentryActionPanel, type StagedAction } from './ReentryActionPanel';
import { apiErrorMessage } from '../../../utils/apiError';
import { printReentryTag } from './printReentryTag';
import {
  cameBackLine,
  dayTime,
  filterRows,
  hasTagToPrint,
  nextStepLine,
  outcomeLine,
  soldLine,
  SOURCE_WORDS,
  UNDO_SECONDS,
} from './reentry';

type Printed = 'printing' | 'printed' | 'failed' | 'none';
/** The one line under the find box: what just happened to an item, or a few plain words from the page. */
type Note = { done: ReentryDone; printed: Printed } | { text: string; tone?: 'success' | 'warning' };

const PAGE_PATH: Record<ReentrySource, string> = { return: '/inventory/returns', floor: '/inventory/floor-issues' };

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
      {row.sale ? (
        <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {`${sold} · `}
          <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
            {'Receipt '}
            <ObjectLink type="sale" id={row.sale.cart} label={row.sale.receipt_number} title="Open the sale" />
          </Box>
        </Typography>
      ) : null}
      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
        {cameBackLine(row)}
      </Typography>
      {row.reason ? (
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{`Why: ${row.reason}`}</Typography>
      ) : null}
    </Box>
  );
}

/** What was typed, a moment after the typing stops (so a lookup is not sent for every letter). */
function useSettled(value: string, ms = 350): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * Under the find box when what was scanned or typed is not waiting on this page: look the item up and say what is
 * true of it. Not a real item number; waiting on the other page; already handled (with what was done); or a real
 * item that is simply not on the list, which the page may offer to add (`offer`).
 */
function NotOnList({
  typed,
  source,
  offer,
  onDone = false,
  onShowWaiting,
}: {
  typed: string;
  source: ReentrySource;
  offer?: (found: ReentryFound) => ReactNode;
  /** On the Done view: an item still waiting here is offered with a tap to Waiting. */
  onDone?: boolean;
  onShowWaiting?: () => void;
}) {
  const words = SOURCE_WORDS[source];
  const code = skuFromScan(typed).trim();
  const settled = useSettled(code);
  const looksLikeTag = code.length >= 4 && !/\s/.test(code) && /\d/.test(code);
  const lookup = useQuery({
    queryKey: ['reentry-find', source, settled.toLowerCase()],
    queryFn: () => findReentry(settled, source),
    enabled: looksLikeTag && settled === code,
    retry: false,
    staleTime: 5_000,
  });
  const found = looksLikeTag && settled === code ? lookup.data : undefined;
  const name = found ? `${found.item.product_title || found.item.sku} (${found.item.sku})` : '';
  const where = onDone ? `on Done for ${words.page}` : `waiting on ${words.page}`;

  let head: ReactNode;
  let body: ReactNode = null;
  if (!looksLikeTag) {
    head = <Typography color="text.secondary">{`Nothing ${where} matches that.`}</Typography>;
    body = <Typography variant="body2" color="text.secondary">To look an item up, scan its tag or type its whole item number.</Typography>;
  } else if (found) {
    head = (
      <Typography sx={{ fontWeight: 800 }}>
        {name}
        <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
          {` · Tag ${formatCurrency(found.item.price)}${found.item.status_label ? ` · ${found.item.status_label}` : ''}`}
        </Box>
      </Typography>
    );
    if (found.row && found.row.source === source) {
      body = (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mt: 0.5 }}>
          <Typography variant="body2">{`It is waiting on ${words.page}.`}</Typography>
          <Button variant="outlined" size="small" onClick={onShowWaiting} sx={{ minHeight: 40 }}>Show it in Waiting</Button>
        </Box>
      );
    } else if (found.row) {
      const other = SOURCE_WORDS[found.row.source].page;
      body = (
        <Typography variant="body2">
          {`It is waiting on ${other}. `}
          <Link component={RouterLink} to={PAGE_PATH[found.row.source]} sx={{ fontWeight: 700 }}>{`Go to ${other}`}</Link>
        </Typography>
      );
    } else {
      const last = found.last;
      body = (
        <>
          {last ? (
            <Typography variant="body2">
              {`Already handled. ${outcomeLine(last)}`}
              {[last.decided_by, dayTime(last.decided_at)].filter(Boolean).length
                ? ` (${[last.decided_by, dayTime(last.decided_at)].filter(Boolean).join(', ')})` : ''}
              {`. It is on Done for ${SOURCE_WORDS[last.source].page}.`}
            </Typography>
          ) : (
            <Typography variant="body2">{`It is not ${where}.`}</Typography>
          )}
          {found.item.status === 'scrapped' ? (
            <Typography variant="body2" color="text.secondary">It was scrapped, so it is out of stock.</Typography>
          ) : offer ? offer(found) : null}
        </>
      );
    }
  } else if (lookup.isError && settled === code) {
    head = <Typography sx={{ fontWeight: 800 }}>{`No item has the number ${code}.`}</Typography>;
    body = <Typography variant="body2">Check the tag and scan it again.</Typography>;
  } else {
    head = <Typography color="text.secondary">Looking it up.</Typography>;
  }

  return (
    <Box sx={{ minHeight: 150 }} data-testid="reentry-not-on-list">
      {head}
      {body}
    </Box>
  );
}

/** Back to shelf as is or Scrap, tapped and not saved yet: the line counts down with Undo. */
type Pending = StagedAction & { left: number };

/**
 * The one list of items back in Processing (D14): the Returns page shows `source="return"`, the Floor issues page
 * `source="floor"`. Each waiting row carries the four actions (`ReentryActionPanel`); when one is done the row leaves
 * the list at once, its tag prints, and the line under the find box says what happened and where the item goes.
 *
 * The find box and that line sit in a bar that stays at the top of the screen while the list scrolls under it. The
 * line has its own fixed spot, so it is always in view, never covers a row, and nothing moves when it changes.
 * Back to shelf as is and Scrap wait `UNDO_SECONDS` with Undo before they save (`undoSeconds`; tests pass 0); leaving
 * the page or starting another saves a waiting one at once.
 *
 * Done shows the last ones decided, with who and when, and how many today. A scan finds the item either way: on
 * Waiting a real item that is not waiting says what is true of it, and `offer` draws the page's offer (Returns: add
 * it; `say` puts a few words on the line); on Done an item still waiting is one tap from Waiting. `rowLead` draws left
 * of a row's lines (Floor issues: the report's photo).
 */
export function ReentryList({
  source,
  offer,
  rowLead,
  undoSeconds = UNDO_SECONDS,
}: {
  source: ReentrySource;
  offer?: (found: ReentryFound, say: (text: string) => void) => ReactNode;
  rowLead?: (row: ReentryRow) => ReactNode;
  undoSeconds?: number;
}) {
  const words = SOURCE_WORDS[source];
  const queryClient = useQueryClient();
  const phone = useIsPhoneDevice();
  const findRef = useRef<HTMLInputElement | null>(null);
  const [show, setShow] = useState<'waiting' | 'done'>('waiting');
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<Note | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;
  const done = show === 'done';
  const query = useQuery({
    queryKey: ['reentries', source, done],
    queryFn: () => listReentries(source, done),
    refetchInterval: done ? false : 30_000,
  });
  const all = (query.data?.results ?? []).filter((r) => !done ? r.id !== pending?.row.id : true);
  const rows = filterRows(all, typed);
  const waitingNow = query.data?.waiting[source];
  const waiting = waitingNow != null && pending ? Math.max(0, waitingNow - 1) : waitingNow;
  const today = query.data?.done_today?.[source];

  // A scan shortens the list to one row and the scroll bar would go, sliding the whole page sideways: keep its place.
  useEffect(() => {
    const main = findRef.current?.closest('main');
    if (!main) return undefined;
    const before = main.style.scrollbarGutter;
    main.style.scrollbarGutter = 'stable';
    return () => { main.style.scrollbarGutter = before; };
  }, []);

  // A scanner types into whatever holds the cursor: on a computer that is the find box, on open and after each item.
  const toFindBox = () => { if (!phone) findRef.current?.focus(); };
  // After a window closes: once it has finished closing, which would otherwise hand the cursor back to the button.
  const toFindBoxSoon = () => { window.setTimeout(toFindBox, 320); };

  async function print(result: ReentryDone) {
    setNote({ done: result, printed: 'printing' });
    const ok = await printReentryTag(result.item);
    setNote((now) => (now && 'done' in now && now.done.row.id === result.row.id ? { done: result, printed: ok ? 'printed' : 'failed' } : now));
  }

  function handleDone(result: ReentryDone, { keepFind = false }: { keepFind?: boolean } = {}) {
    if (!keepFind) setTyped('');
    // The row leaves now, not when the list is next asked for.
    queryClient.setQueryData<ReentryListData>(['reentries', source, false], (old) => (old ? {
      ...old,
      waiting: { ...old.waiting, [source]: Math.max(0, old.waiting[source] - 1) },
      results: old.results.filter((r) => r.id !== result.row.id),
    } : old));
    void queryClient.invalidateQueries({ queryKey: ['reentries'] });
    void queryClient.invalidateQueries({ queryKey: ['reentry-find'] });
    if (hasTagToPrint(result)) void print(result);
    else setNote({ done: result, printed: 'none' });
    if (!keepFind) toFindBox();
  }

  // Save a waiting Back to shelf as is or Scrap now. A refusal puts the row back and says why.
  async function commit(staged: Pending) {
    setPending((now) => (now?.row.id === staged.row.id ? null : now));
    try {
      // It saves seconds after the tap; by then the person may have scanned the next item. Leave the find box alone.
      handleDone(await staged.save(), { keepFind: true });
    } catch (err) {
      setNote({ text: `${staged.row.item.product_title || staged.row.item.sku}: ${apiErrorMessage(err, 'That did not save. Try again.')}`, tone: 'warning' });
      void queryClient.invalidateQueries({ queryKey: ['reentries'] });
    }
  }

  function later(staged: StagedAction) {
    const before = pendingRef.current;
    if (before) void commit(before);
    setTyped('');
    setNote(null);
    if (undoSeconds <= 0) { void commit({ ...staged, left: 0 }); return; }
    setPending({ ...staged, left: undoSeconds });
    toFindBox();
  }

  // The countdown: one second at a time, then it saves.
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setTimeout(() => {
      if (pending.left <= 1) void commit(pending);
      else setPending((now) => (now && now.row.id === pending.row.id ? { ...now, left: now.left - 1 } : now));
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  // Leaving the page with one still counting down saves it, as the person meant.
  useEffect(() => () => {
    const staged = pendingRef.current;
    if (staged) void staged.save().then(() => queryClient.invalidateQueries({ queryKey: ['reentries'] })).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function undo() {
    const staged = pendingRef.current;
    if (!staged) return;
    setPending(null);
    setNote({ text: `${staged.row.item.product_title || staged.row.item.sku}: undone. Nothing was saved; it is back on the list.` });
    toFindBox();
  }

  function type(next: string) {
    // A new scan starts the next item: the line about the last one has been read. A tag that did not print stays.
    if (note && !pending && !('done' in note)) setNote(null);
    else if (!typed && next && note && !('done' in note && note.printed === 'failed') && !pending) setNote(null);
    setTyped(next);
  }

  // The scan stays in the find box, so the item just added is the one row on screen.
  const say = (text: string) => { setNote({ text }); };

  const showWaiting = () => { setShow('waiting'); setNote(null); };

  let line: { tone: 'success' | 'warning' | 'info'; title: string; text: string; reprint?: ReentryDone; undo?: boolean } | null = null;
  if (pending) {
    line = {
      tone: 'info',
      title: `${pending.row.item.product_title || pending.row.item.sku} (${pending.row.item.sku})`,
      text: `${pending.what}. Saving in ${pending.left} s. A slip? Tap Undo.`,
      undo: true,
    };
  } else if (note && 'done' in note) {
    const { done: last, printed } = note;
    const printedWords = printed === 'printing' ? 'Printing the tag. ' : printed === 'printed' ? 'Tag printed. ' : '';
    line = {
      tone: printed === 'failed' ? 'warning' : 'success',
      title: `${last.item.product_title || last.item.sku} (${last.item.sku})`,
      text: printed === 'failed'
        ? `${outcomeLine(last.row)}. The tag did not print. Check the printer, then tap Print tag again.`
        : `${outcomeLine(last.row)}. ${printedWords}${nextStepLine(last)}`,
      reprint: hasTagToPrint(last) && printed !== 'printing' ? last : undefined,
    };
  } else if (note) {
    line = { tone: note.tone ?? 'success', title: '', text: note.text };
  }

  const LINE_COLORS = {
    success: { bg: 'success.dark', fg: '#fff' },
    warning: { bg: 'warning.dark', fg: '#fff' },
    info: { bg: 'grey.800', fg: '#fff' },
  } as const;

  return (
    <Stack spacing={1.5}>
      {/* The bar: stays at the top of the screen while the list scrolls under it. */}
      <Box
        sx={{
          position: 'sticky', top: 0, zIndex: 3, bgcolor: 'background.default',
          mx: { xs: -1, sm: -2 }, px: { xs: 1, sm: 2 }, pt: 1, pb: 1,
          borderBottom: 1, borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <TextField
            size="small"
            label="Find an item"
            placeholder={phone ? 'Scan or type a tag or a name' : 'Scan a tag, or type a name or item number'}
            value={typed}
            onChange={(e) => type(e.target.value)}
            // Enter (a scanner sends one) marks what is in the box, so the next scan replaces it. Escape clears.
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).select(); }
              if (e.key === 'Escape' && typed) { e.preventDefault(); setTyped(''); }
            }}
            inputRef={findRef}
            autoFocus={!phone}
            sx={{ flex: 1, minWidth: 220, maxWidth: 460 }}
            slotProps={{
              inputLabel: { shrink: true },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      edge="end"
                      aria-label="Clear the find box"
                      onClick={() => { setTyped(''); findRef.current?.focus(); }}
                      sx={{ visibility: typed ? 'visible' : 'hidden' }}
                    >
                      <ClearRounded fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              },
              htmlInput: {
                'aria-label': `Find on ${words.page}`, spellCheck: false, autoComplete: 'off', autoCapitalize: 'off', autoCorrect: 'off',
              },
            }}
          />
          <ToggleButtonGroup
            size="small"
            exclusive
            value={show}
            onChange={(_e, next) => { if (next) { setShow(next); if (!pending) setNote(null); } }}
            aria-label="Which ones to show"
            sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 700, px: 1.75, minHeight: 40 } }}
          >
            <ToggleButton value="waiting">{waiting != null ? `Waiting (${waiting})` : 'Waiting'}</ToggleButton>
            <ToggleButton value="done">{today != null ? `Done today (${today})` : 'Done'}</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* The line's own spot: one fixed height, whatever it says. */}
        <Box sx={{ mt: 1, height: { xs: 104, sm: 56 }, display: 'flex' }} role="status" aria-live="polite">
          {line ? (
            <Box
              data-testid="reentry-last-line"
              sx={{
                flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 1, pl: 1.5, pr: 0.5, borderRadius: 1.5,
                color: LINE_COLORS[line.tone].fg, bgcolor: LINE_COLORS[line.tone].bg,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {line.title ? <Typography noWrap sx={{ fontWeight: 800, lineHeight: 1.3, fontSize: { xs: 14, sm: 15 } }}>{line.title}</Typography> : null}
                <Typography
                  variant="body2"
                  sx={{ lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: { xs: line.title ? 4 : 5, sm: line.title ? 1 : 2 }, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {line.text}
                </Typography>
              </Box>
              {line.undo ? (
                <Button
                  size="small"
                  variant="contained"
                  onClick={undo}
                  sx={{ bgcolor: '#fff', color: 'grey.900', fontWeight: 800, flexShrink: 0, minHeight: 40, '&:hover': { bgcolor: 'grey.100' } }}
                >
                  Undo
                </Button>
              ) : null}
              {line.reprint ? (
                phone ? (
                  <IconButton
                    aria-label="Print tag again"
                    onClick={() => { if (line?.reprint) void print(line.reprint); }}
                    sx={{ color: '#fff', flexShrink: 0, width: 44, height: 44, border: '1px solid rgba(255,255,255,0.7)' }}
                  >
                    <PrintRounded />
                  </IconButton>
                ) : (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => { if (line?.reprint) void print(line.reprint); }}
                    sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap', flexShrink: 0, minHeight: 40, '&:hover': { borderColor: '#fff' } }}
                  >
                    Print tag again
                  </Button>
                )
              ) : null}
              {line.undo ? null : (
                <IconButton aria-label="Close this line" onClick={() => setNote(null)} sx={{ color: '#fff', flexShrink: 0, width: 44, height: 44 }}>
                  <CloseRounded />
                </IconButton>
              )}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
              {done
                ? `The last ones handled on ${words.page}, newest first.`
                : 'What you do to an item shows here: what happened, and where the item goes.'}
            </Typography>
          )}
        </Box>
      </Box>

      {query.isError ? <Alert severity="error">The list did not load. Try again in a moment.</Alert> : null}
      {query.isLoading ? <Skeleton variant="rounded" height={112} /> : null}

      {!query.isLoading && !query.isError && rows.length === 0 ? (
        typed.trim() ? (
          <NotOnList
            typed={typed}
            source={source}
            onDone={done}
            onShowWaiting={showWaiting}
            offer={offer && !done ? (found) => offer(found, say) : undefined}
          />
        ) : (
          <Typography color="text.secondary">{done ? words.emptyDone : words.empty}</Typography>
        )
      ) : null}

      {rows.map((row) => (
        <Paper key={row.id} variant="outlined" sx={{ p: 1.5 }} data-testid={`reentry-row-${row.id}`}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 1.5, alignItems: { lg: 'center' }, justifyContent: 'space-between' }}>
            <Box sx={{ minWidth: 0, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              {rowLead ? rowLead(row) : null}
              <ItemLines row={row} />
            </Box>
            {done ? (
              <Box sx={{ textAlign: { lg: 'right' }, flexShrink: 0, maxWidth: { lg: 420 } }}>
                <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{outcomeLine(row)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {[row.decided_by, dayTime(row.decided_at)].filter(Boolean).join(' · ')}
                </Typography>
                {row.restoration_job ? (
                  <ObjectLink type="restoration" id={row.restoration_job} label="Open the Restoration job" />
                ) : null}
              </Box>
            ) : (
              <Box sx={{ flexShrink: 0 }}>
                <ReentryActionPanel row={row} onDone={(r) => handleDone(r)} onLater={later} onWindowClosed={toFindBoxSoon} />
              </Box>
            )}
          </Box>
        </Paper>
      ))}
    </Stack>
  );
}
