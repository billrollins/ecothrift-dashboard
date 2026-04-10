# Generated manually for Phase 5 fee/shipping overrides

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("buying", "0009_phase5_auction_valuation"),
    ]

    operations = [
        migrations.AddField(
            model_name="auction",
            name="fees_override",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Optional user override for fees in dollars; else fee rate times current price.",
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="auction",
            name="shipping_override",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Optional user override for shipping in dollars; else shipping rate times current price.",
                max_digits=12,
                null=True,
            ),
        ),
    ]
