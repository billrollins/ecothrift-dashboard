/**
 * The item hover card (Bill, 2026-10-28: "staff HATES having to click into it to see item full description").
 *
 * - `<ItemPeek itemId={5}>{name}</ItemPeek>` wraps an item's name in any list.
 * - Desktop: hover the name; after a short pause the card follows the mouse at an offset (like the Dashboard
 *   Sales chart tooltip), stays inside the window, never catches the mouse, and hides when the mouse leaves.
 *   The data starts loading the moment the mouse arrives, so it is usually there before the card opens.
 * - Phone (no hover): a small (i) after the name opens it; a long press on the name does too.
 * - `<ItemSkuLink itemId={5} sku="ITM0001" />` is the clickable SKU: hover card + click opens the universal Item modal.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Box, Chip, ClickAwayListener, IconButton, Link, Paper, Popper, Portal, Stack, Typography, useMediaQuery,
} from '@mui/material';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { useQueryClient } from '@tanstack/react-query';
import {
  itemCardDay, itemCardMoney, itemCardSpecs, itemCardWhere, prefetchItemCardLite, useItemCardLite,
} from './itemCardData';
import { useOptionalObjectModal } from './ObjectModal';

const OPEN_DELAY_MS = 280;
const LONG_PRESS_MS = 450;
/** The card sits this far right of and below the pointer (flips left / up near the window edge). */
const CURSOR_OFFSET = 16;
const EDGE = 8;

/** Where the follow card goes for a pointer at (x, y): offset from it, flipped and clamped to stay in the window. */
export function followCardPosition(
  x: number, y: number, w: number, h: number, vw: number, vh: number,
): { left: number; top: number } {
  let left = x + CURSOR_OFFSET;
  if (left + w > vw - EDGE) left = x - CURSOR_OFFSET - w;
  let top = y + CURSOR_OFFSET;
  if (top + h > vh - EDGE) top = y - CURSOR_OFFSET - h;
  return {
    left: Math.max(EDGE, Math.min(left, vw - EDGE - w)),
    top: Math.max(EDGE, Math.min(top, vh - EDGE - h)),
  };
}

export function useCanHover(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)', { noSsr: true });
}

