import { useCallback, useEffect, useRef } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { processingTokens } from './processingTokens';

export interface ProcessingScanBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  /** Enter pressed — caller decides scan-open vs search. */
  onSearchEnter?: () => void;
  /** Esc pressed while the input is empty (e.g. leave detail mode). */
  onEscapeEmpty?: () => void;
  searchFocusSignal?: number;
  isFetching?: boolean;
  /** Detail mode shows a scan-next hint instead of the full placeholder. */
  mode?: 'queue' | 'detail';
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * Scan/search bar for the processing queue. Hidden while viewing row detail.
 */
export function ProcessingScanBar({
  search,
  onSearchChange,
  onSearchEnter,
  onEscapeEmpty,
  searchFocusSignal = 0,
  isFetching = false,
  mode = 'queue',
  placeholder: placeholderProp,
  ariaLabel = 'Scan or search processing queue',
}: ProcessingScanBarProps) {
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
  const inDetail = mode === 'detail';

  return (
    <Box
      sx={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
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
          : inDetail ?
            <QrCodeScannerIcon sx={{ color: 'text.secondary', fontSize: 17, flexShrink: 0 }} />
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
              if (e.key === 'Escape') {
                if (hasSearch) {
                  e.preventDefault();
                  handleClearSearch();
                } else if (onEscapeEmpty) {
                  e.preventDefault();
                  onEscapeEmpty();
                }
              }
            }}
            placeholder={
              placeholderProp ??
              (inDetail ?
                'Scan next item (UPC / SKU / row #) — or type and press Enter to search the queue'
              : 'Scan or search row #, title, UPC, SKU, brand, model, category, specs, tags...')
            }
            aria-label={ariaLabel}
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
      {inDetail ?
        <Typography
          variant="caption"
          sx={{
            flexShrink: 0,
            fontSize: '0.72rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            color: processingTokens.textMute,
          }}
        >
          Esc returns to queue
        </Typography>
      : null}
    </Box>
  );
}
