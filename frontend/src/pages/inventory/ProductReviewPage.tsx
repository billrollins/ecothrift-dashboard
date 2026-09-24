import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  MenuItem,
  Pagination,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import {
  decideProductReview,
  fetchProductReview,
  type ProductReviewDecision,
  type ProductReviewRow,
} from '../../api/productReview.api';
import { formatCurrencyWhole } from '../../utils/format';

const QUERY_KEY = ['inventory', 'product-review'] as const;

/** Where the two AI models landed, in a few words. */
export function reviewReason(row: ProductReviewRow): string {
  const second = row.second_opinion?.category;
  if (second && second !== row.proposed.category) {
    return `Models disagree: second opinion says ${second}`;
  }
  if (row.proposed.flags?.includes('vague_title')) return 'Title too vague to be sure';
  return `Confidence ${row.confidence || 'unknown'}`;
}

function ReviewCard({
  row,
  categories,
  onDecide,
  busy,
}: {
  row: ProductReviewRow;
  categories: string[];
  onDecide: (body: ProductReviewDecision) => void;
  busy: boolean;
}) {
  const [category, setCategory] = useState(row.proposed.category ?? '');
  const [subcategory, setSubcategory] = useState(row.proposed.subcategory ?? '');
  const [shortName, setShortName] = useState(row.proposed.short_name ?? '');
  const edited =
    category !== (row.proposed.category ?? '') ||
    subcategory !== (row.proposed.subcategory ?? '') ||
    shortName !== (row.proposed.short_name ?? '');

  return (
    <Card variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
        <Box sx={{ flex: 2, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap title={row.title}>
            {row.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {row.brand} · sold {formatCurrencyWhole(row.dollars)} · {reviewReason(row)}
          </Typography>
        </Box>
        <TextField
          select
          size="small"
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          sx={{ flex: 1.2, minWidth: 180 }}
        >
          {categories.map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="Subcategory"
          value={subcategory}
          onChange={(e) => setSubcategory(e.target.value)}
          sx={{ flex: 1, minWidth: 140 }}
        />
        <TextField
          size="small"
          label="Short name"
          value={shortName}
          onChange={(e) => setShortName(e.target.value.slice(0, 28))}
          helperText={`${shortName.length}/28`}
          sx={{ flex: 1.2, minWidth: 180 }}
        />
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            size="small"
            disabled={busy}
            onClick={() =>
              onDecide(
                edited
                  ? { action: 'fix', category, subcategory, short_name: shortName }
                  : { action: 'accept' }
              )
            }
          >
            {edited ? 'Save' : 'Accept'}
          </Button>
          <Tooltip title="Reject: leave this product's profile as it is.">
            <span>
              <Button size="small" disabled={busy} onClick={() => onDecide({ action: 'reject' })}>
                Reject
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Stack>
    </Card>
  );
}

/** Inventory > Product review: AI category and short-name proposals a person should check, biggest dollars first. */
export default function ProductReviewPage() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading, isError } = useQuery({
    queryKey: [...QUERY_KEY, page, category],
    queryFn: () => fetchProductReview({ page, category: category || undefined }),
  });
  const decide = useMutation({
    mutationFn: ({ productId, body }: { productId: number; body: ProductReviewDecision }) =>
      decideProductReview(productId, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: () => enqueueSnackbar('Could not save that decision.', { variant: 'error' }),
  });

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, maxWidth: 1400 }}>
      <Typography variant="h5" fontWeight={700}>
        Product review
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        AI proposed these categories and price-tag names but was not sure. Accept, fix, or reject. What you choose is
        kept as a person&apos;s answer and never overwritten by AI. Rules: product taxonomy rulebook.
      </Typography>
      {isError ? <Alert severity="error">Could not load the review queue.</Alert> : null}
      {data ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
          <Chip label={`${data.count.toLocaleString()} to review`} />
          <TextField
            select
            size="small"
            label="Proposed category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">All</MenuItem>
            {data.by_category.map((c) => (
              <MenuItem key={c.category} value={c.category}>
                {c.category} ({formatCurrencyWhole(c.dollars)})
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      ) : null}
      {isLoading ? <Typography>Loading…</Typography> : null}
      <Stack spacing={1}>
        {data?.results.map((row) => (
          <ReviewCard
            key={`${row.product_id}-${row.proposed.category}-${row.proposed.short_name}`}
            row={row}
            categories={data.categories}
            busy={decide.isPending}
            onDecide={(body) => decide.mutate({ productId: row.product_id, body })}
          />
        ))}
      </Stack>
      {data && data.count > data.page_size ? (
        <Pagination
          sx={{ mt: 2 }}
          page={page}
          count={Math.ceil(data.count / data.page_size)}
          onChange={(_e, p) => setPage(p)}
        />
      ) : null}
      {data && data.count === 0 ? <Alert severity="success">Nothing waiting for review.</Alert> : null}
    </Box>
  );
}
