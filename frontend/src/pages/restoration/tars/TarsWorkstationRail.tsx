import {

  Box,

  Button,

  Card,

  IconButton,

  Stack,

  Tooltip,

  Typography,

} from '@mui/material';

import ExpandLess from '@mui/icons-material/ExpandLess';

import ExpandMore from '@mui/icons-material/ExpandMore';

import type { ReactNode } from 'react';

import type { RestorationJobDTO } from '../../../types/inventory.types';

import { formatElapsed, liveElapsedSeconds, tarsJobRowKey } from './tarsJobAdapter';
import { tarsTimerItemPillSx, tarsTokens as eco } from './tarsTokens';

import { TARS_PENDING_REASON_LABELS } from './tarsWorkTypes';



export const RAIL_MAX_WIDTH = 520;

/** Show inline SKU / order / condition when rail is at least this wide. */

export const RAIL_EXPANDED_DETAIL_WIDTH = 360;



type RailSectionKey = 'queue' | 'bench' | 'pending';



interface TarsWorkstationRailProps {

  queueJobs: RestorationJobDTO[];

  benchJobs: RestorationJobDTO[];

  pendingJobs: RestorationJobDTO[];

  selectedRowKey: string | null;

  runningRowKey: string | null;
  activeBenchRowKey: string | null;
  collapsed: Record<RailSectionKey, boolean>;

  railWidth: number;

  onToggleSection: (key: RailSectionKey) => void;

  onSelectJob: (job: RestorationJobDTO) => void;

}



function itemTitle(job: RestorationJobDTO): string {

  return job.name?.trim() || 'Untitled item';

}



function itemSku(job: RestorationJobDTO): string {

  return job.items[0]?.sku ?? job.sku ?? '—';

}



function restorationEnteredAt(job: RestorationJobDTO): string | null {

  return job.sent_at ?? job.created_at ?? null;

}



function formatRailDateTime(iso: string | null): string {

  if (!iso) return '—';

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return '—';

  return d.toLocaleString(undefined, {

    month: 'short',

    day: 'numeric',

    hour: 'numeric',

    minute: '2-digit',

  });

}



function formatFullDateTime(iso: string | null): string {

  if (!iso) return 'Not available';

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return 'Not available';

  return d.toLocaleString(undefined, {

    weekday: 'short',

    year: 'numeric',

    month: 'long',

    day: 'numeric',

    hour: 'numeric',

    minute: '2-digit',

  });

}



function stageLabel(stage: RestorationJobDTO['stage']): string {

  const labels: Record<string, string> = {

    queued: 'Queued',

    sent: 'Sent to restoration',

    bench: 'On bench',

    pending: 'Pending',

    done: 'Done',

    returned: 'Returned',

  };

  return labels[stage] ?? stage;

}



function priceLabel(raw: string | null): string {

  if (raw == null || raw === '') return '—';

  const n = Number.parseFloat(raw);

  if (!Number.isFinite(n)) return raw;

  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n);

}



function railExtraContext(job: RestorationJobDTO): string[] {

  const lines: string[] = [];

  if (job.stage === 'bench') {

    if (job.timer_is_running) lines.push('Timer: running');

    else {

      const seconds = liveElapsedSeconds(job);

      lines.push(seconds > 0 ? `Timer: paused (${formatElapsed(seconds)})` : 'Timer: not started');

    }

  }

  if (job.stage === 'pending') {

    const reason = job.pending_reason ?

      TARS_PENDING_REASON_LABELS[job.pending_reason as keyof typeof TARS_PENDING_REASON_LABELS]

    : '';

    if (reason) lines.push(`Pending: ${reason}`);

    if (job.pending_storage_location) lines.push(`Shelf: ${job.pending_storage_location}`);

    if (job.pending_notes?.trim()) lines.push(`Notes: ${job.pending_notes.trim()}`);

  }

  if (job.needs_setup) lines.push('Grade prices: incomplete');

  else if (job.scale) lines.push(`Grade scale: ${job.scale}`);

  return lines;

}



function RailItemTooltipContent({ job }: { job: RestorationJobDTO }) {

  const entered = restorationEnteredAt(job);

  const extras = railExtraContext(job);



  const rows: Array<{ label: string; value: string }> = [

    { label: 'Product', value: itemTitle(job) },

    { label: 'SKU', value: itemSku(job) },

    { label: 'Order', value: job.purchase_order_number ?? '—' },

    { label: 'Stage', value: stageLabel(job.stage) },

    {

      label: job.sent_at ? 'Sent to restoration' : 'Queued',

      value: formatFullDateTime(entered),

    },

    { label: 'Price', value: priceLabel(job.price) },

    { label: 'Retail', value: priceLabel(job.retail) },

    { label: 'Condition', value: job.condition?.replace(/_/g, ' ') || '—' },

    { label: 'Source', value: job.source || '—' },

    { label: 'Category', value: job.category || '—' },

  ];



  return (

    <Stack spacing={0.35} sx={{ py: 0.25, maxWidth: 320 }}>

      {rows.map(({ label, value }) => (

        <Box key={label}>

          <Typography variant="caption" sx={{ opacity: 0.75, display: 'block', lineHeight: 1.2 }}>

            {label}

          </Typography>

          <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>

            {value}

          </Typography>

        </Box>

      ))}

      {extras.map((line) => (

        <Typography key={line} variant="body2" sx={{ pt: 0.25, lineHeight: 1.35 }}>

          {line}

        </Typography>

      ))}

    </Stack>

  );

}



