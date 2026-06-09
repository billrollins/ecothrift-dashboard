import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import { alpha } from '@mui/material/styles';
import { Box, Button, Tooltip, Typography } from '@mui/material';

export interface ProcessingWorkspaceFooterProps {
  pendingUnits: number;
  dispositionedUnits: number;
  totalUnits: number;
  orderComplete: boolean;
  closeLoading: boolean;
  onCloseClick: () => void;
  /** Canonical manifest exists; show tucked-away destructive reset control */
  resetProcessingVisible?: boolean;
  resetProcessingDisabled?: boolean;
  resetProcessingTooltip?: string;
  onResetProcessingClick?: () => void;
}

export function ProcessingWorkspaceFooter({
  pendingUnits,
  dispositionedUnits,
  totalUnits,
  orderComplete,
  closeLoading,
  onCloseClick,
  resetProcessingVisible,
  resetProcessingDisabled,
  resetProcessingTooltip,
  onResetProcessingClick,
}: ProcessingWorkspaceFooterProps) {
  const blockClose = pendingUnits > 0 || orderComplete;

  return (
    <Box
      sx={{
        mt: 0.75,
        pt: 0.75,
        borderTop: 1,
        borderColor: 'divider',
        display: 'flex',
        alignItems: { xs: 'stretch', sm: 'center' },
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 1,
        rowGap: 1,
      }}
    >
      <Typography
        variant="body2"
        color="text.secondary"
        component="div"
        sx={{
          flex: '1 1 auto',
          minWidth: 0,
          alignSelf: 'center',
          maxWidth: { xs: '100%', lg: '60%' },
          fontSize: '0.8rem',
        }}
      >
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

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          flexWrap: 'nowrap',
          flexShrink: 0,
          justifyContent: { xs: 'flex-start', sm: 'flex-end' },
          ml: { xs: 0, sm: 'auto' },
          width: { xs: '100%', sm: 'auto' },
        }}
      >
        {resetProcessingVisible && onResetProcessingClick ?
          <Tooltip
            title={
              resetProcessingTooltip ?? 'Deletes manifest rows and non-terminal items, then rebuilds from preprocessing bookmarks.'
            }
          >
            <span>
              <Button
                variant="outlined"
                color="warning"
                disabled={resetProcessingDisabled}
                aria-label="Reset all processing data from bookmarks (opens confirmation)"
                onClick={onResetProcessingClick}
                sx={(theme) => ({
                  px: 1.75,
                  py: 0.45,
                  minHeight: 30,
                  fontWeight: 900,
                  fontSize: theme.typography.pxToRem(11),
                  lineHeight: 1.25,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  borderWidth: '3px',
                  borderStyle: 'double',
                  borderColor: 'warning.dark',
                  borderRadius: 0,
                  color: '#4e342e',
                  bgcolor: alpha(theme.palette.warning.main, 0.55),
                  boxShadow:
                    '2px 2px 0 rgb(183 28 28 / 0.35), inset 0 0 0 1px rgb(255 255 255 / 0.35)',
                  '&:hover': {
                    bgcolor: alpha(theme.palette.warning.main, 0.75),
                    borderColor: 'error.dark',
                  },
                })}
              >
                RESET ALL
              </Button>
            </span>
          </Tooltip>
        : null}
        <Tooltip
          title={
            orderComplete ? 'Order already complete.' : pendingUnits > 0 ? 'Disposition every intake/processing unit first.' : ''
          }
        >
          <span style={{ flexShrink: 0 }}>
            <Button
              variant="contained"
              color="success"
              size="medium"
              startIcon={<CheckCircleOutline />}
              disabled={closeLoading || blockClose}
              onClick={onCloseClick}
              sx={{ minHeight: 30, py: 0.4 }}
            >
              Close PO
            </Button>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
