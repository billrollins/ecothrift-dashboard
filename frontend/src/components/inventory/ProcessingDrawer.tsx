import { useEffect, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControlLabel,
  Grid,
  IconButton,
  List,
  ListItemButton,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Close from '@mui/icons-material/Close';
import ContentCopy from '@mui/icons-material/ContentCopy';
import ExpandMore from '@mui/icons-material/ExpandMore';
import LocalPrintshop from '@mui/icons-material/LocalPrintshop';
import NavigateNext from '@mui/icons-material/NavigateNext';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import TaskAlt from '@mui/icons-material/TaskAlt';
import Undo from '@mui/icons-material/Undo';
import type { BatchGroup, Item } from '../../types/inventory.types';

export type DrawerMode = 'item' | 'batch' | null;

export interface ProcessingFormState {
  title: string;
  brand: string;
  category: string;
  condition: string;
  location: string;
  price: string;
  cost: string;
  notes: string;
}

export const EMPTY_FORM: ProcessingFormState = {
  title: '',
  brand: '',
  category: '',
  condition: 'unknown',
  location: '',
  price: '',
  cost: '',
  notes: '',
};

export function buildItemForm(
  item: Item,
  stickyDefaults?: { condition?: string; location?: string } | null,
): ProcessingFormState {
  return {
    title: item.title || '',
    brand: item.brand || '',
    category: item.category || '',
    condition: item.condition || stickyDefaults?.condition || 'unknown',
    location: item.location || stickyDefaults?.location || '',
    price: item.price || '',
    cost: item.cost || '',
    notes: item.notes || '',
  };
}

export function buildBatchForm(
  batch: BatchGroup,
  stickyDefaults?: { condition?: string; location?: string } | null,
): ProcessingFormState {
  return {
    title: '',
    brand: '',
    category: '',
    condition: batch.condition || stickyDefaults?.condition || 'unknown',
    location: batch.location || stickyDefaults?.location || '',
    price: batch.unit_price || '',
    cost: batch.unit_cost || '',
    notes: batch.notes || '',
  };
}

export interface BatchCheckInPartial {
  checkInCount?: number;
  scrapCount?: number;
}

interface ProcessingDrawerProps {
  mode: DrawerMode;
  item: Item | null;
  batch: BatchGroup | null;
  form: ProcessingFormState;
  onFormChange: (form: ProcessingFormState) => void;
  printOnCheckIn: boolean;
  onPrintToggle: (value: boolean) => void;
  onClose: () => void;
  onSave: () => void;
  onCheckIn: (extra?: BatchCheckInPartial) => void;
  onSkipNext: () => void;
  onCopyLast: () => void;
  onReprint: () => void;
  onMarkBroken?: () => void;
  saving: boolean;
  checkingIn: boolean;
  hasLastItem: boolean;
  autoAdvance: boolean;
  batchItemCount?: number;
  justCheckedIn?: boolean;
  batchPendingItems?: Item[];
  batchCheckedInItems?: Item[];
  onOpenBatchItem?: (item: Item) => void;
  onUncheckInItem?: (id: number) => void;
}

export const DRAWER_WIDTH = 420;

export function ProcessingDrawer({
  mode,
  item,
  batch,
  form,
  onFormChange,
  printOnCheckIn,
  onPrintToggle,
  onClose,
  onSave,
  onCheckIn,
  onSkipNext,
  onCopyLast,
  onReprint,
  onMarkBroken,
  saving,
  checkingIn,
  hasLastItem,
  autoAdvance,
  batchItemCount = 0,
  justCheckedIn,
  batchPendingItems = [],
  batchCheckedInItems = [],
  onOpenBatchItem,
  onUncheckInItem,
}: ProcessingDrawerProps) {
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [checkInCount, setCheckInCount] = useState(batchItemCount);
  const [scrapCount, setScrapCount] = useState(0);

  useEffect(() => {
    if (mode === 'batch') {
      setCheckInCount(batchItemCount);
      setScrapCount(0);
    }
  }, [mode, batch?.id, batchItemCount]);

  useEffect(() => {
    if (mode && firstFieldRef.current) {
      setTimeout(() => firstFieldRef.current?.focus(), 150);
    }
  }, [mode, item?.id, batch?.id]);

  const set = (field: keyof ProcessingFormState, value: string) =>
    onFormChange({ ...form, [field]: value });

  const isItem = mode === 'item';
  const isBatch = mode === 'batch';
  const label = isItem ? item?.sku ?? '' : batch?.batch_number ?? '';
  const titleText = isItem
    ? item?.title || item?.product_title || 'Untitled'
    : batch?.product_title || 'Batch';
  const statusChipColor = justCheckedIn ? 'success' as const : 'warning' as const;
  const statusLabel = justCheckedIn
    ? 'Checked In'
    : isItem
      ? item?.status ?? 'intake'
      : `${batchItemCount ?? 0} pending`;

  return (
    <Drawer
      anchor="right"
      open={mode !== null}
      onClose={onClose}
      variant="temporary"
      ModalProps={{ keepMounted: true }}
      PaperProps={{
        sx: {
          width: { xs: '100vw', sm: DRAWER_WIDTH },
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={label}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ fontFamily: 'monospace', fontWeight: 600 }}
            />
            <Chip label={statusLabel} size="small" color={statusChipColor} />
          </Box>
          <IconButton size="small" onClick={onClose} edge="end">
            <Close fontSize="small" />
          </IconButton>
        </Box>
        <Typography variant="subtitle1" fontWeight={600} noWrap>
          {isItem ? 'Process Item' : 'Process Batch'}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {titleText}
        </Typography>
      </Box>

      {/* Scrollable form body */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Source context accordion */}
        {isItem && item && (item.product_title || item.brand || item.cost) && (
          <Accordion
            expanded={sourceExpanded}
            onChange={() => setSourceExpanded(!sourceExpanded)}
            disableGutters
            elevation={0}
            sx={{ border: 1, borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Source Data
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                {item.product_title && (
                  <>
                    <Typography variant="caption" color="text.secondary">Product</Typography>
                    <Typography variant="caption">{item.product_title}</Typography>
                  </>
                )}
                {item.product_number && (
                  <>
                    <Typography variant="caption" color="text.secondary">Product #</Typography>
                    <Typography variant="caption">{item.product_number}</Typography>
                  </>
                )}
                {item.brand && (
                  <>
                    <Typography variant="caption" color="text.secondary">Brand</Typography>
                    <Typography variant="caption">{item.brand}</Typography>
                  </>
                )}
                {item.cost && (
                  <>
                    <Typography variant="caption" color="text.secondary">Cost</Typography>
                    <Typography variant="caption">${Number.parseFloat(item.cost).toFixed(2)}</Typography>
                  </>
                )}
                {item.batch_group_number && (
                  <>
                    <Typography variant="caption" color="text.secondary">Batch</Typography>
                    <Typography variant="caption">{item.batch_group_number}</Typography>
                  </>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}

        {isBatch && batch && (
          <>
            <Accordion
              expanded={sourceExpanded}
              onChange={() => setSourceExpanded(!sourceExpanded)}
              disableGutters
              elevation={0}
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, '&:before': { display: 'none' } }}
            >
              <AccordionSummary expandIcon={<ExpandMore />} sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Batch Info
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                  {batch.product_title && (
                    <>
                      <Typography variant="caption" color="text.secondary">Product</Typography>
                      <Typography variant="caption">{batch.product_title}</Typography>
                    </>
                  )}
                  <Typography variant="caption" color="text.secondary">Total Qty</Typography>
                  <Typography variant="caption">{batch.total_qty}</Typography>
                  <Typography variant="caption" color="text.secondary">Pending</Typography>
                  <Typography variant="caption">{batch.intake_items_count ?? 0}</Typography>
                </Box>
              </AccordionDetails>
            </Accordion>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
              Partial check-in (optional)
            </Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth size="small" type="number" label="Check in qty"
                  value={checkInCount}
                  onChange={(e) => setCheckInCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  slotProps={{ input: { inputProps: { min: 0, max: batchItemCount } } }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth size="small" type="number" label="Mark broken"
                  value={scrapCount}
                  onChange={(e) => setScrapCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  slotProps={{ input: { inputProps: { min: 0, max: batchItemCount } } }}
                />
              </Grid>
            </Grid>
          </>
        )}

        {/* Batch item lists: Pending (clickable) + Checked In (clickable + Unprocess) */}
        {isBatch && (batchPendingItems.length > 0 || batchCheckedInItems.length > 0) && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {batchPendingItems.length > 0 && (
              <Box sx={{ maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ px: 1.5, pt: 1, display: 'block' }}>
                  Pending ({batchPendingItems.length})
                </Typography>
                <List dense disablePadding>
                  {batchPendingItems.map((row) => (
                    <ListItemButton
                      key={row.id}
                      onClick={() => onOpenBatchItem?.(row)}
                      sx={{ py: 0.25 }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                              {row.sku}
                            </Typography>
                            {row.condition && row.condition !== 'unknown' && (
                              <Chip label={row.condition.replace('_', ' ')} size="small" variant="outlined" sx={{ height: 20 }} />
                            )}
                          </Box>
                        }
                        secondary={row.title ? (row.title.length > 40 ? `${row.title.slice(0, 40)}…` : row.title) : '—'}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ noWrap: true }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            )}
            {batchCheckedInItems.length > 0 && (
              <Box sx={{ maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ px: 1.5, pt: 1, display: 'block' }}>
                  Checked In ({batchCheckedInItems.length})
                </Typography>
                <List dense disablePadding>
                  {batchCheckedInItems.map((row) => (
                    <ListItemButton
                      key={row.id}
                      onClick={() => onOpenBatchItem?.(row)}
                      sx={{ py: 0.25 }}
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                              {row.sku}
                            </Typography>
                            {row.condition && row.condition !== 'unknown' && (
                              <Chip label={row.condition.replace('_', ' ')} size="small" variant="outlined" sx={{ height: 20 }} />
                            )}
                          </Box>
                        }
                        secondary={row.title ? (row.title.length > 40 ? `${row.title.slice(0, 40)}…` : row.title) : '—'}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ noWrap: true }}
                      />
                      <ListItemSecondaryAction>
                        <Tooltip title="Unprocess (revert to pending)">
                          <IconButton
                            size="small"
                            edge="end"
                            onClick={(e) => {
                              e.stopPropagation();
                              onUncheckInItem?.(row.id);
                            }}
                          >
                            <Undo fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </ListItemSecondaryAction>
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        )}

        {/* Copy from Last */}
        {hasLastItem && (
          <Button
            size="small"
            variant="text"
            startIcon={<ContentCopy />}
            onClick={onCopyLast}
            sx={{ alignSelf: 'flex-start' }}
          >
            Copy from Last
          </Button>
        )}

        {/* Form fields */}
        {isItem && (
          <>
            <TextField
              label="Title"
              fullWidth
              size="small"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              inputRef={firstFieldRef}
            />
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth size="small" label="Brand"
                  value={form.brand}
                  onChange={(e) => set('brand', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth size="small" label="Category"
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                />
              </Grid>
            </Grid>
          </>
        )}

        <Grid container spacing={1.5}>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth select size="small" label="Condition"
              value={form.condition}
              onChange={(e) => set('condition', e.target.value)}
              inputRef={isBatch ? firstFieldRef : undefined}
            >
              <MenuItem value="new">New</MenuItem>
              <MenuItem value="like_new">Like New</MenuItem>
              <MenuItem value="good">Good</MenuItem>
              <MenuItem value="fair">Fair</MenuItem>
              <MenuItem value="salvage">Salvage</MenuItem>
              <MenuItem value="unknown">Unknown</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth size="small" label="Location"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
            />
          </Grid>
        </Grid>

        <Grid container spacing={1.5}>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth size="small"
              label={isBatch ? 'Unit Price' : 'Price'}
              type="number"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
              slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth size="small"
              label={isBatch ? 'Unit Cost' : 'Cost'}
              type="number"
              value={form.cost}
              onChange={(e) => set('cost', e.target.value)}
              slotProps={{ input: { inputProps: { min: 0, step: '0.01' } } }}
            />
          </Grid>
        </Grid>

        <TextField
          label="Notes" size="small" multiline minRows={2}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />

        <FormControlLabel
          control={
            <Checkbox size="small" checked={printOnCheckIn} onChange={(e) => onPrintToggle(e.target.checked)} />
          }
          label={<Typography variant="body2">Print label(s) after check-in</Typography>}
        />
      </Box>

      {/* Action footer */}
      <Divider />
      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {isItem && onMarkBroken && (
            <Button
              variant="outlined"
              size="small"
              color="error"
              onClick={onMarkBroken}
              disabled={saving || checkingIn}
            >
              Mark Broken
            </Button>
          )}
          <Button
            fullWidth variant="outlined" size="small"
            startIcon={saving ? <CircularProgress size={14} /> : <SaveOutlined />}
            onClick={onSave}
            disabled={saving || checkingIn}
          >
            Save Only
          </Button>
          <Button
            fullWidth variant="contained" size="small"
            startIcon={checkingIn ? <CircularProgress size={14} color="inherit" /> : printOnCheckIn ? <LocalPrintshop /> : <TaskAlt />}
            onClick={() => onCheckIn(isBatch ? { checkInCount, scrapCount } : undefined)}
            disabled={saving || checkingIn}
          >
            {checkingIn ? 'Checking in...' : printOnCheckIn ? 'Check-In & Print' : 'Check-In'}
          </Button>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {justCheckedIn && (
            <Tooltip title="Reprint label for this item">
              <Button size="small" variant="text" startIcon={<LocalPrintshop />} onClick={onReprint}>
                Reprint
              </Button>
            </Tooltip>
          )}
          {!autoAdvance && (
            <Button
              size="small" variant="text"
              endIcon={<NavigateNext />}
              onClick={onSkipNext}
              sx={{ ml: 'auto' }}
            >
              Next
            </Button>
          )}
        </Box>
        <Typography variant="caption" color="text.secondary" textAlign="center">
          Enter = Check-In{' '}&middot;{' '}Esc = Close{' '}&middot;{' '}F2 = Scanner
        </Typography>
      </Box>
    </Drawer>
  );
}
