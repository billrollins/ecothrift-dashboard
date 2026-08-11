import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import {
  formatLockPct,
  parsePctInput,
  pctFromRetailPrice,
  priceFromRetailPct,
  readRetailPriceLockPref,
  RETAIL_PRICE_LOCK_CHANGE_EVENT,
  sanitizePctInput,
  writeRetailPriceLockPref,
  type RetailPriceLockPref,
} from '../../../utils/retailPriceLock';
import { processingTokens } from '../processing/processingTokens';

export interface UseRetailPriceLockResult {
  locked: boolean;
  toggleLock: (retail?: string | null, price?: string | null) => void;
  /** Sticky stored percent (may lag live retail/price when unlocked). */
  pct: number | null;
  /**
   * Display percent: live price/retail when both present; else sticky stored pct.
   * Callers pass current retail + price so the badge stays in sync.
   */
  effectivePct: (retail: string | null | undefined, price: string | null | undefined) => number | null;
  /** True when effectivePct is the sticky fallback (not derived from current values). */
  isPctFallback: (retail: string | null | undefined, price: string | null | undefined) => boolean;
  setPct: (pct: number | null) => void;
  /**
   * When locked and a usable pct exists, returns the price for nextRetail; else null (leave price alone).
   * Pass current retail/price so the held ratio prefers the live badge value over a stale sticky pct.
   * Always reads the latest lock state (ref), so ManifestField onSave closures stay correct.
   */
  priceForRetail: (
    nextRetail: string | null | undefined,
    current?: { retail?: string | null; price?: string | null },
  ) => string | null;
  /** Re-derive sticky pct from price/retail (always updates when both valid). */
  syncPctFromPrice: (retail: string | null | undefined, price: string | null | undefined) => void;
}

