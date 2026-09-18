from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('hr', '0008_shiftassignment_weekdays'),
        ('routines', '0012_retail_qa_v2'),
    ]

    operations = [
        migrations.AddField(
            model_name='routinerun',
            name='unassign_key',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Keeps more than one unassigned per-person run unique for a day.',
                max_length=32,
            ),
        ),
        migrations.RemoveConstraint(
            model_name='routinerun',
            name='routines_run_period_pooled',
        ),
        migrations.AddConstraint(
            model_name='routinerun',
            constraint=models.UniqueConstraint(
                condition=models.Q(('assigned_to__isnull', True)),
                fields=('routine', 'period_key', 'unassign_key'),
                name='routines_run_period_pooled',
            ),
        ),
        migrations.CreateModel(
            name='QaCallIn',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('cleared', models.JSONField(blank=True, default=list, help_text='Runs this action unassigned, so a 10s undo can put them back.')),
                ('employee', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='qa_call_ins',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('marked_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='qa_call_ins_marked',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('shift', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='qa_call_ins',
                    to='hr.shift',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddConstraint(
            model_name='qacallin',
            constraint=models.UniqueConstraint(fields=('employee', 'date'), name='routines_qa_callin_person_day'),
        ),
        migrations.CreateModel(
            name='QaNudge',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('message', models.TextField(blank=True, default='')),
                ('created_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='qa_nudges',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('run', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='nudges',
                    to='routines.routinerun',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
