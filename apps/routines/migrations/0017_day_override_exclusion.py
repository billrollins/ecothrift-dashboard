from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('hr', '0008_shiftassignment_weekdays'),
        ('routines', '0016_section_check_weekdays'),
    ]

    operations = [
        migrations.CreateModel(
            name='QaDayOverride',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('time_in', models.TimeField(blank=True, null=True)),
                ('time_out', models.TimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('employee', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='qa_day_overrides',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('marked_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='qa_day_overrides_marked',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('shift', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='qa_day_overrides',
                    to='hr.shift',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='QaDayExclusion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('employee', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='qa_day_exclusions',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('marked_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='qa_day_exclusions_marked',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='qadayoverride',
            constraint=models.UniqueConstraint(
                fields=('employee', 'date', 'shift'),
                name='routines_qa_override_person_day_shift',
            ),
        ),
        migrations.AddConstraint(
            model_name='qadayexclusion',
            constraint=models.UniqueConstraint(
                fields=('employee', 'date'),
                name='routines_qa_exclusion_person_day',
            ),
        ),
    ]
