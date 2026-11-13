import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge, Box, ButtonBase, IconButton, Popover, Typography } from '@mui/material';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import FactCheckOutlined from '@mui/icons-material/FactCheckOutlined';
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded';
import BuildCircleOutlined from '@mui/icons-material/BuildCircleOutlined';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchApprovalRequests } from '../../api/approvalRequests.api';
import { useAuth } from '../../hooks/useAuth';
import { useBuyingNags } from '../../hooks/useBuyingNags';
import { useHoursNag } from '../../hooks/useHoursNag';
import { useDashFixCount } from '../../hooks/useDashFixes';
import { useUnreadTexts } from '../../api/texting.api';
import SmsOutlined from '@mui/icons-material/SmsOutlined';
import { useSafe } from '../../hooks/useSafe';
import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import { useMyWork } from '../../hooks/useMyWork';
import { t } from '../../i18n/routines';
import { dashboardTabHref, saveDashboardTab } from '../../navigation/dashboardTabs';
import { BuyingNagCards } from '../buying/BuyingNagCards';
import { dutyColors } from '../duty/tokens';
import { HoursNagCard } from '../hr/HoursNagCard';
import { useUnreadMessages } from '../messages/MessagesEnvelope';
import { NagMessages, useNagMessages } from '../routines/NagMessages';
import { nagSummary } from '../routines/nagSummary';

const RED = dutyColors.red;
const AMBER = '#B45309';

/** Superusers only: approval requests waiting on the owner. Same query the Requests page uses for its Waiting tab. */
export function useWaitingApprovals(enabled: boolean): number {
  const query = useQuery({
    queryKey: ['approval-requests', 'waiting'],
    queryFn: () => fetchApprovalRequests('pending'),
    enabled,
    refetchInterval: 30_000,
  });
  return enabled ? (query.data?.length ?? 0) : 0;
}

/**
 * One bell for everything waiting on this person (it replaces the "!" routines nag and the
 * messages envelope). The badge is the total of its rows:
 *   Messages          unread staff messages          -> Messages
 *   Routines due      what the old "!" counted       -> Dashboard, My day tab
 *   Approvals waiting superusers only                -> Requests
 * Polling is whatever those three already did. Manager nudges, the buyer's bid-now cards and the
 * hours nag keep their cards at the top of the panel, and a new nudge opens the panel by itself.
 */
