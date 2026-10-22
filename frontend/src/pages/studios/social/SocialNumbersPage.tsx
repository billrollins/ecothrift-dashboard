/**
 * Social Studio → Numbers (`/studios/social/numbers`; in the phone app `/social/numbers`, from the Schedule).
 * Lane F Phase 5, apps/marketing/services/numbers.py.
 *
 * - **Numbers due:** posted posts still owed their 1-day or 7-day numbers; tap to type them.
 * - **Hits:** the posts of the last weeks by engagement; the averages by post type and by category.
 * - **Rough read:** post days against the same weekday (tickets and sales), and spotlight categories against the
 *   weeks before, each with how many it rests on. Not proof.
 * - **Spend:** the marketing ledger ($0 to start, owner call F3); the owner adds and removes.
 *
 * Desk: hits on the left, the read, groups and spend on the right. Phone: one column, what's due first.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  IconButton,
  Link,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  addSpend,
  deleteSpend,
  getNumbersPage,
  SPEND_KIND_LABELS,
  type HitGroup,
  type NumbersPage,
  type SalesRead,
  type SpendKind,
} from '../../../api/marketing.api';
import { ccTokens } from '../../../theme';
import { formatDay, pageSx, StudioHeader } from './socialParts';
import { useStudioPaths } from './studioPaths';

function errorText(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

/** "+12.5%" / "-3.0%" / "-". */
export function signedPct(value: string | null): string {
  if (value == null) return '-';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function Panel({ title, hint, children, action }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ p: 1.5, mb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: hint ? 0.25 : 1 }}>
        <Typography sx={{ fontWeight: 800, flex: 1 }}>{title}</Typography>
        {action}
      </Box>
      {hint ? <Typography sx={{ fontSize: 12.5, color: ccTokens.ink3, mb: 1 }}>{hint}</Typography> : null}
      {children}
    </Card>
  );
}

