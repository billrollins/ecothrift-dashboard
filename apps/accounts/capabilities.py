"""Staff permissions: the areas, their steps, and the items in each (Dash Update #53, owner 2026-11-03).

One dial per area: None · View · Work · Manage · Full. Each step includes the ones below it. The areas are the 10
sidebar workspaces, so what you set is what people see. Every item sits on one step of its area; a step gives every
item at or below it. People → Permissions sets the dials for each level (Employee, Manager; the Owner is locked at
Full), for each department (adds only), and for one person (an exception has the last word).

Item ids are the old capability ids where one existed; ``universal_object_surfaces`` should reuse them.

Item steps follow today's gates, so the default presets give everyone exactly what they had before #53:
View/Work = any staff login (``IsStaff``), Manage = ``IsManagerOrAdmin``, Full = owner only (``IsSuperAdmin`` and
the old Admin group, now retired into the Owner).

``paths`` are API paths (after ``/api/``) the item opens when it is granted on its own: a plain string is a prefix,
one with ``*`` is a glob. An item opens a gated endpoint only when its step is at least the gate's step (a Manage
item never opens an owner-only endpoint under the same prefix). Endpoints no item names follow the area's dial.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from fnmatch import fnmatch

NONE, VIEW, WORK, MANAGE, FULL = 0, 1, 2, 3, 4
STEP_NAMES = ('None', 'View', 'Work', 'Manage', 'Full')
STEP_KEYS = ('none', 'view', 'work', 'manage', 'full')
STEP_HELP = (
    'Not in their sidebar.',
    'See the pages; change nothing.',
    'Do the daily work.',
    'Approve, fix anyone\'s work, and set things up.',
    'Everything, including money and owner tools.',
)

LEVEL_EMPLOYEE = 'Employee'
LEVEL_MANAGER = 'Manager'
LEVEL_OWNER = 'Owner'
LEVELS = (LEVEL_EMPLOYEE, LEVEL_MANAGER)


@dataclass(frozen=True)
class Area:
    id: str
    label: str
    helper: str


@dataclass(frozen=True)
class Item:
    id: str
    area: str
    step: int
    label: str
    paths: tuple[str, ...] = field(default=())
    # Never given by a dial, a department or an exception: only the Owner (superuser) has it.
    locked: bool = False


AREAS: tuple[Area, ...] = (
    Area('buying', 'Buying', 'Auctions, vendors, orders and manifest prep'),
    Area('processing', 'Processing', 'Receive and process inbound orders'),
    Area('restoration', 'Restoration', 'Test, assemble, repair, salvage'),
    Area('inventory', 'Inventory', 'Search, counts, and quick fixes'),
    # #67: the Cashier workspace is Retail and People is HR; the ids (and every grant) stay.
    Area('cashier', 'Retail', 'Register, sales, drawers, cash, customers and Thrift+'),
    Area('deliveries', 'Deliveries', 'Schedule days and every delivery'),
    Area('online_sales', 'Online Sales', 'List, reserve, message, and hand off at the register'),
    Area('studios', 'Studios', 'Social posts, labels, floorplans, announcements, and the blog'),
    Area('people', 'HR', 'HR Admin: staff, permissions, hiring, onboarding and check-ins'),
    Area('admin', 'Admin', 'Departments, shifts, routines, Retail QA, payroll, supplies, keys, and settings'),
)
AREA_IDS = tuple(a.id for a in AREAS)
AREA_BY_ID = {a.id: a for a in AREAS}

ITEMS: tuple[Item, ...] = (
    # ── Buying ───────────────────────────────────────────────────────────
    Item('buying:browse', 'buying', VIEW, 'See auctions, watchlist, report cards, vendors and orders'),
    Item('buying.thumbs:write', 'buying', WORK, 'Thumbs-up, wishlist and notes on auctions'),
    Item('buying.orders:write', 'buying', WORK, 'Create and edit orders, vendors and manifests'),
    Item('buying.wins:record', 'buying', MANAGE, 'Record a win and make its order', ('buying/auctions/*/won/',)),
    Item('buying.purchase', 'buying', FULL, 'Purchaser: B-Stock sign-in, manifest pulls, shipping quotes and nags',
         ('buying/bstock-login/', 'buying/manifest-pulls/', 'buying/nags/', 'buying/auctions/*/shipping-quote/')),
    Item('buying.valuation:override', 'buying', FULL, 'Change valuation inputs and category goals',
         ('buying/auctions/*/valuation-inputs/', 'buying/category-need/goal/')),
    # ── Processing ───────────────────────────────────────────────────────
    Item('processing:see', 'processing', VIEW, 'See receiving and the processing queue'),
    Item('inventory:write', 'processing', WORK, 'Receive, check in, price and tag items'),
    # ── Restoration ──────────────────────────────────────────────────────
    Item('restoration:see', 'restoration', VIEW, 'See the queue, tracking and the scoreboard'),
    Item('restoration.bench:use', 'restoration', WORK, 'Work the TARS bench'),
    Item('restoration.parts:request', 'restoration', WORK, 'Ask for parts'),
    Item('restoration.parts:approve', 'restoration', FULL, 'Approve, deny and buy parts; set the ETA; settle cancels',
         ('inventory/restoration-parts-orders/',)),
    # ── Inventory ────────────────────────────────────────────────────────
    Item('inventory:search', 'inventory', VIEW, 'Search items and products'),
    Item('inventory.count:use', 'inventory', WORK, 'Count, PR Fix-it, tag errors and quick reprice'),
    Item('inventory.inventories:manage', 'inventory', MANAGE,
         'Run inventories: start, close, reports and shrink; bulk price changes',
         ('stocktake/', 'inventory/bulk-price/', 'inventory/items/*/mark-on-shelf/')),
    Item('inventory.inventories:owner', 'inventory', FULL, 'Add and edit count sections; delete a count or an inventory',
         ('stocktake/',)),
    # ── Cashier ──────────────────────────────────────────────────────────
    Item('pos.transactions:read', 'cashier', VIEW, 'Read completed transactions'),
    Item('pos.terminal:use', 'cashier', WORK, 'Run the register, carts and receipts'),
    Item('pos.drawer:use', 'cashier', WORK, 'Open and close a drawer; cash drops'),
    Item('thriftplus:staff', 'cashier', WORK, 'Thrift+ sign-ups, finalize and member returns'),
    Item('pos.override:use', 'cashier', MANAGE, 'Manager approvals at the register: carts, voids and drawer fixes',
         ('pos/carts/', 'pos/drawers/')),
    Item('pos.cash:manage', 'cashier', MANAGE, 'Cash: bank, deposits, change, the supplemental drawer and the safe',
         ('pos/bank/', 'pos/bank-transactions/', 'pos/supplemental/', 'pos/safe/')),
    Item('pos.cash:owner', 'cashier', FULL,
         'Owner cash: the safe target and differences, the store sale switch, late card-type fixes',
         ('pos/safe/target/', 'pos/sale-mode/')),
    Item('pos.setup:write', 'cashier', MANAGE, 'Registers, store locations and POS setup',
         ('pos/registers/', 'core/locations/')),
    Item('thriftplus:manage', 'cashier', MANAGE,
         'Thrift+ members: adjust, switch off, send links; rewards, restricted and overstock lists',
         ('thriftplus/',)),
    Item('thriftplus:owner', 'cashier', FULL, 'Thrift+ owner tools: delete members, staff memberships and merges',
         ('thriftplus/',)),
    # ── Deliveries ───────────────────────────────────────────────────────
    Item('delivery:see', 'deliveries', VIEW, 'See delivery days and jobs'),
    Item('delivery:run', 'deliveries', WORK, 'Load and run deliveries'),
    Item('delivery:manage', 'deliveries', MANAGE, 'Create, edit and reschedule delivery days, jobs and availability',
         ('pos/delivery-jobs/', 'pos/delivery-availabilities/', 'pos/delivery-days/', 'pos/deliveries/')),
    # ── Online Sales ─────────────────────────────────────────────────────
    Item('online_sales.listings:manage', 'online_sales', MANAGE, 'Listings, holds, reservations and shopper messages',
         ('webstore/listings/', 'webstore/reservations/', 'webstore/conversations/', 'webstore/work-queue/',
          'webstore/sold-online/', 'webstore/sales-log/')),
    Item('mailbox:use', 'online_sales', MANAGE, 'Mail sync and reply templates', ('mailbox/',)),
    Item('users.customers:manage', 'online_sales', MANAGE, 'Customer accounts', ('accounts/customers/',)),
    # ── Studios ──────────────────────────────────────────────────────────
    Item('floorplan:read', 'studios', VIEW, 'View floorplans'),
    Item('marketing:social', 'studios', WORK, 'Social Studio: photos and posts'),
    Item('floorplan:write', 'studios', MANAGE, 'Create and edit floorplans; AI adjust; pins on the store map',
         ('floorplan/plans/', 'floorplan/assets/', 'floorplan/pins/')),
    Item('labels:write', 'studios', MANAGE, 'Label templates', ('labels/',)),
    Item('announcements:manage', 'studios', MANAGE, 'Customer announcements', ('webstore/announcements/',)),
    Item('marketing:owner', 'studios', FULL, 'Rate posts and record ad spend', ('marketing/spend/',)),
    Item('floorplan.kinds:write', 'studios', FULL, 'Floorplan element kinds and AI drawing', ('floorplan/element-kinds/',)),
    Item('blog:write', 'studios', FULL, 'Blog Studio', ('blog/',)),
    # ── People ───────────────────────────────────────────────────────────
    Item('hiring:manage', 'people', MANAGE,
         'Hiring: applicants, interviews, offers, onboarding, check-ins, jobs and hiring emails', ('hiring/',)),
    Item('hr.schedule:write', 'people', MANAGE, 'The week schedule, shift assignments and call-ins',
         ('hr/schedule/', 'hr/shift-assignments/', 'hr/call-ins/')),
    Item('hr.questions:answer', 'people', MANAGE, 'Answer HR questions from the HR app', ('hr/questions/',)),
    Item('people.pay:read', 'people', MANAGE, 'Pay levels and payroll deductions',
         ('accounts/pay-levels/', 'pos/staff-purchases/')),
    Item('people.permissions:read', 'people', MANAGE, 'See the Permissions page', ('accounts/access/',)),
    Item('people.pay:owner', 'people', FULL, 'Staff purchase settings', ('pos/staff-purchases/settings/',)),
    Item('users.staff:manage', 'people', FULL, 'Staff accounts: add, edit, register PINs and password links',
         ('accounts/users/',)),
    Item('hiring:owner', 'people', FULL,
         'Hiring owner steps: open I-9 files, publish the handbook, password links for managers', ('hiring/',)),
    Item('people.logins:merge', 'people', FULL, 'Merge a customer login into a staff login', ('accounts/login-merge/',)),
    Item('access:edit', 'people', FULL, 'Change levels and permissions', locked=True),
    Item('owner:view_as', 'people', FULL, 'View Dash as another person', locked=True),
    # ── Admin ────────────────────────────────────────────────────────────
    Item('settings:write', 'admin', MANAGE, 'Settings: Store, Printing, System, Assumptions and holiday hours',
         ('core/settings/', 'core/printing/', 'core/files/', 'webstore/hours-overrides/')),
    Item('hr.department:write', 'admin', MANAGE, 'Department details: description, location and manager',
         ('hr/departments/',)),
    Item('hr.shifts:write', 'admin', MANAGE, 'Shifts', ('hr/shifts/',)),
    Item('hr.time_entry:edit', 'admin', MANAGE, 'Edit or delete someone\'s time entry', ('hr/time-entries/',)),
    Item('retail_qa:manage', 'admin', MANAGE, 'Retail QA: the board, call-ins, flags and spot checks',
         ('routines/qa/',)),
    Item('supplies:manage', 'admin', MANAGE, 'Supplies: lists, items and requests', ('supplies/',)),
    Item('signage:manage', 'admin', MANAGE, 'Signage: the store signs, their PDFs and where they hang', ('signage/',)),
    Item('consignment:manage', 'admin', MANAGE, 'Consignment accounts, agreements and payouts', ('consignment/',)),
    Item('pos.revenue_goals:write', 'admin', MANAGE, 'Revenue goals', ('pos/revenue-goals/',)),
    Item('hr.payroll:read', 'admin', FULL, 'Time & payroll: pay periods, roster and pay totals',
         ('hr/pay-periods/', 'hr/time-entries/')),
    Item('hr.mod_requests:triage', 'admin', FULL, 'Approve or reject time-change requests',
         ('hr/modification-requests/',)),
    Item('hr.department:admin', 'admin', FULL, 'Add, rename, switch off and delete departments', ('hr/departments/',)),
    Item('routines:write', 'admin', FULL, 'Create and edit routines and their sections',
         ('routines/routines/', 'routines/sections/')),
    Item('retail_qa:owner', 'admin', FULL, 'Retail QA: preview, resolve and history', ('routines/qa/',)),
    Item('documents:write', 'admin', FULL, 'Documents: upload PDFs, place fields and assign', ('documents/documents/',)),
    Item('supplies:order', 'admin', FULL, 'Supply orders and spend', ('supplies/',)),
    Item('keys:manage', 'admin', FULL, 'Keys and key rings', ('keys/',)),
    Item('settings.ai:write', 'admin', FULL, 'AI models and the model for each AI action', ('core/ai/',)),
    Item('dashboard.goals:write', 'admin', FULL, 'Sales and department goals on the Dashboard',
         ('pos/dashboard/sales-goal/', 'pos/dashboard/department-goals/')),
    Item('settings:owner', 'admin', FULL, 'Owner settings: Thrift+ and admin-only keys', ('core/settings/',)),
    Item('owner.page', 'admin', FULL, 'Owner page: approvals, reports, scorecard, AI spend and errors',
         ('core/owner/', 'core/requests/', 'core/errors/', 'pos/reports/', 'qa/')),
    Item('dashfixes:manage', 'admin', FULL, 'Run the Dash Updates line: accept, order, start and finish',
         locked=True),
)
ITEM_BY_ID = {item.id: item for item in ITEMS}

# Every staff login has these, on no dial, so nobody loses the basics by accident.
BASICS: tuple[str, ...] = (
    'Clock in and out',
    'Today, the Dashboard and the Me page',
    'Staff messages',
    'Their assigned routines and documents',
    'Report to Dash Updates',
)

# Day one (2026-11-03) = what each level had before #53. Department presets start empty (add nothing).
LEVEL_DEFAULTS: dict[str, dict[str, int]] = {
    LEVEL_EMPLOYEE: {
        'buying': WORK, 'processing': WORK, 'restoration': WORK, 'inventory': WORK, 'cashier': WORK,
        'deliveries': WORK, 'online_sales': NONE, 'studios': WORK, 'people': NONE, 'admin': NONE,
    },
    LEVEL_MANAGER: {area: MANAGE for area in AREA_IDS},
}

# Which area an API path belongs to (after ``/api/``); the longest prefix wins. A gate that only checks the level
# (``IsManagerOrAdmin``, ``IsSuperAdmin``) also lets in a person whose dial for this area reaches the gate's step.
API_AREAS: dict[str, str] = {
    'buying/': 'buying',
    'inventory/orders/': 'buying',
    'inventory/vendors/': 'buying',
    'inventory/manifest-fields/': 'buying',
    'inventory/restoration': 'restoration',
    'inventory/': 'inventory',
    'stocktake/': 'inventory',
    'pos/deliver': 'deliveries',
    'pos/revenue-goals/': 'admin',
    'pos/dashboard/': 'admin',
    'pos/reports/': 'admin',
    'pos/staff-purchases/': 'people',
    'pos/': 'cashier',
    'thriftplus/': 'cashier',
    'core/locations/': 'cashier',
    'webstore/announcements/': 'studios',
    'webstore/hours-overrides/': 'admin',
    'webstore/': 'online_sales',
    'mailbox/': 'online_sales',
    'accounts/customers/': 'online_sales',
    'floorplan/': 'studios',
    'labels/': 'studios',
    'blog/': 'studios',
    'marketing/': 'studios',
    'accounts/': 'people',
    'hiring/': 'people',
    'texting/': 'people',
    'hr/schedule/': 'people',
    'hr/questions/': 'people',
    'hr/shift-assignments/': 'people',
    'hr/call-ins/': 'people',
    'hr/': 'admin',
    'core/': 'admin',
    'routines/': 'admin',
    'qa/': 'admin',
    'documents/': 'admin',
    'supplies/': 'admin',
    'signage/': 'admin',
    'keys/': 'admin',
    'consignment/': 'admin',
    'ai/': 'admin',
}
_API_PREFIXES = sorted(API_AREAS, key=len, reverse=True)


def step_key(area: str, step: int) -> str:
    """The id that stands for a whole step of an area's dial, e.g. ``buying:manage``."""
    return f'{area}:{STEP_KEYS[step]}'


