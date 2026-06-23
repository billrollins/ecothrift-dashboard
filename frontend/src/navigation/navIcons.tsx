import Dashboard from '@mui/icons-material/Dashboard';
import AccountBalance from '@mui/icons-material/AccountBalance';
import Article from '@mui/icons-material/Article';
import AssignmentTurnedIn from '@mui/icons-material/AssignmentTurnedIn';
import Balance from '@mui/icons-material/Balance';
import LocalShipping from '@mui/icons-material/LocalShipping';
import LocalOffer from '@mui/icons-material/LocalOffer';
import Inventory from '@mui/icons-material/Inventory';
import People from '@mui/icons-material/People';
import PointOfSale from '@mui/icons-material/PointOfSale';
import Gavel from '@mui/icons-material/Gavel';
import Star from '@mui/icons-material/Star';
import Security from '@mui/icons-material/Security';
import Settings from '@mui/icons-material/Settings';
import ShoppingCart from '@mui/icons-material/ShoppingCart';
import Store from '@mui/icons-material/Store';
import Storefront from '@mui/icons-material/Storefront';
import ReceiptLong from '@mui/icons-material/ReceiptLong';
import Tune from '@mui/icons-material/Tune';
import FactCheck from '@mui/icons-material/FactCheck';
import SupervisorAccount from '@mui/icons-material/SupervisorAccount';
import Search from '@mui/icons-material/Search';
import Handyman from '@mui/icons-material/Handyman';
import Schedule from '@mui/icons-material/Schedule';
import type { ComponentType } from 'react';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { NavIconKey } from './navTypes';

export const NAV_ICON_MAP: Record<NavIconKey, ComponentType<SvgIconProps>> = {
  dashboard: Dashboard,
  people: People,
  shoppingCart: ShoppingCart,
  article: Article,
  localShipping: LocalShipping,
  inventory: Inventory,
  assignmentTurnedIn: AssignmentTurnedIn,
  balance: Balance,
  search: Search,
  localOffer: LocalOffer,
  store: Store,
  storefront: Storefront,
  receiptLong: ReceiptLong,
  pointOfSale: PointOfSale,
  accountBalance: AccountBalance,
  gavel: Gavel,
  star: Star,
  factCheck: FactCheck,
  tune: Tune,
  supervisorAccount: SupervisorAccount,
  security: Security,
  settings: Settings,
  build: Handyman,
  schedule: Schedule,
};

export function resolveNavIcon(key: NavIconKey): ComponentType<SvgIconProps> {
  return NAV_ICON_MAP[key];
}
