import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import type { RestorationPartsLineInspectPayload, RestorationPartsOrderDTO } from '../../../types/inventory.types';
import { studio } from '../tars/studio/tarsStudioTheme';
import { PRIMARY_ACTION, WARN_ACTION } from './partsChrome';
import {
  draftsFromOrder,
  INSPECT_SLOT_MIN_HEIGHT,
  inspectNoteValue,
  lineInspectLabel,
  receiveInspectReady,
  toInspectPayload,
  type LineInspectDraft,
} from './partsReceiveInspect';

export function PartsReceiveInspectForm({
  order,
  canSubmit,
  busy,
  onSubmit,
}: {
  order: RestorationPartsOrderDTO | null;
  canSubmit: boolean;
  busy: boolean;
  onSubmit: (lines: RestorationPartsLineInspectPayload[]) => void;
}) {
  const [drafts, setDrafts] = useState<LineInspectDraft[]>([]);

  useEffect(() => {
    setDrafts(order ? draftsFromOrder(order) : []);
  }, [order]);

  const ready = receiveInspectReady(drafts);

  return (
    <Box
      sx={{
        boxSizing: 'border-box',
        minHeight: INSPECT_SLOT_MIN_HEIGHT,
        px: 1.1,
        py: 0.9,
        borderRadius: `${studio.radius.md}px`,
        border: `1px solid ${studio.rule}`,
        bgcolor: studio.panel,
      }}
    >
      <Typography sx={{ fontWeight: 800, fontSize: '0.84rem', color: studio.ink, minHeight: 20 }}>
        {order ? order.job_name || order.name || 'Item' : 'No parts waiting to inspect'}
      </Typography>
      <Typography sx={{ fontSize: '0.72rem', color: studio.inkMuted, minHeight: 16, mb: 0.75 }}>
        {order ? [order.name, order.target_grade].filter(Boolean).join(' · ') || '-' : ' '}
      </Typography>
      {drafts.map((draft) => {
        const line = order?.lines.find((row) => row.id === draft.id);
        return (
          <Box key={draft.id} sx={{ mb: 0.85 }}>
            <Typography sx={{ fontWeight: 800, color: studio.ink, minHeight: 20 }}>
              {line ? lineInspectLabel(line) : 'Part'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.6, mt: 0.4, mb: 0.5 }}>
              <Button
                size="small"
                variant={draft.verdict === 'acceptable' ? 'contained' : 'outlined'}
                disabled={!canSubmit || busy}
                onClick={() =>
                  setDrafts((current) =>
                    current.map((row) => (row.id === draft.id ? { ...row, verdict: 'acceptable' } : row)),
                  )
                }
                sx={draft.verdict === 'acceptable' ? PRIMARY_ACTION : { ...PRIMARY_ACTION, bgcolor: studio.panel, color: studio.ink, border: `1px solid ${studio.panelBorder}` }}
              >
                Acceptable
              </Button>
              <Button
                size="small"
                variant={draft.verdict === 'issues' ? 'contained' : 'outlined'}
                disabled={!canSubmit || busy}
                onClick={() =>
                  setDrafts((current) =>
                    current.map((row) => (row.id === draft.id ? { ...row, verdict: 'issues' } : row)),
                  )
                }
                sx={draft.verdict === 'issues' ? WARN_ACTION : { ...WARN_ACTION, bgcolor: studio.panel, color: studio.ink, border: `1px solid ${studio.panelBorder}` }}
              >
                Issues
              </Button>
            </Box>
            <TextField
              fullWidth
              size="small"
              placeholder="No issues"
              value={inspectNoteValue(draft)}
              disabled={!canSubmit || busy}
              onChange={(event) =>
                setDrafts((current) =>
                  current.map((row) => (row.id === draft.id ? { ...row, note: event.target.value } : row)),
                )
              }
            />
          </Box>
        );
      })}
      <Box sx={{ minHeight: 32, display: 'flex', alignItems: 'flex-end' }}>
        {order ? (
          <Button
            size="small"
            variant="contained"
            disabled={!canSubmit || !ready || busy}
            onClick={() => onSubmit(toInspectPayload(drafts))}
            sx={{ ...PRIMARY_ACTION, flex: '0 0 auto', minWidth: 88 }}
          >
            Save
          </Button>
        ) : (
          <Box sx={{ minHeight: 28 }} />
        )}
      </Box>
    </Box>
  );
}
