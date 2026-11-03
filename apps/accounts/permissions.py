from rest_framework.permissions import BasePermission

from apps.accounts import capabilities as cat


def _granted(request, step: int) -> bool:
    """A grant on People → Permissions (Dash Update #53): the person's dial for this path's area reaches ``step``, or
    they hold an item at that step that names this path. Staff logins only; never a customer or consignee."""
    from apps.accounts.services.access import request_granted

    return request_granted(request, step)


class IsAdmin(BasePermission):
    """The owner (the Admin group is retired into the Owner, #53), anyone still in the Admin group, or a grant at
    Full for this area."""
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser or user.role == 'Admin':
            return True
        return _granted(request, cat.FULL)


class IsManagerOrAdmin(BasePermission):
    """Manager or Admin role users, any superuser, or a grant at Manage for this area (#53)."""
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser or user.role in ('Manager', 'Admin'):
            return True
        return _granted(request, cat.MANAGE)


class IsEmployee(BasePermission):
    """Allow access to Employee role users (or higher)."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ('Employee', 'Manager', 'Admin')
        )


class IsTeamMember(BasePermission):
    """Employee, Manager or Admin, or any superuser. For staff endpoints that only checked sign-in:
    online-store customers sign in with the same kind of token, so IsAuthenticated alone lets them in."""
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return bool(user.is_superuser or user.role in ('Employee', 'Manager', 'Admin'))


class IsConsignee(BasePermission):
    """Allow access only to Consignee role users."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'Consignee'
        )


class IsStaff(IsEmployee):
    """Identical to IsEmployee. Staff floor (Employee, Manager, Admin)."""


class IsCustomer(BasePermission):
    """A website customer account: signed in, switched on, and in the Customer group.

    Not ``role == 'Customer'``: since 2026-10-15 (owner) every staff user is a website customer too, and their role
    stays their staff role (Customer is the lowest). This only opens the storefront's own pages (My holds, My
    messages); every staff gate checks the staff role, so a customer never gains staff access.
    """
    def has_permission(self, request, view):
        from apps.accounts.services.staff_customer import can_use_storefront

        user = request.user
        if not user or not user.is_authenticated or not user.is_active:
            return False
        # Since 2026-10-16 staff are not customers, but an active staff login still uses these pages.
        return can_use_storefront(user)


class IsSuperAdmin(BasePermission):
    """The owner (Django superuser), or a grant at Full for this area on People → Permissions (#53).

    Distinct from the old dashboard `Admin` role: a user in the `Admin` group with `is_superuser=False` and no grant is
    denied. For what may never be given away (changing permissions, View as), use ``IsOwner``.
    """
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return bool(user.is_superuser) or _granted(request, cat.FULL)


class IsOwner(BasePermission):
    """The owner only, never by a grant: changing levels and permissions."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)
