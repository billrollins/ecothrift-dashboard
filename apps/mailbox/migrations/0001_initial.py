from django.db import migrations, models
import django.db.models.deletion


TEMPLATES = [
    {
        'key': 'hold_confirmed',
        'name': 'Hold confirmed',
        'subject': 'Hold confirmed: {{ listing_title }}',
        'html_body': (
            '<p>Hi {{ customer_name }},</p>'
            '<p>Your hold is confirmed for <strong>{{ listing_title }}</strong>.</p>'
            '<p>Pick up at {{ store_address }} by {{ pickup_by }}.</p>'
            '<p>View hold status: <a href="{{ hold_link }}">{{ hold_link }}</a></p>'
            '<p>Pay in store at pickup. No shipping, delivery, or online payment. '
            'Items are typically final sale.</p><p>— Eco-Thrift</p>'
        ),
    },
    {
        'key': 'hold_ready_for_pickup',
        'name': 'Hold ready for pickup',
        'subject': 'Ready for pickup: {{ listing_title }}',
        'html_body': (
            '<p>Hi {{ customer_name }},</p><p>Your hold for '
            '<strong>{{ listing_title }}</strong> is ready for pickup at {{ store_address }}.</p>'
            '<p>Please pick it up by {{ pickup_by }}. '
            '<a href="{{ hold_link }}">View hold status</a></p>'
        ),
    },
    {
        'key': 'hold_expiring_soon',
        'name': 'Hold expiring soon',
        'subject': 'Your hold expires soon: {{ listing_title }}',
        'html_body': (
            '<p>Hi {{ customer_name }},</p><p>Your hold for '
            '<strong>{{ listing_title }}</strong> expires {{ pickup_by }}.</p>'
            '<p><a href="{{ hold_link }}">View hold status</a></p>'
        ),
    },
    {
        'key': 'hold_declined',
        'name': 'Hold declined',
        'subject': 'Update about {{ listing_title }}',
        'html_body': (
            '<p>Hi {{ customer_name }},</p><p>We could not confirm your hold for '
            '<strong>{{ listing_title }}</strong>. Please reply if we can help find another item.</p>'
        ),
    },
    {
        'key': 'customer_question_reply',
        'name': 'Customer question reply',
        'subject': 'Re: {{ listing_title }}',
        'html_body': (
            '<p>Hi {{ customer_name }},</p><p></p><p>— {{ staff_name }}<br>Eco-Thrift</p>'
        ),
    },
]


def seed_templates(apps, schema_editor):
    EmailTemplate = apps.get_model('mailbox', 'EmailTemplate')
    AppSetting = apps.get_model('core', 'AppSetting')
    for values in TEMPLATES:
        EmailTemplate.objects.update_or_create(
            key=values['key'],
            defaults={**values, 'active': True},
        )
    AppSetting.objects.get_or_create(
        key='mailbox.email_signature',
        defaults={
            'value': '<p>— {{staff_name}}<br>Eco-Thrift<br>'
                     '8425 W Center Rd, Omaha, NE 68124</p>',
            'description': 'HTML signature appended to Microsoft Graph mailbox replies.',
        },
    )


def unseed_templates(apps, schema_editor):
    EmailTemplate = apps.get_model('mailbox', 'EmailTemplate')
    AppSetting = apps.get_model('core', 'AppSetting')
    EmailTemplate.objects.filter(key__in=[row['key'] for row in TEMPLATES]).delete()
    AppSetting.objects.filter(key='mailbox.email_signature').delete()


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('core', '0001_initial'),
        ('webstore', '0004_conversation_message'),
    ]

    operations = [
        migrations.CreateModel(
            name='EmailTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.SlugField(max_length=80, unique=True)),
                ('name', models.CharField(max_length=160)),
                ('subject', models.CharField(max_length=998)),
                ('html_body', models.TextField()),
                ('active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['name', 'key']},
        ),
        migrations.CreateModel(
            name='MailSyncState',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('singleton_key', models.CharField(default='inbox', max_length=20, unique=True)),
                ('last_sync_at', models.DateTimeField(blank=True, null=True)),
                ('delta_link', models.TextField(blank=True, default='')),
            ],
        ),
        migrations.CreateModel(
            name='MailMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('graph_message_id', models.CharField(max_length=512, unique=True)),
                ('graph_conversation_id', models.CharField(blank=True, db_index=True, default='', max_length=512)),
                ('from_email', models.EmailField(blank=True, db_index=True, default='', max_length=254)),
                ('to_emails', models.JSONField(blank=True, default=list)),
                ('subject', models.CharField(blank=True, default='', max_length=998)),
                ('html_body', models.TextField(blank=True, default='')),
                ('text_body', models.TextField(blank=True, default='')),
                ('received_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('is_read', models.BooleanField(default=False)),
                ('classification', models.CharField(
                    choices=[('online_sales', 'Online Sales'), ('general', 'General'), ('unknown', 'Unknown')],
                    db_index=True,
                    default='unknown',
                    max_length=20,
                )),
                ('attachment_names', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('conversation', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='mail_messages',
                    to='webstore.conversation',
                )),
            ],
            options={'ordering': ['-received_at', '-id']},
        ),
        migrations.RunPython(seed_templates, unseed_templates),
    ]
