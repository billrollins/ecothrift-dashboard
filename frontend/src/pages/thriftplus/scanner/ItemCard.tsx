import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, ButtonBase, CircularProgress } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchOffRounded from '@mui/icons-material/SearchOffRounded';
import SmsRounded from '@mui/icons-material/SmsRounded';
import type { PriceFeel, PriceFeelReason, TagLookup, ThriftPlusItemCard } from '../../../api/thriftPlusMock';
import { money, wouldPayChoices } from './scannerLogic';
import { CategoryBadge, Sparkle, art, sc, u } from './scannerTheme';

export type SwipeDir = 'left' | 'right';

export interface ItemCardHandle {
  /** Fly the card off (the Pass / Add buttons and arrow keys use this). */
  fling: (dir: SwipeDir) => void;
}

interface Props {
  sku: string;
  /** null while the lookup is in flight. */
  lookup: TagLookup | null;
  isGuest: boolean;
  inCart: boolean;
  /** Called once the card has left the screen. */
  onDone: (dir: SwipeDir) => void;
  onFeel: (feel: PriceFeel) => void;
}

const FEEL_REASONS: Array<{ reason: PriceFeelReason; label: string }> = [
  { reason: 'too_high', label: 'Price is too high' },
  { reason: 'retail_wrong', label: 'Retail price is wrong' },
  { reason: 'wrong_info', label: 'Wrong item info' },
  { reason: 'too_low', label: 'Price is too low' },
  { reason: 'other', label: 'Something else' },
];

const FLING_MS = 200;

/** The card face shared by the item card and the camera card (the design's white card, green edge). */
export const cardFaceSx = {
  position: 'absolute',
  inset: 0,
  borderRadius: u(36),
  bgcolor: sc.card,
  border: `${u(3)} solid ${sc.cardEdge}`,
  boxShadow: sc.cardShadow,
  overflow: 'hidden',
} as const;

