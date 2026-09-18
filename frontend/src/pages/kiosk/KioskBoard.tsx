import { Box, Typography } from '@mui/material';
import ShoppingCart from '@mui/icons-material/ShoppingCart';
import Inventory2 from '@mui/icons-material/Inventory2';
import Handyman from '@mui/icons-material/Handyman';
import HomeWork from '@mui/icons-material/HomeWork';
import LocalOffer from '@mui/icons-material/LocalOffer';
import LocalShipping from '@mui/icons-material/LocalShipping';
import Groups from '@mui/icons-material/Groups';
import type { ComponentType } from 'react';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { BoardDepartment, BoardRow, BoardStatus, KioskBoard as KioskBoardData } from '../../api/kiosk.api';
import { tk, type AppLanguage } from '../../i18n/kiosk';
import { chipTone, kioskColors } from './kioskTheme';
import { hhmmLabel } from './kioskLang';

const ICONS: Record<string, ComponentType<SvgIconProps>> = {
  cart: ShoppingCart,
  box: Inventory2,
  tool: Handyman,
  home: HomeWork,
  tag: LocalOffer,
  truck: LocalShipping,
  none: Groups,
};

export const CHIP_KEY: Record<BoardStatus, string> = {
  in: 'chipIn',
  break: 'chipBreak',
  expected: 'chipExpected',
  late: 'chipLate',
  called_in: 'chipCalledIn',
  left: 'chipLeft',
  out: 'chipOut',
};

/** Rows for one department, already sorted by the server. */
export function groupRows(board: KioskBoardData): Array<{ dept: BoardDepartment; rows: BoardRow[] }> {
  return board.departments
    .map((dept) => ({ dept, rows: board.rows.filter((row) => row.department_slug === dept.slug) }))
    .filter((group) => group.rows.length > 0);
}

export function StatusChip({ status, lateMinutes, lang }: { status: BoardStatus; lateMinutes?: number | null; lang: AppLanguage }) {
  const tone = chipTone[status] ?? chipTone.out;
  const label = tk(CHIP_KEY[status] ?? 'chipOut', lang);
  const extra = status === 'late' && lateMinutes ? ` · ${lateMinutes} ${tk('minLate', lang)}` : '';
  return (
    <Box
      component="span"
      data-testid={`chip-${status}`}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: 1.5,
        py: 0.5,
        borderRadius: 999,
        bgcolor: tone.bg,
        color: tone.fg,
        fontSize: 15,
        fontWeight: 800,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {extra}
    </Box>
  );
}

export function KioskBoard({ board, lang, dense }: { board: KioskBoardData | undefined; lang: AppLanguage; dense?: boolean }) {
  if (!board) return null;
  const groups = groupRows(board);
  if (!groups.length) {
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <Typography sx={{ color: kioskColors.ink60, fontSize: 24, fontWeight: 600 }}>
          {board.store_open ? tk('boardEmpty', lang) : tk('storeClosedToday', lang)}
        </Typography>
      </Box>
    );
  }
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2.5,
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: `repeat(${Math.min(groups.length, 3)}, minmax(0, 1fr))` },
        alignItems: 'start',
      }}
    >
      {groups.map(({ dept, rows }) => {
        const Icon = ICONS[dept.icon] ?? ICONS.none;
        return (
          <Box
            key={dept.slug}
            data-testid={`dept-${dept.slug}`}
            sx={{
              bgcolor: kioskColors.panel,
              border: `1px solid ${kioskColors.panelEdge}`,
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.5, py: 1.5, borderBottom: `1px solid ${kioskColors.panelEdge}` }}>
              <Icon sx={{ color: kioskColors.ink60, fontSize: 26 }} />
              <Typography sx={{ fontSize: 20, fontWeight: 800, color: kioskColors.ink, letterSpacing: '0.01em' }}>
                {dept.other ? tk('other', lang) : dept.name}
              </Typography>
              <Typography sx={{ ml: 'auto', color: kioskColors.ink40, fontSize: 16, fontWeight: 700 }}>
                {rows.length}
              </Typography>
            </Box>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {rows.map((row) => (
                <Box
                  component="li"
                  key={row.id}
                  data-testid={`row-${row.id}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 2.5,
                    py: dense ? 1.1 : 1.6,
                    borderBottom: `1px solid ${kioskColors.panelEdge}`,
                    '&:last-of-type': { borderBottom: 'none' },
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: dense ? 20 : 23, fontWeight: 800, color: kioskColors.ink, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.name}
                    </Typography>
                    <Typography sx={{ fontSize: 15, color: kioskColors.ink60, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[row.shift_name, row.expected_time ? hhmmLabel(row.expected_time, lang) : '']
                        .filter(Boolean)
                        .join(' · ')}
                      {row.in_time ? (
                        <Box component="span" sx={{ color: kioskColors.ink40 }}>
                          {`  ${tk('since', lang)} ${hhmmLabel(row.in_time, lang)}`}
                        </Box>
                      ) : null}
                    </Typography>
                  </Box>
                  <StatusChip status={row.status} lateMinutes={row.late_minutes} lang={lang} />
                </Box>
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
