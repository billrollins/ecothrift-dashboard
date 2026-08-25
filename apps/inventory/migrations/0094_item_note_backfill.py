from django.db import migrations


def _body(value):
    return str(value or '').strip()


def _handoff_body(handoff):
    if not isinstance(handoff, dict):
        return ''
    parts = []
    evidence = str(handoff.get('condition_evidence') or '').strip()
    if evidence:
        parts.append(evidence)
    unknowns = handoff.get('unknowns')
    if isinstance(unknowns, list):
        unknown_text = '; '.join(str(row).strip() for row in unknowns if str(row).strip())
    else:
        unknown_text = str(unknowns or '').strip()
    if unknown_text:
        parts.append(f'Unknowns: {unknown_text}')
    return '\n'.join(parts)


def _items_for_job(job, Item):
    if not job.item_check_in_id:
        return []
    return list(Item.objects.filter(check_in_id=job.item_check_in_id).order_by('id'))


def _write(ItemNote, *, item, body, surface, source_key, job_id, check_in_id, author_id, occurred_at, supersedes=None):
    cleaned = _body(body)
    if not cleaned:
        return None
    return ItemNote.objects.create(
        item=item,
        body=cleaned,
        surface=surface,
        source_key=source_key,
        restoration_job_id=job_id,
        check_in_id=check_in_id,
        author_id=author_id,
        occurred_at=occurred_at,
        supersedes=supersedes,
        status='active',
    )


def backfill_item_notes(apps, schema_editor):
    Item = apps.get_model('inventory', 'Item')
    ItemNote = apps.get_model('inventory', 'ItemNote')
    RestorationJob = apps.get_model('inventory', 'RestorationJob')
    RestorationAction = apps.get_model('inventory', 'RestorationAction')
    RestorationOutput = apps.get_model('inventory', 'RestorationOutput')
    RestorationTimelineEvent = apps.get_model('inventory', 'RestorationTimelineEvent')
    ItemCheckIn = apps.get_model('inventory', 'ItemCheckIn')

    if ItemNote.objects.exists():
        return

    for job in RestorationJob.objects.iterator():
        items = _items_for_job(job, Item)
        if not items:
            continue
        check_in_id = job.item_check_in_id
        queue_events = list(
            RestorationTimelineEvent.objects.filter(
                job_id=job.id,
                event_type='note.queue_changed',
            ).order_by('occurred_at', 'id')
        )
        if queue_events:
            previous_by_item = {item.id: None for item in items}
            for event in queue_events:
                payload = event.payload if isinstance(event.payload, dict) else {}
                next_body = _body(payload.get('next'))
                if not next_body:
                    continue
                for item in items:
                    previous = previous_by_item.get(item.id)
                    if previous is not None:
                        previous.status = 'revised'
                        previous.save(update_fields=['status'])
                    created = _write(
                        ItemNote,
                        item=item,
                        body=next_body,
                        surface='queue',
                        source_key='queue',
                        job_id=job.id,
                        check_in_id=check_in_id,
                        author_id=event.actor_id,
                        occurred_at=event.occurred_at,
                        supersedes=previous,
                    )
                    previous_by_item[item.id] = created
        elif _body(job.queue_note):
            when = job.sent_at or job.created_at
            for item in items:
                _write(
                    ItemNote,
                    item=item,
                    body=job.queue_note,
                    surface='queue',
                    source_key='queue',
                    job_id=job.id,
                    check_in_id=check_in_id,
                    author_id=job.created_by_id,
                    occurred_at=when,
                )

        if _body(job.pending_notes):
            when = job.pending_started_at or job.updated_at or job.created_at
            for item in items:
                _write(
                    ItemNote,
                    item=item,
                    body=job.pending_notes,
                    surface='hold',
                    source_key='hold',
                    job_id=job.id,
                    check_in_id=check_in_id,
                    author_id=None,
                    occurred_at=when,
                )

        if _body(job.return_notes):
            surface = 'reject' if job.return_reason == 'rejected' else 'send_back'
            when = job.returned_at or job.updated_at or job.created_at
            for item in items:
                _write(
                    ItemNote,
                    item=item,
                    body=job.return_notes,
                    surface=surface,
                    source_key=surface,
                    job_id=job.id,
                    check_in_id=check_in_id,
                    author_id=None,
                    occurred_at=when,
                )

        if _body(job.disposition_notes):
            when = job.dispositioned_at or job.updated_at or job.created_at
            for item in items:
                _write(
                    ItemNote,
                    item=item,
                    body=job.disposition_notes,
                    surface='finish',
                    source_key='finish',
                    job_id=job.id,
                    check_in_id=check_in_id,
                    author_id=job.dispositioned_by_id,
                    occurred_at=when,
                )

        for action in RestorationAction.objects.filter(job_id=job.id).order_by('started_at', 'id'):
            if not _body(action.description):
                continue
            when = action.updated_at or action.started_at
            for item in items:
                _write(
                    ItemNote,
                    item=item,
                    body=action.description,
                    surface='action',
                    source_key=f'action:{action.id}',
                    job_id=job.id,
                    check_in_id=check_in_id,
                    author_id=action.created_by_id,
                    occurred_at=when,
                )

        for output in RestorationOutput.objects.filter(job_id=job.id).order_by('seq', 'id'):
            if not _body(output.notes):
                continue
            for item in items:
                _write(
                    ItemNote,
                    item=item,
                    body=output.notes,
                    surface='output',
                    source_key=f'output:{output.seq}',
                    job_id=job.id,
                    check_in_id=check_in_id,
                    author_id=output.created_by_id,
                    occurred_at=output.created_at,
                )

        if check_in_id:
            try:
                check_in = ItemCheckIn.objects.get(pk=check_in_id)
            except ItemCheckIn.DoesNotExist:
                continue
            snapshot = check_in.defaults_snapshot if isinstance(check_in.defaults_snapshot, dict) else {}
            check_in_notes = _body(snapshot.get('notes'))
            if check_in_notes:
                for item in items:
                    already = ItemNote.objects.filter(
                        item=item,
                        surface='check_in',
                        source_key='check_in',
                    ).exists()
                    if already:
                        continue
                    _write(
                        ItemNote,
                        item=item,
                        body=check_in_notes,
                        surface='check_in',
                        source_key='check_in',
                        job_id=job.id,
                        check_in_id=check_in_id,
                        author_id=check_in.created_by_id,
                        occurred_at=check_in.created_at,
                    )
            handoff_body = _handoff_body(snapshot.get('processing_handoff'))
            if handoff_body:
                for item in items:
                    _write(
                        ItemNote,
                        item=item,
                        body=handoff_body,
                        surface='handoff',
                        source_key='handoff',
                        job_id=job.id,
                        check_in_id=check_in_id,
                        author_id=check_in.created_by_id,
                        occurred_at=check_in.created_at,
                    )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0093_item_note'),
    ]

    operations = [
        migrations.RunPython(backfill_item_notes, noop),
    ]
