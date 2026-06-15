import type { MouseEvent as ReactMouseEvent } from 'react';
import RestartAltOutlinedIcon from '@mui/icons-material/RestartAltOutlined';
import { Box, Button, IconButton, Tooltip } from '@mui/material';
import { processingTokens } from '../processing/processingTokens';

export function CatalogTableColumnResetButton({
  onReset,
  label = 'Reset column widths',
  variant = 'icon',
}: {
  onReset: () => void;
  label?: string;
  variant?: 'icon' | 'text';
}) {
  const handleClick = (event: ReactMouseEvent<HTMLElement>) => {
    event.stopPropagation();
    onReset();
  };

  if (variant === 'text') {
    return (
      <Button
        size="small"
        variant="text"
        startIcon={<RestartAltOutlinedIcon sx={{ fontSize: '1rem !important' }} />}
        onClick={handleClick}
        sx={{
          minWidth: 0,
          px: 1,
          py: 0.25,
          fontSize: '0.72rem',
          fontWeight: 600,
          color: processingTokens.textSoft,
          whiteSpace: 'nowrap',
          '&:hover': { color: processingTokens.textStrong, bgcolor: `${processingTokens.primary}14` },
        }}
      >
        {label}
      </Button>
    );
  }

  return (
    <Tooltip title={label}>
      <IconButton
        size="small"
        aria-label={label}
        onClick={handleClick}
        sx={{
          p: '2px',
          color: processingTokens.textSoft,
          '&:hover': { color: processingTokens.textStrong, bgcolor: `${processingTokens.primary}14` },
        }}
      >
        <RestartAltOutlinedIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Tooltip>
  );
}

export function CatalogTableColumnResizeHandle({
  leftKey,
  rightKey,
  onResizePair,
}: {
  leftKey: string;
  rightKey: string;
  onResizePair: (leftKey: string, rightKey: string, event: ReactMouseEvent<HTMLElement>) => void;
}) {
  return (
    <Tooltip title="Drag to resize">
      <Box
        component="span"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${leftKey} column`}
        onMouseDown={(event) => onResizePair(leftKey, rightKey, event)}
        onClick={(event) => event.stopPropagation()}
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 12,
          height: '100%',
          cursor: 'col-resize',
          zIndex: 2,
          transform: 'translateX(50%)',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: '50%',
            width: 1,
            transform: 'translateX(-50%)',
            bgcolor: processingTokens.borderStrong,
            opacity: 0.75,
            transition: 'width 120ms ease, opacity 120ms ease, background-color 120ms ease',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 5,
            height: 14,
            transform: 'translate(-50%, -50%)',
            borderLeft: `1px solid ${processingTokens.borderStrong}`,
            borderRight: `1px solid ${processingTokens.borderStrong}`,
            opacity: 0.55,
            transition: 'opacity 120ms ease, border-color 120ms ease',
          },
          '&:hover': {
            bgcolor: `${processingTokens.primary}20`,
          },
          '&:hover::before': {
            width: 2,
            bgcolor: processingTokens.primary,
            opacity: 1,
          },
          '&:hover::after': {
            borderLeftColor: processingTokens.primary,
            borderRightColor: processingTokens.primary,
            opacity: 1,
          },
        }}
      />
    </Tooltip>
  );
}
