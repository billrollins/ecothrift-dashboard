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
import { useIncludeTestPreference } from '../../../../hooks/useIncludeTestPreference';
import { includeTestApiParam } from '../../../../utils/delivery/includeTestPreference';

export default function FieldTotalDeliveriesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [includeTest] = useIncludeTestPreference();
  const q = searchParams.get('q') || '';
  const [draft, setDraft] = useState(q);
  const params = useMemo(
    () => ({
      search: q || undefined,
      page_size: 30,
      include_test: includeTestApiParam(includeTest),
    }),
    [q, includeTest],
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
              {job.is_test && (
                <Chip size="small" color="warning" label="TEST" sx={{ mt: 0.5 }} />
              )}
            </CardContent>
          </Card>
        ))}
        {!isLoading && rows.length === 0 && (
          <Typography color="text.secondary">
            {includeTest
              ? 'No deliveries found.'
              : 'No deliveries found. Tap Test in the bottom bar to show [TEST] data.'}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
