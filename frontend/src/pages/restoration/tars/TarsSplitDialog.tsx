import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { RestorationJobDTO, RestorationJobSplitPayload } from '../../../types/inventory.types';

type SplitMode = 'individuals' | 'stacks';

interface TarsSplitDialogProps {
  open: boolean;
  job: RestorationJobDTO | null;
  pending: boolean;
  onClose: () => void;
  onSplit: (payload: RestorationJobSplitPayload) => void;
}

function parseStackSizes(raw: string, maxItems: number): number[] | null {
  const parts = raw
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const sizes: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1) return null;
    sizes.push(n);
  }
  const total = sizes.reduce((sum, n) => sum + n, 0);
  // Sizes may cover the whole stack — the backend deletes the source job when
  // no items remain — but may not exceed it.
  if (total > maxItems) return null;
  return sizes;
}

export function TarsSplitDialog({ open, job, pending, onClose, onSplit }: TarsSplitDialogProps) {
  const [mode, setMode] = useState<SplitMode>('individuals');
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [stackSizesRaw, setStackSizesRaw] = useState('');

  const items = job?.items ?? [];

  useEffect(() => {
    if (!open || !job) return;
    setMode('individuals');
    setSelectedItemIds(items.map((item) => item.id));
    setStackSizesRaw('');
  }, [open, job, items]);

  const stackSizes = useMemo(
    () => (mode === 'stacks' ? parseStackSizes(stackSizesRaw, items.length) : null),
    [items.length, mode, stackSizesRaw],
  );

  const stackSizesError =
    mode === 'stacks' && stackSizesRaw.trim() !== '' && stackSizes == null ?
      `Enter positive whole numbers totaling at most ${items.length}.`
    : null;

  const stackPreview = useMemo(() => {
    if (!stackSizes || items.length === 0) return [];
    let cursor = 0;
    return stackSizes.map((size, index) => {
      const group = items.slice(cursor, cursor + size);
      cursor += size;
      return { index: index + 1, size, skus: group.map((item) => item.sku) };
    });
  }, [items, stackSizes]);

  const remainingCount =
    mode === 'stacks' && stackSizes ?
      items.length - stackSizes.reduce((sum, n) => sum + n, 0)
    : mode === 'individuals' ?
      items.length - selectedItemIds.length
    : items.length;

  const canSubmit =
    job != null &&
    !pending &&
    (
      mode === 'individuals' ?
        selectedItemIds.length > 0
      : stackSizes != null && stackSizes.length > 0
    );

  const handleSubmit = () => {
    if (!job || !canSubmit) return;

    if (mode === 'individuals') {
      onSplit({
        groups: selectedItemIds.map((itemId) => ({ item_ids: [itemId] })),
      });
      return;
    }

    if (!stackSizes) return;
    let cursor = 0;
    const groups = stackSizes.map((size) => {
      const group = items.slice(cursor, cursor + size).map((item) => item.id);
      cursor += size;
      return { item_ids: group };
    });
    onSplit({ groups });
  };

  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Split stack</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Split items out of this stack into separate queue cards. Unassigned items stay on the
            original stack.
          </Typography>

          <RadioGroup
            row
            value={mode}
            onChange={(e) => setMode(e.target.value as SplitMode)}
          >
            <FormControlLabel value="individuals" control={<Radio />} label="Into individuals" />
            <FormControlLabel value="stacks" control={<Radio />} label="Into stacks" />
          </RadioGroup>

          {mode === 'individuals' ?
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                maxHeight: 240,
                overflowY: 'auto',
              }}
            >
              {items.map((item) => (
                <FormControlLabel
                  key={item.id}
                  sx={{ display: 'flex', mx: 0, px: 1.5, py: 0.25 }}
                  control={
                    <Checkbox
                      checked={selectedItemIds.includes(item.id)}
                      onChange={(e) => {
                        setSelectedItemIds((prev) =>
                          e.target.checked ?
                            [...prev, item.id]
                          : prev.filter((id) => id !== item.id),
                        );
                      }}
                    />
                  }
                  label={
                    <Typography variant="body2" fontFamily="monospace">
                      {item.sku}
                    </Typography>
                  }
                />
              ))}
            </Box>
          : <Stack spacing={1.5}>
              <TextField
                label="Stack sizes"
                placeholder="e.g. 4, 3"
                value={stackSizesRaw}
                onChange={(e) => setStackSizesRaw(e.target.value)}
                error={stackSizesError != null}
                helperText={
                  stackSizesError ??
                  'Comma-separated counts taken from the front of this stack (by item order).'
                }
                fullWidth
              />
              {stackPreview.length > 0 ?
                <Stack spacing={0.75}>
                  {stackPreview.map((row) => (
                    <Typography key={row.index} variant="caption" color="text.secondary">
                      Stack {row.index}: {row.size} item{row.size === 1 ? '' : 's'} (
                      {row.skus.join(', ')})
                    </Typography>
                  ))}
                </Stack>
              : null}
            </Stack>
          }

          <Typography variant="caption" color="text.secondary">
            {remainingCount} item{remainingCount === 1 ? '' : 's'} will remain on the original stack.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={handleSubmit}>
          Split stack
        </Button>
      </DialogActions>
    </Dialog>
  );
}
