/**
 * Everything done to this item, newest first, one line each.
 *
 * This replaced a full event timeline that logged every valuation tweak, timer
 * pause and stage change alongside the work. All of it was true and almost none
 * of it was read: the question someone actually opens this tab with is "what
 * has been done to this thing, and how long did it take", and the answer was
 * buried under bookkeeping.
 *
 * So: only actions, and only what distinguishes one from another — when, what
 * kind, what it was pointed at, what was done, how long. No group headings,
 * because the scope is already on the line and headings cost a row each. The
 * totals sit once at the top rather than repeating per section.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { RestorationActionDTO, RestorationActionsDTO } from '../../../types/inventory.types';
import { studio } from './studio/tarsStudioTheme';
import { actionsNewestFirst, categoryMeta, formatDuration } from './tarsActions';
import { ScopeTag } from './TarsWorkPanel';

export function TarsActionLog({ data }: { data: RestorationActionsDTO | undefined }) {
  const actions = data?.results ?? [];
  const rows = actionsNewestFirst(actions);
  const total = actions.reduce((sum, a) => sum + (a.seconds || 0), 0);

  if (rows.length === 0) {
    return (
      <Typography sx={{ px: 0.25, fontSize: '0.82rem', color: '#a3b0c0', fontStyle: 'italic' }}>
        Nothing has been done to this item yet.
      </Typography>
    );
  }

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ px: 0.25, pb: 0.6 }}>
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 900, color: '#334155' }}>
          {formatDuration(total)}
        </Typography>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8' }}>
          across {rows.length === 1 ? '1 action' : `${rows.length} actions`}
        </Typography>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Stack spacing={0.3}>
          {rows.map((action) => (
            <LogRow key={action.id} action={action} isCurrent={action.id === data?.current_action_id} />
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}

function LogRow({ action, isCurrent }: { action: RestorationActionDTO; isCurrent: boolean }) {
  const meta = categoryMeta(action.category);

  return (
    <Stack
      direction="row"
      spacing={0.85}
      alignItems="baseline"
      sx={{
        px: 0.85,
        py: 0.4,
        borderRadius: `${studio.radius.sm}px`,
        bgcolor: isCurrent ? studio.accentSoft : '#ffffff',
        border: `1px solid ${isCurrent ? studio.accentSoftBorder : '#eef2f6'}`,
        borderLeft: `3px solid ${meta.color}`,
      }}
    >
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#a3b0c0', minWidth: 52 }}>
        {clockTime(action.started_at)}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.62rem',
          fontWeight: 900,
          letterSpacing: 0.3,
          color: meta.color,
          minWidth: 58,
          textTransform: 'uppercase',
        }}
      >
        {meta.label}
      </Typography>
      <ScopeTag grade={action.grade} />
      <Typography
        noWrap
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: '0.78rem',
          color: action.description ? '#334155' : '#b6c0cd',
          fontStyle: action.description ? 'normal' : 'italic',
        }}
      >
        {action.description || 'not yet described'}
      </Typography>
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 900, color: '#64748b' }}>
        {formatDuration(action.seconds)}
      </Typography>
    </Stack>
  );
}

/** Time of day only. The date is noise on a log covering one shift. */
function clockTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
