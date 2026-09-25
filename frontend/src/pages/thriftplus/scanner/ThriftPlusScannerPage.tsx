/**
 * Thrift+ price scanner (customer web app, MOCK). Route: /pricescanner (also /scan).
 *
 * Sign in, then one screen: the card stack. The live camera is the bottom card
 * and never stops, so after a swipe the scanner is already running. A code is
 * read, looked up and shown as an item card on top; swipe right to add it to
 * the cart, left to pass. The cart opens from the pill as a receipt with the
 * scan history under it. Data: ../../../api/thriftPlusMock.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Box, ButtonBase, CircularProgress, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { lookupTag, type TagLookup, type ThriftPlusSession } from '../../../api/thriftPlusMock';
import { CameraCard } from './CameraCard';
import { CartPage } from './CartPage';
import { ItemCard, type ItemCardHandle, type SwipeDir } from './ItemCard';
import { ScannerTiles, ScannerTop } from './ScannerTop';
import { SignInScreen } from './SignInScreen';
import { ScanGate, parseTagCode } from './scannerLogic';
import { sc, useScriptFont } from './scannerTheme';
import { loadDetector, useQrCamera } from './useQrCamera';
import { thriftPlusKeys, useCartActions, useSignIn, useThriftPlusCart, useThriftPlusSession } from './useThriftPlus';

export default function ThriftPlusScannerPage() {
  useScriptFont();
  const session = useThriftPlusSession();

  useEffect(() => {
    const prev = document.title;
    document.title = 'Thrift+ price scanner';
    // Warm the decoder while they sign in, so the first scan is instant.
    loadDetector().catch(() => undefined);
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <Box sx={{ position: 'fixed', inset: 0, bgcolor: '#e9ebe4', display: 'flex', justifyContent: 'center', fontFamily: sc.font }}>
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          height: '100dvh',
          bgcolor: sc.page,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: sc.ink,
          '& .MuiTypography-root, & button, & input': { fontFamily: 'inherit' },
        }}
      >
        {!session.data ? (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <CircularProgress sx={{ color: sc.green }} />
          </Box>
        ) : session.data.status === 'signed_out' ? (
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <SignInScreen />
          </Box>
        ) : (
          <ScannerScreen session={session.data} />
        )}
      </Box>
    </Box>
  );
}

interface Top {
  key: number;
  sku: string;
  lookup: TagLookup | null;
}

function ScannerScreen({ session }: { session: Exclude<ThriftPlusSession, { status: 'signed_out' }> }) {
  const member = session.status === 'member' ? session.member : null;
  const isGuest = session.status === 'guest';
  const qc = useQueryClient();
  const cart = useThriftPlusCart();
  const actions = useCartActions();
  const auth = useSignIn();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const cartOpen = params.get('view') === 'cart';

  const [top, setTop] = useState<Top | null>(null);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const topRef = useRef<Top | null>(null);
  const gate = useRef(new ScanGate(2000));
  const cardRef = useRef<ItemCardHandle | null>(null);
  const toastTimer = useRef<number | null>(null);
  topRef.current = top;

  const inCart = useCallback(
    (sku: string) => !!cart.data?.lines.some((l) => l.item.sku === sku),
    [cart.data],
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  const handleCodeRef = useRef<(raw: string, from: 'camera' | 'typed') => void>(() => undefined);
  const camera = useQrCamera({
    enabled: true,
    paused: top != null || cartOpen,
    onDecode: (raw) => handleCodeRef.current(raw, 'camera'),
  });

  handleCodeRef.current = (raw, from) => {
    camera.poke();
    if (topRef.current) return;
    const sku = parseTagCode(raw);
    if (!sku) {
      if (from === 'camera' && !gate.current.accept(`raw:${raw}`)) return;
      showToast("That code isn't a price tag");
      return;
    }
    if (from === 'camera' && !gate.current.accept(sku)) return;
    navigator.vibrate?.(15);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 260);
    const key = Date.now();
    setTop({ key, sku, lookup: null });
    void lookupTag(sku).then((lookup) => {
      setTop((t) => (t && t.key === key ? { ...t, lookup } : t));
      void qc.invalidateQueries({ queryKey: thriftPlusKeys.history });
    });
  };

  const onCardDone = (dir: SwipeDir) => {
    const t = topRef.current;
    if (!t) return;
    if (t.lookup?.status === 'found') {
      const item = t.lookup.item;
      if (dir === 'right') {
        if (inCart(item.sku)) showToast('Already in your cart');
        else actions.add.mutate(item);
      } else {
        actions.pass.mutate(item.sku);
      }
    }
    gate.current.hold(t.sku);
    setTop(null);
    camera.poke();
  };

  // Arrow keys on a laptop: right adds, left passes.
  useEffect(() => {
    if (!top || cartOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') cardRef.current?.fling('right');
      if (e.key === 'ArrowLeft' || e.key === 'Escape') cardRef.current?.fling('left');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top, cartOpen]);

  const openCart = () => setParams({ view: 'cart' }, { state: { tpCart: true } });
  const closeCart = () => {
    if ((location.state as { tpCart?: boolean } | null)?.tpCart) navigate(-1);
    else setParams({}, { replace: true });
  };

  const found = top?.lookup?.status === 'found' ? top.lookup.item : null;
  const canAdd = !!found && found.available;

  return (
    <Box
      onPointerDown={() => camera.poke()}
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}
    >
      <ScannerTop cart={cart.data} onOpenCart={openCart} />
      <ScannerTiles member={member} cart={cart.data} onSignIn={() => auth.signOut.mutate()} />

      {/* The stack */}
      <Box sx={{ flex: 1, minHeight: 260, position: 'relative', mx: 5, mt: 2, mb: 1.5 }}>
        <CameraCard
          videoRef={camera.videoRef}
          status={camera.status}
          error={camera.error}
          underneath={top != null}
          flash={flash}
          onWake={camera.wake}
          onCode={(code) => handleCodeRef.current(code, 'typed')}
        />
        {top && (
          <ItemCard
            key={top.key}
            ref={cardRef}
            sku={top.sku}
            lookup={top.lookup}
            isGuest={isGuest}
            inCart={found ? inCart(found.sku) : false}
            onDone={onCardDone}
            onFeel={(feel) => actions.feel.mutate({ sku: top.sku, feel })}
          />
        )}
        {top && (
          <>
            <SideHint side="left" label="Pass" onClick={() => cardRef.current?.fling('left')} />
            <SideHint side="right" label="Add" disabled={!canAdd} onClick={() => cardRef.current?.fling('right')} />
          </>
        )}
        {toast && (
          <Box
            role="status"
            sx={{
              position: 'absolute',
              top: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 6,
              px: 2,
              py: 1,
              borderRadius: 99,
              bgcolor: 'rgba(16,21,17,0.88)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {toast}
          </Box>
        )}
      </Box>

      {/* Pass / Add */}
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', gap: 5 }}>
        <RoundAction
          label="Pass"
          disabled={!top}
          onClick={() => cardRef.current?.fling('left')}
          icon={<CloseRounded sx={{ fontSize: 34, color: sc.ink2 }} />}
          bg="#fff"
          size={62}
          labelColor={sc.ink2}
        />
        <RoundAction
          label="Add to my list"
          disabled={!canAdd}
          onClick={() => cardRef.current?.fling('right')}
          icon={<AddRounded sx={{ fontSize: 40, color: '#fff' }} />}
          bg={`radial-gradient(circle at 35% 30%, ${sc.greenBright}, ${sc.green} 60%, ${sc.greenDeep})`}
          size={70}
          labelColor={sc.greenDeep}
        />
      </Box>
      <Typography
        sx={{ textAlign: 'center', fontSize: 14, color: sc.ink2, pt: 0.5, pb: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
      >
        {top ? 'Swipe right to add, left to pass.' : 'Point your camera at a price tag.'}
      </Typography>

      {cartOpen && (
        <CartPage
          cart={cart.data}
          member={member}
          isGuest={isGuest}
          onBack={closeCart}
          onSignIn={() => auth.signOut.mutate()}
          onSignOut={() => auth.signOut.mutate()}
        />
      )}
    </Box>
  );
}

function SideHint({
  side,
  label,
  disabled = false,
  onClick,
}: {
  side: 'left' | 'right';
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      aria-hidden
      tabIndex={-1}
      sx={{
        position: 'absolute',
        top: '50%',
        [side]: -40,
        transform: 'translateY(-50%)',
        width: 38,
        flexDirection: 'column',
        color: side === 'left' ? sc.ink2 : sc.green,
        opacity: disabled ? 0.3 : 1,
        fontSize: 13,
        fontWeight: 700,
        borderRadius: 2,
        py: 1,
      }}
    >
      {side === 'left' ? <ChevronLeftRounded sx={{ fontSize: 34 }} /> : <ChevronRightRounded sx={{ fontSize: 34 }} />}
      {label}
    </ButtonBase>
  );
}

function RoundAction({
  label,
  icon,
  bg,
  size,
  labelColor,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  bg: string;
  size: number;
  labelColor: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, opacity: disabled ? 0.45 : 1, transition: 'opacity 150ms' }}>
      <ButtonBase
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        sx={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: bg,
          boxShadow: '0 4px 12px rgba(31,38,29,0.18), inset 0 2px 0 rgba(255,255,255,0.35)',
          '&:active': { transform: 'scale(0.94)' },
          transition: 'transform 90ms',
        }}
      >
        {icon}
      </ButtonBase>
      <Typography sx={{ fontSize: 15, fontWeight: 700, color: labelColor }}>{label}</Typography>
    </Box>
  );
}
