/**
 * Where warnings live.
 *
 * Nothing that needs saying is allowed to mount into the page and push the work
 * down. Conditions collect behind a lamp on the command deck and are read from
 * a top drawer, so the surface under them never moves.
 */
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Close from '@mui/icons-material/Close';
import NotificationsNone from '@mui/icons-material/NotificationsNone';

export type StudioNoticeTone = 'warning' | 'error' | 'info';

export interface StudioNotice {
  id: string;
  tone: StudioNoticeTone;
  title: string;
  detail: string;
}

const TONES: Record<StudioNoticeTone, { color: string; bg: string; border: string }> = {
  error: { color: '#b71c1c', bg: '#fdecea', border: '#f3b5ae' },
  warning: { color: '#8a5200', bg: '#fff4e0', border: '#f0cd93' },
  info: { color: '#0b5c8a', bg: '#e7f3fb', border: '#a9d3ec' },
};

export function StudioNoticeButton({
  notices,
  onOpen,
  tone = 'dark',
  inset = false,
}: {
  notices: StudioNotice[];
  onOpen: () => void;
  tone?: 'dark' | 'light';
  /** Keep the count inside the button so a parent overflow cannot crop it. */
  inset?: boolean;
}) {
  const worst = notices.some((n) => n.tone === 'error') ? 'error' : 'warning';
  return (
    <Tooltip arrow title={notices.length === 0 ? 'Nothing needs attention' : `${notices.length} to review`}>
      <span>
        <IconButton
          onClick={onOpen}
          size="small"
          aria-label={`Notices (${notices.length})`}
          sx={{
            width: inset ? 32 : undefined,
            height: inset ? 32 : undefined,
            color: notices.length > 0
              ? tone === 'light' ? '#ed6c02' : '#ffd9a3'
              : tone === 'light' ? '#64748b' : '#7d8ea6',
          }}
        >
          <Badge
            badgeContent={notices.length}
            color={worst === 'error' ? 'error' : 'warning'}
            overlap="circular"
            sx={
              inset
                ? {
                    '& .MuiBadge-badge': {
                      top: 4,
                      right: 4,
                      minWidth: 14,
                      height: 14,
                      fontSize: '0.62rem',
                      padding: '0 4px',
                    },
                  }
                : undefined
            }
          >
            <NotificationsNone sx={{ fontSize: 21 }} />
          </Badge>
        </IconButton>
      </span>
    </Tooltip>
  );
}

export function StudioNoticeDrawer({
  open,
  notices,
  onClose,
}: {
  open: boolean;
  notices: StudioNotice[];
  onClose: () => void;
}) {
  return (
    <Drawer
      anchor="top"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          maxHeight: 'min(420px, 48vh)',
          bgcolor: '#111c2e',
          color: '#f8fafc',
          borderBottom: '1px solid #1e2f46',
          boxShadow: '0 16px 40px rgba(15, 23, 42, 0.28)',
        },
      }}
    >
      <Box
        sx={{
          px: { xs: 1.75, md: 3 },
          py: 1.35,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1e2f46',
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '0.62rem', letterSpacing: 1.2, color: '#7d8ea6' }}>
            NOTICES
          </Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em' }}>
            {notices.length === 0 ? 'Nothing needs attention' : `${notices.length} to review`}
          </Typography>
        </Box>
        <IconButton aria-label="Close notices" onClick={onClose} sx={{ color: '#91a4bc' }}>
          <Close />
        </IconButton>
      </Box>
      <Box sx={{ px: { xs: 1.75, md: 3 }, py: 1.75, overflowY: 'auto' }}>
        {notices.length === 0 ? (
          <Typography sx={{ color: '#7d8ea6', fontSize: '0.85rem', minHeight: 48 }}>
            Standing conditions will land here. The bench under this drawer does not move.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {notices.map((notice) => {
              const tone = TONES[notice.tone];
              return (
                <Box
                  key={notice.id}
                  sx={{
                    px: 1.5,
                    py: 1.15,
                    borderRadius: '10px',
                    bgcolor: tone.bg,
                    border: `1px solid ${tone.border}`,
                  }}
                >
                  <Typography sx={{ fontWeight: 800, fontSize: '0.86rem', color: tone.color }}>
                    {notice.title}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: '#334155', mt: 0.25 }}>
                    {notice.detail}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}