function PeekBody({ itemId, onOpen }: { itemId: number; onOpen?: () => void }) {
  const qc = useQueryClient();
  const { data, isError } = useItemCardLite(itemId, true, qc);
  if (isError) return <Typography sx={{ p: 1.5, fontSize: 13 }}>This item could not be loaded.</Typography>;
  if (!data) {
    return (
      <Stack direction="row" spacing={1.5} sx={{ p: 1.5 }} aria-busy>
        <Box sx={{ width: 84, height: 84, borderRadius: 1, bgcolor: 'action.hover' }} />
        <Stack spacing={0.75} sx={{ flex: 1 }}>
          <Box sx={{ height: 12, width: '40%', bgcolor: 'action.hover', borderRadius: 0.5 }} />
          <Box sx={{ height: 16, width: '90%', bgcolor: 'action.hover', borderRadius: 0.5 }} />
          <Box sx={{ height: 12, width: '60%', bgcolor: 'action.hover', borderRadius: 0.5 }} />
        </Stack>
      </Stack>
    );
  }
  const specs = itemCardSpecs(data.specifications, 5);
  const brandModel = [data.brand !== 'Generic' ? data.brand : '', data.model].filter(Boolean).join(' · ');
  return (
    <Box sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Box
          sx={{
            width: 84, height: 84, flexShrink: 0, borderRadius: 1, overflow: 'hidden', bgcolor: 'action.hover',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {data.photo_url ? (
            <Box component="img" src={data.photo_url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>No photo</Typography>
          )}
        </Box>
        <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Typography sx={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 12 }}>{data.sku}</Typography>
            <Chip size="small" label={data.status_label} variant="outlined" sx={{ height: 20, fontSize: 11 }} />
          </Stack>
          <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{data.title || 'Untitled item'}</Typography>
          {brandModel && <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{brandModel}</Typography>}
          <Stack direction="row" spacing={1.5} sx={{ pt: 0.25 }}>
            <Typography sx={{ fontSize: 13 }}>
              <b>{itemCardMoney(data.price)}</b>
              <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}> tag</Typography>
            </Typography>
            <Typography sx={{ fontSize: 13 }}>
              {itemCardMoney(data.tag_retail ?? data.retail)}
              <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary' }}> retail</Typography>
            </Typography>
          </Stack>
        </Stack>
      </Stack>
      <Box
        component="dl"
        sx={{
          m: 0, mt: 1.25, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 1.25, rowGap: 0.35, fontSize: 12,
          '& dt': { color: 'text.secondary' },
          '& dd': { m: 0, overflowWrap: 'anywhere' },
        }}
      >
        <dt>Condition</dt><dd>{data.condition_label}</dd>
        <dt>Where</dt><dd>{itemCardWhere(data)}</dd>
        {data.category && (<><dt>Category</dt><dd>{data.category}</dd></>)}
        {specs.map(([k, v]) => (<Box key={k} sx={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></Box>))}
        {data.restoration?.final_grade && (<><dt>Grade</dt><dd>{data.restoration.final_grade}</dd></>)}
        {data.sold_at && (<><dt>Sold</dt><dd>{itemCardMoney(data.sold_for)} · {itemCardDay(data.sold_at)}</dd></>)}
        {data.order && (<><dt>Order</dt><dd>{data.order.order_number}{data.order.vendor ? ` · ${data.order.vendor}` : ''}</dd></>)}
        {data.notes && (<><dt>Notes</dt><dd>{data.notes.length > 160 ? `${data.notes.slice(0, 160)}…` : data.notes}</dd></>)}
      </Box>
      {onOpen && (
        <Link component="button" type="button" onClick={onOpen} sx={{ mt: 1, fontSize: 12, fontWeight: 700 }}>
          Open the full item
        </Link>
      )}
    </Box>
  );
}

/** The hover card works without an ObjectModalProvider; "Open the full item" needs one. */
function useOpenItem(): ((id: number) => void) | null {
  const modal = useOptionalObjectModal();
  return modal ? (id: number) => modal.openObject({ type: 'item', id }) : null;
}

export function ItemPeek({
  itemId,
  children,
  showInfoButton = true,
  block = false,
}: {
  itemId: number | null | undefined;
  children: ReactNode;
  /** Phone only: the (i) after the name. Off where the row has no room; long press still works. */
  showInfoButton?: boolean;
  /** Fill the cell (for an ellipsis name in a table cell) instead of sitting inline. */
  block?: boolean;
}) {
  const qc = useQueryClient();
  const canHover = useCanHover();
  const openItem = useOpenItem();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const openTimer = useRef<number | null>(null);
  const pressTimer = useRef<number | null>(null);
  const pressed = useRef(false);
  const pointer = useRef({ x: 0, y: 0 });
  const followRef = useRef<HTMLDivElement | null>(null);

  // Move the card straight in the DOM: following the mouse never re-renders the list.
  const place = useCallback(() => {
    const el = followRef.current;
    if (!el) return;
    const { left, top } = followCardPosition(
      pointer.current.x, pointer.current.y, el.offsetWidth, el.offsetHeight, window.innerWidth, window.innerHeight,
    );
    el.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }, []);
  const resizeObs = useRef<ResizeObserver | null>(null);
  const followMounted = useCallback((el: HTMLDivElement | null) => {
    followRef.current = el;
    resizeObs.current?.disconnect();
    resizeObs.current = null;
    if (!el) return;
    place();
    // The card grows when its data arrives: keep it inside the window.
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs.current = new ResizeObserver(place);
      resizeObs.current.observe(el);
    }
  }, [place]);

  const clear = useCallback(() => {
    for (const t of [openTimer, pressTimer]) {
      if (t.current != null) window.clearTimeout(t.current);
      t.current = null;
    }
  }, []);
  useEffect(() => clear, [clear]);

  if (itemId == null) return <>{children}</>;
  const id = itemId;

  const enter = (e: React.MouseEvent) => {
    if (!canHover) return;
    pointer.current = { x: e.clientX, y: e.clientY };
    prefetchItemCardLite(qc, id);
    if (!open && openTimer.current == null) {
      openTimer.current = window.setTimeout(() => {
        openTimer.current = null;
        setOpen(true);
      }, OPEN_DELAY_MS);
    }
  };
  const move = (e: React.MouseEvent) => {
    if (!canHover) return;
    pointer.current = { x: e.clientX, y: e.clientY };
    place();
  };
  const leave = () => {
    if (!canHover) return;
    if (openTimer.current != null) window.clearTimeout(openTimer.current);
    openTimer.current = null;
    setOpen(false);
  };
  const touchStart = () => {
    if (canHover) return;
    pressed.current = false;
    prefetchItemCardLite(qc, id);
    pressTimer.current = window.setTimeout(() => {
      pressed.current = true;
      setOpen(true);
    }, LONG_PRESS_MS);
  };
  const touchEnd = () => {
    if (pressTimer.current != null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  return (
    <>
      <Box
        component="span"
        ref={anchorRef}
        data-item-peek={id}
        onMouseEnter={enter}
        onMouseMove={move}
        onMouseLeave={leave}
        onTouchStart={touchStart}
        onTouchEnd={touchEnd}
        onTouchMove={touchEnd}
        onClickCapture={(e) => {
          // A long press opened the card: the finger lifting is not a click on the row.
          if (pressed.current) {
            e.stopPropagation();
            e.preventDefault();
            pressed.current = false;
          }
        }}
        onContextMenu={(e) => { if (!canHover) e.preventDefault(); }}
        sx={{
          display: block ? 'flex' : 'inline-flex', alignItems: 'center', minWidth: 0, maxWidth: '100%', gap: 0.25,
          ...(block ? { width: '100%', '& > :first-of-type': { minWidth: 0, flex: 1 } } : {}),
        }}
      >
        {children}
        {!canHover && showInfoButton && (
          <IconButton
            size="small"
            aria-label="Item details"
            onClick={(e) => {
              e.stopPropagation();
              prefetchItemCardLite(qc, id);
              setOpen((v) => !v);
            }}
            sx={{ p: 0.5, ml: 0.25, color: 'text.secondary' }}
          >
            <InfoOutlined sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Box>
      {canHover && open && (
        <Portal>
          <Paper
            ref={followMounted}
            elevation={8}
            role="tooltip"
            aria-label="Item details"
            sx={{
              position: 'fixed', left: 0, top: 0, zIndex: (t) => t.zIndex.modal + 1,
              width: 360, maxWidth: 'calc(100vw - 16px)', borderRadius: 2, pointerEvents: 'none',
            }}
          >
            <PeekBody itemId={id} />
          </Paper>
        </Portal>
      )}
      <Popper
        open={open && !canHover}
        anchorEl={anchorRef.current}
        placement="bottom-start"
        sx={{ zIndex: (t) => t.zIndex.modal + 1 }}
        modifiers={[{ name: 'preventOverflow', options: { padding: 8 } }, { name: 'flip', options: { padding: 8 } }]}
      >
        <ClickAwayListener onClickAway={() => setOpen(false)}>
          <Paper
            elevation={8}
            role="dialog"
            aria-label="Item details"
            onClick={(e) => e.stopPropagation()}
            sx={{ width: { xs: 'calc(100vw - 16px)', sm: 360 }, maxWidth: 360, borderRadius: 2 }}
          >
            <PeekBody
              itemId={id}
              onOpen={openItem ? () => { setOpen(false); openItem(id); } : undefined}
            />
          </Paper>
        </ClickAwayListener>
      </Popper>
    </>
  );
}

/** The clickable SKU: hover for the card, click for the universal Item modal. Without an ObjectModalProvider it is plain text with the hover card. */
export function ItemSkuLink({ itemId, sku, sx }: { itemId: number; sku: string; sx?: object }) {
  const openItem = useOpenItem();
  if (!openItem) return <ItemPeek itemId={itemId} showInfoButton={false}><Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 800, ...sx }}>{sku}</Box></ItemPeek>;
  return (
    <ItemPeek itemId={itemId} showInfoButton={false}>
      <Link
        component="button"
        type="button"
        underline="hover"
        title={`Open item ${sku}`}
        onClick={(e) => {
          e.stopPropagation();
          openItem(itemId);
        }}
        sx={{ fontFamily: 'monospace', fontWeight: 800, whiteSpace: 'nowrap', color: 'inherit', fontSize: 'inherit', ...sx }}
      >
        {sku}
      </Link>
    </ItemPeek>
  );
}
