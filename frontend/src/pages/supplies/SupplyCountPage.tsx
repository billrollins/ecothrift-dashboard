/**
 * The weekly supply count for one list (owner, 2026-10-26). Phone-first: one big number box per item, last week's
 * count greyed beside it for reference only (never copied in). Every item needs a typed number, 0 if none. Counting
 * again before the deadline replaces the count. Desk: the same rows, two columns.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, LinearProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { getSupplyCount, submitSupplyCount, type CountItem } from '../../api/supplies.api';
import { PageHeader } from '../../components/common/PageHeader';
import { apiError, dayText, deadlineText, whenText } from './supplyBits';

function CountRow({ item, value, onChange, onEnter, inputRef, missing }: {
  item: CountItem; value: string; onChange: (v: string) => void; onEnter: () => void;
  inputRef: (el: HTMLInputElement | null) => void; missing: boolean;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderColor: missing ? 'error.main' : undefined }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, lineHeight: 1.25 }}>{item.name}</Typography>
        <Typography variant="body2" color="text.secondary">
          Count in {item.unit || 'each'}
          {item.last_count != null && <> · last time <Box component="span" sx={{ color: 'text.disabled' }}>{item.last_count}</Box></>}
        </Typography>
      </Box>
      <TextField
        inputRef={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
        error={missing}
        slotProps={{
          htmlInput: {
            inputMode: 'numeric', pattern: '[0-9]*', enterKeyHint: 'next', 'aria-label': `${item.name} on hand`,
            style: { fontSize: '1.5rem', textAlign: 'center', padding: '10px 8px' },
          },
        }}
        sx={{ width: 110, flexShrink: 0 }}
      />
    </Paper>
  );
}

export default function SupplyCountPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [values, setValues] = useState<Record<number, string>>({});
  const [tried, setTried] = useState(false);
  const refs = useRef<Record<number, HTMLInputElement | null>>({});
  const { data, isLoading, error } = useQuery({ queryKey: ['supplies', 'count', id], queryFn: () => getSupplyCount(id) });

  // Counting again starts from this week's numbers (never last week's).
  useEffect(() => {
    if (!data) return;
    const start: Record<number, string> = {};
    data.items.forEach((i) => { if (i.this_count != null) start[i.id] = String(i.this_count); });
    setValues(start);
  }, [data]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const missing = items.filter((i) => (values[i.id] ?? '') === '');
  const submit = useMutation({
    mutationFn: () => submitSupplyCount(id, items.map((i) => ({ item: i.id, on_hand: Number(values[i.id]) }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplies'] });
      enqueueSnackbar('Count saved. Thank you!', { variant: 'success' });
      navigate('/supplies');
    },
    onError: (err) => enqueueSnackbar(apiError(err, 'Could not save the count.'), { variant: 'error' }),
  });

  const next = (index: number) => {
    const after = items[index + 1];
    if (after) refs.current[after.id]?.focus();
  };
  const save = () => {
    setTried(true);
    if (missing.length) {
      refs.current[missing[0].id]?.focus();
      return;
    }
    submit.mutate();
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', pb: { xs: 12, md: 4 } }}>
      <PageHeader
        title={data ? `Count: ${data.list.name}` : 'Supply count'}
        subtitle={data ? `Due ${deadlineText(data.cycle.deadline)}` : undefined}
        action={<Button onClick={() => navigate(`/supplies/lists/${id}`)}>See the list</Button>}
      />
      {isLoading && <LinearProgress />}
      {error && <Alert severity="error">{apiError(error, 'Could not load the count.')}</Alert>}
      {data?.count && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Counted by {data.count.counted_by}, {whenText(data.count.submitted_at)}. Saving again replaces it.
        </Alert>
      )}
      {data && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Type how many are on hand for every item, 0 if none.
          {data.last_count_week && ` Grey numbers are the count for ${dayText(data.last_count_week)}, for reference.`}
        </Typography>
      )}
      <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        {items.map((item, index) => (
          <CountRow
            key={item.id}
            item={item}
            value={values[item.id] ?? ''}
            onChange={(v) => setValues((cur) => ({ ...cur, [item.id]: v }))}
            onEnter={() => next(index)}
            inputRef={(el) => { refs.current[item.id] = el; }}
            missing={tried && (values[item.id] ?? '') === ''}
          />
        ))}
      </Box>
      {data && (
        <Box
          sx={{
            position: { xs: 'fixed', md: 'static' }, left: 0, right: 0, bottom: 0, zIndex: 2, mt: { md: 2 },
            p: { xs: 1.5, md: 0 }, bgcolor: { xs: 'background.paper', md: 'transparent' },
            borderTop: { xs: 1, md: 0 }, borderColor: 'divider',
          }}
        >
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center', maxWidth: 1100, mx: 'auto' }}>
            <Typography variant="body2" color={missing.length ? 'text.secondary' : 'success.main'} sx={{ flex: 1 }}>
              {missing.length ? `${missing.length} of ${items.length} left` : 'All counted'}
            </Typography>
            <Button variant="contained" size="large" onClick={save} disabled={submit.isPending || !items.length}>
              Save count
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
}
