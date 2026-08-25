import { Box, Typography } from '@mui/material';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  dense?: boolean;
  /** One short title row — Overview and other shop-floor bands. */
  compact?: boolean;
}

export function PageHeader({ title, subtitle, action, dense, compact }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: compact ? 'nowrap' : 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: compact ? 1 : dense ? 1 : 2,
        mb: compact ? 0.5 : dense ? 0.75 : 3,
      }}
    >
      <Box
        sx={
          compact
            ? { display: 'flex', alignItems: 'baseline', gap: 1.25, minWidth: 0, flexWrap: 'nowrap' }
            : undefined
        }
      >
        <Typography
          variant={compact ? 'h6' : dense ? 'h5' : 'h4'}
          fontWeight={600}
          gutterBottom={!compact && !dense && Boolean(subtitle)}
          noWrap={compact}
          sx={compact ? { fontSize: '1.15rem', lineHeight: 1.2, mb: 0 } : undefined}
        >
          {title}
        </Typography>
        {subtitle ? (
          <Typography
            variant="body2"
            color="text.secondary"
            noWrap={compact}
            sx={compact ? { fontSize: '0.78rem', minWidth: 0 } : undefined}
          >
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
    </Box>
  );
}
