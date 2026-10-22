import { useMemo } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Link,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { BAD_TAG_REASONS, listBadTags, type BadTag } from '../../../api/badTags.api';
import { isoWeekKey, shiftWeek, weekRangeLabel } from '../../admin/routines/gradeWeek';
import { BadTagPhoto } from './BadTagPhoto';
import {
  processorName,
  reasonColor,
  readTagErrorFilters,
  shouldBe,
  tagErrorListParams,
  tagSaid,
  traceLine,
  truckName,
  when,
  whoWhen,
  type TagErrorFilters,
  type TagErrorsShow,
} from './tagErrors';

const num = { fontVariantNumeric: 'tabular-nums' } as const;
const micro = { fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', lineHeight: 1.4 } as const;
const cellText = { fontSize: 13, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
const cellSub = { ...cellText, fontSize: 12, color: 'text.secondary' } as const;

type FilterPatch = Partial<Record<keyof TagErrorFilters, string | number | null>>;

function itemTitle(row: BadTag): string {
  return row.item?.title || row.detail || row.code || 'Unknown item';
}

function itemSub(row: BadTag): string {
  return [row.item?.sku || row.code, row.item?.brand].filter(Boolean).join(' · ') || '-';
}

/**
 * Tag errors (retail_tags_and_social Phase 1): every wrong tag found on the floor in a week,
 * what the tag said, and the trace back to who checked it in, the truck, the manifest row and
 * the pallet. Managers see every one and can narrow to a processor or a truck (Retail QA links
 * here with `?processor=` / `?po=`); everyone else sees the tags they checked in or found.
 */
export default function TagErrorsPage() {
  const theme = useTheme();
  const isDesk = useMediaQuery(theme.breakpoints.up('lg'));
  const [params, setParams] = useSearchParams();
  const thisWeek = useMemo(() => isoWeekKey(new Date()), []);
  const filters = readTagErrorFilters(params, thisWeek);
  const apiParams = tagErrorListParams(filters);
  const query = useQuery({
    queryKey: ['stocktake', 'bad-tags', 'list', apiParams],
    queryFn: () => listBadTags(apiParams),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const rows = data?.rows ?? [];
  const manager = Boolean(data?.manager);
  const open = rows.filter((row) => !row.fixed_at).length;
  const weekNumber = Number(filters.week.split('-W')[1]);
  const filtered = Boolean(filters.reason || filters.show !== 'all' || filters.processor || filters.po);

  function update(patch: FilterPatch) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '' || (key === 'show' && value === 'all')) next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next, { replace: true });
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, width: '100%', minWidth: 0, maxWidth: 1600, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'center' }}
        gap={1.5}
        sx={{ mb: 1.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>
            Tag errors
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', minHeight: 20 }}>
            {data == null ? ' ' : manager
              ? 'Wrong tags found on the floor, traced back to who checked them in.'
              : 'Tags you checked in or found.'}
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ alignSelf: { xs: 'stretch', md: 'center' } }}>
          <IconButton aria-label="Previous week" onClick={() => update({ week: shiftWeek(filters.week, -1) })}>
            <ChevronLeftRounded />
          </IconButton>
          <Box sx={{ flex: { xs: 1, md: '0 0 auto' }, textAlign: 'center', minWidth: { md: 210 } }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14, ...num }}>{weekRangeLabel(filters.week)}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', ...num }}>Week {weekNumber}</Typography>
          </Box>
          <IconButton
            aria-label="Next week"
            disabled={filters.week >= thisWeek}
            onClick={() => update({ week: shiftWeek(filters.week, 1) })}
          >
            <ChevronRightRounded />
          </IconButton>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            disabled={filters.week === thisWeek}
            onClick={() => update({ week: null })}
            sx={{ textTransform: 'none', fontWeight: 700, borderColor: 'divider', whiteSpace: 'nowrap', ml: 0.5 }}
          >
            This week
          </Button>
        </Stack>
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'minmax(200px, 260px) auto 1fr' },
          alignItems: 'center',
          gap: 1,
          mb: 1.5,
        }}
      >
        <TextField
          select
          size="small"
          label="Reason"
          value={filters.reason}
          onChange={(event) => update({ reason: event.target.value })}
        >
          <MenuItem value="">Every reason</MenuItem>
          {BAD_TAG_REASONS.map((reason) => (
            <MenuItem key={reason.key} value={reason.key}>
              {reason.label}
            </MenuItem>
          ))}
        </TextField>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filters.show}
          onChange={(_, value: TagErrorsShow | null) => value && update({ show: value })}
          aria-label="Show"
          sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 700, px: 2, flex: { xs: 1, sm: '0 0 auto' } } }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="open">Open</ToggleButton>
          <ToggleButton value="fixed">Fixed</ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ justifyContent: { sm: 'flex-end' }, minHeight: 32 }}>
          {filters.processor ? (
            <Chip
              size="small"
              label={`Checked in by ${processorName(rows, filters.processor)}`}
              onDelete={() => update({ processor: null })}
            />
          ) : null}
          {filters.po ? (
            <Chip size="small" label={`Truck ${truckName(rows, filters.po)}`} onDelete={() => update({ po: null })} />
          ) : null}
          <Typography sx={{ fontSize: 13, color: 'text.secondary', ...num }}>
            {data == null ? ' ' : `${rows.length} tag error${rows.length === 1 ? '' : 's'}${open ? ` · ${open} open` : ''}${data.truncated ? ' (the newest 300; narrow the filters)' : ''}`}
          </Typography>
        </Stack>
      </Box>

      {query.isError ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="error">Could not load tag errors.</Typography>
          <Button onClick={() => void query.refetch()} sx={{ mt: 1, textTransform: 'none' }}>
            Try again
          </Button>
        </Paper>
      ) : data == null ? (
        <Stack spacing={1}>
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} variant="rounded" height={isDesk ? 52 : 180} />
          ))}
        </Stack>
      ) : rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <Typography sx={{ color: 'text.secondary' }}>
            {filtered ? 'Nothing matches these filters this week.' : 'No tag errors this week.'}
          </Typography>
        </Paper>
      ) : isDesk ? (
        <TagErrorsTable rows={rows} manager={manager} onProcessor={(id) => update({ processor: id })} onTruck={(id) => update({ po: id })} />
      ) : (
        <Stack spacing={1}>
          {rows.map((row) => (
            <TagErrorCard key={row.id} row={row} />
          ))}
        </Stack>
      )}
    </Box>
  );
}

