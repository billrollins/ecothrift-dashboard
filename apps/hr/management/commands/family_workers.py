"""Family workers (Dash Update #121, Bill 2026-11-12): add Raylan and Sawyer Rollins, and take every Rollins off payroll.

Dry run by default: it prints what it would do and changes nothing. ``--apply`` does it.

    python manage.py family_workers --raylan-email ... --sawyer-email ...            # dry run
    python manage.py family_workers --raylan-email ... --sawyer-email ... --apply    # do it

What it does:
- Bill (``--bill-id``, default 1) and Carrie (``--carrie-id``, default 2): checked to be active Rollins staff with an
  employee record. Carrie becomes Full time. Both: paid $0, off payroll.
- Raylan and Sawyer: created as Employees when missing (found by email), As needed, paid $0, off payroll, hired today.
  No password: the owner sends each a Set password link from Users → Employees. A name with no email is skipped.
- Emergency contact: Carrie on Bill, Raylan and Sawyer (``--carrie-phone``, else the phone on her login), replacing
  what was there and saying so. Carrie's own login (email, phone) is never changed.
- Every other active staff Rollins with an employee record: off payroll ("No Rollins is on payroll").

It never guesses an email or a phone, and never changes anyone who is not a Rollins.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import AccountEvent, EmployeeProfile

User = get_user_model()
FAMILY = 'Rollins'


class Command(BaseCommand):
    help = 'Add Raylan and Sawyer Rollins and take every Rollins off payroll (dry run unless --apply).'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Make the changes (default: dry run).')
        parser.add_argument('--bill-id', type=int, default=1)
        parser.add_argument('--carrie-id', type=int, default=2)
        parser.add_argument('--carrie-phone', default='', help="Emergency phone, if Carrie's login has none.")
        for name in ('raylan', 'sawyer'):
            parser.add_argument(f'--{name}-email', default='', help=f'{name.title()}\'s sign-in email (required to add).')
            parser.add_argument(f'--{name}-phone', default='')

    def handle(self, *args, **opts):
        apply = opts['apply']
        lines: list[str] = []
        with transaction.atomic():
            self._run(opts, lines)
            if not apply:
                transaction.set_rollback(True)
        head = 'APPLIED' if apply else 'DRY RUN (nothing changed; add --apply)'
        self.stdout.write(head)
        for line in lines:
            self.stdout.write(f'  {line}')

    # ── helpers ──────────────────────────────────────────────────────────────────────────────
    def _family_member(self, pk: int, first: str) -> User:
        user = User.objects.filter(pk=pk).select_related('employee').first()
        if user is None or user.last_name.strip().lower() != FAMILY.lower() or user.first_name.strip().lower() != first:
            raise CommandError(f'User {pk} is not {first.title()} {FAMILY}. Pass the right --{first}-id.')
        if not hasattr(user, 'employee'):
            raise CommandError(f'{user.full_name} (user {pk}) has no employee record.')
        return user

    @staticmethod
    def _digits(phone: str) -> str:
        return ''.join(ch for ch in phone if ch.isdigit())

    def _set(self, profile: EmployeeProfile, lines: list[str], **changes) -> None:
        said = []
        for field, value in changes.items():
            if getattr(profile, field) != value:
                said.append(f'{field} {getattr(profile, field)!r} -> {value!r}')
                setattr(profile, field, value)
        if said:
            profile.save(update_fields=list(changes))
            lines.append(f'{profile.user.full_name} ({profile.employee_number}): ' + '; '.join(said))
        else:
            lines.append(f'{profile.user.full_name} ({profile.employee_number}): already right')

    def _emergency(self, profile: EmployeeProfile, carrie: User, phone: str, lines: list[str]) -> None:
        """Carrie is the family's emergency contact (Bill 2026-11-13): set on Bill, Raylan and Sawyer, saying what
        it replaces."""
        if not phone:
            phone = profile.emergency_phone if profile.emergency_name.strip() == carrie.full_name else ''
        if (profile.emergency_name, profile.emergency_phone) == (carrie.full_name, phone):
            lines.append(f'{profile.user.full_name}: emergency contact already {carrie.full_name}')
            return
        was = f' (was {profile.emergency_name or "none"}{", another phone" if profile.emergency_phone else ""})'
        profile.emergency_name = carrie.full_name
        profile.emergency_phone = phone
        profile.save(update_fields=['emergency_name', 'emergency_phone'])
        lines.append(f'{profile.user.full_name}: emergency contact -> {carrie.full_name}{was}'
                     + ('' if phone else ' (no phone: pass --carrie-phone)'))

    def _create(self, first: str, email: str, phone: str, lines: list[str]) -> User | None:
        email = (email or '').strip().lower()
        found = (User.objects.filter(first_name__iexact=first, last_name__iexact=FAMILY, employee__isnull=False)
                 .select_related('employee').first())
        if found is not None:
            lines.append(f'{found.full_name}: already a staff login (user {found.pk}, {found.employee.employee_number})')
            return found
        if not email:
            lines.append(f'{first.title()} {FAMILY}: SKIPPED, no --{first}-email given (never guessed)')
            return None
        clash = User.objects.filter(email__iexact=email).first()
        if clash is not None:
            raise CommandError(f'{email} already belongs to {clash.full_name} (user {clash.pk}, role {clash.role}). '
                               'Merge that login (People → login merge) or pass another email.')
        from apps.accounts.services.usernames import assign_username

        user = User.objects.create_user(email=email, first_name=first.title(), last_name=FAMILY, password=None,
                                        phone=self._digits(phone), is_staff=True)
        user.groups.add(Group.objects.get_or_create(name='Employee')[0])
        assign_username(user)
        EmployeeProfile.objects.create(
            user=user, employee_number=EmployeeProfile.generate_employee_number(), employment_type='as_needed',
            pay_rate=0, on_payroll=False, hire_date=timezone.localdate(),
        )
        AccountEvent.log(user, AccountEvent.KIND_CREATED, detail=f'Employee {user.username or email} (family_workers)')
        user.refresh_from_db()
        lines.append(f'{user.full_name}: CREATED user {user.pk}, {user.employee.employee_number}, username '
                     f'{user.username}, Employee, As needed, $0, off payroll, no password yet')
        return user

    # ── the run ──────────────────────────────────────────────────────────────────────────────
    def _run(self, opts, lines: list[str]) -> None:
        bill = self._family_member(opts['bill_id'], 'bill')
        carrie = self._family_member(opts['carrie_id'], 'carrie')
        carrie_phone = self._digits(opts['carrie_phone'] or carrie.phone or '')

        self._set(bill.employee, lines, pay_rate=0, on_payroll=False)
        self._set(carrie.employee, lines, employment_type='full_time', pay_rate=0, on_payroll=False)

        kids = [self._create(name, opts[f'{name}_email'], opts[f'{name}_phone'], lines) for name in ('raylan', 'sawyer')]
        for kid in kids:
            if kid is not None:
                self._set(kid.employee, lines, employment_type='as_needed', pay_rate=0, on_payroll=False)

        for person in [bill, *[k for k in kids if k is not None]]:
            self._emergency(person.employee, carrie, carrie_phone, lines)

        done = {bill.pk, carrie.pk, *[k.pk for k in kids if k is not None]}
        others = (EmployeeProfile.objects.filter(user__last_name__iexact=FAMILY, user__is_active=True)
                  .exclude(user_id__in=done).select_related('user'))
        for profile in others:
            self._set(profile, lines, on_payroll=False)
