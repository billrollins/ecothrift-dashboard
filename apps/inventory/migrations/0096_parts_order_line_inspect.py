from django.db import migrations, models


def _issue_to_issues(apps, schema_editor):
    Line = apps.get_model('inventory', 'RestorationPartsOrderLine')
    Line.objects.filter(inspect_verdict='issue').update(inspect_verdict='issues')


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0095_parts_order_line_review'),
    ]

    operations = [
        migrations.RenameField(
            model_name='restorationpartsorderline',
            old_name='review_result',
            new_name='inspect_verdict',
        ),
        migrations.RenameField(
            model_name='restorationpartsorderline',
            old_name='review_note',
            new_name='inspect_note',
        ),
        migrations.AlterField(
            model_name='restorationpartsorderline',
            name='inspect_verdict',
            field=models.CharField(blank=True, default='', max_length=16),
        ),
        migrations.RunPython(_issue_to_issues, migrations.RunPython.noop),
    ]
