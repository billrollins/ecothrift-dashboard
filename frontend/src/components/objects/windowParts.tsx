/**
 * The pieces every object window shares (Item, Register, Transactions, Sale): a titled section, label/value facts,
 * the copy-ID button, a header number and a dated timeline. One look wherever a window opens.
 */
import { useState, type ReactNode } from 'react';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { IconCopy } from '../../icons/ecoIcons';

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Box component="section" sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: { xs: 1.5, md: 2 }, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography component="h3" sx={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'text.secondary', flex: 1 }}>
          {title}
        </Typography>
        {action}
      </Stack>
      {children}
    </Box>
  );
}

/** Label / value rows. Empty values are left out, so every section shows only what is known. */
export function Facts({ rows, empty = 'Nothing recorded.' }: { rows: [string, ReactNode][]; empty?: string }) {
  const shown = rows.filter(([, v]) => v != null && v !== '' && v !== false);
  if (!shown.length) return <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{empty}</Typography>;
  return (
    <Box
      component="dl"
      sx={{
        m: 0, display: 'grid', gridTemplateColumns: { xs: 'minmax(96px, auto) 1fr', sm: 'minmax(120px, auto) 1fr' },
        columnGap: 2, rowGap: 0.75, fontSize: 14,
        '& dt': { color: 'text.secondary' },
        '& dd': { m: 0, overflowWrap: 'anywhere', fontWeight: 500 },
      }}
    >
      {shown.map(([k, v]) => (
        <Box key={k} sx={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </Box>
      ))}
    </Box>
  );
}

/** The window's ID in monospace with a copy button (Item: SKU; Register: code; Sale: receipt). */
export function CopyId({ value, label, copied: copiedText = 'Copied' }: { value: string; label: string; copied?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Stack direction="row" spacing={0.25} alignItems="center">
      <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: { xs: 14, md: 15 } }}>{value}</Typography>
      <Tooltip title={copied ? copiedText : label}>
        <IconButton
          size="small"
          aria-label={label}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => setCopied(true));
            window.setTimeout(() => setCopied(false), 1400);
          }}
        >
          <IconCopy fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

/** A big number in a window header ("Today $412.50"). */
export function Stat({ label, value, muted }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'uppercase', fontWeight: 700 }}>{label}</Typography>
      <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: muted ? 600 : 900, lineHeight: 1.1, color: muted ? 'text.secondary' : undefined }}>
        {value}
      </Typography>
    </Box>
  );
}

export interface TimelineRow {
  key: string;
  label: string;
  detail?: string | null;
  when: string;
  dot: string;
}

/** One dated timeline, a dot per event and a line between them (the Item window's Journey look). */
export function Timeline({ rows, empty }: { rows: TimelineRow[]; empty: string }) {
  if (!rows.length) return <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{empty}</Typography>;
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {rows.map((e, i) => (
        <Box component="li" key={e.key} sx={{ display: 'grid', gridTemplateColumns: '14px 1fr', columnGap: 1.25, pb: 1.25, position: 'relative' }}>
          <Box sx={{ position: 'relative' }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: e.dot, mt: '5px' }} />
            {i < rows.length - 1 && (
              <Box sx={{ position: 'absolute', left: 4, top: 17, bottom: -4, width: 2, bgcolor: 'divider' }} />
            )}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{e.label}</Typography>
            {e.detail && <Typography sx={{ fontSize: 13, overflowWrap: 'anywhere' }}>{e.detail}</Typography>}
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{e.when}</Typography>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
