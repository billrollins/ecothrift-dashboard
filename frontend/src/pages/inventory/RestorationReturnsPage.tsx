import PrintIcon from '@mui/icons-material/Print';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { processingPatchItem } from '../../api/inventory.api';
import {
  restorationReturnsQueryKey,
  useMarkRestorationJobHandled,
  useRestorationReturns,
} from '../../hooks/useRestorationBench';
import type { RestorationJobDTO } from '../../types/inventory.types';
import { printProcessingLabelsAndMarkPrinted } from './processing/printProcessingLabel';

function returnedAt(job: RestorationJobDTO): string | null {
  return job.dispositioned_at ?? job.returned_at ?? null;
}

function achievedGrade(job: RestorationJobDTO): string {
  return job.final_grade || job.return_grade || '—';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '—';
}

function ReturnRow({ job }: { job: RestorationJobDTO }) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const markHandled = useMarkRestorationJobHandled();
  const [price, setPrice] = useState(job.price ?? '');
  const [printing, setPrinting] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);

  useEffect(() => {
    setPrice(job.price ?? '');
  }, [job.price]);

  const labelItems = useMemo(
    () =>
      job.items.map((it) => ({
        id: it.id,
        sku: it.sku,
        price: price || job.price || '',
        product_title: job.name,
        product_brand: job.brand,
        product_number: job.product_number,
      })),
    [job, price],
  );

  const skuLabel = job.items.length
    ? job.items.map((it) => it.sku).join(', ')
    : (job.sku ?? '—');

  const handlePrint = async () => {
    if (!labelItems.length) {
      enqueueSnackbar('No items to print for this return.', { variant: 'warning' });
      return;
    }
    setPrinting(true);
    try {
      const result = await printProcessingLabelsAndMarkPrinted(labelItems, price || undefined);
      if (result.failed > 0) {
        enqueueSnackbar(
          `Printed ${result.succeeded}, failed ${result.failed}. Check the label printer.`,
          { variant: 'warning' },
        );
      } else {
        enqueueSnackbar(`Printed ${result.succeeded} tag(s).`, { variant: 'success' });
      }
    } catch (err) {
      enqueueSnackbar(
        err instanceof Error ? err.message : 'Could not print tags. Check the label printer.',
        { variant: 'error' },
      );
    } finally {
      setPrinting(false);
    }
  };

  const handleSavePrice = async () => {
    const trimmed = price.trim();
    if (!trimmed) {
      enqueueSnackbar('Enter a price first.', { variant: 'warning' });
      return;
    }
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      enqueueSnackbar('Enter a valid price of 0 or more.', { variant: 'warning' });
      return;
    }
    setSavingPrice(true);
    try {
      await Promise.all(job.items.map((it) => processingPatchItem(it.id, { price: trimmed })));
      await queryClient.invalidateQueries({ queryKey: restorationReturnsQueryKey });
      enqueueSnackbar('Price saved.', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(
        err instanceof Error ? err.message : 'Could not save price.',
        { variant: 'error' },
      );
    } finally {
      setSavingPrice(false);
    }
  };

  const handleMarkHandled = async () => {
    try {
      await markHandled.mutateAsync(job.id);
      enqueueSnackbar('Marked handled — removed from returns.', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(
        err instanceof Error ? err.message : 'Could not mark handled.',
        { variant: 'error' },
      );
    }
  };

  return (
    <TableRow hover>
      <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{skuLabel}</TableCell>
      <TableCell>
        <Typography variant="body2" fontWeight={700} noWrap title={job.name}>
          {job.name || '—'}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {job.purchase_order_number ?? ''}
        </Typography>
      </TableCell>
      <TableCell>
        <Chip
          size="small"
          color="success"
          variant="outlined"
          label={achievedGrade(job)}
          sx={{ fontWeight: 700 }}
        />
        {job.scale ? (
          <Typography variant="caption" color="text.secondary" display="block">
            {job.scale}
          </Typography>
        ) : null}
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(returnedAt(job))}</TableCell>
      <TableCell>
        <TextField
          size="small"
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputProps={{ min: 0, step: 0.01 }}
          sx={{ width: 120 }}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            },
          }}
        />
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={0.75} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PrintIcon fontSize="small" />}
            disabled={printing}
            onClick={() => void handlePrint()}
          >
            Print tag
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={savingPrice}
            onClick={() => void handleSavePrice()}
          >
            Set price
          </Button>
          <Button
            size="small"
            variant="contained"
            disabled={markHandled.isPending}
            onClick={() => void handleMarkHandled()}
          >
            Mark handled
          </Button>
        </Stack>
      </TableCell>
    </TableRow>
  );
}

export default function RestorationReturnsPage() {
  const { data: returns = [], isLoading } = useRestorationReturns();

  return (
    <Box sx={{ p: 2 }}>
      <PageHeader
        title="Restoration Returns"
        subtitle="Items finished in restoration and sent back to Processing — print tags, set prices, then mark handled"
      />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : returns.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">
            Nothing waiting. Items dispositioned from restoration to Processing show up here.
          </Typography>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>SKU</TableCell>
                <TableCell>Product</TableCell>
                <TableCell>Achieved grade</TableCell>
                <TableCell>Returned</TableCell>
                <TableCell>Price</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {returns.map((job) => (
                <ReturnRow key={job.id} job={job} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
