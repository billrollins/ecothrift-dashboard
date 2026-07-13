/** TARS Studio — eco-green lifecycle UI, denser than the old bench shell. */
import { tarsTokens as eco } from '../tarsTokens';

export const studio = {
  canvas: '#f1f5f9',
  canvasSolid: '#f1f5f9',

  panel: '#ffffff',
  panelMuted: eco.greenSoft,
  panelBorder: '#cbd5e1',
  panelShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',

  rail: '#ffffff',
  railBorder: '#e2e8f0',
  railText: '#0f172a',
  railTextMuted: '#64748b',
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
  stepLabel: '#64748b',
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
