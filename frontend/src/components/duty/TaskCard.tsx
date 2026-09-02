import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { dutyColors } from './tokens';

export function TaskCard({
  title,
  meta,
  tags,
  overdue,
  onClick,
  actions,
}: {
  title: string;
  meta: string;
  tags: ReactNode;
  overdue?: boolean;
  onClick?: () => void;
  actions?: ReactNode;
}) {
  const clickable = Boolean(onClick) && !actions;
  return (
    <Box
      component={clickable ? 'button' : 'div'}
      type={clickable ? 'button' : undefined}
      onClick={clickable ? onClick : undefined}
      sx={{
        display: 'block',
        width: 'calc(100% - 24px)',
        mx: 1.5,
        mb: 1,
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        cursor: onClick ? 'pointer' : 'default',
        bgcolor: dutyColors.card,
        border: `1px solid ${dutyColors.ink15}`,
        borderLeft: overdue ? `4px solid ${dutyColors.red}` : `1px solid ${dutyColors.ink15}`,
        borderRadius: '12px',
        boxShadow: '0 1px 2px rgba(29,36,64,0.06)',
        p: overdue ? '13px 14px 13px 12px' : '13px 14px',
        '&:hover': { boxShadow: '0 4px 14px rgba(29,36,64,0.10)' },
        '&:active': onClick ? { bgcolor: '#FAFAF6' } : undefined,
      }}
    >
      <Typography sx={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.3, color: dutyColors.ink }}>
        {title}
      </Typography>
      <Typography sx={{ fontSize: 12.5, color: dutyColors.ink60, mt: 0.5, lineHeight: 1.45, minHeight: 18 }}>
        {meta}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.1, flexWrap: 'wrap', minHeight: 22 }}>
        {tags}
      </Box>
      {actions ? (
        <Box
          sx={{ display: 'flex', gap: 1, mt: 1.25, minHeight: 36 }}
          onClick={(event) => event.stopPropagation()}
        >
          {actions}
        </Box>
      ) : null}
    </Box>
  );
}
