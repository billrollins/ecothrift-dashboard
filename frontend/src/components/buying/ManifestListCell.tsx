import { Typography } from '@mui/material';

/** Auction list: plain Yes/No for has_manifest. */
export default function ManifestListCell({ hasManifest }: { hasManifest: boolean }) {
  return (
    <Typography variant="body2" component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
      {hasManifest ? 'Yes' : 'No'}
    </Typography>
  );
}
