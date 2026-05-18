"""Manifest upload helpers — category column detection on raw CSV rows."""


def compute_category_count(headers: list, rows_data: list) -> int | None:
    """
    Distinct count of non-empty values in the first matching column.

    Header precedence (first column index in file order within each step):
    1) header name (lowercased) contains 'category'
    2) else contains 'department'
    3) else contains 'class'

    rows_data: list of dicts with 'raw' -> column_name -> cell string (upload_manifest shape).

    Returns None when no header matches. Returns 0 when the column exists but has no non-empty values.
    """
    if not headers:
        return None

    lowered = [str(h).lower() for h in headers]

    def first_idx(substr: str):
        for i, h in enumerate(lowered):
            if substr in h:
                return i
        return None

    idx = first_idx('category')
    if idx is None:
        idx = first_idx('department')
    if idx is None:
        idx = first_idx('class')
    if idx is None:
        return None

    if not rows_data:
        return 0

    key = headers[idx]
    vals: set[str] = set()
    for row in rows_data:
        raw = row.get('raw') or {}
        if not isinstance(raw, dict):
            continue
        v = raw.get(key)
        if v is not None and str(v).strip():
            vals.add(str(v).strip())
    return len(vals)
