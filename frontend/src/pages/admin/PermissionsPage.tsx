import { Box, Card, CardContent, Grid, Typography } from '@mui/material';
import AdminPanelSettings from '@mui/icons-material/AdminPanelSettings';
import ManageAccounts from '@mui/icons-material/ManageAccounts';
import Person from '@mui/icons-material/Person';
import Storefront from '@mui/icons-material/Storefront';
import { PageHeader } from '../../components/common/PageHeader';

const ROLES = [
  {
    role: 'Admin',
    icon: <AdminPanelSettings fontSize="large" color="primary" />,
    description:
      'Full system access. Manage users, permissions, settings, and all business operations.',
    access: ['All features', 'User management', 'System settings', 'Reports', 'Consignment management'],
  },
  {
    role: 'Manager',
    icon: <ManageAccounts fontSize="large" color="primary" />,
    description:
      'Store management. Oversee employees, consignment, POS, and daily operations.',
    access: [
      'Consignment accounts, items, payouts',
      'Drawer management',
      'Cash management',
      'Transaction history',
      'Employee time tracking',
    ],
  },
  {
    role: 'Employee',
    icon: <Person fontSize="large" color="primary" />,
    description: 'Staff access. Run POS, manage drawers, clock in/out.',
    access: [
      'POS terminal',
      'Open/close drawers',
      'Cash drops',
      'Time clock',
      'Inventory view',
    ],
  },
  {
    role: 'Consignee',
    icon: <Storefront fontSize="large" color="primary" />,
    description: 'Consignee portal. View items and payouts.',
    access: [
      'My items',
      'My payouts',
      'Summary dashboard',
    ],
  },
];

export default function PermissionsPage() {
  return (
    <Box>
      <PageHeader
        title="Permissions"
        subtitle="Role descriptions and access levels"
      />

      <Grid container spacing={3}>
        {ROLES.map((r) => (
          <Grid key={r.role} size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  {r.icon}
                  <Typography variant="h6" fontWeight={600}>
                    {r.role}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {r.description}
                </Typography>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Can access:
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                  {r.access.map((a) => (
                    <li key={a}>
                      <Typography variant="body2" color="text.secondary">
                        {a}
                      </Typography>
                    </li>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
