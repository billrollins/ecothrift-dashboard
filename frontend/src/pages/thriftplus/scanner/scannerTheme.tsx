/** Thrift+ price scanner look, drafted from the owner's concept image (09-25). */
import { useEffect, type ReactElement } from 'react';
import { Box } from '@mui/material';
import BedRounded from '@mui/icons-material/BedRounded';
import BlenderRounded from '@mui/icons-material/BlenderRounded';
import CategoryRounded from '@mui/icons-material/CategoryRounded';
import ChairRounded from '@mui/icons-material/ChairRounded';
import CheckroomRounded from '@mui/icons-material/CheckroomRounded';
import ChildFriendlyRounded from '@mui/icons-material/ChildFriendlyRounded';
import BuildRounded from '@mui/icons-material/BuildRounded';
import KitchenRounded from '@mui/icons-material/KitchenRounded';
import LightbulbRounded from '@mui/icons-material/LightbulbRounded';
import MenuBookRounded from '@mui/icons-material/MenuBookRounded';
import SportsBasketballRounded from '@mui/icons-material/SportsBasketballRounded';
import ToysRounded from '@mui/icons-material/ToysRounded';
import TvRounded from '@mui/icons-material/TvRounded';
import WeekendRounded from '@mui/icons-material/WeekendRounded';
import YardRounded from '@mui/icons-material/YardRounded';
import type { ThriftPlusCategory } from '../../../api/thriftPlusMock';

export const sc = {
  page: '#f3f4ef',
  card: '#ffffff',
  cardEdge: '#d7e8cf',
  line: '#e6e8e1',
  ink: '#1f261d',
  ink2: '#5d6559',
  ink3: '#8f968a',
  green: '#3f9f35',
  greenBright: '#56b947',
  greenDeep: '#1f6b27',
  greenTint: '#e8f4e2',
  greenWash: 'rgba(120, 190, 90, 0.22)',
  gold: '#e3ad1f',
  goldDeep: '#b7860c',
  track: '#e4e7df',
  warnTint: '#fbf0d9',
  warnText: '#8a5d13',
  badTint: '#fbe3e0',
  badText: '#b01f14',
  night: '#101511',
  font: 'Inter, "Segoe UI", system-ui, sans-serif',
  script: '"Kaushan Script", "Brush Script MT", cursive',
  mono: '"DM Mono", ui-monospace, monospace',
  shadow: '0 1px 2px rgba(31,38,29,0.06), 0 6px 18px rgba(31,38,29,0.08)',
} as const;

/** The logo face loads only on this page, not in the staff dashboard. */
export function useScriptFont(): void {
  useEffect(() => {
    const id = 'thriftplus-script-font';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Kaushan+Script&display=swap';
    document.head.appendChild(link);
  }, []);
}

export function ThriftPlusLogo({ size = 44 }: { size?: number }) {
  return (
    <Box
      component="span"
      aria-label="Thrift+"
      sx={{
        fontFamily: sc.script,
        fontSize: size,
        lineHeight: 1,
        color: '#fff',
        textShadow: '0 2px 6px rgba(0,0,0,0.35)',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      Thrift
      <Box
        component="span"
        sx={{ color: sc.greenBright, fontFamily: sc.font, fontWeight: 900, ml: '0.04em', textShadow: 'none' }}
      >
        +
      </Box>
    </Box>
  );
}

type IconSize = 'small' | 'medium' | 'large' | 'inherit';

const ICONS: Record<ThriftPlusCategory, (p: { fontSize?: IconSize }) => ReactElement> = {
  furniture: (p) => <ChairRounded {...p} />,
  electronics: (p) => <TvRounded {...p} />,
  appliances: (p) => <BlenderRounded {...p} />,
  kitchen: (p) => <KitchenRounded {...p} />,
  home_decor: (p) => <WeekendRounded {...p} />,
  bedding: (p) => <BedRounded {...p} />,
  lighting: (p) => <LightbulbRounded {...p} />,
  toys: (p) => <ToysRounded {...p} />,
  tools: (p) => <BuildRounded {...p} />,
  outdoor: (p) => <YardRounded {...p} />,
  sporting: (p) => <SportsBasketballRounded {...p} />,
  books_media: (p) => <MenuBookRounded {...p} />,
  clothing: (p) => <CheckroomRounded {...p} />,
  baby: (p) => <ChildFriendlyRounded {...p} />,
  other: (p) => <CategoryRounded {...p} />,
};

export function CategoryIcon({ category, fontSize = 'medium' }: { category: ThriftPlusCategory; fontSize?: IconSize }) {
  const render = ICONS[category] ?? ICONS.other;
  return render({ fontSize });
}

/** The round green badge the category icon sits in. */
export function CategoryBadge({ category, size = 64 }: { category: ThriftPlusCategory; size?: number }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        color: '#fff',
        background: `radial-gradient(circle at 35% 30%, ${sc.greenBright}, ${sc.green} 55%, ${sc.greenDeep})`,
        boxShadow: '0 3px 8px rgba(31,107,39,0.35), inset 0 2px 0 rgba(255,255,255,0.35)',
        '& svg': { fontSize: size * 0.52 },
      }}
    >
      <CategoryIcon category={category} />
    </Box>
  );
}