def items_at(area: str, step: int) -> list[Item]:
    """The items a dial at ``step`` gives in ``area`` (locked items never)."""
    return [i for i in ITEMS if i.area == area and i.step <= step and not i.locked]


def api_path(path: str) -> str:
    """``/api/hr/shifts/3/`` → ``hr/shifts/3/``."""
    path = (path or '').lstrip('/')
    return path[4:] if path.startswith('api/') else path


def area_for_path(path: str) -> str | None:
    rel = api_path(path)
    for prefix in _API_PREFIXES:
        if rel.startswith(prefix):
            return API_AREAS[prefix]
    return None


def item_matches(item: Item, path: str) -> bool:
    rel = api_path(path)
    for pattern in item.paths:
        if '*' in pattern:
            if fnmatch(rel, pattern + '*'):
                return True
        elif rel.startswith(pattern):
            return True
    return False


def items_for_path(path: str) -> list[Item]:
    return [i for i in ITEMS if i.paths and not i.locked and item_matches(i, path)]


def catalog_payload() -> dict:
    """Areas with their items, the steps, and the basics: the page's fixed parts."""
    return {
        'steps': [{'step': n, 'key': STEP_KEYS[n], 'name': STEP_NAMES[n], 'help': STEP_HELP[n]} for n in range(5)],
        'areas': [
            {
                'id': area.id,
                'label': area.label,
                'helper': area.helper,
                'items': [
                    {'id': i.id, 'step': i.step, 'label': i.label, 'locked': i.locked}
                    for i in ITEMS if i.area == area.id
                ],
            }
            for area in AREAS
        ],
        'basics': list(BASICS),
        'level_defaults': LEVEL_DEFAULTS,
    }
