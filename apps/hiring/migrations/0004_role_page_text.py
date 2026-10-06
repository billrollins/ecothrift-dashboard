"""Fuller role pages for the three seeded roles (owner, 2026-10-06: "too simple", but not corporate).

About the role, What you'll do, What great looks like (from the 2024 job descriptions' performance
metrics), What we're looking for, Nice to have, The physical side, and who they work with (Bill, the
owner; one location, the Canfield store). A field the owner already changed in Dash is left alone:
summary and duties are replaced only if they still hold the seed text, and the new sections only fill
when empty.

Also adds the two optional lead questions to a saved careers form that doesn't have them yet.
"""
from django.db import migrations

WORKS_WITH = 'Bill, the owner, and a small team'

SEEDED = {
    'retail-associate': {
        'summary': 'Stock, straighten, run the register and take care of customers.',
        'duties': ['Stock and straighten the floor', 'Run the register', 'Take care of customers'],
    },
    'processing-associate': {
        'summary': "Sort incoming loads, check every item, then price and tag it so it's right when it hits the floor.",
        'duties': ['Sort incoming loads', 'Check every item', 'Price and tag it in our app'],
    },
    'restoration-associate': {
        'summary': "Bring items back to life and pull usable parts from the ones that can't be saved.",
        'duties': ['Test and assemble items', 'Repair what can be fixed', "Salvage usable parts from what can't"],
    },
}

TEXT = {
    'retail-associate': {
        'summary': (
            "You're the first thing customers see. A full, clean, easy-to-shop floor and a friendly register "
            "are what bring people back, and you make both happen."
        ),
        'duties': [
            'Keep the floor full, straight and easy to shop: restock, face shelves, move items to where they sell',
            'Put out new items from processing as they arrive, and build displays that sell',
            'Run the register: sales, Thrift+ members, holds and returns',
            'Set up customer deliveries and help load big items',
            'Help customers find things and answer their questions',
            'Keep the store clean and safe: clear aisles, handle spills and broken items right away',
            'Open or close the store with our checklist when scheduled',
            'Spot problems (a wrong price, a broken item, an empty section) and fix them or flag them',
        ],
        'success': [
            'The floor looks full and shoppable all day, not just after a restock',
            'Customers leave helped, and come back',
            'Your drawer balances at the end of every shift',
        ],
        'looking_for': [
            'You see what needs doing and do it without being told',
            'Friendly and patient, even on a busy Saturday',
            "Comfortable with a register and a phone app; we'll train you on ours",
            'On time, every shift',
        ],
        'nice_to_have': [
            'Retail or cash-handling experience',
            'You know your way around furniture, tools or electronics',
        ],
        'physical': [
            'On your feet for a full shift',
            'Lift and carry up to 50 lbs, with or without accommodation',
            'Bend, reach, use a step stool, and move furniture with a partner',
        ],
    },
    'processing-associate': {
        'summary': (
            "Every item on our floor goes through processing first. You decide what it is, whether it's all there, "
            "and what it should sell for. A good price is the difference between an item that sells this week and "
            "one that sits."
        ),
        'duties': [
            'Unload and sort incoming pallets and loads',
            'Check every item: complete, working, damaged?',
            'Look it up and price it in our app from its retail price, condition and what similar items sold for',
            'Print and attach tags, and send items to the floor or to restoration',
            'Pull items that need testing or repair for the restoration team',
            'Label and store items so they are easy to find',
            'Keep the processing area organized and the work moving, hundreds of items a day',
        ],
        'success': [
            'A steady count of items every shift, with very few pricing or tag mistakes',
            'Items priced to sell: they move in weeks, not months',
            'Nothing sits in processing without a reason',
        ],
        'looking_for': [
            'Careful and fast: a steady pace without missing details',
            'Quick to learn software on a computer, tablet or phone',
            'A good eye for condition and value: new vs. used, complete vs. missing parts',
            'You keep going without waiting to be told the next step',
        ],
        'nice_to_have': [
            'Reselling experience (eBay, Facebook Marketplace)',
            'Retail pricing or warehouse work',
        ],
        'physical': [
            'On your feet most of the shift',
            'Lift up to 50 lbs, with or without accommodation',
            'Bend, reach, and use a step stool or ladder',
            'Work with boxes, pallets and a pallet jack (we train you)',
        ],
    },
    'restoration-associate': {
        'summary': (
            'This is where "another chance for everything" happens. Items that arrive broken, untested or in a box '
            "come to you. You bring them back to life, or pull the good parts from the ones that can't be saved, so "
            'less ends up in the landfill.'
        ),
        'duties': [
            "Test electronics, appliances and tools, and log what works and what doesn't",
            'Assemble furniture and flat-pack items',
            'Repair what can be fixed: replace parts, clean, tighten, touch up',
            'Salvage usable parts and keep the parts shelf organized',
            'Work through the restoration queue in Dash, logging every job',
            "Flag anything that isn't safe to sell",
            'Keep the bench clean and safe, with every tool back in its place',
            'Help with small fixes around the store when needed',
        ],
        'success': [
            'More value restored every week: items that sell for more because of your work',
            'Fixes that stay fixed',
            'A clean, safe bench, and you suggest better ways to do the work',
        ],
        'looking_for': [
            "Hands-on: you've fixed, built or taken things apart, at work or at home",
            'Comfortable and safe with basic hand and power tools',
            "A patient troubleshooter who wants to know why it doesn't work",
            "Honest about what's safe to sell",
        ],
        'nice_to_have': [
            'Small-appliance or electronics repair',
            'Using a multimeter',
            'Furniture assembly',
        ],
        'physical': [
            'Standing at a bench',
            'Lift up to 50 lbs, with or without accommodation',
            'Bend, stoop, reach, and use a step stool or ladder',
            'Working with hand and power tools, some dust and noise',
        ],
    },
}

