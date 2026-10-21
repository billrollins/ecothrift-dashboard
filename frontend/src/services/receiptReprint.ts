/**
 * Reprint a finished sale's receipt (2026-10-21, REG-17): Dash logs it first (who, when) and numbers it, then the
 * receipt prints marked COPY. Throws when the log or the print fails (`printErrorMessage` says why).
 */
import { logReprint } from '../api/pos.api';
import type { Cart } from '../types/pos.types';
import { buildReceiptData } from '../utils/posReceipt';
import { localPrintService } from './localPrintService';

export async function reprintReceipt(cart: Cart): Promise<number> {
  const { data } = await logReprint(cart.id);
  await localPrintService.printReceipt(buildReceiptData(cart, { copy: data.copy_number }), false);
  return data.copy_number;
}
