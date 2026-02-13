/**
 * Format a raw phone string as (###) ###-####.
 * Strips all non-digit characters first.
 * Returns the original string unmodified if it doesn't have exactly 10 digits.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  // Handle 11-digit US numbers starting with 1
  const d = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (d.length !== 10) return raw;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * Mask phone input as user types:
 * strips non-digits, then formats progressively.
 */
export function maskPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * Strip formatting from a phone value back to raw digits.
 * Useful for sending clean data to the API.
 */
export function stripPhone(formatted: string): string {
  return formatted.replace(/\D/g, '');
}