function ReasonChip({ row }: { row: BadTag }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={reasonColor(row.reason)}
      label={row.reason_label}
      sx={{ height: 22, maxWidth: '100%', '& .MuiChip-label': { px: 0.75, fontSize: '0.72rem', fontWeight: 700 } }}
    />
  );
}

function StatusChip({ row }: { row: BadTag }) {
  return row.fixed_at ? (
    <Chip size="small" variant="outlined" color="success" label="Fixed" sx={{ height: 22, '& .MuiChip-label': { px: 0.75, fontSize: '0.72rem', fontWeight: 700 } }} />
  ) : (
    <Chip size="small" color="error" label="Open" sx={{ height: 22, '& .MuiChip-label': { px: 0.75, fontSize: '0.72rem', fontWeight: 700 } }} />
  );
}

function ItemLink({ row, sx }: { row: BadTag; sx?: object }) {
  const title = itemTitle(row);
  return row.item ? (
    <Link component={RouterLink} to={`/inventory/items/${row.item.id}`} underline="hover" color="inherit" title={title} sx={sx}>
      {title}
    </Link>
  ) : (
    <Box component="span" title={title} sx={sx}>
      {title}
    </Box>
  );
}

/** A person or truck that narrows the list (managers), or plain text. */
function FilterLink({ label, onClick, tip }: { label: string; onClick?: () => void; tip: string }) {
  if (!onClick || label === '-') return <>{label}</>;
  return (
    <Tooltip title={tip} enterDelay={300}>
      <Link component="button" type="button" underline="hover" color="inherit" onClick={onClick} sx={{ font: 'inherit', textAlign: 'left', maxWidth: '100%', ...cellText }}>
        {label}
      </Link>
    </Tooltip>
  );
}

