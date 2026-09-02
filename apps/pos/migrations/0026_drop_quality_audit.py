# Drop QualityAudit / QualityAuditForm. Tables stay unused after this.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0025_qualityaudit_updated_at'),
    ]

    operations = [
        migrations.DeleteModel(name='QualityAudit'),
        migrations.DeleteModel(name='QualityAuditForm'),
    ]
