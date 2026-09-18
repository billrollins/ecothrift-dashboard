from django.db import migrations, models
from django.utils.text import slugify


KNOWN = {
    'operations': ('Management', 'office', 'home', 3),
    'office': ('Management', 'office', 'home', 3),
    'management': ('Management', 'office', 'home', 3),
    'retail operations': ('Retail', 'retail-operations', 'cart', 0),
    'retail': ('Retail', 'retail-operations', 'cart', 0),
    'processing': ('Processing', 'processing', 'box', 1),
    'restoration': ('Restoration', 'restoration', 'tool', 2),
}


def backfill(apps, schema_editor):
    Department = apps.get_model('hr', 'Department')
    AppSetting = apps.get_model('core', 'AppSetting')
    used = set()
    next_sort = 4
    for row in Department.objects.order_by('id'):
        known = KNOWN.get(row.name.strip().lower())
        if known:
            name, slug, icon, sort = known
            row.name = name
            row.slug = slug
            row.icon = icon
            row.sort_order = sort
        else:
            slug = slugify(row.name) or f'department-{row.pk}'
            while slug in used:
                slug = f'{slug}-{row.pk}'
            row.slug = slug
            row.icon = 'none'
            row.sort_order = next_sort
            next_sort += 1
        used.add(row.slug)
        row.save(update_fields=['name', 'slug', 'icon', 'sort_order'])
    AppSetting.objects.get_or_create(
        key='retail_qa.program_department',
        defaults={
            'value': 'retail-operations',
            'description': 'Slug of the department the Retail QA program belongs to.',
        },
    )


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0009_assignment_empty_days'),
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='department',
            name='slug',
            field=models.SlugField(blank=True, db_index=False, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='department',
            name='icon',
            field=models.CharField(
                choices=[
                    ('cart', 'Cart'),
                    ('box', 'Box'),
                    ('tool', 'Tool'),
                    ('home', 'Home'),
                    ('tag', 'Tag'),
                    ('truck', 'Truck'),
                    ('none', 'None'),
                ],
                default='none',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='department',
            name='sort_order',
            field=models.IntegerField(default=0),
        ),
        migrations.AlterModelOptions(
            name='department',
            options={'ordering': ['sort_order', 'name']},
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='department',
            name='slug',
            field=models.SlugField(max_length=80, unique=True),
        ),
    ]