/** The top card of the stack: one scanned item. Swipe right to add, left to pass. */
export const ItemCard = forwardRef<ItemCardHandle, Props>(function ItemCard(
  { sku, lookup, isGuest, inCart, onDone, onFeel },
  ref,
) {
  const item = lookup?.status === 'found' ? lookup.item : null;
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<SwipeDir | null>(null);
  const [panel, setPanel] = useState<null | 'details' | 'feel' | 'too_high' | 'thanks'>(null);
  const drag = useRef<{ id: number; x: number; y: number; dragging: boolean } | null>(null);
  const dxRef = useRef(0);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const thanksTimer = useRef<number | null>(null);

  const canAdd = !!item && item.available;
  const blocked = panel != null;

  const fling = (dir: SwipeDir) => {
    if (leaving) return;
    // A card that cannot go in the cart (loading, not found, sold) springs back.
    if (dir === 'right' && !canAdd) {
      dxRef.current = 0;
      setDx(0);
      return;
    }
    setLeaving(dir);
    const w = cardRef.current?.offsetWidth ?? 360;
    setDx(dir === 'right' ? w * 1.4 : -w * 1.4);
    window.setTimeout(() => onDone(dir), FLING_MS);
  };

  useImperativeHandle(ref, () => ({ fling }));

  useEffect(
    () => () => {
      if (thanksTimer.current != null) window.clearTimeout(thanksTimer.current);
    },
    [],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (leaving || blocked) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.dragging) {
      // Taps on links inside the card stay taps until the finger clearly moves sideways.
      if (Math.abs(mx) < 10 || Math.abs(mx) < Math.abs(my)) return;
      d.dragging = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    dxRef.current = mx;
    setDx(mx);
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.dragging) return;
    const w = e.currentTarget.offsetWidth || 360;
    const threshold = Math.min(110, w * 0.28);
    if (dxRef.current > threshold) fling('right');
    else if (dxRef.current < -threshold) fling('left');
    else {
      dxRef.current = 0;
      setDx(0);
    }
  };

  const sendFeel = (feel: PriceFeel) => {
    onFeel(feel);
    setPanel('thanks');
    thanksTimer.current = window.setTimeout(() => setPanel(null), 1300);
  };

  const dragging = drag.current?.dragging ?? false;
  const pull = Math.max(-1, Math.min(1, dx / 110));

  return (
    <Box
      ref={cardRef}
      data-testid="item-card"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      sx={{
        ...cardFaceSx,
        zIndex: 2,
        touchAction: 'pan-y',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: sc.font,
        transform: `translateX(${dx}px) rotate(${dx / 22}deg)`,
        opacity: leaving ? 0 : 1,
        transition: dragging ? 'none' : `transform ${FLING_MS}ms ease-out, opacity ${FLING_MS}ms ease-in`,
        animation: 'tpCardIn 170ms ease-out',
        '@keyframes tpCardIn': {
          from: { transform: 'translateY(14px) scale(0.98)', opacity: 0.4 },
          to: { transform: 'translateY(0) scale(1)', opacity: 1 },
        },
      }}
    >
      <SwipeStamp side="right" show={pull > 0 && canAdd} strength={pull} label="ADD" color={sc.green} />
      <SwipeStamp side="left" show={pull < 0} strength={-pull} label="PASS" color={sc.ink3} />

      {!lookup ? (
        <LoadingBody sku={sku} />
      ) : lookup.status !== 'found' ? (
        <MissBody lookup={lookup} />
      ) : (
        <FoundBody
          item={lookup.item}
          isGuest={isGuest}
          inCart={inCart}
          onDetails={() => setPanel('details')}
          onFeel={() => setPanel('feel')}
        />
      )}

      {item && panel === 'details' && (
        <Overlay title="Details" onClose={() => setPanel(null)}>
          <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(44), color: sc.titleGreen, lineHeight: 1.1 }}>
            {item.title}
          </Box>
          <Box sx={{ color: sc.ink2, fontSize: u(30), mt: u(6), mb: u(20) }}>{item.category_label}</Box>
          {item.details.map((d) => (
            <DetailLine key={d}>{d}</DetailLine>
          ))}
          {!item.returnable && <DetailLine tone="warn">Final sale. No returns on this item.</DetailLine>}
          {item.age_restricted && <DetailLine tone="warn">18+. Needs an ID-verified card.</DetailLine>}
          <Box sx={{ fontSize: u(24), color: sc.ink3, mt: u(20), fontFamily: sc.mono }}>Tag {item.sku}</Box>
        </Overlay>
      )}

      {item && (panel === 'feel' || panel === 'too_high') && (
        <Overlay title={panel === 'feel' ? 'What feels off?' : "I'd buy it at"} onClose={() => setPanel(null)}>
          {panel === 'feel' ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: u(14) }}>
              {FEEL_REASONS.map((r) => (
                <SurveyChoice
                  key={r.reason}
                  label={r.label}
                  onClick={() =>
                    r.reason === 'too_high' ? setPanel('too_high') : sendFeel({ reason: r.reason, would_pay: null })
                  }
                />
              ))}
            </Box>
          ) : (
            <Box>
              <Box sx={{ display: 'flex', gap: u(16), mb: u(20) }}>
                {wouldPayChoices(item.price).map((c) => (
                  <ButtonBase
                    key={c.under_pct}
                    onClick={() => sendFeel({ reason: 'too_high', would_pay: c.would_pay })}
                    sx={{
                      flex: 1,
                      height: u(110),
                      borderRadius: u(24),
                      border: `${u(3)} solid ${sc.cardEdge}`,
                      bgcolor: sc.greenTint,
                      fontFamily: sc.condensed,
                      fontSize: u(46),
                      fontWeight: 700,
                      color: sc.priceGreen,
                    }}
                  >
                    {money(c.would_pay, true)}
                  </ButtonBase>
                ))}
              </Box>
              <SurveyChoice label="Just too high" onClick={() => sendFeel({ reason: 'too_high', would_pay: null })} />
            </Box>
          )}
        </Overlay>
      )}

      {panel === 'thanks' && (
        <Box
          role="status"
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            bgcolor: 'rgba(255,255,255,0.97)',
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            animation: 'tpFade 1300ms ease both',
            '@keyframes tpFade': {
              '0%': { opacity: 0 },
              '12%': { opacity: 1 },
              '78%': { opacity: 1 },
              '100%': { opacity: 0 },
            },
          }}
        >
          <Box>
            <CheckCircleRounded sx={{ fontSize: u(120), color: sc.green }} />
            <Box sx={{ fontFamily: sc.condensed, fontSize: u(52), fontWeight: 700, color: sc.titleGreen, mt: u(10) }}>
              Thanks for that!
            </Box>
            <Box sx={{ fontSize: u(30), color: sc.ink2, mt: u(6) }}>It helps us price things right.</Box>
          </Box>
        </Box>
      )}
    </Box>
  );
});

