from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, EmployeeProfile, ConsigneeProfile, CustomerProfile


class EmployeeProfileInline(admin.StackedInline):
    model = EmployeeProfile
    can_delete = False
    extra = 0


class ConsigneeProfileInline(admin.StackedInline):
    model = ConsigneeProfile
    can_delete = False
    extra = 0


class CustomerProfileInline(admin.StackedInline):
    model = CustomerProfile
    can_delete = False
    extra = 0


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('email', 'first_name', 'last_name', 'role', 'is_active', 'is_staff')
    list_filter = ('is_active', 'is_staff', 'groups')
    search_fields = ('email', 'first_name', 'last_name')
    ordering = ('email',)
    inlines = [EmployeeProfileInline, ConsigneeProfileInline, CustomerProfileInline]

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal Info', {'fields': ('first_name', 'last_name', 'phone')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'first_name', 'last_name', 'password1', 'password2'),
        }),
    )
