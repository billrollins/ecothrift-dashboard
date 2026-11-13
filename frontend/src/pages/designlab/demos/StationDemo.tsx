/**
 * Page type: Station (modelled on the restoration bench: TarsWorkstation, BenchPaneHeader, benchScale; also the
 * register and the count). Made-up data. What makes it this type:
 *  - full screen, one job, no page scroll: a grid whose panes scroll on their own;
 *  - the deck: a dark band across the top (deep green, never jet black) holding the thing being worked: its ID, its
 *    name, its facts, and the station's big command keys;
 *  - panes with a fixed-height header (a small label, a value, one action) and a body that scrolls; lists are grid rows
 *    with a coloured left edge by kind, not tables;
 *  - six type sizes only (label 11, meta 12, body 13, value 14, title 20, figure 24), fixed slots so nothing moves;
 *  - big touch targets for the actions that end the job (Hold, Reject, Finish).
 * On a phone everything stacks in one column and the deck grows to fit.
 */
import { Box, Button, ButtonBase, IconButton, MenuItem, Select, Snackbar, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useState, type ReactNode } from 'react';
import { type Tone } from '../../../components/page/PageKit';
import { useMarkKitPage } from '../../../components/page/kitSignal';
import { Fact, MicroLabel, Pane, PaneBody, PaneHeader } from '../../../components/page/RichKit';
import { ECO_ICONS } from '../../../icons/ecoIcons';

const I = ECO_ICONS;
const GRADES = ['As is', 'Fair', 'Good', 'Like new'];
const GRADE_VALUE: Record<string, number> = { 'As is': 149, Fair: 229, Good: 349, 'Like new': 459 };
const LOG: { when: string; who: string; mins: number; kind: 'work' | 'part' | 'test' | 'note'; text: string }[] = [
  { when: '2:41 pm', who: 'Marcus', mins: 25, kind: 'work', text: 'Re-stitched the right arm seam, 4 in' },
  { when: '2:10 pm', who: 'Marcus', mins: 10, kind: 'part', text: 'Fitted the grey patch kit (PO-1187)' },
  { when: '1:55 pm', who: 'Marcus', mins: 15, kind: 'work', text: 'Cleaned all cushions, enzyme spray' },
  { when: '1:30 pm', who: 'Dana', mins: 5, kind: 'test', text: 'Frame checked: solid, no wobble' },
  { when: '11:02 am', who: 'Dana', mins: 0, kind: 'note', text: 'From processing: torn arm, otherwise clean' },
  { when: 'Nov 12', who: 'System', mins: 0, kind: 'note', text: 'Sent to the bench from truck T-418' },
];
const KIND_TONE: Record<string, Tone> = { work: 'good', part: 'info', test: 'wait', note: 'quiet' };
const PARTS = [
  { name: 'Fabric patch kit, grey', cost: 22, state: 'Fitted' },
  { name: 'Upholstery thread', cost: 9.4, state: 'Fitted' },
  { name: 'Cushion zipper, 24 in', cost: 6.5, state: 'Ordered' },
];

function DeckBox({ children, grow }: { children: ReactNode; grow?: number }) {
  return (
    <Box sx={(t) => ({ flex: grow ?? 1, minWidth: 0, p: 1.5, borderRadius: '10px', bgcolor: t.palette.deck?.raised, border: `1px solid ${alpha(t.palette.deck?.ink ?? '#fff', 0.1)}` })}>
      {children}
    </Box>
  );
}

