"""Public bylines use the first name only, by owner request."""
from django.db import migrations, models


def shorten_author(apps, schema_editor):
    BlogPost = apps.get_model('blog', 'BlogPost')
    BlogPost.objects.filter(author_name='Bill Rollins').update(
        author_name='Bill', author_role='Owner',
    )
    BlogPost.objects.filter(author_role='Founder & CEO, Eco-Thrift').update(author_role='Owner')


def restore_author(apps, schema_editor):
    BlogPost = apps.get_model('blog', 'BlogPost')
    BlogPost.objects.filter(author_name='Bill').update(
        author_name='Bill Rollins', author_role='Founder & CEO, Eco-Thrift',
    )


class Migration(migrations.Migration):

    dependencies = [
        ('blog', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='blogpost',
            name='author_name',
            field=models.CharField(default='Bill', max_length=120),
        ),
        migrations.AlterField(
            model_name='blogpost',
            name='author_role',
            field=models.CharField(blank=True, default='Owner', max_length=160),
        ),
        migrations.RunPython(shorten_author, restore_author),
    ]
