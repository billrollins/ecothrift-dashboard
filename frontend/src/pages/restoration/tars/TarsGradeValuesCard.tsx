import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import Send from '@mui/icons-material/Send';
import Save from '@mui/icons-material/Save';
import Add from '@mui/icons-material/Add';
import { useEffect, useMemo, useState } from 'react';
import { TARS_GRADE_DOT_COLORS, TARS_GRADE_SCALES } from './tarsConstants';
import {
  lookupGradeSuggestions,
  pctFromValue,
  suggestedValueFromPct,
  type GradeSuggestionDims,
} from './tarsGradeSuggestions';
import { gradeValuesComplete, gradesForScale, emptyValuesForScale } from './tarsProfit';
import { formatRichSearch, inventoryWorkbenchUrl, itemCatalogWorkbenchUrl, productCatalogWorkbenchUrl } from '../../../utils/richInventorySearch';
import {
  useCreateRestorationGradeScale,
  useSuggestedGradeScale,
} from '../../../hooks/useGradeScales';

const CARD_HEADER_MIN_HEIGHT = 132;

function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMoneyInput(value: number): string {
  return Number.isFinite(value) && value > 0 ? value.toFixed(2) : '';
}

function formatPctInput(value: number | null): string {
  return value != null && Number.isFinite(value) ? String(value) : '';
}

function parseDecoratedNumber(raw: string): number {
  const value = Number.parseFloat(raw.replace(/[$,%\s,]/g, ''));
  return Number.isFinite(value) ? value : 0;
}

export const hideNumberSpinnerSx = {
  '& input[type=number]': { MozAppearance: 'textfield' },
  '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0,
  },
} as const;

export const GRADE_VALUE_FIELD_WIDTH = 172;
export const GRADE_PCT_FIELD_WIDTH = 108;
export const GRADE_SUGGEST_BTN_MIN_WIDTH = 112;

export interface TarsGradeValuesCardItem {
  sku?: string;
  /** Stack display label — e.g. ITM123 or ITM123 +4 */
  skuLabel?: string;
  catalogItemId?: number;
  catalogItemIds?: number[];
  productId?: number;
  orderId?: number;
  stackQuantity?: number;
  orderNumber?: string;
  name: string;
  brand?: string;
  model?: string;
  productNumber?: string;
  upc?: string;
  /** Vendor / marketplace label for chips and suggestion filter. */
  source?: string;
  category: string;
  condition?: string;
  retail?: number;
  price?: number;
}

export interface RestorationGradeConfig {
  scale: string;
  values: Record<string, number>;
}

export interface TarsGradeValuesCardProps {
  item: TarsGradeValuesCardItem;
  scale: string;
  values: Record<string, number>;
  onScaleChange: (scale: string) => void;
  onGradeValueChange: (grade: string, value: number) => void;
  scales?: Record<string, string[]>;
  /** Primary action at the bottom of the card (Queue page — Save grade values). */
  sendAction?: {
    disabled?: boolean;
    onSend: () => void;
    label?: string;
    requireCompleteGrades?: boolean;
  };
  secondaryAction?: {
    disabled?: boolean;
    onClick: () => void;
    label: string;
  };
  /** When true, card stretches to fill parent height (Queue layout). */
  fillHeight?: boolean;
  /** Increment after Save to format editable money/percent fields. */
  formatVersion?: number;
}

