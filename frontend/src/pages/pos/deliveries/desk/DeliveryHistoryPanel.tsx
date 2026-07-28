import { useState } from 'react';
import { Box, Button, Collapse, Stack, Typography } from '@mui/material';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import type { DeliveryChangeEvent } from '../../../../types/pos.types';
import { ecoField, ecoFieldCardSx } from '../../../../theme/deliveryTheme';

type Props = {
  events: DeliveryChangeEvent[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  title?: string;
  /** Rows shown before the "Show all" control appears. */
  previewCount?: number;
  defaultOpen?: boolean;
};

function formatWhen(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function HistoryRow({ event }: { event: DeliveryChangeEvent }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ py: 0.75 }}>
      <Box
        sx={{
          width: 8,
          height: 8,
          mt: 0.7,
          borderRadius: '50%',
          flexShrink: 0,
          bgcolor: event.entity_type === 'day' ? ecoField.green : ecoField.line,
          border: `1px solid ${ecoField.green}`,
        }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={700} sx={{ color: ecoField.ink }}>
          {event.summary}
        </Typography>
        <Typography variant="caption" sx={{ color: ecoField.muted, fontWeight: 600 }}>
          {formatWhen(event.created_at)}
          {event.actor_name ? ` · ${event.actor_name}` : ''}
          {event.reason ? ` · ${event.reason}` : ''}
        </Typography>
      </Box>
    </Stack>
  );
}

/** Read-only audit timeline shared by Desk day detail and delivery drill-downs. */
export function DeliveryHistoryPanel({
  events,
  isLoading,
  isError,
  title = 'History',
  previewCount = 6,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const rows = events ?? [];
  const visible = showAll ? rows : rows.slice(0, previewCount);

  return (
    <Box sx={{ ...ecoFieldCardSx, p: 2, mt: 2 }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        onClick={() => setOpen((prev) => !prev)}
        sx={{ cursor: 'pointer' }}
      >
        <HistoryRounded sx={{ color: ecoField.muted, fontSize: 20 }} />
        <Typography variant="subtitle2" fontWeight={800} sx={{ color: ecoField.ink }}>
          {title}
        </Typography>
        <Typography variant="caption" sx={{ color: ecoField.muted, fontWeight: 700 }}>
          {isLoading ? 'loading…' : `${rows.length} change${rows.length === 1 ? '' : 's'}`}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {open ? (
          <ExpandLessRounded sx={{ color: ecoField.muted }} />
        ) : (
          <ExpandMoreRounded sx={{ color: ecoField.muted }} />
        )}
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ mt: 1 }}>
          {isError && (
            <Typography variant="body2" color="error">
              History unavailable.
            </Typography>
          )}
          {!isError && !isLoading && rows.length === 0 && (
            <Typography variant="body2" sx={{ color: ecoField.muted }}>
              No recorded changes yet.
            </Typography>
          )}
          {visible.map((event) => (
            <HistoryRow key={event.id} event={event} />
          ))}
          {rows.length > previewCount && (
            <Button size="small" onClick={() => setShowAll((prev) => !prev)} sx={{ mt: 0.5 }}>
              {showAll ? 'Show less' : `Show all ${rows.length}`}
            </Button>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
