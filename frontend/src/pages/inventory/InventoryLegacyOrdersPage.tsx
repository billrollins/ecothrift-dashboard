import {
  Box,
  Card,
  CardContent,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

type LegacyLink = {
  label: string;
  detail: string;
  path: string;
  hash?: string;
};

/** Legacy workflows tied to purchase orders (manifest / preprocessing / processing), separate from `/inventory/orders`. */
export default function InventoryLegacyOrdersPage() {
  const navigate = useNavigate();

  const links: LegacyLink[] = [
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
      detail: 'Sticker defaults, print options',
      path: '/inventory/processing',
      hash: '#settings',
    },
  ];

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Legacy · Orders & manifests
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tools used before the new inbound fulfillment flows ship. The main PO list and KPIs are on{' '}
        <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>
          /inventory/orders
        </Typography>{' '}
        (sidebar: Inbound fulfillment → Orders).
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
      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        All legacy inventory links:{' '}
        <Typography
          component="button"
          type="button"
          variant="caption"
          onClick={() => navigate('/inventory/legacy')}
          sx={{
            cursor: 'pointer',
            border: 'none',
            background: 'none',
            p: 0,
            color: 'primary.main',
            textDecoration: 'underline',
          }}
        >
          /inventory/legacy
        </Typography>
      </Typography>
    </Box>
  );
}
