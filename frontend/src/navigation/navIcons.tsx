import type { ComponentType } from 'react';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import { ECO_ICONS } from '../icons/ecoIcons';
import type { NavIconKey } from './navTypes';

/** Sidebar pages and workspaces draw from Eco-Thrift's own icon set (T75). */
export const NAV_ICON_MAP: Record<NavIconKey, ComponentType<SvgIconProps>> = ECO_ICONS;

export function resolveNavIcon(key: NavIconKey): ComponentType<SvgIconProps> {
  return NAV_ICON_MAP[key];
}
