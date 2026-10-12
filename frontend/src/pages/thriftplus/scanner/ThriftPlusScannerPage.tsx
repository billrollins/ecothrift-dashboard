/**
 * Thrift+ price scanner (customer web app). Route: /scan.
 *
 * Sign in, then one screen matched to the owner's design: header, banked
 * rewards and cover tiles, and a card stack whose bottom card is the live
 * camera, so after a swipe the scanner is already running. A code is read,
 * looked up and shown as an item card on top; swipe right to add it to the
 * cart, left to pass. The first add asks bank-or-rebate. The cart opens from
 * the pill with the scan history under it. Tiles explain themselves when
 * tapped; a first-run walkthrough covers Scan, Bank and Cart.
 * Data: ../../../api/thriftPlusScanner.api.ts (the real API). Money helpers: thriftPlusMock.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, ButtonBase, CircularProgress } from '@mui/material';
import { fromCents, toCents } from '../../../api/thriftPlusMock';
import {
  fetchScannerSettings,
  isOpen,
  lookupTag,
  setPreviewCode,
  type RewardChoice,
  type TagLookup,
  type ThriftPlusCart,
  type ThriftPlusItemCard,
  type ThriftPlusSession,
} from '../../../api/thriftPlusScanner.api';
import { AccountPage, ResetPasswordScreen } from './AccountScreens';
import { BalancePage } from './BalancePage';
import { CameraCard } from './CameraCard';
import { CARD_STYLES, ScannerLookContext, lookOverride, saveCard, saveLookOverride, savedCard, useScannerLook, type CardStyle } from './scannerLook';
import { CartPage } from './CartPage';
import { InfoPopup, IntroTour, introSeen, markIntroSeen, type Origin, type Topic } from './Explainers';
import { ItemCard, type ItemCardHandle, type SwipeDir } from './ItemCard';
import { ScannerTiles, ScannerTop } from './ScannerTop';
import { SignInScreen } from './SignInScreen';
import { bankInto, rainPlan, shower } from './TicketRain';
import { TbAmount } from '../../../components/thriftplus/ThriftBucks';
import { ScanGate, parseTagCode } from './scannerLogic';
import { UNIT_CSS, art, sc, u, useScannerFonts } from './scannerTheme';
import { loadDetector, useQrCamera } from './useQrCamera';
import { thriftPlusKeys, useCartActions, useSignIn, useThriftPlusCart, useThriftPlusSession } from './useThriftPlus';

const TYPE_ONLY_KEY = 'tp-type-only';

function typeOnlyMode(): boolean {
  try {
    return sessionStorage.getItem(TYPE_ONLY_KEY) === '1' || new URLSearchParams(window.location.search).get('type') === '1';
  } catch {
    return new URLSearchParams(window.location.search).get('type') === '1';
  }
}

export default function ThriftPlusScannerPage() {
  useScannerFonts();
  const [pageParams, setPageParams] = useSearchParams();
  const resetToken = pageParams.get('reset');
  // A staff phone before launch: /scan?preview=<code> (owner, 2026-10-07). Kept on the phone, then off the address.
  const preview = pageParams.get('preview');
  if (preview) setPreviewCode(preview);
  useEffect(() => {
    if (!preview) return;
    const next = new URLSearchParams(pageParams);
    next.delete('preview');
    setPageParams(next, { replace: true });
  }, [preview]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = useQuery({ queryKey: ['thriftPlus', 'open'], queryFn: isOpen, staleTime: 60_000 });
  const [staffSignIn, setStaffSignIn] = useState(false);
  // Price first or ThriftBucks first (owner 2026-10-10): the setting, unless staff flipped it on this phone.
  const lookSetting = useQuery({ queryKey: ['thriftPlus', 'look'], queryFn: fetchScannerSettings, staleTime: 300_000 });
  const [lookFlip, setLookFlip] = useState<boolean | null>(lookOverride);
  const priceFirst = lookFlip ?? lookSetting.data?.priceFirst ?? true;
  const [cardChoice, setCard] = useState<CardStyle>(savedCard);
  // A choice from an older build (or none) falls back to the first card.
  const card: CardStyle = CARD_STYLES.some((x) => x.style === cardChoice) ? cardChoice : CARD_STYLES[0].style;
  const look = {
    priceFirst,
    flip: () => {
      saveLookOverride(!priceFirst);
      setLookFlip(!priceFirst);
    },
    card,
    nextCard: () => {
      const i = CARD_STYLES.findIndex((x) => x.style === card);
      const next = CARD_STYLES[(i + 1) % CARD_STYLES.length].style;
      saveCard(next);
      setCard(next);
    },
  };
  // Testing without a camera (owner, 2026-10-10): /scan?type=1 skips the camera for this browser tab; ?type=0 turns it back on.
  const typeParam = pageParams.get('type');
  if (typeParam !== null) {
    try {
      if (typeParam === '0') sessionStorage.removeItem(TYPE_ONLY_KEY);
      else sessionStorage.setItem(TYPE_ONLY_KEY, '1');
    } catch {
      /* private mode: the flag lasts for this page only */
    }
  }
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
    <ScannerLookContext.Provider value={look}>
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        bgcolor: '#e6e7e1',
        display: 'flex',
        justifyContent: 'center',
        '--u': UNIT_CSS,
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          height: '100dvh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: sc.ink,
          fontFamily: sc.font,
          background: `radial-gradient(ellipse at 50% 45%, ${sc.pageLight} 0%, ${sc.page} 75%)`,
          '& button, & input': { fontFamily: 'inherit' },
        }}
      >
        {open.data === false ? (
          staffSignIn ? (
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              <SignInScreen />
            </Box>
          ) : (
            <ComingSoon onStaff={() => setStaffSignIn(true)} />
          )
        ) : resetToken ? (
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <ResetPasswordScreen token={resetToken} onDone={() => setPageParams({}, { replace: true })} />
          </Box>
        ) : !session.data ? (
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
    </ScannerLookContext.Provider>
  );
}

