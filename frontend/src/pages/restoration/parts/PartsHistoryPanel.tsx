import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { studio } from '../tars/studio/tarsStudioTheme';
import { fmtUsd } from '../tars/tarsProfit';
import {
  filterHistoryGroups,
  type HistoryItemGroup,
  type HistoryStatusFilter,
  type HistoryWindow,
  summarizeHistory,
} from './partsHistory';
import { STRIP_HEIGHT } from './partsChrome';

const ROW = 52;

const WINDOWS: Array<{ id: HistoryWindow; label: string }> = [
  { id: '90d', label: '90 days' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All' },
];

const STATUSES: Array<{ id: HistoryStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Finished' },
  { id: 'cancelled', label: 'Unfinished' },
];

export function PartsHistoryPanel({
  groups,
  window,
  status,
  search,
  onWindow,
  onStatus,
  onSearch,
  onOpen,
}: {
  groups: HistoryItemGroup[];
  window: HistoryWindow;
  status: HistoryStatusFilter;
  search: string;
  onWindow: (value: HistoryWindow) => void;
  onStatus: (value: HistoryStatusFilter) => void;
  onSearch: (value: string) => void;
  onOpen: (group: HistoryItemGroup) => void;
}) {
  const visible = filterHistoryGroups(groups, status, search);
  const summary = summarizeHistory(visible);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          minHeight: STRIP_HEIGHT,
          flexShrink: 0,
          bgcolor: studio.panel,
          border: `1.5px solid ${studio.panelBorder}`,
          borderRadius: `${studio.radius.lg}px`,
          boxShadow: studio.panelShadow,
          overflow: 'hidden',
        }}
      >
        {[
          ['Items', String(summary.items)],
          ['Spent', fmtUsd(summary.spent)],
          ['Value added', fmtUsd(summary.valueAdded)],
          ['Finished', String(summary.finished)],
        ].map(([label, value], index) => (
          <Box
            key={label}
            sx={{
              minHeight: STRIP_HEIGHT,
              px: 1.5,
              py: 0.85,
              borderLeft: index === 0 ? 0 : `1px solid ${studio.rule}`,
            }}
          >
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', color: studio.inkLabel }}>
              {label}
            </Typography>
            <Typography
              sx={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: '1.35rem',
                fontWeight: 800,
                lineHeight: 1.15,
                fontVariantNumeric: 'tabular-nums',
                color: studio.ink,
                minHeight: 26,
              }}
            >
              {value}
            </Typography>
          </Box>
        ))}
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          minHeight: 40,
          flexShrink: 0,
          flexWrap: 'nowrap',
          overflowX: 'auto',
        }}
      >
        <Segmented
          value={window}
          options={WINDOWS}
          onChange={onWindow}
        />
        <Box sx={{ width: 1, alignSelf: 'stretch', bgcolor: studio.rule, flexShrink: 0 }} />
        <Segmented
          value={status}
          options={STATUSES}
          onChange={onStatus}
        />
        <Box
          component="input"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Find an item"
          sx={{
            flex: 1,
            minWidth: 160,
            height: 32,
            px: 1.1,
            border: `1px solid ${studio.panelBorder}`,
            borderRadius: `${studio.radius.md}px`,
            bgcolor: studio.panel,
            color: studio.ink,
            font: 'inherit',
            fontSize: '0.82rem',
            outline: 'none',
          }}
        />
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          border: `1px solid ${studio.panelBorder}`,
          borderRadius: `${studio.radius.md}px`,
          bgcolor: studio.panel,
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) 88px 88px 56px 110px',
            gap: 1,
            px: 1.5,
            minHeight: 36,
            alignItems: 'center',
            bgcolor: '#f3f6f4',
            borderBottom: `1px solid ${studio.rule}`,
          }}
        >
          {['Item', 'Grade', 'Spent', 'Added', 'Orders', 'Settled'].map((label) => (
            <Typography
              key={label}
              sx={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: studio.inkLabel }}
            >
              {label}
            </Typography>
          ))}
        </Box>
        {visible.length === 0 ? (
          <Box sx={{ minHeight: ROW, px: 1.5, display: 'flex', alignItems: 'center', color: studio.inkFaint }}>
            No historical orders.
          </Box>
        ) : (
          visible.map((group) => (
            <Box
              key={group.job}
              component="button"
              type="button"
              onClick={() => onOpen(group)}
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) 88px 88px 56px 110px',
                gap: 1,
                width: '100%',
                minHeight: ROW,
                px: 1.5,
                alignItems: 'center',
                border: 0,
                borderBottom: `1px solid ${studio.rule}`,
                bgcolor: 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
                '&:hover': { bgcolor: studio.accentSoft },
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 800, color: studio.ink }}>
                  {group.sku}
                </Typography>
                <Typography noWrap sx={{ fontSize: '0.75rem', color: studio.inkMuted }}>
                  {group.name || '-'}
                </Typography>
              </Box>
              <Typography noWrap sx={{ color: studio.inkMuted }}>
                {group.finished ? `${group.startingGrade || '-'} → ${group.finalGrade || '-'}` : 'Not finished'}
              </Typography>
              <Typography sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtUsd(group.spent)}</Typography>
              <Typography
                sx={{
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 700,
                  color: group.valueAdded == null ? studio.inkFaint : group.valueAdded >= 0 ? studio.success : studio.danger,
                }}
              >
                {group.valueAdded == null ? '-' : fmtUsd(group.valueAdded)}
              </Typography>
              <Typography sx={{ fontVariantNumeric: 'tabular-nums' }}>{group.orderCount}</Typography>
              <Typography sx={{ fontSize: '0.78rem', color: studio.inkMuted }}>
                {group.settledAt ? group.settledAt.slice(0, 10) : '-'}
              </Typography>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexShrink: 0,
        border: `1px solid ${studio.panelBorder}`,
        borderRadius: `${studio.radius.md}px`,
        overflow: 'hidden',
        bgcolor: studio.panel,
      }}
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Box
            key={option.id}
            component="button"
            type="button"
            onClick={() => onChange(option.id)}
            sx={{
              px: 1.15,
              minHeight: 32,
              minWidth: 72,
              border: 0,
              borderRight: `1px solid ${studio.rule}`,
              '&:last-of-type': { borderRight: 0 },
              bgcolor: selected ? studio.accentSoft : 'transparent',
              color: selected ? studio.inkLabel : studio.inkMuted,
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {option.label}
          </Box>
        );
      })}
    </Box>
  );
}
