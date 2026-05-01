import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import { Box, Button, Tooltip, Typography } from '@mui/material';

export interface ProcessingWorkspaceFooterProps {
  pendingUnits: number;
  dispositionedUnits: number;
  totalUnits: number;
  orderComplete: boolean;
  closeLoading: boolean;
  onCloseClick: () => void;
}

export function ProcessingWorkspaceFooter({
  pendingUnits,
  dispositionedUnits,
  totalUnits,
  orderComplete,
  closeLoading,
  onCloseClick,
}: ProcessingWorkspaceFooterProps) {
  const blockClose = pendingUnits > 0 || orderComplete;

  return (
    <Box
      sx={{
        mt: 3,
        pt: 2,
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 2,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {pendingUnits > 0 ?
          <>
            <strong>{pendingUnits}</strong> unit(s) still need disposition before this PO can close.
          </>
        : orderComplete ?
          'This purchase order is already complete.'
        : <>
            All <strong>{totalUnits}</strong> tracked units are dispositioned ({dispositionedUnits} / {totalUnits}).
          </>
        }
      </Typography>
      <Tooltip
        title={
          orderComplete ? 'Order already complete.' : pendingUnits > 0 ? 'Disposition every intake/processing unit first.' : ''
        }
      >
        <span>
          <Button
            variant="contained"
            color="success"
            startIcon={<CheckCircleOutline />}
            disabled={closeLoading || blockClose}
            onClick={onCloseClick}
          >
            Close PO
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
}