/** Thrift+ is off: what a customer sees at /scan until launch. Staff can sign in to test it (2026-10-10). */
function ComingSoon({ onStaff }: { onStaff: () => void }) {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 4, textAlign: 'center' }}>
      <Box>
        <Box sx={{ fontSize: 34, fontWeight: 900, color: sc.green, mb: 1 }}>Thrift+</Box>
        <Box sx={{ fontSize: 20, fontWeight: 800, mb: 1 }}>Coming soon</Box>
        <Box sx={{ fontSize: 16, color: sc.ink, opacity: 0.75 }}>Ask at the register.</Box>
        <ButtonBase onClick={onStaff} sx={{ mt: 4, fontSize: 14, color: sc.ink2, textDecoration: 'underline', borderRadius: 1 }}>
          Staff sign in
        </ButtonBase>
      </Box>
    </Box>
  );
}

/** Staff test mode: Thrift+ is still off for customers (2026-10-10), and the look to flip. */
function TestModeBar() {
  const look = useScannerLook();
  return (
    <Box
      role="status"
      data-testid="test-mode-bar"
      sx={{
        flexShrink: 0, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#4A3200', bgcolor: '#F0C766',
        py: '4px', pt: 'calc(env(safe-area-inset-top, 0px) + 4px)',
      }}
    >
      Test mode: Thrift+ isn't open to customers yet
      <ButtonBase
        onClick={look.flip}
        data-testid="look-flip"
        sx={{ ml: 1, px: 1, borderRadius: 1, fontSize: 12, fontWeight: 800, textDecoration: 'underline', color: 'inherit' }}
      >
        {look.priceFirst ? 'Show ThriftBucks big' : 'Show price big'}
      </ButtonBase>
      <ButtonBase
        onClick={look.nextCard}
        data-testid="card-style"
        sx={{ ml: 1, px: 1, borderRadius: 1, fontSize: 12, fontWeight: 800, textDecoration: 'underline', color: 'inherit' }}
      >
        {`Card: ${CARD_STYLES.find((x) => x.style === look.card)?.label} (change)`}
      </ButtonBase>
    </Box>
  );
}

