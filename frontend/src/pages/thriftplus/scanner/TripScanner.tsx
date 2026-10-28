/**
 * The Thrift+ trip scanner (owner 2026-10-13: demo A of 10-12 and 10-13, on the real camera and the real trip).
 *
 * - **This trip** is a summary bar under the header that never moves: the cart and its count, the ThriftBucks back,
 *   the items' badges. A tap flips the middle between the camera and the trip's lines.
 * - **The middle:** the live camera; a scanned tag fills it as a big price tag (3-day returns or AS IS, the retail
 *   price to tap, our price, the ThriftBucks back, "Price feel off?"); or the trip's lines ("×1" opens − +, slide a
 *   line left to remove it, with Undo; "Clear my trip").
 * - **Every action is on the bottom buttons:** the camera open: See this trip; a tag scanned: Pass or Add to trip
 *   (swiping the tag right or left does the same, never mentioned); the trip open: Scan more.
 * - **Every code gets an answer** (owner 2026-10-15, APP D13 to D15): a product barcode or other text says "That's
 *   not our price tag", our code with no item "We can't find that item", one of our links "That QR code is a link";
 *   each with Scan again. The camera zooms with the phone's own levels (CameraCard, useQrCamera).
 * - **The header:** tap it for what Thrift+ is; the pill's two halves open the Bucks and My QR tabs.
 * - **The bottom bar** (owner 2026-10-20): Scan, Bucks, My QR, Account (memberTabs.tsx), for signed-in members; each tab is
 *   a screen above the bar, picked by `?view=` and replaced in the address so Back never walks the tabs. Hidden while
 *   Finish joining is open (it is required) and for non-members. A "Put Thrift+ on your home screen" banner shows on
 *   Scan in mobile browsers (homeScreen.tsx).
 * The ThriftBucks are the engine's, from the calculator's saved setting (before launch: launch day).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Box, ButtonBase, CircularProgress } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import SearchOffRounded from '@mui/icons-material/SearchOffRounded';
import ShoppingCartOutlined from '@mui/icons-material/ShoppingCartOutlined';
import SmsRounded from '@mui/icons-material/SmsRounded';
import {
  addToCart,
  lookupTag,
  setCartQty,
  type TagLookup,
  type ThriftPlusCart,
  type ThriftPlusCartLine,
  type ThriftPlusItemCard,
  type ThriftPlusSession,
} from '../../../api/thriftPlusScanner.api';
import { tbNumber } from '../../../components/thriftplus/ThriftBucks';
import { AccountPage } from './AccountScreens';
import { CameraCard } from './CameraCard';
import { InfoPopup } from './Explainers';
import { CantFindItem, NotOurTag, OurLink } from './ScanAnswers';
import { SidewaysGotIt, SidewaysScanPill, TurnUprightScreen } from './Sideways';
import { bankInto } from './TicketRain';
import { ScanGate, classifyCode, hasFinishSteps, money, type ScannedCode } from './scannerLogic';
import { AddPhone } from './AddPhone';
import { CategoryBadge, art, sc, u } from './scannerTheme';
import { FinishJoining } from './FinishJoining';
import { HomeScreenCard } from './homeScreen';
import { MemberTabBar, memberBarShown, tabOfView, viewOfTab, type MemberTab } from './memberTabs';
import { BalanceScreen, FeelSheet, InfoSheet, RETAIL_INFO, RETURNS_INFO, SidewaysQr, ThriftPlusSheet, TripHeader, WalletScreen, type Feel, type Info } from './tripSheets';
import { BigBucks, BigButton, QtyStepper, ReturnsBadge, SwipeRow, useCountUp, useSwipe, useUndo } from './tripUi';
import { loadDetector, useQrCamera } from './useQrCamera';
import { useSideways, useUprightLock } from './screenLock';
import { thriftPlusKeys, useCartActions, useSignIn, useThriftPlusCart } from './useThriftPlus';

// 'item': a trip line's tag seen again from This trip (owner 2026-10-15, APP D12).
type Mode = 'scan' | 'card' | 'trip' | 'item';

/** A tag or code on screen. Also the Thrift+ Staff app's test scanner's (owner 2026-10-16, StaffScanPage.tsx). */
export interface Top {
  key: number;
  sku: string;
  lookup: TagLookup | null;
  /** What the camera read or someone typed (APP D14, D15); none for a trip line seen again (D12). */
  code?: ScannedCode;
  /** The gate's name for this code, ignored for 3 s after [Scan again]. */
  gateKey?: string;
  /** Opened from a Thrift+ Perks tag's QR (/scan?tag=<SKU>): a guest sees Get Thrift+ under it. */
  fromLink?: boolean;
}

/** The answer card a code gets instead of a tag (owner 2026-10-15, APP D14a, D14b, D15), or null for a tag. */
export type Answer = 'not-ours' | 'not-found' | 'link';

export function answerFor(top: Top | null): Answer | null {
  const code = top?.code;
  if (!code) return null;
  if (code.kind === 'other') return 'not-ours';
  if (code.kind === 'link') return 'link';
  if (top.lookup?.status === 'not_found') return code.ours ? 'not-found' : 'not-ours';
  return null;
}

