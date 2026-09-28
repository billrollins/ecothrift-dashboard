import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { createCardBatch, fetchCardBackJobs, fetchCardBacksPdf, fetchCardBatches, markBatchPrinted } from '../../api/thriftplus.api';
import { localPrintService, type PrinterInfo } from '../../services/localPrintService';
import type { CardBatch } from '../../types/thriftplus.types';

const PRINTER_KEY = 'thriftplus.cardPrinter';

function savedPrinter(): string {
  try {
    return window.localStorage.getItem(PRINTER_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Blank cards: make a batch of codes, then print their backs (the numbered QR) on the stock
 * cards through the print server, 10 cards a job, and mark the batch printed.
 */
export default function CardBatchesTab() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [size, setSize] = useState('100');
  const [note, setNote] = useState('');
  const [printer, setPrinter] = useState(savedPrinter);
  const [printers, setPrinters] = useState<PrinterInfo[] | null>(null);
  const [printing, setPrinting] = useState<number | null>(null);
  const batches = useQuery({ queryKey: ['thriftplus', 'batches'], queryFn: fetchCardBatches });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['thriftplus', 'batches'] });

  const create = useMutation({
    mutationFn: () => createCardBatch(Number.parseInt(size, 10) || 0, note),
    onSuccess: () => { refresh(); setNote(''); enqueueSnackbar('Batch made. Print its backs next.', { variant: 'success' }); },
    onError: () => enqueueSnackbar('A batch is 1 to 500 cards.', { variant: 'error' }),
  });

  async function loadPrinters() {
    try {
      setPrinters(await localPrintService.listPrinters());
    } catch {
      enqueueSnackbar('The print server is not answering on this computer.', { variant: 'error' });
    }
  }

  async function print(batch: CardBatch) {
    setPrinting(batch.id);
    try {
      const { cards, jobs } = await fetchCardBackJobs(batch.id);
      for (let i = 0; i < jobs.length; i += 1) {
        const res = await localPrintService.printPdfCopies({
          pdf_base64: jobs[i], copies: 1, printer_name: printer || undefined, doc_name: `ThriftPlus-cards-${batch.id}-${i + 1}`,
        });
        if (!res.success) throw new Error(res.error || res.message);
      }
      await markBatchPrinted(batch.id);
      refresh();
      enqueueSnackbar(`Sent ${cards} card backs to ${printer || 'the default printer'}.`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(`Printing stopped: ${err instanceof Error ? err.message : 'print server error'}`, { variant: 'error' });
    } finally {
      setPrinting(null);
    }
  }

  async function download(batch: CardBatch) {
    const blob = await fetchCardBacksPdf(batch.id);
    window.open(URL.createObjectURL(blob), '_blank', 'noopener');
  }

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>New batch of blank cards</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
          <TextField size="small" label="Cards" value={size} onChange={(e) => setSize(e.target.value.replace(/\D/g, ''))} sx={{ width: 120 }} />
          <TextField size="small" label="Note" value={note} onChange={(e) => setNote(e.target.value)} sx={{ flex: 1 }} />
          <Button variant="contained" onClick={() => create.mutate()} disabled={create.isPending}>Make codes</Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>Card printer</Typography>
          {printers ? (
            <TextField
              select size="small" value={printer} sx={{ minWidth: 260 }}
              onChange={(e) => { setPrinter(e.target.value); try { window.localStorage.setItem(PRINTER_KEY, e.target.value); } catch { /* private window */ } }}
            >
              <MenuItem value="">Print server default</MenuItem>
              {printers.map((p) => <MenuItem key={p.name} value={p.name}>{p.name}</MenuItem>)}
            </TextField>
          ) : (
            <Button variant="outlined" onClick={() => void loadPrinters()}>{printer ? `Printer: ${printer}` : 'Choose the card printer'}</Button>
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Load the full-colour stock cards, then print. Backs go out 10 cards a job.
        </Typography>
      </Paper>

      {batches.data?.length === 0 ? <Alert severity="info">No batches yet.</Alert> : null}
      {batches.data?.length ? (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Batch</TableCell>
                <TableCell align="right">Cards</TableCell>
                <TableCell align="right">Blank</TableCell>
                <TableCell align="right">Given out</TableCell>
                <TableCell>Printed</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {batches.data.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>#{b.id}{b.note ? ` · ${b.note}` : ''}<Typography variant="caption" display="block" color="text.secondary">{format(parseISO(b.created_at), 'MMM d, yyyy')}</Typography></TableCell>
                  <TableCell align="right">{b.size}</TableCell>
                  <TableCell align="right">{b.unissued}</TableCell>
                  <TableCell align="right">{b.active}</TableCell>
                  <TableCell>{b.printed_at ? format(parseISO(b.printed_at), 'MMM d, h:mm a') : 'Not yet'}</TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      <Button size="small" onClick={() => void download(b)}>PDF</Button>
                      <Button size="small" variant="contained" disabled={printing !== null || !b.unissued} onClick={() => void print(b)}>
                        {printing === b.id ? 'Printing…' : 'Print backs'}
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}
    </Stack>
  );
}
