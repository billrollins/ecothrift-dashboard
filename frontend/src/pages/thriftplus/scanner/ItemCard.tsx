import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, ButtonBase, CircularProgress, Typography } from '@mui/material';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import ChatBubbleRounded from '@mui/icons-material/ChatBubbleRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchOffRounded from '@mui/icons-material/SearchOffRounded';
import type { PriceFeel, PriceFeelReason, TagLookup, ThriftPlusItemCard } from '../../../api/thriftPlusMock';
import { money, wouldPayChoices } from './scannerLogic';
import { CategoryBadge, sc } from './scannerTheme';

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
    thanksTimer.current = window.setTimeout(() => setPanel(null), 1200);
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
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        touchAction: 'pan-y',
        userSelect: 'none',
        borderRadius: '22px',
        bgcolor: sc.card,
        border: `2px solid ${sc.cardEdge}`,
        boxShadow: sc.shadow,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transform: `translateX(${dx}px) rotate(${dx / 22}deg)`,
        opacity: leaving ? 0 : 1,
        transition: dragging ? 'none' : `transform ${FLING_MS}ms ease-out, opacity ${FLING_MS}ms ease-in`,
        animation: 'tpCardIn 180ms ease-out',
        '@keyframes tpCardIn': {
          from: { transform: 'translateY(18px) scale(0.97)', opacity: 0 },
          to: { transform: 'translateY(0) scale(1)', opacity: 1 },
        },
      }}
    >
      {/* Swipe cues */}
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
          <Typography sx={{ fontWeight: 800, fontSize: 18, color: sc.ink, mb: 0.5 }}>{item.title}</Typography>
          <Typography sx={{ color: sc.ink2, fontSize: 15, mb: 1.5 }}>{item.category_label}</Typography>
          {item.details.map((d) => (
            <Typography key={d} sx={{ fontSize: 15, color: sc.ink, py: 0.6, borderTop: `1px solid ${sc.line}` }}>
              {d}
            </Typography>
          ))}
          {!item.returnable && <DetailFlag text="Final sale. No returns on this item." />}
          {item.age_restricted && <DetailFlag text="18+. Needs an ID-verified card." />}
          <Typography sx={{ fontSize: 12, color: sc.ink3, mt: 1.5, fontFamily: sc.mono }}>Tag {item.sku}</Typography>
        </Overlay>
      )}

      {item && (panel === 'feel' || panel === 'too_high') && (
        <Overlay title="What feels off?" onClose={() => setPanel(null)}>
          {panel === 'feel' ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
              <Typography sx={{ fontSize: 16, color: sc.ink2, mb: 1.25 }}>I'd buy it at</Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                {wouldPayChoices(item.price).map((c) => (
                  <ButtonBase
                    key={c.under_pct}
                    onClick={() => sendFeel({ reason: 'too_high', would_pay: c.would_pay })}
                    sx={{
                      flex: 1,
                      py: 1.5,
                      borderRadius: 3,
                      border: `2px solid ${sc.cardEdge}`,
                      bgcolor: sc.greenTint,
                      fontSize: 20,
                      fontWeight: 800,
                      color: sc.greenDeep,
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
            bgcolor: 'rgba(255,255,255,0.96)',
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            animation: 'tpFade 1200ms ease both',
            '@keyframes tpFade': {
              '0%': { opacity: 0 },
              '15%': { opacity: 1 },
              '75%': { opacity: 1 },
              '100%': { opacity: 0 },
            },
          }}
        >
          <Box>
            <CheckCircleRounded sx={{ fontSize: 56, color: sc.green }} />
            <Typography sx={{ fontSize: 24, fontWeight: 800, color: sc.ink, mt: 1 }}>Thanks for that!</Typography>
            <Typography sx={{ fontSize: 15, color: sc.ink2 }}>It helps us price things right.</Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
});

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
  return (
    <>
      <Box sx={{ px: 2.25, pt: 3.25, pb: 1.5, display: 'flex', gap: 1.5, alignItems: 'center', position: 'relative' }}>
        <CategoryBadge category={item.category} size={60} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            component="h2"
            sx={{
              fontSize: 'clamp(20px, 6vw, 26px)',
              fontWeight: 800,
              lineHeight: 1.12,
              color: sc.ink,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.title}
          </Typography>
          <Typography sx={{ fontSize: 16, color: sc.ink2, mt: 0.25 }} noWrap>
            {item.category_label}
          </Typography>
        </Box>
        <ButtonBase
          onClick={onDetails}
          sx={{ position: 'absolute', top: 8, right: 12, fontSize: 14, color: sc.ink2, px: 0.75, py: 0.25, borderRadius: 1 }}
        >
          Details
        </ButtonBase>
      </Box>

      {(inCart || !item.available || !item.returnable || item.age_restricted) && (
        <Box sx={{ px: 2.25, pb: 1, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {!item.available && <Flag tone="bad" text="Sold. This one is gone." />}
          {inCart && item.available && <Flag tone="good" text="In your cart" />}
          {!item.returnable && item.available && <Flag tone="warn" text="Final sale" />}
          {item.age_restricted && <Flag tone="warn" text="18+" />}
        </Box>
      )}

      <Box sx={{ mx: 2.25, borderTop: `1px solid ${sc.line}`, py: 1.25 }}>
        {item.retail_price && (
          <Row label="Retail">
            <Typography sx={{ fontSize: 20, color: sc.ink3, textDecoration: 'line-through' }}>
              {money(item.retail_price)}
            </Typography>
          </Row>
        )}
        <Row label="Our price">
          <Typography sx={{ fontSize: 'clamp(26px, 8vw, 32px)', fontWeight: 800, color: sc.greenDeep, lineHeight: 1.1 }}>
            {money(item.price)}
          </Typography>
        </Row>
      </Box>

      <Box
        sx={{
          mx: 2.25,
          borderTop: `1px solid ${sc.line}`,
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          py: 1,
        }}
      >
        {hasReward ? (
          <>
            <Typography sx={{ fontSize: 18, color: sc.ink2 }}>{isGuest ? 'Members earn' : "You'd earn"}</Typography>
            <Box sx={{ position: 'relative', px: 3 }}>
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '22%',
                  bottom: '14%',
                  borderRadius: '40% 55% 45% 60% / 60% 45% 55% 40%',
                  background: `linear-gradient(100deg, transparent, ${sc.greenWash} 12%, ${sc.greenWash} 85%, transparent)`,
                  transform: 'rotate(-3deg)',
                }}
              />
              <AutoAwesomeRounded aria-hidden sx={{ position: 'absolute', left: -6, top: 4, fontSize: 22, color: sc.gold }} />
              <AutoAwesomeRounded aria-hidden sx={{ position: 'absolute', right: -4, top: 0, fontSize: 18, color: sc.gold }} />
              <Typography
                data-testid="reward"
                sx={{
                  position: 'relative',
                  fontSize: 'clamp(48px, 16vw, 68px)',
                  fontWeight: 900,
                  letterSpacing: '-0.03em',
                  lineHeight: 1.05,
                  color: sc.green,
                  textShadow: `0 2px 0 ${sc.greenDeep}33`,
                }}
              >
                +{money(item.reward)}
              </Typography>
            </Box>
            {isGuest && (
              <Typography sx={{ fontSize: 14, color: sc.ink2, mt: 0.5 }}>
                Guests pay the tag price. Get a free card at the register.
              </Typography>
            )}
          </>
        ) : (
          <>
            <Typography sx={{ fontSize: 22, fontWeight: 700, color: sc.ink2 }}>No reward on this item yet</Typography>
            <Typography sx={{ fontSize: 14, color: sc.ink3, mt: 0.5 }}>Check back on your next visit.</Typography>
          </>
        )}
      </Box>

      <ButtonBase
        onClick={onFeel}
        sx={{
          mx: 2.25,
          py: 1.5,
          borderTop: `1px solid ${sc.line}`,
          justifyContent: 'flex-start',
          gap: 1.25,
          color: sc.ink2,
          fontSize: 16,
        }}
      >
        <ChatBubbleRounded sx={{ color: sc.ink3, fontSize: 26 }} />
        Price feel off? Tell us.
      </ButtonBase>
    </>
  );
}

function LoadingBody({ sku }: { sku: string }) {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}>
      <Box>
        <CircularProgress size={40} sx={{ color: sc.green }} />
        <Typography sx={{ mt: 1.5, fontSize: 16, color: sc.ink2 }}>Looking up</Typography>
        <Typography sx={{ fontFamily: sc.mono, fontSize: 15, color: sc.ink3 }}>{sku}</Typography>
      </Box>
    </Box>
  );
}

