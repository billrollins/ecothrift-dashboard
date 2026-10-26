import { Box, Chip } from '@mui/material';
import { isAxiosError } from 'axios';
import { format, parseISO } from 'date-fns';
import type { KeyRow, RingWhere } from '../../../api/keys.api';

export function errorText(err: unknown, fallback: string): string {
  if (isAxiosError(err) && typeof err.response?.data?.detail === 'string') return err.response.data.detail;
  return fallback;
}

export function when(iso: string | null): string {
  return iso ? format(parseISO(iso), 'MMM d, h:mm a') : '';
}

/** "Out: Sam (Truck), since Oct 26" or "Home: Office drawer". */
export function whereText(where: RingWhere | null): string {
  if (!where) return 'Not on a ring';
  const who = [where.person, where.location].filter(Boolean).join(', ');
  if (where.status === 'out') return `Out: ${who || 'someone'}${where.since ? `, since ${when(where.since)}` : ''}`;
  return `Home${who ? `: ${who}` : ''}`;
}

export function WhereChip({ where }: { where: RingWhere | null }) {
  return (
    <Chip
      size="small"
      color={where?.status === 'out' ? 'warning' : 'default'}
      variant={where?.status === 'out' ? 'filled' : 'outlined'}
      label={whereText(where)}
      sx={{ maxWidth: '100%' }}
    />
  );
}

/** One line of what the AI read: "House · KW1 · 5 cuts 3-5-2-4-6". */
export function metricsText(key: Pick<KeyRow, 'key_type' | 'keyway' | 'brand' | 'cut_count' | 'cut_depths' | 'stamped_code'>): string {
  const cuts = key.cut_count ? `${key.cut_count} cuts${key.cut_depths ? ` ${key.cut_depths}` : ''}` : '';
  const type = key.key_type ? key.key_type[0].toUpperCase() + key.key_type.slice(1) : '';
  return [type, key.keyway, key.brand, key.stamped_code && `"${key.stamped_code}"`, cuts].filter(Boolean).join(' · ');
}

export function KeyThumb({ url, size = 56 }: { url: string | null; size?: number }) {
  return (
    <Box
      sx={{
        width: size * 1.6,
        height: size,
        flexShrink: 0,
        borderRadius: 1,
        bgcolor: 'grey.100',
        border: 1,
        borderColor: 'divider',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {url ? (
        <Box component="img" src={url} alt="" loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : null}
    </Box>
  );
}
