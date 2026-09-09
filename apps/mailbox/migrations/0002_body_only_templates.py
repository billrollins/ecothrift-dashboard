from django.db import migrations

# Previous greeting + sign-off bodies from 0001 (for reverse).
OLD_BODIES = {
    'hold_confirmed': (
        '<p>Hi {{ customer_name }},</p>'
        '<p>Your hold is confirmed for <strong>{{ listing_title }}</strong>.</p>'
        '<p>Pick up at {{ store_address }} by {{ pickup_by }}.</p>'
        '<p>View hold status: <a href="{{ hold_link }}">{{ hold_link }}</a></p>'
        '<p>Pay in store at pickup. No shipping, delivery, or online payment. '
        'Items are typically final sale.</p><p>- Eco-Thrift</p>'
    ),
    'hold_ready_for_pickup': (
        '<p>Hi {{ customer_name }},</p><p>Your hold for '
        '<strong>{{ listing_title }}</strong> is ready for pickup at {{ store_address }}.</p>'
        '<p>Please pick it up by {{ pickup_by }}. '
        '<a href="{{ hold_link }}">View hold status</a></p>'
    ),
    'hold_expiring_soon': (
        '<p>Hi {{ customer_name }},</p><p>Your hold for '
        '<strong>{{ listing_title }}</strong> expires {{ pickup_by }}.</p>'
        '<p><a href="{{ hold_link }}">View hold status</a></p>'
    ),
    'hold_declined': (
        '<p>Hi {{ customer_name }},</p><p>We could not confirm your hold for '
        '<strong>{{ listing_title }}</strong>. Please reply if we can help find another item.</p>'
    ),
    'customer_question_reply': (
        '<p>Hi {{ customer_name }},</p><p></p><p>- {{ staff_name }}<br>Eco-Thrift</p>'
    ),
}

NEW_BODIES = {
    'hold_confirmed': (
        '<p>Your hold is confirmed for <strong>{{ listing_title }}</strong>.</p>'
        '<p>Pick up at {{ store_address }} by {{ pickup_by }}.</p>'
        '<p>View hold status: <a href="{{ hold_link }}">{{ hold_link }}</a></p>'
        '<p>Pay in store at pickup. No shipping, delivery, or online payment. '
        'Items are typically final sale.</p>'
    ),
    'hold_ready_for_pickup': (
        '<p>Your hold for <strong>{{ listing_title }}</strong> is ready '
        'for pickup at {{ store_address }}.</p>'
        '<p>Please pick it up by {{ pickup_by }}. '
        '<a href="{{ hold_link }}">View hold status</a></p>'
    ),
    'hold_expiring_soon': (
        '<p>Your hold for <strong>{{ listing_title }}</strong> expires {{ pickup_by }}.</p>'
        '<p><a href="{{ hold_link }}">View hold status</a></p>'
    ),
    'hold_declined': (
        '<p>We could not confirm your hold for '
        '<strong>{{ listing_title }}</strong>. Please reply if we can help find another item.</p>'
    ),
    'customer_question_reply': '<p></p>',
}


def rewrite_bodies(apps, schema_editor):
    EmailTemplate = apps.get_model('mailbox', 'EmailTemplate')
    for key, html_body in NEW_BODIES.items():
        EmailTemplate.objects.filter(key=key).update(html_body=html_body)


def restore_bodies(apps, schema_editor):
    EmailTemplate = apps.get_model('mailbox', 'EmailTemplate')
    for key, html_body in OLD_BODIES.items():
        EmailTemplate.objects.filter(key=key).update(html_body=html_body)


class Migration(migrations.Migration):
    dependencies = [
        ('mailbox', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(rewrite_bodies, restore_bodies),
    ]
