/** The envelope in the top bar (Dash and Thrift+ Staff): unread staff messages, opening Messages. */
import { Badge, IconButton, Tooltip } from '@mui/material';
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getUnread } from '../../api/messages.api';

export const UNREAD_KEY = ['messages', 'unread'] as const;

export function useUnreadMessages() {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: async () => (await getUnread()).data.unread,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function MessagesEnvelope({ to = '/messages', color }: { to?: string; color?: string }) {
  const navigate = useNavigate();
  const unread = useUnreadMessages().data ?? 0;
  return (
    <Tooltip title={unread ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'Messages'}>
      <IconButton
        aria-label={unread ? `Messages, ${unread} unread` : 'Messages'}
        data-testid="messages-envelope"
        onClick={() => navigate(to)}
        sx={{ width: 44, height: 44, color }}
      >
        <Badge badgeContent={unread} color="error" max={99}>
          <MailOutlineRounded />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}
