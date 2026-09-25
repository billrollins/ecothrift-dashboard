/**
 * Thrift+ price scanner (customer web app, MOCK). Route: /scan.
 *
 * Sign in, then one screen matched to the owner's design: header, banked
 * rewards and cover tiles, and a card stack whose bottom card is the live
 * camera, so after a swipe the scanner is already running. A code is read,
 * looked up and shown as an item card on top; swipe right to add it to the
 * cart, left to pass. The first add asks bank-or-rebate. The cart opens from
 * the pill with the scan history under it. Tiles explain themselves when
 * tapped; a first-run walkthrough covers Scan, Bank and Cart.
 * Data: ../../../api/thriftPlusMock.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Box, ButtonBase, CircularProgress } from '@mui/material';
import {
  fromCents,
  lookupTag,
  toCents,
  type RewardChoice,
  type TagLookup,
  type ThriftPlusCart,
  type ThriftPlusItemCard,
  type ThriftPlusSession,
} from '../../../api/thriftPlusMock';
import { CameraCard } from './CameraCard';
import { CartPage } from './CartPage';
import { InfoPopup, IntroTour, introSeen, markIntroSeen, type Origin, type Topic } from './Explainers';
import { ItemCard, type ItemCardHandle, type SwipeDir } from './ItemCard';
import { ScannerTiles, ScannerTop } from './ScannerTop';
import { SignInScreen } from './SignInScreen';
import { ScanGate, money, parseTagCode } from './scannerLogic';
import { UNIT_CSS, art, sc, u, useScannerFonts } from './scannerTheme';
import { loadDetector, useQrCamera } from './useQrCamera';
import { thriftPlusKeys, useCartActions, useSignIn, useThriftPlusCart, useThriftPlusSession } from './useThriftPlus';

export default function ThriftPlusScannerPage() {
  useScannerFonts();
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

  const [top, setTop] = useState<Top | null>(null);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [askBank, setAskBank] = useState(false);
  const [explain, setExplain] = useState<{ topic: Topic; origin: Origin | null } | null>(null);
  const [tour, setTour] = useState(() => !introSeen());
  const rootRef = useRef<HTMLDivElement | null>(null);
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
    paused: top != null || cartOpen || askBank || tour || explain != null,
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

  /** Every add (swipe, button, history) goes through here, so the first one can ask bank-or-rebate. */
  const addItem = (item: ThriftPlusItemCard) => {
    actions.add.mutate(item, {
      onSuccess: (next: ThriftPlusCart) => {
        if (member && next.reward_choice == null) setAskBank(true);
      },
    });
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
    if (!top || cartOpen || askBank) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight') cardRef.current?.fling('right');
      if (e.key === 'ArrowLeft' || e.key === 'Escape') cardRef.current?.fling('left');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top, cartOpen, askBank]);

  const openCart = () => setParams({ view: 'cart' }, { state: { tpCart: true } });
  const closeCart = () => {
    if ((location.state as { tpCart?: boolean } | null)?.tpCart) navigate(-1);
    else setParams({}, { replace: true });
  };

  const choose = (choice: RewardChoice) => {
    actions.choose.mutate(choice);
    setAskBank(false);
    camera.poke();
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
  const canAdd = !!found && found.available;

  return (
    <Box
      ref={rootRef}
      onPointerDown={() => camera.poke()}
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}
    >
      <ScannerTop cart={cart.data} onOpenCart={openCart} />
      <Box sx={{ flex: 1, minHeight: 0, width: u(900), mx: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Gap basis={38} min={14} />
        <ScannerTiles member={member} cart={cart.data} onSignIn={() => auth.signOut.mutate()} onExplain={openExplain} />
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

        <Gap basis={20} min={10} />

        {/* Pass / Add to my list */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: u(40), flexShrink: 0 }}>
          <RoundAction label="Pass" disabled={!top} onClick={() => cardRef.current?.fling('left')} kind="pass" />
          <RoundAction label="Add to my list" disabled={!canAdd} onClick={() => cardRef.current?.fling('right')} kind="add" />
        </Box>

        <Gap basis={40} min={10} />
        <Box
          aria-hidden={!top}
          sx={{ textAlign: 'center', fontSize: u(29), color: sc.ink2, flexShrink: 0, lineHeight: 1.2, visibility: top ? 'visible' : 'hidden' }}
        >
          Swipe right to add, left to pass.
        </Box>
        <Box sx={{ flexShrink: 0, height: `calc(${u(30)} + env(safe-area-inset-bottom, 0px))` }} />
      </Box>

      {cartOpen && (
        <CartPage
          cart={cart.data}
          member={member}
          isGuest={isGuest}
          onBack={closeCart}
          onAdd={addItem}
          onChoose={(c) => actions.choose.mutate(c)}
          onExplain={openExplain}
          onTour={() => setTour(true)}
          onSignIn={() => auth.signOut.mutate()}
          onSignOut={() => auth.signOut.mutate()}
        />
      )}

      {askBank && cart.data && <BankPrompt cart={cart.data} onChoose={choose} />}

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

/** First add of a trip: bank the rewards (worth more) or take them off today's price. The register gets the answer. */
function BankPrompt({ cart, onChoose }: { cart: ThriftPlusCart; onChoose: (c: RewardChoice) => void }) {
  const t = cart.totals;
  const worth = Number.parseFloat(t.bank_value) > 0;
  const rebate = fromCents(toCents(t.bank_value) - toCents(t.bank_extra));
  return (
    <Box
      role="dialog"
      aria-modal="true"
      aria-labelledby="tp-bank-title"
      sx={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
    >
      <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(20,26,20,0.42)', animation: 'tpDim 160ms ease both', '@keyframes tpDim': { from: { opacity: 0 } } }} />
      <Box
        sx={{
          position: 'relative',
          bgcolor: sc.card,
          borderRadius: `${u(44)} ${u(44)} 0 0`,
          px: u(50),
          pt: u(36),
          pb: `calc(${u(40)} + env(safe-area-inset-bottom, 0px))`,
          textAlign: 'center',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.18)',
          animation: 'tpSheet 220ms ease-out both',
          '@keyframes tpSheet': { from: { transform: 'translateY(40%)', opacity: 0 } },
        }}
      >
        <Box component="img" src={art.coins} alt="" sx={{ width: u(140), height: u(140) }} />
        <Box
          id="tp-bank-title"
          sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(54), lineHeight: 1.1, color: sc.titleGreen, mt: u(8) }}
        >
          Would you like to bank your rewards?
        </Box>
        <Box sx={{ fontSize: u(30), color: sc.ink2, lineHeight: 1.4, mt: u(12) }}>
          Banked rewards are worth {t.bank_extra_pct}% more. Use them on a later trip.
        </Box>
        <ButtonBase
          onClick={() => onChoose('bank')}
          sx={{
            mt: u(30),
            width: '100%',
            minHeight: u(120),
            flexDirection: 'column',
            borderRadius: u(60),
            background: `linear-gradient(180deg, #62c64a, ${sc.green})`,
            boxShadow: '0 4px 12px rgba(63,159,53,0.35), inset 0 2px 0 rgba(255,255,255,0.35)',
            color: '#fff',
            py: u(16),
          }}
        >
          <Box sx={{ fontSize: u(34), fontWeight: 700 }}>Yes, bank my rewards</Box>
          <Box sx={{ fontSize: u(26), opacity: 0.95, mt: u(2) }}>
            {worth ? `${money(t.bank_value)} for later, ${t.bank_extra_pct}% more` : `Worth ${t.bank_extra_pct}% more`}
          </Box>
        </ButtonBase>
        <ButtonBase
          onClick={() => onChoose('instant')}
          sx={{
            mt: u(16),
            width: '100%',
            minHeight: u(120),
            flexDirection: 'column',
            borderRadius: u(60),
            border: `${u(3)} solid ${sc.cardEdge}`,
            color: sc.priceGreen,
            py: u(16),
          }}
        >
          <Box sx={{ fontSize: u(34), fontWeight: 700 }}>No, instant rebate please</Box>
          <Box sx={{ fontSize: u(26), color: sc.ink2, mt: u(2) }}>
            {worth ? `${money(rebate)} off today's price` : "Off today's price"}
          </Box>
        </ButtonBase>
        <Box sx={{ fontSize: u(25), color: sc.ink3, mt: u(20), lineHeight: 1.35 }}>
          We'll let the register know. Remind your cashier at checkout, too.
        </Box>
      </Box>
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
  const color = side === 'left' ? '#6d706a' : sc.green;
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      aria-hidden
      tabIndex={-1}
      sx={{
        position: 'absolute',
        top: '50%',
        ...(side === 'left' ? { left: u(-110) } : { left: `calc(100% + ${u(25)})` }),
        width: u(100),
        transform: 'translateY(-50%)',
        flexDirection: 'column',
        color,
        opacity: disabled ? 0.3 : 1,
        fontSize: u(29),
        fontWeight: 500,
        borderRadius: u(16),
        py: u(12),
      }}
    >
      <Chevron dir={side} color={color} />
      <Box sx={{ mt: u(8) }}>{label}</Box>
    </ButtonBase>
  );
}

