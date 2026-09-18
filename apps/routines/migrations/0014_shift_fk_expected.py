from django.db import migrations, models
import django.db.models.deletion


def seed_cashier(apps, schema_editor):
    from apps.routines.shift_seed import seed_cashier_shifts
    seed_cashier_shifts(apps=apps)


def seed_scoring_settings(apps, schema_editor):
    AppSetting = apps.get_model('core', 'AppSetting')
    rows = {
        'retail_qa.weight_spot': (60, 'Share of the week grade that comes from owner spot walks.'),
        'retail_qa.weight_do': (25, 'Share of the week grade that comes from routines done over expected.'),
        'retail_qa.weight_cross': (15, 'Share of the week grade that comes from cross-checks after the due date.'),
        'retail_qa.walk_floor': (3, 'Fewer than this many spot walks caps the week at B. Zero walks caps at C.'),
        'retail_qa.section_due_after_punch_minutes': (60, 'Minutes after an owner punches in before their section check is due.'),
        'retail_qa.idle_stretch_minutes': (20, 'Idle stretches longer than this are listed next to cashier names.'),
    }
    for key, (value, description) in rows.items():
        AppSetting.objects.get_or_create(
            key=key,
            defaults={'value': value, 'description': description},
        )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_appsettinghistory'),
        ('hr', '0008_shiftassignment_weekdays'),
        ('routines', '0013_command_center'),
    ]

    operations = [
        migrations.AddField(
            model_name='routine',
            name='shift',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='routines',
                to='hr.shift',
            ),
        ),
        migrations.AddField(
            model_name='routine',
            name='shift_locked',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='QaDayExpected',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField(unique=True)),
                ('expected', models.PositiveIntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-date'],
            },
        ),
        migrations.RunPython(seed_cashier, migrations.RunPython.noop),
        migrations.RunPython(seed_scoring_settings, migrations.RunPython.noop),
    ]
