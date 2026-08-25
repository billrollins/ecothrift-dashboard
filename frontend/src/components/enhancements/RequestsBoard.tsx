import { Box, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { RequestDetailEmpty, RequestDetailPanel } from './RequestDetailPanel';
import { RequestColumnHeader, RequestSummaryRow } from './RequestSummaryRow';
import { DETAIL_MIN_HEIGHT } from './requestsBoardLayout';
import type {
  EnhancementRequestDTO,
  EnhancementRequestTriagePayload,
  EnhancementRequestWritePayload,
} from '../../types/enhancementRequests.types';

/**
 * List on the left, the whole request on the right.
 *
 * Picking a row swaps the pane rather than growing the row, so the list never
 * moves under a hand that is already travelling toward it.
 */
export function RequestsBoard({
  rows,
  loading = false,
  triage = false,
  busy = false,
  emptyText,
  onSave,
  onNote,
  onTriage,
}: {
  rows: EnhancementRequestDTO[];
  loading?: boolean;
  triage?: boolean;
  busy?: boolean;
  emptyText: string;
  onSave?: (id: number, payload: EnhancementRequestWritePayload) => void;
  onNote?: (id: number, body: string) => void;
  onTriage?: (id: number, payload: EnhancementRequestTriagePayload) => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (rows.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0]!.id);
    }
  }, [rows, selectedId]);

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gap: 1,
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1.25fr)' },
        gridTemplateRows: { xs: `minmax(0, 1fr) ${DETAIL_MIN_HEIGHT}px`, md: 'minmax(0, 1fr)' },
      }}
    >
      <Box
        sx={{
          minHeight: 0,
          minWidth: 0,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <RequestColumnHeader />
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {loading ? (
            <Typography sx={{ p: 1.5, fontSize: 12, color: 'text.secondary' }}>
              Loading requests…
            </Typography>
          ) : rows.length === 0 ? (
            <Typography sx={{ p: 1.5, fontSize: 12, color: 'text.disabled' }}>{emptyText}</Typography>
          ) : (
            rows.map((request) => (
              <RequestSummaryRow
                key={request.id}
                request={request}
                selected={request.id === selectedId}
                onSelect={() => setSelectedId(request.id)}
              />
            ))
          )}
        </Box>
      </Box>

      {selected ? (
        <RequestDetailPanel
          key={selected.id}
          request={selected}
          triage={triage}
          busy={busy}
          onSave={(payload) => onSave?.(selected.id, payload)}
          onNote={(body) => onNote?.(selected.id, body)}
          onTriage={(payload) => onTriage?.(selected.id, payload)}
        />
      ) : (
        <RequestDetailEmpty hint={loading ? 'Loading…' : 'Pick a request to read it in full.'} />
      )}
    </Box>
  );
}
