import { useState } from 'react';
import { Box, Button, Collapse, Paper, Typography } from '@mui/material';
import { BUTTON_HELP } from './reentry';

function ButtonHelp() {
  return (
    <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'grid', gap: 0.25 }}>
      {BUTTON_HELP.map((b) => (
        <Typography key={b.name} component="li" variant="body2">
          <Box component="span" sx={{ fontWeight: 800 }}>{`${b.name}: `}</Box>
          {b.text}
        </Typography>
      ))}
    </Box>
  );
}

/**
 * The steps box on Returns and Floor issues: the page's few steps, and what each of the four buttons is for. A wide
 * screen shows both side by side. A phone shows the steps, with the buttons one tap away, so the first item is still
 * on the first screen.
 */
export function ReentrySteps({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 7fr)' }, columnGap: 3, rowGap: 0.5 }}>
      <Box>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>The steps</Typography>
        <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
          {steps.map((step) => (
            <Typography key={step} component="li" variant="body2">{step}</Typography>
          ))}
        </Box>
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>The four buttons</Typography>
        <ButtonHelp />
      </Box>
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <Button size="small" onClick={() => setOpen((now) => !now)} aria-expanded={open} sx={{ textTransform: 'none', fontWeight: 700, px: 0, minHeight: 40 }}>
          {open ? 'Hide what each button does' : 'What each button does'}
        </Button>
        <Collapse in={open} unmountOnExit>
          <ButtonHelp />
        </Collapse>
      </Box>
    </Paper>
  );
}
