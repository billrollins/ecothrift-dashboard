import { useState } from 'react';
import {
  BottomNavigation,
  BottomNavigationAction,
  Button,
  Drawer,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import MapOutlined from '@mui/icons-material/MapOutlined';
import Navigation from '@mui/icons-material/Navigation';
import PeopleOutline from '@mui/icons-material/PeopleOutline';
import RouteOutlined from '@mui/icons-material/RouteOutlined';
import VerticalAlignTop from '@mui/icons-material/VerticalAlignTop';
import type { DeliveryRun } from '../../../../types/pos.types';
import { currentDriveStop, mapsNavigateUrl, unconfirmedStops } from './fieldRunUtils';

type Props = {
  run: DeliveryRun;
  onScrollTop: () => void;
  onOpenRoute: () => void;
};

export function FieldBottomShortcuts({ run, onScrollTop, onOpenRoute }: Props) {
  const [sheet, setSheet] = useState<'none' | 'unconfirmed'>('none');
  const unconfirmed = unconfirmedStops(run);
  const current = currentDriveStop(run);

  return (
    <>
      <BottomNavigation
        showLabels
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 12,
          borderTop: 1,
          borderColor: 'divider',
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        <BottomNavigationAction
          label="Unconfirmed"
          icon={<PeopleOutline />}
          onClick={() => setSheet('unconfirmed')}
        />
        <BottomNavigationAction label="Route" icon={<RouteOutlined />} onClick={onOpenRoute} />
        <BottomNavigationAction
          label="Navigate"
          icon={<Navigation />}
          disabled={!current}
          onClick={() => {
            if (current) window.open(mapsNavigateUrl(current.address), '_blank', 'noopener,noreferrer');
          }}
        />
        <BottomNavigationAction label="Top" icon={<VerticalAlignTop />} onClick={onScrollTop} />
      </BottomNavigation>

      <Drawer anchor="bottom" open={sheet === 'unconfirmed'} onClose={() => setSheet('none')}>
        <Stack sx={{ p: 2, pb: 4, maxHeight: '70vh' }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            Unconfirmed stops ({unconfirmed.length})
          </Typography>
          {unconfirmed.length === 0 && (
            <Typography color="text.secondary">All stops resolved or confirmed.</Typography>
          )}
          <List dense>
            {unconfirmed.map((stop) => (
              <ListItem key={stop.id} divider>
                <ListItemText
                  primary={stop.customer_name}
                  secondary={`${stop.phone} · ${stop.contact_disposition || 'Needs disposition'}`}
                />
              </ListItem>
            ))}
          </List>
          {run.maps_url && (
            <Button
              startIcon={<MapOutlined />}
              href={run.maps_url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ mt: 1 }}
            >
              Open route map
            </Button>
          )}
        </Stack>
      </Drawer>
    </>
  );
}
