import { useState } from 'react';
import { Button, IconButton, Tooltip, type SxProps, type Theme } from '@mui/material';
import QrCodeScannerOutlined from '@mui/icons-material/QrCodeScannerOutlined';
import type { BadTagWhere } from '../../api/badTags.api';
import BadTagDialog from './BadTagDialog';

/**
 * "Report a problem": the one button for anything wrong with an item or its tag on the floor (Dash Update #84; it
 * was "Report a bad tag"). Opens the scan dialog. `compact` is an icon (register header); `code` skips the scan
 * (the item window).
 */
export default function BadTagButton({
  where,
  lang,
  sx,
  variant = 'outlined',
  compact = false,
  code,
  size,
}: {
  where: BadTagWhere;
  lang?: string | null;
  sx?: SxProps<Theme>;
  variant?: 'text' | 'outlined' | 'contained';
  compact?: boolean;
  /** The item's SKU, when the button sits on one item. */
  code?: string;
  size?: 'small' | 'medium';
}) {
  const [open, setOpen] = useState(false);
  const label = lang === 'es' ? 'Reportar un problema' : 'Report a problem';
  return (
    <>
      {compact ? (
        <Tooltip title={label}>
          <IconButton size="small" aria-label={label} onClick={() => setOpen(true)} sx={sx}>
            <QrCodeScannerOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Button variant={variant} size={size} startIcon={<QrCodeScannerOutlined />} onClick={() => setOpen(true)} sx={sx}>
          {label}
        </Button>
      )}
      {open && <BadTagDialog open where={where} initialCode={code} onClose={() => setOpen(false)} />}
    </>
  );
}
