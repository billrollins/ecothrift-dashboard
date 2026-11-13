/** Design Lab > Elements: every kit element with a live preview, what it is for, and the line that imports it. */
import { Box, Stack, Typography } from '@mui/material';
import { PageShell } from '../../components/page/PageKit';
import { ELEMENTS, ELEMENT_GROUPS } from './elementCatalog';

export default function ElementsTab() {
  return (
    <PageShell width="wide">
      {ELEMENT_GROUPS.map((g) => (
        <Box key={g}>
          <Typography variant="overline" color="text.secondary" component="h2">{g}</Typography>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' } }}>
            {ELEMENTS.filter((e) => e.group === g).map((e) => (
              <Box key={e.id} id={`element-${e.id}`} sx={{ borderRadius: '14px', border: 1, borderColor: 'divider', bgcolor: 'background.paper', overflow: 'hidden', minWidth: 0 }}>
                <Stack spacing={0.5} sx={{ px: 2, pt: 1.5, pb: 1 }}>
                  <Typography variant="subtitle1">{e.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{e.use}</Typography>
                  <Typography sx={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '0.75rem', color: 'text.secondary', overflowWrap: 'anywhere' }}>{e.code}</Typography>
                </Stack>
                <Box sx={{ p: 2, bgcolor: 'background.default', borderTop: 1, borderColor: 'divider' }}><e.Preview /></Box>
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </PageShell>
  );
}
