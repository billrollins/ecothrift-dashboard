import { useEffect, useMemo, useState } from 'react';
import { Box, CircularProgress, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useBuyingCategoryNeed } from '../../hooks/useBuyingCategoryNeed';
import { useBuyingCategoryWant, useBuyingCategoryWantMutation } from '../../hooks/useBuyingCategoryWant';
import type { BuyingCategoryNeedRow, BuyingCategoryWantRow } from '../../types/buying.types';
import CategoryNeedBars from './CategoryNeedBars';
import CategoryNeedDetail from './CategoryNeedDetail';

const STORAGE_KEY = 'buying.categoryNeedPanelSize';
type PanelSize = 'min' | 'window' | 'full';

function loadSize(): PanelSize {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'min' || v === 'window' || v === 'full') return v;
  } catch {
    /* ignore */
  }
  return 'window';
}

const toggleSx = {
  '& .MuiToggleButtonGroup-grouped': {
    border: 'none',
    mx: 0,
    '&:not(:first-of-type)': { borderRadius: 1 },
    '&:first-of-type': { borderRadius: 1 },
  },
  '& .MuiToggleButton-root': {
    fontSize: '0.6875rem',
    py: 0.25,
    px: 1,
    minHeight: 22,
    lineHeight: 1.2,
    textTransform: 'none',
    bgcolor: 'grey.200',
    color: 'text.secondary',
    border: 'none',
    '&.Mui-selected': {
      bgcolor: 'grey.400',
      color: 'text.primary',
    },
    '&:hover': {
      bgcolor: 'grey.300',
    },
  },
} as const;

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
  const { data: wantRows } = useBuyingCategoryWant();
  const wantMutation = useBuyingCategoryWantMutation();

  const rows = data?.categories ?? [];
  const wantByCategory = useMemo(() => {
    const m = new Map<string, BuyingCategoryWantRow>();
    (wantRows ?? []).forEach((w) => m.set(w.category, w));
    return m;
  }, [wantRows]);

  const selectedRow: BuyingCategoryNeedRow | null = useMemo(() => {
    if (!selectedCategory) return null;
    return rows.find((r) => r.category === selectedCategory) ?? null;
  }, [rows, selectedCategory]);

  const handleWant = (category: string, value: number) => {
    wantMutation.mutate({ category, value });
  };

  const maxHeight =
    size === 'min' ? 0 : size === 'window' ? 320 : undefined;
  const overflow = size === 'full' ? 'visible' : 'auto';

  return (
    <Box sx={{ mb: 2, flexShrink: 0 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
        Inventory need ({data?.need_window_days ?? '—'} day window)
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={size}
        onChange={(_, v: PanelSize | null) => {
          if (v != null) setSize(v);
        }}
        sx={{ ...toggleSx, mb: 1, alignSelf: 'flex-start' }}
      >
        <ToggleButton value="min">Min</ToggleButton>
        <ToggleButton value="window">Window</ToggleButton>
        <ToggleButton value="full">Full</ToggleButton>
      </ToggleButtonGroup>

      {size === 'min' ? (
        <Box
          sx={{
            width: '100%',
            borderBottom: '1px solid',
            borderColor: 'grey.300',
            my: 1,
          }}
        />
      ) : null}

      <Box
        sx={{
          maxHeight,
          overflow: size === 'min' ? 'hidden' : overflow,
          transition: 'max-height 0.25s ease',
          border: size === 'min' ? 'none' : '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        {size === 'min' ? null : isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : isError ? (
          <Typography color="error" sx={{ p: 2 }}>
            Could not load category need data.
          </Typography>
        ) : (
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            sx={{ p: 1, alignItems: 'flex-start' }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 0.75, alignItems: 'center' }}>
                <Box sx={{ width: 12, height: 12, bgcolor: '#90caf9', borderRadius: 0.25 }} />
                <Typography variant="caption">Shelf %</Typography>
                <Box sx={{ width: 12, height: 12, bgcolor: 'rgba(239,154,154,0.7)', borderRadius: 0.25 }} />
                <Typography variant="caption">Sold %</Typography>
                <Box
                  sx={{
                    width: 12,
                    height: 4,
                    background: (t) =>
                      `linear-gradient(90deg, ${t.palette.error.main}, ${t.palette.success.main})`,
                    borderRadius: 0.25,
                  }}
                />
                <Typography variant="caption">Profit / sales</Typography>
              </Stack>
              <CategoryNeedBars
                rows={rows}
                selectedCategory={selectedCategory}
                onSelect={setSelectedCategory}
              />
            </Box>
            <CategoryNeedDetail
              row={selectedRow}
              wantRow={selectedCategory ? wantByCategory.get(selectedCategory) : undefined}
              onWantChange={handleWant}
              wantBusy={wantMutation.isPending}
            />
          </Stack>
        )}
      </Box>
    </Box>
  );
}
