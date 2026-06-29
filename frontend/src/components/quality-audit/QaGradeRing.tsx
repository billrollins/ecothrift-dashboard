import { Box, Typography } from '@mui/material';

interface QaGradeRingProps {
  grade: string;
  /** 0..1 completion or pass rate for the ring fill */
  value: number;
  size?: number;
  label?: string;
  sublabel?: string;
}

function gradeColor(grade: string): string {
  if (grade === 'A') return '#2f7a48';
  if (grade === 'B') return '#5a9b3f';
  if (grade === 'C') return '#bd8618';
  if (grade === 'D') return '#bf7417';
  return '#b3261e';
}

export function QaGradeRing({
  grade,
  value,
  size = 96,
  label,
  sublabel,
}: QaGradeRingProps) {
  const stroke = Math.max(6, Math.round(size * 0.08));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  const dash = circumference * clamped;
  const color = gradeColor(grade || 'F');

  return (
    <Box
      sx={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.4s ease' }}
        />
      </svg>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        <Typography sx={{ fontSize: size * 0.32, fontWeight: 800, color }}>{grade || '—'}</Typography>
        {label ? (
          <Typography sx={{ fontSize: size * 0.1, fontWeight: 700, color: 'text.secondary', mt: 0.3 }}>
            {label}
          </Typography>
        ) : null}
        {sublabel ? (
          <Typography sx={{ fontSize: size * 0.085, color: 'text.secondary' }}>{sublabel}</Typography>
        ) : null}
      </Box>
    </Box>
  );
}