function TagErrorsTable({
  rows,
  manager,
  onProcessor,
  onTruck,
}: {
  rows: BadTag[];
  manager: boolean;
  onProcessor: (id: number) => void;
  onTruck: (id: number) => void;
}) {
  const head = { fontSize: 12, fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap', py: 0.75 } as const;
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Table size="small" sx={{ tableLayout: 'fixed', '& td': { py: 0.75, verticalAlign: 'top' } }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...head, width: '22%' }}>Item</TableCell>
            <TableCell sx={{ ...head, width: '13%' }}>Problem</TableCell>
            <TableCell sx={{ ...head, width: '14%' }}>Tag said</TableCell>
            <TableCell sx={{ ...head, width: '16%' }}>Found</TableCell>
            <TableCell sx={{ ...head, width: '13%' }}>Checked in</TableCell>
            <TableCell sx={{ ...head, width: '11%' }}>Truck</TableCell>
            <TableCell sx={{ ...head, width: '9%' }}>Status</TableCell>
            <TableCell sx={{ ...head, width: 48 }} aria-label="Photo" />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const right = shouldBe(row);
            const trace = row.trace;
            const rest = [
              trace.manifest_row_number != null ? `row ${trace.manifest_row_number}` : '',
              trace.pallet ? `pallet ${trace.pallet.number}` : '',
            ].filter(Boolean).join(' · ');
            return (
              <TableRow key={row.id} hover sx={{ opacity: row.fixed_at ? 0.72 : 1 }}>
                <TableCell>
                  <Box sx={{ ...cellText, fontWeight: 700 }}>
                    <ItemLink row={row} />
                  </Box>
                  <Box sx={{ ...cellSub, ...num }}>{itemSub(row)}</Box>
                </TableCell>
                <TableCell>
                  <ReasonChip row={row} />
                  <Box sx={cellSub} title={row.detail || undefined}>{row.detail || ' '}</Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ ...cellText, ...num }} title={tagSaid(row)}>{tagSaid(row)}</Box>
                  <Box sx={{ ...cellSub, ...num, color: right ? 'success.dark' : 'text.secondary' }} title={right || undefined}>
                    {right ? `Should be ${right}` : ' '}
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={cellText}>{row.where_label}</Box>
                  <Box sx={cellSub} title={whoWhen(row.found_by, row.found_at)}>{whoWhen(row.found_by, row.found_at)}</Box>
                </TableCell>
                <TableCell>
                  <Box sx={cellText}>
                    <FilterLink
                      label={trace.checked_in_by || '-'}
                      tip={`Show only tags ${trace.checked_in_by} checked in`}
                      onClick={manager && trace.checked_in_by_id ? () => onProcessor(trace.checked_in_by_id as number) : undefined}
                    />
                  </Box>
                  <Box sx={{ ...cellSub, ...num }}>{trace.checked_in_at ? when(trace.checked_in_at) : ' '}</Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ ...cellText, ...num }}>
                    <FilterLink
                      label={trace.order_number || '-'}
                      tip={`Show only tags from truck ${trace.order_number}`}
                      onClick={manager && trace.purchase_order_id ? () => onTruck(trace.purchase_order_id as number) : undefined}
                    />
                  </Box>
                  <Box sx={{ ...cellSub, ...num }}>{rest || ' '}</Box>
                </TableCell>
                <TableCell>
                  <StatusChip row={row} />
                  <Box sx={cellSub} title={row.fixed_at ? whoWhen(row.fixed_by, row.fixed_at) : undefined}>
                    {row.fixed_at ? whoWhen(row.fixed_by, row.fixed_at) : ' '}
                  </Box>
                </TableCell>
                <TableCell sx={{ px: 0.5 }}>
                  {row.photo_url ? <BadTagPhoto url={row.photo_url} title={itemTitle(row)} /> : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Paper>
  );
}

function Field({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={micro}>{label}</Typography>
      <Typography sx={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3, color: tone === 'good' ? 'success.dark' : 'text.primary', ...num }}>
        {value}
      </Typography>
      {sub ? <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.3, ...num }}>{sub}</Typography> : null}
    </Box>
  );
}

/** Phone: one card per bad tag, every slot drawn so the cards line up. */
function TagErrorCard({ row }: { row: BadTag }) {
  const right = shouldBe(row);
  const trace = row.trace;
  return (
    <Paper variant="outlined" sx={{ p: 1.25, opacity: row.fixed_at ? 0.8 : 1 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <ReasonChip row={row} />
        <StatusChip row={row} />
      </Stack>
      <Typography
        sx={{
          mt: 0.75,
          fontSize: 15,
          fontWeight: 700,
          lineHeight: 1.3,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        <ItemLink row={row} />
      </Typography>
      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', ...num }}>{itemSub(row)}</Typography>
      {row.detail ? (
        <Typography sx={{ fontSize: 13, mt: 0.5 }}>{row.detail}</Typography>
      ) : null}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1 }}>
        <Field label="Tag said" value={tagSaid(row)} />
        <Field label="Should be" value={right || '-'} tone={right ? 'good' : undefined} />
        <Field label="Found" value={row.where_label} sub={whoWhen(row.found_by, row.found_at)} />
        <Field label="Checked in" value={trace.checked_in_by || '-'} sub={trace.checked_in_at ? when(trace.checked_in_at) : undefined} />
        <Field label="Truck" value={traceLine(trace)} />
        <Field label={row.fixed_at ? 'Fixed' : 'Status'} value={row.fixed_at ? row.fixed_by || 'Fixed' : 'Open'} sub={row.fixed_at ? when(row.fixed_at) : undefined} />
      </Box>
      {row.photo_url ? (
        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <BadTagPhoto url={row.photo_url} title={itemTitle(row)} variant="button" />
        </Box>
      ) : null}
    </Paper>
  );
}

