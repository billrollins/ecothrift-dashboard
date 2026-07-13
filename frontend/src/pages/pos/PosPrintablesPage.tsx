import { Box, Button, Stack, Typography } from '@mui/material';
import OpenInNew from '@mui/icons-material/OpenInNew';
import { PageHeader } from '../../components/common/PageHeader';

const PRINTABLES = [
  {
    href: '/pos/appliance-policy.html',
    title: 'Appliance warranty + delivery policy',
    blurb: 'English page 1, Mexican Spanish page 2. Give or show to the customer.',
  },
  {
    href: '/pos/sell-log.html',
    title: 'Sell log',
    blurb: 'Warranty and delivery handwriting log (landscape). Change APPLIANCE_COUNT in the HTML if needed.',
  },
  {
    href: '/pos/delivery-log.html',
    title: 'Delivery driver log',
    blurb: 'Saturday route checklist (up to 15 stops). Browser print, landscape.',
  },
] as const;

export default function PosPrintablesPage() {
  return (
    <Box>
      <PageHeader
        title="POS printables"
        subtitle="Open in a new tab, then use the browser print dialog (Ctrl+P)."
      />
      <Stack spacing={2} sx={{ maxWidth: 640 }}>
        {PRINTABLES.map((item) => (
          <Box
            key={item.href}
            sx={{
              p: 2,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            <Typography variant="subtitle1" fontWeight={600}>
              {item.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {item.blurb}
            </Typography>
            <Button
              variant="contained"
              size="small"
              endIcon={<OpenInNew />}
              href={item.href}
              target="_blank"
              rel="noreferrer"
            >
              Open
            </Button>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
