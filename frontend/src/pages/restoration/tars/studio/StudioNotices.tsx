/**
 * Where warnings live.
 *
 * Nothing that needs saying is allowed to mount into the page and push the work
 * down. Conditions collect behind a badge in the header and are read on demand,
 * so the surface under them never moves.
 */
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
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
}: {
  notices: StudioNotice[];
  onOpen: () => void;
}) {
  const worst = notices.some((n) => n.tone === 'error') ? 'error' : 'warning';
  return (
    <Tooltip arrow title={notices.length === 0 ? 'Nothing needs attention' : `${notices.length} to review`}>
      <span>
        <IconButton
          onClick={onOpen}
          size="small"
          aria-label={`Notices (${notices.length})`}
          sx={{ color: notices.length > 0 ? '#ffd9a3' : '#7d8ea6' }}
        >
          <Badge
            badgeContent={notices.length}
            color={worst === 'error' ? 'error' : 'warning'}
            overlap="circular"
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
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 380, maxWidth: '92vw' } }}>
      <Box sx={{ px: 1.75, py: 1.35, borderBottom: '1px solid #e2e8f0' }}>
        <Typography sx={{ fontWeight: 900, fontSize: '0.95rem' }}>Needs attention</Typography>
      </Box>
      <Box sx={{ p: 1.5, flex: 1, overflowY: 'auto' }}>
        {notices.length === 0 ? (
          <Typography sx={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Nothing needs attention.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {notices.map((notice) => {
              const tone = TONES[notice.tone];
              return (
                <Box
                  key={notice.id}
                  sx={{
                    px: 1.25,
                    py: 1,
                    borderRadius: '8px',
                    bgcolor: tone.bg,
                    border: `1px solid ${tone.border}`,
                  }}
                >
                  <Typography sx={{ fontWeight: 900, fontSize: '0.82rem', color: tone.color }}>
                    {notice.title}
                  </Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: '#334155', mt: 0.2 }}>
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
