"""The three roles from the owner's post (2026-10-06), and the AI purpose for Draft with AI.

The careers page stays hidden until the owner turns it on (careers file ``public: false``).
"""
from decimal import Decimal

from django.db import migrations

PAY_TEXT = 'From $15/hr, set by skill'

ROLES = [
    {
        'slug': 'retail-associate',
        'title': 'Retail Associate',
        'tagline': 'Make the store look amazing.',
        'summary': 'Stock, straighten, run the register and take care of customers.',
        'duties': ['Stock and straighten the floor', 'Run the register', 'Take care of customers'],
        'schedule': 'Saturdays preferred',
        'questions': [{
            'key': 'experience', 'label': "What's your experience with customers and running a register?",
            'type': 'long_text', 'required': True,
        }],
        'sort_order': 10,
    },
    {
        'slug': 'processing-associate',
        'title': 'Processing Associate',
        'tagline': 'Price our items with care.',
        'summary': "Sort incoming loads, check every item, then price and tag it so it's right when it hits the floor.",
        'duties': ['Sort incoming loads', 'Check every item', 'Price and tag it in our app'],
        'schedule': 'Typically Monday through Friday',
        'questions': [{
            'key': 'careful_fast', 'label': "You'll price hundreds of items a day in an app. What makes you careful and fast?",
            'type': 'long_text', 'required': True,
        }],
        'sort_order': 20,
    },
    {
        'slug': 'restoration-associate',
        'title': 'Restoration Associate',
        'tagline': 'Test, assemble, repair and salvage.',
        'summary': "Bring items back to life and pull usable parts from the ones that can't be saved.",
        'duties': ['Test and assemble items', 'Repair what can be fixed', "Salvage usable parts from what can't"],
        'schedule': 'Typically Monday through Friday',
        'questions': [{
            'key': 'fixed_built', 'label': 'What have you fixed, built or taken apart? What tools do you know how to use?',
            'type': 'long_text', 'required': True,
        }],
        'sort_order': 30,
    },
]


def seed(apps, schema_editor):
    Job = apps.get_model('hiring', 'Job')
    AiAction = apps.get_model('core', 'AiAction')
    for role in ROLES:
        Job.objects.get_or_create(slug=role['slug'], defaults={
            **{k: v for k, v in role.items() if k != 'slug'},
            'hours': 'Up to 40 hours a week',
            'employment_type': 'full_or_part',
            'pay_min': Decimal('15.00'),
            'pay_text': PAY_TEXT,
            'status': 'open',
        })
    AiAction.objects.get_or_create(
        purpose='HIRING_CAREERS',
        defaults={'label': 'Hiring: draft the careers page, form and jobs', 'modality': 'text', 'effort': 'low'},
    )


class Migration(migrations.Migration):

    dependencies = [
        ('hiring', '0001_initial'),
        ('core', '0011_ai_model_prices'),
    ]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
