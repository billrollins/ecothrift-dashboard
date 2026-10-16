import { Box, type SxProps, type Theme } from '@mui/material';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** A crisp QR: an SVG with a 4-module quiet zone, error correction M. Sized by `sx` (width; it stays square). */
export default function QrSvg({ text, label, testId, sx }: { text: string; label: string; testId?: string; sx?: SxProps<Theme> }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, color: { dark: '#000000', light: '#ffffff' } })
      .then((out) => live && setSvg(out))
      .catch(() => live && setSvg(''));
    return () => {
      live = false;
    };
  }, [text]);
  return (
    <Box
      role="img"
      aria-label={label}
      data-testid={testId}
      sx={[
        { aspectRatio: '1 / 1', mx: 'auto', '& svg': { width: '100%', height: '100%', display: 'block', shapeRendering: 'crispEdges' } },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
