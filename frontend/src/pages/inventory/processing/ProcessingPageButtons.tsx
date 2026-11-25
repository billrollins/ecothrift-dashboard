/**
 * The Processing page's own buttons, on the search row beside the scan box (Bill 2026-11-25: "move buttons to search
 * row in manifest details like Queue, undo, redo, refresh ... this removes a header and saves room"): back to the
 * queue and Refresh while a row is open, and Undo / Redo with their keys said on them (#230) always.
 *
 * They sit at the right end of the row, Undo and Redo last, so those two keep their place whether a row is open or
 * not. Greyed, never gone, when there is nothing to undo.
 */
import { Box, Button, CircularProgress, Tooltip } from '@mui/material';
import { IconBack, IconRefresh, IconUndo } from '../../../icons/ecoIcons';
import { processingTokens } from './processingTokens';
import { useProcessingUndo } from './processingUndo';

const buttonSx = {
  minWidth: 0,
  height: 30,
  px: 1,
  py: 0,
  gap: 0.4,
  fontSize: '0.6875rem',
  fontWeight: 800,
  whiteSpace: 'nowrap',
  textTransform: 'none',
  color: processingTokens.textSoft,
  borderColor: processingTokens.borderStrong,
  bgcolor: processingTokens.surfaceTint,
  '& .MuiButton-startIcon': { mr: 0.1, ml: 0 },
  '&:hover': { borderColor: processingTokens.textSoft, bgcolor: processingTokens.neutralSoft },
} as const;

const keySx = { fontFamily: processingTokens.monoFontFamily, fontWeight: 700, opacity: 0.7 } as const;

export function ProcessingPageButtons({ onBackToQueue, onRefresh, refreshing = false }: {
  /** A row is open: back to the queue. Left out on the queue itself. */
  onBackToQueue?: () => void;
  /** A row is open: load it again from the server. */
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const undo = useProcessingUndo();
  return (
    <Box
      data-testid="processing-page-buttons"
      sx={{ ml: 'auto', display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}
    >
      {onBackToQueue ?
        <Tooltip title="Back to the queue (Esc)" enterDelay={400} disableInteractive>
          <Button
            size="small"
            variant="outlined"
            onClick={onBackToQueue}
            startIcon={<IconBack sx={{ fontSize: 14 }} />}
            aria-label="Queue"
            sx={buttonSx}
          >
            Queue
          </Button>
        </Tooltip>
      : null}
      {onRefresh ?
        <Button
          size="small"
          variant="outlined"
          disabled={refreshing}
          onClick={onRefresh}
          startIcon={refreshing ? <CircularProgress size={12} color="inherit" /> : <IconRefresh sx={{ fontSize: 14 }} />}
          aria-label="Refresh page"
          sx={buttonSx}
        >
          Refresh
        </Button>
      : null}
      {undo ?
        <Box data-testid="undo-redo" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={undo.undoLabel ? `Undo: ${undo.undoLabel}` : 'Nothing to undo'} enterDelay={300} disableInteractive>
            <span>
              <Button
                size="small"
                variant="outlined"
                disabled={!undo.undoLabel || undo.busy}
                onClick={() => void undo.undo()}
                startIcon={<IconUndo sx={{ fontSize: 13 }} />}
                aria-label="Undo (Ctrl+Z)"
                sx={buttonSx}
              >
                Undo
                <Box component="span" sx={keySx}>Ctrl+Z</Box>
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={undo.redoLabel ? `Redo: ${undo.redoLabel}` : 'Nothing to redo'} enterDelay={300} disableInteractive>
            <span>
              <Button
                size="small"
                variant="outlined"
                disabled={!undo.redoLabel || undo.busy}
                onClick={() => void undo.redo()}
                startIcon={<IconUndo sx={{ fontSize: 13, transform: 'scaleX(-1)' }} />}
                aria-label="Redo (Ctrl+Y)"
                sx={buttonSx}
              >
                Redo
                <Box component="span" sx={keySx}>Ctrl+Y</Box>
              </Button>
            </span>
          </Tooltip>
        </Box>
      : null}
    </Box>
  );
}
