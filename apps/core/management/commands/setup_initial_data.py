"""
Management command to seed the database with initial data.
Idempotent — safe to run multiple times.
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils import timezone

User = get_user_model()


class Command(BaseCommand):
    help = 'Seed the database with initial configuration data'

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING('Setting up initial data...'))
        self.stdout.write('')

        self._create_groups()
        admin_user = self._create_admin_user()
        location = self._create_work_location()
        department = self._create_department(location, admin_user)
        self._create_employee_profile(admin_user, department, location)
        self._create_registers(location)
        self._create_supplemental_drawer(location, admin_user)
        self._create_sick_leave_balance(admin_user)
        self._create_app_settings()

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('Initial data setup complete!'))

    def _create_groups(self):
        self.stdout.write(self.style.MIGRATE_HEADING('Creating groups...'))
        for name in ['Admin', 'Manager', 'Employee', 'Consignee']:
            group, created = Group.objects.get_or_create(name=name)
            status = 'Created' if created else 'Already exists'
            self.stdout.write(f'  {status}: Group "{name}"')

    def _create_admin_user(self):
        self.stdout.write(self.style.MIGRATE_HEADING('Creating admin user...'))
        email = 'bill_rollins@ecothrift.us'
        try:
            user = User.objects.get(email=email)
            self.stdout.write(f'  Already exists: User "{email}"')
        except User.DoesNotExist:
            user = User.objects.create_superuser(
                email=email,
                first_name='Bill',
                last_name='Rollins',
                password='JAckel13',
            )
            self.stdout.write(f'  Created: User "{email}"')

        # Add to Admin group
        admin_group = Group.objects.get(name='Admin')
        if admin_group not in user.groups.all():
            user.groups.add(admin_group)
            self.stdout.write('  Added to Admin group')

        return user

    def _create_work_location(self):
        from apps.core.models import WorkLocation

        self.stdout.write(self.style.MIGRATE_HEADING('Creating work location...'))
        location, created = WorkLocation.objects.get_or_create(
            name='Omaha - Canfield',
            defaults={
                'address': '8425 West Center Road, Omaha NE 68124',
                'phone': '(402) 881-9861',
                'timezone': 'America/Chicago',
                'is_active': True,
            },
        )
        status = 'Created' if created else 'Already exists'
        self.stdout.write(f'  {status}: WorkLocation "Omaha - Canfield"')
        return location

    def _create_department(self, location, manager):
        from apps.hr.models import Department

        self.stdout.write(self.style.MIGRATE_HEADING('Creating department...'))
        dept, created = Department.objects.get_or_create(
            name='Operations',
            defaults={
                'description': 'Store operations and management',
                'location': location,
                'manager': manager,
                'is_active': True,
            },
        )
        status = 'Created' if created else 'Already exists'
        self.stdout.write(f'  {status}: Department "Operations"')
        return dept

    def _create_employee_profile(self, user, department, location):
        from apps.accounts.models import EmployeeProfile

        self.stdout.write(self.style.MIGRATE_HEADING('Creating employee profile...'))
        profile, created = EmployeeProfile.objects.get_or_create(
            user=user,
            defaults={
                'employee_number': 'EMP-001',
                'department': department,
                'position': 'Owner',
                'employment_type': 'full_time',
                'pay_rate': 20.00,
                'hire_date': '2022-06-01',
                'work_location': location,
            },
        )
        status = 'Created' if created else 'Already exists'
        self.stdout.write(f'  {status}: EmployeeProfile "{profile.employee_number}"')

    def _create_registers(self, location):
        from apps.pos.models import Register

        self.stdout.write(self.style.MIGRATE_HEADING('Creating registers...'))
        starting_breakdown = {
            'hundreds': 0, 'fifties': 0, 'twenties': 4, 'tens': 4,
            'fives': 8, 'ones': 40, 'quarters': 40, 'dimes': 50,
            'nickels': 40, 'pennies': 50,
        }

        for name, code in [('Register 1', 'REG-01'), ('Register 2', 'REG-02')]:
            reg, created = Register.objects.get_or_create(
                code=code,
                defaults={
                    'location': location,
                    'name': name,
                    'starting_cash': 200.00,
                    'starting_breakdown': starting_breakdown,
                    'is_active': True,
                },
            )
            status = 'Created' if created else 'Already exists'
            self.stdout.write(f'  {status}: Register "{name}"')

    def _create_supplemental_drawer(self, location, user):
        from apps.pos.models import SupplementalDrawer

        self.stdout.write(self.style.MIGRATE_HEADING('Creating supplemental drawer...'))
        drawer, created = SupplementalDrawer.objects.get_or_create(
            location=location,
            defaults={
                'current_balance': {
                    'hundreds': 0, 'fifties': 2, 'twenties': 5, 'tens': 10,
                    'fives': 20, 'ones': 50, 'quarters': 80, 'dimes': 100,
                    'nickels': 80, 'pennies': 100,
                },
                'current_total': 500.00,
                'last_counted_by': user,
                'last_counted_at': timezone.now(),
            },
        )
        status = 'Created' if created else 'Already exists'
        self.stdout.write(f'  {status}: SupplementalDrawer')

    def _create_sick_leave_balance(self, user):
        from apps.hr.models import SickLeaveBalance

        self.stdout.write(self.style.MIGRATE_HEADING('Creating sick leave balance...'))
        balance, created = SickLeaveBalance.objects.get_or_create(
            employee=user,
            year=timezone.now().year,
            defaults={
                'hours_earned': 0,
                'hours_used': 0,
            },
        )
        status = 'Created' if created else 'Already exists'
        self.stdout.write(f'  {status}: SickLeaveBalance for {user.email} ({timezone.now().year})')

    def _create_app_settings(self):
        from apps.core.models import AppSetting

        self.stdout.write(self.style.MIGRATE_HEADING('Creating app settings...'))
        settings_data = [
            ('tax_rate', 0.07, 'Sales tax rate (7.0% for Omaha, NE)'),
            ('store_name', 'Eco-Thrift', 'Business name'),
            ('store_address', '8425 West Center Road, Omaha NE 68124', 'Store address'),
            ('store_phone', '(402) 881-9861', 'Store phone'),
            ('receipt_header', 'ECO-THRIFT', 'Text at top of receipts'),
            ('receipt_footer', 'Thank you for shopping!', 'Text at bottom of receipts'),
        ]

        for key, value, description in settings_data:
            setting, created = AppSetting.objects.get_or_create(
                key=key,
                defaults={'value': value, 'description': description},
            )
            status = 'Created' if created else 'Already exists'
            self.stdout.write(f'  {status}: AppSetting "{key}"')
