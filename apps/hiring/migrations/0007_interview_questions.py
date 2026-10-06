"""Starter interview questions for the three roles (Phase 2 scorecard). Filled only where a role has none;
the owner edits them in the role or the careers JSON. The last one per role listens for a future lead."""
from django.db import migrations


def q(key, label):
    return {'key': key, 'label': label, 'type': 'text', 'required': False}


ONE_YEAR = q('one_year', 'If this goes well, where do you see yourself here in a year?')

QUESTIONS = {
    'retail-associate': [
        q('upset_customer', 'Tell me about a time a customer was upset. What did you do?'),
        q('three_things', 'You walk onto the floor and three things need doing at once. How do you pick what comes first?'),
        q('shoppable', 'What makes a store easy to shop? What would you fix first in ours?'),
        q('cash', 'Have you handled cash or a register? How do you make sure your drawer balances?'),
        q('saturday', 'Saturday is our busiest day. What does a great Saturday shift look like to you?'),
        ONE_YEAR,
    ],
    'processing-associate': [
        q('check_item', '(Hand them an item.) What would you check before you price this?'),
        q('accuracy', 'How do you stay accurate when you do the same task hundreds of times a day?'),
        q('own_mistake', 'Tell me about a time you caught a mistake in your own work. What did you do?'),
        q('new_software', 'Tell me about a time you had to learn new software or a new system fast.'),
        q('restoration_or_floor', 'When should an item go to restoration instead of straight to the floor?'),
        ONE_YEAR,
    ],
    'restoration-associate': [
        q('proud_fix', "Tell me about something you fixed or built that you're proud of."),
        q('lamp', "A lamp won't turn on. Walk me through how you'd figure out why."),
        q('tools', 'Which tools do you use most, and how do you keep them in order?'),
        q('unsafe', "How do you decide something isn't safe to sell?"),
        q('salvage', 'When would you pull parts from an item instead of repairing it?'),
        ONE_YEAR,
    ],
}


def fill(apps, schema_editor):
    Job = apps.get_model('hiring', 'Job')
    for slug, questions in QUESTIONS.items():
        job = Job.objects.filter(slug=slug).first()
        if job is not None and not job.interview_questions:
            job.interview_questions = questions
            job.save(update_fields=['interview_questions'])


class Migration(migrations.Migration):

    dependencies = [('hiring', '0006_interviews')]

    operations = [migrations.RunPython(fill, migrations.RunPython.noop)]
