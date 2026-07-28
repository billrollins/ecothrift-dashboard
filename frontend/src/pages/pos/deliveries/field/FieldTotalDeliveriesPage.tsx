import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useDeliveriesSearch } from '../../../../hooks/useDelivery';

export default function FieldTotalDeliveriesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const [draft, setDraft] = useState(q);
  const params = useMemo(
    () => ({
      search: q || undefined,
      page_size: 30,
      ...(import.meta.env.DEV ? { include_test: '1' as const } : {}),
    }),
    [q],
  );
  const { data, isLoading } = useDeliveriesSearch(params);
  const rows = data?.results ?? [];

  return (
    <Box>
      <TextField
        fullWidth
        size="medium"
        label="Search deliveries"
        placeholder="Name, phone, address, SKU, receipt…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const next = new URLSearchParams(searchParams);
            if (draft.trim()) next.set('q', draft.trim());
            else next.delete('q');
            setSearchParams(next, { replace: true });
          }
        }}
        sx={{ mb: 2 }}
      />
      {isLoading && <Typography color="text.secondary">Searching…</Typography>}
      <Stack spacing={1}>
        {rows.map((job) => (
          <Card key={job.id} variant="outlined">
            <CardContent sx={{ py: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography fontWeight={700}>{job.customer_name}</Typography>
                <Chip size="small" label={job.status} />
              </Stack>
              <Typography variant="body2">{job.phone}</Typography>
              <Typography variant="body2" color="text.secondary">
                {job.delivery_address || job.address}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {job.scheduled_date || 'Unscheduled'} · {job.item_count} items
              </Typography>
            </CardContent>
          </Card>
        ))}
        {!isLoading && rows.length === 0 && (
          <Typography color="text.secondary">No deliveries found.</Typography>
        )}
      </Stack>
    </Box>
  );
}
