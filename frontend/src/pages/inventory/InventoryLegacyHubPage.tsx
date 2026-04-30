import { Box, Card, CardContent, Divider, List, ListItemButton, ListItemText, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

type LegacyLink = {
  label: string;
  detail: string;
  path: string;
  hash?: string;
};

/** Only entry for legacy orders / preprocess / processing / settings once inbound nav is placeholder-only. */
export default function InventoryLegacyHubPage() {
  const navigate = useNavigate();

  const links: LegacyLink[] = [
    {
      label: 'Legacy orders & manifests',
      detail: 'Preprocessing / processing entry points (not the main PO dashboard)',
      path: '/inventory/legacy/orders',
    },
    {
      label: 'Manifest prep / preprocessing',
      detail: 'Standardize manifest workflow',
      path: '/inventory/preprocessing',
    },
    {
      label: 'Processing',
      detail: 'Batches, check-in, item ops',
      path: '/inventory/processing',
    },
    {
      label: 'Processing settings',
      detail: 'Sticker defaults, print options (opens settings panel)',
      path: '/inventory/processing',
      hash: '#settings',
    },
  ];

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Legacy inventory pages
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Use these links until inbound fulfillment replaces them.         Bookmark this page:{' '}
        <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>
          /inventory/legacy
        </Typography>
      </Typography>
      <Card variant="outlined">
        <CardContent sx={{ py: 0, '&:last-child': { pb: 0 } }}>
          <List dense disablePadding>
            {links.map((item, i) => (
              <Box key={item.label + (item.hash ?? '')}>
                {i > 0 && <Divider component="li" />}
                <ListItemButton
                  alignItems="flex-start"
                  onClick={() =>
                    navigate({ pathname: item.path, hash: item.hash ?? '' })
                  }
                >
                  <ListItemText primary={item.label} secondary={item.detail} />
                </ListItemButton>
              </Box>
            ))}
          </List>
        </CardContent>
      </Card>
    </Box>
  );
}
