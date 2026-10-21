import type { TagLookup } from './thriftPlusTypes';
import api from './client';

/**
 * The Thrift+ Staff app's test scanner (owner 2026-10-16): the item card a member's scanner shows for one tag, through
 * the staff login (`/api/thriftplus/staff-tag/<sku>/`). It is never counted as a scan and works while Thrift+ is off.
 */
export async function staffTagLookup(sku: string): Promise<TagLookup> {
  const code = sku.trim().toUpperCase();
  try {
    const { data } = await api.get<TagLookup>(`/thriftplus/staff-tag/${encodeURIComponent(code)}/`);
    return data;
  } catch {
    return { status: 'error', sku: code, message: 'Could not reach the store. Check the signal and scan again.' };
  }
}
