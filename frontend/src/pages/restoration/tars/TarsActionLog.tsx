/**
 * Everything done to this item, newest first, one line each.
 *
 * This replaced a full event timeline that logged every valuation tweak and
 * stage change alongside the work. All of it was true and almost none of it
 * was read: the question someone actually opens this tab with is "what has
 * been done to this thing", and the answer was buried under bookkeeping.
 *
 * So: only actions, and only what distinguishes one from another - when, what
 * kind, what was done. No group headings - actions are on the item.
 *
 * Rows can be deleted here, because a log you cannot correct fills up with
 * things everyone knows are wrong and stops being read.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { RestorationActionDTO, RestorationActionsDTO } from '../../../types/inventory.types';
import { studio } from './studio/tarsStudioTheme';
import { actionsNewestFirst, categoryMeta } from './tarsActions';

export function TarsActionLog({
  data,
  busy,
  onDelete,
}: {
  data: RestorationActionsDTO | undefined;
  busy?: boolean;
  /** Drop a row from the log. */
  onDelete?: (actionId: number) => void;
}) {
  const actions = data?.results ?? [];
  const rows = actionsNewestFirst(actions);

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
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: '#94a3b8' }}>
          {rows.length === 1 ? '1 action' : `${rows.length} actions`}
        </Typography>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Stack spacing={0.3}>
          {rows.map((action) => (
            <LogRow
              key={action.id}
              action={action}
              isCurrent={action.id === data?.current_action_id}
              canDelete={Boolean(onDelete) && rows.length > 1}
              busy={busy}
              onDelete={onDelete}
            />
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}

function LogRow({
  action,
  isCurrent,
  canDelete,
  busy,
  onDelete,
}: {
  action: RestorationActionDTO;
  isCurrent: boolean;
  canDelete: boolean;
  busy?: boolean;
  onDelete?: (actionId: number) => void;
}) {
  const meta = categoryMeta(action.category);
  const [confirming, setConfirming] = useState(false);

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
      {/*
        Always rendered, so no row changes width when the mouse arrives or when
        confirming opens.
      */}
      <Box sx={{ width: 62, flexShrink: 0, textAlign: 'right' }}>
        {!canDelete ? null : confirming ? (
          <Stack direction="row" spacing={0.3} justifyContent="flex-end">
            <RowButton
              label="Sure?"
              danger
              disabled={busy}
              hint="Delete this row"
              onClick={() => {
                setConfirming(false);
                onDelete?.(action.id);
              }}
            />
            <RowButton label="No" disabled={busy} hint="Keep it" onClick={() => setConfirming(false)} />
          </Stack>
        ) : (
          <RowButton
            label="Delete"
            disabled={busy}
            hint="Delete this row"
            onClick={() => setConfirming(true)}
          />
        )}
      </Box>
    </Stack>
  );
}

function RowButton({
  label,
  hint,
  danger,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip arrow title={hint}>
      <Box
        component="button"
        type="button"
        disabled={disabled}
        onClick={onClick}
        sx={{
          px: 0.5,
          py: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '0.62rem',
          fontWeight: 900,
          lineHeight: '18px',
          borderRadius: '4px',
          border: '1px solid',
          borderColor: danger ? '#f3b5ae' : 'transparent',
          bgcolor: danger ? '#fdecea' : 'transparent',
          color: danger ? '#b71c1c' : '#b6c0cd',
          '&:hover:not(:disabled)': {
            borderColor: danger ? '#e08a80' : '#e2e8f0',
            color: danger ? '#b71c1c' : '#64748b',
          },
        }}
      >
        {label}
      </Box>
    </Tooltip>
  );
}

/** Time of day only. The date is noise on a log covering one shift. */
function clockTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '-';
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
