import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  LinearProgress,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import OpenInNew from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import type { ProcessingWorkspaceOrderDTO } from '../../../types/inventory.types';
import { processingTokens } from './processingTokens';

/** Minimal row for the workspace order picker (list API + fallback for current PO). */
export interface ProcessingWorkspaceOrderPickRow {
  id: number;
  order_number: string;
  vendor_name: string;
  item_count?: number;
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ss = s % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export interface ProcessingWorkspaceHeaderProps {
  order: ProcessingWorkspaceOrderDTO;
  pickerOrders: ProcessingWorkspaceOrderPickRow[];
  onSelectOrderId: (id: number) => void;
  search: string;
  onSearchChange: (v: string) => void;
  /** Bump to refocus scanner (V-06). */
  searchFocusSignal?: number;
  /** Submit from scanner bar (exact UPC open, Enter). */
  onSearchEnter?: () => void;
  manifestDispositioned: number;
  manifestTotalQty: number;
  itemDispositioned: number;
  itemTotal: number;
  hasManifestRows: boolean;
  /** Check-ins this browser session (for rate estimate). */
  sessionCheckInCount: number;
}

export function ProcessingWorkspaceHeader({
  order,
  pickerOrders,
  onSelectOrderId,
  search,
  onSearchChange,
  searchFocusSignal = 0,
  onSearchEnter,
  manifestDispositioned,
  manifestTotalQty,
  itemDispositioned,
  itemTotal,
  hasManifestRows,
  sessionCheckInCount,
}: ProcessingWorkspaceHeaderProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionStartRef = useRef(Date.now());
  const [, tick] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!searchFocusSignal) return;
    inputRef.current?.focus();
  }, [searchFocusSignal]);

  useEffect(() => {
    const id = window.setInterval(() => tick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedMs = Date.now() - sessionStartRef.current;
  const elapsedLabel = fmtElapsed(elapsedMs);

  const disp = hasManifestRows && manifestTotalQty > 0 ? manifestDispositioned : itemTotal > 0 ? itemDispositioned : 0;
  const tot = hasManifestRows && manifestTotalQty > 0 ? manifestTotalQty : itemTotal > 0 ? itemTotal : 0;
  const pct = tot > 0 ? Math.round((100 * disp) / tot) : 0;

  const elapsedHours = Math.max(elapsedMs / 3600000, 1 / 3600);
  const itemsPerHour = Math.round(sessionCheckInCount / elapsedHours);

  const dispLabel = useMemo(() => {
    if (tot <= 0) return '—';
    return `${disp} / ${tot}`;
  }, [disp, tot]);

  const pickerValue =
    pickerOrders.find((o) => o.id === order.id) ??
    ({ id: order.id, order_number: order.number, vendor_name: order.vendor } satisfies ProcessingWorkspaceOrderPickRow);

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', pb: 1.5, mb: 0 }}>
      {/* Row 1 — title + order picker (mirror preprocessing UX) */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          py: 1,
          rowGap: 0.5,
        }}
      >
        <Tooltip title="Back to order">
          <IconButton size="small" onClick={() => navigate(`/inventory/orders/${order.id}`)} aria-label="Back to order">
            <ArrowBack fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography component="h1" sx={{ fontSize: 18, fontWeight: 700, color: processingTokens.primary, m: 0, flexShrink: 0 }}>
          Processing
        </Typography>
        <Autocomplete
          size="small"
          sx={{ minWidth: 280, maxWidth: '100%', flexShrink: 1 }}
          options={pickerOrders}
          value={pickerValue}
          onChange={(_e, v) => {
            if (v) onSelectOrderId(v.id);
          }}
          getOptionLabel={(o) => `${o.order_number} — ${o.vendor_name}`}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderOption={(props, option) => {
            const { key, ...rest } = props as { key?: string };
            const active = option.id === order.id;
            return (
              <Box
                component="li"
                key={key ?? option.id}
                {...rest}
                sx={{
                  py: 1,
                  px: 1.75,
                  borderBottom: `1px solid ${processingTokens.border}`,
                  ...(active ? { bgcolor: processingTokens.primarySoft, borderLeft: `3px solid ${processingTokens.primary}`, pl: 1.5 } : {}),
                }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{option.order_number}</Typography>
                <Typography sx={{ fontSize: 12, color: processingTokens.textSoft }}>{option.vendor_name}</Typography>
                {option.item_count != null ?
                  <Typography sx={{ fontSize: 11, color: processingTokens.textMute }}>
                    {option.item_count} unit{option.item_count === 1 ? '' : 's'}
                  </Typography>
                : null}
              </Box>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Select order…"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '6px',
                  bgcolor: 'background.paper',
                  fontSize: 14,
                },
              }}
            />
          )}
        />
        <Box
          sx={{
            bgcolor: processingTokens.primarySoft,
            color: processingTokens.primary,
            px: 1,
            py: 0.25,
            borderRadius: 0.5,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {order.vendor}
        </Box>
        {order.load_type ? (
          <Typography variant="caption" color="text.secondary">
            {order.load_type}
          </Typography>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Legacy batch grid">
          <IconButton size="small" onClick={() => navigate('/inventory/processing-legacy')} aria-label="Legacy processing">
            <OpenInNew fontSize="small" />
          </IconButton>
        </Tooltip>
        <Button size="small" variant="outlined" startIcon={<OpenInNew />} onClick={() => navigate(`/inventory/orders/${order.id}`)}>
          Open PO
        </Button>
      </Box>

      {/* Row 2 — search + stats */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 2,
          flexWrap: 'wrap',
          mb: 1.5,
          mt: 0.5,
        }}
      >
        <Box
          sx={{
            flex: 1,
            minWidth: 280,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'background.paper',
            border: `2px solid ${processingTokens.primary}`,
            borderRadius: 1,
            px: 1.75,
            height: 44,
            boxShadow: processingTokens.searchRing,
          }}
        >
          <SearchIcon sx={{ color: processingTokens.primary, fontSize: 20 }} />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSearchEnter?.();
              }
            }}
            placeholder="Scan barcode or type SKU, title, brand, model..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 15,
              fontFamily: 'inherit',
              minWidth: 0,
            }}
          />
          <Typography
            variant="caption"
            sx={{
              color: processingTokens.primary,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: 10,
              flexShrink: 0,
            }}
          >
            Scanner ready
          </Typography>
        </Box>

        <StatBlock label={`Dispositioned · ${tot > 0 ? pct : 0}%`} value={dispLabel} />
        <StatBlock label="Rate · target 100" value={`${itemsPerHour}`} suffix="/hr" />
        <StatBlock label="Elapsed" value={elapsedLabel} />
      </Box>

      {/* Row 3 — slim progress */}
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 3,
          borderRadius: 0,
          bgcolor: processingTokens.border,
          '& .MuiLinearProgress-bar': { bgcolor: processingTokens.primary },
        }}
      />
    </Box>
  );
}

function StatBlock({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <Box
      sx={{
        minWidth: 100,
        pl: 1.75,
        borderLeft: `1px solid ${processingTokens.border}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <Typography
        sx={{
          fontSize: 18,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {value}
        {suffix ? (
          <Typography component="span" sx={{ color: processingTokens.textSoft, fontWeight: 400, fontSize: 13 }}>
            {suffix}
          </Typography>
        ) : null}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          fontSize: 9,
          color: processingTokens.textMute,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
          mt: 0.25,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