function Groups({ rows }: { rows: HitGroup[] }) {
  if (!rows.length) return <Typography sx={{ fontSize: 13, color: ccTokens.ink2 }}>Nothing posted yet.</Typography>;
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {rows.map((g) => (
        <Box component="li" key={g.key} sx={{ display: 'flex', gap: 1, py: 0.5, borderTop: `1px solid ${ccTokens.line}`, fontSize: 13.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>{g.label}</Box>
          <Box sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: ccTokens.ink2 }}>
            {g.avg_engagement != null ? `${g.avg_engagement} eng · ${g.avg_reach} reach` : 'no numbers'}
            {' '}<Typography component="span" sx={{ fontSize: 12, color: ccTokens.ink3 }}>({g.with_numbers} of {g.posts})</Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function Read({ read }: { read: SalesRead }) {
  if (!read.post_days && !read.spotlights.length) {
    return <Typography sx={{ fontSize: 13, color: ccTokens.ink2 }}>Not enough post days yet. It fills in as posts go out.</Typography>;
  }
  return (
    <Box>
      {read.post_days ? (
        <Typography sx={{ fontSize: 14 }}>
          Post days: tickets <b>{signedPct(read.ticket_lift)}</b>, sales <b>{signedPct(read.sales_lift)}</b> against the same
          weekday ({read.post_days} day{read.post_days === 1 ? '' : 's'}; the {read.baseline_weeks} weeks before, days without a post).
        </Typography>
      ) : null}
      {read.by_type.length ? (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 0.75, p: 0 }}>
          {read.by_type.map((r) => (
            <Box component="li" key={r.key} sx={{ display: 'flex', gap: 1, py: 0.4, borderTop: `1px solid ${ccTokens.line}`, fontSize: 13.5 }}>
              <Box sx={{ flex: 1 }}>{r.label}</Box>
              <Box sx={{ fontVariantNumeric: 'tabular-nums', color: ccTokens.ink2 }}>
                tickets {signedPct(r.ticket_lift)} · sales {signedPct(r.sales_lift)} <Typography component="span" sx={{ fontSize: 12, color: ccTokens.ink3 }}>({r.days})</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      ) : null}
      {read.spotlights.length ? (
        <>
          <Typography sx={{ fontWeight: 700, fontSize: 13.5, mt: 1.25 }}>Spotlights: the category's next 7 days</Typography>
          {read.spotlights.map((s) => (
            <Typography key={s.post_id} sx={{ fontSize: 13.5, color: ccTokens.ink2 }}>
              {formatDay(s.slot_date)} {s.category}: {s.sold_after} sold (${s.dollars_after}) against {s.sold_before_avg ?? '-'} a week
              before ({signedPct(s.change)}, {s.weeks_before} weeks)
            </Typography>
          ))}
        </>
      ) : null}
      <Typography sx={{ fontSize: 12, color: ccTokens.ink3, mt: 1 }}>
        A rough read, not proof: weather, sales, trucks and the season move these too, and a few posts are a small sample.
      </Typography>
    </Box>
  );
}

function SpendPanel({ data }: { data: NumbersPage }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [form, setForm] = useState({ day: data.today, kind: 'boost' as SpendKind, amount: '', note: '' });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['marketing', 'numbers'] });
  const add = useMutation({
    mutationFn: () => addSpend(form),
    onSuccess: () => { setForm((f) => ({ ...f, amount: '', note: '' })); refresh(); },
    onError: (err) => enqueueSnackbar(errorText(err, 'Could not add the spend.'), { variant: 'error' }),
  });
  const remove = useMutation({ mutationFn: (id: number) => deleteSpend(id), onSuccess: refresh });
  return (
    <Panel title="Spend" hint={`This week $${data.spend.week} · this month $${data.spend.month}. Boosts, print, events.`}>
      {data.can_spend ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '140px 1fr 110px' }, gap: 1, mb: 1 }}>
          <TextField size="small" type="date" label="Day" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select size="small" label="For" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as SpendKind })}>
            {(Object.keys(SPEND_KIND_LABELS) as SpendKind[]).map((k) => <MenuItem key={k} value={k}>{SPEND_KIND_LABELS[k]}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Amount $" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
          <TextField size="small" label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} sx={{ gridColumn: { xs: '1 / -1', sm: '1 / 3' } }} />
          <Button variant="contained" size="small" disabled={!form.amount || add.isPending} onClick={() => add.mutate()} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}>
            Add
          </Button>
        </Box>
      ) : null}
      {data.spend.rows.length ? (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {data.spend.rows.map((r) => (
            <Box component="li" key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.4, borderTop: `1px solid ${ccTokens.line}`, fontSize: 13.5 }}>
              <Box sx={{ width: 76, color: ccTokens.ink2 }}>{formatDay(r.day)}</Box>
              <Box sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{r.kind_label}{r.note ? ` · ${r.note}` : ''}</Box>
              <Box sx={{ fontVariantNumeric: 'tabular-nums' }}>${r.amount}</Box>
              {data.can_spend ? (
                <IconButton size="small" aria-label="Remove this spend" onClick={() => remove.mutate(r.id)}><DeleteOutlineRounded fontSize="small" /></IconButton>
              ) : null}
            </Box>
          ))}
        </Box>
      ) : (
        <Typography sx={{ fontSize: 13, color: ccTokens.ink2 }}>No spend yet ($0 to start).</Typography>
      )}
    </Panel>
  );
}