function inlineDetailParts(job: RestorationJobDTO): string {

  return [

    itemSku(job),

    job.purchase_order_number ? `PO ${job.purchase_order_number}` : null,

    job.condition ? job.condition.replace(/_/g, ' ') : null,

    job.needs_setup ? 'Needs prices' : null,

  ]

    .filter(Boolean)

    .join(' · ');

}



function benchActiveStatusLabel(job: RestorationJobDTO): 'running' | 'paused' | 'stopped' {

  if (job.timer_is_running) return 'running';

  return liveElapsedSeconds(job) > 0 ? 'paused' : 'stopped';

}



function TarsRailItem({

  job,

  active,

  isTimerRunning,

  showActiveStatus,

  expanded,

  onClick,

}: {

  job: RestorationJobDTO;

  active: boolean;

  isTimerRunning: boolean;

  showActiveStatus?: boolean;

  expanded: boolean;

  onClick: () => void;

}) {

  const title = itemTitle(job);

  const dateLabel = formatRailDateTime(restorationEnteredAt(job));

  const detailLine = inlineDetailParts(job);

  const benchStatus = showActiveStatus ? benchActiveStatusLabel(job) : null;
  const pausedPillSx = tarsTimerItemPillSx('paused');



  return (

    <Tooltip

      title={<RailItemTooltipContent job={job} />}

      placement="right"

      enterDelay={400}

      slotProps={{

        tooltip: {

          sx: {

            bgcolor: '#0f172a',

            color: '#f8fafc',

            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.35)',

            p: 1.25,

            maxWidth: 340,

          },

        },

      }}

    >

      <Button

        fullWidth

        variant="text"

        color="inherit"

        onClick={onClick}

        sx={{

          display: 'block',

          textAlign: 'left',

          textTransform: 'none',

          py: expanded ? 0.65 : 0.55,

          px: 0.85,

          mb: 0.35,

          minHeight: expanded ? 44 : 34,

          borderRadius: 1,

          border: '1px solid',

          borderWidth: active || isTimerRunning ? 2 : 1,

          borderColor: isTimerRunning ? eco.green : active ? 'primary.main' : '#e2e8f0',

          bgcolor: isTimerRunning ? eco.greenSoft : active ? '#eff6ff' : '#fff',

          boxShadow: isTimerRunning ?
            `0 0 0 2px ${eco.greenAlpha16}`
          : active ? '0 0 0 2px rgba(37, 99, 235, 0.12)' : 'none',

          '&:hover': { bgcolor: isTimerRunning ? eco.greenSoft : active ? '#eff6ff' : '#f8fafc' },

        }}

      >

        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={0.75} width="100%">

          <Typography

            variant="body2"

            fontWeight={700}

            noWrap={!expanded}

            title={title}

            sx={{

              flex: 1,

              minWidth: 0,

              lineHeight: 1.25,

              ...(expanded ? { whiteSpace: 'normal', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}),

            }}

          >

            {title}

          </Typography>

          <Typography

            variant="caption"

            color="text.secondary"

            fontWeight={700}

            noWrap

            sx={{ flexShrink: 0, lineHeight: 1.25, pt: 0.1, fontVariantNumeric: 'tabular-nums' }}

          >

            {dateLabel}

          </Typography>

        </Stack>

        {benchStatus ?
          <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%', mt: 0.35 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.4,
                px: 0.65,
                py: 0.15,
                borderRadius: 999,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.04em',
                lineHeight: 1.35,
                ...(benchStatus === 'running' ?
                  {
                    bgcolor: eco.greenAlpha12,
                    color: eco.greenDark,
                    border: `1px solid ${eco.greenAlpha28}`,
                    '@keyframes tarsBenchHeartbeat': {
                      '0%, 100%': {
                        transform: 'scale(0.82)',
                        boxShadow: `0 0 0 0 ${eco.greenAlpha42}`,
                        opacity: 0.72,
                      },
                      '45%': {
                        transform: 'scale(1)',
                        boxShadow: `0 0 0 4px ${eco.greenAlpha10}`,
                        opacity: 1,
                      },
                    },
                  }
                : benchStatus === 'paused' ?
                  {
                    bgcolor: pausedPillSx.bgcolor,
                    color: pausedPillSx.color,
                    border: `1px solid ${pausedPillSx.borderColor}`,
                  }
                : {
                    bgcolor: '#f8fafc',
                    color: '#94a3b8',
                    border: '1px solid #e2e8f0',
                  }),
              }}
            >
              {benchStatus === 'running' ?
                <Box
                  component="span"
                  sx={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    bgcolor: eco.greenMid,
                    flexShrink: 0,
                    animation: 'tarsBenchHeartbeat 1.45s ease-in-out infinite',
                    transformOrigin: 'center',
                  }}
                />
              : null}
              Active - {benchStatus === 'running' ? 'Running' : benchStatus === 'paused' ? 'Paused' : 'Stopped'}
            </Box>
          </Box>
        : null}

        {expanded && detailLine ?

          <Typography

            variant="caption"

            color="text.secondary"

            noWrap

            sx={{ display: 'block', mt: 0.35, lineHeight: 1.2, fontFamily: 'monospace', fontSize: 10 }}

          >

            {detailLine}

          </Typography>

        : null}

      </Button>

    </Tooltip>

  );

}



