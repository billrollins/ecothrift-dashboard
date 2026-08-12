/**
 * What you are doing right now, and everything already done.
 *
 * The clock is always attached to exactly one action, shown at the top with its
 * category and a description you type as you go. Below it, the log: every
 * action on this item grouped by what it was pointed at, with the time each
 * took.
 *
 * The description is the one thing this screen insists on. An action nobody
 * described is a hole in the record, so until it is filled in the buttons that
 * would move on are disabled and say why — the block is visible before it is
 * hit, never after.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import type {
  RestorationActionCategory,
  RestorationActionDTO,
  RestorationActionsDTO,
} from '../../../types/inventory.types';
import {
  ACTION_CATEGORIES,
  actionScopeLabel,
  actionsForScope,
  categoryMeta,
  formatDuration,
  scopesWorked,
} from './tarsActions';
import { studio } from './studio/tarsStudioTheme';

export function TarsWorkPanel({
  data,
  running,
  busy,
  onDescribe,
  onNewAction,
}: {
  data: RestorationActionsDTO | undefined;
  running: boolean;
  busy?: boolean;
  onDescribe: (actionId: number, patch: { description?: string; category?: RestorationActionCategory }) => void;
  /** Open a fresh action on the same scope the current one is on. */
  onNewAction: (grade: string) => void;
}) {
  const actions = data?.results ?? [];
  const current = actions.find((a) => a.id === data?.current_action_id) ?? null;

  return (
    <Stack spacing={1} sx={{ minWidth: 0, height: '100%' }}>
      {current ? (
        <CurrentAction
          action={current}
          running={running}
          busy={busy}
          onDescribe={onDescribe}
          onNewAction={onNewAction}
        />
      ) : (
        <Box
          sx={{
            px: 1.5,
            py: 1.5,
            borderRadius: `${studio.radius.lg}px`,
            border: `1px dashed ${studio.panelBorder}`,
            color: '#94a3b8',
          }}
        >
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>
            Nothing is being worked. Press Work on a grade, or on the item.
          </Typography>
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <ActionLog actions={actions} currentId={data?.current_action_id ?? null} />
      </Box>
    </Stack>
  );
}

function CurrentAction({
  action,
  running,
  busy,
  onDescribe,
  onNewAction,
}: {
  action: RestorationActionDTO;
  running: boolean;
  busy?: boolean;
  onDescribe: (actionId: number, patch: { description?: string; category?: RestorationActionCategory }) => void;
  onNewAction: (grade: string) => void;
}) {
  const meta = categoryMeta(action.category);
  const described = action.is_described;

  return (
    <Box
      sx={{
        px: 1.5,
        py: 1.25,
        borderRadius: `${studio.radius.lg}px`,
        bgcolor: studio.panel,
        border: `1px solid ${described ? studio.panelBorder : '#e3b23c'}`,
        borderLeft: `5px solid ${meta.color}`,
        boxShadow: studio.panelShadow,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 0.85 }}>
        <Typography sx={{ fontSize: '0.62rem', fontWeight: 900, letterSpacing: 0.5, color: '#94a3b8' }}>
          {running ? 'WORKING ON' : 'STOPPED ON'}
        </Typography>
        <ScopeTag grade={action.grade} />
        <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 900, color: '#334155' }}>
          {formatDuration(action.seconds)}
        </Typography>

        <Box sx={{ flex: 1, minWidth: 8 }} />

        <Tooltip
          arrow
          title={described ? 'Start a fresh action on this same scope' : 'Say what you did first'}
        >
          <span>
            <Box
              component="button"
              type="button"
              disabled={busy || !described}
              onClick={() => onNewAction(action.grade)}
              sx={{
                px: 1,
                py: 0.4,
                cursor: described ? 'pointer' : 'not-allowed',
                fontSize: '0.72rem',
                fontWeight: 900,
                borderRadius: `${studio.radius.sm}px`,
                border: `1px solid ${studio.panelBorder}`,
                bgcolor: '#ffffff',
                color: described ? '#334155' : '#b6c0cd',
                '&:hover:not(:disabled)': { borderColor: studio.accent, bgcolor: studio.accentSoft },
              }}
            >
              New action on {actionScopeLabel(action.grade)}
            </Box>
          </span>
        </Tooltip>
      </Stack>

      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 0.85 }}>
        {ACTION_CATEGORIES.map((category) => {
          const active = category.id === action.category;
          return (
            <Tooltip key={category.id} arrow title={category.hint}>
              <Box
                component="button"
                type="button"
                disabled={busy}
                onClick={() => onDescribe(action.id, { category: category.id })}
                sx={{
                  px: 1,
                  py: 0.35,
                  cursor: 'pointer',
                  fontSize: '0.73rem',
                  fontWeight: 900,
                  borderRadius: `${studio.radius.sm}px`,
                  border: `1px solid ${active ? category.color : '#e2e8f0'}`,
                  bgcolor: active ? category.color : '#ffffff',
                  color: active ? '#ffffff' : '#64748b',
                  '&:hover:not(:disabled)': { borderColor: category.color },
                }}
              >
                {category.label}
              </Box>
            </Tooltip>
          );
        })}
      </Stack>

      <DescriptionField
        actionId={action.id}
        value={action.description}
        busy={busy}
        onCommit={(description) => onDescribe(action.id, { description })}
      />
    </Box>
  );
}