interface Top {
  key: number;
  sku: string;
  lookup: TagLookup | null;
}

/** Flexible gap: gives up its height first on short screens, grows on tall ones. */
function Gap({ basis, min }: { basis: number; min: number }) {
  return <Box aria-hidden sx={{ flex: `1 30 ${u(basis)}`, minHeight: u(min) }} />;
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
  const accountOpen = params.get('view') === 'account' && !!member;
  const balanceOpen = params.get('view') === 'balance' && !!member;

  const [top, setTop] = useState<Top | null>(null);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [explain, setExplain] = useState<{ topic: Topic; origin: Origin | null } | null>(null);
  const [tour, setTour] = useState(() => !introSeen());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<Top | null>(null);
  const gate = useRef(new ScanGate(2000));
  const cardRef = useRef<ItemCardHandle | null>(null);
  const toastTimer = useRef<number | null>(null);
  topRef.current = top;

  // Bank it / Shower (owner, 2026-10-09): a swipe right fills the cover first, then the ThriftBucks Balance.
  const rainSeen = useRef<{ fill: number; bank: number } | null>(null);
  useEffect(() => {
    const c = cart.data;
    if (!member || !c) {
      rainSeen.current = null;
      return;
    }
    const coverCents = toCents(member.cover.amount);
    const fill = Math.min(coverCents, toCents(member.cover.covered) + toCents(c.totals.to_cover));
    const bank = c.reward_choice === 'instant' ? 0 : toCents(c.totals.bank_value);
    const plan = rainPlan(rainSeen.current, { fill, bank, cover: coverCents });
    rainSeen.current = { fill, bank };
    const root = rootRef.current;
    if (plan.cover) bankInto(root, root?.querySelector('[data-rain="cover"]') ?? null);
    if (plan.shower) window.setTimeout(() => shower(root), 700);
    if (plan.balance) {
      window.setTimeout(
        () => bankInto(root, root?.querySelector('[data-rain="balance"]') ?? null),
        plan.cover ? 650 : 0,
      );
    }
  }, [cart.data, member]);

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
  const typeOnly = typeOnlyMode();
  const camera = useQrCamera({
    enabled: !typeOnly,
    paused: top != null || cartOpen || accountOpen || balanceOpen || tour || explain != null,
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

  /** Every add (swipe, button, history) goes through here. No InstantBucks question in the app (owner 2026-10-10). */
  const addItem = (item: ThriftPlusItemCard) => {
    actions.add.mutate(item);
  };

  const onCardDone = (dir: SwipeDir) => {
    const t = topRef.current;
    if (!t) return;
    if (t.lookup?.status === 'found') {
      const item = t.lookup.item;
      if (dir === 'right') {
        if (inCart(item.sku)) showToast('Already in your cart');
        else addItem(item);
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
    if (!top || cartOpen || accountOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') cardRef.current?.fling('right');
      if (e.key === 'ArrowLeft' || e.key === 'Escape') cardRef.current?.fling('left');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top, cartOpen, accountOpen]);

  const openAccount = () => setParams({ view: 'account' }, { state: { tpCart: true } });
  const openCart = () => setParams({ view: 'cart' }, { state: { tpCart: true } });
  // Tap ThriftBucks: every ThriftBuck in the order it is used (owner, 2026-10-09).
  const openBalance = () => setParams({ view: 'balance' }, { state: { tpCart: true } });
  const closeCart = () => {
    if ((location.state as { tpCart?: boolean } | null)?.tpCart) navigate(-1);
    else setParams({}, { replace: true });
  };

  /** Open an explainer that grows out of the tapped element. */
  const openExplain = (topic: Topic, from?: HTMLElement | null) => {
    const root = rootRef.current?.getBoundingClientRect();
    const r = from?.getBoundingClientRect();
    setExplain({
      topic,
      origin: root && r ? { x: r.left + r.width / 2 - root.left, y: r.top + r.height / 2 - root.top } : null,
    });
  };

  const endTour = () => {
    markIntroSeen();
    setTour(false);
  };

  const found = top?.lookup?.status === 'found' ? top.lookup.item : null;

  return (
    <Box
      ref={rootRef}
      onPointerDown={() => camera.poke()}
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}
    >
      {member?.test_mode && <TestModeBar />}
      <ScannerTop cart={cart.data} isGuest={isGuest} onOpenCart={openCart} />
      <Box sx={{ flex: 1, minHeight: 0, width: u(900), mx: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Gap basis={38} min={14} />
        <ScannerTiles
          member={member}
          cart={cart.data}
          onSignIn={() => auth.signOut.mutate()}
          onExplain={(topic, el) => (topic === 'bank' && member ? openBalance() : openExplain(topic, el))}
        />
        <Gap basis={44} min={16} />

        {/* The stack (the extra 22 is the back card peeking out) */}
        <Box sx={{ position: 'relative', flex: `1 1 ${u(838)}`, minHeight: u(470), maxHeight: u(838), ml: u(110), width: u(668) }}>
          <Box sx={{ position: 'absolute', left: 0, top: 0, width: '100%', height: `calc(100% - ${u(22)})` }}>
            <CameraCard
              videoRef={camera.videoRef}
              status={camera.status}
              error={camera.error}
              underneath={top != null}
              flash={flash}
              onWake={camera.wake}
              onCode={(code) => handleCodeRef.current(code, 'typed')}
              onHelp={(el) => openExplain('camera', el)}
              typeOnly={typeOnly}
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
            {toast && (
              <Box
                role="status"
                sx={{
                  position: 'absolute',
                  top: u(24),
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 6,
                  px: u(32),
                  py: u(16),
                  borderRadius: 99,
                  bgcolor: 'rgba(16,21,17,0.88)',
                  color: '#fff',
                  fontSize: u(30),
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {toast}
              </Box>
            )}
          </Box>
        </Box>

        {/* Owner 2026-10-10: no Pass / Add buttons, no arrows, no swipe hint. Swiping still works; it isn't advertised.
            The space they took goes below the card, so the card stays up under the tiles. */}
        <Box aria-hidden sx={{ flex: `100 1 ${u(40)}`, minHeight: `calc(${u(40)} + env(safe-area-inset-bottom, 0px))` }} />
      </Box>

      {cartOpen && (
        <CartPage
          cart={cart.data}
          member={member}
          isGuest={isGuest}
          onBack={closeCart}
          onAdd={addItem}
          onExplain={openExplain}
          onTour={() => setTour(true)}
          onSignIn={() => auth.signOut.mutate()}
          onSignOut={() => auth.signOut.mutate()}
          onAccount={member ? openAccount : undefined}
        />
      )}

      {balanceOpen && member && <BalancePage member={member} cart={cart.data} onBack={closeCart} />}

      {accountOpen && member && (
        <AccountPage
          member={member}
          onBack={closeCart}
          onSignOut={() => auth.signOut.mutate()}
          onSignInWithPassword={() => auth.signOut.mutate()}
        />
      )}


      {tour && (
        <IntroTour
          isGuest={isGuest}
          onDone={endTour}
          onCameraHelp={() => {
            endTour();
            openExplain('camera');
          }}
        />
      )}

      {explain && (
        <InfoPopup
          topic={explain.topic}
          origin={explain.origin}
          member={member}
          cart={cart.data}
          onClose={() => setExplain(null)}
          onRetryCamera={camera.wake}
        />
      )}
    </Box>
  );
}


function Chevron({ dir, color }: { dir: 'left' | 'right'; color: string }) {
  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: u(62), height: u(62), display: 'block' }}>
      <path
        d={dir === 'left' ? 'M15.5 4 L7.5 12 L15.5 20' : 'M8.5 4 L16.5 12 L8.5 20'}
        fill="none"
        stroke={color}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Box>
  );
}