function MissBody({ lookup }: { lookup: Exclude<TagLookup, { status: 'found' }> }) {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}>
      <Box>
        <SearchOffRounded sx={{ fontSize: 52, color: sc.ink3 }} />
        <Typography sx={{ mt: 1, fontSize: 22, fontWeight: 800, color: sc.ink }}>
          {lookup.status === 'not_found' ? "We couldn't find that tag" : 'No connection'}
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: 16, color: sc.ink2 }}>
          {lookup.status === 'not_found' ? 'Ask a team member, or try scanning it again.' : lookup.message}
        </Typography>
        <Typography sx={{ mt: 1, fontFamily: sc.mono, fontSize: 14, color: sc.ink3 }}>{lookup.sku}</Typography>
        <Typography sx={{ mt: 2, fontSize: 14, color: sc.ink3 }}>Tap Pass or swipe left to scan again.</Typography>
      </Box>
    </Box>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', py: 0.35 }}>
      <Typography sx={{ fontSize: 18, color: sc.ink2 }}>{label}</Typography>
      {children}
    </Box>
  );
}

function Flag({ tone, text }: { tone: 'good' | 'warn' | 'bad'; text: string }) {
  const colors = {
    good: { bg: sc.greenTint, fg: sc.greenDeep },
    warn: { bg: sc.warnTint, fg: sc.warnText },
    bad: { bg: sc.badTint, fg: sc.badText },
  }[tone];
  return (
    <Box sx={{ px: 1, py: 0.25, borderRadius: 99, bgcolor: colors.bg, color: colors.fg, fontSize: 13, fontWeight: 700 }}>
      {text}
    </Box>
  );
}

