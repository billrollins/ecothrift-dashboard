import { Box, Chip, IconButton, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded';
import { t } from '../../i18n/routines';
import type { DashFixDTO } from '../../types/dashFixes.types';
import { StatusChip } from './DashFixRow';
import { formatShortDate, kindLabel, needsAnswer, projectLabel, waitingOn, type LineGroup } from './dashFixesModel';
import { StaffLink } from '../staff/StaffLink';

/** "Nov 2, 3:40 PM" so a status that just moved shows it. */
function formatUpdated(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function shortText(text: string, max = 140): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

export interface DashFixTableProps {
  /** One group per project (or a lone task); a lone group with project '' gets no header row. */
  groups: LineGroup[];
  all: DashFixDTO[];
  byId: Map<number, DashFixDTO>;
  lang: string;
  onOpen: (id: number) => void;
  testId: string;
  nextUp?: number | null;
  /** Owner line controls, by id. */
  reorder?: (row: DashFixDTO) => { canUp: boolean; canDown: boolean; onUp: () => void; onDown: () => void } | undefined;
}

const HEAD_SX = { fontWeight: 700, color: 'text.secondary', fontSize: 12, whiteSpace: 'nowrap', py: 0.75 } as const;
const CELL_SX = { py: 0.75, fontSize: 13, verticalAlign: 'top' } as const;

/** Desktop Dash Updates: one dense row per update, like the Orders list. Phones keep the cards. */
export function DashFixTable({ groups, all, byId, lang, onOpen, testId, nextUp, reorder }: DashFixTableProps) {
  const columns = reorder ? 9 : 8;
  return (
    <Box data-testid={testId} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflowX: 'auto', bgcolor: 'background.paper' }}>
      <Table size="small" sx={{ minWidth: 980, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 52 }} />
          <col />
          <col style={{ width: '16%' }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 52 }} />
          <col style={{ width: '17%' }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 120 }} />
          {reorder ? <col style={{ width: 56 }} /> : null}
        </colgroup>
        <TableHead>
          <TableRow>
            <TableCell sx={HEAD_SX}>#</TableCell>
            <TableCell sx={HEAD_SX}>{t('fxColTask', lang)}</TableCell>
            <TableCell sx={HEAD_SX}>{t('fxColProject', lang)}</TableCell>
            <TableCell sx={HEAD_SX}>{t('fxColReported', lang)}</TableCell>
            <TableCell sx={HEAD_SX}>{t('fxColSize', lang)}</TableCell>
            <TableCell sx={HEAD_SX}>{t('fxColStatus', lang)}</TableCell>
            <TableCell sx={HEAD_SX}>{t('fxColAfter', lang)}</TableCell>
            <TableCell sx={HEAD_SX}>{t('fxColUpdated', lang)}</TableCell>
            {reorder ? <TableCell sx={HEAD_SX} /> : null}
          </TableRow>
        </TableHead>
        <TableBody>
          {groups.map((group) => [
            group.project ? (
              <TableRow key={`p:${group.project}`} data-testid={`fix-group-${group.project}`}>
                <TableCell colSpan={columns} sx={{ bgcolor: 'action.hover', fontWeight: 800, fontSize: 13, py: 0.5 }}>
                  {group.project}
                </TableCell>
              </TableRow>
            ) : null,
            ...group.items.map((row) => {
              const after = waitingOn(row, byId);
              const controls = reorder?.(row);
              return (
                <TableRow
                  key={row.id}
                  hover
                  data-testid={`fix-row-${row.id}`}
                  onClick={() => onOpen(row.id)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ ...CELL_SX, fontWeight: 800, color: 'primary.main' }} data-testid={row.rank ? `fix-number-${row.id}` : undefined}>
                    {row.rank ? `#${row.rank}` : ''}
                  </TableCell>
                  <TableCell sx={CELL_SX}>
                    <Typography component="div" sx={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
                      {row.title}
                      {row.unseen ? (
                        <Box component="span" data-testid={`fix-unseen-${row.id}`} sx={{ ml: 1, color: 'error.main', fontSize: 11.5, fontWeight: 800 }}>
                          {t('fxUpdated', lang)}
                        </Box>
                      ) : null}
                      {row.private ? <Chip size="small" label={t('fxPrivate', lang)} sx={{ ml: 1, height: 18, fontWeight: 700 }} /> : null}
                    </Typography>
                    {row.details && row.details.trim() !== row.title.trim() ? (
                      <Typography sx={{ fontSize: 12, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.details}>
                        {shortText(row.details)}
                      </Typography>
                    ) : null}
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: needsAnswer(row) || row.id === nextUp ? 0.5 : 0 }}>
                      {needsAnswer(row) ? <Chip size="small" color="warning" label={t('fxNeedsAnswer', lang)} data-testid={`fix-needs-answer-${row.id}`} sx={{ height: 20, fontWeight: 700 }} /> : null}
                      {row.id === nextUp ? <Chip size="small" color="primary" label={t('fxNextUp', lang)} data-testid={`fix-next-${row.id}`} sx={{ height: 20, fontWeight: 700 }} /> : null}
                    </Box>
                  </TableCell>
                  <TableCell sx={CELL_SX} data-testid={`fix-project-${row.id}`}>
                    {row.project ? projectLabel(row, all, lang) : <Box component="span" sx={{ color: 'text.secondary' }}>{kindLabel(row.kind, lang)}</Box>}
                  </TableCell>
                  <TableCell sx={CELL_SX}>
                    <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><StaffLink userId={row.submitted_by}>{row.submitted_by_name ?? ''}</StaffLink></Box>
                    <Box sx={{ color: 'text.secondary', fontSize: 12 }}>{formatShortDate(row.created_at)}</Box>
                  </TableCell>
                  <TableCell sx={{ ...CELL_SX, fontWeight: 700 }}>{row.size}</TableCell>
                  <TableCell sx={CELL_SX}>
                    <StatusChip row={row} lang={lang} />
                    {row.session ? (
                      <Typography data-testid={`fix-session-${row.id}`} title={row.session} sx={{ fontSize: 11.5, color: 'text.secondary', mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t('fxSession', lang)}: {row.session}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell sx={CELL_SX}>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {after.map((dep) => (
                        <Chip
                          key={dep.id}
                          size="small"
                          variant="outlined"
                          label={`${t('fxAfter', lang)} ${dep.rank ? `#${dep.rank}` : dep.title}`}
                          data-testid={`fix-after-${row.id}-${dep.id}`}
                          sx={{ height: 20, maxWidth: '100%' }}
                        />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ ...CELL_SX, color: 'text.secondary', fontSize: 12 }}>
                    {formatUpdated(row.updated_at ?? row.status_changed_at)}
                  </TableCell>
                  {reorder ? (
                    <TableCell sx={{ ...CELL_SX, py: 0 }} onClick={(event) => event.stopPropagation()}>
                      {controls ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                          <IconButton size="small" aria-label={`${t('fxMoveUp', lang)}: ${row.title}`} disabled={!controls.canUp} onClick={controls.onUp} sx={{ height: 24 }}>
                            <ArrowUpwardRounded fontSize="small" />
                          </IconButton>
                          <IconButton size="small" aria-label={`${t('fxMoveDown', lang)}: ${row.title}`} disabled={!controls.canDown} onClick={controls.onDown} sx={{ height: 24 }}>
                            <ArrowDownwardRounded fontSize="small" />
                          </IconButton>
                        </Box>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            }),
          ])}
        </TableBody>
      </Table>
    </Box>
  );
}

/** Plain sections (waiting, hold, done, declined) as one group with no header. */
export function flatGroup(rows: DashFixDTO[]): LineGroup[] {
  return rows.length ? [{ project: '', items: rows }] : [];
}
