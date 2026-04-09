/**
 * USD per 1M tokens — must match `ecothrift/settings.py` AI_PRICING.
 * Used if the client ever needs to estimate cost from raw usage; batch API returns estimated_cost_usd.
 */
export const AI_PRICING_USD_PER_M = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cache_write: 3.75, cache_read: 0.3 },
  'claude-opus-4-6': { input: 5.0, output: 25.0, cache_write: 6.25, cache_read: 0.5 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0, cache_write: 1.25, cache_read: 0.1 },
} as const;

export function estimateCostUsdFromUsage(
  model: string,
  u: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens?: number;
    cache_read_tokens?: number;
  }
): number {
  const p =
    AI_PRICING_USD_PER_M[model as keyof typeof AI_PRICING_USD_PER_M] ??
    AI_PRICING_USD_PER_M['claude-sonnet-4-6'];
  const cc = u.cache_creation_tokens ?? 0;
  const cr = u.cache_read_tokens ?? 0;
  return (
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      cc * p.cache_write +
      cr * p.cache_read) /
    1_000_000
  );
}
