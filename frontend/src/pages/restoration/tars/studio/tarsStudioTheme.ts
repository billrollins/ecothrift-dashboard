/** Restoration surfaces: dashboard sage, not a second cool-gray app. */
import { tarsTokens as eco } from '../tarsTokens';

export const studio = {
  canvas: '#e6ece8',
  canvasSolid: '#e6ece8',

  panel: '#ffffff',
  panelMuted: eco.greenSoft,
  panelBorder: '#8fa396',
  panelShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',

  /** Body copy — same ink as receiving / dashboard, not washed slate. */
  ink: '#0f172a',
  /** Captions, waiting, scoreboard labels. AA on white. */
  inkMuted: '#334155',
  /** Unused tabs, placeholders. Still readable at 12px. */
  inkFaint: '#3d4d45',
  /** Tiny uppercase field labels — sage so restoration still has a tell. */
  inkLabel: '#1b4d20',
  rule: '#b7c4b9',

  rail: '#ffffff',
  railBorder: '#8fa396',
  railText: '#0f172a',
  railTextMuted: '#334155',
  railActive: eco.greenAlpha12,
  railActiveBorder: eco.greenAlpha42,

  accent: eco.green,
  accentDark: eco.greenDark,
  accentGlow: `0 0 0 1px ${eco.greenAlpha28}`,
  accentSoft: eco.greenSoft,
  accentSoftBorder: eco.greenSoftBorder,

  success: eco.greenMid,
  warning: '#ed6c02',
  danger: '#d32f2f',
  info: '#0288d1',

  heroOnDark: '#0f172a',
  subOnDark: '#64748b',

  stepIdle: '#cbd5e1',
  stepActive: eco.green,
  stepDone: eco.greenDark,
  stepLabel: '#475569',
  stepLabelActive: eco.greenDarker,

  recommendRing: `0 0 0 2px ${eco.green}`,
  blockedWash: '#fff5f5',

  radius: {
    sm: 6,
    md: 8,
    lg: 10,
    xl: 12,
  },
} as const;

export type TarsStudioStepId =
  | 'handoff'
  | 'stopouts'
  | 'evidence'
  | 'tests'
  | 'paths'
  | 'decide';

export const TARS_STUDIO_STEPS: Array<{
  id: TarsStudioStepId;
  label: string;
  short: string;
}> = [
  { id: 'handoff', label: 'Handoff', short: 'Handoff' },
  { id: 'stopouts', label: 'Stop-outs', short: 'Stops' },
  { id: 'evidence', label: 'Condition', short: 'Condition' },
  { id: 'tests', label: 'Tests', short: 'Tests' },
  { id: 'paths', label: 'Paths', short: 'Paths' },
  { id: 'decide', label: 'Decision', short: 'Decide' },
];
