import { Box, Button, Divider, Typography } from '@mui/material';

export interface ProcessingBulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  sameProduct: boolean;
  onMerge: () => void;
  onBulkDisposition: () => void;
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
  onMerge,
  onBulkDisposition,
  onMarkBroken,
  onMarkUndelivered,
  itemActionsBlocked = false,
  itemActionsBlockedHint,
}: ProcessingBulkActionBarProps) {
  if (selectedCount < 2) return null;

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
          rows selected
        </Typography>
        <Button size="small" variant="text" sx={{ color: 'grey.300' }} onClick={onClear}>
          Clear
        </Button>
        <Divider orientation="vertical" flexItem sx={{ borderColor: 'grey.700', mx: 1 }} />
        {sameProduct ? (
          <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={onBulkDisposition}
            disabled={itemActionsBlocked}
          >
            Bulk disposition
          </Button>
        ) : (
          <Button
            size="small"
            variant="contained"
            color="inherit"
            sx={{ bgcolor: 'grey.700', color: 'white' }}
            onClick={onMerge}
            disabled={itemActionsBlocked}
          >
            These are the same product
          </Button>
        )}
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
