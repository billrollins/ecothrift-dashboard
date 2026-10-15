import { Box, type SxProps, type Theme } from '@mui/material';

/**
 * ThriftBucks (V8, owner 2026-10-10; one noun since 10-12). Always a number next to the word, never a
 * symbol and never "$": "35.00 ThriftBucks". Kept at full value (the Default), or redeemed instantly at the
 * instant share, which is shown in dollars off today's price. Prices, tax, totals, the instant dollars and
 * Thrift+ credit stay in dollars. Display only: data and API names stay "reward".
 */

const NUMBER = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toNumber(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

/** "26.40": the number alone (a label beside it names the unit). */
export function tbNumber(value: string | number | null | undefined): string {
  return NUMBER.format(Math.abs(toNumber(value)));
}

/** The word for an amount: "ThriftBucks", or "ThriftBuck" for exactly one. */
export function tbWord(value: string | number | null | undefined): string {
  return Math.abs(toNumber(value)) === 1 ? 'ThriftBuck' : 'ThriftBucks';
}

/** "26.40 ThriftBucks" (one: "1.00 ThriftBuck"): labels, screen readers, CSV. */
export function tbText(value: string | number | null | undefined): string {
  return `${tbNumber(value)} ${tbWord(value)}`;
}

/**
 * An amount: "+26.40 ThriftBucks", the word smaller. ``bare``: the label beside it already names the unit, so
 * just the number ("+26.40").
 */
export function TbAmount({
  value,
  sign,
  bare,
  sx,
}: {
  value: string | number | null | undefined;
  sign?: '+' | '-';
  bare?: boolean;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box component="span" sx={{ whiteSpace: 'nowrap', ...sx }}>
      {sign ?? ''}
      {tbNumber(value)}
      {!bare && (
        <Box component="span" sx={{ fontSize: '0.62em', ml: '0.3em', letterSpacing: 0 }}>
          {tbWord(value)}
        </Box>
      )}
    </Box>
  );
}
