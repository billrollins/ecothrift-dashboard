/** TARS workstation - eco green palette (aligned with theme primary #2e7d32). */
export const tarsTokens = {
  green: '#2e7d32',
  greenDark: '#1b5e20',
  greenDarker: '#005005',
  greenMid: '#43a047',
  greenLight: '#60ad5e',
  greenSoft: '#e8f5e9',
  greenSoftBorder: '#a5d6a7',
  greenText: '#a5d6a7',
  greenTextBright: '#c8e6c9',
  greenAlpha10: 'rgba(46, 125, 50, 0.1)',
  greenAlpha12: 'rgba(46, 125, 50, 0.12)',
  greenAlpha16: 'rgba(46, 125, 50, 0.16)',
  greenAlpha18: 'rgba(46, 125, 50, 0.18)',
  greenAlpha20: 'rgba(46, 125, 50, 0.2)',
  greenAlpha22: 'rgba(46, 125, 50, 0.22)',
  greenAlpha26: 'rgba(46, 125, 50, 0.26)',
  greenAlpha28: 'rgba(46, 125, 50, 0.28)',
  greenAlpha42: 'rgba(46, 125, 50, 0.42)',
  greenAlpha50: 'rgba(46, 125, 50, 0.5)',
  greenAlpha72: 'rgba(46, 125, 50, 0.72)',
  greenAlpha90: 'rgba(46, 125, 50, 0.9)',
  timerRunningBg: 'linear-gradient(135deg, #1b5e20 0%, #020617 58%, #0f172a 100%)',
  timerStoppedBg: 'linear-gradient(135deg, #451a03 0%, #020617 58%, #0f172a 100%)',
  /** Light toolbar timer - uniform shell; status lives on the item pill. */
  timerShellBg: '#ffffff',
  timerShellBorder: '#94a3b8',
  timerText: '#0f172a',
  timerTextMuted: '#64748b',
  timerShadow: '0 1px 2px rgba(15, 23, 42, 0.08), 0 4px 14px rgba(15, 23, 42, 0.1), 0 0 0 1px rgba(15, 23, 42, 0.04)',
} as const;

export type TarsTimerItemPillStatus = 'running' | 'paused' | 'mismatch';

/** Item SKU pill colors - running (active), paused (inactive), mismatch (warning). */
export function tarsTimerItemPillSx(status: TarsTimerItemPillStatus) {
  if (status === 'running') {
    return {
      bgcolor: tarsTokens.greenAlpha12,
      color: tarsTokens.greenDark,
      borderColor: tarsTokens.greenAlpha42,
      dotColor: tarsTokens.green,
      boxShadow: `0 0 0 1px ${tarsTokens.greenAlpha10}`,
    };
  }
  if (status === 'paused') {
    return {
      bgcolor: '#f1f5f9',
      color: '#64748b',
      borderColor: '#cbd5e1',
      dotColor: '#94a3b8',
      boxShadow: 'none',
    };
  }
  return {
    bgcolor: 'rgba(239, 68, 68, 0.08)',
    color: '#991b1b',
    borderColor: 'rgba(239, 68, 68, 0.45)',
    dotColor: '#dc2626',
    boxShadow: '0 0 0 1px rgba(239, 68, 68, 0.08)',
  };
}

/** Full item header strip - same status colors as the timer item pill. */
export function tarsTimerHeaderSx(status: TarsTimerItemPillStatus) {
  const pill = tarsTimerItemPillSx(status);
  return {
    bgcolor: pill.bgcolor,
    color: pill.color,
    borderColor: pill.borderColor,
    boxShadow: pill.boxShadow,
  };
}