/** [Scan again] ignores that same code this long, so it doesn't pop straight back up (APP D14). */
const SCAN_AGAIN_IGNORE_MS = 3000;

const TYPE_ONLY_KEY = 'tp-type-only';

/** Testing without a camera: /scan?type=1 (this browser tab), ?type=0 turns the camera back on. */
export function typeOnlyMode(): boolean {
  try {
    return sessionStorage.getItem(TYPE_ONLY_KEY) === '1' || new URLSearchParams(window.location.search).get('type') === '1';
  } catch {
    return new URLSearchParams(window.location.search).get('type') === '1';
  }
}

export function TripScanner({ session }: { session: Exclude<ThriftPlusSession, { status: 'signed_out' }> }) {
  const member = session.status === 'member' ? session.member : null;
  const isGuest = session.status === 'guest';
  const qc = useQueryClient();
  const cart = useThriftPlusCart();
  const actions = useCartActions();
  const auth = useSignIn();
  const [params, setParams] = useSearchParams();
  // The bottom bar's tab (owner 2026-10-20) comes from the address: ecothrift.us/qr is /scan?view=qr (the My QR tab), and
  // ecothrift.us/join on a phone that's signed in lands there too (owner 2026-10-15, APP D9). Non-members only scan.
  const view = params.get('view');
  const tab: MemberTab = member ? tabOfView(view) : 'scan';
  // Join v2 (owner 2026-10-19): a pending member's selfie and signature, after a join's sign-in or from the Member QR.
  const finishShown = view === 'finish' && !!member;
  // Phone first (owner 2026-10-20): a member with no phone sees only "Add your mobile number" (like Finish joining, no skip).
  const phoneOpen = !!member?.needs_phone;
  const finishOpen = finishShown || phoneOpen;
  // Required (owner 2026-10-20): a pending member with steps left always lands on Finish joining (after the phone).
  const finishLeft = member?.ready === false && (member.finish_steps?.length ?? 0) > 0;
  useEffect(() => {
    if (finishLeft && !phoneOpen && view !== 'finish') setParams({ view: 'finish' }, { replace: true });
  }, [finishLeft, phoneOpen, view, setParams]);

  // The phone was just saved and there are steps left to do in the app: on to Finish joining.
  const wasPhoneOpen = useRef(false);
  useEffect(() => {
    if (wasPhoneOpen.current && !phoneOpen && hasFinishSteps(member)) setParams({ view: 'finish' }, { replace: true });
    wasPhoneOpen.current = phoneOpen;
  }, [phoneOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const [mode, setMode] = useState<Mode>('scan');
  const [top, setTop] = useState<Top | null>(null);
  const [flash, setFlash] = useState(false);
  const [sheet, setSheet] = useState<null | 'about' | 'camera'>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [feel, setFeel] = useState<Feel | null>(null);
  // A phone held sideways (owner 2026-10-15, APP D16 v2): the camera keeps scanning full screen, everything else asks
  // to turn the phone upright. "Lock upright" locks the screen where the browser can (Android).
  const sideways = useSideways();
  const lock = useUprightLock();
  const undo = useUndo(24);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<Top | null>(null);
  const gate = useRef(new ScanGate(2000));
  topRef.current = top;

  const lines = [...(cart.data?.lines ?? [])].sort((a, b) => b.added_at.localeCompare(a.added_at));
  const count = cart.data?.totals.item_count ?? 0;
  const total = Number.parseFloat(cart.data?.totals.reward_total ?? '0') || 0;
  const shown = useCountUp(total, { ms: 750, delay: 150 });
  const qtyOf = useCallback((sku: string) => cart.data?.lines.find((l) => l.item.sku === sku)?.qty ?? 0, [cart.data]);

  // ThriftBucks coupons fall onto This trip when it grows.
  const lastTotal = useRef<number | null>(null);
  useEffect(() => {
    if (lastTotal.current != null && total > lastTotal.current) {
      const root = rootRef.current;
      window.setTimeout(() => bankInto(root, root?.querySelector('[data-target="trip-total"]') ?? null, 8), 60);
    }
    lastTotal.current = cart.data ? total : lastTotal.current;
  }, [total, cart.data]);

  useEffect(() => {
    loadDetector().catch(() => undefined);
  }, []);

  const handleCodeRef = useRef<(raw: string, from: 'camera' | 'typed' | 'link', format?: string) => void>(() => undefined);
  const typeOnly = typeOnlyMode();
  const camera = useQrCamera({
    // Finish joining's selfie needs the front camera: the scanner lets go of the back one (a paused stream still holds
    // it, and phones won't open two cameras at once).
    // A tag's QR link shows its item first: the camera (and its permission question) waits until that card closes.
    enabled: !typeOnly && !finishOpen && !top?.fromLink,
    paused: mode !== 'scan' || sheet != null || info != null || feel != null || tab !== 'scan' || finishOpen,
    onDecode: (raw, format) => handleCodeRef.current(raw, 'camera', format),
  });

  // Every code read gets an answer (owner 2026-10-15, APP D14, D15): a buzz and a flash, then a tag, or a card that
  // says what the code is. Only tag codes are looked up.
  handleCodeRef.current = (raw, from, format) => {
    camera.poke();
    if (topRef.current) return;
    const code = classifyCode(raw, format);
    const text = raw.trim();
    const gateKey = code.kind === 'tag' ? code.sku : `raw:${text}`;
    if (from === 'camera' && !gate.current.accept(gateKey)) return;
    navigator.vibrate?.(15);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 260);
    const key = Date.now();
    setTop({ key, sku: code.kind === 'tag' ? code.sku : text, lookup: null, code, gateKey, fromLink: from === 'link' });
    setMode('card');
    if (code.kind !== 'tag') return;
    void lookupTag(code.sku).then((lookup) => {
      setTop((t) => (t && t.key === key ? { ...t, lookup } : t));
      void qc.invalidateQueries({ queryKey: thriftPlusKeys.history });
    });
  };

  // A tag's QR link opens that tag, once; the SKU comes off the address so Back and a reload don't open it again.
  const linkTag = useRef(params.get('tag'));
  useEffect(() => {
    const sku = linkTag.current;
    if (!sku) return;
    linkTag.current = null;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('tag');
      return next;
    }, { replace: true });
    handleCodeRef.current(sku, 'link');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const found = top?.lookup?.status === 'found' ? top.lookup.item : null;
  const canAdd = !!found && found.available;
  const inTrip = found ? qtyOf(found.sku) : 0;
  const answer = mode === 'card' ? answerFor(top) : null;

  const closeCard = () => {
    if (topRef.current) gate.current.hold(topRef.current.gateKey ?? topRef.current.sku);
    setTop(null);
    setMode('scan');
    camera.poke();
  };
  /** [Scan again] on an answer card: back to the camera, and that same code is ignored for 3 s (APP D14). */
  const scanAgain = () => {
    const t = topRef.current;
    if (t) gate.current.ignore(t.gateKey ?? t.sku, SCAN_AGAIN_IGNORE_MS);
    setTop(null);
    setMode('scan');
    camera.poke();
  };
  const pass = () => {
    if (found) actions.pass.mutate(found.sku);
    closeCard();
  };
  const add = () => {
    if (!found || !found.available) return;
    if (inTrip > 0) actions.setQty.mutate({ sku: found.sku, qty: inTrip + 1 });
    else actions.add.mutate(found);
    closeCard();
  };
  // This trip flips between the camera and the trip's lines (owner 2026-10-13); a tag on screen is put away.
  const toggleTrip = () => {
    if (topRef.current && mode === 'card') gate.current.hold(topRef.current.sku);
    setTop(null);
    setMode((m) => (m === 'trip' || m === 'item' ? 'scan' : 'trip'));
  };
  // A trip line's tag again (APP D12): the line's item at once, refreshed in the background (not counted as a scan).
  const openLine = (line: ThriftPlusCartLine) => {
    const key = Date.now();
    setTop({ key, sku: line.item.sku, lookup: { status: 'found', item: line.item } });
    setMode('item');
    void lookupTag(line.item.sku, { again: true }).then((lookup) => {
      if (lookup.status === 'found') setTop((t) => (t && t.key === key ? { ...t, lookup } : t));
    });
  };
  const backToTrip = () => {
    setTop(null);
    setMode('trip');
  };

  /** Put lines back (Undo), one at a time so each answer builds on the last. */
  const restore = async (back: ThriftPlusCartLine[]) => {
    let latest: ThriftPlusCart | null = null;
    for (const line of back) {
      try {
        latest = await addToCart(line.item);
        if (line.qty > 1) latest = await setCartQty(line.item.sku, line.qty);
      } catch {
        /* sold since: it stays out */
      }
    }
    if (latest) qc.setQueryData(thriftPlusKeys.cart, latest);
  };
  const removeLine = (line: ThriftPlusCartLine) => {
    actions.remove.mutate(line.item.sku);
    undo.show(`Removed ${line.item.title}`, () => void restore([line]));
  };
  const setQty = (line: ThriftPlusCartLine, qty: number) =>
    qty <= 0 ? removeLine(line) : actions.setQty.mutate({ sku: line.item.sku, qty });
  const clearTrip = () => {
    const before = [...lines].reverse();
    actions.clear.mutate();
    undo.show('Cleared your trip', () => void restore(before));
  };

  // A laptop: right arrow adds, left arrow or Escape passes; on a trip line's tag, they go back to the trip.
  useEffect(() => {
    if ((mode !== 'card' && mode !== 'item') || sheet || info || feel || tab !== 'scan' || finishOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (mode === 'item') {
        if (e.key === 'ArrowLeft' || e.key === 'Escape') backToTrip();
        return;
      }
      if (answer) {
        if (e.key === 'ArrowLeft' || e.key === 'Escape') scanAgain();
        return;
      }
      if (e.key === 'ArrowRight') add();
      if (e.key === 'ArrowLeft' || e.key === 'Escape') pass();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // A tab of the bottom bar: the address is replaced (Back never walks the tabs), and what a sheet or a tag had open goes away.
  const goTab = (next: MemberTab) => {
    setSheet(null);
    setInfo(null);
    setFeel(null);
    const nextView = viewOfTab(next);
    setParams(nextView ? { view: nextView } : {}, { replace: true });
  };

  const overlayOpen = !!sheet || !!info || !!feel || tab !== 'scan' || finishOpen;
  const cameraSideways = sideways && mode === 'scan' && !overlayOpen;
  // A code read while sideways (the tag is ready underneath), and the Member QR shown alone to a cashier.
  const readSideways = mode === 'card' && !overlayOpen;
  const qrSideways = tab === 'qr' && !!member && !info && !feel && !finishOpen;
  const barShown = memberBarShown({ isMember: !!member, view, sideways }) && !phoneOpen; // not over Add your mobile number
  const homeBanner = tab === 'scan' && !finishOpen && !!member;

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
    <Box ref={rootRef} onPointerDown={() => camera.poke()} sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {member?.test_mode && <TestModeBar />}
      <TripHeader member={member} onAbout={() => setSheet('about')} onWallet={() => goTab('qr')} onBalance={() => goTab('bucks')} onSignIn={() => auth.signOut.mutate()} />
      <Box sx={{ flex: 1, minHeight: 0, width: u(900), mx: 'auto', px: u(20), pt: u(18), pb: barShown ? u(20) : `calc(${u(20)} + env(safe-area-inset-bottom, 0px))`,
        display: 'flex', flexDirection: 'column', gap: u(18) }}>
        {homeBanner && <HomeScreenCard variant="banner" />}
        <SummaryBar count={count} total={shown} lines={lines} open={mode === 'trip' || mode === 'item'} onToggle={toggleTrip} isGuest={isGuest} />

        <Box data-testid="stage" sx={cameraSideways ? { position: 'fixed', inset: 0, zIndex: 70 } : { position: 'relative', flex: 1, minHeight: 0 }}>
          {mode === 'trip' ? (
            <TripView lines={lines} onQty={setQty} onRemove={removeLine} onClear={clearTrip} onOpen={openLine} />
          ) : mode === 'item' ? (
            top && (
              <ScanCard
                key={top.key}
                top={top}
                isGuest={isGuest}
                verified18={member?.verified_18 ?? false}
                qty={inTrip}
                onAdd={null}
                onPass={backToTrip}
                onFeel={() => setFeel({ step: 'reasons' })}
                onRetail={() => setInfo(RETAIL_INFO)}
                onReturns={(ok) => setInfo(RETURNS_INFO[ok ? 'yes' : 'no'])}
              />
            )
          ) : (
            <>
              <CameraCard
                videoRef={camera.videoRef}
                status={camera.status}
                error={camera.error}
                zoom={camera.zoom}
                switching={camera.switching}
                underneath={false}
                flash={flash}
                onWake={camera.wake}
                onRestart={camera.restart}
                onCode={(code) => handleCodeRef.current(code, 'typed')}
                onHelp={() => setSheet('camera')}
                typeOnly={typeOnly}
                lock={lock}
                fullBleed={cameraSideways}
              />
              {top && (
                <ScanCard
                  key={top.key}
                  top={top}
                  answer={answer}
                  isGuest={isGuest}
                  verified18={member?.verified_18 ?? false}
                  qty={inTrip}
                  onAdd={canAdd ? add : null}
                  onPass={answer ? scanAgain : pass}
                  onFeel={() => setFeel({ step: 'reasons' })}
                  onRetail={() => setInfo(RETAIL_INFO)}
                  onReturns={(ok) => setInfo(RETURNS_INFO[ok ? 'yes' : 'no'])}
                />
              )}
            </>
          )}
          {undo.node}
        </Box>

        {mode === 'card' && top?.fromLink && isGuest && !answer && (
          <Box sx={{ flexShrink: 0, display: 'flex' }}>
            <BigButton primary onClick={() => setParams({ view: 'join' })} testId="get-thrift-plus">
              Get Thrift+
            </BigButton>
          </Box>
        )}
        {/* Every action lives here (owner 2026-10-12). */}
        <Box data-testid="actions" sx={{ flexShrink: 0, display: 'flex', gap: u(16) }}>
          {mode === 'scan' && (
            <>
            <BigButton onClick={() => setMode('trip')} testId="see-trip">
              <ShoppingCartOutlined sx={{ fontSize: u(46), color: sc.green }} />
              See this trip
              {count > 0 && (
                <Box component="span" sx={{ ml: u(4), minWidth: u(46), height: u(46), px: u(10), borderRadius: 99, bgcolor: sc.green, color: '#fff',
                  fontSize: u(26), fontWeight: 800, display: 'grid', placeItems: 'center' }}>{count}</Box>
              )}
            </BigButton>
            </>
          )}
          {mode === 'card' && answer && (
            <>
              {top?.code?.kind === 'link' && (
                <BigButton href={top.code.href} testId="open-link">
                  <OpenInNewRounded sx={{ fontSize: u(42) }} />
                  Open link
                </BigButton>
              )}
              <BigButton primary flex={answer === 'link' ? 1.35 : 1} onClick={scanAgain} testId="scan-again">
                <QrCodeScannerRounded sx={{ fontSize: u(46) }} />
                Scan again
              </BigButton>
            </>
          )}
          {mode === 'card' && !answer && (
            <>
              <BigButton onClick={pass} testId="pass">
                <CloseRounded sx={{ fontSize: u(44) }} />
                Pass
              </BigButton>
              <BigButton primary flex={1.35} onClick={add} disabled={!canAdd} testId="add">
                <AddRounded sx={{ fontSize: u(48) }} />
                {found && !found.available ? 'Sold' : inTrip > 0 ? 'Add another' : 'Add to trip'}
              </BigButton>
            </>
          )}
          {mode === 'item' && (
            <>
              <BigButton testId="remove-line"
                onClick={() => {
                  const line = lines.find((l) => l.item.sku === top?.sku);
                  if (line) removeLine(line);
                  backToTrip();
                }}>
                <DeleteOutlineRounded sx={{ fontSize: u(44), color: '#b01f14' }} />
                Remove
              </BigButton>
              <BigButton primary flex={1.35} onClick={backToTrip} testId="back-to-trip">
                <ArrowBackRounded sx={{ fontSize: u(46) }} />
                Back to trip
              </BigButton>
            </>
          )}
          {mode === 'trip' && (
            <>
            <BigButton primary onClick={() => setMode('scan')} testId="scan-more">
              <QrCodeScannerRounded sx={{ fontSize: u(46) }} />
              Scan more
            </BigButton>
            </>
          )}
        </Box>
      </Box>

      {sheet === 'about' && <ThriftPlusSheet onClose={() => setSheet(null)} />}
      {tab === 'qr' && member && <WalletScreen member={member} onFinish={() => setParams({ view: 'finish' }, { replace: true })} />}
      {tab === 'bucks' && member && <BalanceScreen member={member} tripTotal={total} />}
      {tab === 'account' && member && <AccountPage member={member} onSignOut={() => auth.signOut.mutate()} />}
      {sheet === 'camera' && (
        <InfoPopup topic="camera" origin={null} member={member} cart={cart.data} onClose={() => setSheet(null)} onRetryCamera={camera.wake} />
      )}
      {info && <InfoSheet info={info} onClose={() => setInfo(null)} />}
      {feel && found && (
        <FeelSheet
          item={found}
          feel={feel}
          onFeel={setFeel}
          onSend={(reason, wouldPay) => actions.feel.mutate({ sku: found.sku, feel: { reason, would_pay: wouldPay } })}
          onClose={() => setFeel(null)}
        />
      )}
      {finishShown && member && (
        <FinishJoining member={member} onDone={() => setParams({ view: 'qr' }, { replace: true })} onSignOut={() => auth.signOut.mutate()} />
      )}
      {phoneOpen && member && <AddPhone firstName={member.first_name} onSignOut={() => auth.signOut.mutate()} />}
      {sideways && (
        cameraSideways ? <SidewaysScanPill lock={lock} />
          : readSideways ? <SidewaysGotIt />
            : qrSideways ? <SidewaysQr />
              : <TurnUprightScreen lock={lock} />
      )}
    </Box>
    {barShown && <MemberTabBar tab={tab} onTab={goTab} />}
    </Box>
  );
}

/** Staff test mode: Thrift+ is still off for customers (2026-10-10). */
function TestModeBar() {
  return (
    <Box role="status" data-testid="test-mode-bar"
      sx={{ flexShrink: 0, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#4A3200', bgcolor: '#F0C766', py: '4px',
        pt: 'calc(env(safe-area-inset-top, 0px) + 4px)' }}>
      Test mode: Thrift+ isn&apos;t open to customers yet
    </Box>
  );
}

/**
 * This trip, fixed at the top: the cart and its count, the ThriftBucks back, the items' badges. A tap flips between
 * the camera and the trip's lines (owner 2026-10-13); the chevron says which way.
 */
function SummaryBar({ count, total, lines, open, onToggle, isGuest = false }: {
  count: number;
  total: number;
  lines: ThriftPlusCartLine[];
  open: boolean;
  onToggle: () => void;
  isGuest?: boolean;
}) {
  const word = isGuest ? 'ThriftBucks for members' : 'ThriftBucks back';
  return (
    <ButtonBase
      onClick={onToggle}
      data-testid="trip-summary"
      aria-label={`This trip: ${count} items, +${tbNumber(total)} ${word}. ${open ? 'Back to the scanner' : 'See the trip'}`}
      aria-expanded={open}
      sx={{ flexShrink: 0, height: u(140), display: 'flex', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'left', gap: u(20), pl: u(22),
        pr: u(16), bgcolor: '#fff', borderRadius: u(34), border: `${u(3)} solid ${open ? sc.green : sc.cardEdge}`, boxShadow: sc.tileShadow,
        fontFamily: sc.font, color: sc.ink, transition: 'transform 90ms, border-color 160ms', '&:active': { transform: 'scale(0.985)' } }}
    >
      <Box sx={{ position: 'relative', flexShrink: 0 }}>
        <Box component="img" src={art.cart} alt="" sx={{ width: u(96), height: u(96), display: 'block' }} />
        <Box data-testid="trip-count" sx={{ position: 'absolute', top: u(-8), right: u(-8), minWidth: u(44), height: u(44), px: u(8), borderRadius: 99,
          bgcolor: sc.green, color: '#fff', fontSize: u(26), fontWeight: 800, display: 'grid', placeItems: 'center' }}>{count}</Box>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: u(22), color: sc.ink2, letterSpacing: '0.16em', textTransform: 'uppercase' }}>This trip</Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: u(12), whiteSpace: 'nowrap' }}>
          <Box data-target="trip-total" sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(58), lineHeight: 1.05, color: total > 0 ? sc.green : sc.ink3,
            fontVariantNumeric: 'tabular-nums' }}>
            {total > 0 ? '+' : ''}{tbNumber(total)}
          </Box>
          <Box sx={{ fontSize: u(28), fontWeight: 700, color: sc.greenDeep }}>{word}</Box>
        </Box>
      </Box>
      <Box aria-hidden sx={{ flexShrink: 0, display: 'flex' }}>
        {lines.slice(0, 3).map((l, i) => (
          <Box key={l.item.sku} sx={{ ml: i ? u(-16) : 0, borderRadius: '50%', boxShadow: '0 0 0 2px #fff' }}>
            <CategoryBadge category={l.item.category} size={u(50)} />
          </Box>
        ))}
        {lines.length > 3 && (
          <Box sx={{ ml: u(-12), minWidth: u(50), height: u(50), px: u(8), borderRadius: 99, bgcolor: sc.ink, color: '#fff', boxShadow: '0 0 0 2px #fff',
            display: 'grid', placeItems: 'center', fontSize: u(22), fontWeight: 800 }}>+{lines.length - 3}</Box>
        )}
      </Box>
      <Box aria-hidden sx={{ flexShrink: 0, color: sc.ink2, display: 'grid', placeItems: 'center' }}>
        {open ? <ExpandLessRounded sx={{ fontSize: u(56) }} /> : <ExpandMoreRounded sx={{ fontSize: u(56) }} />}
      </Box>
    </ButtonBase>
  );
}

