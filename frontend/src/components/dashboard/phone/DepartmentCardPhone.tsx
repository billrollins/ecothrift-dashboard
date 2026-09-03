import { Box, Button, Card, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { DepartmentDailyMetric, DepartmentDailyWeek } from '../../../types/pos.types';
import {
  dashboardAccentLeftSx,
  dashboardPalette,
  dashboardPhoneCardSx,
} from '../dashboardCardStyles';
import { DepartmentWeekStrip } from './DepartmentWeekStrip';

export function DepartmentCardPhone({
  label,
  accent,
  icon,
  goalDisplay,
  actualDisplay,
  actualNote,
  placeholder = false,
  goalMet = false,
  onGoalClick,
  onViewHistory,
  historyLabel,
  week,
  getValue,
  getCellState,
  todayIso,
  onCellClick,
  isCellClickable,
  cellAriaLabel,
}: {
  label: string;
  accent: string;
  icon: ReactNode;
  goalDisplay: string;
  actualDisplay: string;
  actualNote?: string;
  placeholder?: boolean;
  goalMet?: boolean;
  onGoalClick: () => void;
  onViewHistory: () => void;
  historyLabel: string;
  week: DepartmentDailyWeek | null;
  getValue: (day: DepartmentDailyMetric) => string;
  getCellState?: (day: DepartmentDailyMetric) => 'scheduled' | 'achieved' | undefined;
  todayIso?: string;
  onCellClick?: (day: DepartmentDailyMetric) => void;
  isCellClickable?: (day: DepartmentDailyMetric) => boolean;
  cellAriaLabel?: (day: DepartmentDailyMetric, value: string) => string;
}) {
  return (
    <Card
      elevation={0}
      sx={{
        ...dashboardPhoneCardSx,
        overflow: 'hidden',
        ...(goalMet
          ? {
              borderColor: 'rgba(189, 134, 24, 0.72)',
              borderLeft: `4px solid ${dashboardPalette.gold}`,
            }
          : dashboardAccentLeftSx(accent)),
      }}
    >
      <Box sx={{ px: 1.75, pt: 1.5, pb: 1.25 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 32 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: goalMet ? dashboardPalette.goldDark : accent,
              bgcolor: goalMet ? dashboardPalette.goldSoft : `${accent}1A`,
              border: '1px solid',
              borderColor: goalMet ? 'rgba(189, 134, 24, 0.4)' : `${accent}40`,
              '& svg': { fontSize: 18 },
            }}
          >
            {icon}
          </Box>
          <Typography
            sx={{
              fontWeight: 900,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              fontSize: '0.8rem',
              color: goalMet ? dashboardPalette.goldDark : accent,
              flex: 1,
              minWidth: 0,
            }}
          >
            {label}
          </Typography>
          <Box
            sx={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: dashboardPalette.gold,
              fontSize: '1rem',
            }}
            aria-hidden
          >
            {goalMet ? '★' : '\u00a0'}
          </Box>
        </Box>

        <Box
          sx={{
            mt: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 1.5,
            minHeight: 56,
          }}
        >
          <Box
            component="button"
            type="button"
            onClick={onGoalClick}
            sx={{
              p: 0,
              minHeight: 44,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
            }}
          >
            <Typography
              sx={{
                fontSize: '0.75rem',
                fontWeight: 900,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: dashboardPalette.gold,
                lineHeight: 1,
              }}
            >
              Goal
            </Typography>
            <Typography
              noWrap
              title={goalDisplay}
              sx={{
                mt: 0.4,
                fontSize: '1.25rem',
                fontWeight: 900,
                color: dashboardPalette.gold,
                lineHeight: 1,
                textDecoration: 'underline',
                textDecorationColor: 'rgba(189, 134, 24, 0.35)',
                textUnderlineOffset: 4,
              }}
            >
              {goalDisplay}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right', minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: '0.75rem',
                fontWeight: 900,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: 'text.secondary',
                lineHeight: 1,
              }}
            >
              Actual
            </Typography>
            <Typography
              noWrap
              title={actualDisplay}
              sx={{
                mt: 0.4,
                fontSize: '1.35rem',
                fontWeight: 900,
                lineHeight: 1,
                color: placeholder
                  ? 'text.secondary'
                  : goalMet
                    ? dashboardPalette.goldDark
                    : accent,
              }}
            >
              {actualDisplay}
            </Typography>
          </Box>
        </Box>

        <Typography
          sx={{
            mt: 0.5,
            minHeight: 32,
            fontSize: '0.75rem',
            fontWeight: 700,
            lineHeight: 1.25,
            color: 'text.secondary',
          }}
        >
          {actualNote || '\u00a0'}
        </Typography>

        <Box sx={{ mt: 1 }}>
          <DepartmentWeekStrip
            week={week}
            getValue={getValue}
            getCellState={getCellState}
            todayIso={todayIso}
            onCellClick={onCellClick}
            isCellClickable={isCellClickable}
            cellAriaLabel={cellAriaLabel}
          />
        </Box>

        <Button
          size="small"
          onClick={onViewHistory}
          sx={{ mt: 0.75, minHeight: 44, px: 0.5, fontWeight: 800, textTransform: 'none' }}
        >
          {historyLabel}
        </Button>
      </Box>
    </Card>
  );
}
