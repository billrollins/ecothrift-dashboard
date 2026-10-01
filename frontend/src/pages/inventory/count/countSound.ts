/** Beeps for the count screen. Made with the Web Audio API, so there are no sound files to load. */

type Kind = 'ok' | 'warn' | 'fail';

let ctx: AudioContext | null = null;

/** Call from a tap (Start / Resume): phones only let a page make sound after a touch. */
export function unlockSound(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = ctx ?? new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freq: number, startAt: number, length: number, type: OscillatorType, volume: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + length + 0.02);
}

/** ok: one short high beep. warn: two quick mid beeps. fail: a long low buzz, plus a buzz on the phone. */
export function playCountSound(kind: Kind, muted = false): void {
  if (kind === 'fail' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate?.([120, 60, 120]);
  }
  if (muted || !ctx) return;
  const t = ctx.currentTime;
  if (kind === 'ok') {
    tone(1320, t, 0.07, 'sine', 0.25);
  } else if (kind === 'warn') {
    tone(880, t, 0.08, 'triangle', 0.3);
    tone(880, t + 0.12, 0.08, 'triangle', 0.3);
  } else {
    tone(160, t, 0.42, 'sawtooth', 0.35);
  }
}
