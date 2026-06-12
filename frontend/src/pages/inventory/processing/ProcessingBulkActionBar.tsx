import { Box, Button, Divider, Typography } from '@mui/material';

export interface ProcessingBulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  sameProduct: boolean;
  canAssignSharedProduct: boolean;
  onCheckInTogether: () => void;
  onAssignSharedProduct: () => void;
  /** P7 collapse: enabled when ≥2 manifest-backed rows are selected, none already grouped. */
  canCollapseRows?: boolean;
  /** Set when the selection is exactly one collapse-group master row. */
  collapseMasterRowId?: number | null;
  collapseLoading?: boolean;
  onCollapseRows?: () => void;
  onUncollapseRows?: (masterProcessingRowId: number) => void;
  onMarkBroken: () => void;
  onMarkUndelivered: () => void;
  /** When true, item-level bulk actions are disabled (e.g. preprocessing bookmark rows selected). */
  itemActionsBlocked?: boolean;
  /** Shown when ``itemActionsBlocked`` (e.g. under the action row). */
  itemActionsBlockedHint?: string;
}

/** Inverse bulk strip — §6.7 mockup. */
export function ProcessingBulkActionBar({
  selectedCount,
  onClear,
  sameProduct,
  canAssignSharedProduct,
  onCheckInTogether,
  onAssignSharedProduct,
  canCollapseRows = false,
  collapseMasterRowId = null,
  collapseLoading = false,
  onCollapseRows,
  onUncollapseRows,
  onMarkBroken,
  onMarkUndelivered,
  itemActionsBlocked = false,
  itemActionsBlockedHint,
}: ProcessingBulkActionBarProps) {
  // A single selected collapse master still gets the bar (for Uncollapse).
  if (selectedCount < 2 && collapseMasterRowId == null) return null;

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
        {sameProduct ?
          <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={onCheckInTogether}
            disabled={itemActionsBlocked}
          >
            Check in together
          </Button>
        : canAssignSharedProduct ?
          <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={onAssignSharedProduct}
            disabled={itemActionsBlocked}
          >
            Assign shared product
          </Button>
        : null}
        {canCollapseRows && onCollapseRows ?
          <Button
            size="small"
            variant="outlined"
            sx={{ borderColor: 'grey.500', color: 'grey.200' }}
            onClick={onCollapseRows}
            disabled={itemActionsBlocked || collapseLoading}
          >
            Collapse rows
          </Button>
        : null}
        {collapseMasterRowId != null && onUncollapseRows ?
          <Button
            size="small"
            variant="outlined"
            sx={{ borderColor: 'grey.500', color: 'grey.200' }}
            onClick={() => onUncollapseRows(collapseMasterRowId)}
            disabled={itemActionsBlocked || collapseLoading}
          >
            Uncollapse
          </Button>
        : null}
        <Button
          size="small"
          variant="outlined"
          sx={{ borderColor: 'grey.500', color: 'grey.200' }}
          onClick={onMarkUndelivered}
          disabled={itemActionsBlocked}
        >
          Mark undelivered
        </Button>
        <Button size="small" variant="outlined" color="warning" onClick={onMarkBroken} disabled={itemActionsBlocked}>
          Mark broken
        </Button>
      </Box>
      {itemActionsBlocked && itemActionsBlockedHint ?
        <Typography variant="caption" sx={{ color: 'warning.light' }}>
          {itemActionsBlockedHint}
        </Typography>
      : null}
    </Box>
  );
}
