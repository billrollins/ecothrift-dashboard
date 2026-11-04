/**
 * The signer's look. The layout and sizing are Eco-Thrift's Thrift+ member sign-up (Bill, 2026-11-02: "the best signing
 * experience"); the colours and fonts are each host's own. This folder imports nothing from the host's pages so it can
 * be lifted into the shared package (house standard D22); a host re-skins by changing this one file.
 *
 * Sizes are design units: u(46) = 46 px of a 900-wide design, scaled to the phone through `--u`.
 */
export const u = (n: number) => `calc(${n} * var(--u))`;

/** Width-driven scale, capped so the fixed parts still fit a short browser window. */
export const UNIT_CSS = 'min(calc(min(100vw, 480px) / 900), calc(100dvh / 1350))';

// Eco-Thrift: the Thrift+ member sign-up palette (greens on warm grey), the host's own copy of this file.
export const sc = {
  backdrop: '#e6e7e1',
  page: '#f2f2ee',
  pageLight: '#fbfbf8',
  card: '#ffffff',
  cardEdge: '#cfe6c2',
  line: '#e3e4df',
  ink: '#2a2d28',
  ink2: '#5d605a',
  title: '#1d5424',
  accent: '#3f9f35', // primary buttons, progress
  accentDeep: '#237a26', // step label, confirmations
  accentTint: '#e7f3e0', // the consent box
  done: '#3f9f35',
  badText: '#b01f14',
  font: 'Roboto, "Segoe UI", system-ui, sans-serif',
  display: '"Roboto Condensed", "Arial Narrow", Roboto, sans-serif',
  mono: '"DM Mono", ui-monospace, monospace',
  tileShadow: '0 6px 18px rgba(31,38,29,0.08), 0 1px 3px rgba(31,38,29,0.05)',
  buttonShadow: '0 6px 16px rgba(46,122,38,0.32)',
} as const;
