import type { BStockDisputeActivityDTO } from '../../../api/bstockDisputes.api';

/** Our own looks are tagged so they never count as B-Stock's. */
export function staffPreviewUrl(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}from=dash`;
}

const DOWNLOAD_WORDS: Record<string, string> = { xlsx: 'Excel', csv: 'CSV', zip: 'photos zip', photo: 'photo' };

/** "Opened 3 times by 2 people, last Oct 21. Downloaded: Excel 1, photo 4." */
export function activityText(a: BStockDisputeActivityDTO): string {
  if (a.outside_views === 0 && Object.keys(a.outside_by_kind).length === 0) {
    return 'Not opened outside Dash yet.';
  }
  const last = a.last_outside_at ? `, last ${new Date(a.last_outside_at).toLocaleString()}` : '';
  const people = a.outside_visitors === 1 ? '1 person' : `${a.outside_visitors} people`;
  const opened = `Opened ${a.outside_views} time${a.outside_views === 1 ? '' : 's'} by ${people}${last}.`;
  const downloads = Object.entries(a.outside_by_kind)
    .filter(([k]) => k !== 'view')
    .map(([k, n]) => `${DOWNLOAD_WORDS[k] ?? k} ${n}`);
  return downloads.length ? `${opened} Opened or downloaded: ${downloads.join(', ')}.` : opened;
}
