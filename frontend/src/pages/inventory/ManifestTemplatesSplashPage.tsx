import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

/** Thin bridge until a dedicated CSV template library exists. */
export default function ManifestTemplatesSplashPage() {
  const navigate = useNavigate();

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Manifest templates
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Saved column mappings live under each vendor via the API (<code>/api/inventory/templates/</code>).
        Open a vendor, then associate templates from order/manifest workflows.
      </Typography>
      <Button variant="contained" onClick={() => navigate('/inventory/vendors')}>
        Go to vendors
      </Button>
    </Box>
  );
}
