import { Box, Button, Card, CardContent, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

interface Props {
  title: string;
  subtitle?: string;
}

/** Thin placeholder until Inbound Fulfillment pages ship per umbrella rebuild plan. */
export default function InventoryRoadmapPage({ title, subtitle }: Props) {
  const navigate = useNavigate();

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {subtitle ?? 'Planned for the inbound fulfillment redesign.'}
      </Typography>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="body2">
            Until this ships, use the legacy sidebar hub under Inventory → Legacy inventory pages.
          </Typography>
          <Button sx={{ mt: 2 }} variant="outlined" size="small" onClick={() => navigate('/inventory/legacy')}>
            Legacy inventory pages
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
