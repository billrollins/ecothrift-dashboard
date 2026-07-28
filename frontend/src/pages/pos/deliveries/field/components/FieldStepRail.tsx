import { BottomNavigation, BottomNavigationAction, Box } from '@mui/material';
import LocalPhoneRounded from '@mui/icons-material/LocalPhoneRounded';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import RouteOutlined from '@mui/icons-material/RouteOutlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import {
  FIELD_UI_STEP_LABELS,
  type FieldUiStep,
  isUiStepUnlocked,
} from '../fieldStepUtils';
import { ecoField, ecoFieldStepAccent } from '../ecoFieldTheme';
import type { DeliveryRun } from '../../../../../types/pos.types';

const ICONS: Record<FieldUiStep, React.ReactNode> = {
  contact: <LocalPhoneRounded />,
  load: <Inventory2Outlined />,
  routes: <RouteOutlined />,
  deliveries: <LocalShippingOutlined />,
  finish: <FlagOutlined />,
};

type Props = {
  run: DeliveryRun;
  step: FieldUiStep;
  onChange: (step: FieldUiStep) => void;
};

const ORDER: FieldUiStep[] = ['contact', 'load', 'routes', 'deliveries', 'finish'];

export function FieldStepRail({ run, step, onChange }: Props) {
  const accent = ecoFieldStepAccent[step];
  return (
    <Box
      sx={{
        borderTop: `1px solid ${ecoField.line}`,
        bgcolor: '#fff',
        pb: 'env(safe-area-inset-bottom)',
        flexShrink: 0,
      }}
    >
      <BottomNavigation
        showLabels
        value={step}
        onChange={(_, value: FieldUiStep) => {
          if (isUiStepUnlocked(run, value)) onChange(value);
        }}
        sx={{
          height: 64,
          '& .MuiBottomNavigationAction-root': {
            minWidth: 0,
            px: 0.5,
            color: ecoField.muted,
            '&.Mui-selected': {
              color: accent.accent,
              bgcolor: accent.tint,
              borderRadius: 2,
            },
            '&.Mui-disabled': { opacity: 0.35 },
          },
          '& .MuiBottomNavigationAction-label': {
            fontSize: '0.68rem',
            fontWeight: 800,
          },
        }}
      >
        {ORDER.map((key) => {
          const unlocked = isUiStepUnlocked(run, key);
          return (
            <BottomNavigationAction
              key={key}
              value={key}
              label={FIELD_UI_STEP_LABELS[key]}
              icon={ICONS[key]}
              disabled={!unlocked}
              aria-label={`${FIELD_UI_STEP_LABELS[key]}${unlocked ? '' : ' locked'}`}
            />
          );
        })}
      </BottomNavigation>
    </Box>
  );
}
