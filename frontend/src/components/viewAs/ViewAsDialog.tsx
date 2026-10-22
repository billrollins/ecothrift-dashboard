/**
 * View as… (account menu, owner only): pick an employee and see Dash as they do. Read only; the band at the top
 * says so and has Back.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import { useQuery } from '@tanstack/react-query';
import { getUsers } from '../../api/accounts.api';
import { useAuth } from '../../contexts/AuthContext';
import { useIsMobileLayout } from '../../hooks/useIsMobileLayout';
import { IconClose as Close } from '../../icons/ecoIcons';
import { PersonAvatar } from '../users/userChrome';
import { canViewAs } from './viewAs';
import { useStartViewAs } from './useStartViewAs';

export default function ViewAsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const isMobile = useIsMobileLayout();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const { start, pendingId, error } = useStartViewAs();

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(input.trim()), 250);
    return () => window.clearTimeout(t);
  }, [input]);

  const people = useQuery({
    queryKey: ['view-as-people', search],
    queryFn: async () => (await getUsers({ page_size: 100, is_active: '1', search: search || undefined, ordering: 'last_name' })).data,
    enabled: open,
  });
  const rows = (people.data?.results ?? []).filter((row) => canViewAs(user, row));

  return (
    <Dialog open={open} onClose={onClose} fullScreen={isMobile} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <VisibilityRounded />
        <Box sx={{ flex: 1 }}>View Dash as…</Box>
        <IconButton aria-label="Close" onClick={onClose}>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: { md: 420 } }}>
        <Typography variant="body2" color="text.secondary">
          See their nav, Today, Dashboard and everything else exactly as they do. Read only: nothing can be saved,
          sent or punched. Ends on Back, on sign-out, or after 2 hours.
        </Typography>
        <TextField
          autoFocus={!isMobile}
          size="small"
          placeholder="Search by name"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          fullWidth
        />
        {error ? <Alert severity="error">{error}</Alert> : null}
        <List dense={!isMobile} sx={{ flex: 1, overflowY: 'auto', mx: -1 }}>
          {rows.map((row) => (
            <ListItemButton
              key={row.id}
              disabled={pendingId != null}
              onClick={() => void start(row.id)}
              sx={{ borderRadius: 2, minHeight: 56, gap: 1.5 }}
              data-testid={`view-as-pick-${row.id}`}
            >
              <PersonAvatar name={row.full_name || row.email} seed={row.email || String(row.id)} size={36} />
              <ListItemText
                primary={row.full_name || row.email}
                secondary={[row.employee?.position, row.role].filter(Boolean).join(' · ') || 'Staff'}
              />
              {pendingId === row.id ? <Typography variant="caption">Opening…</Typography> : null}
            </ListItemButton>
          ))}
          {!people.isLoading && rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 3, textAlign: 'center' }}>
              Nobody matches.
            </Typography>
          ) : null}
        </List>
      </DialogContent>
    </Dialog>
  );
}
