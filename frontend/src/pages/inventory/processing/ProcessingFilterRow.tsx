import { Box, Chip, Typography } from '@mui/material';
import Close from '@mui/icons-material/Close';
import {
  clickProcessingQueueFilter,
  isProcessingQueueFilterChipActive,
  PROCESSING_QUEUE_FILTER_CHIPS,
  type ProcessingQueueFilterId,
  type ProcessingQueueFilterState,
} from './processingWorkspaceFilters';
import { processingTokens } from './processingTokens';

export interface ProcessingFilterRowProps {
  filters: ProcessingQueueFilterState;
  onFiltersChange: (next: ProcessingQueueFilterState) => void;
  productFilterProductId: number | null;
  productFilterTitle?: string;
  onClearProductFilter: () => void;
  /** Total manifest/processing lines on this PO. */
  totalRowCount?: number;
  /** Lines matching segment, search, and other filters. */
  filteredRowCount?: number;
}

export function ProcessingFilterRow({
  filters,
  onFiltersChange,
  productFilterProductId,
  productFilterTitle,
  onClearProductFilter,
  totalRowCount,
  filteredRowCount,
}: ProcessingFilterRowProps) {
  function handleChipClick(id: ProcessingQueueFilterId | 'all') {
    onFiltersChange(clickProcessingQueueFilter(filters, id));
  }

  return (
    <Box
      sx={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.75,
        minHeight: 48,
        borderBottom: 1,
        borderColor: processingTokens.border,
        bgcolor: 'background.paper',
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
        {PROCESSING_QUEUE_FILTER_CHIPS.map((chip) => {
          const active = isProcessingQueueFilterChipActive(filters, chip.id);
          return (
            <Chip
              key={chip.id}
              label={chip.label}
              size="small"
              onClick={() => handleChipClick(chip.id)}
              sx={{
                height: 27,
                borderRadius: 99,
                fontSize: '0.7rem',
                fontWeight: 700,
                bgcolor: active ? processingTokens.primarySoftStrong : 'transparent',
                color: active ? processingTokens.textStrong : processingTokens.textSoft,
                border: '1px solid',
                borderColor: active ? processingTokens.borderStrong : processingTokens.border,
                '& .MuiChip-label': { px: 1 },
                '&:hover': {
                  bgcolor: active ? processingTokens.primarySoftStrong : processingTokens.primarySoft,
                },
              }}
            />
          );
        })}
        {productFilterProductId != null ? (
          <Chip
            label={`Product: ${productFilterTitle || `#${productFilterProductId}`}`}
            size="small"
            variant="outlined"
            onDelete={onClearProductFilter}
            deleteIcon={<Close />}
            sx={{
              height: 27,
              maxWidth: 220,
              fontSize: '0.7rem',
              borderColor: processingTokens.borderStrong,
              color: processingTokens.textStrong,
            }}
          />
        ) : null}
      </Box>

      {totalRowCount != null || filteredRowCount != null ?
        <Typography
          variant="caption"
          sx={{
            ml: 'auto',
            flexShrink: 0,
            fontSize: '0.72rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            color: processingTokens.textSoft,
          }}
        >
          {filteredRowCount != null ?
            `${filteredRowCount.toLocaleString()} matching`
          : '— matching'}
          {' · '}
          {totalRowCount != null ?
            `${totalRowCount.toLocaleString()} on order`
          : '— on order'}
        </Typography>
      : null}
    </Box>
  );
}
