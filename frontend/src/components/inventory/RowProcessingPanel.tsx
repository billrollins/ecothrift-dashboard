import { useRef, useState } from 'react';
import { Alert, Box, Button, Typography } from '@mui/material';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import type { CleanupCsvApplyRowPayload, CleanupCsvSoftWarning } from '../../api/inventory.api';
import { useDownloadCleanupCsv } from '../../hooks/useInventory';
import { parseCleanupCsv } from './preprocessing/cleanupCsv';
import { preprocessingFonts } from './preprocessing/preprocessingTokens';

interface RowProcessingPanelProps {
  orderId: number;
  orderNumber?: string;
  rowCount: number;
  /** PreprocessingRow ids required in CSV (exactly once each). */
  expectedRowIds: Set<number>;
  /** Staged row_number by PreprocessingRow id (for Grok CSV sanity check). */
  rowNumberById: Record<number, number>;
  /** Parent-owned validated payloads ready for JSON POST. */
  validatedPayload: CleanupCsvApplyRowPayload[] | null;
  onValidatedPayloadChange: (rows: CleanupCsvApplyRowPayload[] | null) => void;
  lastApplySoftWarnings?: CleanupCsvSoftWarning[] | null;
  onDismissApplyWarnings?: () => void;
}

interface LogEntry {
  id: number;
  timestamp: Date;
  level: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function RowProcessingPanel({
  orderId,
  orderNumber,
  rowCount,
  expectedRowIds,
  rowNumberById,
  validatedPayload,
  onValidatedPayloadChange,
  lastApplySoftWarnings,
  onDismissApplyWarnings,
}: RowProcessingPanelProps) {
  const downloadCleanupCsv = useDownloadCleanupCsv();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logIdRef = useRef(0);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const isBusy = downloadCleanupCsv.isPending;

  const addLog = (message: string, level: LogEntry['level'] = 'info') => {
    logIdRef.current += 1;
    setLogEntries((prev) =>
      [
        {
          id: logIdRef.current,
          timestamp: new Date(),
          level,
          message,
        },
        ...prev,
      ].slice(0, 50),
    );
  };

  const handleDownload = async () => {
    setErrorMessage('');
    addLog('Preparing cleanup CSV download...');
    try {
      const blob = await downloadCleanupCsv.mutateAsync(orderId);
      const fname = `${(orderNumber || `order-${orderId}`).replace(/[^\w.\-]+/g, '_')}.csv`;
      downloadBlob(blob, fname);
      addLog(`Downloaded standardized manifest CSV (${rowCount} row(s)) for offline cleanup.`, 'success');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const message = detail || 'Failed to download cleanup CSV.';
      setErrorMessage(message);
      addLog(message, 'error');
    }
  };

  const validateAgainstExpected = (rows: CleanupCsvApplyRowPayload[]): string | null => {
    if (rows.length !== expectedRowIds.size) {
      return `Expected ${expectedRowIds.size} row(s), CSV has ${rows.length}.`;
    }
    const seen = new Set<number>();
    for (const r of rows) {
      if (!expectedRowIds.has(r.row_id)) return `Unknown row_id ${r.row_id} - not a staged row for this order.`;
      if (seen.has(r.row_id)) return `Duplicate row_id ${r.row_id}.`;
      seen.add(r.row_id);
      const expRn = rowNumberById[r.row_id];
      if (r.row_number != null && expRn != null && r.row_number !== expRn) {
        return `row_id ${r.row_id}: CSV row_number ${r.row_number} does not match staged row ${expRn}.`;
      }
    }
    if (seen.size !== expectedRowIds.size) return 'Some staged rows are missing from the CSV.';
    return null;
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    onDismissApplyWarnings?.();
    setErrorMessage('');
    onValidatedPayloadChange(null);
    addLog(`Reading ${file.name}…`);
    try {
      const text = await file.text();
      const parsed = parseCleanupCsv(text);
      if (!parsed.ok) {
        const msg = parsed.error;
        setErrorMessage(msg);
        addLog(msg, 'error');
        return;
      }
      const fmtLabel =
        parsed.format === 'grok13' ? '13-column Grok (+ ai_status)' : parsed.format === 'grok12' ? '12-column Grok' : '7-column narrow';
      addLog(`Detected ${fmtLabel} CSV.`, 'info');
      const rows: CleanupCsvApplyRowPayload[] = parsed.rows.map((r) => ({
        row_id: typeof r.row_id === 'number' ? r.row_id : Number.parseInt(String(r.row_id), 10),
        row_number: r.row_number,
        ai_title: String(r.ai_title ?? ''),
        ai_brand: String(r.ai_brand ?? ''),
        ai_model: String(r.ai_model ?? ''),
        category: String(r.category ?? ''),
        condition: String(r.condition ?? ''),
        proposed_price: String(r.proposed_price ?? ''),
        description: r.description,
        notes: r.notes,
        specifications_json: r.specifications_json,
        search_tags_json: r.search_tags_json,
        ai_status: r.ai_status,
      }));
      const vErr = validateAgainstExpected(rows);
      if (vErr) {
        setErrorMessage(vErr);
        addLog(vErr, 'error');
        return;
      }
      onValidatedPayloadChange(rows);
      addLog(`Validated ${rows.length} row(s) locally - click Run Cleanup in the toolbar to apply.`, 'success');
    } catch {
      const msg = 'Could not read CSV file.';
      setErrorMessage(msg);
      addLog(msg, 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fnameBase = (orderNumber || `order-${orderId}`).replace(/[^\w.\-]+/g, '_');

  return (
    <Box sx={{ fontFamily: preprocessingFonts.sans }}>
      <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1B4332', mb: 1 }}>
        Offline AI Cleanup
      </Typography>
      <Typography sx={{ fontSize: 13, color: '#666', mb: 2, lineHeight: 1.5 }}>
        Upload accepts a <Typography component="span" sx={{ fontFamily: preprocessingFonts.mono, fontSize: 12 }}>12- or 13-column Grok</Typography> response (
        <Typography component="span" sx={{ fontFamily: preprocessingFonts.mono, fontSize: 11 }}>row_id … search_tags_json</Typography>, optional trailing{' '}
        <Typography component="span" sx={{ fontFamily: preprocessingFonts.mono, fontSize: 11 }}>ai_status</Typography>) or legacy{' '}
        <Typography component="span" sx={{ fontFamily: preprocessingFonts.mono, fontSize: 12 }}>7-column narrow</Typography> (
        <Typography component="span" sx={{ fontFamily: preprocessingFonts.mono, fontSize: 11 }}>ai_title…</Typography>). Run Cleanup in the toolbar posts JSON to
        the server for full validation.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, mb: 2 }}>
        <Box sx={{ border: '1px solid #DDD5C9', borderRadius: '8px', p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25, textAlign: 'center' }}>
          <Box sx={{ width: 48, height: 48, borderRadius: '50%', bgcolor: '#F0F7F4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#2D6A4F', fontWeight: 700 }}>↓</Box>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#1B4332', m: 0 }}>Download Cleanup CSV</Typography>
          <Typography sx={{ fontFamily: preprocessingFonts.mono, fontSize: 13, color: '#2D6A4F', bgcolor: '#F0F7F4', px: 1.5, py: 0.5, borderRadius: 1, fontWeight: 600 }}>
            {fnameBase}.csv
          </Typography>
          <Typography sx={{ fontSize: 11, px: 1, py: 0.25, borderRadius: '10px', bgcolor: '#E3F2FD', color: '#1565C0', fontWeight: 500 }}>{rowCount} rows</Typography>
          <Button variant="contained" startIcon={<FileDownloadOutlined />} onClick={() => void handleDownload()} disabled={isBusy} sx={{ bgcolor: '#2D6A4F', textTransform: 'none', fontWeight: 600 }}>
            {downloadCleanupCsv.isPending ? 'Preparing…' : 'Download CSV'}
          </Button>
        </Box>

        <Box sx={{ border: '1px solid #DDD5C9', borderRadius: '8px', p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25, textAlign: 'center' }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              bgcolor: validatedPayload ? '#E8F5EE' : '#FFF3E0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              color: validatedPayload ? '#2D6A4F' : '#B8860B',
              fontWeight: 700,
            }}
          >
            ↑
          </Box>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#1B4332', m: 0 }}>Upload Completed CSV</Typography>
          <Typography sx={{ fontFamily: preprocessingFonts.mono, fontSize: 13, color: '#2D6A4F', bgcolor: '#F0F7F4', px: 1.5, py: 0.5, borderRadius: 1, fontWeight: 600 }}>
            {fnameBase}-cleaned.csv
          </Typography>
          <Typography sx={{ fontSize: 11, px: 1, py: 0.25, borderRadius: '10px', bgcolor: validatedPayload ? '#E8F5EE' : '#FFF3E0', color: validatedPayload ? '#2D6A4F' : '#B8860B', fontWeight: 500 }}>
            {validatedPayload ? `${validatedPayload.length} validated` : '0 validated'}
          </Typography>
          <Box
            component="label"
            sx={{
              border: '2px dashed #B8D4C8',
              borderRadius: '8px',
              px: 3,
              py: 2,
              cursor: 'pointer',
              fontSize: 13,
              color: '#666',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => void handleFile(e.target.files?.[0])} />
            <Typography sx={{ pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <UploadFileOutlined fontSize="small" /> Choose CSV (Grok 12/13-col or narrow)…
            </Typography>
          </Box>
          {validatedPayload && (
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#2D6A4F', px: 2, py: 1, bgcolor: '#D4EDDA', borderRadius: '6px' }}>
              ✓ Validated - ready to apply
            </Typography>
          )}
        </Box>
      </Box>

      {lastApplySoftWarnings && lastApplySoftWarnings.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => onDismissApplyWarnings?.()}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            Soft warnings from last apply ({lastApplySoftWarnings.length})
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2, maxHeight: 220, overflow: 'auto' }}>
            {lastApplySoftWarnings.slice(0, 100).map((w, i) => (
              <Typography component="li" key={`${w.row_id}-${w.rule}-${i}`} variant="caption" sx={{ display: 'list-item' }}>
                {w.row_id != null ? `row ${w.row_id}` : 'row ?'}
                {w.rule ? ` - ${w.rule}` : ''}
                {w.reason ? `: ${w.reason}` : ''}
                {w.column ? ` (${w.column})` : ''}
              </Typography>
            ))}
          </Box>
        </Alert>
      )}

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMessage('')}>
          {errorMessage}
        </Alert>
      )}

      <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f9f9f7', borderRadius: '6px', border: '1px solid #EDE8E0', fontFamily: preprocessingFonts.mono, fontSize: 11 }}>
        <Typography sx={{ fontSize: 12, fontFamily: preprocessingFonts.sans, fontWeight: 600, mb: 1 }}>Upload log</Typography>
        {logEntries.length === 0 ? (
          <Typography sx={{ color: '#888' }}>No activity yet.</Typography>
        ) : (
          logEntries.map((entry) => (
            <Box key={entry.id} sx={{ py: 0.25 }}>
              <Typography component="span" sx={{ color: '#aaa', mr: 1 }}>{entry.timestamp.toLocaleTimeString()}</Typography>
              <Typography
                component="span"
                sx={{
                  color:
                    entry.level === 'error' ? '#c0392b' : entry.level === 'warning' ? '#B8860B' : entry.level === 'success' ? '#2D6A4F' : '#555',
                }}
              >
                {entry.message}
              </Typography>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
