import type { ProcessingProductLinkDTO, ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';

export type ProcessingProductLinkRole = 'set' | 'part' | null;

export interface ProcessingProductLinkConfig {
  role: ProcessingProductLinkRole;
  checkIns: number;
  manifestUnits: number;
}

export function normalizeProductLink(
  link: ProcessingProductLinkDTO | ProcessingProductLinkConfig | undefined,
): ProcessingProductLinkConfig {
  if (!link) {
    return { role: null, checkIns: 1, manifestUnits: 1 };
  }
  const role = link.role === 'set' || link.role === 'part' ? link.role : null;
  const checkIns = Math.max(1, Number(link.checkIns) || 1);
  const manifestUnits = Math.max(1, Number(link.manifestUnits) || 1);
  return { role, checkIns, manifestUnits };
}

export function productLinkUsesManifestAccounting(link: ProcessingProductLinkConfig): boolean {
  return link.role != null || link.checkIns !== 1 || link.manifestUnits !== 1;
}

export function formatProductLinkSummary(config: ProcessingProductLinkConfig | undefined): string {
  const cfg = normalizeProductLink(config);
  if (!cfg.role) return '';
  if (cfg.role === 'set') return `Set 1:${cfg.manifestUnits}`;
  return `Part ${cfg.checkIns}:1`;
}

export function formatProductLinkSummaryLong(config: ProcessingProductLinkConfig | undefined): string {
  const cfg = normalizeProductLink(config);
  if (!cfg.role) return 'Standard - 1 check-in = 1 row';
  if (cfg.role === 'set') return `Set - 1 check-in counts as ${cfg.manifestUnits} rows`;
  return `Part - ${cfg.checkIns} check-ins = 1 row`;
}

/** X check-ins account for Y manifest row units (display only). */
export function manifestUnitsFromItemCount(
  itemCount: number,
  link: ProcessingProductLinkConfig | undefined,
): number {
  const qty = Math.max(0, itemCount);
  const cfg = normalizeProductLink(link);
  return (qty * cfg.manifestUnits) / cfg.checkIns;
}

/** Per-item price/retail from row defaults when product uses set/part accounting. */
export function scaleRowAmountForProductLink(
  rowAmount: string | number | null | undefined,
  link: ProcessingProductLinkConfig | ProcessingProductLinkDTO | undefined,
): string {
  if (rowAmount == null || rowAmount === '') return '';
  const amount = Number.parseFloat(String(rowAmount));
  if (!Number.isFinite(amount)) return '';
  const cfg = normalizeProductLink(link);
  const scaled = (amount * cfg.manifestUnits) / cfg.checkIns;
  return scaled.toFixed(2);
}

export function scaleRowAmountForProductId(
  rowAmount: string | number | null | undefined,
  productId: number | null | undefined,
  productLinks: ProcessingWorkspaceRowDTO['productLinks'],
): string {
  if (productId == null) return scaleRowAmountForProductLink(rowAmount, undefined);
  return scaleRowAmountForProductLink(rowAmount, productLinks?.[String(productId)]);
}

export function formatManifestUnits(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value));
  return value.toFixed(1).replace(/\.0$/, '');
}

export interface ManifestProgressDisplay {
  /** Manifest-row units accounted (may be fractional). */
  manifestUnits: number;
  /** Physical items checked in. */
  itemCount: number;
  /** True when any attached product uses non-1:1 accounting. */
  usesManifestAccounting: boolean;
}

export function computeManifestProgress(
  row: Pick<ProcessingWorkspaceRowDTO, 'productLinks' | 'rowKind'>,
  productGroups: Array<{ productId: number | null; totalQty: number }>,
): ManifestProgressDisplay {
  if (row.rowKind === 'added') {
    const itemCount = productGroups.reduce((sum, group) => sum + group.totalQty, 0);
    return { manifestUnits: itemCount, itemCount, usesManifestAccounting: false };
  }

  const links = row.productLinks ?? {};
  let manifestUnits = 0;
  let itemCount = 0;
  let usesManifestAccounting = false;

  for (const group of productGroups) {
    itemCount += group.totalQty;
    const link =
      group.productId != null ? normalizeProductLink(links[String(group.productId)]) : normalizeProductLink(undefined);
    if (productLinkUsesManifestAccounting(link)) usesManifestAccounting = true;
    manifestUnits += manifestUnitsFromItemCount(group.totalQty, link);
  }

  return { manifestUnits, itemCount, usesManifestAccounting };
}

export function processingRowFieldLayerTooltip(
  layers: { manifest?: string; ai?: string; final?: string } | undefined,
  kind: 'identity' | 'unitRetail' | 'price' = 'identity',
): string {
  const manifest = layers?.manifest?.trim() ?? '';
  const ai = layers?.ai?.trim() ?? '';
  const finalVal = layers?.final?.trim() ?? '';
  const line = (label: string, value: string) => (value ? `${label}: ${value}` : `${label}:`);
  const money = (v: string) => (v ? `$${v}` : '');

  if (kind === 'price' || kind === 'unitRetail') {
    return [
      line('manifest', money(manifest)),
      line('ai', kind === 'price' ? money(ai) : ai),
      line('final', money(finalVal)),
    ].join('\n');
  }

  return [line('manifest', manifest), line('ai', ai), line('final', finalVal)].join('\n');
}

export function buildProductLinksPatch(
  current: ProcessingWorkspaceRowDTO['productLinks'],
  productId: number,
  config: ProcessingProductLinkConfig,
): Record<string, ProcessingProductLinkDTO> {
  const key = String(productId);
  return {
    ...(current ?? {}),
    [key]: {
      role: config.role,
      checkIns: config.checkIns,
      manifestUnits: config.manifestUnits,
    },
  };
}

export function buildProductLinksRemove(
  current: ProcessingWorkspaceRowDTO['productLinks'],
  productId: number,
): Record<string, ProcessingProductLinkDTO> {
  const next = { ...(current ?? {}) };
  delete next[String(productId)];
  return next;
}
