/**
 * Thrift+ price scanner look, matched to the owner's concept image (900 x 1600).
 *
 * Every size is in design units: u(46) is 46 px of the 900-wide design, scaled
 * to the phone. `--u` is set once on the page shell so the layout keeps the
 * design's proportions at any width, and shrinks a little on short screens
 * (browser bars) instead of clipping.
 */
import { useEffect } from 'react';
import { Box } from '@mui/material';
import BedRounded from '@mui/icons-material/BedRounded';
import BlenderRounded from '@mui/icons-material/BlenderRounded';
import BuildRounded from '@mui/icons-material/BuildRounded';
import CategoryRounded from '@mui/icons-material/CategoryRounded';
import ChairRounded from '@mui/icons-material/ChairRounded';
import CheckroomRounded from '@mui/icons-material/CheckroomRounded';
import ChildFriendlyRounded from '@mui/icons-material/ChildFriendlyRounded';
import KitchenRounded from '@mui/icons-material/KitchenRounded';
import LightbulbRounded from '@mui/icons-material/LightbulbRounded';
import MenuBookRounded from '@mui/icons-material/MenuBookRounded';
import SportsBasketballRounded from '@mui/icons-material/SportsBasketballRounded';
import ToysRounded from '@mui/icons-material/ToysRounded';
import TvRounded from '@mui/icons-material/TvRounded';
import WeekendRounded from '@mui/icons-material/WeekendRounded';
import YardRounded from '@mui/icons-material/YardRounded';
import type { SvgIconComponent } from '@mui/icons-material';
import type { ThriftPlusCategory } from '../../../api/thriftPlusMock';
import brushUrl from '../../../assets/thriftplus/brush.webp';
import cartUrl from '../../../assets/thriftplus/cart.webp';
import coinUrl from '../../../assets/thriftplus/coin.webp';
import coinsUrl from '../../../assets/thriftplus/coins.webp';
import headerUrl from '../../../assets/thriftplus/header-field.webp';
import logoUrl from '../../../assets/thriftplus/logo.webp';
import orbUrl from '../../../assets/thriftplus/orb.webp';

export const art = {
  brush: brushUrl,
  cart: cartUrl,
  coin: coinUrl,
  coins: coinsUrl,
  header: headerUrl,
  logo: logoUrl,
  orb: orbUrl,
};

/** Design pixels to CSS: u(46) = 46 px of the 900-wide design. */
export const u = (n: number) => `calc(${n} * var(--u))`;

/** Width-driven scale, capped so the fixed parts still fit a short browser window. */
export const UNIT_CSS = 'min(calc(min(100vw, 480px) / 900), calc(100dvh / 1350))';

export const sc = {
  page: '#f2f2ee',
  pageLight: '#fbfbf8',
  card: '#ffffff',
  cardEdge: '#cfe6c2',
  backEdge: '#d9ecd0',
  line: '#e3e4df',
  ink: '#2a2d28',
  ink2: '#5d605a',
  ink3: '#8b8e87',
  titleGreen: '#1d5424',
  priceGreen: '#1f6b27',
  green: '#3f9f35',
  greenBright: '#52b843',
  greenDeep: '#237a26',
  greenTint: '#e7f3e0',
  greenWash: '#dcefd2',
  gold: '#f0b81c',
  warnText: '#8a5d13',
  badText: '#b01f14',
  night: '#101511',
  font: 'Roboto, "Segoe UI", system-ui, sans-serif',
  condensed: '"Roboto Condensed", "Arial Narrow", Roboto, sans-serif',
  bubble: '"Baloo 2", "Roboto Condensed", system-ui, sans-serif',
  script: '"Kaushan Script", "Brush Script MT", cursive',
  mono: '"DM Mono", ui-monospace, monospace',
  cardShadow: '0 10px 28px rgba(64,120,44,0.13), 0 2px 6px rgba(31,38,29,0.06)',
  tileShadow: '0 6px 18px rgba(31,38,29,0.08), 0 1px 3px rgba(31,38,29,0.05)',
} as const;

/** The page's type faces load only here, never in the staff dashboard. */
export function useScannerFonts(): void {
  useEffect(() => {
    const id = 'thriftplus-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Baloo+2:wght@800&family=Roboto+Condensed:wght@700&family=Roboto:wght@400;500;700&display=swap';
    document.head.appendChild(link);
  }, []);
}

export function ThriftPlusLogo({ width }: { width: string }) {
  return (
    <Box
      component="img"
      src={art.logo}
      alt="Thrift+"
      draggable={false}
      sx={{ width, height: 'auto', display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))', userSelect: 'none' }}
    />
  );
}

const ICONS: Record<ThriftPlusCategory, SvgIconComponent> = {
  furniture: ChairRounded,
  electronics: TvRounded,
  appliances: BlenderRounded,
  kitchen: KitchenRounded,
  home_decor: WeekendRounded,
  bedding: BedRounded,
  lighting: LightbulbRounded,
  toys: ToysRounded,
  tools: BuildRounded,
  outdoor: YardRounded,
  sporting: SportsBasketballRounded,
  books_media: MenuBookRounded,
  clothing: CheckroomRounded,
  baby: ChildFriendlyRounded,
  other: CategoryRounded,
};

/** The glossy green badge (generated art) with the category's icon in white. */
export function CategoryBadge({ category, size }: { category: ThriftPlusCategory; size: string }) {
  const Icon = ICONS[category] ?? ICONS.other;
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        backgroundImage: `url(${art.orb})`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        color: '#fff',
      }}
    >
      <Icon sx={{ width: '52%', height: '52%', filter: 'drop-shadow(0 2px 2px rgba(20,70,20,0.45))' }} />
    </Box>
  );
}

/** A four-point gold sparkle, drawn so it stays sharp at any size. */
export function Sparkle({ size, sx }: { size: string; sx?: object }) {
  return (
    <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ position: 'absolute', width: size, height: size, ...sx }}>
      <path
        d="M12 0 C13 7 17 11 24 12 C17 13 13 17 12 24 C11 17 7 13 0 12 C7 11 11 7 12 0 Z"
        fill="url(#tpSparkle)"
      />
      <defs>
        <linearGradient id="tpSparkle" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe27a" />
          <stop offset="1" stopColor="#e9a912" />
        </linearGradient>
      </defs>
    </Box>
  );
}
