import { Box, type SxProps, type Theme } from '@mui/material';

/**
 * ThriftBucks and InstantBucks (owner 2026-10-10). Two words, never a symbol and never "$":
 * - **ThriftBucks**: the full value, kept for a later visit (the balance);
 * - **InstantBucks**: 80% of it, off today's price instead.
 * The monthly cover is its own thing (the first ThriftBucks each month fill it), shown as plain "6.50 of 10.00".
 * Prices, tax, totals and Return $ stay in dollars. Display only: data and API names stay "reward".
 */

export type TbUnit = 'ThriftBucks' | 'InstantBucks';

const NUMBER = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toNumber(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

/** "26.40": the number alone (a label beside it names the unit). */
export function tbNumber(value: string | number | null | undefined): string {
  return NUMBER.format(Math.abs(toNumber(value)));
}

/** The unit's word for an amount: "ThriftBucks", or "ThriftBuck" for exactly one. */
export function tbWord(value: string | number | null | undefined, unit: TbUnit = 'ThriftBucks'): string {
  return Math.abs(toNumber(value)) === 1 ? unit.slice(0, -1) : unit;
}

/** "26.40 ThriftBucks" (one: "1.00 ThriftBuck"): labels, screen readers, CSV. */
export function tbText(value: string | number | null | undefined, unit: TbUnit = 'ThriftBucks'): string {
  return `${tbNumber(value)} ${tbWord(value, unit)}`;
}

/**
 * An amount: "+26.40 ThriftBucks", the word smaller. ``bare``: the label beside it already names the unit, so
 * just the number ("+26.40").
 */
export function TbAmount({
  value,
  sign,
  bare,
  unit = 'ThriftBucks',
  sx,
}: {
  value: string | number | null | undefined;
  sign?: '+' | '-';
  bare?: boolean;
  unit?: TbUnit;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box component="span" sx={{ whiteSpace: 'nowrap', ...sx }}>
      {sign ?? ''}
      {tbNumber(value)}
      {!bare && (
        <Box component="span" sx={{ fontSize: '0.62em', ml: '0.3em', letterSpacing: 0 }}>
          {tbWord(value, unit)}
        </Box>
      )}
    </Box>
  );
}

/** The cover's figures, plain: "6.50 of 10.00" (the cover is its own thing; no unit). */
export function CoverFigures({ covered, amount }: { covered: string | number; amount: string | number }) {
  return (
    <>
      {tbNumber(covered)} of {tbNumber(amount)}
    </>
  );
}
