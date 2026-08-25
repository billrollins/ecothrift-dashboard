import { Box, Typography } from '@mui/material';
import {
  noteCountLabel,
  priorityTone,
  REQUEST_COLUMN_HEADINGS,
  REQUEST_GRID_COLUMNS,
  requestHeadline,
  ROW_HEIGHT,
  statusTone,
} from './requestsBoardLayout';
import {
  formatRequestWhen,
  priorityWord,
  statusWord,
  targetDateLabel,
} from '../../pages/admin/enhancementRequestsTable';
import { AreaBadge } from './AreaBadge';
import type { EnhancementRequestDTO } from '../../types/enhancementRequests.types';

const CELL = {
  fontSize: 12,
  lineHeight: '16px',
  minWidth: 0,
} as const;

export function RequestColumnHeader() {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: REQUEST_GRID_COLUMNS,
        alignItems: 'center',
        columnGap: 1,
        px: 1,
        height: 26,
        borderBottom: '1px solid',
        borderColor: 'divider',
        position: 'sticky',
        top: 0,
        bgcolor: 'background.paper',
        zIndex: 1,
      }}
    >
      {REQUEST_COLUMN_HEADINGS.map((heading) => (
        <Typography
          key={heading}
          noWrap
          sx={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.5,
            color: 'text.secondary',
          }}
        >
          {heading}
        </Typography>
      ))}
    </Box>
  );
}

export function RequestSummaryRow({
  request,
  selected,
  onSelect,
}: {
  request: EnhancementRequestDTO;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      aria-label={`Open request from ${request.submitted_by_name || 'Unknown'}`}
      sx={{
        display: 'grid',
        gridTemplateColumns: REQUEST_GRID_COLUMNS,
        alignItems: 'center',
        columnGap: 1,
        width: '100%',
        textAlign: 'left',
        height: ROW_HEIGHT,
        minHeight: ROW_HEIGHT,
        px: 1,
        border: 0,
        borderLeft: '3px solid',
        borderLeftColor: selected ? 'primary.main' : 'transparent',
        borderBottom: '1px solid',
        borderBottomColor: 'divider',
        bgcolor: selected ? 'action.selected' : 'transparent',
        cursor: 'pointer',
        font: 'inherit',
        '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
      }}
    >
      <AreaBadge area={request.area} size="compact" />
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ ...CELL, fontSize: 11, fontWeight: 700 }} title={request.body}>
          {requestHeadline(request)}
        </Typography>
        <Typography noWrap sx={{ ...CELL, fontSize: 10, color: statusTone(request.status) }}>
          {statusWord(request.status)}
        </Typography>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ ...CELL, fontSize: 11 }}>
          {request.submitted_by_name || 'Unknown'}
        </Typography>
        <Typography noWrap sx={{ ...CELL, fontSize: 10, color: 'text.secondary' }}>
          {formatRequestWhen(request.created_at)}
        </Typography>
      </Box>
      <Typography
        noWrap
        sx={{ ...CELL, fontWeight: 800, color: priorityTone(request.priority) }}
      >
        {priorityWord(request.priority)}
      </Typography>
      <Typography noWrap sx={{ ...CELL, color: 'text.secondary' }}>
        {targetDateLabel(request)}
      </Typography>
      <Typography noWrap sx={{ ...CELL, color: 'text.secondary' }}>
        {noteCountLabel(request)}
      </Typography>
    </Box>
  );
}
