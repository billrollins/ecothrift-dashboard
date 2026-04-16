import { useState, type ReactNode } from 'react';
import {
  Box,
  Collapse,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { formatCurrency } from '../../utils/format';
import type { BuyingCategoryNeedRow } from '../../types/buying.types';

function num(s: string | null | undefined): number | null {
  if (s == null || s === '') return null;
  const n = Number.parseFloat(String(s));
  return Number.isFinite(n) ? n : null;
}

function fmt2(s: string | null | undefined): string {
  const n = num(s);
  return n == null ? '—' : n.toFixed(2);
}

type Props = {
  row: BuyingCategoryNeedRow | null;
  needScoreRawGlobalMin: string | null | undefined;
  needScoreRawGlobalMax: string | null | undefined;
  needWindowDays: number | null | undefined;
};

function Tile({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <Box
      sx={{
        p: 0.75,
        bgcolor: 'action.hover',
        borderRadius: 1,
        minWidth: 120,
        flex: '1 1 120px',
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        sx={{ fontSize: '0.65rem' }}
      >
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700} lineHeight={1.3}>
        {primary}
      </Typography>
      {secondary != null ? (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ fontSize: '0.7rem', mt: 0.25 }}
        >
          {secondary}
        </Typography>
      ) : null}
    </Box>
  );
}

function soldWindowSinceLabel(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days) || days < 1) return '—';
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CategoryNeedDetail({
  row,
  needScoreRawGlobalMin,
  needScoreRawGlobalMax,
  needWindowDays,
}: Props) {
  const [explainerOpen, setExplainerOpen] = useState(false);

  if (!row) {
    return (
      <Box
        sx={{
          width: 320,
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

  const windowDays = needWindowDays ?? null;
  const since = soldWindowSinceLabel(windowDays);
  const gap = num(row.need_gap);
  const unitLeg = fmt2(row.need_raw_unit_leg);
  const retailLeg = fmt2(row.need_raw_retail_leg);
  const combinedRaw = fmt2(row.need_raw_combined);
  const rawMin = fmt2(needScoreRawGlobalMin);
  const rawMax = fmt2(needScoreRawGlobalMax);
  const equalBounds =
    needScoreRawGlobalMin != null &&
    needScoreRawGlobalMax != null &&
    needScoreRawGlobalMin === needScoreRawGlobalMax;

  return (
    <Box
      sx={{
        width: 320,
        flexShrink: 0,
        position: 'sticky',
        top: 16,
        alignSelf: 'flex-start',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 1.5,
        bgcolor: 'background.paper',
      }}
    >
      <Typography
        variant="subtitle2"
        fontWeight={700}
        color="text.secondary"
        sx={{ mb: 0.5, lineHeight: 1.2, letterSpacing: 0.3, textTransform: 'uppercase', fontSize: '0.7rem' }}
      >
        {row.category}
      </Typography>

      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.25 }}>
        <Typography variant="h3" fontWeight={800} color="primary.main" sx={{ lineHeight: 1 }}>
          {row.need_score_1to99}
        </Typography>
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          / 99
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Need score · higher means stronger need to restock
      </Typography>

      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
        <Typography
          variant="caption"
          color="primary.main"
          sx={{ cursor: 'pointer', fontWeight: 600 }}
          onClick={() => setExplainerOpen((v) => !v)}
        >
          {explainerOpen ? 'Hide' : 'How is this calculated?'}
        </Typography>
        <IconButton
          size="small"
          onClick={() => setExplainerOpen((v) => !v)}
          aria-label={explainerOpen ? 'Hide Need explainer' : 'Show Need explainer'}
          sx={{ p: 0.25 }}
        >
          <ExpandMoreIcon
            fontSize="small"
            sx={{
              transition: 'transform 0.2s',
              transform: explainerOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </IconButton>
      </Stack>

      <Collapse in={explainerOpen} unmountOnExit>
        <Box
          sx={{
            mb: 1.25,
            p: 1,
            borderRadius: 1,
            bgcolor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Stack spacing={0.6}>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
              <strong>Unit leg: {unitLeg}</strong> — shelf has {row.shelf_count} units, sold{' '}
              {row.sold_count} in {windowDays ?? '—'} days.
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
              <strong>Retail leg: {retailLeg}</strong> — shelf holds{' '}
              {formatCurrency(row.have_retail)}, sold {formatCurrency(row.want_retail)} in{' '}
              {windowDays ?? '—'} days.
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
              <strong>Combined: {combinedRaw}</strong> (average of both legs).
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
              Ranked against today&apos;s range across all categories ({rawMin} to {rawMax}) →{' '}
              <strong>{row.need_score_1to99} / 99</strong>.
            </Typography>
            {equalBounds ? (
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                All categories currently tie on the combined score, so every category maps to{' '}
                <strong>50</strong>.
              </Typography>
            ) : null}
          </Stack>
        </Box>
      </Collapse>

      <Divider sx={{ mb: 1 }} />

      <Typography
        variant="caption"
        fontWeight={700}
        color="text.secondary"
        sx={{ display: 'block', mb: 0.5, letterSpacing: 0.3 }}
      >
        Last {windowDays ?? '—'} days (since {since})
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: 1.25 }}>
        <Tile
          label="On shelf"
          primary={`${row.shelf_count.toLocaleString()} units`}
          secondary={formatCurrency(row.have_retail)}
        />
        <Tile
          label="Sold in window"
          primary={`${row.sold_count.toLocaleString()} units`}
          secondary={formatCurrency(row.want_retail)}
        />
      </Stack>

      <Divider sx={{ mb: 1 }} />

      <Typography
        variant="caption"
        fontWeight={700}
        color="text.secondary"
        sx={{ display: 'block', mb: 0.5, letterSpacing: 0.3 }}
      >
        Flow
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.75}>
        <Tile
          label="Sell-through"
          primary={`${num(row.sell_through_pct)?.toFixed(1) ?? '—'}%`}
        />
        <Tile
          label="Need gap"
          primary={
            <Box
              component="span"
              sx={{
                color:
                  gap == null
                    ? 'text.primary'
                    : gap > 0
                      ? 'success.main'
                      : gap < 0
                        ? 'error.main'
                        : 'text.primary',
              }}
            >
              {gap != null ? (gap > 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1)) : '—'}
            </Box>
          }
        />
      </Stack>
    </Box>
  );
}
