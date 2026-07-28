/**
 * Final wizard actions mutate first, then advance UI only after success.
 * Callers should attach their own error handling (.catch) around this helper.
 */
export async function finalActionThenAdvance(
  mutate: () => Promise<unknown>,
  advance: () => void,
): Promise<void> {
  await mutate();
  advance();
}
