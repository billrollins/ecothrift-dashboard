import { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Typography,
} from '@mui/material';
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import { useDownloadCleanupCsv, useUploadCleanupCsv } from '../../hooks/useInventory';

interface RowProcessingPanelProps {
  orderId: number;
  rowCount: number;
  cleanedRows: number;
  completedStep: number;
  onClearCleanup: () => void;
  isClearingCleanup: boolean;
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
  rowCount,
  cleanedRows,
}: RowProcessingPanelProps) {
  const downloadCleanupCsv = useDownloadCleanupCsv();
  const uploadCleanupCsv = useUploadCleanupCsv();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logIdRef = useRef(0);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const isBusy = downloadCleanupCsv.isPending || uploadCleanupCsv.isPending;

  const addLog = (message: string, level: LogEntry['level'] = 'info') => {
    logIdRef.current += 1;
    setLogEntries((prev) => [
      {
        id: logIdRef.current,
        timestamp: new Date(),
        level,
        message,
      },
      ...prev,
    ].slice(0, 50));
  };

  const handleDownload = async () => {
    setErrorMessage('');
    setStatusMessage('');
    addLog('Preparing cleanup CSV download...');
    try {
      const blob = await downloadCleanupCsv.mutateAsync(orderId);
      downloadBlob(blob, `order-${orderId}-cleanup.csv`);
      const message = `Downloaded cleanup source CSV with ${rowCount} row(s). Run local AI cleanup, then upload the narrow cleaned CSV.`;
      setStatusMessage(message);
      addLog(message, 'success');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const message = detail || 'Failed to download cleanup CSV.';
      setErrorMessage(message);
      addLog(message, 'error');
    }
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setErrorMessage('');
    setStatusMessage('');
    addLog(`Uploading ${file.name}...`);
    try {
      const result = await uploadCleanupCsv.mutateAsync({ orderId, file });
      const message = `Upload complete: ${result.rows_updated}/${result.rows_seen} row(s) imported. Strict validation rejected ${result.rows_rejected}.`;
      setStatusMessage(message);
      addLog(message, result.rows_rejected ? 'warning' : 'success');
      addLog(`Synced ${result.items_updated} item(s) and ${result.products_updated} product(s).`, 'success');
      if (result.rejected_rows?.length) {
        const preview = result.rejected_rows
          .slice(0, 5)
          .map((row) => `line ${row.line}: ${row.reason}`)
          .join('; ');
        addLog(`Rejected row details: ${preview}`, 'warning');
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const message = detail || 'Failed to upload cleanup CSV.';
      setErrorMessage(message);
      addLog(message, 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Offline Cleanup CSV
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Download the source rows for local cleanup. Upload must be the strict narrow AI output CSV
          with exactly: row_id, ai_title, ai_brand, ai_model, category, condition, proposed_price.
          The upload validates the full file before applying any row changes.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          <Button
            variant="contained"
            startIcon={<FileDownloadOutlined />}
            onClick={() => void handleDownload()}
            disabled={isBusy}
          >
            {downloadCleanupCsv.isPending ? 'Preparing CSV...' : 'Download Cleanup CSV'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => void handleUpload(event.target.files?.[0])}
          />
          <Button
            variant="contained"
            color="success"
            startIcon={<UploadFileOutlined />}
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
          >
            {uploadCleanupCsv.isPending ? 'Uploading...' : 'Upload Completed CSV'}
          </Button>
          <Chip size="small" label={`${rowCount} standardized row(s)`} variant="outlined" />
          <Chip size="small" label={`${cleanedRows} imported/cleaned`} color={cleanedRows ? 'success' : 'default'} variant="outlined" />
        </Box>

        {isBusy && <LinearProgress sx={{ mb: 2 }} />}

        {statusMessage && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setStatusMessage('')}>
            {statusMessage}
          </Alert>
        )}
        {errorMessage && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorMessage('')}>
            {errorMessage}
          </Alert>
        )}
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Upload Log
        </Typography>
        {logEntries.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No CSV activity yet.
          </Typography>
        ) : (
          <Box sx={{ display: 'grid', gap: 0.75 }}>
            {logEntries.map((entry) => (
              <Box key={entry.id} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                <Typography variant="caption" color="text.disabled" sx={{ minWidth: 80 }}>
                  {entry.timestamp.toLocaleTimeString()}
                </Typography>
                <Typography
                  variant="body2"
                  color={
                    entry.level === 'error'
                      ? 'error.main'
                      : entry.level === 'warning'
                        ? 'warning.dark'
                        : entry.level === 'success'
                          ? 'success.main'
                          : 'text.secondary'
                  }
                >
                  {entry.message}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
