import { Box, Card, CardContent, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import {
  dashboardAccentLeftSx,
  dashboardCardHoverLiftSx,
  dashboardPalette,
  dashboardRaisedDeptCardSx,
} from './dashboardCardStyles';

interface DepartmentStatCardProps {
  label: string;
  accent: string;
  icon: ReactNode;
  goalDisplay: string;
  actualDisplay: string;
  placeholder?: boolean;
  onGoalClick: () => void;
  footer?: ReactNode;
  subStat?: ReactNode;
}

const GOLD = dashboardPalette.gold;

export function DepartmentStatCard({
  label,
  accent,
  icon,
  goalDisplay,
  actualDisplay,
  placeholder = false,
  onGoalClick,
  footer,
  subStat,
}: DepartmentStatCardProps) {
  return (
    <Card
      elevation={0}
      sx={{
        position: 'relative',
        height: '100%',
        width: '100%',
        borderRadius: 3,
        overflow: 'hidden',
        ...dashboardRaisedDeptCardSx,
        ...dashboardAccentLeftSx(accent),
        ...dashboardCardHoverLiftSx,
      }}
    >
      <CardContent
        sx={{
          p: 1.15,
          pl: 1.5,
          '&:last-child': { pb: 0.85 },
          display: 'flex',
          flexDirection: 'column',
          gap: 0.85,
          height: '100%',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 1.5,
              color: accent,
              bgcolor: `${accent}1A`,
              border: '1px solid',
              borderColor: `${accent}40`,
              '& svg': { fontSize: 17 },
            }}
          >
            {icon}
          </Box>
          <Typography
            variant="caption"
            display="block"
            lineHeight={1}
            sx={{ fontWeight: 900, letterSpacing: 0.6, textTransform: 'uppercase', fontSize: '0.68rem', color: accent }}
          >
            {label}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 1,
            py: 0.35,
          }}
        >
          <Box
            component="button"
            type="button"
            onClick={onGoalClick}
            sx={{
              p: 0,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
            }}
          >
            <Typography
              variant="caption"
              display="block"
              lineHeight={1}
              sx={{ fontSize: '0.58rem', fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase', color: GOLD, mb: 0.25 }}
            >
              Goal
            </Typography>
            <Typography
              noWrap
              sx={{
                fontSize: '1.5rem',
                fontWeight: 900,
                color: GOLD,
                lineHeight: 1,
                textDecoration: 'underline',
                textDecorationColor: 'rgba(189, 134, 24, 0.35)',
                textUnderlineOffset: 4,
              }}
            >
              {goalDisplay}
            </Typography>
          </Box>

          <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
            <Typography
              variant="caption"
              display="block"
              lineHeight={1}
              sx={{ fontSize: '0.58rem', fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase', color: 'text.secondary', mb: 0.25 }}
            >
              Actual
            </Typography>
            <Typography
              noWrap
              sx={{
                fontSize: { xs: '2rem', md: '2.45rem' },
                fontWeight: 900,
                lineHeight: 0.95,
                letterSpacing: '-0.02em',
                color: placeholder ? 'text.secondary' : accent,
              }}
            >
              {actualDisplay}
            </Typography>
          </Box>
        </Box>

        {subStat}
        {footer}
      </CardContent>
    </Card>
  );
}
