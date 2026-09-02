import { Box, Button, Card, CardContent, Typography } from '@mui/material';
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
  /** Small line under the actual - context the headline number leaves out. */
  actualNote?: string;
  placeholder?: boolean;
  goalMet?: boolean;
  onGoalClick: () => void;
  footer?: ReactNode;
  onViewWeekDetail?: () => void;
  showWeekDetailButton?: boolean;
}

const GOLD = dashboardPalette.gold;

/** Shrink display type when the string is long so card geometry stays fixed. */
function metricFontSize(value: string, role: 'goal' | 'actual') {
  const len = value.trim().length;
  if (role === 'goal') {
    if (len >= 9) return { xs: '1.05rem', md: '1.1rem' };
    if (len >= 6) return { xs: '1.25rem', md: '1.3rem' };
    return '1.5rem';
  }
  if (len >= 9) return { xs: '1.35rem', md: '1.55rem' };
  if (len >= 6) return { xs: '1.65rem', md: '1.9rem' };
  return { xs: '2rem', md: '2.45rem' };
}

export function DepartmentStatCard({
  label,
  accent,
  icon,
  goalDisplay,
  actualDisplay,
  actualNote,
  placeholder = false,
  goalMet = false,
  onGoalClick,
  footer,
  onViewWeekDetail,
  showWeekDetailButton = false,
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
        ...(goalMet
          ? {
              borderColor: 'rgba(189, 134, 24, 0.72)',
              borderLeft: `4px solid ${dashboardPalette.gold}`,
              background: `linear-gradient(145deg, #fff9dc 0%, ${dashboardPalette.goldSoft} 48%, ${dashboardPalette.surface} 100%)`,
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.94), 0 0 0 1px rgba(242,201,76,0.28), 0 8px 24px rgba(122,84,14,0.38), 0 18px 40px rgba(20,30,24,0.38)',
              '&::after': {
                content: '"★"',
                position: 'absolute',
                top: 8,
                right: 10,
                color: dashboardPalette.gold,
                fontSize: '1rem',
                textShadow: '0 1px 0 #fff',
              },
            }
          : dashboardAccentLeftSx(accent)),
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
          minHeight: 0,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.85,
            minHeight: { xs: 32, md: 26 },
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: { xs: 32, md: 26 },
              height: { xs: 32, md: 26 },
              borderRadius: 1.5,
              color: goalMet ? dashboardPalette.goldDark : accent,
              bgcolor: goalMet ? dashboardPalette.goldSoft : `${accent}1A`,
              border: '1px solid',
              borderColor: goalMet ? 'rgba(189, 134, 24, 0.4)' : `${accent}40`,
              '& svg': { fontSize: { xs: 18, md: 17 } },
            }}
          >
            {icon}
          </Box>
          <Typography
            variant="caption"
            display="block"
            lineHeight={1}
            sx={{
              fontWeight: 900,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              fontSize: { xs: '0.72rem', md: '0.68rem' },
              color: goalMet ? dashboardPalette.goldDark : accent,
            }}
          >
            {label}
          </Typography>
        </Box>

        {/* Fixed metrics band - keeps the divider Y identical across all four cards. */}
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'flex-end' },
            justifyContent: 'space-between',
            gap: 1,
            height: { xs: 108, sm: 72 },
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          <Box
            component="button"
            type="button"
            onClick={onGoalClick}
            sx={{
              p: 0,
              py: 0.5,
              minHeight: { xs: 44, sm: 'auto' },
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              minWidth: 0,
              maxWidth: { sm: '48%' },
            }}
          >
            <Typography
              variant="caption"
              display="block"
              lineHeight={1}
              sx={{
                fontSize: { xs: '0.65rem', md: '0.58rem' },
                fontWeight: 900,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: GOLD,
                mb: 0.25,
              }}
            >
              Goal
            </Typography>
            <Typography
              noWrap
              title={goalDisplay}
              sx={{
                fontSize: metricFontSize(goalDisplay, 'goal'),
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

          <Box
            sx={{
              minWidth: 0,
              maxWidth: { sm: '52%' },
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              alignItems: { xs: 'flex-start', sm: 'flex-end' },
            }}
          >
            <Typography
              variant="caption"
              display="block"
              lineHeight={1}
              sx={{
                fontSize: { xs: '0.65rem', md: '0.58rem' },
                fontWeight: 900,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: 'text.secondary',
                mb: 0.25,
              }}
            >
              Actual
            </Typography>
            <Typography
              noWrap
              title={actualDisplay}
              sx={{
                fontSize: metricFontSize(actualDisplay, 'actual'),
                fontWeight: 900,
                lineHeight: 0.95,
                letterSpacing: '-0.02em',
                color: placeholder
                  ? 'text.secondary'
                  : goalMet
                    ? dashboardPalette.goldDark
                    : accent,
              }}
            >
              {actualDisplay}
            </Typography>
            <Typography
              noWrap
              title={actualNote || ''}
              sx={{
                mt: 0.15,
                maxWidth: '100%',
                minHeight: 14,
                fontSize: { xs: '0.62rem', md: '0.6rem' },
                fontWeight: 700,
                lineHeight: 1.1,
                color: 'text.secondary',
              }}
            >
              {actualNote || ' '}
            </Typography>
          </Box>

          {goalMet ? (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                right: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.35,
                px: 0.7,
                py: 0.2,
                borderRadius: 99,
                bgcolor: 'rgba(242, 201, 76, 0.22)',
                border: '1px solid rgba(189, 134, 24, 0.35)',
                color: dashboardPalette.goldDark,
                fontSize: '0.58rem',
                fontWeight: 900,
                letterSpacing: 0.2,
                pointerEvents: 'none',
              }}
            >
              <Box component="span" aria-hidden>
                🏆
              </Box>
              GOAL HIT
            </Box>
          ) : null}
        </Box>

        {showWeekDetailButton && onViewWeekDetail ? (
          <Button
            size="small"
            variant="text"
            onClick={onViewWeekDetail}
            sx={{ alignSelf: 'flex-start', px: 0.5, minHeight: 36, flexShrink: 0 }}
          >
            View week detail
          </Button>
        ) : null}

        <Box sx={{ mt: 'auto', minWidth: 0, minHeight: 0 }}>{footer}</Box>
      </CardContent>
    </Card>
  );
}
