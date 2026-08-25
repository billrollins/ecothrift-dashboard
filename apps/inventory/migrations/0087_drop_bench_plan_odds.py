from django.db import migrations


def drop_bench_plan_odds(apps, schema_editor):
    RestorationJob = apps.get_model('inventory', 'RestorationJob')
    for job in RestorationJob.objects.iterator():
        session = job.work_session
        if not isinstance(session, dict):
            continue
        plan = session.get('benchPlan')
        if not isinstance(plan, dict):
            continue
        estimates = plan.get('estimates')
        if not isinstance(estimates, dict):
            continue
        new_estimates = {}
        changed = False
        for grade, estimate in estimates.items():
            if isinstance(estimate, dict) and 'p' in estimate:
                new_estimates[grade] = {key: value for key, value in estimate.items() if key != 'p'}
                changed = True
            else:
                new_estimates[grade] = estimate
        if not changed:
            continue
        job.work_session = {
            **session,
            'benchPlan': {**plan, 'estimates': new_estimates},
        }
        job.save(update_fields=['work_session'])


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0086_restorationpartsrequestline_section'),
    ]

    operations = [
        migrations.RunPython(drop_bench_plan_odds, migrations.RunPython.noop),
    ]
