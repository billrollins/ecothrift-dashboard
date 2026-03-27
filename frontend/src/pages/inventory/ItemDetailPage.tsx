import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import { PageHeader } from '../../components/common/PageHeader';
import ItemDrawer from '../../components/inventory/ItemDrawer';

/**
 * Permalink route for a single item: opens the same ItemDrawer as the list page.
 * Primary list is Inventory → Items (split). This route supports shared links.
 */
export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const itemId = id ? parseInt(id, 10) : NaN;

  if (!Number.isFinite(itemId)) {
    return (
      <Box>
        <Typography>Invalid item id.</Typography>
        <Button onClick={() => navigate('/inventory/items')}>Back to items</Button>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Item"
        subtitle="Edit in the drawer, or return to the list."
        action={
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={() => navigate('/inventory/items')}
          >
            Back to list
          </Button>
        }
      />
      <ItemDrawer
        open
        mode="edit"
        itemId={itemId}
        onClose={() => navigate('/inventory/items')}
      />
    </Box>
  );
}
