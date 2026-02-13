from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import serializers
from .models import EmployeeProfile, ConsigneeProfile, CustomerProfile

User = get_user_model()


class EmployeeProfileSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True, default=None)
    work_location_name = serializers.CharField(source='work_location.name', read_only=True, default=None)

    termination_type_display = serializers.CharField(
        source='get_termination_type_display', read_only=True, default='',
    )

    class Meta:
        model = EmployeeProfile
        fields = [
            'id', 'employee_number', 'department', 'department_name',
            'position', 'employment_type', 'pay_rate', 'hire_date',
            'termination_date', 'termination_type', 'termination_type_display',
            'termination_notes', 'work_location', 'work_location_name',
            'emergency_name', 'emergency_phone', 'notes', 'created_at',
        ]
        read_only_fields = ['id', 'employee_number', 'created_at']


class ConsigneeProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsigneeProfile
        fields = [
            'id', 'consignee_number', 'commission_rate', 'payout_method',
            'status', 'join_date', 'notes', 'created_at',
        ]
        read_only_fields = ['id', 'consignee_number', 'created_at']


class CustomerProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerProfile
        fields = ['id', 'customer_number', 'customer_since', 'notes']
        read_only_fields = ['id', 'customer_number', 'customer_since']


class UserSerializer(serializers.ModelSerializer):
    """Full user serializer with nested profiles."""
    employee = EmployeeProfileSerializer(read_only=True)
    consignee = ConsigneeProfileSerializer(read_only=True)
    customer = CustomerProfileSerializer(read_only=True)
    role = serializers.CharField(read_only=True)
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'phone',
            'is_active', 'is_staff', 'date_joined', 'updated_at',
            'role', 'full_name',
            'employee', 'consignee', 'customer',
        ]
        read_only_fields = ['id', 'date_joined', 'updated_at']


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new users with role assignment."""
    password = serializers.CharField(write_only=True, min_length=6)
    role = serializers.ChoiceField(
        choices=['Admin', 'Manager', 'Employee', 'Consignee'],
        write_only=True,
    )
    # Optional employee profile fields
    department = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    position = serializers.CharField(write_only=True, required=False, default='')
    employment_type = serializers.ChoiceField(
        choices=['full_time', 'part_time', 'seasonal'],
        write_only=True, required=False, default='full_time',
    )
    pay_rate = serializers.DecimalField(
        max_digits=8, decimal_places=2, write_only=True, required=False, default=0,
    )
    hire_date = serializers.DateField(write_only=True, required=False)
    work_location = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    # Optional consignee fields
    commission_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, write_only=True, required=False, default=40.00,
    )
    payout_method = serializers.ChoiceField(
        choices=['cash', 'check', 'store_credit'],
        write_only=True, required=False, default='cash',
    )

    class Meta:
        model = User
        fields = [
            'email', 'first_name', 'last_name', 'phone', 'password', 'role',
            'department', 'position', 'employment_type', 'pay_rate',
            'hire_date', 'work_location',
            'commission_rate', 'payout_method',
        ]

    def create(self, validated_data):
        role = validated_data.pop('role')
        password = validated_data.pop('password')
        # Pop profile fields
        department = validated_data.pop('department', None)
        position = validated_data.pop('position', '')
        employment_type = validated_data.pop('employment_type', 'full_time')
        pay_rate = validated_data.pop('pay_rate', 0)
        hire_date = validated_data.pop('hire_date', None)
        work_location = validated_data.pop('work_location', None)
        commission_rate = validated_data.pop('commission_rate', 40.00)
        payout_method = validated_data.pop('payout_method', 'cash')

        # Set staff status for Admin/Manager/Employee
        if role in ('Admin', 'Manager', 'Employee'):
            validated_data['is_staff'] = True

        user = User.objects.create_user(password=password, **validated_data)

        # Assign group
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(group)

        # Create profiles based on role
        if role in ('Admin', 'Manager', 'Employee'):
            from django.utils import timezone
            EmployeeProfile.objects.create(
                user=user,
                employee_number=EmployeeProfile.generate_employee_number(),
                department_id=department,
                position=position,
                employment_type=employment_type,
                pay_rate=pay_rate,
                hire_date=hire_date or timezone.now().date(),
                work_location_id=work_location,
            )

        if role == 'Consignee':
            ConsigneeProfile.objects.create(
                user=user,
                consignee_number=ConsigneeProfile.generate_consignee_number(),
                commission_rate=commission_rate,
                payout_method=payout_method,
            )

        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating existing users."""
    role = serializers.ChoiceField(
        choices=['Admin', 'Manager', 'Employee', 'Consignee'],
        required=False,
    )

    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'phone', 'is_active', 'role']

    def update(self, instance, validated_data):
        role = validated_data.pop('role', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if role:
            # Remove all existing groups, add the new one
            instance.groups.clear()
            group, _ = Group.objects.get_or_create(name=role)
            instance.groups.add(group)

            # Set staff status
            instance.is_staff = role in ('Admin', 'Manager', 'Employee')
            instance.save(update_fields=['is_staff'])

            # Create employee profile if switching to staff role and doesn't have one
            if role in ('Admin', 'Manager', 'Employee') and not hasattr(instance, 'employee'):
                from django.utils import timezone
                EmployeeProfile.objects.create(
                    user=instance,
                    employee_number=EmployeeProfile.generate_employee_number(),
                    hire_date=timezone.now().date(),
                )

            # Create consignee profile if switching to Consignee and doesn't have one
            if role == 'Consignee' and not hasattr(instance, 'consignee'):
                ConsigneeProfile.objects.create(
                    user=instance,
                    consignee_number=ConsigneeProfile.generate_consignee_number(),
                )

        return instance


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField()
    new_password = serializers.CharField(min_length=6)