function Key({ label, hint, tone, onClick }: { label: string; hint: string; tone: Tone; onClick: () => void }) {
  const theme = useTheme();
  const c = tone === 'quiet' ? theme.palette.deck?.label ?? '#ccc' : theme.palette[{ good: 'success', wait: 'warning', problem: 'error', info: 'info' }[tone] as 'success'].main;
  return (
    <ButtonBase onClick={onClick} sx={{ height: 44, px: 1.5, borderRadius: '10px', justifyContent: 'space-between', width: '100%', border: `1.5px solid ${alpha(c, 0.8)}`, bgcolor: alpha(c, 0.18), color: 'deck.ink', '&:hover': { bgcolor: alpha(c, 0.3) } }}>
      <Typography sx={{ fontWeight: 800, fontSize: '0.875rem' }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.75rem', color: 'deck.label', fontFamily: 'ui-monospace, Consolas, monospace' }}>{hint}</Typography>
    </ButtonBase>
  );
}

export function StationDemo() {
  useMarkKitPage();
  const theme = useTheme();
  const [orig, setOrig] = useState('As is');
  const [cur, setCur] = useState('Good');
  const [toast, setToast] = useState('');
  const added = GRADE_VALUE[cur] - GRADE_VALUE[orig];
  const left = GRADE_VALUE['Like new'] - GRADE_VALUE[cur];
  const toneColor = (t: Tone) => (t === 'quiet' ? theme.palette.grey[400] : theme.palette[{ good: 'success', wait: 'warning', problem: 'error', info: 'info' }[t] as 'success'].main);

  return (
    <Box sx={{ height: { md: 'calc(100vh - 64px)' }, p: 0.75, display: 'grid', gap: 0.75, bgcolor: 'grey.100',
      gridTemplateColumns: { xs: '1fr', lg: 'minmax(400px, 46%) minmax(0, 1fr)' }, gridTemplateRows: { xs: 'auto', lg: 'auto minmax(0, 1fr) minmax(0, 1fr)' } }}>
      {/* The deck */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.75}
        sx={(t) => ({ gridColumn: '1 / -1', p: 0.75, borderRadius: '12px', bgcolor: t.palette.deck?.main, backgroundImage: `linear-gradient(180deg, ${t.palette.deck?.raised}, ${t.palette.deck?.main})`, minHeight: { lg: 184 } })}>
        <DeckBox grow={1.4}>
          <Typography sx={{ fontFamily: 'ui-monospace, Consolas, monospace', fontWeight: 800, color: 'deck.accent', fontSize: '0.8125rem' }}>ITM0205040 · RST-2231</Typography>
          <Typography noWrap sx={{ fontWeight: 800, fontSize: '1.25rem', color: 'deck.ink', mb: 1 }}>Grey 3-seat sofa, torn arm</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', rowGap: 0.75 }}>
            <Fact onDeck label="Truck" value="T-418" mono />
            <Fact onDeck label="Retail" value="$899" />
            <Fact onDeck label="On bench" value="1 day" />
            <Fact onDeck label="Bench" value="Bench 2" />
            <Fact onDeck label="Tech" value="Marcus" />
            <Fact onDeck label="Parts" value="$37.90" />
          </Box>
        </DeckBox>
        <DeckBox>
          <MicroLabel sx={{ color: 'deck.label' }}>Grade: original to current</MicroLabel>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ my: 1 }}>
            {[{ v: orig, set: setOrig }, { v: cur, set: setCur }].map((g, i) => (
              <Stack key={i} direction="row" alignItems="center" spacing={1} sx={{ flex: 1 }}>
                {i === 1 ? <Box sx={(t) => ({ width: 28, height: 3, borderRadius: 2, backgroundImage: `linear-gradient(90deg, ${t.palette.warning.main}, ${t.palette.success.main})` })} /> : null}
                <Select size="small" value={g.v} onChange={(e) => g.set(e.target.value)} fullWidth
                  sx={(t) => ({
                    fontWeight: 800, bgcolor: alpha(t.palette.deck?.ink ?? '#fff', 0.06),
                    '& .MuiSelect-select': { color: t.palette.deck?.ink, fontWeight: 800 },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: alpha(t.palette.deck?.ink ?? '#fff', 0.3) },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(t.palette.deck?.ink ?? '#fff', 0.6) },
                    '& .MuiSvgIcon-root': { color: t.palette.deck?.label },
                  })}>
                  {GRADES.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}
                </Select>
              </Stack>
            ))}
          </Stack>
          <Stack direction="row" spacing={3}>
            <Box><MicroLabel sx={{ color: 'deck.label' }}>Value added</MicroLabel><Typography sx={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '1.5rem', fontWeight: 800, color: 'deck.accent' }}>+${added}</Typography></Box>
            <Box><MicroLabel sx={{ color: 'deck.label' }}>Value left</MicroLabel><Typography sx={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '1.5rem', fontWeight: 800, color: 'deck.ink' }}>${left}</Typography></Box>
          </Stack>
        </DeckBox>
        <Stack spacing={0.75} sx={{ width: { md: 220 }, flexShrink: 0 }}>
          <Key label="Back to queue" hint="Q" tone="quiet" onClick={() => setToast('Back to the queue (demo)')} />
          <Key label="Hold" hint="H" tone="wait" onClick={() => setToast('On hold: waiting on the zipper (demo)')} />
          <Key label="Reject" hint="R" tone="problem" onClick={() => setToast('Rejected: goes back as is (demo)')} />
          <Key label="Finish" hint="F" tone="good" onClick={() => setToast('Finished: graded Good, to the floor (demo)')} />
        </Stack>
      </Stack>

      {/* Left column: grades, then parts */}
      <Pane>
        <PaneHeader kicker="Grades" value="What each grade is worth" action={<Button size="small">Edit scale</Button>} />
        <PaneBody>
          {GRADES.slice().reverse().map((g) => {
            const best = g === cur;
            return (
              <Stack key={g} direction="row" alignItems="center" sx={{ height: 40, px: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: best ? alpha(theme.palette.success.main, 0.08) : g === orig ? alpha(theme.palette.warning.main, 0.08) : undefined, boxShadow: best ? `inset 3px 0 0 ${theme.palette.success.main}` : undefined }}>
                <Typography sx={{ flex: 1, fontWeight: 700, fontSize: '0.875rem' }}>{g}</Typography>
                <Typography variant="caption" sx={{ width: 80 }}>{g === orig ? 'Original' : best ? 'Current' : ''}</Typography>
                <Typography sx={{ width: 70, textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>${GRADE_VALUE[g]}</Typography>
              </Stack>
            );
          })}
        </PaneBody>
      </Pane>

      {/* Right column: the work log, both rows */}
      <Pane sx={{ gridRow: { lg: '2 / 4' }, gridColumn: { lg: 2 } }}>
        <PaneHeader kicker="Work log" value={`${LOG.reduce((a, l) => a + l.mins, 0)} min`} meta="6 entries" action={<Button size="small" variant="contained" startIcon={<I.add />} onClick={() => setToast('Log work: the entry form opens here (demo)')}>Log work</Button>} />
        <PaneBody>
          {LOG.map((l, i) => (
            <Box key={i} sx={{ display: 'grid', gridTemplateColumns: '76px 64px 52px minmax(0, 1fr)', alignItems: 'center', minHeight: 38, px: 1.5, columnGap: 1, borderBottom: 1, borderColor: 'divider', bgcolor: i % 2 ? 'grey.50' : undefined, boxShadow: `inset 3px 0 0 ${toneColor(KIND_TONE[l.kind])}` }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{l.when}</Typography>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700 }}>{l.who}</Typography>
              <Typography sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>{l.mins ? `${l.mins}m` : ''}</Typography>
              <Typography sx={{ fontSize: '0.8125rem' }}>{l.text}</Typography>
            </Box>
          ))}
        </PaneBody>
      </Pane>

      <Pane>
        <PaneHeader kicker="Parts" value="$37.90" meta="3 lines" action={<IconButton size="small" aria-label="Add a part"><I.add fontSize="small" /></IconButton>} />
        <PaneBody>
          {PARTS.map((p) => (
            <Stack key={p.name} direction="row" alignItems="center" spacing={1} sx={{ minHeight: 40, px: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Typography sx={{ flex: 1, fontSize: '0.8125rem', fontWeight: 700 }} noWrap>{p.name}</Typography>
              <Box sx={{ px: 1, py: 0.25, borderRadius: '6px', bgcolor: 'grey.100', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.8125rem', fontWeight: 700 }}>${p.cost.toFixed(2)}</Box>
              <Typography variant="caption" sx={{ width: 64, fontWeight: 700, color: p.state === 'Ordered' ? 'info.dark' : 'success.dark' }}>{p.state}</Typography>
            </Stack>
          ))}
        </PaneBody>
      </Pane>
      <Snackbar open={Boolean(toast)} autoHideDuration={2500} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}