export function TarsGradeValuesCard({
  item,
  scale,
  values,
  onScaleChange,
  onGradeValueChange,
  scales = TARS_GRADE_SCALES,
  sendAction,
  secondaryAction,
  fillHeight = false,
  formatVersion = 0,
}: TarsGradeValuesCardProps) {
  const grades = scale ? gradesForScale(scale, scales) : [];
  const canSend = gradeValuesComplete(scale, values, scales);
  const retailBase = item.retail ?? 0;
  const completeCount = grades.filter((grade) => (values[grade] ?? 0) > 0).length;
  const productFacts: Array<{ label: string; value: string }> = [
    { label: 'Brand', value: item.brand ?? '' },
    { label: 'Category', value: item.category },
    { label: 'Condition', value: item.condition?.replace(/_/g, ' ') ?? '' },
  ].filter((fact) => Boolean(fact.value));
  const stackItemIds = item.catalogItemIds?.length ?
    item.catalogItemIds
  : item.catalogItemId ?
    [item.catalogItemId]
  : [];
  const itemSkuLabel = item.skuLabel ?? item.sku;
  const hierarchyItems = [
    {
      label: 'Order',
      value: item.orderNumber ? `#${item.orderNumber}` : '—',
      mono: true,
      href: item.orderId ? `/inventory/orders/${item.orderId}` : undefined,
      title: item.orderId ? `Open order ${item.orderNumber}` : undefined,
    },
    {
      label: 'Prod',
      value: item.productNumber || (item.productId ? `prod=${item.productId}` : '—'),
      mono: true,
      href: item.productId ? productCatalogWorkbenchUrl(item.productId, item.productNumber) : undefined,
      openInNewTab: true,
      title: item.productId ? `Open product ${item.productNumber || item.productId} in catalog` : undefined,
    },
    {
      label: 'Items',
      value: item.skuLabel ?? item.sku ?? '—',
      mono: true,
      href:
        item.catalogItemId && itemSkuLabel ?
          itemCatalogWorkbenchUrl(item.catalogItemId, itemSkuLabel)
        : stackItemIds.length ?
          inventoryWorkbenchUrl({
            tab: 'items',
            q: formatRichSearch({ filters: { ids: stackItemIds.join(',') }, entity: 'items' }),
            selected: item.catalogItemId && item.sku ? { type: 'item', id: item.catalogItemId, label: item.sku } : undefined,
          })
        : undefined,
      openInNewTab: Boolean(item.catalogItemId || stackItemIds.length),
      title:
        item.catalogItemId && itemSkuLabel ?
          `Open item ${itemSkuLabel} in catalog`
        : stackItemIds.length ?
          `Open ${stackItemIds.length} stack item${stackItemIds.length === 1 ? '' : 's'} in catalog`
        : undefined,
    },
  ];
  const metricCards = [
    { label: 'Items in stack', value: String(item.stackQuantity ?? 1) },
    { label: 'Retail', value: formatUsd(item.retail ?? 0) },
    { label: 'Price', value: formatUsd(item.price ?? 0) },
    { label: 'Values', value: `${completeCount}/${grades.length || '—'}` },
  ];

  const [suggestionDims, setSuggestionDims] = useState<GradeSuggestionDims>({
    vendor: true,
    brand: true,
    category: true,
  });
  const [moneyDrafts, setMoneyDrafts] = useState<Record<string, string>>({});
  const [pctDrafts, setPctDrafts] = useState<Record<string, string>>({});
  const [newScaleOpen, setNewScaleOpen] = useState(false);
  const [newScaleName, setNewScaleName] = useState('');
  const [newScaleGrades, setNewScaleGrades] = useState('');

  const createScale = useCreateRestorationGradeScale();
  const { data: suggestedScaleResult } = useSuggestedGradeScale(
    {
      source: item.source,
      brand: item.brand,
      category: item.category,
      filter_vendor: suggestionDims.vendor,
      filter_brand: suggestionDims.brand,
      filter_category: suggestionDims.category,
    },
    { enabled: Boolean(item.category) },
  );
  const suggestedScale = suggestedScaleResult?.scale ?? null;
  const suggestedScaleCount = suggestedScaleResult?.count ?? 0;

  useEffect(() => {
    setMoneyDrafts({});
    setPctDrafts({});
  }, [item.catalogItemId, item.skuLabel, scale]);

  useEffect(() => {
    setMoneyDrafts(
      Object.fromEntries(
        grades.map((grade) => [grade, formatMoneyInput(values[grade] ?? 0)]),
      ),
    );
    setPctDrafts(
      Object.fromEntries(
        grades.map((grade) => [grade, formatPctInput(pctFromValue(retailBase, values[grade] ?? 0))]),
      ),
    );
  }, [formatVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const gradeSuggestions = useMemo(() => {
    if (!scale || grades.length === 0) return {};
    return lookupGradeSuggestions(scale, grades, suggestionDims, {
      source: item.source,
      brand: item.brand,
      category: item.category,
    });
  }, [item.brand, item.category, item.source, grades, scale, suggestionDims]);

  const toggleSuggestionDim = (key: keyof GradeSuggestionDims) => {
    setSuggestionDims((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const scaleNames = useMemo(() => Object.keys(scales), [scales]);

  const handleCreateScale = async () => {
    const name = newScaleName.trim();
    const grades = newScaleGrades
      .split(/[,;\n]+/)
      .map((g) => g.trim())
      .filter(Boolean);
    if (!name || grades.length === 0) return;
    const created = await createScale.mutateAsync({ name, grades });
    setNewScaleOpen(false);
    setNewScaleName('');
    setNewScaleGrades('');
    onScaleChange(created.name);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        overflow: 'hidden',
        minHeight: fillHeight ? 0 : 320,
        height: fillHeight ? '100%' : 'auto',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        borderColor: '#cbd5e1',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.06)',
      }}
    >
      <Box
        sx={{
          px: 2.5,
          py: 2,
          minHeight: CARD_HEADER_MIN_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          borderBottom: 1,
          borderColor: 'divider',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 58%, #e8f5e9 100%)',
          flexShrink: 0,
        }}
      >
        <Stack spacing={1.05} sx={{ width: '100%', minWidth: 0 }}>
          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="nowrap" sx={{ minWidth: 0, overflowX: 'auto', pb: 0.1 }}>
            {hierarchyItems.map((entry, index) => (
              <Stack key={entry.label} direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                {index > 0 ?
                  <Typography variant="caption" color="text.disabled" fontWeight={900}>
                    &gt;
                  </Typography>
                : null}
                <Box
                  component={entry.href ? RouterLink : 'div'}
                  to={entry.href}
                  target={'openInNewTab' in entry && entry.openInNewTab ? '_blank' : undefined}
                  rel={'openInNewTab' in entry && entry.openInNewTab ? 'noopener noreferrer' : undefined}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'auto minmax(0, 1fr)',
                    alignItems: 'baseline',
                    gap: 0.45,
                    width: index === 2 ? 156 : 124,
                    px: 0.8,
                    py: 0.45,
                    borderRadius: 1.2,
                    bgcolor: index === 0 ? '#0f172a' : '#fff',
                    border: '1px solid',
                    borderColor: index === 0 ? '#0f172a' : '#cbd5e1',
                    color: index === 0 ? '#fff' : 'text.primary',
                    textDecoration: 'none',
                    cursor: entry.href ? 'pointer' : 'default',
                    '&:hover': entry.href ? { borderColor: index === 0 ? '#0f172a' : 'primary.main' } : undefined,
                  }}
                  title={entry.title ?? entry.value}
                >
                  <Typography variant="caption" fontWeight={800} sx={{ opacity: 0.72 }}>
                    {entry.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    fontWeight={900}
                    fontFamily={entry.mono ? 'monospace' : undefined}
                    noWrap
                    sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {entry.value}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>

          <Typography variant="h5" fontWeight={800} lineHeight={1.12} noWrap title={item.name}>
            {item.name}
          </Typography>

          <Stack direction="row" justifyContent="space-between" alignItems="stretch" spacing={1.25} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} flexWrap="nowrap" sx={{ minWidth: 0, overflowX: 'auto', pb: 0.1 }}>
              {productFacts.map(({ label, value }) => (
                <Box
                  key={label}
                  sx={{
                    width: label === 'Brand' ? 150 : 126,
                    minWidth: label === 'Brand' ? 150 : 126,
                    px: 0.9,
                    py: 0.65,
                    borderRadius: 1.35,
                    bgcolor: '#fff',
                    border: '1px solid #e2e8f0',
                  }}
                  title={`${label}: ${value}`}
                >
                  <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ display: 'block', lineHeight: 1 }}>
                    {label}
                  </Typography>
                  <Typography variant="body2" fontWeight={900} noWrap sx={{ mt: 0.35, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Stack>

            <Stack direction="row" spacing={0.75} flexWrap="nowrap" justifyContent="flex-end" sx={{ flexShrink: 0 }}>
              {metricCards.map((metric) => (
                <Box
                  key={metric.label}
                  sx={{
                    width: 82,
                    minWidth: 82,
                    px: 0.85,
                    py: 0.65,
                    borderRadius: 1.35,
                    bgcolor: '#fff',
                    border: '1px solid #e2e8f0',
                    textAlign: 'center',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" fontWeight={800} noWrap sx={{ display: 'block', lineHeight: 1 }}>
                    {metric.label}
                  </Typography>
                  <Typography variant="body2" fontWeight={900} fontFamily="monospace" noWrap sx={{ mt: 0.35, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {metric.value}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Stack>
        </Stack>
      </Box>

      <Box
        sx={{
          p: 2.5,
          flex: fillHeight ? 1 : undefined,
          minHeight: 0,
          overflowY: fillHeight ? 'auto' : undefined,
          overscrollBehavior: 'contain',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(280px, 0.9fr) auto minmax(0, 1fr)' },
            gap: { xs: 1.5, lg: 2 },
            alignItems: 'start',
            mb: 2.5,
          }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary" fontWeight={800} display="block" mb={1}>
              Suggest On
            </Typography>
            <FormGroup row sx={{ gap: 0.85, justifyContent: 'flex-start', alignItems: 'stretch' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={suggestionDims.vendor}
                    onChange={() => toggleSuggestionDim('vendor')}
                    sx={{ p: 0.25, mt: 0.1 }}
                  />
                }
                label={
                  <Box sx={{ minWidth: 72, lineHeight: 1.05 }}>
                    <Typography variant="caption" fontWeight={850} sx={{ display: 'block', lineHeight: 1.05 }}>
                      Vendor
                    </Typography>
                    {item.source ?
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 88, fontSize: 10, lineHeight: 1.05 }}>
                        {item.source}
                      </Typography>
                    : null}
                  </Box>
                }
                sx={{
                  m: 0,
                  alignItems: 'flex-start',
                  px: 0.85,
                  py: 0.55,
                  borderRadius: 1.25,
                  border: '1px solid #e2e8f0',
                  bgcolor: suggestionDims.vendor ? '#f0f7f0' : '#fff',
                  '& .MuiFormControlLabel-label': { mt: 0.1 },
                }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={suggestionDims.brand}
                    onChange={() => toggleSuggestionDim('brand')}
                    disabled={!item.brand}
                    sx={{ p: 0.25, mt: 0.1 }}
                  />
                }
                label={
                  <Box sx={{ minWidth: 72, lineHeight: 1.05 }}>
                    <Typography variant="caption" fontWeight={850} sx={{ display: 'block', lineHeight: 1.05 }}>
                      Brand
                    </Typography>
                    {item.brand ?
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 96, fontSize: 10, lineHeight: 1.05 }}>
                        {item.brand}
                      </Typography>
                    : null}
                  </Box>
                }
                sx={{
                  m: 0,
                  alignItems: 'flex-start',
                  px: 0.85,
                  py: 0.55,
                  borderRadius: 1.25,
                  border: '1px solid #e2e8f0',
                  bgcolor: suggestionDims.brand ? '#f0f7f0' : '#fff',
                  opacity: item.brand ? 1 : 0.58,
                  '& .MuiFormControlLabel-label': { mt: 0.1 },
                }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={suggestionDims.category}
                    onChange={() => toggleSuggestionDim('category')}
                    sx={{ p: 0.25, mt: 0.1 }}
                  />
                }
                label={
                  <Box sx={{ minWidth: 72, lineHeight: 1.05 }}>
                    <Typography variant="caption" fontWeight={850} sx={{ display: 'block', lineHeight: 1.05 }}>
                      Category
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 96, fontSize: 10, lineHeight: 1.05 }}>
                      {item.category}
                    </Typography>
                  </Box>
                }
                sx={{
                  m: 0,
                  alignItems: 'flex-start',
                  px: 0.85,
                  py: 0.55,
                  borderRadius: 1.25,
                  border: '1px solid #e2e8f0',
                  bgcolor: suggestionDims.category ? '#f0f7f0' : '#fff',
                  '& .MuiFormControlLabel-label': { mt: 0.1 },
                }}
              />
            </FormGroup>
          </Box>

          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', lg: 'block' } }} />
          <Divider sx={{ display: { xs: 'block', lg: 'none' } }} />

          <Box>
            <Typography variant="overline" color="text.secondary" fontWeight={800} display="block" mb={1}>
              Grade scale
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <FormControl size="small" sx={{ minWidth: 200, flex: 1 }}>
                <InputLabel id="tars-grade-scale-label">Scale</InputLabel>
                <Select
                  labelId="tars-grade-scale-label"
                  label="Scale"
                  value={scale || ''}
                  displayEmpty
                  onChange={(e) => {
                    const next = String(e.target.value);
                    if (next) onScaleChange(next);
                  }}
                >
                  <MenuItem value="" disabled>
                    Choose scale…
                  </MenuItem>
                  {scale && !scaleNames.includes(scale) ?
                    <MenuItem value={scale}>
                      {scale} (saved)
                    </MenuItem>
                  : null}
                  {scaleNames.map((name) => (
                    <MenuItem key={name} value={name}>
                      {name} · {scales[name].length} grades
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Add />}
                onClick={() => setNewScaleOpen(true)}
                sx={{ whiteSpace: 'nowrap' }}
              >
                New scale
              </Button>
              {suggestedScale && suggestedScale !== scale ?
                <Tooltip title={`Used on ${suggestedScaleCount} past restoration${suggestedScaleCount === 1 ? '' : 's'} with matching filters`}>
                  <Chip
                    size="small"
                    label={`Suggested: ${suggestedScale}`}
                    color="info"
                    variant="outlined"
                    onClick={() => onScaleChange(suggestedScale)}
                    sx={{ fontWeight: 750, cursor: 'pointer' }}
                  />
                </Tooltip>
              : null}
            </Stack>
          </Box>
        </Box>

        {grades.length === 0 ?
          <Typography variant="body2" color="text.secondary" mb={2}>
            Choose a scale to enter values.
          </Typography>
        : <Stack spacing={1} sx={{ mb: sendAction ? 2.5 : 0 }}>
            <Box sx={{ px: 0.5 }}>
              {!retailBase ?
                <Typography variant="caption" color="warning.main" display="block" mt={0.5}>
                  Item retail is required to apply suggested values or edit %.
                </Typography>
              : null}
            </Box>

            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ px: 0.5 }}
            >
              <Typography variant="caption" color="text.secondary" fontWeight={800}>
                Grade
              </Typography>
              <Typography variant="caption" color="text.secondary" fontWeight={800}>
                Suggest · Price · % retail
              </Typography>
            </Stack>
            {grades.map((grade, i) => {
              const value = values[grade] ?? 0;
              const filled = value > 0;
              const suggestedPct = gradeSuggestions[grade] ?? null;
              const suggestedValue =
                suggestedPct != null && retailBase > 0 ?
                  suggestedValueFromPct(retailBase, suggestedPct)
                : null;
              const retailPct = pctFromValue(retailBase, value);
              const dollarTabIndex = i + 1;
              const pctTabIndex = grades.length + i + 1;

              const suggestControl =
                suggestedValue != null && suggestedPct != null ?
                  <Tooltip title="Apply historical avg % of retail for this grade">
                    <Button
                      size="small"
                      variant="outlined"
                      color="info"
                      tabIndex={-1}
                      onClick={() => {
                        onGradeValueChange(grade, suggestedValue);
                        setMoneyDrafts((prev) => ({ ...prev, [grade]: formatMoneyInput(suggestedValue) }));
                        setPctDrafts((prev) => ({ ...prev, [grade]: formatPctInput(suggestedPct) }));
                      }}
                      sx={{
                        width: GRADE_SUGGEST_BTN_MIN_WIDTH,
                        minWidth: GRADE_SUGGEST_BTN_MIN_WIDTH,
                        maxWidth: GRADE_SUGGEST_BTN_MIN_WIDTH,
                        px: 1,
                        py: 0.5,
                        fontFamily: 'monospace',
                        fontSize: 11,
                        fontWeight: 800,
                        lineHeight: 1.25,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatUsd(suggestedValue)} ({suggestedPct}%)
                    </Button>
                  </Tooltip>
                : <Box
                    sx={{
                      width: GRADE_SUGGEST_BTN_MIN_WIDTH,
                      minWidth: GRADE_SUGGEST_BTN_MIN_WIDTH,
                      px: 1,
                      py: 0.65,
                      borderRadius: 1.25,
                      textAlign: 'center',
                      bgcolor: 'rgba(255,255,255,0.5)',
                      border: '1px dashed #cbd5e1',
                    }}
                  >
                    <Typography variant="caption" color="text.disabled" fontSize={10} noWrap>
                      No match
                    </Typography>
                  </Box>;

              return (
                <Box
                  key={grade}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: `${GRADE_SUGGEST_BTN_MIN_WIDTH}px ${GRADE_VALUE_FIELD_WIDTH}px ${GRADE_PCT_FIELD_WIDTH}px`,
                      sm: `minmax(140px, 1fr) ${GRADE_SUGGEST_BTN_MIN_WIDTH}px ${GRADE_VALUE_FIELD_WIDTH}px ${GRADE_PCT_FIELD_WIDTH}px`,
                    },
                    gridTemplateRows: { xs: 'auto auto', sm: 'auto' },
                    gap: { xs: 1, sm: 1.5 },
                    alignItems: 'center',
                    p: 1.25,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: filled ? '#a5d6a7' : '#fbbf24',
                    bgcolor: filled ? '#f0f7f0' : '#fff7ed',
                    overflowX: 'auto',
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.25}
                    minWidth={0}
                    sx={{ gridColumn: { xs: '1 / -1', sm: '1' }, gridRow: { xs: '1', sm: '1' } }}
                  >
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        bgcolor: '#fff',
                        border: '1px solid #e2e8f0',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Box
                        sx={{
                          width: 11,
                          height: 11,
                          borderRadius: '50%',
                          bgcolor: TARS_GRADE_DOT_COLORS[i % TARS_GRADE_DOT_COLORS.length],
                        }}
                      />
                    </Box>
                    <Box minWidth={0}>
                      <Typography variant="body2" fontWeight={800}>
                        {grade}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        Retail value if this is the final grade
                      </Typography>
                    </Box>
                  </Stack>

                  <Box sx={{ gridColumn: { xs: '1', sm: '2' }, gridRow: { xs: '2', sm: '1' }, justifySelf: { sm: 'end' } }}>
                    {suggestControl}
                  </Box>

                  <Box sx={{ gridColumn: { xs: '2', sm: '3' }, gridRow: { xs: '2', sm: '1' }, justifySelf: { sm: 'end' } }}>
                    <TextField
                      size="small"
                      type="text"
                      hiddenLabel
                      value={moneyDrafts[grade] ?? (value ? String(value) : '')}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const next = parseDecoratedNumber(raw);
                        setMoneyDrafts((prev) => ({ ...prev, [grade]: raw }));
                        setPctDrafts((prev) => ({ ...prev, [grade]: formatPctInput(pctFromValue(retailBase, next)) }));
                        onGradeValueChange(grade, next);
                      }}
                      placeholder="—"
                      error={!filled}
                      sx={{
                        ...hideNumberSpinnerSx,
                        width: GRADE_VALUE_FIELD_WIDTH,
                        '& .MuiOutlinedInput-input': {
                          fontFamily: 'monospace',
                          textAlign: 'right',
                          py: 0.75,
                        },
                      }}
                      slotProps={{
                        input: {
                          inputProps: { tabIndex: dollarTabIndex, inputMode: 'decimal' },
                          startAdornment: <InputAdornment position="start">$</InputAdornment>,
                          sx: { bgcolor: '#fff' },
                        },
                      }}
                    />
                  </Box>

                  <Box sx={{ gridColumn: { xs: '3', sm: '4' }, gridRow: { xs: '2', sm: '1' }, justifySelf: { sm: 'end' } }}>
                    <TextField
                      size="small"
                      type="text"
                      hiddenLabel
                      disabled={!retailBase}
                      value={pctDrafts[grade] ?? formatPctInput(retailPct)}
                      onChange={(e) => {
                        if (!retailBase) return;
                        const raw = e.target.value;
                        const pct = parseDecoratedNumber(raw);
                        setPctDrafts((prev) => ({ ...prev, [grade]: raw }));
                        if (Number.isFinite(pct)) {
                          const nextValue = suggestedValueFromPct(retailBase, pct);
                          setMoneyDrafts((prev) => ({ ...prev, [grade]: formatMoneyInput(nextValue) }));
                          onGradeValueChange(grade, nextValue);
                        } else {
                          setMoneyDrafts((prev) => ({ ...prev, [grade]: '' }));
                          onGradeValueChange(grade, 0);
                        }
                      }}
                      placeholder="—"
                      sx={{
                        ...hideNumberSpinnerSx,
                        width: GRADE_PCT_FIELD_WIDTH,
                        '& .MuiOutlinedInput-input': {
                          fontFamily: 'monospace',
                          textAlign: 'right',
                          py: 0.75,
                        },
                      }}
                      slotProps={{
                        input: {
                          inputProps: { tabIndex: pctTabIndex, inputMode: 'decimal' },
                          endAdornment: <InputAdornment position="end">%</InputAdornment>,
                          sx: { bgcolor: '#fff' },
                        },
                      }}
                    />
                  </Box>
                </Box>
              );
            })}
          </Stack>
        }

        {sendAction || secondaryAction ?
          <Stack direction="row" spacing={1} alignItems="center">
            {secondaryAction ?
              <Button
                fullWidth
                variant="outlined"
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </Button>
            : null}
            {sendAction ?
              <Button
                fullWidth
                variant="contained"
                disabled={
                  sendAction.disabled ??
                  (sendAction.requireCompleteGrades !== false && !canSend)
                }
                startIcon={sendAction.label === 'Save' ? <Save /> : <Send />}
                onClick={sendAction.onSend}
              >
                {sendAction.label ?? 'Send to Restoration'}
              </Button>
            : null}
          </Stack>
        : null}
      </Box>

      <Dialog open={newScaleOpen} onClose={() => !createScale.isPending && setNewScaleOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>New grade scale</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Scale name"
              value={newScaleName}
              onChange={(e) => setNewScaleName(e.target.value)}
              autoFocus
              fullWidth
            />
            <TextField
              label="Grades"
              value={newScaleGrades}
              onChange={(e) => setNewScaleGrades(e.target.value)}
              placeholder="Working, Repairable, Parts-only"
              helperText="Comma-separated grade names in order"
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewScaleOpen(false)} disabled={createScale.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!newScaleName.trim() || !newScaleGrades.trim() || createScale.isPending}
            onClick={() => void handleCreateScale()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export function createEmptyGradeValuesForScale(
  scale: string,
  scales: Record<string, string[]> = TARS_GRADE_SCALES,
  prev: Record<string, number> = {},
): Record<string, number> {
  return emptyValuesForScale(scale, scales, prev);
}

export { gradeValuesComplete };
