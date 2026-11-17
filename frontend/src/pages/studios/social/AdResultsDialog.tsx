/**
 * Ad results dump (Dash #182). The owner pastes a whole ad results page (Facebook "View results", select all), taps
 * Read it, and the AI fills one card: dates, budget, spend, goal, results, audience and the categories to watch. He
 * edits what he wants and saves. A paste for an ad already saved updates it. When no Studio post matches, the card
 * asks for the post photos (and the post text when the paste lacks it).
 *
 * The left column is the paste; the right column keeps its place before and after the read, so nothing moves.
 */
import { useState } from 'react';
import Close from '@mui/icons-material/Close';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import {
  Alert, Autocomplete, Box, Button, Card, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton,
  Stack, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getAddItemTaxonomy } from '../../../api/addItem.api';
import {
  AD_RESULT_FIELDS, AD_RESULT_LABELS, readAdPaste, saveAd, type AdDraft, type AdMatch, type AdRow,
} from '../../../api/marketing.api';
import { AddPhoto } from '../../../components/photos/AddPhoto';
import { PickedPhotos } from '../../../components/photos/PickedPhotos';
import { apiErrorDetail } from '../../../hooks/useProductSearch';
import { IconAiAssist } from '../../../icons/ecoIcons';
import {
  addRow, fromRows, shortKey, toRows, weightOptions, weightProblem, weightTotal, type WeightRow,
} from './adResultsModel';

const MAX_PHOTOS = 8;

function audienceLine(a: AdDraft['audience']): string {
  const parts: string[] = [];
  if (a.location) parts.push(a.location);
  if (a.age_min != null) parts.push(`ages ${a.age_min}${a.age_max != null && a.age_max < 65 ? `-${a.age_max}` : '-65+'}`);
  if (a.women_pct != null) parts.push(`${a.women_pct}% women`);
  if (a.men_pct != null) parts.push(`${a.men_pct}% men`);
  return parts.join(' · ');
}

