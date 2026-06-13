import { useMemo, useState, type ReactElement } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ChipProps } from '@mui/material/Chip';
import AddCircleOutline from '@mui/icons-material/AddCircleOutline';
import BoltOutlined from '@mui/icons-material/BoltOutlined';
import CheckCircleOutline from '@mui/icons-material/CheckCircleOutline';
import LinkIcon from '@mui/icons-material/Link';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import type { PreprocessingMatchCandidate, PreprocessingReviewRow } from '../../api/inventory.api';
import type { Product } from '../../types/inventory.types';
import { apiErrorDetail, useProductSearch } from '../../hooks/useProductSearch';
export interface PreprocessingMatchCellProps {
  row: PreprocessingReviewRow;
  isUpdating?: boolean;
  getRowByNumber: (rowNumber: number) => PreprocessingReviewRow | undefined;
  onSetMatch: (rowId: number, finalMatchedProduct: number | null, decision?: 'unset') => Promise<void>;
}

type ChipState =
  | 'undecided_empty'
  | 'undecided_candidates'
  | 'auto'
  | 'staff_matched'
  | 'staff_new';

function resolveChipState(row: PreprocessingReviewRow): ChipState {
  if (row.final_matched_product != null) {
    return row.match_source === 'auto' ? 'auto' : 'staff_matched';
  }
  if (row.match_source === 'staff') {
    return 'staff_new';
  }
  if ((row.match_candidates?.length ?? 0) > 0) {
    return 'undecided_candidates';
  }
  return 'undecided_empty';
}

function chipLabel(row: PreprocessingReviewRow, state: ChipState): string {
  if (state === 'staff_new') return 'New product';
  if (state === 'undecided_empty') return 'Match…';
  const detail = row.matched_product_detail;
  const num = detail?.product_number;
  if (state === 'undecided_candidates') {
    const top = row.match_candidates[0];
    const preview = top?.snapshot?.product_number || `PRD-${top?.product_id}`;
    const extra = row.match_candidates.length > 1 ? ` +${row.match_candidates.length - 1}` : '';
    return `? ${preview}${extra}`;
  }
  if (num) {
    const title = detail?.title?.trim();
    if (title && title.length <= 12) return num;
    return num;
  }
  return detail?.title?.slice(0, 18) || 'Product';
}

function chipTooltip(row: PreprocessingReviewRow, state: ChipState): string {
  if (state === 'staff_new') return 'Staff marked as new product at check-in';
  if (state === 'undecided_empty') return 'No match candidates — search catalog';
  const detail = row.matched_product_detail;
  if (detail) {
    return [detail.title, detail.brand, detail.identifiers?.upc || detail.upc].filter(Boolean).join(' · ');
  }
  const top = row.match_candidates[0]?.snapshot;
  if (top) {
    return [top.title, top.brand, top.identifiers?.upc].filter(Boolean).join(' · ');
  }
  return 'Product match';
}

function sourceBadge(source: PreprocessingMatchCandidate['source']): string {
  if (source === 'upc') return 'UPC';
  if (source === 'vendor_ref') return 'Vendor';
  return 'Text';
}

const CHIP_STYLE: Record<
  ChipState,
  { color: ChipProps['color']; variant: ChipProps['variant']; icon?: ReactElement }