/** Title size by length: up to 28 characters always fit in two lines, never cut. */
function titleSize(title: string): number {
  if (title.length <= 18) return 52;
  if (title.length <= 23) return 47;
  return 42;
}

/** Approximate width of the reward text in em (Nunito Black), to fit it in the card. */
function rewardEm(text: string): number {
  let em = 0;
  for (const ch of text) em += ch === '.' || ch === ',' ? 0.28 : ch === '1' ? 0.48 : 0.58;
  return em;
}

function FoundBody({
  item,
  isGuest,
  inCart,
  onDetails,
  onFeel,
}: {
  item: ThriftPlusItemCard;
  isGuest: boolean;
  inCart: boolean;
  onDetails: () => void;
  onFeel: () => void;
}) {
  const hasReward = Number.parseFloat(item.reward) > 0;
  const rewardText = `+${money(item.reward)}`;
  // Fit the reward to the card: at most 134 design px, and never wider than 520.
  const fitWidth = Math.min(134, 520 / rewardEm(rewardText));
  const flags: Array<{ text: string; color: string }> = [];
  if (!item.available) flags.push({ text: 'Sold', color: sc.badText });
  if (inCart && item.available) flags.push({ text: 'In your cart', color: sc.greenDeep });
  if (!item.returnable && item.available) flags.push({ text: 'Final sale', color: sc.warnText });
  if (item.age_restricted) flags.push({ text: '18+', color: sc.warnText });

  return (
    <>
      {/* Badge, title, category */}
      <Box
        sx={{
          position: 'relative',
          flex: `0 1 ${u(209)}`,
          minHeight: u(168),
          display: 'flex',
          alignItems: 'center',
          pl: u(32),
          pr: u(40),
          gap: u(23),
        }}
      >
        <CategoryBadge category={item.category} size={u(128)} />
        <Box sx={{ minWidth: 0, flex: 1, pt: u(8) }}>
          <Box
            component="h2"
            sx={{
              m: 0,
              fontFamily: sc.condensed,
              fontWeight: 700,
              fontSize: u(titleSize(item.title)),
              lineHeight: 1.06,
              letterSpacing: '-0.005em',
              color: sc.titleGreen,
              overflowWrap: 'anywhere',
            }}
          >
            {item.title}
          </Box>
          <Box sx={{ fontSize: u(31), color: sc.ink2, mt: u(10), lineHeight: 1.2 }}>
            {item.category_label}
            {flags.map((f) => (
              <Box key={f.text} component="span" sx={{ color: f.color, fontWeight: 700 }}>
                {'  ·  '}
                {f.text}
              </Box>
            ))}
          </Box>
        </Box>
        <ButtonBase
          onClick={onDetails}
          sx={{ position: 'absolute', top: u(22), right: u(26), px: u(10), py: u(6), fontSize: u(25), color: sc.ink2, borderRadius: u(12) }}
        >
          Details
        </ButtonBase>
      </Box>

      <Rule />

      {/* Retail and our price */}
      <Box
        sx={{
          flex: `0 1 ${u(184)}`,
          minHeight: u(138),
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: u(6),
          pl: u(40),
          pr: u(43),
        }}
      >
        {item.retail_price && (
          <PriceRow label="Retail">
            <Box sx={{ fontSize: u(35), color: sc.ink3, textDecoration: 'line-through', textDecorationThickness: u(3) }}>
              {money(item.retail_price)}
            </Box>
          </PriceRow>
        )}
        <PriceRow label="Our price">
          <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(58), lineHeight: 1.05, color: sc.priceGreen }}>
            {money(item.price)}
          </Box>
        </PriceRow>
      </Box>

      <Rule />

      {/* You'd earn */}
      <Box
        sx={{
          position: 'relative',
          flex: `1 1 ${u(300)}`,
          minHeight: u(150),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          containerType: 'size',
        }}
      >
        {hasReward ? (
          <>
            <Box sx={{ fontSize: u(33), color: sc.ink2, mt: u(26), lineHeight: 1.2, flexShrink: 0 }}>
              {isGuest ? 'Members earn' : "You'd earn"}
            </Box>
            <Box sx={{ flex: 1, width: '100%', display: 'grid', placeItems: 'center' }}>
              <Box
                sx={{
                  // The reward's font size: fit the card's width, and the height left under the label.
                  '--f': `min(${u(fitWidth)}, calc((100cqh - ${u(isGuest ? 70 : 110)}) * 0.74))`,
                  position: 'relative',
                  lineHeight: 1,
                }}
              >
                <Box
                  component="img"
                  src={art.brush}
                  alt=""
                  sx={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: 'calc(var(--f) * 4.25)',
                    maxWidth: 'none',
                    transform: 'translate(-48%, -44%) rotate(-2deg)',
                    pointerEvents: 'none',
                  }}
                />
                <Sparkle size="calc(var(--f) * 0.34)" sx={{ left: 'calc(50% - var(--f) * 2.02)', top: 'calc(50% - var(--f) * 0.88)' }} />
                <Sparkle size="calc(var(--f) * 0.16)" sx={{ left: 'calc(50% - var(--f) * 1.54)', top: 'calc(50% - var(--f) * 0.68)' }} />
                <Sparkle size="calc(var(--f) * 0.25)" sx={{ left: 'calc(50% - var(--f) * 2.22)', top: 'calc(50% - var(--f) * 0.46)' }} />
                <Sparkle size="calc(var(--f) * 0.3)" sx={{ left: 'calc(50% + var(--f) * 1.78)', top: 'calc(50% - var(--f) * 0.78)' }} />
                <Box
                  component="img"
                  src={art.coin}
                  alt=""
                  sx={{
                    position: 'absolute',
                    width: 'calc(var(--f) * 0.5)',
                    left: 'calc(50% - var(--f) * 2.22)',
                    top: 'calc(50% + var(--f) * 0.3)',
                    transform: 'rotate(-12deg)',
                  }}
                />
                <Box
                  component="img"
                  src={art.coin}
                  alt=""
                  sx={{
                    position: 'absolute',
                    width: 'calc(var(--f) * 0.48)',
                    left: 'calc(50% + var(--f) * 1.72)',
                    top: 'calc(50% + var(--f) * 0.36)',
                    transform: 'scaleX(-1) rotate(-8deg)',
                  }}
                />
                <RewardText text={rewardText} />
              </Box>
            </Box>
            {!isGuest && (
              <Box data-testid="bank-line" sx={{ fontSize: u(28), color: sc.ink2, mb: u(22), flexShrink: 0, whiteSpace: 'nowrap' }}>
                or{' '}
                <Box component="span" sx={{ color: '#8a6200', fontWeight: 700 }}>
                  +{money(item.reward_banked)}
                </Box>{' '}
                if you bank it
              </Box>
            )}
            {isGuest && (
              <Box sx={{ fontSize: u(26), color: sc.ink2, mb: u(18), textAlign: 'center', px: u(30), flexShrink: 0 }}>
                Guests pay the tag price. Cards are free at the register.
              </Box>
            )}
          </>
        ) : (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', px: u(40) }}>
            <Box>
              <Box sx={{ fontFamily: sc.condensed, fontWeight: 700, fontSize: u(46), color: sc.ink2 }}>No reward on this item yet</Box>
              <Box sx={{ fontSize: u(28), color: sc.ink3, mt: u(8) }}>Check back on your next visit.</Box>
            </Box>
          </Box>
        )}
      </Box>

      <Rule />

      <ButtonBase
        onClick={onFeel}
        sx={{
          flex: `0 1 ${u(118)}`,
          minHeight: u(92),
          justifyContent: 'flex-start',
          pl: u(40),
          gap: u(26),
          color: sc.ink2,
          fontSize: u(33),
          fontFamily: sc.font,
        }}
      >
        <SmsRounded sx={{ fontSize: u(64), color: '#8c8f89' }} />
        Price feel off? Tell us.
      </ButtonBase>
    </>
  );
}