export function AdResultsDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (ad: AdRow) => void }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const queryClient = useQueryClient();
  const [paste, setPaste] = useState('');
  const [draft, setDraft] = useState<AdDraft | null>(null);
  const [match, setMatch] = useState<AdMatch | null>(null);
  const [rows, setRows] = useState<WeightRow[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saved, setSaved] = useState<AdRow | null>(null);
  const taxonomy = useQuery({ queryKey: ['add-item-taxonomy'], queryFn: getAddItemTaxonomy, staleTime: Infinity, enabled: open });
  const options = weightOptions(taxonomy.data ?? []);

  const read = useMutation({
    mutationFn: () => readAdPaste(paste),
    onSuccess: (res) => {
      setDraft(res.draft);
      setMatch(res.match);
      setRows(toRows(res.draft.weights));
      setSaved(null);
    },
  });
  const save = useMutation({
    mutationFn: () => saveAd({ ...draft!, weights: fromRows(rows) }, match!, photos),
    onSuccess: (ad) => {
      setSaved(ad);
      setMatch((m) => (m ? { ...m, ad_id: ad.id } : m));
      setPhotos([]);
      void queryClient.invalidateQueries({ queryKey: ['owner', 'social'] });
      void queryClient.invalidateQueries({ queryKey: ['marketing', 'numbers'] });
      onSaved?.(ad);
    },
  });

  const set = <K extends keyof AdDraft>(key: K, value: AdDraft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const problem = weightProblem(rows);
  const blockers = draft ? [
    !draft.start ? 'The ad needs its start date.' : '',
    !draft.spent ? 'Type what the ad spent.' : '',
    problem,
  ].filter(Boolean) : [];
  const status = save.isError
    ? { tone: 'error.main', text: apiErrorDetail(save.error, 'The ad did not save. Try again.') }
    : saved && !save.isPending
      ? { tone: 'success.main', text: `Saved.${saved.read?.cost_per_extra_unit ? ` $${saved.read.cost_per_extra_unit} per extra unit so far.` : ''}` }
      : { tone: 'warning.dark', text: blockers[0] ?? '' };

  const small = (label: string, value: string, onChange: (v: string) => void, type = 'text') => (
    <TextField label={label} size="small" type={type} value={value} onChange={(e) => onChange(e.target.value)}
      slotProps={type === 'date' ? { inputLabel: { shrink: true } } : undefined} fullWidth />
  );

  return (
    <Dialog open={open} onClose={onClose} fullScreen={phone} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.25 }}>
        <Typography component="span" variant="h6" sx={{ fontWeight: 800, flex: 1 }}>Ad results</Typography>
        <IconButton aria-label="Close" onClick={onClose}><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '340px minmax(0, 1fr)' }, gap: 2 }}>
          <Stack spacing={1.25}>
            <TextField
              label="Paste the ad results page"
              placeholder="View results → select all → copy → paste here."
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              multiline
              minRows={phone ? 6 : 14}
              maxRows={phone ? 10 : 22}
              fullWidth
              autoFocus
              inputProps={{ 'data-testid': 'ad-paste' }}
            />
            <Button
              variant="contained"
              size="large"
              startIcon={read.isPending ? <CircularProgress size={16} color="inherit" /> : <IconAiAssist />}
              disabled={read.isPending || paste.trim().length < 20}
              onClick={() => read.mutate()}
            >
              {read.isPending ? 'Reading…' : 'Read it'}
            </Button>
            {read.isError ? <Alert severity="error">{apiErrorDetail(read.error, 'The AI could not read it. Try again.')}</Alert> : null}
          </Stack>

          <Card variant="outlined" sx={{ p: 1.5, minHeight: { md: 420 }, minWidth: 0 }}>
            {!draft ? (
              <Box sx={{ height: '100%', minHeight: 120, display: 'grid', placeItems: 'center' }}>
                <Typography color="text.secondary">The ad shows here.</Typography>
              </Box>
            ) : (
              <Stack spacing={1.5}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 800, flex: 1, minWidth: 0 }} noWrap>
                    {draft.ad_type || 'Boost'}
                  </Typography>
                  <Chip size="small" label={match?.ad_id ? 'Updates the saved ad' : 'New ad'} color={match?.ad_id ? 'default' : 'primary'} />
                  {match?.post_id ? <Chip size="small" variant="outlined" label={`Post: ${match.post_label}`} /> : null}
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(2, minmax(136px, 1.3fr)) repeat(2, minmax(0, 1fr))', lg: 'repeat(2, minmax(136px, 1.3fr)) repeat(2, minmax(0, 1fr)) minmax(0, 1.4fr)' }, gap: 1, '& > :last-child': { gridColumn: { xs: '1 / -1', lg: 'auto' } } }}>
                  {small('Start', draft.start ?? '', (v) => set('start', v || null), 'date')}
                  {small('End', draft.end ?? '', (v) => set('end', v || null), 'date')}
                  {small('Spent $', draft.spent ?? '', (v) => set('spent', v || null))}
                  {small('Daily budget $', draft.daily_budget ?? '', (v) => set('daily_budget', v || null))}
                  {small('Goal', draft.goal, (v) => set('goal', v))}
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' }, gap: 1 }}>
                  {AD_RESULT_FIELDS.map((f) => (
                    <TextField
                      key={f}
                      label={AD_RESULT_LABELS[f]}
                      size="small"
                      value={draft.results[f] ?? ''}
                      onChange={(e) => {
                        const n = e.target.value.replace(/[^\d]/g, '');
                        const next = { ...draft.results };
                        if (n) next[f] = Number(n); else delete next[f];
                        set('results', next);
                      }}
                      inputProps={{ inputMode: 'numeric' }}
                    />
                  ))}
                </Box>
                {audienceLine(draft.audience) ? (
                  <Typography variant="body2" color="text.secondary">Audience: {audienceLine(draft.audience)}</Typography>
                ) : null}

                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                    <Typography sx={{ fontWeight: 700, flex: 1 }}>Watch</Typography>
                    <Chip
                      size="small"
                      label="ALL"
                      color={rows.length ? 'default' : 'primary'}
                      variant={rows.length ? 'outlined' : 'filled'}
                      onClick={() => setRows([])}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      label={rows.length ? `${weightTotal(rows)}%` : 'Whole store'}
                      color={rows.length && problem ? 'error' : 'default'}
                    />
                  </Box>
                  <Stack spacing={0.75}>
                    {rows.map((row, i) => (
                      <Box key={i} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 84px 36px', gap: 0.75, alignItems: 'center' }}>
                        <Autocomplete
                          size="small"
                          options={options}
                          value={row.key || null}
                          onChange={(_, v) => setRows(rows.map((r, j) => (j === i ? { ...r, key: v ?? '' } : r)))}
                          getOptionLabel={(o) => o}
                          renderInput={(params) => <TextField {...params} label="Category" />}
                        />
                        <TextField
                          size="small"
                          label="%"
                          value={row.pct}
                          onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, pct: e.target.value.replace(/[^\d]/g, '') } : r)))}
                          inputProps={{ inputMode: 'numeric', 'aria-label': `Percent for ${shortKey(row.key) || 'category'}` }}
                        />
                        <IconButton size="small" aria-label="Remove category" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                          <Close fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Stack>
                  <Button size="small" sx={{ mt: 0.5 }} onClick={() => setRows(addRow(rows))}>Add category</Button>
                </Box>

                {match?.need_text ? (
                  <TextField
                    label="Post text"
                    value={draft.post_text}
                    onChange={(e) => set('post_text', e.target.value)}
                    multiline
                    minRows={2}
                    fullWidth
                    size="small"
                  />
                ) : (
                  <Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {draft.post_text}
                  </Typography>
                )}

                {match?.need_photos ? (
                  <Stack spacing={0.75}>
                    {photos.length ? (
                      <PickedPhotos
                        photos={photos}
                        disabled={save.isPending}
                        onRemove={(i) => setPhotos(photos.filter((_, j) => j !== i))}
                        onChange={(i, file) => setPhotos(photos.map((p, j) => (j === i ? file : p)))}
                      />
                    ) : null}
                    {photos.length < MAX_PHOTOS ? (
                      <AddPhoto
                        fullWidth
                        multiple
                        max={MAX_PHOTOS - photos.length}
                        startIcon={<PhotoCameraOutlined />}
                        onPhotos={(files) => setPhotos([...photos, ...files].slice(0, MAX_PHOTOS))}
                        usedWhere="Ad results"
                        usedOn="save"
                        disabled={save.isPending}
                        label={photos.length ? 'Add more post photos' : 'Drop the post photos (not in Dash yet)'}
                        sx={{ height: 44, borderStyle: 'dashed' }}
                      />
                    ) : null}
                  </Stack>
                ) : null}

                <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1 }}>
                  {/* One status slot, always there, so the buttons never move. */}
                  <Typography variant="body2" role="status" sx={{ flex: 1, minWidth: 0, minHeight: 20, fontWeight: 600, color: status.tone }}>
                    {status.text}
                  </Typography>
                  <Button onClick={onClose}>Close</Button>
                  <Button
                    variant="contained"
                    disabled={save.isPending || blockers.length > 0}
                    onClick={() => save.mutate()}
                    startIcon={save.isPending ? <CircularProgress size={16} color="inherit" /> : null}
                  >
                    {match?.ad_id ? 'Save changes' : 'Save ad'}
                  </Button>
                </Box>
              </Stack>
            )}
          </Card>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
