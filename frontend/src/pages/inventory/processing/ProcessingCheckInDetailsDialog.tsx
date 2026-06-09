import Close from '@mui/icons-material/Close';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import OpenInNew from '@mui/icons-material/OpenInNew';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Link,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type {
  ProcessingCheckInBatchDTO,
  ProcessingWorkspaceItemDTO,
} from '../../../types/inventory.types';
import { processingTokens } from './processingTokens';

const CONDITION_OPTIONS = ['New', 'Like New', 'Very Good', 'Used Good', 'Used Fair', 'Salvage'];

const DISPATCH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'on_shelf', label: 'On shelf / floor' },
  { value: 'restoration', label: 'Restoration' },
  { value: 'back_storage', label: 'Back storage' },
  { value: 'online_sales', label: 'Online sales' },
  { value: 'salvage', label: 'Salvage' },
];

const DISPUTE_REASON_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'broken', label: 'Broken' },
  { value: 'missing_pieces', label: 'Missing pieces' },
  { value: 'cosmetic_damage', label: 'Cosmetic damage' },
  { value: 'missing_critical_piece', label: 'Missing critical piece' },
  { value: 'bad_condition', label: 'Bad condition' },
  { value: 'other', label: 'Other' },
];

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export interface ProcessingCheckInDetailsDialogProps {
  open: boolean;
  item: ProcessingWorkspaceItemDTO | null;
  batch: ProcessingCheckInBatchDTO | null;
  loading: boolean;
  conditionUi: string;
  dispatch: string;
  price: string;
  retail: string;
  editDisputed: boolean;
  editDisputeType: string;
  editDisputePct: string;
  editDisputeDescription: string;
  salvageLocked: boolean;
  disputeEditValid: boolean;
  onClose: () => void;
  onSelectItemId: (itemId: number) => void;
  onConditionChange: (value: string) => void;
  onDispatchChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onRetailChange: (value: string) => void;
  onEditDisputedChange: (value: boolean) => void;
  onEditDisputeTypeChange: (value: string) => void;
  onEditDisputePctChange: (value: string) => void;
  onEditDisputeDescriptionChange: (value: string) => void;
  onSave: () => void;
  onReprint: () => void;
  onOpenItem: () => void;
}

export function ProcessingCheckInDetailsDialog({
  open,
  item,
  batch,
  loading,
  conditionUi,
  dispatch,
  price,
  retail,
  editDisputed,
  editDisputeType,
  editDisputePct,
  editDisputeDescription,
  salvageLocked,
  disputeEditValid,
  onClose,
  onSelectItemId,
  onConditionChange,
  onDispatchChange,
  onPriceChange,
  onRetailChange,
  onEditDisputedChange,
  onEditDisputeTypeChange,
  onEditDisputePctChange,
  onEditDisputeDescriptionChange,
  onSave,
  onReprint,
  onOpenItem,
}: ProcessingCheckInDetailsDialogProps) {
  if (!item) return null;

  const editable = item.status === 'on_shelf';
  const batchItems = batch?.items ?? [item];
  const subtitle = batch ?
      `Batch #${batch.id} · ${batch.quantity} item${batch.quantity === 1 ? '' : 's'} · ${formatDateTime(batch.created_at)}`
    : `Single check-in · ${formatDateTime(item.checked_in_at)}`;

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pb: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary">
            Details
          </Typography>
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
            {item.sku}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {subtitle}
          </Typography>
        </Box>
        <IconButton aria-label="Close details" onClick={onClose} disabled={loading} sx={{ mt: -0.5 }}>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {batch && batchItems.length > 1 ?
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', mb: 0.75 }}>
                Items in this check-in
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {batchItems.map((batchItem) => (
                  <Chip
                    key={batchItem.id}
                    size="small"
                    label={batchItem.sku}
                    variant={batchItem.id === item.id ? 'filled' : 'outlined'}
                    color={batchItem.id === item.id ? 'primary' : 'default'}
                    onClick={() => onSelectItemId(batchItem.id)}
                    sx={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.72rem' }}
                  />
                ))}
              </Stack>
            </Box>
          : null}

          <Box
            sx={{
              p: 1.5,
              borderRadius: 1,
              border: 1,
              borderColor: processingTokens.border,
              bgcolor: processingTokens.surfaceTint,
            }}
          >
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              {editable ? 'Edit item' : 'Item summary'}
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                gap: 1,
              }}
            >
              <TextField
                label="Shelf price"
                size="small"
                value={price}
                disabled={!editable}
                onChange={(e) => onPriceChange(e.target.value)}
                fullWidth
              />
              <TextField
                label="Retail"
                size="small"
                value={retail}
                disabled={!editable}
                onChange={(e) => onRetailChange(e.target.value)}
                fullWidth
              />
              <TextField
                select
                label="Condition"
                size="small"
                value={conditionUi}
                disabled={!editable}
                onChange={(e) => onConditionChange(e.target.value)}
                fullWidth
              >
                {CONDITION_OPTIONS.map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Location"
                size="small"
                value={dispatch}
                disabled={!editable || salvageLocked}
                helperText={salvageLocked ? 'Salvage routes to salvage.' : undefined}
                onChange={(e) => onDispatchChange(e.target.value)}
                fullWidth
              >
                {DISPATCH_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </TextField>
            </Box>

            {editable ?
              <Box sx={{ mt: 1.25 }}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={editDisputed}
                      onChange={(_, v) => {
                        onEditDisputedChange(v);
                        if (!v) {
                          onEditDisputeTypeChange('');
                          onEditDisputePctChange('');
                          onEditDisputeDescriptionChange('');
                        }
                      }}
                    />
                  }
                  label={<Typography variant="body2">Disputed</Typography>}
                />
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
                    gap: 1,
                  }}
                >
                  <TextField
                    select
                    label="Reason"
                    size="small"
                    value={editDisputeType}
                    disabled={!editDisputed}
                    onChange={(e) => onEditDisputeTypeChange(e.target.value)}
                    fullWidth
                  >
                    {DISPUTE_REASON_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Percent"
                    size="small"
                    type="number"
                    value={editDisputePct}
                    disabled={!editDisputed}
                    onChange={(e) => onEditDisputePctChange(e.target.value)}
                    slotProps={{ htmlInput: { min: 0, max: 100 } }}
                    fullWidth
                  />
                  <TextField
                    label="Notes"
                    size="small"
                    value={editDisputeDescription}
                    disabled={!editDisputed}
                    onChange={(e) => onEditDisputeDescriptionChange(e.target.value)}
                    fullWidth
                    sx={{ gridColumn: { md: '1 / -1' } }}
                  />
                </Box>
              </Box>
            : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Status: {item.status.replace(/_/g, ' ')} · view-only for dispositioned items.
              </Typography>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1, flexWrap: 'wrap' }}>
        <Button onClick={onClose} disabled={loading}>
          Close
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" startIcon={<LocalPrintshop fontSize="small" />} onClick={onReprint}>
          Reprint
        </Button>
        {editable ?
          <Button size="small" variant="contained" disabled={loading || !disputeEditValid} onClick={onSave}>
            Save
          </Button>
        : null}
        <Button size="small" variant="text" startIcon={<OpenInNew fontSize="small" />} onClick={onOpenItem}>
          Open item
        </Button>
      </DialogActions>
    </Dialog>
  );
}