/** "+$15.00": a heavy rounded face with a fresh green gradient and a soft shadow. No outlines. */
function RewardText({ text }: { text: string }) {
  return (
    <Box
      data-testid="reward"
      aria-label={text}
      sx={{
        position: 'relative',
        fontFamily: sc.money,
        fontWeight: 900,
        fontSize: 'var(--f)',
        letterSpacing: '-0.035em',
        whiteSpace: 'nowrap',
        lineHeight: 1,
        background: 'linear-gradient(180deg, #7ddc5f 0%, #45b537 48%, #2c9128 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        filter: 'drop-shadow(0 calc(var(--f) * 0.045) calc(var(--f) * 0.06) rgba(34, 105, 30, 0.3))',
      }}
    >
      {text}
    </Box>
  );
}

function LoadingBody({ sku }: { sku: string }) {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <Box>
        <CircularProgress size={36} sx={{ color: sc.green }} />
        <Box sx={{ mt: u(24), fontSize: u(32), color: sc.ink2 }}>Looking up</Box>
        <Box sx={{ fontFamily: sc.mono, fontSize: u(28), color: sc.ink3 }}>{sku}</Box>
      </Box>
    </Box>
  );
}

function MissBody({ lookup }: { lookup: Exclude<TagLookup, { status: 'found' }> }) {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', px: u(50) }}>
      <Box>
        <SearchOffRounded sx={{ fontSize: u(110), color: sc.ink3 }} />
        <Box sx={{ mt: u(16), fontFamily: sc.condensed, fontSize: u(50), fontWeight: 700, color: sc.titleGreen, lineHeight: 1.1 }}>
          {lookup.status === 'not_found' ? "We couldn't find that tag" : 'No connection'}
        </Box>
        <Box sx={{ mt: u(12), fontSize: u(30), color: sc.ink2, lineHeight: 1.35 }}>
          {lookup.status === 'not_found' ? 'Ask a team member, or try scanning it again.' : lookup.message}
        </Box>
        <Box sx={{ mt: u(16), fontFamily: sc.mono, fontSize: u(26), color: sc.ink3 }}>{lookup.sku}</Box>
        <Box sx={{ mt: u(30), fontSize: u(27), color: sc.ink3 }}>Tap Pass or swipe left to scan again.</Box>
      </Box>
    </Box>
  );
}

