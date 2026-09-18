import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('hr', '0006_timeentry_shift_office'),
    ]

    operations = [
        migrations.CreateModel(
            name='Shift',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=80)),
                ('time_in', models.TimeField()),
                ('time_out', models.TimeField()),
                ('weekdays', models.JSONField(default=list, help_text='0=Mon … 6=Sun. Empty means every open day.')),
                ('punch_code', models.CharField(blank=True, default='', help_text='Optional clock-in tile this roster row matches.', max_length=20)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('department', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='shifts',
                    to='hr.department',
                )),
            ],
            options={
                'ordering': ['department__name', 'time_in', 'name'],
            },
        ),
        migrations.AddConstraint(
            model_name='shift',
            constraint=models.UniqueConstraint(fields=('department', 'name'), name='hr_shift_dept_name'),
        ),
        migrations.CreateModel(
            name='ShiftAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('employee', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='shift_assignments',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('shift', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='assignments',
                    to='hr.shift',
                )),
            ],
            options={
                'ordering': ['shift__time_in', 'employee__last_name'],
            },
        ),
        migrations.AddConstraint(
            model_name='shiftassignment',
            constraint=models.UniqueConstraint(fields=('employee', 'shift'), name='hr_shift_assignment_unique'),
        ),
    ]