function RoundAction({
  label,
  kind,
  disabled,
  onClick,
}: {
  label: string;
  kind: 'pass' | 'add';
  disabled: boolean;
  onClick: () => void;
}) {
  const add = kind === 'add';
  return (
    <Box
      sx={{
        width: u(230),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        opacity: disabled ? 0.45 : 1,
        transition: 'opacity 150ms',
      }}
    >
      <ButtonBase
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        sx={{
          width: u(148),
          height: u(148),
          borderRadius: '50%',
          ...(add
            ? { backgroundImage: `url(${art.orb})`, backgroundSize: '112%', backgroundPosition: 'center 40%' }
            : { bgcolor: '#fff', boxShadow: '0 8px 20px rgba(31,38,29,0.16), 0 1px 3px rgba(31,38,29,0.08)' }),
          '&:active': { transform: 'scale(0.94)' },
          transition: 'transform 90ms',
        }}
      >
        <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: u(add ? 78 : 74), height: u(add ? 78 : 74) }}>
          <path
            d={add ? 'M12 4.5 V19.5 M4.5 12 H19.5' : 'M6 6 L18 18 M18 6 L6 18'}
            fill="none"
            stroke={add ? '#fff' : '#6d706a'}
            strokeWidth={add ? 3.6 : 3.2}
            strokeLinecap="round"
            style={add ? { filter: 'drop-shadow(0 1px 1px rgba(20,70,20,0.45))' } : undefined}
          />
        </Box>
      </ButtonBase>
      <Box
        sx={{
          mt: u(24),
          fontSize: u(32),
          fontWeight: add ? 600 : 500,
          color: add ? '#2e8f2a' : sc.ink2,
          whiteSpace: 'nowrap',
          lineHeight: 1.2,
        }}
      >
        {label}
      </Box>
    </Box>
  );
}
