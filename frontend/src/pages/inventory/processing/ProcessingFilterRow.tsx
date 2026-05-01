import { Box, Chip, Typography } from '@mui/material';
import Check from '@mui/icons-material/Check';
import Close from '@mui/icons-material/Close';
import type { ProcessingStatusSegment } from './processingWorkspaceFilters';
import { processingTokens } from './processingTokens';

export interface ProcessingFilterRowProps {
  segment: ProcessingStatusSegment;
  onSegmentChange: (v: ProcessingStatusSegment) => void;
  hideDispositioned: boolean;
  onHideDispositionedChange: (v: boolean) => void;
  filteredCount: number;
  totalCount: number;
  productFilterProductId: number | null;
  productFilterTitle?: string;
  onClearProductFilter: () => void;
}

const SEGMENTS: Array<{ id: ProcessingStatusSegment; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'partial', label: 'Partial' },
  { id: 'checked_in', label: 'Checked In' },
  { id: 'disputed', label: 'Disputed' },
];

export function ProcessingFilterRow({
  segment,
  onSegmentChange,
  hideDispositioned,
  onHideDispositionedChange,
  filteredCount,
  totalCount,
  productFilterProductId,
  productFilterTitle,
  onClearProductFilter,
}: ProcessingFilterRowProps) {
  const toggleOn = hideDispositioned;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 1.5,
        py: 1.25,
        minHeight: 50,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
          Queue
        </Typography>
        {SEGMENTS.map((s) => (
          <Chip
            key={s.id}
            label={s.label}
            size="small"
            color={segment === s.id ? 'primary' : 'default'}
            variant={segment === s.id ? 'filled' : 'outlined'}
            onClick={() => onSegmentChange(s.id)}
          />
        ))}
        <Box
          component="button"
          type="button"
          onClick={() => onHideDispositionedChange(!hideDispositioned)}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            ml: 1,
            px: 1.5,
            py: 0.75,
            borderRadius: 1,
            border: toggleOn ? `1px solid ${processingTokens.primary}` : `1px solid ${processingTokens.border}`,
            bgcolor: toggleOn ? processingTokens.primarySoft : 'transparent',
            color: toggleOn ? processingTokens.primary : processingTokens.textSoft,
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 13,
          }}
        >
          {toggleOn ? <Check sx={{ fontSize: 16 }} /> : null}
          Hide dispositioned rows
        </Box>
        {productFilterProductId != null ? (
          <Chip
            label={`Product: ${productFilterTitle || `#${productFilterProductId}`}`}
            size="small"
            color="primary"
            variant="outlined"
            onDelete={onClearProductFilter}
            deleteIcon={<Close />}
          />
        ) : null}
      </Box>
      <Typography variant="caption" color="text.secondary">
        Showing {filteredCount} of {totalCount} rows
      </Typography>
    </Box>
  );
}
