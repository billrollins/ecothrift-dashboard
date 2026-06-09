import { useCallback, useEffect, useRef } from 'react';
import { Box, Chip, CircularProgress, Typography } from '@mui/material';
import Check from '@mui/icons-material/Check';
import Close from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import type { ProcessingStatusSegment } from './processingWorkspaceFilters';
import { processingTokens } from './processingTokens';

export interface ProcessingFilterRowProps {
  segment: ProcessingStatusSegment;
  onSegmentChange: (v: ProcessingStatusSegment) => void;
  hideDispositioned: boolean;
  onHideDispositionedChange: (v: boolean) => void;
  productFilterProductId: number | null;
  productFilterTitle?: string;
  onClearProductFilter: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  searchFocusSignal?: number;
  onSearchEnter?: () => void;
  /** Total manifest/processing lines on this PO. */
  totalRowCount?: number;
  /** Lines matching segment, search, and other filters. */
  filteredRowCount?: number;
  /** True while a background refetch is in flight (search/filter change). */
  isFetching?: boolean;
}

const SEGMENTS: Array<{ id: ProcessingStatusSegment; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Open' },
  { id: 'partial', label: 'Partial' },
  { id: 'checked_in', label: 'Done' },
  { id: 'disputed', label: 'Disputes' },
];

export function ProcessingFilterRow({
  segment,
  onSegmentChange,
  hideDispositioned,
  onHideDispositionedChange,
  productFilterProductId,
  productFilterTitle,
  onClearProductFilter,
  search,
  onSearchChange,
  searchFocusSignal = 0,
  onSearchEnter,
  totalRowCount,
  filteredRowCount,
  isFetching = false,
}: ProcessingFilterRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!searchFocusSignal) return;
    inputRef.current?.focus();
  }, [searchFocusSignal]);

  const handleClearSearch = useCallback(() => {
    onSearchChange('');
    inputRef.current?.focus();
  }, [onSearchChange]);

  const hasSearch = search.trim().length > 0;

  return (
    <Box
      sx={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.75,
        minHeight: 48,
        borderBottom: 1,
        borderColor: processingTokens.border,
        bgcolor: 'background.paper',
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          flex: '1 1 520px',
          maxWidth: 620,
          minWidth: 260,
          display: 'flex',
          alignItems: 'stretch',
          height: 34,
          borderRadius: 1,
          border: '1px solid',
          borderColor: processingTokens.borderStrong,
          bgcolor: processingTokens.surfaceTint,
          overflow: 'hidden',
          transition: (theme) => theme.transitions.create(['border-color', 'box-shadow']),
          '&:focus-within': {
            borderColor: processingTokens.textSoft,
            boxShadow: processingTokens.focusRing,
          },
        }}
      >
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
            pl: 1.25,
            pr: hasSearch ? 0.75 : 1.25,
          }}
        >
          {isFetching ?
            <CircularProgress size={14} sx={{ color: 'text.secondary', flexShrink: 0 }} />
          : <SearchIcon sx={{ color: 'text.secondary', fontSize: 17, flexShrink: 0 }} />}
          <Box
            component="input"
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSearchEnter?.();
                return;
              }
              if (e.key === 'Escape' && hasSearch) {
                e.preventDefault();
                handleClearSearch();
              }
            }}
            placeholder="Scan or search row #, title, UPC, SKU, brand, model, category, specs, tags..."
            aria-label="Search processing queue"
            sx={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 0,
              bgcolor: 'transparent',
              font: 'inherit',
              fontSize: 13,
              color: 'text.primary',
              py: 0,
              '&::placeholder': { color: processingTokens.textMute, opacity: 1 },
            }}
          />
        </Box>
        {hasSearch ?
          <Box
            component="button"
            type="button"
            onClick={handleClearSearch}
            aria-label="Clear search (Esc)"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              px: 1.25,
              m: 0,
              border: 0,
              borderLeft: '1px solid',
              borderColor: processingTokens.border,
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ?
                  processingTokens.clearSegmentBgDark
                : processingTokens.clearSegmentBg,
              cursor: 'pointer',
              font: 'inherit',
              fontSize: '0.68rem',
              fontWeight: 700,
              letterSpacing: '0.03em',
              color: processingTokens.textSoft,
              flexShrink: 0,
              alignSelf: 'stretch',
              transition: (theme) => theme.transitions.create(['background-color', 'color']),
              '&:hover': {
                bgcolor: processingTokens.primarySoftStrong,
                color: processingTokens.textStrong,
              },
            }}
          >
            Clear
          </Box>
        : null}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', minWidth: 0 }}>
        {SEGMENTS.map((s) => {
          const active = segment === s.id;
          return (
            <Chip
              key={s.id}
              label={s.label}
              size="small"
              onClick={() => onSegmentChange(s.id)}
              sx={{
                height: 27,
                borderRadius: 99,
                fontSize: '0.7rem',
                fontWeight: 700,
                bgcolor: active ? processingTokens.primarySoftStrong : 'transparent',
                color: active ? processingTokens.textStrong : processingTokens.textSoft,
                border: '1px solid',
                borderColor: active ? processingTokens.borderStrong : processingTokens.border,
                '& .MuiChip-label': { px: 1 },
                '&:hover': {
                  bgcolor: active ? processingTokens.primarySoftStrong : processingTokens.primarySoft,
                },
              }}
            />
          );
        })}
        <Box
          component="button"
          type="button"
          onClick={() => onHideDispositionedChange(!hideDispositioned)}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.4,
            height: 27,
            px: 1,
            borderRadius: 99,
            border: hideDispositioned ?
              `1px solid ${processingTokens.borderStrong}`
            : `1px solid ${processingTokens.border}`,
            bgcolor: hideDispositioned ? processingTokens.primarySoftStrong : 'transparent',
            color: hideDispositioned ? processingTokens.textStrong : processingTokens.textSoft,
            cursor: 'pointer',
            font: 'inherit',
            fontSize: 11.5,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            transition: (theme) => theme.transitions.create(['background-color', 'border-color']),
            '&:hover': {
              bgcolor: processingTokens.primarySoft,
            },
          }}
        >
          {hideDispositioned ? <Check sx={{ fontSize: 14 }} /> : null}
          Hide done
        </Box>
        {productFilterProductId != null ? (
          <Chip
            label={`Product: ${productFilterTitle || `#${productFilterProductId}`}`}
            size="small"
            variant="outlined"
            onDelete={onClearProductFilter}
            deleteIcon={<Close />}
            sx={{
              height: 27,
              maxWidth: 220,
              fontSize: '0.7rem',
              borderColor: processingTokens.borderStrong,
              color: processingTokens.textStrong,
            }}
          />
        ) : null}
      </Box>

      {totalRowCount != null || filteredRowCount != null ?
        <Typography
          variant="caption"
          sx={{
            ml: 'auto',
            flexShrink: 0,
            fontSize: '0.72rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            color: processingTokens.textSoft,
          }}
        >
          {filteredRowCount != null ?
            `${filteredRowCount.toLocaleString()} matching`
          : '— matching'}
          {' · '}
          {totalRowCount != null ?
            `${totalRowCount.toLocaleString()} on order`
          : '— on order'}
        </Typography>
      : null}
    </Box>
  );
}
