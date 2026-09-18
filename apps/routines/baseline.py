"""Section baselines: Negative Binomial or Poisson, mid-p tails, shrink, warm-up.

No third-party stats. The recurrence is enough:

    P(k+1) = P(k) · (k+r)/(k+1) · p     (Negative Binomial)
    P(k+1) = P(k) · λ/(k+1)             (Poisson)
"""
from __future__ import annotations

import math
from datetime import datetime
from statistics import mean, pvariance
from typing import Any

from .models import SectionObservation
from .settings import DEFAULTS

BASELINE_KINDS = (SectionObservation.KIND_TALLY, SectionObservation.KIND_AUDIT)


def fit_count_dist(mu: float, var: float) -> dict[str, float]:
    """NB if overdispersed, Poisson otherwise. r/p unused for Poisson."""
    mu = max(float(mu), 0.0)
    var = max(float(var), 0.0)
    if mu <= 0:
        return {'family': 'poisson', 'mean': 0.0, 'var': 0.0, 'r': 0.0, 'p': 0.0, 'lam': 0.0}
    if var <= mu + 1e-12:
        return {'family': 'poisson', 'mean': mu, 'var': mu, 'r': 0.0, 'p': 0.0, 'lam': mu}
    # Failures-before-r-successes: mean = r p / (1-p), var = mean / (1-p)
    p = 1.0 - (mu / var)
    if p <= 0 or p >= 1:
        return {'family': 'poisson', 'mean': mu, 'var': mu, 'r': 0.0, 'p': 0.0, 'lam': mu}
    r = (mu * mu) / (var - mu)
    return {'family': 'nb', 'mean': mu, 'var': var, 'r': r, 'p': p, 'lam': mu}


def pmf_up_to(x: int, dist: dict[str, float], *, cap: int = 400) -> list[float]:
    """P(0) … P(x), plus a leftover mass so tails still sum to 1."""
    x = max(int(x), 0)
    stop = min(max(x, 0) + 1, cap + 1)
    probs = [0.0] * stop
    if dist.get('family') == 'nb':
        r = float(dist['r'])
        p = float(dist['p'])
        if r <= 0 or not 0 < p < 1:
            probs[0] = 1.0
            return probs
        probs[0] = (1.0 - p) ** r
        for k in range(stop - 1):
            probs[k + 1] = probs[k] * ((k + r) / (k + 1.0)) * p
    else:
        lam = float(dist.get('lam') or dist.get('mean') or 0.0)
        if lam <= 0:
            probs[0] = 1.0
            return probs
        probs[0] = math.exp(-lam)
        for k in range(stop - 1):
            probs[k + 1] = probs[k] * lam / (k + 1.0)
    return probs


def tail_probs(x: int, dist: dict[str, float]) -> dict[str, float]:
    """Two-sided mid-p tails for a discrete count."""
    x = max(int(x), 0)
    probs = pmf_up_to(x, dist)
    p_eq = probs[x] if x < len(probs) else 0.0
    p_lt = sum(probs[:x]) if x > 0 else 0.0
    used = sum(probs)
    p_gt = max(1.0 - used, 0.0) + (sum(probs[x + 1:]) if x + 1 < len(probs) else 0.0)
    p_low = min(max(p_lt + 0.5 * p_eq, 0.0), 1.0)
    p_high = min(max(p_gt + 0.5 * p_eq, 0.0), 1.0)
    return {
        'p_eq': p_eq,
        'p_low': p_low,
        'p_high': p_high,
        'tail': min(p_low, p_high),
    }


def log10_tail_score(tail: float, full: float, zero: float) -> float:
    """100 at `full`, 0 at `zero`, linear in log10 between."""
    if tail >= full:
        return 100.0
    if tail <= zero:
        return 0.0
    span = math.log10(full) - math.log10(zero)
    if span == 0:
        return 100.0
    return 100.0 * (math.log10(tail) - math.log10(zero)) / span


def _moments(values: list[float]) -> tuple[int, float, float]:
    if not values:
        return 0, 0.0, 0.0
    n = len(values)
    mu = mean(values)
    var = pvariance(values) if n > 1 else mu
    return n, float(mu), float(var)


def shrink_moments(n: int, mu: float, var: float, store_mu: float, store_var: float, shrink: float) -> tuple[float, float]:
    weight = n / (n + max(float(shrink), 0.0)) if (n + shrink) else 0.0
    return (
        weight * mu + (1.0 - weight) * store_mu,
        weight * var + (1.0 - weight) * store_var,
    )


def _cfg_num(cfg: dict[str, Any], name: str) -> float:
    return float(cfg.get(name, DEFAULTS[name]))


def baseline_from_counts(
    counts: list[float],
    store_counts: list[float],
    cfg: dict[str, Any],
) -> dict[str, Any]:
    n, mu, var = _moments(counts)
    store_n, store_mu, store_var = _moments(store_counts)
    shrink = _cfg_num(cfg, 'baseline_shrink')
    if store_n == 0:
        store_mu, store_var = mu, var
    if n == 0:
        mu, var = store_mu, store_var
    else:
        mu, var = shrink_moments(n, mu, var, store_mu, store_var, shrink)
    warm = n < _cfg_num(cfg, 'warmup_section') or store_n < _cfg_num(cfg, 'warmup_store')
    dist = fit_count_dist(mu, var)
    return {
        'n': n,
        'store_n': store_n,
        'mean': dist['mean'],
        'var': dist['var'],
        'r': dist['r'],
        'p': dist['p'],
        'family': dist['family'],
        'warm': warm,
        'store_mean': store_mu,
        'store_var': store_var,
    }


def _window_rows(cfg: dict[str, Any], as_of: datetime | None = None):
    window = int(_cfg_num(cfg, 'baseline_window'))
    qs = SectionObservation.objects.filter(
        kind__in=BASELINE_KINDS,
        in_baseline=True,
    )
    if as_of is not None:
        qs = qs.filter(observed_at__lte=as_of)
    return list(qs.order_by('-observed_at').values('section_id', 'total')[: max(window * 20, window)])


def section_baseline(section_id: int, cfg: dict[str, Any], as_of: datetime | None = None) -> dict[str, Any]:
    """Last `window` in-baseline tallies/audits for this section, shrunk to the store."""
    window = int(_cfg_num(cfg, 'baseline_window'))
    rows = _window_rows(cfg, as_of)
    section = [float(row['total']) for row in rows if row['section_id'] == section_id][:window]
    store = [float(row['total']) for row in rows][: max(window * 8, window)]
    base = baseline_from_counts(section, store, cfg)
    base['section_id'] = section_id
    return base


def store_baseline(cfg: dict[str, Any], as_of: datetime | None = None) -> dict[str, Any]:
    window = int(_cfg_num(cfg, 'baseline_window'))
    rows = _window_rows(cfg, as_of)
    store = [float(row['total']) for row in rows][: max(window * 8, window)]
    return baseline_from_counts(store, store, cfg)


def expected_variance(base: dict[str, Any]) -> float:
    return max(float(base.get('var') or 0.0), float(base.get('mean') or 0.0), 0.0)