/** "Retail $379.99", struck through; a tap says where retail prices come from (owner 2026-10-13). */
function RetailPrice({ value, onClick }: { value: string; onClick: () => void }) {
  return (
    <ButtonBase onPointerDown={(e) => e.stopPropagation()} onClick={onClick} data-testid="retail" aria-label={`Retail ${money(value)}. About retail prices`}
      sx={{ gap: '0.3em', px: u(10), borderRadius: u(12), fontSize: u(28), color: sc.ink3, fontFamily: sc.font }}>
      <Box component="span" sx={{ borderBottom: `${u(3)} dotted ${sc.ink3}`, lineHeight: 1.2 }}>Retail</Box>
      <Box component="span" sx={{ fontSize: '1.12em', textDecoration: 'line-through', textDecorationThickness: u(3) }}>{money(value)}</Box>
    </ButtonBase>
  );
}

/**
 * The scanned tag, filling the middle: a big centered price tag. Swipes right to add, left to pass. A code that isn't
 * a tag we have shows its answer here instead (APP D14, D15); a left swipe is then [Scan again].
 * The Thrift+ Staff app's test scanner shows the same card (owner 2026-10-16), without "Price feel off?" (no `onFeel`).
 */
export function ScanCard({ top, answer = null, isGuest, verified18, qty, onAdd, onPass, onFeel, onRetail, onReturns }: {
  top: Top;
  answer?: Answer | null;
  isGuest: boolean;
  verified18: boolean;
  qty: number;
  onAdd: (() => void) | null;
  onPass: () => void;
  onFeel?: () => void;
  onRetail: () => void;
  onReturns: (ok: boolean) => void;
}) {
  const swipe = useSwipe(onAdd, onPass);
  const lookup = top.lookup;
  return (
    <Box
      data-testid="scan-card"
      {...swipe.handlers}
      style={swipe.style}
      sx={{
        userSelect: 'none', position: 'absolute', inset: 0, zIndex: 5, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center', px: u(36), py: u(28), gap: u(6), bgcolor: sc.card, borderRadius: u(36),
        border: `${u(3)} solid ${sc.cardEdge}`, boxShadow: sc.cardShadow, fontFamily: sc.font,
        animation: 'tpCardIn 220ms ease-out', '@keyframes tpCardIn': { from: { transform: 'scale(0.96)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
      }}
    >
      {answer === 'not-ours' ? (
        <NotOurTag />
      ) : answer === 'link' && top.code?.kind === 'link' ? (
        <OurLink shown={top.code.shown} />
      ) : answer === 'not-found' || lookup?.status === 'not_found' ? (
        <CantFindItem code={top.sku} onAsIs={() => onReturns(false)} />
      ) : !lookup ? (
        <>
          <CircularProgress size={36} sx={{ color: sc.green }} />
          <Box sx={{ mt: u(24), fontSize: u(32), color: sc.ink2 }}>Looking up</Box>
          <Box sx={{ fontFamily: sc.mono, fontSize: u(28), color: sc.ink3 }}>{top.sku}</Box>
        </>
      ) : lookup.status !== 'found' ? (
        // No connection stays as built (APP D14).
        <>
          <SearchOffRounded sx={{ fontSize: u(110), color: sc.ink3 }} />
          <Box sx={{ mt: u(16), fontFamily: sc.condensed, fontSize: u(50), fontWeight: 700, color: sc.titleGreen, lineHeight: 1.1 }}>
            No connection
          </Box>
          <Box sx={{ mt: u(12), fontSize: u(30), color: sc.ink2, lineHeight: 1.35 }}>{lookup.message}</Box>
          <Box sx={{ mt: u(16), fontFamily: sc.mono, fontSize: u(26), color: sc.ink3 }}>{lookup.sku}</Box>
        </>
      ) : (
        <FoundTag item={lookup.item} isGuest={isGuest} verified18={verified18} qty={qty} onFeel={onFeel} onRetail={onRetail} onReturns={onReturns} />
      )}
    </Box>
  );
}

/** The price as big as the card allows: "$89.00" at full size, "$1,680.00" smaller. */
function priceSize(text: string): number {
  return text.length <= 7 ? 196 : text.length <= 8 ? 172 : 150;
}

function FoundTag({ item, isGuest, verified18, qty, onFeel, onRetail, onReturns }: {
  item: ThriftPlusItemCard;
  isGuest: boolean;
  verified18: boolean;
  qty: number;
  onFeel?: () => void;
  onRetail: () => void;
  onReturns: (ok: boolean) => void;
}) {
  const reward = Number.parseFloat(item.reward) || 0;
  const tb = useCountUp(reward, { from: 0, ms: 800, delay: 200 });
  const notes: Array<{ text: string; color: string }> = [];
  if (!item.available) notes.push({ text: 'Sold', color: sc.badText });
  if (item.age_restricted) notes.push({ text: verified18 ? '18+' : '18+: ID checked at the register', color: sc.warnText });
  return (
    <>
      <CategoryBadge category={item.category} size={u(140)} />
      <Box component="h2" sx={{ m: 0, mt: u(14), fontFamily: sc.condensed, fontWeight: 700, fontSize: u(58), lineHeight: 1.08, color: sc.titleGreen }}>{item.title}</Box>
      <Box sx={{ fontSize: u(28), color: sc.ink2 }}>
        {item.category_label}
        {notes.map((n) => (
          <Box key={n.text} component="span" sx={{ color: n.color, fontWeight: 700 }}>{'  ·  '}{n.text}</Box>
        ))}
      </Box>
      <Box sx={{ mt: u(14) }}>
        <ReturnsBadge ok={item.returnable} onClick={() => onReturns(item.returnable)} />
        {item.returnable && item.return_note ? (
          <Box data-testid="return-note" sx={{ mt: u(10), fontSize: u(26), fontWeight: 600, color: sc.warnText, lineHeight: 1.3 }}>
            {item.return_note}
          </Box>
        ) : null}
      </Box>
      <Box sx={{ width: '70%', height: u(2), bgcolor: sc.line, my: u(18) }} />
      {item.retail_price && <RetailPrice value={item.retail_price} onClick={onRetail} />}
      <Box sx={{ fontSize: u(24), color: sc.ink2, letterSpacing: '0.16em', textTransform: 'uppercase', mt: u(4) }}>Our price</Box>
      <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(priceSize(money(item.price))), lineHeight: 0.95, color: sc.priceGreen,
        whiteSpace: 'nowrap' }}>{money(item.price)}</Box>
      <Box data-testid="reward-band" sx={{ mt: u(28), py: u(16), px: u(28), borderRadius: u(24), bgcolor: reward > 0 ? sc.greenTint : '#f3f3ef',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: u(16) }}>
        {reward > 0 ? (
          <>
            <BigBucks value={tb} size={u(tbNumber(reward).length >= 6 ? 86 : 104)} sparkle={false} />
            <Box sx={{ fontSize: u(30), fontWeight: 800, color: sc.greenDeep, lineHeight: 1.1, textAlign: 'left' }}>
              {isGuest ? 'ThriftBucks for members' : 'ThriftBucks back'}
              {/* Joining starts in the app now (owner 2026-10-15, APP D9). */}
              <Box sx={{ fontSize: u(22), fontWeight: 400, color: sc.ink2 }}>{isGuest ? 'Free to join' : 'saved for your next visit'}</Box>
            </Box>
          </>
        ) : (
          <Box sx={{ fontSize: u(28), color: sc.ink2, py: u(10) }}>No ThriftBucks on this item yet</Box>
        )}
      </Box>
      {qty > 0 && (
        <Box sx={{ mt: u(16), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: u(8), color: sc.greenDeep, fontWeight: 800, fontSize: u(28) }}>
          <CheckCircleRounded sx={{ fontSize: u(34) }} /> {qty} in your trip
        </Box>
      )}
      {onFeel && (
        <Box sx={{ mt: u(14) }}>
          <ButtonBase onPointerDown={(e) => e.stopPropagation()} onClick={onFeel} data-testid="price-feel"
            sx={{ gap: u(16), px: u(22), py: u(10), borderRadius: 99, color: sc.ink2, fontSize: u(28), fontFamily: sc.font }}>
            <SmsRounded sx={{ fontSize: u(44), color: '#8c8f89' }} />
            Price feel off? Tell us.
          </ButtonBase>
        </Box>
      )}
    </>
  );
}

