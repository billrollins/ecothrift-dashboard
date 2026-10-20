from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Allow access only to Admin role users."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'Admin'
        )


class IsManagerOrAdmin(BasePermission):
    """Allow access to Manager or Admin role users, and to any superuser."""
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        return user.role in ('Manager', 'Admin')


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
    """Allow access only to Django superusers (the "Super Admin").

    Distinct from the dashboard `Admin` role: this gates owner-only tooling such as the
    Blog Studio. A user with the `Admin` group but `is_superuser=False` is denied.
    """
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_superuser
        )
