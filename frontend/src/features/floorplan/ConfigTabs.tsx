import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import type { PlanConfigMeta } from '../../types/floorplan.types';

interface ConfigTabsProps {
  configs: PlanConfigMeta[];
  activeId: string;
  readOnly: boolean;
  onSwitch: (id: string) => void;
  /** Adds a new configuration duplicating the current layout */
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Compact layout-configuration tabs pinned to the canvas corner. Click to
 * switch, double-click to rename, + duplicates the current layout into a new
 * tab, × (on the active tab) deletes it.
 */
export function ConfigTabs({ configs, activeId, readOnly, onSwitch, onAdd, onRename, onDelete }: ConfigTabsProps) {
  const [renameTarget, setRenameTarget] = useState<PlanConfigMeta | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PlanConfigMeta | null>(null);

  const commitRename = () => {
    if (renameTarget && renameValue.trim()) onRename(renameTarget.id, renameValue.trim());
    setRenameTarget(null);
  };

  return (
    <Box
      sx={{
        position: 'absolute',
        right: 12,
        bottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        bgcolor: 'rgba(255,255,255,0.92)',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        px: 0.5,
        py: 0.5,
        boxShadow: 1,
      }}
    >
      {configs.map((config) => {
        const active = config.id === activeId;
        return (
          <Box
            key={config.id}
            onClick={() => !active && onSwitch(config.id)}
            onDoubleClick={() => {
              if (readOnly) return;
              setRenameTarget(config);
              setRenameValue(config.name);
            }}
            role="tab"
            aria-selected={active}
            aria-label={`Configuration ${config.name}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.25,
              px: 1,
              py: 0.25,
              borderRadius: 1.5,
              cursor: active ? 'default' : 'pointer',
              bgcolor: active ? 'primary.main' : 'transparent',
              color: active ? 'primary.contrastText' : 'text.secondary',
              '&:hover': active ? undefined : { bgcolor: 'action.hover' },
              userSelect: 'none',
            }}
          >
            <Typography variant="caption" fontWeight={700} sx={{ lineHeight: 1.8 }}>
              {config.name}
            </Typography>
            {active && !readOnly && configs.length > 1 ? (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(config);
                }}
                sx={{ p: 0, color: 'inherit', opacity: 0.8, '&:hover': { opacity: 1 } }}
                aria-label={`Delete configuration ${config.name}`}
              >
                <CloseIcon sx={{ fontSize: 13 }} />
              </IconButton>
            ) : null}
          </Box>
        );
      })}
      {!readOnly && (
        <Tooltip title="New configuration (duplicates current layout)">
          <IconButton size="small" onClick={onAdd} aria-label="Add configuration" sx={{ p: 0.25 }}>
            <AddIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}

      {/* Rename dialog */}
      <Dialog open={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} maxWidth="xs">
        <DialogTitle>Rename configuration</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            size="small"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            inputProps={{ maxLength: 20 }}
            onKeyDown={(e) => e.key === 'Enter' && commitRename()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={commitRename} disabled={!renameValue.trim()}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs">
        <DialogTitle>Delete configuration “{deleteTarget?.name}”?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Everything laid out in this configuration is removed. Other configurations are unaffected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (deleteTarget) onDelete(deleteTarget.id);
              setDeleteTarget(null);
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
