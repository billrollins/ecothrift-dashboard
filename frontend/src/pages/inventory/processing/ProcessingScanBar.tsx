import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress, Paper, Typography } from '@mui/material';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import SearchIcon from '@mui/icons-material/Search';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { pushSearchHistory, readSearchHistory } from '../../../utils/searchHistory';
import { processingTokens } from './processingTokens';

export interface ProcessingScanBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  /** Enter pressed — caller decides scan-open vs search. */
  onSearchEnter?: () => void;
  /** Apply a past search from history (falls back to change + enter when omitted). */
  onHistorySelect?: (query: string) => void;
  /** localStorage key for recent searches; omit to disable history dropdown. */
  historyStorageKey?: string;
  /** Max recent searches to show (default 25). */
  historyMax?: number;
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
  onHistorySelect,
  historyStorageKey,
  historyMax = 25,
  onEscapeEmpty,
  searchFocusSignal = 0,
  isFetching = false,
  mode = 'queue',
  placeholder: placeholderProp,
  ariaLabel = 'Scan or search processing queue',
}: ProcessingScanBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<string[]>([]);

  const refreshHistory = useCallback(() => {
    if (!historyStorageKey) {
      setHistoryItems([]);
      return;
    }
    setHistoryItems(readSearchHistory(historyStorageKey, historyMax));
  }, [historyStorageKey, historyMax]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!searchFocusSignal) return;
    inputRef.current?.focus();
  }, [searchFocusSignal]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  const handleClearSearch = useCallback(() => {
    onSearchChange('');
    inputRef.current?.focus();
  }, [onSearchChange]);

  const commitHistory = useCallback((query: string) => {
    const q = query.trim();
    if (!q) return;
    if (historyStorageKey) {
      pushSearchHistory(historyStorageKey, q, historyMax);
      refreshHistory();
    }
    if (onHistorySelect) {
      onHistorySelect(q);
    } else {
      onSearchChange(q);
      onSearchEnter?.();
    }
    setHistoryOpen(false);
    inputRef.current?.focus();
  }, [historyStorageKey, historyMax, onHistorySelect, onSearchChange, onSearchEnter, refreshHistory]);

  const visibleHistory = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return historyItems;
    return historyItems.filter((entry) => entry.toLowerCase().includes(needle));
  }, [historyItems, search]);

  const hasSearch = search.trim().length > 0;
  const inDetail = mode === 'detail';
  const showHistory = Boolean(historyStorageKey) && historyOpen && visibleHistory.length > 0;

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
        ref={anchorRef}
        sx={{
          position: 'relative',
          flex: '1 1 520px',
          maxWidth: 620,
          minWidth: 260,
        }}
      >
        <Box
          sx={{
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
              onFocus={() => {
                refreshHistory();
                if (historyStorageKey && readSearchHistory(historyStorageKey, historyMax).length > 0) {
                  setHistoryOpen(true);
                }
              }}
              onBlur={() => {
                window.setTimeout(() => setHistoryOpen(false), 120);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const q = search.trim();
                  if (historyStorageKey && q) {
                    pushSearchHistory(historyStorageKey, q, historyMax);
                    refreshHistory();
                  }
                  onSearchEnter?.();
                  setHistoryOpen(false);
                  return;
                }
                if (e.key === 'Escape') {
                  if (showHistory) {
                    e.preventDefault();
                    setHistoryOpen(false);
                    return;
                  }
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
              aria-expanded={showHistory}
              aria-autocomplete="list"
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

        {showHistory ?
          <Paper
            elevation={4}
            sx={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              zIndex: (theme) => theme.zIndex.modal,
              maxHeight: 260,
              overflow: 'auto',
              border: 1,
              borderColor: processingTokens.border,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                px: 1.25,
                py: 0.75,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontSize: '0.625rem',
                color: processingTokens.textMute,
                borderBottom: 1,
                borderColor: processingTokens.border,
                bgcolor: processingTokens.surfaceTint,
              }}
            >
              Recent searches
            </Typography>
            {visibleHistory.map((entry) => (
              <Box
                key={entry}
                component="button"
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitHistory(entry)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  width: '100%',
                  px: 1.25,
                  py: 0.85,
                  m: 0,
                  border: 0,
                  borderBottom: 1,
                  borderColor: processingTokens.border,
                  bgcolor: 'background.paper',
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                  fontSize: '0.8125rem',
                  color: 'text.primary',
                  '&:last-child': { borderBottom: 0 },
                  '&:hover': { bgcolor: processingTokens.primarySoftStrong },
                }}
              >
                <HistoryOutlinedIcon sx={{ fontSize: 16, color: processingTokens.textMute, flexShrink: 0 }} />
                <Typography
                  component="span"
                  noWrap
                  sx={{ minWidth: 0, fontSize: 'inherit', fontFamily: processingTokens.monoFontFamily }}
                  title={entry}
                >
                  {entry}
                </Typography>
              </Box>
            ))}
          </Paper>
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
