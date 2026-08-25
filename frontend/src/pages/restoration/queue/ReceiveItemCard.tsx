/**
 * What restoration handed back: identity, the money as it stood, and where they said it goes.
 *
 * Every line has a reserved height and cannot shrink — a flex crush was stacking
 * the title on itself and looking like broken type.
 */
import { Box, Typography } from '@mui/material';
import { formatConditionLabel } from '../../../constants/inventory.constants';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { benchDispositionLabel } from './restorationQueueModel';
import { receiveStartingRetail } from './restorationReceive';

const TITLE_HEIGHT = 22;
const IDENTITY_HEIGHT = 16;
const NOTE_HEIGHT = 16;
const FACT_VALUE_HEIGHT = 18;

export function ReceiveItemCard({ job, height }: { job: RestorationJobDTO; height: number }) {
  const sku = job.items.find((item) => !item.parent_item_id)?.sku ?? job.sku ?? '';
  const retail = receiveStartingRetail(job);
  const identity = [sku, job.product_number].filter(Boolean).join(' · ') || 'No SKU';
  const sentTo = benchDispositionLabel(job.bench_disposition) || 'Not set';
  const note = job.disposition_notes?.trim() || 'No note left on dispatch.';
  const name = job.name?.trim() || 'Unnamed item';

  return (
    <Box
      sx={{
        height,
        minHeight: height,
        maxHeight: height,
        display: 'flex',
        flexDirection: 'column',
        p: 1.25,
        border: '1px solid #d2dbd4',
        borderRadius: 2,
        bgcolor: '#f4f6f5',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <CardLabel>Item</CardLabel>
      <Typography
        title={name}
        sx={{
          flexShrink: 0,
          height: TITLE_HEIGHT,
          minHeight: TITLE_HEIGHT,
          lineHeight: `${TITLE_HEIGHT}px`,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: 900,
          fontSize: '0.95rem',
          color: '#172033',
        }}
      >
        {name}
      </Typography>
      <Typography
        title={identity}
        sx={{
          flexShrink: 0,
          height: IDENTITY_HEIGHT,
          minHeight: IDENTITY_HEIGHT,
          lineHeight: `${IDENTITY_HEIGHT}px`,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: '0.74rem',
          fontWeight: 700,
          color: '#65748a',
        }}
      >
        {identity}
      </Typography>

      <Box sx={{ mt: 0.75, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75, flexShrink: 0 }}>
        <Fact label="Brand" value={job.brand?.trim() || '—'} />
        <Fact label="Model" value={job.model?.trim() || '—'} />
        <Fact label="Retail" value={retail > 0 ? `$${retail.toFixed(2)}` : '—'} mono />
        <Fact label="Came in as" value={job.condition ? formatConditionLabel(job.condition) : '—'} />
      </Box>

      <Box sx={{ mt: 'auto', pt: 0.75, borderTop: '1px dashed #e8eee9', flexShrink: 0, minHeight: 36 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
          <CardLabel>Restoration said</CardLabel>
          <Typography
            noWrap
            sx={{ ml: 'auto', fontSize: '0.72rem', fontWeight: 800, color: '#355c3a' }}
          >
            {`Send to ${sentTo}`}
          </Typography>
        </Box>
        <Typography
          title={note}
          sx={{
            height: NOTE_HEIGHT,
            minHeight: NOTE_HEIGHT,
            lineHeight: `${NOTE_HEIGHT}px`,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '0.76rem',
            fontWeight: 600,
            color: job.disposition_notes?.trim() ? '#334155' : '#94a3b8',
          }}
        >
          {note}
        </Typography>
      </Box>
    </Box>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box sx={{ minWidth: 0, flexShrink: 0 }}>
      <CardLabel>{label}</CardLabel>
      <Typography
        title={value}
        sx={{
          height: FACT_VALUE_HEIGHT,
          minHeight: FACT_VALUE_HEIGHT,
          lineHeight: `${FACT_VALUE_HEIGHT}px`,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '0.8rem',
          fontWeight: 800,
          color: value === '—' ? '#94a3b8' : '#172033',
          fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' : undefined,
          fontVariantNumeric: mono ? 'tabular-nums' : undefined,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function CardLabel({ children }: { children: string }) {
  return (
    <Typography
      component="div"
      sx={{
        height: 14,
        minHeight: 14,
        lineHeight: '14px',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        fontSize: '0.58rem',
        fontWeight: 800,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: '#65748a',
      }}
    >
      {children}
    </Typography>
  );
}
