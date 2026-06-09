import { parseSearchTagsCsv } from './processingGoogleQuery';
import {
  identifierLabel,
  identifiersDisplayOrder,
  normalizeIdentifiersObject,
} from './processingIdentifiers';

export function identifiersSummary(value: Record<string, unknown>): string {
  const norm = normalizeIdentifiersObject(value);
  const keys = identifiersDisplayOrder(Object.keys(norm));
  if (!keys.length) return '';
  if (keys.length === 1) {
    const key = keys[0];
    return `${identifierLabel(key)}: ${norm[key]}`;
  }
  return `${keys.length} identifiers`;
}

export function tagsSummary(value: string): string {
  const tags = parseSearchTagsCsv(value);
  if (!tags.length) return '';
  if (tags.length === 1) return tags[0];
  return `${tags.length} tags`;
}

export function notesSummary(value: string, maxLen = 28): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}