LEAD_QUESTIONS = [
    {'key': 'lead_interest', 'label': 'Down the road, would you like to lead your area?', 'type': 'choice',
     'required': False, 'options': ['Yes', 'Maybe', 'No, I just want to do great work']},
    {'key': 'led_before', 'label': 'Have you led a team, trained someone, or run something on your own? Tell us about it.',
     'type': 'long_text', 'required': False},
]


def fill_roles(apps, schema_editor):
    Job = apps.get_model('hiring', 'Job')
    for slug, text in TEXT.items():
        job = Job.objects.filter(slug=slug).first()
        if job is None:
            continue
        seeded = SEEDED[slug]
        changed = []
        for key in ('summary', 'duties'):
            if getattr(job, key) == seeded[key]:
                setattr(job, key, text[key])
                changed.append(key)
        for key in ('success', 'looking_for', 'nice_to_have', 'physical'):
            if not getattr(job, key):
                setattr(job, key, text[key])
                changed.append(key)
        if not job.works_with:
            job.works_with = WORKS_WITH
            changed.append('works_with')
        if changed:
            job.save(update_fields=changed)


def add_lead_questions(apps, schema_editor):
    """A saved form keeps its own question list; add the lead questions before "How did you hear"."""
    AppSetting = apps.get_model('core', 'AppSetting')
    row = AppSetting.objects.filter(key='hiring.careers').first()
    if row is None or not isinstance(row.value, dict):
        return  # No saved form yet: the defaults already carry them.
    form = row.value.get('form') or {}
    questions = list(form.get('questions') or [])
    if not questions:
        return
    have = {q.get('key') for q in questions if isinstance(q, dict)}
    missing = [q for q in LEAD_QUESTIONS if q['key'] not in have]
    if not missing:
        return
    at = next((i for i, q in enumerate(questions) if isinstance(q, dict) and q.get('after_roles')), len(questions))
    questions[at:at] = missing
    row.value = {**row.value, 'form': {**form, 'questions': questions}}
    row.save(update_fields=['value'])


def run(apps, schema_editor):
    fill_roles(apps, schema_editor)
    add_lead_questions(apps, schema_editor)


class Migration(migrations.Migration):

    dependencies = [('hiring', '0003_role_sections'), ('core', '0011_ai_model_prices')]

    operations = [migrations.RunPython(run, migrations.RunPython.noop)]