function DetailFlag({ text }: { text: string }) {
  return (
    <Typography sx={{ fontSize: 15, color: sc.warnText, py: 0.6, borderTop: `1px solid ${sc.line}`, fontWeight: 600 }}>
      {text}
    </Typography>
  );
}

function SurveyChoice({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        justifyContent: 'flex-start',
        px: 2,
        py: 1.4,
        borderRadius: 3,
        border: `1px solid ${sc.line}`,
        bgcolor: '#fafbf8',
        fontSize: 17,
        fontWeight: 600,
        color: sc.ink,
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
        animation: 'tpUp 160ms ease-out',
        '@keyframes tpUp': { from: { transform: 'translateY(24px)', opacity: 0 }, to: { transform: 'none', opacity: 1 } },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2.25, pt: 1.75, pb: 1 }}>
        <Typography sx={{ flex: 1, fontSize: 20, fontWeight: 800, color: sc.ink }}>{title}</Typography>
        <ButtonBase onClick={onClose} aria-label="Close" sx={{ borderRadius: 99, p: 0.75, color: sc.ink2 }}>
          <CloseRounded />
        </ButtonBase>
      </Box>
      <Box sx={{ px: 2.25, pb: 2, overflowY: 'auto', flex: 1 }}>{children}</Box>
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
        top: 18,
        [side === 'right' ? 'left' : 'right']: 18,
        zIndex: 3,
        px: 1.25,
        py: 0.25,
        border: `3px solid ${color}`,
        color,
        borderRadius: 2,
        fontSize: 22,
        fontWeight: 900,
        letterSpacing: '0.08em',
        transform: `rotate(${side === 'right' ? -12 : 12}deg)`,
        opacity: Math.min(1, strength),
        bgcolor: 'rgba(255,255,255,0.85)',
      }}
    >
      {label}
    </Box>
  );
}
