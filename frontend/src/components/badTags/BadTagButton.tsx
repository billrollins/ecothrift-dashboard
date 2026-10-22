import { useState } from 'react';
import { Button, IconButton, Tooltip, type SxProps, type Theme } from '@mui/material';
import QrCodeScannerOutlined from '@mui/icons-material/QrCodeScannerOutlined';
import type { BadTagWhere } from '../../api/badTags.api';
import BadTagDialog from './BadTagDialog';

/** "Report a bad tag": opens the scan dialog (retail_tags_and_social Phase 1). `compact` is an icon (register header). */
export default function BadTagButton({
  where,
  lang,
  sx,
  variant = 'outlined',
  compact = false,
}: {
  where: BadTagWhere;
  lang?: string | null;
  sx?: SxProps<Theme>;
  variant?: 'text' | 'outlined' | 'contained';
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = lang === 'es' ? 'Reportar etiqueta mala' : 'Report a bad tag';
  return (
    <>
      {compact ? (
        <Tooltip title={label}>
          <IconButton size="small" aria-label={label} onClick={() => setOpen(true)} sx={sx}>
            <QrCodeScannerOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Button variant={variant} startIcon={<QrCodeScannerOutlined />} onClick={() => setOpen(true)} sx={sx}>
          {label}
        </Button>
      )}
      {open && <BadTagDialog open where={where} onClose={() => setOpen(false)} />}
    </>
  );
}
