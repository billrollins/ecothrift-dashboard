import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  ListSubheader,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import { dutyColors } from '../duty/tokens';
import { getClockTiles, type ClockTile } from '../../api/hr.api';
import { shiftDepartment, shiftName } from '../../i18n/routines';

type ClockShift = { key: string; en: string; es: string };
export type ClockGroup = { key: string; en: string; es: string; shifts: ClockShift[] };

export function clockGroupsFromTiles(roster: ClockTile[]): ClockGroup[] {
  const byDept = new Map<string, { name: string; slug: string; sort: number; shifts: ClockShift[] }>();
  for (const row of roster) {
    if (!row.punch_code) continue;
    const slug = row.department_slug || row.department.toLowerCase();
    const bucket = byDept.get(slug) ?? {
      name: row.department,
      slug,
      sort: row.department_sort ?? 99,
      shifts: [],
    };
    bucket.shifts.push({ key: row.punch_code, en: row.name, es: row.name });
    byDept.set(slug, bucket);
  }
  return [...byDept.values()]
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((dept) => ({ key: dept.slug, en: dept.name, es: dept.name, shifts: dept.shifts }));
}

function storeDayYmd() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Tiles from the staff endpoint, or the caller's own list (the public clock has no staff JWT). */
function useClockGroups(given?: ClockTile[]) {
  const day = storeDayYmd();
  const tiles = useQuery({
    queryKey: ['hr', 'clockTiles', day],
    queryFn: async () => (await getClockTiles(day)).data,
    enabled: given === undefined,
  });
  const source = given ?? tiles.data;
  return useMemo(() => clockGroupsFromTiles(source ?? []), [source]);
}

export const eyebrowSx = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: dutyColors.ink40,
};

const DEPT_TONE: Record<string, { accent: string; tint: string }> = {
  retail: { accent: dutyColors.brand, tint: dutyColors.brandTint },
  'retail-operations': { accent: dutyColors.brand, tint: dutyColors.brandTint },
  warehouse: { accent: dutyColors.amberBg, tint: '#FBF6E4' },
  processing: { accent: dutyColors.amberBg, tint: '#FBF6E4' },
  restoration: { accent: dutyColors.amberBg, tint: '#FBF6E4' },
  office: { accent: dutyColors.blue, tint: '#EEF3FA' },
  management: { accent: dutyColors.blue, tint: '#EEF3FA' },
};

export function ShiftPicker({
  value,
  pending,
  onPick,
  lang,
  tiles,
}: {
  value?: string;
  pending?: boolean;
  onPick: (shift: string) => void;
  lang: string;
  /** Supply tiles to skip the staff endpoint (public clock). */
  tiles?: ClockTile[];
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const groups = useClockGroups(tiles);

  useEffect(() => {
    if (!pending) setPicking(null);
  }, [pending]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {groups.map((dept) => (
        <Box key={dept.key}>
          <Typography sx={{ ...eyebrowSx, mb: 0.75 }}>
            {lang === 'es' ? dept.es : dept.en}
          </Typography>
          <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(auto-fill, minmax(168px, 1fr))' } }}>
            {dept.shifts.map((shift) => {
              const pressed = picking === shift.key || value === shift.key;
              const spinning = Boolean(pending && pressed);
              const tone = DEPT_TONE[dept.key] ?? DEPT_TONE.retail;
              return (
                <Box
                  key={shift.key}
                  component="button"
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setPicking(shift.key);
                    onPick(shift.key);
                  }}
                  sx={{
                    height: 48,
                    minHeight: 48,
                    px: 1.25,
                    pl: 1.5,
                    borderRadius: '10px',
                    border: `1px solid ${pressed ? tone.accent : dutyColors.ink15}`,
                    borderLeft: `4px solid ${tone.accent}`,
                    bgcolor: pressed ? tone.accent : tone.tint,
                    color: pressed ? '#fff' : dutyColors.ink,
                    fontSize: 13.5,
                    fontWeight: 700,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textAlign: 'left',
                    cursor: pending ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 0.75,
                    fontFamily: 'inherit',
                    boxShadow: pressed
                      ? 'none'
                      : 'inset 0 1px 0 rgba(255,255,255,0.88), 0 1px 2px rgba(26,31,28,0.06)',
                    '&:hover': pending
                      ? undefined
                      : {
                          borderColor: tone.accent,
                        },
                  }}
                >
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lang === 'es' ? shift.es : shift.en}
                  </Box>
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {spinning ? (
                      <CircularProgress size={14} sx={{ color: 'inherit' }} />
                    ) : null}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export function ShiftMenu({
  anchorEl,
  current,
  onClose,
  onPick,
  lang,
}: {
  anchorEl: HTMLElement | null;
  current?: string;
  onClose: () => void;
  onPick: (shift: string) => void;
  lang: string;
}) {
  const groups = useClockGroups();
  return (
    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose}>
      {groups.map((dept) => [
        <ListSubheader
          key={`${dept.key}-head`}
          sx={{ ...eyebrowSx, lineHeight: '32px', bgcolor: 'background.paper' }}
        >
          {lang === 'es' ? dept.es : dept.en}
        </ListSubheader>,
        ...dept.shifts.map((shift) => (
          <MenuItem
            key={shift.key}
            dense
            selected={shift.key === current}
            onClick={() => {
              onClose();
              onPick(shift.key);
            }}
          >
            {lang === 'es' ? shift.es : shift.en}
          </MenuItem>
        )),
      ])}
    </Menu>
  );
}

export function ShiftChip({
  code,
  label,
  lang,
}: {
  code?: string | null;
  label?: string | null;
  lang: string;
}) {
  const dept = code ? shiftDepartment(code, lang) : '';
  const name = (label && label.trim()) || (code ? shiftName(code, lang) : '');
  return (
    <Chip
      size="small"
      label={
        <Box
          component="span"
          sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.5 }}
        >
          {dept ? (
            <Box component="span" sx={{ color: dutyColors.ink40, fontWeight: 600 }}>
              {dept}
            </Box>
          ) : null}
          {dept ? (
            <Box component="span" sx={{ color: dutyColors.ink40 }}>
              {'\u00b7'}
            </Box>
          ) : null}
          <Box component="span" sx={{ fontWeight: 700 }}>
            {name}
          </Box>
        </Box>
      }
      sx={{ fontWeight: 700 }}
    />
  );
}
