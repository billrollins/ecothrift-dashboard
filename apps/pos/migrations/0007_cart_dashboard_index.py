from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0006_dashboarddepartmentgoal'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='cart',
            index=models.Index(fields=['status', 'completed_at'], name='cart_dash_completed_idx'),
        ),
    ]
