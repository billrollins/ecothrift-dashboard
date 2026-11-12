"""Sign draft packages (#122; spec: workspace/signage/DRAFT-PACKAGE-SPEC.md, Mainline 2026-11-12).

A package is a folder ``<slug>/`` with ``draft.json`` and its version files (a PNG preview and the PDF to print per
version). Step 1 (``scripts/s3/upload_sign_drafts.py``, on the PC that has the folders) checks the packages, uploads
the files to the file store under ``signage/drafts/<slug>/`` and writes one manifest; step 2
(``manage.py load_sign_drafts --manifest-key <key>``, where the app runs) turns the manifest into drafts.

Plain Python on purpose (no Django): the upload script imports it without the app's settings.
"""
from __future__ import annotations

import hashlib
import json
import pathlib
import re

FORMAT = 'ecothrift.sign-drafts/1'
KEY_ROOT = 'signage/drafts'
SLUG_RE = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
KINDS = ('sign', 'theme')
MAX_BYTES = 20 * 1024 * 1024
PNG_SOFT_LIMIT = int(1.5 * 1024 * 1024)
# Staff vote blind: a label must not lean.
LEANING = re.compile(r'recommend|my pick|\bbest\b|\bwinner\b|\bpreferred\b', re.I)
CONTENT_TYPES = {'png': 'image/png', 'pdf': 'application/pdf'}
SIGNATURES = {'png': b'\x89PNG', 'pdf': b'%PDF-'}


def find_packages(paths) -> list[pathlib.Path]:
    """Each path is a package (has draft.json) or a folder of packages."""
    found = []
    for raw in paths:
        p = pathlib.Path(raw)
        if (p / 'draft.json').is_file():
            found.append(p)
        elif p.is_dir():
            found.extend(sorted(c for c in p.iterdir() if (c / 'draft.json').is_file()))
    return found


def sha256(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def read_package(folder: pathlib.Path) -> tuple[dict | None, list[str], list[str]]:
    """(draft, problems, warnings). A problem stops the whole upload; a warning is only said."""
    where = folder.name
    problems: list[str] = []
    warnings: list[str] = []
    try:
        raw = json.loads((folder / 'draft.json').read_text(encoding='utf-8-sig'))
    except (OSError, ValueError) as exc:
        return None, [f'{where}/draft.json: cannot read it ({exc})'], []
    if not isinstance(raw, dict):
        return None, [f'{where}/draft.json: expected a JSON object'], []

    slug = str(raw.get('slug') or '').strip()
    if not SLUG_RE.match(slug) or len(slug) > 80:
        problems.append(f'{where}: slug {slug!r} must be a-z, 0-9 and dashes (at most 80)')
    elif slug != folder.name:
        warnings.append(f'{where}: slug {slug!r} differs from the folder name')
    kind = str(raw.get('kind') or 'sign').strip()
    if kind not in KINDS:
        problems.append(f'{where}: kind {kind!r} must be "sign" or "theme"')
    name = str(raw.get('name') or '').strip()
    if not name or len(name) > 120:
        problems.append(f'{where}: name is missing or longer than 120 characters')
    location = str(raw.get('location') or '').strip()
    if len(location) > 255:
        problems.append(f'{where}: location is longer than 255 characters')
    try:
        quantity = int(raw.get('quantity', 1))
        if not 0 <= quantity <= 500:
            raise ValueError
    except (TypeError, ValueError):
        problems.append(f'{where}: quantity must be a whole number from 0 to 500')
        quantity = 1
    dash_update = raw.get('dash_update')
    if dash_update is not None and (not isinstance(dash_update, int) or dash_update < 1):
        problems.append(f'{where}: dash_update must be a Dash Update id or left out')
        dash_update = None

    versions_in = raw.get('versions')
    if not isinstance(versions_in, list) or not versions_in:
        problems.append(f'{where}: versions must be a non-empty list')
        versions_in = []
    versions, labels = [], set()
    for i, v in enumerate(versions_in, start=1):
        if not isinstance(v, dict):
            problems.append(f'{where}: version {i} is not an object')
            continue
        label = str(v.get('label') or '').strip()
        if not label or len(label) > 120:
            problems.append(f'{where}: version {i} needs a label (at most 120 characters)')
        elif label.lower() in labels:
            problems.append(f'{where}: label {label!r} is used twice (labels name the versions)')
        labels.add(label.lower())
        if LEANING.search(label):
            warnings.append(f'{where}: label {label!r} leans (staff vote blind)')
        files = {}
        for kind_ in ('png', 'pdf'):
            name_ = str(v.get(kind_) or '').strip()
            path = folder / name_ if name_ else None
            if not path or not path.is_file() or path.parent != folder:
                problems.append(f'{where}: version {label or i} has no {kind_.upper()} file {name_!r} in the folder')
                continue
            size = path.stat().st_size
            with path.open('rb') as f:
                head = f.read(8)
            if not head.startswith(SIGNATURES[kind_]):
                problems.append(f'{where}/{name_}: not a {kind_.upper()}')
            if size > MAX_BYTES:
                problems.append(f'{where}/{name_}: over 20 MB')
            if kind_ == 'png' and size > PNG_SOFT_LIMIT:
                warnings.append(f'{where}/{name_}: preview is {size / 1048576:.1f} MB (the spec says under 1.5 MB)')
            files[kind_] = path
        versions.append({'label': label, **files})

    draft = {
        'slug': slug, 'kind': kind, 'dash_update': dash_update, 'name': name, 'location': location,
        'quantity': quantity, 'notes': str(raw.get('notes') or '').strip(), 'versions': versions,
    }
    return draft, problems, warnings


def check(folders) -> tuple[list[dict], list[str], list[str]]:
    drafts, problems, warnings = [], [], []
    seen = {}
    for folder in folders:
        draft, p, w = read_package(folder)
        problems += p
        warnings += w
        if draft:
            if draft['slug'] in seen:
                problems.append(f'slug {draft["slug"]!r} is in two packages: {seen[draft["slug"]]} and {folder}')
            seen[draft['slug']] = folder
            drafts.append(draft)
    return drafts, problems, warnings


def file_key(slug: str, path: pathlib.Path, digest: str) -> str:
    """Same file, same key: a re-upload writes nothing new and the loader finds the same file."""
    return f'{KEY_ROOT}/{slug}/{digest[:12]}-{path.name}'


def build_manifest(drafts: list[dict], *, location: str, made_at: str) -> tuple[dict, list[tuple[str, pathlib.Path, str]]]:
    """The manifest, and the (key, local path, content type) uploads it needs. Keys are relative to ``location``."""
    uploads, out = [], []
    for d in drafts:
        versions = []
        for v in d['versions']:
            entry = {'label': v['label']}
            for kind_ in ('png', 'pdf'):
                path = v[kind_]
                digest = sha256(path)
                key = file_key(d['slug'], path, digest)
                entry[kind_] = {
                    'key': key, 'filename': path.name, 'size': path.stat().st_size,
                    'content_type': CONTENT_TYPES[kind_], 'sha256': digest,
                }
                uploads.append((key, path, CONTENT_TYPES[kind_]))
            versions.append(entry)
        out.append({**{k: d[k] for k in ('slug', 'kind', 'dash_update', 'name', 'location', 'quantity', 'notes')},
                    'versions': versions})
    manifest = {'format': FORMAT, 'made_at': made_at, 'location': location, 'drafts': out}
    return manifest, uploads


def manifest_key(made_at_compact: str) -> str:
    return f'{KEY_ROOT}/manifests/{made_at_compact}.json'
