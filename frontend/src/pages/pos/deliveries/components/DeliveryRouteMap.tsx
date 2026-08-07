import { useEffect, useState } from 'react';
import { Box, Skeleton, Typography } from '@mui/material';
import MapOutlined from '@mui/icons-material/MapOutlined';
import { getDeliveryDayRouteMap } from '../../../../api/pos.api';
import { ecoField } from '../../../../theme/deliveryTheme';

type Props = {
  dayId: number | undefined;
  height?: number;
  /** Bump to refetch after the route changes (e.g. run.route_revision). */
  revision?: number | string;
  /** Native Maps handoff - the static image itself is not interactive. */
  mapsUrl?: string | null;
};

/**
 * Real route map: the server draws the Routes API polyline and numbered stop
 * markers, so this is the actual plan rather than a decorative placeholder.
 */
export function DeliveryRouteMap({ dayId, height = 190, revision, mapsUrl }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    if (!dayId) {
      setState('unavailable');
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    setState('loading');
    void getDeliveryDayRouteMap(dayId)
      .then(({ data }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setSrc(objectUrl);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('unavailable');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [dayId, revision]);

  const frameSx = {
    height,
    borderRadius: 2.5,
    border: `1.5px solid ${ecoField.line}`,
    overflow: 'hidden',
    position: 'relative' as const,
    bgcolor: ecoField.map,
  };

  if (state === 'loading') {
    return (
      <Box sx={frameSx}>
        <Skeleton variant="rectangular" width="100%" height="100%" />
      </Box>
    );
  }

  if (state === 'unavailable' || !src) {
    return (
      <Box sx={{ ...frameSx, display: 'grid', placeItems: 'center', px: 2 }}>
        <Box sx={{ textAlign: 'center', color: ecoField.muted }}>
          <MapOutlined sx={{ fontSize: 28 }} />
          <Typography variant="caption" display="block" fontWeight={700}>
            Map unavailable - use Open Maps to navigate
          </Typography>
        </Box>
      </Box>
    );
  }

  const image = (
    <Box
      component="img"
      src={src}
      alt="Planned delivery route"
      sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );

  if (!mapsUrl) return <Box sx={frameSx}>{image}</Box>;

  return (
    <Box
      component="a"
      href={mapsUrl}
      target="_blank"
      rel="noreferrer"
      sx={{ ...frameSx, display: 'block' }}
    >
      {image}
    </Box>
  );
}