export function NotificationBell() {
  const { user, hasRole } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const seen = useRef<Set<number>>(new Set());

  const unread = useUnreadMessages().data ?? 0;
  const { work } = useMyWork();
  const inbox = useNagMessages();
  const hours = useHoursNag();
  const buying = useBuyingNags();
  const approvals = useWaitingApprovals(Boolean(user?.is_superuser));
  // Owner: requests waiting for acceptance. Everyone else: their own requests that changed.
  const dashFixes = useDashFixCount(Boolean(user));
  // The office cash needs a swap with the safe (Retail 5, 2026-11-02): owner and managers only.
  const safeAlert = useSafe(Boolean(user?.is_superuser) || hasRole('Manager')).data?.needs_swap ? 1 : 0;
  // Texts to our toll-free number not read yet (#132): owner and managers.
  const textsAllowed = Boolean(user?.is_superuser) || hasRole('Manager');
  const texts = useUnreadTexts(textsAllowed);

  const messages = inbox.messages;
  const messageKey = messages.map((row) => row.id).join(',');
  useEffect(() => {
    const fresh = messages.some((row) => !seen.current.has(row.id));
    messages.forEach((row) => seen.current.add(row.id));
    if (fresh && buttonRef.current) setAnchor(buttonRef.current);
    // messageKey stands in for the list: refetches return new arrays with the same rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageKey]);

  const nag = nagSummary(work, messages.map((row) => row.run_id), hours.level, buying);
  const routines = nag.tone === 'none' ? 0 : nag.count;
  const total = unread + routines + approvals + dashFixes + safeAlert + texts;
  const hot = unread > 0 || texts > 0 || approvals > 0 || dashFixes > 0 || safeAlert > 0 || nag.tone === 'red';
  const badgeColor = hot ? RED : AMBER;
  const close = () => setAnchor(null);

  function go(href: string) {
    close();
    navigate(href);
  }
  function goMyDay(extra = '') {
    close();
    saveDashboardTab(user?.id, 'myday');
    navigate(`${dashboardTabHref('myday')}${extra}`);
  }

  const label = total
    ? `${t('notifications', lang)}: ${total}`
    : t('notifications', lang);
  const hasCards = hours.level !== 'none' || messages.length > 0 || buying.count > 0;

  return (
    <>
      <IconButton
        ref={buttonRef}
        aria-label={label}
        aria-haspopup="dialog"
        data-testid="notification-bell"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ width: 44, height: 44 }}
      >
        <Badge
          badgeContent={total}
          max={99}
          data-testid="notification-bell-badge"
          sx={{ '& .MuiBadge-badge': { bgcolor: badgeColor, color: '#fff', fontWeight: 700 } }}
        >
          <NotificationsNoneRounded />
        </Badge>
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        slotProps={{
          paper: {
            sx: {
              width: { xs: 'calc(100vw - 24px)', sm: 380 },
              maxHeight: 'calc(100dvh - 80px)',
              bgcolor: dutyColors.paper,
            },
          },
        }}
      >
        <Box role="dialog" aria-label={t('notifications', lang)} sx={{ py: 1 }}>
          <Typography sx={{ px: 2, pt: 0.5, pb: 1, fontSize: 16, fontWeight: 800 }}>
            {t('notifications', lang)}
          </Typography>
          {hasCards ? (
            <Box sx={{ px: 1, pb: 1 }}>
              {hours.level !== 'none' ? (
                <Box sx={{ mx: 1.5, mb: 1 }}>
                  <HoursNagCard nag={hours} lang={lang} onOpen={() => goMyDay('&hours=1')} />
                </Box>
              ) : null}
              <BuyingNagCards nags={buying} onOpen={(id) => go(`/buying/auctions/${id}`)} />
              <NagMessages
                messages={messages}
                busy={inbox.busy}
                firstName={inbox.firstName}
                lang={lang}
                onHeard={(message) => { void inbox.heard(message); }}
                onNotMe={() => { void inbox.notMe(); }}
              />
            </Box>
          ) : null}
          <BellRow
            icon={<MailOutlineRounded />}
            label={t('messages', lang)}
            sub={unread ? `${unread} ${t('messagesUnread', lang)}` : undefined}
            count={unread}
            color={RED}
            onClick={() => go('/messages')}
            testId="bell-row-messages"
          />
          {textsAllowed ? (
            <BellRow
              icon={<SmsOutlined />}
              label={t('texts', lang)}
              sub={texts ? `${texts} ${t('textsUnread', lang)}` : undefined}
              count={texts}
              color={RED}
              onClick={() => go('/texts')}
              testId="bell-row-texts"
            />
          ) : null}
          <BellRow
            icon={<ChecklistRounded />}
            label={t('routinesDue', lang)}
            sub={work.count ? `${work.count} ${t('toDoLower', lang)}` : undefined}
            count={routines}
            color={nag.tone === 'red' ? RED : AMBER}
            onClick={() => goMyDay()}
            testId="bell-row-routines"
          />
          {user?.is_superuser ? (
            <BellRow
              icon={<FactCheckOutlined />}
              label={t('approvalsWaiting', lang)}
              count={approvals}
              color={RED}
              onClick={() => go('/owner/approvals')}
              testId="bell-row-approvals"
            />
          ) : null}
          {safeAlert ? (
            <BellRow
              icon={<AccountBalanceOutlined />}
              label={t('safeSwap', lang)}
              count={safeAlert}
              color={RED}
              onClick={() => go('/pos/cash')}
              testId="bell-row-safe"
            />
          ) : null}
          <BellRow
            icon={<BuildCircleOutlined />}
            label={t('dashFixes', lang)}
            count={dashFixes}
            color={RED}
            onClick={() => go('/dash-updates')}
            testId="bell-row-dash-fixes"
          />
          {total === 0 ? (
            <Typography sx={{ px: 2, pt: 1, pb: 0.5, fontSize: 13, color: dutyColors.ink60 }}>
              {t('nothingNew', lang)}
            </Typography>
          ) : null}
        </Box>
      </Popover>
    </>
  );
}

function BellRow({
  icon,
  label,
  sub,
  count,
  color,
  onClick,
  testId,
}: {
  icon: ReactNode;
  label: string;
  sub?: string;
  count: number;
  color: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      data-testid={testId}
      sx={{
        width: '100%',
        minHeight: 52,
        px: 2,
        gap: 1.5,
        justifyContent: 'flex-start',
        textAlign: 'left',
        color: dutyColors.ink,
        '&:hover': { bgcolor: dutyColors.brandTint },
      }}
    >
      <Box sx={{ display: 'flex', color: dutyColors.ink60 }}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14.5, fontWeight: 700 }}>{label}</Typography>
        {sub ? <Typography sx={{ fontSize: 12.5, color: dutyColors.ink60 }}>{sub}</Typography> : null}
      </Box>
      <Box
        component="span"
        data-testid={`${testId}-count`}
        sx={{
          minWidth: 24,
          height: 24,
          px: 0.75,
          borderRadius: 999,
          bgcolor: count ? color : 'transparent',
          color: count ? '#fff' : dutyColors.ink60,
          fontSize: 12.5,
          fontWeight: 800,
          lineHeight: '24px',
          textAlign: 'center',
        }}
      >
        {count}
      </Box>
    </ButtonBase>
  );
}