export function useRetailPriceLock(): UseRetailPriceLockResult {
  const [pref, setPref] = useState<RetailPriceLockPref>(() => readRetailPriceLockPref());
  const prefRef = useRef(pref);
  prefRef.current = pref;

  useEffect(() => {
    function onChange(event: Event) {
      const detail = (event as CustomEvent<RetailPriceLockPref>).detail;
      if (detail && typeof detail === 'object') {
        setPref({
          locked: Boolean(detail.locked),
          pct:
            typeof detail.pct === 'number' && Number.isFinite(detail.pct) && detail.pct > 0
              ? Math.round(detail.pct * 10) / 10
              : null,
        });
        return;
      }
      setPref(readRetailPriceLockPref());
    }
    window.addEventListener(RETAIL_PRICE_LOCK_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(RETAIL_PRICE_LOCK_CHANGE_EVENT, onChange);
  }, []);

  const persistPatch = useCallback((patch: Partial<RetailPriceLockPref>) => {
    setPref((prev) => {
      const next: RetailPriceLockPref = {
        locked: patch.locked ?? prev.locked,
        pct: patch.pct !== undefined ? patch.pct : prev.pct,
      };
      if (next.locked === prev.locked && next.pct === prev.pct) return prev;
      writeRetailPriceLockPref(next);
      return next;
    });
  }, []);

  const effectivePct = useCallback(
    (retail: string | null | undefined, price: string | null | undefined): number | null => {
      const live = pctFromRetailPrice(retail, price);
      if (live != null) return live;
      return pref.pct;
    },
    [pref.pct],
  );

  const isPctFallback = useCallback(
    (retail: string | null | undefined, price: string | null | undefined): boolean => {
      const live = pctFromRetailPrice(retail, price);
      return live == null && pref.pct != null;
    },
    [pref.pct],
  );

  const setPct = useCallback(
    (pct: number | null) => {
      persistPatch({ pct });
    },
    [persistPatch],
  );

  const toggleLock = useCallback((retail?: string | null, price?: string | null) => {
    const live = pctFromRetailPrice(retail, price);
    setPref((prev) => {
      const next: RetailPriceLockPref = {
        locked: !prev.locked,
        pct: live ?? prev.pct,
      };
      writeRetailPriceLockPref(next);
      return next;
    });
  }, []);

  const priceForRetail = useCallback(
    (
      nextRetail: string | null | undefined,
      current?: { retail?: string | null; price?: string | null },
    ): string | null => {
      // Read latest pref via ref so ManifestField confirmEdit closures are never stale.
      const { locked, pct: sticky } = prefRef.current;
      if (!locked) return null;
      const live = pctFromRetailPrice(current?.retail, current?.price);
      const pct = live ?? sticky;
      if (pct == null || pct <= 0) return null;
      return priceFromRetailPct(nextRetail, pct);
    },
    [],
  );

  const syncPctFromPrice = useCallback(
    (retail: string | null | undefined, price: string | null | undefined) => {
      const live = pctFromRetailPrice(retail, price);
      if (live == null) return;
      persistPatch({ pct: live });
    },
    [persistPatch],
  );

  return useMemo(
    () => ({
      locked: pref.locked,
      toggleLock,
      pct: pref.pct,
      effectivePct,
      isPctFallback,
      setPct,
      priceForRetail,
      syncPctFromPrice,
    }),
    [pref.locked, pref.pct, toggleLock, effectivePct, isPctFallback, setPct, priceForRetail, syncPctFromPrice],
  );
}

export function RetailPriceLockToggle({
  locked,
  pct,
  onToggle,
  size = 'medium',
  disabled,
}: {
  locked: boolean;
  pct: number | null;
  onToggle: () => void;
  size?: 'small' | 'medium';
  disabled?: boolean;
}) {
  const pctLabel = formatLockPct(pct);
  const title =
    locked ?
      pct != null
        ? `Unlock — price follows retail at ${pctLabel}`
        : 'Unlock — price no longer follows retail'
    : pct != null
      ? `Lock — keep price at ${pctLabel} of retail`
      : 'Lock — keep price as a percent of retail';

  const iconPx = size === 'small' ? 16 : 20;
  const btnPx = size === 'small' ? 26 : 34;

  return (
    <Tooltip title={title} enterDelay={300}>
      <span>
        <IconButton
          size="small"
          aria-label={locked ? 'Unlock retail/price percent' : 'Lock retail/price percent'}
          aria-pressed={locked}
          disabled={disabled}
          onClick={onToggle}
          sx={{
            width: btnPx,
            height: btnPx,
            color: locked ? processingTokens.primaryDark : processingTokens.textMute,
            bgcolor: locked ? processingTokens.primarySoft : 'transparent',
            border: '1px solid',
            borderColor: locked ? `${processingTokens.primary}66` : processingTokens.border,
            borderRadius: 1,
            '&:hover': {
              bgcolor: locked ? processingTokens.primarySoftStrong : processingTokens.neutralSoft,
              borderColor: locked ? processingTokens.primary : processingTokens.borderStrong,
            },
          }}
        >
          {locked ?
            <LockIcon sx={{ fontSize: iconPx }} />
          : <LockOpenIcon sx={{ fontSize: iconPx }} />}
        </IconButton>
      </span>
    </Tooltip>
  );
}

export function RetailPricePctButton({
  retail,
  price,
  pct,
  isFallback,
  onCommitPct,
  size = 'medium',
  disabled,
}: {
  retail: string | null | undefined;
  price: string | null | undefined;
  pct: number | null;
  isFallback?: boolean;
  onCommitPct: (pct: number, nextPrice: string) => void;
  size?: 'small' | 'medium';
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef('');
  const editingRef = useRef(false);
  const commitGuardRef = useRef(false);

  const retailN = Number.parseFloat(String(retail ?? '').replace(/[$,\s]/g, ''));
  const retailOk = Number.isFinite(retailN) && retailN > 0;
  // Allow edit whenever retail exists — even with no prior pct (user can set the first %).
  const canEdit = !disabled && retailOk;

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    commitGuardRef.current = false;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function beginEdit() {
    if (!canEdit) return;
    commitGuardRef.current = false;
    const seed =
      pct == null ? ''
      : Number.isInteger(pct) ? String(pct)
      : pct.toFixed(1);
    setDraft(seed);
    draftRef.current = seed;
    setEditing(true);
  }

  function cancelEdit() {
    commitGuardRef.current = true;
    editingRef.current = false;
    setEditing(false);
    setDraft('');
    draftRef.current = '';
  }

  function commitEdit() {
    if (!editingRef.current || commitGuardRef.current) return;
    const nextPct = parsePctInput(draftRef.current);
    if (nextPct == null) {
      cancelEdit();
      return;
    }
    const nextPrice = priceFromRetailPct(retail, nextPct);
    if (nextPrice == null) {
      cancelEdit();
      return;
    }
    commitGuardRef.current = true;
    editingRef.current = false;
    setEditing(false);
    setDraft('');
    draftRef.current = '';
    onCommitPct(nextPct, nextPrice);
  }

  const label = formatLockPct(pct);
  const tip =
    !retailOk ?
      'Enter retail first to set price as a percent'
    : pct == null ?
      'Click to set price as a percent of retail'
    : isFallback ?
      `Default ${label} of retail (no price yet) — click to edit`
    : `Price is ${label} of retail — click to change`;

  const fontSize = size === 'small' ? '0.6875rem' : '0.8125rem';
  const minWidth = size === 'small' ? 36 : 44;
  const height = size === 'small' ? 22 : 28;

  if (editing) {
    return (
      <Box
        component="input"
        ref={inputRef}
        value={draft}
        inputMode="decimal"
        aria-label="Price as percent of retail"
        onChange={(e) => {
          const next = sanitizePctInput(e.target.value);
          draftRef.current = next;
          setDraft(next);
        }}
        onBlur={() => {
          // Defer so Enter keydown can commit first without a double-fire race.
          window.setTimeout(() => commitEdit(), 0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            commitEdit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelEdit();
          }
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        sx={{
          width: minWidth + 8,
          minWidth,
          height,
          px: 0.5,
          border: '1.5px solid',
          borderColor: processingTokens.primary,
          borderRadius: 0.75,
          bgcolor: '#fff',
          fontSize,
          fontWeight: 800,
          fontFamily: processingTokens.monoFontFamily,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'center',
          outline: 'none',
          boxShadow: processingTokens.focusRing,
        }}
      />
    );
  }

  return (
    <Tooltip title={tip} enterDelay={300}>
      <span>
        <Box
          component="button"
          type="button"
          disabled={!canEdit}
          aria-label={tip}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            beginEdit();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth,
            height,
            px: 0.6,
            border: '1px solid',
            borderColor: canEdit ? `${processingTokens.primary}55` : processingTokens.border,
            borderRadius: 0.75,
            bgcolor: canEdit ? processingTokens.primarySoft : processingTokens.neutralSoft,
            color:
              !canEdit ? processingTokens.textMute
              : pct == null || isFallback ? processingTokens.textMute
              : processingTokens.primaryDark,
            fontSize,
            fontWeight: 800,
            fontFamily: processingTokens.monoFontFamily,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.01em',
            cursor: canEdit ? 'pointer' : 'default',
            opacity: canEdit ? 1 : 0.75,
            lineHeight: 1,
            '&:hover': canEdit
              ? {
                  bgcolor: processingTokens.primarySoftStrong,
                  borderColor: processingTokens.primary,
                }
              : {},
            '&:disabled': {
              cursor: 'default',
            },
          }}
        >
          <Typography
            component="span"
            sx={{
              fontSize: 'inherit',
              fontWeight: 'inherit',
              fontFamily: 'inherit',
              color: 'inherit',
              lineHeight: 1,
            }}
          >
            {label}
          </Typography>
        </Box>
      </span>
    </Tooltip>
  );
}