/** The trip's lines: tap one for its tag (APP D12), "×1" opens − +, slide a line left to remove it; Clear my trip at the end. */
function TripView({ lines, onQty, onRemove, onClear, onOpen }: {
  lines: ThriftPlusCartLine[];
  onQty: (line: ThriftPlusCartLine, qty: number) => void;
  onRemove: (line: ThriftPlusCartLine) => void;
  onClear: () => void;
  onOpen: (line: ThriftPlusCartLine) => void;
}) {
  return (
    <Box data-testid="trip-view" sx={{ position: 'absolute', inset: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: u(14), pb: u(110),
      animation: 'tpIn 200ms ease-out', '@keyframes tpIn': { from: { opacity: 0, transform: `translateY(${u(16)})` }, to: { opacity: 1, transform: 'none' } } }}>
      {lines.length === 0 && (
        <Box sx={{ flexShrink: 0, border: `${u(3)} dashed #cfd2ca`, borderRadius: u(30), p: u(36), textAlign: 'center', color: sc.ink2 }}>
          <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(40), color: sc.titleGreen }}>Nothing in your trip yet</Box>
          <Box sx={{ fontSize: u(28), mt: u(6), lineHeight: 1.35 }}>Scan a tag to see its price and the ThriftBucks it gives back.</Box>
        </Box>
      )}
      {lines.map((l) => (
        <TripLine key={l.item.sku} line={l} onQty={(q) => onQty(l, q)} onRemove={() => onRemove(l)} onOpen={() => onOpen(l)} />
      ))}
      {lines.length > 0 && (
        <>
          <Box sx={{ textAlign: 'center', fontSize: u(24), color: sc.ink3, mt: u(6) }}>Tap an item to see its tag · tap ×1 to change how many · slide left to remove</Box>
          <ButtonBase onClick={onClear} data-testid="clear-trip"
            sx={{ alignSelf: 'center', mt: u(10), color: sc.ink2, fontSize: u(26), textDecoration: 'underline', p: u(10), borderRadius: u(12), fontFamily: sc.font }}>
            Clear my trip
          </ButtonBase>
        </>
      )}
    </Box>
  );
}

