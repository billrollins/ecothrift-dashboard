"""Shared constants for inventory (avoid drifting duplicates across views)."""

# Purchase Orders dashboard (`GET …/orders/`, `GET …/orders/summary/`) — vendor display whitelist only.
PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES = frozenset({
    'Walmart',
    'Target',
    'Costco',
    'Essendant',
    'Wayfair',
    'Home Depot',
    'Amazon',
})
