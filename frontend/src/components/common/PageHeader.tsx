import { Box, Typography } from '@mui/material';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  dense?: boolean;
}

export function PageHeader({ title, subtitle, action, dense }: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: dense ? 1 : 2,
        mb: dense ? 0.75 : 3,
      }}
    >
      <Box>
        <Typography variant={dense ? 'h5' : 'h4'} fontWeight={600} gutterBottom={!dense && Boolean(subtitle)}>
          {title}
        </Typography>
        {subtitle ? (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
    </Box>
  );
}