/**
 * What you did, and how it went.
 *
 * Saves when you leave it rather than on every keystroke — this gets typed
 * mid-teardown, often one-handed, and a request per character would be both
 * wasteful and distracting.
 */
function DescriptionField({
  actionId,
  value,
  busy,
  onCommit,
}: {
  actionId: number;
  value: string;
  busy?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setDraft(value);
  }, [value, actionId]);

  const empty = draft.trim() === '';

  return (
    <Box
      component="textarea"
      rows={2}
      aria-label="What you did"
      disabled={busy}
      value={draft}
      placeholder="What did you do, and how did it go?"
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.currentTarget.value)}
      onBlur={() => {
        focused.current = false;
        const trimmed = draft.trim();
        if (trimmed !== value.trim()) onCommit(trimmed);
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Escape') {
          setDraft(value);
          focused.current = false;
          e.currentTarget.blur();
        }
      }}
      sx={{
        width: '100%',
        p: 0.85,
        resize: 'vertical',
        fontFamily: 'inherit',
        fontSize: '0.82rem',
        lineHeight: 1.45,
        color: '#0f172a',
        borderRadius: `${studio.radius.sm}px`,
        border: `1px solid ${empty ? '#e3b23c' : studio.accentSoftBorder}`,
        bgcolor: empty ? '#fffaf0' : '#ffffff',
        outline: 'none',
        '&:focus': { borderColor: studio.accentDark, boxShadow: `0 0 0 2px ${studio.accentSoft}` },
        '&::placeholder': { color: '#b6c0cd', fontStyle: 'italic' },
      }}
    />
  );
}

/** Everything done to this item, grouped by what it was pointed at. */
function ActionLog({
  actions,
  currentId,
}: {
  actions: RestorationActionDTO[];
  currentId: number | null;
}) {
  const scopes = scopesWorked(actions);
  if (scopes.length === 0) return null;

  return (
    <Stack spacing={1}>
      {scopes.map((grade) => {
        const rows = actionsForScope(actions, grade);
        const seconds = rows.reduce((sum, a) => sum + (a.seconds || 0), 0);
        return (
          <Box key={grade || '__item__'}>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.4, px: 0.25 }}>
              <ScopeTag grade={grade} />
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 900, color: '#64748b' }}>
                {formatDuration(seconds)}
              </Typography>
            </Stack>
            <Stack spacing={0.4}>
              {rows.map((row) => (
                <ActionRow key={row.id} action={row} isCurrent={row.id === currentId} />
              ))}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

function ActionRow({ action, isCurrent }: { action: RestorationActionDTO; isCurrent: boolean }) {
  const meta = categoryMeta(action.category);
  return (
    <Stack
      direction="row"
      spacing={0.85}
      alignItems="baseline"
      sx={{
        px: 0.85,
        py: 0.5,
        borderRadius: `${studio.radius.sm}px`,
        bgcolor: isCurrent ? studio.accentSoft : '#ffffff',
        border: `1px solid ${isCurrent ? studio.accentSoftBorder : '#eef2f6'}`,
        borderLeft: `3px solid ${meta.color}`,
      }}
    >
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

function ScopeTag({ grade }: { grade: string }) {
  const whole = !grade;
  return (
    <Box
      sx={{
        px: 0.6,
        borderRadius: '4px',
        fontSize: '0.64rem',
        fontWeight: 900,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
        bgcolor: whole ? '#eef2f6' : studio.accentSoft,
        color: whole ? '#475569' : studio.accentDark,
        border: `1px solid ${whole ? '#dbe3ec' : studio.accentSoftBorder}`,
      }}
    >
      {actionScopeLabel(grade)}
    </Box>
  );
}
