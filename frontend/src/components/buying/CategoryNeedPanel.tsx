import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp';
import { useBuyingCategoryNeed } from '../../hooks/useBuyingCategoryNeed';
import type { BuyingCategoryNeedRow } from '../../types/buying.types';
import CategoryNeedBars from './CategoryNeedBars';
import CategoryNeedDetail from './CategoryNeedDetail';

const STORAGE_KEY = 'buying.categoryNeedPanelSize';
type PanelSize = 'min' | 'window';

function loadSize(): PanelSize {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'min') return 'min';
  } catch {
    /* ignore */
  }
  return 'window';
}

function LegendTooltipContent() {
  return (
    <Stack spacing={0.75} sx={{ py: 0.5, maxWidth: 280 }}>
      <Typography variant="caption" fontWeight={600}>
        Bar chart legend
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box sx={{ width: 12, height: 12, bgcolor: '#90caf9', borderRadius: 0.25 }} />
        <Typography variant="caption">Shelf % (width vs scale)</Typography>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box sx={{ width: 12, height: 12, bgcolor: 'rgba(239,154,154,0.7)', borderRadius: 0.25 }} />
        <Typography variant="caption">Sold % (width vs scale)</Typography>
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box
          sx={{
            width: 24,
            height: 4,
            background: (t) =>
              `linear-gradient(90deg, ${t.palette.error.main}, ${t.palette.success.main})`,
            borderRadius: 0.25,
          }}
        />
        <Typography variant="caption">Profit / sales (gradient line)</Typography>
      </Stack>
    </Stack>
  );
}

export default function CategoryNeedPanel() {
  const [size, setSize] = useState<PanelSize>(loadSize);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, size);
    } catch {
      /* ignore */
    }
  }, [size]);

  const { data, isLoading, isError } = useBuyingCategoryNeed();

  const rows = data?.categories ?? [];

  useEffect(() => {
    if (rows.length === 0) return;
    if (!selectedCategory || !rows.some((r) => r.category === selectedCategory)) {
      setSelectedCategory(rows[0].category);
    }
  }, [rows, selectedCategory]);

  const selectedRow: BuyingCategoryNeedRow | null = useMemo(() => {
    if (rows.length === 0) return null;
    if (selectedCategory) {
      const match = rows.find((r) => r.category === selectedCategory);
      if (match) return match;
    }
    return rows[0];
  }, [rows, selectedCategory]);

  const windowDays = data?.need_window_days;
  const metaParts: string[] = [];
  if (windowDays != null && Number.isFinite(windowDays)) {
    metaParts.push(`${windowDays}-day window`);
  }
  metaParts.push(`${rows.length} categories`);

  const isOpen = size === 'window';
  const toggleOpen = () => setSize(isOpen ? 'min' : 'window');

  return (
    <Paper variant="outlined" sx={{ mb: 1.25, flexShrink: 0, overflow: 'hidden' }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          px: 1.25,
          py: 0.5,
          minHeight: 36,
          borderBottom: isOpen ? 1 : 'none',
          borderColor: 'divider',
          flexWrap: 'wrap',
          rowGap: 0.5,
          cursor: 'pointer',
        }}
        onClick={toggleOpen}
      >
        <Typography variant="subtitle2" fontWeight={700}>
          Inventory need
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {metaParts.map((p, i) => (
            <Box component="span" key={p}>
              {i > 0 ? ' · ' : null}
              {p}
            </Box>
          ))}
        </Typography>
        <Box sx={{ flex: 1, minWidth: 8 }} />
        <Tooltip title={<LegendTooltipContent />} enterTouchDelay={0} placement="bottom-start">
          <IconButton
            size="small"
            aria-label="Bar chart legend"
            sx={{ p: 0.25 }}
            onClick={(e) => e.stopPropagation()}
          >
            <InfoOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton
          size="small"
          aria-label={isOpen ? 'Collapse inventory need panel' : 'Expand inventory need panel'}
          title={isOpen ? 'Collapse' : 'Expand'}
          sx={{ p: 0.25 }}
          onClick={(e) => {
            e.stopPropagation();
            toggleOpen();
          }}
        >
          {isOpen ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
        </IconButton>
      </Stack>

      {isOpen ? (
        isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : isError ? (
          <Typography color="error" sx={{ p: 2 }}>
            Could not load category need data.
          </Typography>
        ) : (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ p: 1, alignItems: 'stretch' }}
          >
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                position: 'relative',
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  overflow: 'auto',
                }}
              >
                <CategoryNeedBars
                  rows={rows}
                  selectedCategory={selectedCategory}
                  onSelect={setSelectedCategory}
                />
              </Box>
            </Box>
            <CategoryNeedDetail
              row={selectedRow}
              needScoreRawGlobalMin={data?.need_score_raw_global_min}
              needScoreRawGlobalMax={data?.need_score_raw_global_max}
              needWindowDays={data?.need_window_days}
            />
          </Stack>
        )
      ) : null}
    </Paper>
  );
}
