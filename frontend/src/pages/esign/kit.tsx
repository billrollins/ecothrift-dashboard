/**
 * The few page pieces the e-sign owner pages use (adapted from Dark Horse's, D22), in Eco-Thrift's plain MUI look:
 * outlined cards like the HR and Owner pages. Only these pages use them.
 */
import type { ReactNode } from 'react';
import type { SvgIconComponent } from '@mui/icons-material';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { Box, Card, CardContent, Chip, Stack, Typography, type SxProps, type Theme } from '@mui/material';

export const ICONS = { description: DescriptionOutlined, chevronDown: ExpandMore };

export type Tone = 'good' | 'wait' | 'quiet' | 'problem';
const TONE_COLOR: Record<Tone, 'success' | 'info' | 'default' | 'error'> = { good: 'success', wait: 'info', quiet: 'default', problem: 'error' };

export function PageShell({ width, children }: { width: 'standard' | 'wide'; children: ReactNode }) {
  return <Stack spacing={2} sx={{ maxWidth: width === 'wide' ? 1400 : 1000 }}>{children}</Stack>;
}

/** A row: what it is about on the left, the actions on the right. */
export function PageToolbar({ lead, children }: { lead?: ReactNode; children?: ReactNode }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>{lead}</Box>
      {children ? <Stack direction="row" spacing={1}>{children}</Stack> : null}
    </Stack>
  );
}

/** An outlined card; `flush` drops the padding for lists whose rows bring their own. */
export function Section({ title, hint, flush, sx, children }: {
  title?: string; hint?: string; flush?: boolean; sx?: SxProps<Theme>; children: ReactNode;
}) {
  return (
    <Card variant="outlined" sx={sx}>
      <CardContent sx={flush ? { p: 0, '&:last-child': { pb: 0 } } : { p: 1.5, '&:last-child': { pb: 1.5 } }}>
        {title ? (
          <Box sx={flush ? { px: 2, pt: 1.5, pb: 0.5 } : { mb: 1 }}>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>{title}</Typography>
            {hint ? <Typography variant="caption" color="text.secondary">{hint}</Typography> : null}
          </Box>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}

export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>{value}</Typography>
        {note ? <Typography variant="caption" color="warning.main">{note}</Typography> : null}
      </CardContent>
    </Card>
  );
}

export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  return <Chip size="small" variant="outlined" color={TONE_COLOR[tone]} label={label} />;
}

export function EmptyState({ Icon, title, body }: { Icon: SvgIconComponent; title: string; body: string }) {
  return (
    <Stack alignItems="center" spacing={0.5} sx={{ py: 5, px: 2, textAlign: 'center' }}>
      <Icon sx={{ color: 'text.disabled', fontSize: 36 }} />
      <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary">{body}</Typography>
    </Stack>
  );
}
