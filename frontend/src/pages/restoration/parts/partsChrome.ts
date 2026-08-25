import { studio } from '../tars/studio/tarsStudioTheme';
import type { AttentionKey, PartsLaneId } from './partsBoard';

export const ACTION_SLOT = {
  minHeight: 28,
  height: 28,
  minWidth: 0,
  flex: 1,
  px: 0.5,
  fontSize: '0.72rem',
  fontWeight: 800,
  lineHeight: 1,
  textTransform: 'none',
  boxShadow: 'none',
  borderRadius: `${studio.radius.sm}px`,
} as const;

export const PRIMARY_ACTION = {
  ...ACTION_SLOT,
  bgcolor: studio.accent,
  color: '#fff',
  '&:hover': { bgcolor: studio.accentDark, boxShadow: 'none' },
} as const;

export const WARN_ACTION = {
  ...ACTION_SLOT,
  bgcolor: studio.warning,
  color: '#fff',
  '&:hover': { bgcolor: '#c45c02', boxShadow: 'none' },
} as const;

export const DANGER_ACTION = {
  ...ACTION_SLOT,
  bgcolor: studio.danger,
  color: '#fff',
  '&:hover': { bgcolor: '#b71c1c', boxShadow: 'none' },
} as const;

export const GHOST_ACTION = {
  ...ACTION_SLOT,
  color: studio.inkMuted,
  borderColor: studio.panelBorder,
  bgcolor: studio.panel,
  '&:hover': { bgcolor: studio.panelMuted, borderColor: studio.panelBorder },
} as const;

export const DANGER_GHOST = {
  ...GHOST_ACTION,
  color: studio.danger,
  borderColor: '#ef9a9a',
  '&:hover': { bgcolor: studio.blockedWash, borderColor: studio.danger },
} as const;

export const PAPER = {
  bgcolor: studio.panel,
  border: `1.5px solid ${studio.panelBorder}`,
  borderRadius: `${studio.radius.lg}px`,
  boxShadow: studio.panelShadow,
} as const;

export const CARD_HEIGHT = 128;
export const STRIP_HEIGHT = 58;

export const LANE_ACCENT: Record<PartsLaneId, string> = {
  requested: studio.warning,
  approved: studio.info,
  ordered: '#455a64',
  received: studio.success,
};

export const LANE_WASH: Record<PartsLaneId, string> = {
  requested: '#fff8ee',
  approved: '#f3f8fc',
  ordered: '#f4f6f6',
  received: '#f3faf4',
};

export const ATTENTION_COLOR: Record<AttentionKey, string> = {
  cancel_ask: studio.danger,
  approval: studio.warning,
  to_place: studio.info,
  late: studio.danger,
  review: studio.warning,
};

export function cardAccent(attention: string, lane: PartsLaneId): string {
  if (attention === 'cancel_ask' || attention === 'late') return studio.danger;
  if (attention === 'review') return studio.warning;
  return LANE_ACCENT[lane];
}
