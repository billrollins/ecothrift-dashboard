/**
 * The training register (code TRAIN, 2026-10-10): practice sales only. It must not be picked by accident
 * (2026-10-14), so every list that offers registers shows it last, under this label.
 */
export const TRAINING_REGISTER_LABEL = 'TRAINING REGISTER (practice only)';

/** Real registers first, in the order the server sends them; the training register last. */
export function sortRegistersForSetup<T extends { is_training?: boolean }>(registers: T[]): T[] {
  return [...registers].sort((a, b) => Number(Boolean(a.is_training)) - Number(Boolean(b.is_training)));
}