export default function SocialNumbersPage() {
  const theme = useTheme();
  const desk = useMediaQuery(theme.breakpoints.up('md'));
  const navigate = useNavigate();
  const paths = useStudioPaths();
  const [weeks, setWeeks] = useState(8);
  const query = useQuery({ queryKey: ['marketing', 'numbers', weeks], queryFn: () => getNumbersPage(weeks) });
  const data = query.data;

  const weeksPicker = (
    <ToggleButtonGroup exclusive size="small" value={weeks} onChange={(_e, v: number | null) => v && setWeeks(v)} aria-label="Weeks">
      {[4, 8, 13].map((w) => <ToggleButton key={w} value={w} sx={{ textTransform: 'none' }}>{w} wk</ToggleButton>)}
    </ToggleButtonGroup>
  );

  if (query.isLoading) return <Box sx={{ ...pageSx, display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>;
  if (!data) return <Box sx={pageSx}><Alert severity="error">The numbers did not load.</Alert></Box>;

  const due = (
    <Panel title="Numbers due" hint="Type them from the post's insights on Facebook.">
      {data.due.length ? data.due.map((d) => (
        <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, borderTop: `1px solid ${ccTokens.line}` }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{formatDay(d.slot_date)} · {d.post_type_label}</Typography>
            <Typography sx={{ fontSize: 12.5, color: ccTokens.ink2, overflowWrap: 'anywhere' }}>{d.hook}</Typography>
          </Box>
          {d.due.map((m) => <Chip key={m} size="small" color="warning" label={m === 1 ? '1 day' : '7 days'} />)}
          <Button size="small" onClick={() => navigate(paths.post(d.id))}>Type</Button>
        </Box>
      )) : <Typography sx={{ fontSize: 13, color: ccTokens.ink2 }}>All caught up.</Typography>}
    </Panel>
  );

  const hits = (
    <Panel title="Hits" hint={`Posts of the last ${data.weeks} weeks by engagement (the 7-day numbers when typed).`}>
      {!data.hits.length ? <Typography sx={{ fontSize: 13, color: ccTokens.ink2 }}>Nothing posted yet.</Typography> : desk ? (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Day</TableCell>
              <TableCell>Post</TableCell>
              <TableCell align="right">Reach</TableCell>
              <TableCell align="right">Engagement</TableCell>
              <TableCell align="right">Rating</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.hits.map((h) => (
              <TableRow key={h.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(paths.post(h.id))}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDay(h.slot_date)}</TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{h.post_type_label}{h.category ? ` · ${h.category}` : ''}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: ccTokens.ink2 }}>{h.hook}</Typography>
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{h.reach ?? '-'}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{h.engagement ?? '-'}{h.mark === 1 ? ' (1 day)' : ''}</TableCell>
                <TableCell align="right">{h.rating ?? '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        data.hits.map((h) => (
          <Box key={h.id} component="button" type="button" onClick={() => navigate(paths.post(h.id))} sx={{ display: 'block', width: '100%', textAlign: 'left', font: 'inherit', bgcolor: 'transparent', border: 0, borderTop: `1px solid ${ccTokens.line}`, py: 0.75, px: 0, cursor: 'pointer' }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{formatDay(h.slot_date)} · {h.post_type_label}</Typography>
              <Typography sx={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: ccTokens.ink2 }}>
                {h.engagement != null ? `${h.engagement} eng · ${h.reach} reach` : 'no numbers'}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 12.5, color: ccTokens.ink2 }}>{h.hook}</Typography>
          </Box>
        ))
      )}
    </Panel>
  );

  const groups = (
    <>
      <Panel title="By post type" hint="Average engagement and reach (posts with numbers, of all posted).">
        <Groups rows={data.by_type} />
      </Panel>
      <Panel title="By category">
        <Groups rows={data.by_category} />
      </Panel>
    </>
  );
  const read = (
    <Panel title="What moves sales" hint="Rough read">
      <Read read={data.read} />
    </Panel>
  );

  return (
    <Box sx={pageSx}>
      <StudioHeader title="Numbers" actions={weeksPicker} />
      {desk ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(340px, 1fr)', gap: 2, alignItems: 'start' }}>
          <Box sx={{ minWidth: 0 }}>{due}{hits}</Box>
          <Box sx={{ minWidth: 0 }}>{read}{groups}<SpendPanel data={data} /></Box>
        </Box>
      ) : (
        <Box>{due}{read}{hits}{groups}<SpendPanel data={data} /></Box>
      )}
      <Typography sx={{ fontSize: 12, color: ccTokens.ink3 }}>
        Numbers are typed from Facebook for now; they come in by themselves once the Meta app is set up.{' '}
        <Link component="button" type="button" onClick={() => navigate(paths.week)} sx={{ fontSize: 12 }}>Back to the week</Link>
      </Typography>
    </Box>
  );
}