function TripLine({ line, onQty, onRemove, onOpen }: {
  line: ThriftPlusCartLine;
  onQty: (qty: number) => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const { item, qty } = line;
  const [open, setOpen] = useState(false);
  const reward = (Number.parseFloat(item.reward) || 0) * qty;
  return (
    // A tap anywhere but the ×N chip and − + opens the tag (their taps are their own).
    <SwipeRow onRemove={onRemove} label={item.title} onTap={onOpen}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: u(18), pl: u(20), pr: u(16), minHeight: u(120) }}>
        <CategoryBadge category={item.category} size={u(72)} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontWeight: 700, fontSize: u(30), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</Box>
          <Box sx={{ fontSize: u(26), color: sc.ink2 }}>
            {money(item.price)}
            {qty > 1 ? ' each' : ''}
            {!item.returnable && (
              <Box component="span" sx={{ ml: u(12), px: u(12), py: u(2), borderRadius: 99, bgcolor: '#fbefd5', color: sc.warnText, fontSize: u(20),
                fontWeight: 800, letterSpacing: '0.04em', verticalAlign: 'middle' }}>AS IS</Box>
            )}
          </Box>
        </Box>
        <Box sx={{ flexShrink: 0, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(40), color: reward > 0 ? sc.green : sc.ink3 }}>
          {reward > 0 ? `+${tbNumber(reward)}` : '0.00'}
        </Box>
        {open ? (
          <Box onPointerDown={(e) => e.stopPropagation()} sx={{ flexShrink: 0 }}>
            <QtyStepper qty={qty} onChange={(q) => { onQty(q); if (q <= 0) setOpen(false); }} />
          </Box>
        ) : (
          <ButtonBase onPointerDown={(e) => e.stopPropagation()} onClick={() => setOpen(true)} aria-label={`Quantity ${qty}, change`} data-testid="qty-chip"
            sx={{ flexShrink: 0, minWidth: u(84), height: u(64), px: u(14), borderRadius: 99, border: `${u(3)} solid ${sc.line}`, fontSize: u(28),
              fontWeight: 800, color: sc.ink, fontFamily: sc.font }}>
            ×{qty}
          </ButtonBase>
        )}
      </Box>
    </SwipeRow>
  );
}
