/**
 * What you are doing right now.
 *
 * One action is open at a time, shown at the top with its category and a
 * description you type as you go. Actions are on the item, not on a grade.
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
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type {
  RestorationActionCategory,
  RestorationActionDTO,
  RestorationActionsDTO,
} from '../../../types/inventory.types';
import {
  ACTION_CATEGORIES,
  DEFAULT_CATEGORY,
  actionScopeLabel,
  actionsForScope,
  categoryMeta,
  claimCannedActionEnter,
} from './tarsActions';
import { PressPicker, type PressPaint } from './studio/PressPicker';
import { PANEL, RADIUS, TYPE } from './studio/benchScale';
import { studio } from './studio/tarsStudioTheme';

const ACTION_TYPE_IDS = ACTION_CATEGORIES.map((category) => category.id);

function actionTypePaint(id: RestorationActionCategory): PressPaint {
  const meta = categoryMeta(id);
  return {
    bgcolor: meta.soft,
    border: meta.border,
    color: meta.color,
    strong: meta.color,
    onStrong: '#ffffff',
  };
}

/**
 * What the current-action card occupies: one combined type-and-description
 * field. Both states of that slot claim it, so the list below sits at the
 * same height whether or not an action is open.
 */
export const CURRENT_ACTION_HEIGHT = 80;

export function TarsWorkPanel({
  data,
  busy,
  scope,
  onDescribe,
  onUndo,
}: {
  data: RestorationActionsDTO | undefined;
  busy?: boolean;
  /** Whose activity to show below: a grade, or '' for the item as a whole. */
  scope: string;
  onDescribe: (actionId: number, patch: { description?: string; category?: RestorationActionCategory }) => void;
  /** Delete the current action. */
  onUndo?: () => void;
}) {
  const actions = data?.results ?? [];
  const current = actions.find((a) => a.id === data?.current_action_id) ?? null;
  const scoped = actionsForScope(actions, scope);

  return (
    <Stack spacing={1} sx={{ minWidth: 0, height: '100%' }}>
      {current ? (
        <CurrentAction
          action={current}
          busy={busy}
          canUndo={actions.length > 1}
          onDescribe={onDescribe}
          onUndo={onUndo}
        />
      ) : (
        <Box
          sx={{
            px: 1,
            py: 1,
            // Holds the space the action card will take, so starting work does
            // not shove the activity list down the screen.
            minHeight: CURRENT_ACTION_HEIGHT,
            borderRadius: `${RADIUS.md}px`,
            border: `1px dashed ${PANEL.borderStrong}`,
            color: PANEL.inkMuted,
          }}
        >
          <Typography sx={{ ...TYPE.value, color: PANEL.inkMuted }}>
            Log an action
          </Typography>
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5, px: 0.25 }}>
          <ScopeTag grade={scope} />
          <Typography sx={{ fontSize: '0.68rem', color: '#a3b0c0' }}>
            {scoped.length === 1 ? '1 action' : `${scoped.length} actions`}
          </Typography>
        </Stack>

        {scoped.length === 0 ? (
          <Typography sx={{ px: 0.25, fontSize: '0.78rem', color: '#a3b0c0', fontStyle: 'italic' }}>
            Nothing done here yet.
          </Typography>
        ) : (
          <Stack spacing={0.4}>
            {scoped.map((row) => (
              <ActionRow key={row.id} action={row} isCurrent={row.id === data?.current_action_id} />
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}

export function CurrentAction({
  action,
  busy,
  canUndo,
  onDescribe,
  onEnter,
  onChangeCategory,
  onUndo,
}: {
  action: RestorationActionDTO;
  busy?: boolean;
  canUndo: boolean;
  onDescribe: (actionId: number, patch: { description?: string; category?: RestorationActionCategory }) => void;
  /** File this sitting and open the next. The Enter button and the Enter key. */
  onEnter?: (description: string) => void;
  onChangeCategory?: (category: RestorationActionCategory) => void;
  onUndo?: () => void;
}) {
  const meta = categoryMeta(action.category);
  const described = action.is_described;
  const composerRef = useRef<ActionComposerHandle>(null);

  useEffect(() => {
    if (!onEnter || busy) return;
    if (!claimCannedActionEnter(action.id, action.description)) return;
    onEnter(action.description);
  }, [action.description, action.id, busy, onEnter]);

  return (
    <Box
      sx={{
        px: 1,
        py: 0.75,
        minHeight: CURRENT_ACTION_HEIGHT,
        borderRadius: `${RADIUS.md}px`,
        bgcolor: studio.panel,
        // Colour, never width: undescribed uses the type's own edge, not a
        // second yellow that fights Inspect's teal.
        border: `1px solid ${described ? PANEL.border : meta.border}`,
        borderLeft: `3px solid ${meta.color}`,
        boxShadow: 'none',
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ minHeight: 56 }}>
        <ActionComposer
          ref={composerRef}
          action={action}
          busy={busy}
          onDescribe={onDescribe}
          onEnter={onEnter}
          onChangeCategory={onChangeCategory}
        />
        <Stack spacing={0.4} sx={{ width: 52, flexShrink: 0, alignItems: 'stretch' }}>
          <Tooltip
            arrow
            title={
              canUndo
                ? 'Wrong row? Delete this action.'
                : 'There is nothing before this to go back to.'
            }
          >
            <span>
              <SmallButton disabled={busy || !canUndo || !onUndo} onClick={onUndo}>
                Undo
              </SmallButton>
            </span>
          </Tooltip>
          <Tooltip arrow title="File this action and start the next. Shift+Enter or Ctrl+Enter for a new line.">
            <span>
              <SmallButton
                disabled={busy}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => composerRef.current?.enter()}
              >
                Enter
              </SmallButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>
    </Box>
  );
}

type ActionComposerHandle = { enter: () => void };

/**
 * Type and description are one field: [Inspect | what you did].
 * The type key stretches with the note. Saves the words when you leave.
 */
const ActionComposer = forwardRef<ActionComposerHandle, {
  action: RestorationActionDTO;
  busy?: boolean;
  onDescribe: (actionId: number, patch: { description?: string; category?: RestorationActionCategory }) => void;
  onEnter?: (description: string) => void;
  onChangeCategory?: (category: RestorationActionCategory) => void;
}>(function ActionComposer({ action, busy, onDescribe, onEnter, onChangeCategory }, ref) {
  const [draft, setDraft] = useState(action.description);
  const focused = useRef(false);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const meta = categoryMeta(action.category || DEFAULT_CATEGORY);
  const empty = draft.trim() === '';

  useEffect(() => {
    if (focused.current) return;
    setDraft(action.description);
  }, [action.description, action.id]);

  const saveDraft = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed !== action.description.trim()) onDescribe(action.id, { description: trimmed });
  }, [action.description, action.id, draft, onDescribe]);

  const enter = useCallback(() => {
    if (onEnter) {
      onEnter(draft);
    } else {
      saveDraft();
    }
    focused.current = false;
    fieldRef.current?.blur();
  }, [draft, onEnter, saveDraft]);

  useImperativeHandle(ref, () => ({ enter }), [enter]);

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'stretch',
        minHeight: 56,
        overflow: 'hidden',
        borderRadius: `${RADIUS.sm}px`,
        border: `1px solid ${meta.border}`,
        bgcolor: empty ? meta.soft : '#ffffff',
        '&:focus-within': {
          borderColor: meta.color,
          boxShadow: `0 0 0 2px ${meta.soft}`,
        },
      }}
    >
      <Box
        sx={{
          width: 96,
          flexShrink: 0,
          alignSelf: 'stretch',
          position: 'relative',
          borderRight: `1px solid ${meta.border}`,
        }}
      >
        <Box sx={{ position: 'absolute', inset: 0 }}>
          <PressPicker
            value={action.category || DEFAULT_CATEGORY}
            options={ACTION_TYPE_IDS}
            format={(id) => categoryMeta(id).label}
            placeholder={categoryMeta(DEFAULT_CATEGORY).label}
            width="100%"
            height="100%"
            layout="row"
            optionMinWidth={80}
            embedded
            paint={actionTypePaint}
            ariaLabel="Action type"
            disabled={busy}
            onChange={(category) => {
              if (onChangeCategory) onChangeCategory(category);
              else onDescribe(action.id, { category });
            }}
          />
        </Box>
      </Box>
      <Box
        component="textarea"
        ref={fieldRef}
        rows={2}
        aria-label="What you did"
        disabled={busy}
        value={draft}
        placeholder="What did you do, and how did it go?"
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          focused.current = false;
          saveDraft();
        }}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key === 'Enter' && (event.shiftKey || event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            insertNewline(event.currentTarget, draft, setDraft);
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            enter();
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            focused.current = false;
            event.currentTarget.blur();
          }
        }}
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 56,
          ...TYPE.body,
          p: 0.7,
          resize: 'vertical',
          fontFamily: 'inherit',
          lineHeight: 1.45,
          color: PANEL.ink,
          border: 'none',
          bgcolor: 'transparent',
          outline: 'none',
          '&::placeholder': { color: PANEL.faint },
        }}
      />
    </Box>
  );
});