function Rule() {
  return <Box sx={{ mx: u(32), height: u(2), minHeight: '1px', bgcolor: sc.line, flexShrink: 0 }} />;
}

function PriceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: u(20), whiteSpace: 'nowrap' }}>
      <Box sx={{ fontSize: u(33), color: sc.ink2 }}>{label}</Box>
      {children}
    </Box>
  );
}

function DetailLine({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return (
    <Box
      sx={{
        fontSize: u(30),
        lineHeight: 1.35,
        color: tone === 'warn' ? sc.warnText : sc.ink,
        fontWeight: tone === 'warn' ? 600 : 400,
        py: u(14),
        borderTop: `1px solid ${sc.line}`,
      }}
    >
      {children}
    </Box>
  );
}

function SurveyChoice({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        justifyContent: 'flex-start',
        px: u(32),
        minHeight: u(92),
        borderRadius: u(24),
        border: `1px solid ${sc.line}`,
        bgcolor: '#fafbf8',
        fontSize: u(32),
        fontWeight: 500,
        color: sc.ink,
        textAlign: 'left',
        '&:active': { bgcolor: sc.greenTint },
      }}
    >
      {label}
    </ButtonBase>
  );
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 4,
        bgcolor: sc.card,
        display: 'flex',
        flexDirection: 'column',
        animation: 'tpUp 150ms ease-out',
        '@keyframes tpUp': { from: { transform: `translateY(${u(30)})`, opacity: 0 }, to: { transform: 'none', opacity: 1 } },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', pl: u(40), pr: u(20), pt: u(30), pb: u(16) }}>
        <Box sx={{ flex: 1, fontFamily: sc.condensed, fontSize: u(46), fontWeight: 700, color: sc.titleGreen }}>{title}</Box>
        <ButtonBase onClick={onClose} aria-label="Close" sx={{ borderRadius: 99, p: u(14), color: sc.ink2 }}>
          <CloseRounded sx={{ fontSize: u(52) }} />
        </ButtonBase>
      </Box>
      <Box sx={{ px: u(40), pb: u(30), overflowY: 'auto', flex: 1 }}>{children}</Box>
    </Box>
  );
}

function SwipeStamp({
  side,
  show,
  strength,
  label,
  color,
}: {
  side: SwipeDir;
  show: boolean;
  strength: number;
  label: string;
  color: string;
}) {
  if (!show) return null;
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        top: u(40),
        [side === 'right' ? 'left' : 'right']: u(40),
        zIndex: 3,
        px: u(20),
        py: u(4),
        border: `${u(6)} solid ${color}`,
        color,
        borderRadius: u(16),
        fontSize: u(48),
        fontWeight: 900,
        letterSpacing: '0.08em',
        transform: `rotate(${side === 'right' ? -12 : 12}deg)`,
        opacity: Math.min(1, strength),
        bgcolor: 'rgba(255,255,255,0.9)',
      }}
    >
      {label}
    </Box>
  );
}