function TarsRailSection({

  title,

  count,

  collapsed,

  onToggle,

  emptyMessage,

  children,

}: {

  title: string;

  count: number;

  collapsed: boolean;

  onToggle: () => void;

  emptyMessage: string;

  children: ReactNode;

}) {

  return (

    <Card

      variant="outlined"

      sx={{

        flex: collapsed ? '0 0 auto' : '1 1 0',

        minHeight: collapsed ? undefined : 72,

        display: 'flex',

        flexDirection: 'column',

        overflow: 'hidden',

      }}

    >

      <Stack

        direction="row"

        alignItems="center"

        justifyContent="space-between"

        sx={{

          px: 0.85,

          py: 0.55,

          flexShrink: 0,

          borderBottom: collapsed ? 0 : 1,

          borderColor: 'divider',

          bgcolor: '#f8fafc',

          cursor: 'pointer',

        }}

        onClick={onToggle}

      >

        <Typography variant="overline" fontWeight={800} color="text.secondary" lineHeight={1.2}>

          {title} ({count})

        </Typography>

        <IconButton size="small" aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`} sx={{ p: 0.25 }}>

          {collapsed ? <ExpandMore fontSize="small" /> : <ExpandLess fontSize="small" />}

        </IconButton>

      </Stack>



      {!collapsed ?

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 0.5, py: 0.5 }}>

          {count === 0 ?

            <Typography variant="caption" color="text.secondary" textAlign="center" display="block" py={1.25}>

              {emptyMessage}

            </Typography>

          : children}

        </Box>

      : null}

    </Card>

  );

}



export function TarsWorkstationRail({

  queueJobs,

  benchJobs,

  pendingJobs,

  selectedRowKey,

  runningRowKey,
  activeBenchRowKey,

  collapsed,

  railWidth,

  onToggleSection,

  onSelectJob,

}: TarsWorkstationRailProps) {

  const expanded = railWidth >= RAIL_EXPANDED_DETAIL_WIDTH;



  return (

    <Stack spacing={0.65} sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>

      <TarsRailSection

        title="Check-in"

        count={queueJobs.length}

        collapsed={collapsed.queue}

        onToggle={() => onToggleSection('queue')}

        emptyMessage="Nothing inbound."

      >

        {queueJobs.map((job) => (

          <TarsRailItem

            key={tarsJobRowKey(job)}

            job={job}

            expanded={expanded}

            active={selectedRowKey === tarsJobRowKey(job)}
            isTimerRunning={runningRowKey === tarsJobRowKey(job)}

            onClick={() => onSelectJob(job)}

          />

        ))}

      </TarsRailSection>



      <TarsRailSection

        title="On bench"

        count={benchJobs.length}

        collapsed={collapsed.bench}

        onToggle={() => onToggleSection('bench')}

        emptyMessage="Bench empty."

      >

        {benchJobs.map((job) => {
          const rowKey = tarsJobRowKey(job);
          return (

          <TarsRailItem

            key={rowKey}

            job={job}

            expanded={expanded}

            active={selectedRowKey === rowKey}
            isTimerRunning={runningRowKey === rowKey}
            showActiveStatus={activeBenchRowKey === rowKey}

            onClick={() => onSelectJob(job)}

          />

          );
        })}

      </TarsRailSection>



      <TarsRailSection

        title="Pending"

        count={pendingJobs.length}

        collapsed={collapsed.pending}

        onToggle={() => onToggleSection('pending')}

        emptyMessage="Nothing pending."

      >

        {pendingJobs.map((job) => (

          <TarsRailItem

            key={tarsJobRowKey(job)}

            job={job}

            expanded={expanded}

            active={selectedRowKey === tarsJobRowKey(job)}
            isTimerRunning={runningRowKey === tarsJobRowKey(job)}

            onClick={() => onSelectJob(job)}

          />

        ))}

      </TarsRailSection>

    </Stack>

  );

}



export type { RailSectionKey };


