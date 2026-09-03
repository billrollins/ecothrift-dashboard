import ChevronRight from '@mui/icons-material/ChevronRight';
import { Box, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { t } from '../../../i18n/routines';
import { StatusTag } from '../../duty/StatusTag';
import { dutyColors } from '../../duty/tokens';

export function GlanceRunRow({
  title,
  meta,
  href,
  urgency = 'none',
  lang,
}: {
  title: string;
  meta: string;
  href: string;
  urgency?: 'late' | 'hard' | 'none';
  lang: string;
}) {
  const navigate = useNavigate();
  return (
    <Box
      component="button"
      type="button"
      onClick={() => navigate(href)}
      sx={{
        width: '100%',
        height: 68,
        px: 1.5,
        mb: 0.75,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        border: `1px solid ${dutyColors.ink15}`,
        borderRadius: '12px',
        bgcolor: dutyColors.card,
        textAlign: 'left',
        font: 'inherit',
        cursor: 'pointer',
        color: dutyColors.ink,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 14.5, fontWeight: 700, color: dutyColors.ink }}>
          {title}
        </Typography>
        <Typography noWrap sx={{ fontSize: 12, color: dutyColors.ink40, minHeight: 16 }}>
          {meta || ' '}
        </Typography>
      </Box>
      <Box sx={{ width: 56, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        {urgency === 'late' ? (
          <StatusTag small label={t('late', lang)} tone="red" />
        ) : urgency === 'hard' ? (
          <StatusTag small label={t('dueNow', lang)} tone="amber" />
        ) : null}
      </Box>
      <ChevronRight sx={{ fontSize: 20, color: dutyColors.ink40 }} />
    </Box>
  );
}

export function GlanceEmptyRow({ text }: { text: string }) {
  return (
    <Typography sx={{ fontSize: 12.5, color: dutyColors.ink40, minHeight: 18, pl: 0.25 }}>
      {text}
    </Typography>
  );
}
