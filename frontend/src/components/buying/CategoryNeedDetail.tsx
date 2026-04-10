import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Box,
  Divider,
  Slider,
  Stack,
  Typography,
} from '@mui/material';
import { formatCurrency } from '../../utils/format';
import type { BuyingCategoryNeedRow, BuyingCategoryWantRow } from '../../types/buying.types';

function num(s: string | null | undefined): number | null {
  if (s == null || s === '') return null;
  const n = Number.parseFloat(String(s));
  return Number.isFinite(n) ? n : null;
}

const WANT_DEBOUNCE_MS = 400;

type Props = {
  row: BuyingCategoryNeedRow | null;
  wantRow: BuyingCategoryWantRow | undefined;
  onWantChange: (category: string, value: number) => void;
  wantBusy: boolean;
};

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ p: 0.75, bgcolor: 'action.hover', borderRadius: 1 }}>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.65rem' }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {children}
      </Typography>
    </Box>
  );
}

export default function CategoryNeedDetail({ row, wantRow, onWantChange, wantBusy }: Props) {
  const committed =
    wantRow?.value != null ? wantRow.value : Math.round(wantRow?.effective_value ?? 5);

  const [localVal, setLocalVal] = useState(committed);
  const interactingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!row) return;
    if (interactingRef.current) return;
    setLocalVal(committed);
  }, [row?.category, committed, row]);

  const schedulePost = useCallback(
    (category: string, value: number) => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        onWantChange(category, value);
      }, WANT_DEBOUNCE_MS);
    },
    [onWantChange]
  );

  if (!row) {
    return (
      <Box
        sx={{
          width: 280,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 200,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          px: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary" fontStyle="italic">
          Click a category
        </Typography>
      </Box>
    );
  }

  const ps = num(row.profit_sales_ratio);
  const roc = num(row.return_on_cost);

  return (
    <Box
      sx={{
        width: 300,
        flexShrink: 0,
        position: 'sticky',
        top: 16,
        alignSelf: 'flex-start',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.25,
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="subtitle2" fontWeight={700} color="primary.main" sx={{ mb: 1 }}>
        {row.category}
      </Typography>

      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 1 }}>
        <Tile label="On shelf">{row.shelf_count}</Tile>
        <Tile label="Sold (window)">{row.sold_count}</Tile>
        <Tile label="Sell-through">{`${num(row.sell_through_pct)?.toFixed(1) ?? '—'}%`}</Tile>
        <Tile label="Need gap">
          <Box
            component="span"
            sx={{
              color:
                num(row.need_gap) != null && num(row.need_gap)! > 0
                  ? 'success.main'
                  : num(row.need_gap)! < 0
                    ? 'error.main'
                    : 'text.primary',
            }}
          >
            {num(row.need_gap)?.toFixed(1) ?? '—'}
          </Box>
        </Tile>
      </Stack>

      <Divider sx={{ my: 1 }} />

      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 1 }}>
        <Tile label="Avg sale">{formatCurrency(row.avg_sale)}</Tile>
        <Tile label="Avg retail">{formatCurrency(row.avg_retail)}</Tile>
        <Tile label="Avg cost">{formatCurrency(row.avg_cost)}</Tile>
        <Tile label="Profit / item">{formatCurrency(row.profit_per_item)}</Tile>
      </Stack>

      <Divider sx={{ my: 1 }} />

      <Box sx={{ mb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Profit / sales
          </Typography>
          <Typography variant="caption" fontWeight={600}>
            {ps != null ? `${(ps * 100).toFixed(1)}%` : '—'}
          </Typography>
        </Stack>
        <Box
          sx={{
            mt: 0.5,
            height: 10,
            borderRadius: 0.5,
            bgcolor: 'grey.200',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, (ps ?? 0) * 100))}%`,
              background: (t) =>
                `linear-gradient(90deg, ${t.palette.error.main} 0%, ${t.palette.warning.main} 50%, ${t.palette.success.main} 100%)`,
            }}
          />
        </Box>
      </Box>

      <Box sx={{ mb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Return on cost
          </Typography>
          <Typography variant="caption" fontWeight={600}>
            {roc != null ? `${roc.toFixed(2)}x` : '—'}
          </Typography>
        </Stack>
        <Box sx={{ mt: 0.5, height: 10, borderRadius: 0.5, bgcolor: 'grey.200', position: 'relative' }}>
          <Box
            sx={{
              height: '100%',
              width: `${Math.min(100, ((roc ?? 0) / 3) * 100)}%`,
              bgcolor: 'success.main',
            }}
          />
        </Box>
      </Box>

      <Divider sx={{ my: 1 }} />

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
        Staff want (1–10) — effective {wantRow?.effective_value?.toFixed(1) ?? '5.0'} · decays to 5 daily
      </Typography>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Slider
          size="small"
          min={1}
          max={10}
          step={1}
          value={localVal}
          disabled={wantBusy}
          onPointerDown={() => {
            interactingRef.current = true;
          }}
          onPointerUp={() => {
            interactingRef.current = false;
          }}
          onMouseDown={() => {
            interactingRef.current = true;
          }}
          onMouseUp={() => {
            interactingRef.current = false;
          }}
          onTouchStart={() => {
            interactingRef.current = true;
          }}
          onTouchEnd={() => {
            interactingRef.current = false;
          }}
          onChange={(_, v) => {
            if (typeof v === 'number') {
              setLocalVal(v);
              schedulePost(row.category, v);
            }
          }}
          sx={{
            flex: 1,
            '& .MuiSlider-track': {
              border: 'none',
              background: 'linear-gradient(90deg, #c62828 0%, #fbc02d 50%, #2e7d32 100%)',
            },
            '& .MuiSlider-rail': { opacity: 0.3 },
          }}
        />
        <Typography variant="h6" fontWeight={700} sx={{ minWidth: 28 }}>
          {localVal}
        </Typography>
      </Stack>
      <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Skip
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Neutral
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Want
        </Typography>
      </Stack>
    </Box>
  );
}
