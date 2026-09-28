"""
Security fix (2026-09-25): staff endpoints that checked only IsAuthenticated also let online-store
customers in, because a customer's sign-in gives the same kind of JWT as staff. Gate them on
IsTeamMember (employee, manager, admin, or superuser). Also count Heroku's one proxy, so IP
throttles read the real client address instead of a spoofable X-Forwarded-For.

Idempotent: ``python scripts/security/team_member_gates.py [repo root]``. It is used on the
working tree and on the ship tree, so both get exactly the same change.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')


def edit(rel: str, pairs: list[tuple[str, str]]) -> None:
    p = ROOT / rel
    s = p.read_text(encoding='utf-8')
    for old, new in pairs:
        if new in s:
            continue
        assert s.count(old) == 1, (rel, s.count(old), old[:70])
        s = s.replace(old, new)
    with open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(s)
    print('ok', rel)


def gate(decorator: str, name: str) -> tuple[str, str]:
    return (f"{decorator}([IsAuthenticated])\ndef {name}(request):",
            f"{decorator}([IsAuthenticated, IsTeamMember])\ndef {name}(request):")


edit('apps/accounts/permissions.py', [(
    'class IsConsignee(BasePermission):',
    '''class IsTeamMember(BasePermission):
    """Employee, Manager or Admin, or any superuser. For staff endpoints that only checked sign-in:
    online-store customers sign in with the same kind of token, so IsAuthenticated alone lets them in."""
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return bool(user.is_superuser or user.role in ('Employee', 'Manager', 'Admin'))


class IsConsignee(BasePermission):''',
)])

edit('apps/pos/views.py', [
    ('from apps.accounts.permissions import IsManagerOrAdmin, IsStaff, IsEmployee, IsSuperAdmin\n',
     'from apps.accounts.permissions import IsManagerOrAdmin, IsStaff, IsEmployee, IsSuperAdmin, IsTeamMember\n'),
    gate('@perm_classes', 'sale_mode'),
    gate('@perm_classes', 'dashboard_metrics'),
    gate('@perm_classes', 'dashboard_alerts'),
    gate('@perm_classes', 'dashboard_sales_goal'),
    gate('@perm_classes', 'dashboard_department_goals'),
])

edit('apps/core/views.py', [
    ('from apps.accounts.permissions import IsManagerOrAdmin, IsStaff, IsSuperAdmin\n',
     'from apps.accounts.permissions import IsManagerOrAdmin, IsStaff, IsSuperAdmin, IsTeamMember\n'),
    gate('@permission_classes', 'print_server_version'),
    gate('@permission_classes', 'print_server_releases'),
])

p = ROOT / 'apps/ai/views.py'
s = p.read_text(encoding='utf-8')
if 'IsTeamMember' not in s:
    assert s.count('    permission_classes = [IsAuthenticated]\n') == 2, 'ai views changed'
    s = s.replace('    permission_classes = [IsAuthenticated]\n', '    permission_classes = [IsAuthenticated, IsTeamMember]\n')
    first = s.index('from rest_framework')
    s = s[:first] + 'from apps.accounts.permissions import IsTeamMember\n' + s[first:]
    with open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(s)
print('ok apps/ai/views.py')

p = ROOT / 'ecothrift/settings_production.py'
s = p.read_text(encoding='utf-8')
if 'NUM_PROXIES' not in s:
    s = s.rstrip('\n') + """

# Heroku's router is the one proxy in front of us: DRF throttles then key on the client address it
# appends, not on a client-supplied X-Forwarded-For (security fix, 2026-09-25).
REST_FRAMEWORK = {**REST_FRAMEWORK, 'NUM_PROXIES': 1}  # noqa: F405
"""
    with open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(s)
print('ok ecothrift/settings_production.py')
