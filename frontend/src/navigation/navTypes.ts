import type { ComponentType } from 'react';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { AccessNeed } from '../auth/access';
import type { EcoIconName } from '../icons/ecoIcons';
import type { UserRole } from '../types/accounts.types';

/** An icon from Eco-Thrift's own set; the names come from the set, so a missing one fails the type check. */
export type NavIconKey = EcoIconName;

export interface NavItemDef {
  id: string;
  path: string;
  label: string;
  icon: NavIconKey;
  roles?: UserRole[];
  navSearch?: string;
  navigateHash?: string;
  inactiveWhenHash?: string;
  legacy?: boolean;
  /** Open this destination in a new browser window/tab instead of in-app navigation. */
  openInNewWindow?: boolean;
  /** Extra prefixes that also count as this item (desk/field twins, renamed paths). */
  pathAliases?: string[];
  /** Only visible to Django superusers (the Super Admin); the `roles` ranking can't express this. */
  superuserOnly?: boolean;
  /**
   * What it needs on People → Permissions (#53): its item(s) plus the dial step, e.g.
   * `['settings:write', 'admin:manage']`. Left out: its area's View step (the area is the workspace that lists it).
   * `roles` / `superuserOnly` stay as the rule for a user object without `access`.
   */
  need?: AccessNeed;
  /** The permission area of a page no workspace lists as its own (only a guest link). */
  area?: string;
}

export interface NavGroupDef {
  id: string;
  /** null = no collapsible header (flat links) */
  label: string | null;
  itemIds: string[];
  /**
   * Pages set apart from the workspace's own list: shortcuts to another
   * workspace, and owner-only tools. Rendered after a hairline, and when
   * role filtering empties the list the hairline goes with it.
   */
  guestItemIds?: string[];
  /**
   * The workspace's own set-and-forget pages (setup, printables, practice). Drawn under a small "Setup"
   * caption after the daily pages, so the pages used every shift sit on top (owner, 2026-10-19).
   */
  setupItemIds?: string[];
  roles?: UserRole[];
}

export interface ResolvedNavItem extends NavItemDef {
  Icon: ComponentType<SvgIconProps>;
}

export interface ResolvedNavGroup {
  id: string;
  label: string | null;
  /** Every page the workspace owns: the daily ones, then its setup pages. */
  items: ResolvedNavItem[];
  /** The tail of ``items`` drawn under the "Setup" caption. */
  setupItems: ResolvedNavItem[];
  guestItems: ResolvedNavItem[];
}
