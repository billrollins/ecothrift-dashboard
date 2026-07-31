/** Shared class-based typography presets for rich text content. */
export const FONT_SIZE_STEPS = ['small', 'normal', 'large', 'feature'] as const;
export type FontSizeStep = (typeof FONT_SIZE_STEPS)[number];

export const TEXT_COLORS = [
  { id: 'ink', label: 'Ink', className: 'bt-color-ink', swatch: '#181712' },
  { id: 'muted', label: 'Muted', className: 'bt-color-muted', swatch: '#918c80' },
  { id: 'clay', label: 'Clay', className: 'bt-color-clay', swatch: '#a55d38' },
  { id: 'green', label: 'Green', className: 'bt-color-green', swatch: '#3f5d43' },
  { id: 'rust', label: 'Rust', className: 'bt-color-rust', swatch: '#8b4a32' },
] as const;

export const HIGHLIGHTS = [
  { id: 'soft', label: 'Soft', className: 'bt-highlight-soft', swatch: '#e7eee9' },
  { id: 'clay', label: 'Clay wash', className: 'bt-highlight-clay', swatch: '#edd9cc' },
  { id: 'wash', label: 'Wash', className: 'bt-highlight-wash', swatch: '#f3f1ec' },
] as const;

export const CALLOUT_TONES = [
  { id: 'info', label: 'Info', className: 'bt-callout-info' },
  { id: 'tip', label: 'Tip', className: 'bt-callout-tip' },
  { id: 'warning', label: 'Warning', className: 'bt-callout-warning' },
] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number]['id'];

/** Classes allowed in stored HTML (must stay in sync with apps/blog/sanitize.py). */
export const ALLOWED_RICH_TEXT_CLASSES = new Set([
  'bt-size-small',
  'bt-size-large',
  'bt-size-feature',
  ...TEXT_COLORS.map((color) => color.className),
  ...HIGHLIGHTS.map((highlight) => highlight.className),
  ...CALLOUT_TONES.map((callout) => callout.className),
  'bt-dropcap',
  'bt-pullquote',
  'bt-columns',
  'bt-columns-2',
  'bt-column',
  'bt-callout',
  'bt-linkcard',
  'bt-linkcard-media',
  'bt-linkcard-media--empty',
  'bt-linkcard-body',
  'bt-linkcard-title',
  'bt-linkcard-desc',
  'bt-linkcard-host',
  'bt-img-small',
  'bt-img-medium',
  'bt-img-full',
  'bt-img-left',
  'bt-img-center',
  'bt-img-right',
  'bt-code',
  'bt-codeblock',
]);

export function fontSizeClass(step: FontSizeStep | null): string | null {
  if (!step || step === 'normal') return null;
  return `bt-size-${step}`;
}
