import { Box, Button, Divider, Typography } from '@mui/material';

export interface ProcessingBulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  sameProduct: boolean;
  onMerge: () => void;
  onBulkDisposition: () => void;
  onMarkBroken: () => void;
  onMarkUndelivered: () => void;
  /** When exactly two manifest rows are selected — swap checked-in states between rows. */
  onSwap?: () => void;
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
  onSwap,
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
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 2,
        borderRadius: 1,
        zIndex: 10,
      }}
    >
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
        <Button size="small" variant="contained" color="primary" onClick={onBulkDisposition}>
          Bulk disposition
        </Button>
      ) : (
        <Button size="small" variant="contained" color="inherit" sx={{ bgcolor: 'grey.700', color: 'white' }} onClick={onMerge}>
          These are the same product
        </Button>
      )}
      <Button size="small" variant="outlined" sx={{ borderColor: 'grey.500', color: 'grey.200' }} onClick={onMarkUndelivered}>
        Mark undelivered
      </Button>
      <Button size="small" variant="outlined" color="warning" onClick={onMarkBroken}>
        Mark broken
      </Button>
      {selectedCount === 2 && onSwap ? (
        <Button size="small" variant="text" sx={{ color: 'grey.300', ml: 'auto' }} onClick={onSwap}>
          Swap rows…
        </Button>
      ) : null}
    </Box>
  );
}
