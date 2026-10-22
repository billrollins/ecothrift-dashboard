import { Box, Dialog, DialogContent, DialogTitle, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BAD_TAG_REASONS, getBadTagSummary, type BadTagReason, type BadTagSummary } from '../../../api/badTags.api';
import { ccTokens } from '../../../theme';
import { ratePer100, tagErrorsLink } from '../../inventory/tagErrors/tagErrors';
import { weekRangeLabel } from '../routines/gradeWeek';

/** Retail QA's Tag errors numbers for the viewed week (managers; the summary API is manager-only). */
export function useTagErrorSummary(week: string) {
  return useQuery({
    queryKey: ['stocktake', 'bad-tags', 'summary', week],
    queryFn: () => getBadTagSummary(week),
  });
}

const reasonLabel = (key: BadTagReason) => BAD_TAG_REASONS.find((r) => r.key === key)?.label || key;

/** The reason with the most errors on a row, "Retail overstated" or '' with none. */
export function topReason(byReason: Partial<Record<BadTagReason, number>>): string {
  let best: BadTagReason | null = null;
  for (const [key, count] of Object.entries(byReason) as [BadTagReason, number][]) {
    if (count > 0 && (best == null || count > (byReason[best] ?? 0))) best = key;
  }
  return best ? reasonLabel(best) : '';
}

/** "12 · 5 open" for the header badge; "None found" for a clean week; '-' while loading. */
export function tagErrorsBadgeText(summary: Pick<BadTagSummary, 'total' | 'open'> | null | undefined): string {
  if (!summary) return '-';
  if (!summary.total) return 'None found';
  return summary.open ? `${summary.total} · ${summary.open} open` : `${summary.total} · all fixed`;
}

const stat = { display: 'flex', flexDirection: 'column', gap: '2px', background: ccTokens.neuTint, borderRadius: '10px', padding: '10px 12px' } as const;
const statValue = { fontSize: 24, fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' } as const;
const statLabel = { fontSize: 12, color: ccTokens.ink2 } as const;
const sectionTitle = { fontSize: 13, fontWeight: 600, margin: '0 0 6px' } as const;
const clip = { display: 'inline-block', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' } as const;

function Clip({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <span style={muted ? { ...clip, color: ccTokens.ink2 } : clip}>{children}</span>;
}

/** The panel body: totals, reasons, and who and which truck the errors trace back to. */
export function TagErrorsSummaryBody({ week, summary }: { week: string; summary: BadTagSummary }) {
  const reasons = summary.by_reason.filter((row) => row.count > 0);
  const fixed = summary.total - summary.open;
  return (
    <div>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 1.5 }}>
        <div style={stat}>
          <b style={statValue}>{summary.total}</b>
          <span style={statLabel}>Found this week</span>
        </div>
        <div style={{ ...stat, background: summary.open ? ccTokens.badTint : ccTokens.neuTint }}>
          <b style={{ ...statValue, color: summary.open ? ccTokens.badText : ccTokens.ink }}>{summary.open}</b>
          <span style={statLabel}>Open on PR Fix-it</span>
        </div>
        <div style={stat}>
          <b style={statValue}>{fixed}</b>
          <span style={statLabel}>Fixed</span>
        </div>
      </Box>
      {summary.total ? (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }} aria-label="By reason">
            {reasons.map((row) => (
              <span
                key={row.key}
                style={{ fontSize: 12.5, background: ccTokens.kraftTint, color: ccTokens.kraftDeep, borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap' }}
              >
                {row.label} <b style={{ fontVariantNumeric: 'tabular-nums' }}>{row.count}</b>
              </span>
            ))}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.25fr) minmax(0, 1fr)' }, gap: { xs: 2, md: 3 } }}>
            <section>
              <h3 style={sectionTitle}>By processor</h3>
              <table className="cc-dialog-table">
                <thead>
                  <tr>
                    <th>Checked in by</th>
                    <th className="r">Errors</th>
                    <th className="r">Tagged</th>
                    <th className="r">Per 100</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_processor.map((row) => {
                    const rate = ratePer100(row.count, row.checked_in_this_week);
                    return (
                      <tr key={row.user_id ?? 'unknown'} title={topReason(row.by_reason) ? `Most: ${topReason(row.by_reason)}` : undefined}>
                        <td>
                          <Clip>
                            {row.user_id ? <Link to={tagErrorsLink({ week, processor: row.user_id })}>{row.name}</Link> : row.name}
                          </Clip>
                        </td>
                        <td className="r">{row.count}</td>
                        <td className="r">{row.checked_in_this_week || '—'}</td>
                        <td className="r">{rate == null ? '—' : rate.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
            <section>
              <h3 style={sectionTitle}>By truck</h3>
              <table className="cc-dialog-table">
                <thead>
                  <tr>
                    <th>Truck</th>
                    <th className="r">Errors</th>
                    <th>Most</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.by_truck.map((row) => (
                    <tr key={row.purchase_order_id ?? 'none'}>
                      <td>
                        <Clip>
                          {row.purchase_order_id
                            ? <Link to={tagErrorsLink({ week, po: row.purchase_order_id })}>{row.order_number}</Link>
                            : row.order_number}
                        </Clip>
                      </td>
                      <td className="r">{row.count}</td>
                      <td><Clip muted>{topReason(row.by_reason) || '—'}</Clip></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </Box>
          <p className="cc-dialog-note">
            Tagged is what that person checked in this week. Errors are counted the week the tag was found.
          </p>
        </>
      ) : (
        <p className="cc-dialog-note">No tag errors found this week.</p>
      )}
      <p style={{ margin: '12px 0 0', fontSize: 13 }}>
        <Link to={tagErrorsLink({ week })} style={{ color: ccTokens.ink, fontWeight: 600 }}>
          See every tag error this week ›
        </Link>
      </p>
    </div>
  );
}

/** Opened from the header's Tag errors badge. Full screen on a phone. */
export function TagErrorsDialog({
  open,
  onClose,
  week,
  summary,
  failed,
}: {
  open: boolean;
  onClose: () => void;
  week: string;
  summary: BadTagSummary | undefined;
  failed: boolean;
}) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={phone}
      transitionDuration={150}
      className="cc-page-dialog"
      slotProps={{ backdrop: { timeout: 150 } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 1 }}>
        Tag errors · {weekRangeLabel(week)}
        <IconButton aria-label="Close" onClick={onClose} sx={{ color: ccTokens.ink3 }}>×</IconButton>
      </DialogTitle>
      <DialogContent>
        {summary ? (
          <TagErrorsSummaryBody week={week} summary={summary} />
        ) : (
          <p className="cc-dialog-note">{failed ? 'Could not load tag errors.' : 'Loading…'}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
