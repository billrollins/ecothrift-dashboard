"""Staff capability catalog.

This is the single source of truth for *what the server actually enforces
today*: Django group names plus `is_superuser`. It is not a grant table.
Per-user extras are a later initiative. The capability *ids* are the schema
that [`universal_object_surfaces`](.ai/initiatives/universal_object_surfaces.md)
should reuse rather than inventing a parallel taxonomy.

Holders are explicit — a Manager does not inherit an Admin-only row.
`Super Admin` means `user.is_superuser`, independent of group.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

HOLDER_EMPLOYEE = 'Employee'
HOLDER_MANAGER = 'Manager'
HOLDER_ADMIN = 'Admin'
HOLDER_SUPER = 'Super Admin'
HOLDER_CONSIGNEE = 'Consignee'
HOLDER_CUSTOMER = 'Customer'

STAFF = (HOLDER_EMPLOYEE, HOLDER_MANAGER, HOLDER_ADMIN)
MANAGER_PLUS = (HOLDER_MANAGER, HOLDER_ADMIN)
ADMIN_ONLY = (HOLDER_ADMIN,)
SUPER_ONLY = (HOLDER_SUPER,)


@dataclass(frozen=True)
class Capability:
    id: str
    area: str
    label: str
    holders: tuple[str, ...]
    source: str


# Verified against apps/accounts/permissions.py and every get_permissions() override.
CATALOG: tuple[Capability, ...] = (
    # ── Staff floor (IsStaff ≡ IsEmployee) ────────────────────────────────
    Capability('staff.app:use', 'Staff', 'Use the staff dashboard', STAFF, 'IsStaff / StaffRoute'),
    Capability('inventory:read', 'Inventory', 'Browse catalog, orders, receiving, processing', STAFF, 'IsStaff on inventory viewsets'),
    Capability('inventory:write', 'Inventory', 'Check in, disposition, retag, and edit items', STAFF, 'IsStaff writes on Item / Processing'),
    Capability('buying:read', 'Buying', 'Browse auctions, watchlist, vendors', STAFF, 'IsStaff on buying viewsets'),
    Capability('buying.thumbs:write', 'Buying', 'Mark thumbs-up on an auction', STAFF, 'IsStaff; UI also allows Employee via hasRole'),
    Capability('pos.terminal:use', 'POS', 'Run the register, carts, and receipts', STAFF, 'IsEmployee on Cart / Receipt'),
    Capability('pos.drawer:use', 'POS', 'Open and close a drawer, cash drop', STAFF, 'IsEmployee on Drawer'),
    Capability('pos.transactions:read', 'POS', 'Read completed transactions', STAFF, 'IsEmployee'),
    Capability('restoration.bench:use', 'Restoration', 'Work the TARS bench and overview', STAFF, 'IsStaff on RestorationJob'),
    Capability('restoration.parts:request', 'Restoration', 'File a parts request', STAFF, 'IsStaff on parts orders'),
    Capability('hr.time_clock:use', 'People', 'Clock in, out, break; request a time change', STAFF, 'IsEmployee on TimeEntry'),
    Capability('enhancements:file', 'Restoration', 'File an enhancement request from the floor', STAFF, 'IsStaff on EnhancementRequest'),
    Capability('floorplan:read', 'Studios', 'View floorplans', STAFF, 'FloorPlanViewSet GET → IsStaff'),
    # ── Manager+ (IsManagerOrAdmin) ───────────────────────────────────────
    Capability('settings:write', 'Settings', 'Edit Assumptions, Store, Printing, System', MANAGER_PLUS, 'AppSettingViewSet IsManagerOrAdmin'),
    Capability('users.customers:manage', 'People', 'Create and edit customer accounts', MANAGER_PLUS, 'CustomerViewSet IsManagerOrAdmin'),
    Capability('consignment:manage', 'Consignment', 'Manage consignee accounts, items, payouts', MANAGER_PLUS, 'IsManagerOrAdmin on consignment viewsets'),
    Capability('online_sales:manage', 'Online Sales', 'Listings, holds, and shopper messages', MANAGER_PLUS, 'IsManagerOrAdmin on webstore staff viewsets'),
    Capability('labels:write', 'Studios', 'Create and edit label templates', MANAGER_PLUS, 'CustomLabelViewSet _STAFF_PERMS'),
    Capability('quality_audit:run', 'Retail Floor', 'Start and review a quality audit', MANAGER_PLUS, 'QualityAuditViewSet; form GET is Manager+'),
    Capability('pos.register:write', 'POS', 'Create and edit registers', MANAGER_PLUS, 'RegisterViewSet writes'),
    Capability('pos.setup:write', 'POS', 'Edit store locations and POS setup', MANAGER_PLUS, 'WorkLocation writes; POS setup UI'),
    Capability('pos.override:use', 'POS', 'Manager override on a cart or sold-item action', MANAGER_PLUS, 'inline IsManagerOrAdmin in pos/views.py'),
    Capability('delivery:manage', 'Deliveries', 'Create and edit delivery days and jobs', MANAGER_PLUS, 'Delivery* ViewSet writes → Manager+'),
    Capability('hr.department:write', 'People', 'Create and edit departments', MANAGER_PLUS, 'DepartmentViewSet writes'),
    Capability('hr.time_entry:edit', 'People', 'Edit or delete another person\'s time entry', MANAGER_PLUS, 'TimeEntryViewSet update/destroy'),
    Capability('hr.sick_leave:write', 'People', 'Adjust sick-leave balances', MANAGER_PLUS, 'SickLeaveBalanceViewSet writes'),
    Capability('floorplan:write', 'Studios', 'Create and edit floorplans', MANAGER_PLUS, 'FloorPlanViewSet / Asset writes'),
    Capability('mailbox.sync:use', 'Mail', 'Trigger a Microsoft Graph mailbox sync', MANAGER_PLUS, 'sync_now IsManagerOrAdmin'),
    Capability('mailbox.templates:read', 'Mail', 'Read email templates for Online Sales replies', MANAGER_PLUS, 'EmailTemplateViewSet'),
    # ── Admin only (IsAdmin) ──────────────────────────────────────────────
    Capability('users.staff:manage', 'People', 'Create and edit staff accounts (Employees tab)', ADMIN_ONLY, 'UserViewSet IsAdmin'),
    Capability('mailbox.retail:use', 'Mail', 'Read and reply to retail@ general mail', ADMIN_ONLY, 'GeneralMailMessageViewSet IsAdmin'),
    Capability('buying.valuation:override', 'Buying', 'Override auction valuation inputs', ADMIN_ONLY, 'AuctionViewSet.valuation_inputs'),
    Capability('settings.permissions:read', 'Settings', 'View the capability catalog', ADMIN_ONLY, 'capability-catalog endpoint'),
    # ── Super Admin (IsSuperAdmin / is_superuser) ─────────────────────────
    Capability('hr.payroll:read', 'People', 'Open Time & payroll, roster, and pay totals', SUPER_ONLY, 'TimeEntryViewSet.payroll / roster'),
    Capability('hr.mod_requests:triage', 'People', 'Approve or reject time-change requests', SUPER_ONLY, 'TimeEntryModificationRequestViewSet'),
    Capability('blog:write', 'Studios', 'Write and publish in Blog Studio', SUPER_ONLY, 'blog _STAFF_PERMS IsSuperAdmin'),
    Capability('restoration.parts:approve', 'Restoration', 'Approve, deny, buy, or set ETA on parts', SUPER_ONLY, 'parts approve/deny/purchase/eta'),
    Capability('enhancements:triage', 'Restoration', 'Set priority, status, and target date', SUPER_ONLY, 'EnhancementRequestViewSet.triage'),
    Capability('quality_audit.forms:write', 'Studios', 'Create and edit QA form definitions', SUPER_ONLY, 'QualityAuditFormViewSet writes'),
    Capability('floorplan.kinds:write', 'Studios', 'Create and edit floorplan element kinds', SUPER_ONLY, 'FloorPlanElementKindViewSet writes'),
    Capability('dashboard.goals:write', 'Staff', 'Edit department sales goals', SUPER_ONLY, 'inline IsSuperAdmin on dashboard goals'),
    # ── Portals (not staff) ───────────────────────────────────────────────
    Capability('consignee.portal:use', 'Consignee', 'View own items, payouts, and summary', (HOLDER_CONSIGNEE,), 'IsConsignee on my_*'),
    Capability('customer.storefront:use', 'Customer', 'Shop, hold, and message from the storefront', (HOLDER_CUSTOMER,), 'inline IsCustomer after IsAuthenticated'),
)

CATALOG_BY_ID = {cap.id: cap for cap in CATALOG}

MATRIX_HOLDERS = (HOLDER_EMPLOYEE, HOLDER_MANAGER, HOLDER_ADMIN, HOLDER_SUPER)
PORTAL_HOLDERS = (HOLDER_CONSIGNEE, HOLDER_CUSTOMER)


def catalog_as_dicts() -> list[dict]:
    return [
        {
            'id': cap.id,
            'area': cap.area,
            'label': cap.label,
            'holders': list(cap.holders),
            'source': cap.source,
        }
        for cap in CATALOG
    ]


def capabilities_for_user(user) -> list[str]:
    if user is None or not getattr(user, 'is_authenticated', False):
        return []
    role = getattr(user, 'role', None)
    is_super = bool(getattr(user, 'is_superuser', False))
    granted: list[str] = []
    for cap in CATALOG:
        if is_super and HOLDER_SUPER in cap.holders:
            granted.append(cap.id)
            continue
        if role and role in cap.holders:
            granted.append(cap.id)
    return granted


def unique_areas(caps: Iterable[Capability] = CATALOG) -> list[str]:
    seen: list[str] = []
    for cap in caps:
        if cap.area not in seen:
            seen.append(cap.area)
    return seen
