from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Allow access only to Admin role users."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'Admin'
        )


class IsManager(BasePermission):
    """Allow access only to Manager role users."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'Manager'
        )


class IsManagerOrAdmin(BasePermission):
    """Allow access to Manager or Admin role users."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ('Manager', 'Admin')
        )


class IsEmployee(BasePermission):
    """Allow access to Employee role users (or higher)."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ('Employee', 'Manager', 'Admin')
        )


class IsConsignee(BasePermission):
    """Allow access only to Consignee role users."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'Consignee'
        )


class IsStaff(BasePermission):
    """Allow access to any staff role (Employee, Manager, Admin)."""
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ('Employee', 'Manager', 'Admin')
        )


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
