import { useState } from 'react';
import { Button, Stack, TextField } from '@mui/material';

/** A signing link to hand over by text while Dash has no mailbox: shown whole, with Copy. */
export default function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Stack direction="row" spacing={1}>
      <TextField size="small" fullWidth value={link} slotProps={{ htmlInput: { readOnly: true, 'data-testid': 'sign-link' } }} />
      <Button variant="outlined" onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </Stack>
  );
}
