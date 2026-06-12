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
  productFilterProductId: number | null;
  productFilterTitle?: string;
  onClearProductFilter: () => void;
  /** Total manifest/processing lines on this PO. */
  totalRowCount?: number;
  /** Lines matching segment, search, and other filters. */
  filteredRowCount?: number;
  groupByProduct?: boolean;
  onGroupByProductChange?: (value: boolean) => void;
  /** P7 collapse: when true, collapsed member rows stay visible (indented under their master). */
  showCollapsedMembers?: boolean;
  onShowCollapsedMembersChange?: (value: boolean) => void;
}

const SEGMENTS: Array<{ id: ProcessingStatusSegment; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Open' },
  { id: 'partial', label: 'Partial' },
  { id: 'checked_in', label: 'Done' },
  { id: 'disputed', label: 'Disputes' },
];

export function ProcessingFilterRow({
  segment,
  onSegmentChange,
  hideDispositioned,
  onHideDispositionedChange,
  productFilterProductId,
  productFilterTitle,
  onClearProductFilter,
  totalRowCount,
  filteredRowCount,
  groupByProduct = false,
  onGroupByProductChange,
  showCollapsedMembers = false,
  onShowCollapsedMembersChange,
}: ProcessingFilterRowProps) {
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
        {SEGMENTS.map((s) => {
          const active = segment === s.id;
          return (
            <Chip
              key={s.id}
              label={s.label}
              size="small"
              onClick={() => onSegmentChange(s.id)}
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
        <Box
          component="button"
          type="button"
          onClick={() => onHideDispositionedChange(!hideDispositioned)}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.4,
            height: 27,
            px: 1,
            borderRadius: 99,
            border: hideDispositioned ?
              `1px solid ${processingTokens.borderStrong}`
            : `1px solid ${processingTokens.border}`,
            bgcolor: hideDispositioned ? processingTokens.primarySoftStrong : 'transparent',
            color: hideDispositioned ? processingTokens.textStrong : processingTokens.textSoft,
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 11.5,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            transition: (theme) => theme.transitions.create(['background-color', 'border-color']),
            '&:hover': {
              bgcolor: processingTokens.primarySoft,
            },
          }}
        >
          {hideDispositioned ? <Check sx={{ fontSize: 14 }} /> : null}
          Hide done
        </Box>
        {onGroupByProductChange ?
          <Box
            component="button"
            type="button"
            onClick={() => onGroupByProductChange(!groupByProduct)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              height: 27,
              px: 1,
              borderRadius: 99,
              border: groupByProduct ?
                `1px solid ${processingTokens.borderStrong}`
              : `1px solid ${processingTokens.border}`,
              bgcolor: groupByProduct ? processingTokens.primarySoftStrong : 'transparent',
              color: groupByProduct ? processingTokens.textStrong : processingTokens.textSoft,
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 11.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              transition: (theme) => theme.transitions.create(['background-color', 'border-color']),
              '&:hover': {
                bgcolor: processingTokens.primarySoft,
              },
            }}
          >
            {groupByProduct ? <Check sx={{ fontSize: 14 }} /> : null}
            Group by product
          </Box>
        : null}
        {onShowCollapsedMembersChange ?
          <Box
            component="button"
            type="button"
            onClick={() => onShowCollapsedMembersChange(!showCollapsedMembers)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              height: 27,
              px: 1,
              borderRadius: 99,
              border: showCollapsedMembers ?
                `1px solid ${processingTokens.borderStrong}`
              : `1px solid ${processingTokens.border}`,
              bgcolor: showCollapsedMembers ? processingTokens.primarySoftStrong : 'transparent',
              color: showCollapsedMembers ? processingTokens.textStrong : processingTokens.textSoft,
              cursor: 'pointer',
              font: 'inherit',
              fontSize: 11.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              transition: (theme) => theme.transitions.create(['background-color', 'border-color']),
              '&:hover': {
                bgcolor: processingTokens.primarySoft,
              },
            }}
          >
            {showCollapsedMembers ? <Check sx={{ fontSize: 14 }} /> : null}
            Show collapsed rows
          </Box>
        : null}
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