> = {
  undecided_empty: { color: 'default', variant: 'outlined', icon: <SearchOutlined sx={{ fontSize: 14 }} /> },
  undecided_candidates: { color: 'info', variant: 'outlined' },
  auto: { color: 'info', variant: 'filled', icon: <BoltOutlined sx={{ fontSize: 14 }} /> },
  staff_matched: { color: 'success', variant: 'filled', icon: <CheckCircleOutline sx={{ fontSize: 14 }} /> },
  staff_new: { color: 'success', variant: 'outlined', icon: <AddCircleOutline sx={{ fontSize: 14 }} /> },
};
export function PreprocessingMatchCell({
  row,
  isUpdating = false,
  getRowByNumber,
  onSetMatch,
}: PreprocessingMatchCellProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [sameAsRowNum, setSameAsRowNum] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const open = Boolean(anchorEl);

  const chipState = resolveChipState(row);
  const label = chipLabel(row, chipState);
  const tooltip = chipTooltip(row, chipState);

  const searchEnabled = open && productSearch.trim().length >= 2;
  const { products: productOptions, isFetching: productsLoading } = useProductSearch(
    'preprocessing-match',
    productSearch,
    searchEnabled,
    20,
  );

  const sortedCandidates = useMemo(
    () => [...(row.match_candidates ?? [])].sort((a, b) => b.score - a.score),
    [row.match_candidates],
  );

  const { color: chipColor, variant: chipVariant, icon: chipIcon } = CHIP_STYLE[chipState];

  async function runMatch(productId: number | null, decision?: 'unset') {
    setActionError(null);
    try {
      await onSetMatch(row.id, productId, decision);
      setAnchorEl(null);
    } catch (err) {
      setActionError(apiErrorDetail(err, 'Failed to save match'));
    }
  }
  function handleSameAsRow() {
    const num = Number.parseInt(sameAsRowNum, 10);
    if (!Number.isFinite(num) || num <= 0) {
      setActionError('Enter a valid row number');
      return;
    }
    const source = getRowByNumber(num);
    if (!source) {
      setActionError(`Row ${num} not on this page — search the product instead`);
      return;
    }
    if (source.final_matched_product == null) {
      setActionError(`Row ${num} has no product match`);
      return;
    }
    void runMatch(source.final_matched_product);
  }

  return (
    <>
      <Box sx={{ position: 'relative', display: 'inline-flex', maxWidth: '100%' }}>
        <Chip
          size="small"
          label={label}
          color={chipColor}
          variant={chipVariant}
          icon={chipIcon}
          onClick={(e) => {
            setActionError(null);
            setAnchorEl(e.currentTarget);
          }}
          title={tooltip}
          sx={{
            maxWidth: '100%',
            height: 22,
            fontSize: 11,
            '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis', px: 0.75 },
            '& .MuiChip-icon': { fontSize: 13, ml: 0.5 },
          }}
        />
        {(row.same_product_row_numbers?.length ?? 0) > 0 ? (
          <LinkIcon sx={{ fontSize: 14, ml: 0.25, color: 'text.secondary', alignSelf: 'center' }} />
        ) : null}
        {isUpdating ? (
          <CircularProgress
            size={14}
            sx={{ position: 'absolute', top: -4, right: -4, bgcolor: 'background.paper', borderRadius: '50%' }}
          />
        ) : null}
      </Box>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 320, maxWidth: '95vw', p: 1.5 } } }}
      >
        <Stack spacing={1.25}>
          {sortedCandidates.length > 0 ? (
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                Suggestions
              </Typography>
              <List dense disablePadding>
                {sortedCandidates.map((c, idx) => (
                  <ListItemButton
                    key={`${c.product_id}-${c.source}`}
                    onClick={() => void runMatch(c.product_id)}
                    sx={{
                      borderRadius: 1,
                      mb: 0.25,
                      bgcolor: idx === 0 ? 'action.selected' : undefined,
                    }}
                  >
                    <ListItemText
                      primary={`${c.snapshot?.product_number || `PRD-${c.product_id}`} — ${c.snapshot?.title || 'Product'}`}
                      secondary={`${sourceBadge(c.source)} · score ${c.score}${c.snapshot?.identifiers?.upc ? ` · ${c.snapshot.identifiers.upc}` : ''}`}
                      primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          ) : null}

          {chipState === 'auto' && row.final_matched_product != null ? (
            <Button size="small" variant="contained" color="success" onClick={() => void runMatch(row.final_matched_product)}>
              Confirm match
            </Button>
          ) : null}

          <Divider />

          <Autocomplete
            size="small"
            options={productOptions}
            loading={productsLoading}
            filterOptions={(x) => x}
            onInputChange={(_e, v) => setProductSearch(v)}
            onChange={(_e, v: Product | null) => {
              if (v) void runMatch(v.id);
            }}
            getOptionLabel={(o) => `${o.product_number ?? o.id} — ${o.title}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search catalog"
                placeholder="Type 2+ chars…"
                helperText={productSearch.trim().length < 2 ? 'Min 2 characters' : undefined}
              />
            )}
          />

          <Stack direction="row" spacing={1}>
            {chipState !== 'staff_new' ? (
              <Tooltip title="At check-in this row will create a new catalog product from its own fields.">
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  startIcon={<AddCircleOutline />}
                  onClick={() => void runMatch(null)}
                >
                  New product
                </Button>
              </Tooltip>
            ) : null}
            {row.final_matched_product != null || chipState === 'staff_new' ? (
              <Tooltip title="Remove the decision entirely — back to undecided (auto-matching may suggest again).">
                <Button
                  size="small"
                  variant="outlined"
                  color="inherit"
                  onClick={() => void runMatch(null, 'unset')}
                >
                  {chipState === 'staff_new' ? 'Clear decision' : 'Remove match'}
                </Button>
              </Tooltip>
            ) : null}
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              size="small"
              label="Same as row"
              type="number"
              value={sameAsRowNum}
              onChange={(e) => setSameAsRowNum(e.target.value)}
              sx={{ width: 100 }}
              slotProps={{ input: { inputProps: { min: 1 } } }}
            />
            <Button size="small" variant="outlined" onClick={handleSameAsRow}>
              Apply
            </Button>
          </Stack>

          {(row.same_product_row_numbers?.length ?? 0) > 0 ? (
            <Typography variant="caption" color="text.secondary">
              Also rows {row.same_product_row_numbers.join(', ')}
            </Typography>
          ) : null}

          {actionError ? (
            <Typography variant="caption" color="error">
              {actionError}
            </Typography>
          ) : null}
        </Stack>
      </Popover>
    </>
  );
}
