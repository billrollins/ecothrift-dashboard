from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('webstore', '0011_reservation_pickup_code'),
    ]

    operations = [
        migrations.CreateModel(
            name='HoldConfirmation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(max_length=254)),
                ('code_hash', models.CharField(max_length=64)),
                ('token_hash', models.CharField(max_length=64, unique=True)),
                ('expires_at', models.DateTimeField()),
                ('attempts', models.PositiveSmallIntegerField(default=0)),
                ('confirmed_at', models.DateTimeField(blank=True, null=True)),
                ('confirmed_via', models.CharField(blank=True, default='', max_length=8)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('reservation', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='confirmations',
                    to='webstore.reservation',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='holdconfirmation',
            index=models.Index(
                fields=['reservation', 'confirmed_at', 'expires_at'],
                name='webstore_ho_reserva_7c8a1e_idx',
            ),
        ),
    ]