function insertNewline(
  field: HTMLTextAreaElement,
  draft: string,
  setDraft: (next: string) => void,
) {
  const start = field.selectionStart;
  const end = field.selectionEnd;
  const next = `${draft.slice(0, start)}\n${draft.slice(end)}`;
  setDraft(next);
  requestAnimationFrame(() => {
    field.selectionStart = field.selectionEnd = start + 1;
  });
}

export function ActionRow({
  action,
  isCurrent,
  showScope,
}: {
  action: RestorationActionDTO;
  isCurrent: boolean;
  /** Show what it was pointed at. Off inside a list that is already one scope. */
  showScope?: boolean;
}) {
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
      {showScope ? <ScopeTag grade={action.grade} /> : null}
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
    </Stack>
  );
}

function SmallButton({
  children,
  disabled,
  onClick,
  onMouseDown,
}: {
  children: string;
  disabled?: boolean;
  onClick?: () => void;
  onMouseDown?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onMouseDown={onMouseDown}
      onClick={onClick}
      sx={{
        ...TYPE.micro,
        px: 1,
        py: 0.4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        borderRadius: `${RADIUS.sm}px`,
        border: `1px solid ${PANEL.border}`,
        bgcolor: '#ffffff',
        color: disabled ? PANEL.faint : PANEL.inkMuted,
        '&:hover:not(:disabled)': { borderColor: PANEL.accent, bgcolor: PANEL.bgSubtle },
      }}
    >
      {children}
    </Box>
  );
}

export function ScopeTag({ grade }: { grade: string }) {
  const whole = !grade;
  return (
    <Box
      sx={{
        ...TYPE.micro,
        px: 0.6,
        borderRadius: '4px',
        lineHeight: '18px',
        whiteSpace: 'nowrap',
        bgcolor: whole ? PANEL.bgSubtle : '#e8f5e9',
        color: whole ? PANEL.inkMuted : PANEL.accent,
        border: `1px solid ${whole ? PANEL.border : '#a5d6a7'}`,
      }}
    >
      {actionScopeLabel(grade)}
    </Box>
  );
}
