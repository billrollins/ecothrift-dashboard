import AssignmentLate from '@mui/icons-material/AssignmentLate';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { Badge, Box, Button, Drawer, IconButton, Tooltip, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useMyWork } from '../../hooks/useMyWork';
import { pick, t } from '../../i18n/routines';
import type { NagTone } from '../../pages/routines/myWork';
import { isNagging } from '../../pages/routines/myWork';
import { todayHref } from '../../pages/routines/todayRunner';
import { dutyColors } from '../duty/tokens';
import { MyWorkList, NAG_AMBER } from './MyWorkList';
import { NagMessages, useNagMessages } from './NagMessages';
import { glanceHref } from './today/useTodayModel';

const NAG_COLOR: Record<Exclude<NagTone, 'none'>, string> = { amber: NAG_AMBER, red: dutyColors.red };

/**
 * The app-bar nag: nags and nudges are one thing. It counts what is nagging (due soon, due
 * now, late, nudged) plus messages not tied to one of those routines, and takes the colour of
 * the worst: amber for soft nags only, red for a hard nag, late, or any message. Hidden when
 * nothing nags. The drawer shows messages first (Heard clears one), then the same colour
 * sections as Today. A new message opens the drawer by itself.
 */
export function RoutinesNag() {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const navigate = useNavigate();
  const { work } = useMyWork();
  const inbox = useNagMessages();
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<number>>(new Set());

  const messages = inbox.messages;
  const messageKey = messages.map((row) => row.id).join(',');
  useEffect(() => {
    const fresh = messages.some((row) => !seen.current.has(row.id));
    messages.forEach((row) => seen.current.add(row.id));
    if (fresh) setOpen(true);
    // messageKey stands in for the list: refetches return new arrays with the same rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageKey]);

  const nagging = new Set(work.owed.filter((item) => isNagging(item.state)).map((item) => item.run.id));
  const count = work.nagCount + messages.filter((row) => !nagging.has(row.run_id)).length;
  const tone: NagTone = messages.length ? 'red' : work.nagTone;
  const next = work.next;

  function go(href: string) {
    setOpen(false);
    navigate(todayHref(href));
  }

  if (count === 0 || tone === 'none') {
    // Nothing nagging: keep the slot so the app bar does not shift.
    return <Box sx={{ width: 44, height: 44 }} />;
  }
  const color = NAG_COLOR[tone];
  const tip = messages[0]
    ? messages[0].message || t('pleaseFinish', lang)
    : next ? `${pick(next.run, 'title', lang) || next.run.title} · ${next.label}` : '';

  return (
    <Box sx={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Tooltip title={tip}>
        <IconButton
          aria-label={`${count} ${t(count === 1 ? 'naggingOne' : 'nagging', lang)}`}
          onClick={() => setOpen(true)}
          sx={{ width: 44, height: 44, color }}
        >
          <Badge
            badgeContent={count}
            sx={{ '& .MuiBadge-badge': { bgcolor: color, color: '#fff', fontWeight: 700 } }}
          >
            <AssignmentLate />
          </Badge>
        </IconButton>
      </Tooltip>
      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 420 }, bgcolor: dutyColors.paper, display: 'flex', flexDirection: 'column' } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2.5, pt: 2, pb: 1 }}>
          <AssignmentLate sx={{ color }} />
          <Typography sx={{ flex: 1, fontSize: 18, fontWeight: 800, color }}>
            {count} {t(count === 1 ? 'naggingOne' : 'nagging', lang)}
          </Typography>
          <IconButton aria-label="close" onClick={() => setOpen(false)} sx={{ width: 44, height: 44 }}>
            <CloseRounded />
          </IconButton>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', px: 1 }}>
          <NagMessages
            messages={messages}
            busy={inbox.busy}
            firstName={inbox.firstName}
            lang={lang}
            onHeard={(message) => { void inbox.heard(message); }}
            onNotMe={() => { void inbox.notMe(); }}
          />
          <MyWorkList
            compact
            work={work}
            lang={lang}
            onOpenRun={(run) => go(glanceHref(run))}
            onOpenDraft={(draft) => go(draft.href)}
            onStartAnytime={(routine) => go(`/routines/run/new?routine=${routine.id}`)}
          />
        </Box>
        <Box sx={{ p: 2, borderTop: `1px solid ${dutyColors.ink08}` }}>
          <Button fullWidth variant="outlined" onClick={() => go('/today')} sx={{ height: 44, fontWeight: 800 }}>
            {t('openToday', lang)}
          </Button>
        </Box>
      </Drawer>
    </Box>
  );
}
