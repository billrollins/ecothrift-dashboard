import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Switch,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  Divider,
} from '@mui/material';

export interface ProcessingSettingsModalProps {
  open: boolean;
  onClose: () => void;
  autoAdvance: boolean;
  onAutoAdvanceChange: (value: boolean) => void;
  printOnCheckIn: boolean;
  onPrintOnCheckInChange: (value: boolean) => void;
  stickyCondition: string;
  stickyLocation: string;
  onStickyChange: (condition: string, location: string) => void;
}

const HOTKEYS: { keys: string; description: string }[] = [
  { keys: 'F2', description: 'Focus scanner / search' },
  { keys: '/ or Ctrl+F', description: 'Focus general search' },
  { keys: '1 / 2 / 3', description: 'Switch to Batches / Items / Checked In tab' },
  { keys: 'Enter', description: 'Check in (when drawer open)' },
  { keys: 'Ctrl+Enter', description: 'Check in (when drawer open)' },
  { keys: 'Escape', description: 'Close drawer' },
  { keys: 'Ctrl+P', description: 'Reprint label (when drawer open)' },
  { keys: 'Ctrl+N', description: 'Next item (when drawer open)' },
  { keys: 'Ctrl+B', description: 'Mark current item broken (when drawer open)' },
  { keys: 'Ctrl+D', description: 'Detach from batch (when drawer open)' },
  { keys: '?', description: 'Open this settings modal' },
];

export function ProcessingSettingsModal({
  open,
  onClose,
  autoAdvance,
  onAutoAdvanceChange,
  printOnCheckIn,
  onPrintOnCheckInChange,
  stickyCondition,
  stickyLocation,
  onStickyChange,
}: ProcessingSettingsModalProps) {
  const [localCondition, setLocalCondition] = useState(stickyCondition);
  const [localLocation, setLocalLocation] = useState(stickyLocation);

  useEffect(() => {
    if (open) {
      setLocalCondition(stickyCondition);
      setLocalLocation(stickyLocation);
    }
  }, [open, stickyCondition, stickyLocation]);

  const handleSaveSticky = () => {
    onStickyChange(localCondition, localLocation);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Processing settings</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0 }}>
          <FormControlLabel
            control={
              <Switch
                checked={autoAdvance}
                onChange={(e) => onAutoAdvanceChange(e.target.checked)}
              />
            }
            label="Auto-advance to next item after check-in"
          />
          <FormControlLabel
            control={
              <Switch
                checked={printOnCheckIn}
                onChange={(e) => onPrintOnCheckInChange(e.target.checked)}
              />
            }
            label="Print label(s) after check-in"
          />
          <Divider sx={{ my: 1 }} />
          <Typography variant="subtitle2" color="text.secondary">
            Sticky defaults (pre-fill condition/location in drawer)
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Default condition"
              value={localCondition}
              onChange={(e) => setLocalCondition(e.target.value)}
              placeholder="e.g. good"
              sx={{ minWidth: 140 }}
            />
            <TextField
              size="small"
              label="Default location"
              value={localLocation}
              onChange={(e) => setLocalLocation(e.target.value)}
              placeholder="e.g. A-1"
              sx={{ minWidth: 140 }}
            />
            <Button size="small" variant="outlined" onClick={handleSaveSticky}>
              Save defaults
            </Button>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Typography variant="subtitle2" color="text.secondary">
            Keyboard shortcuts
          </Typography>
          <List dense disablePadding sx={{ bgcolor: 'action.hover', borderRadius: 1 }}>
            {HOTKEYS.map(({ keys, description }, i) => (
              <ListItem key={i} sx={{ py: 0.25 }}>
                <ListItemText
                  primary={description}
                  secondary={keys}
                  primaryTypographyProps={{ variant: 'body2' }}
                  secondaryTypographyProps={{ variant: 'caption', component: 'kbd' }}
                />
              </ListItem>
            ))}
          </List>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
