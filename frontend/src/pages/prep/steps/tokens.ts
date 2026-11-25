// Colours of Truck Prep A, from the staff palette (theme/eco.ts): one meaning per colour.
import { eco } from '../../../theme/eco';

export const tone = {
  ink: eco.ink,
  inkSoft: eco.inkSoft,
  inkFaint: eco.inkFaint,
  line: eco.line,
  lineSoft: '#ECEBE6',
  head: '#F7F6F2',
  zebra: '#FBFBF9',
  hover: '#F3F6F1',
  sel: '#E4EEDF',
  before: '#C9C7BE',
  after: eco.forest,
  changed: '#EEF6EA',
  open: '#D08A1E',
  openSoft: '#FFF4E0',
  bad: '#B3261E',
  badSoft: '#FCEBEA',
  good: eco.forest,
  goodSoft: '#E8F2E4',
  ai: '#5B4B9A',
  aiSoft: '#EFEBFA',
  canvas: eco.canvas,
};

export const money = (v: number | null | undefined, cents = true) =>
  v === null || v === undefined || Number.isNaN(v)
    ? ''
    : `$${v.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

export const pct = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '' : `${Math.round(v * 100)}%`);

export const secs = (s: number) => (s < 60 ? `${s.toFixed(s < 10 ? 1 : 0)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

export const cost = (c: number) => (c === 0 ? '$0' : c < 0.01 ? `$${c.toFixed(4)}` : `$${c.toFixed(2)}`);

export const MODEL_NAMES: Record<string, string> = {
  'muse-spark-1.3-contributor': 'Spark Contributor',
  'claude-sonnet-5-5': 'Sonnet 5.5',
  'claude-opus-5-5': 'Opus 5.5',
  'claude-fable-5-2': 'Fable 5.2',
  'claude-haiku-5-5': 'Haiku 5.5',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gpt-6.2-astra': 'GPT 6.2 Astra',
  'grok-4.7': 'Grok 4.7',
};

export const modelName = (m: string) => MODEL_NAMES[m] || m;
