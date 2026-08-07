import { Box, Button, Divider, Typography } from '@mui/material';

export interface ProcessingBulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  /** P7 collapse: enabled when ≥2 manifest-backed rows are selected, none already grouped. */
  canCollapseRows?: boolean;
  /** Set when the selection is exactly one collapse-group master row. */
  collapseMasterRowId?: number | null;
  collapseLoading?: boolean;
  onCollapseRows?: () => void;
  onUncollapseRows?: (masterProcessingRowId: number) => void;
  /** When true, collapse/uncollapse are disabled (e.g. preprocessing bookmark rows selected). */
  itemActionsBlocked?: boolean;
  /** Shown when ``itemActionsBlocked`` (e.g. under the action row). */
  itemActionsBlockedHint?: string;
}

/** Bulk strip for queue multi-select - collapse / uncollapse only. */
export function ProcessingBulkActionBar({
  selectedCount,
  onClear,
  canCollapseRows = false,
  collapseMasterRowId = null,
  collapseLoading = false,
  onCollapseRows,
  onUncollapseRows,
  itemActionsBlocked = false,
  itemActionsBlockedHint,
}: ProcessingBulkActionBarProps) {
  const hasCollapseAction = canCollapseRows && onCollapseRows;
  const hasUncollapseAction = collapseMasterRowId != null && onUncollapseRows;

  // A single selected collapse master still gets the bar (for Uncollapse).
  if (!hasCollapseAction && !hasUncollapseAction) return null;

  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: 0,
        left: 0,
        right: 0,
        mt: 'auto',
        py: 1.25,
        px: 2,
        bgcolor: 'grey.900',
        color: 'grey.100',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        borderRadius: 1,
        zIndex: 10,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="body2" fontWeight={700} sx={{ color: 'common.white' }}>
          {selectedCount}
        </Typography>
        <Typography variant="body2" sx={{ color: 'grey.300' }}>
          {selectedCount === 1 ? 'row selected' : 'rows selected'}
        </Typography>
        <Button size="small" variant="text" sx={{ color: 'grey.300' }} onClick={onClear}>
          Clear
        </Button>
        <Divider orientation="vertical" flexItem sx={{ borderColor: 'grey.700', mx: 1 }} />
        {hasCollapseAction ?
          <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={onCollapseRows}
            disabled={itemActionsBlocked || collapseLoading}
          >
            Collapse rows
          </Button>
        : null}
        {hasUncollapseAction ?
          <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={() => onUncollapseRows!(collapseMasterRowId!)}
            disabled={itemActionsBlocked || collapseLoading}
          >
            Uncollapse
          </Button>
        : null}
      </Box>
      {itemActionsBlocked && itemActionsBlockedHint ?
        <Typography variant="caption" sx={{ color: 'warning.light' }}>
          {itemActionsBlockedHint}
        </Typography>
      : null}
    </Box>
  );
}
