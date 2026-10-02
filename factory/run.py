"""
The model factory (data_platform Phase 5), first version: one target at a time, the owner's baseline
against a challenger, on a leakage-free final holdout.

    python -m factory.run sold_30

- **Data:** the warehouse (`python -m warehouse.build` first); read-only.
- **Validation:** rows are ordered by the day the item went out. The most recent HOLDOUT_DAYS of eligible
  rows are the **final holdout**: nothing looks at it until both models are fit. The rest is split into
  expanding time folds (train on the past, test on the next block) for the CV numbers.
- **Promotion:** the challenger wins only if it beats the baseline on the holdout by a significant margin:
  the 95% bootstrap interval of its log-loss gain is above zero. Otherwise the baseline stays.
- **Output:** `workspace/factory/<target>/scoreboard.json` (and printed): CV and holdout scores, the winner,
  the baseline's weights, the variable types, and the data-quality notes behind the rows.
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

from factory import method
from warehouse.db import connect

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / 'workspace' / 'warehouse' / 'ecothrift.duckdb'
OUT = ROOT / 'workspace' / 'factory'
HOLDOUT_DAYS = 21
CV_FOLDS = 4
BOOTSTRAP = 400

CONDITION = ['salvage', 'fair', 'good', 'very_good', 'like_new', 'new']   # low to high; 'unknown' = null

TARGETS = {
    'sold_30': {
        'question': 'Will an item sell within 30 days of going out?',
        # only items out long enough for the answer to be known (30 days before the pull's last day)
        'sql': """
            SELECT *, (sold AND days_on_floor <= 30)::INT AS y
            FROM item_outcome
            WHERE start_day <= (SELECT max(day) FROM floor_daily) - 30
        """,
        'features': ['category', 'brand', 'condition', 'vendor_code', 'source', 'retail', 'tag', 'tag_to_retail',
                     'category_floor_prior_week', 'category_sold_prior_week', 'category_cover_prior_week',
                     'same_product_on_floor', 'start_dow', 'start_month'],
        'ordinal': {'condition': CONDITION},
        'notes': ['ITM-02/03: only items with a known floor start (on_shelf move or listed_at), V3 since 2026-04-12.',
                  'ITM-14: the tag is the price when the item went out; retags later are not seen.',
                  'ITM-01: Mixed lots is its own category.',
                  'SAL-07: items sold without a scan look unsold (they stay on the shelf in the data).'],
    },
}


def load(target: str) -> pd.DataFrame:
    con = connect()  # the Parquet files: never locks the warehouse
    df = con.execute(TARGETS[target]['sql']).df()
    con.close()
    df['condition'] = df['condition'].where(df['condition'].isin(CONDITION))
    return df.sort_values(['start_day', 'item_id']).reset_index(drop=True)


def _scores(y, p) -> dict:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return {'log_loss': round(float(log_loss(y, p)), 4), 'auc': round(float(roc_auc_score(y, p)), 4),
            'brier': round(float(brier_score_loss(y, p)), 4), 'rows': int(len(y)), 'rate': round(float(np.mean(y)), 3)}


def _challenger(t: method.Typed) -> tuple:
    """Gradient boosting on the same typed variables (categoricals native, no uniform step needed)."""
    return HistGradientBoostingClassifier(max_iter=300, learning_rate=0.06, max_leaf_nodes=31,
                                          l2_regularization=1.0, categorical_features='from_dtype',
                                          early_stopping=True, validation_fraction=0.15, random_state=0)


def _challenger_frame(df: pd.DataFrame, t: method.Typed, cats: dict | None = None) -> tuple[pd.DataFrame, dict]:
    cols = [*t.continuous, *t.ordinal, *t.null_flags, *t.categorical]
    X = df[cols].copy()
    cats = cats or {}
    for c in t.categorical:
        if c not in cats:  # levels from training rows only; the rest (and rare ones) are "(other)"
            counts = X[c].value_counts()
            cats[c] = list(counts[counts >= method.MIN_LEVEL_ROWS].index[:200]) + ['(other)']
        X[c] = pd.Categorical(X[c].where(X[c].isin(cats[c]), '(other)'), categories=cats[c])
    return X, cats


def _fit_predict(train: pd.DataFrame, test: pd.DataFrame, t: method.Typed) -> tuple[np.ndarray, np.ndarray, object]:
    base = method.baseline(t)
    base.fit(train, train['y'])
    Xtr, cats = _challenger_frame(train, t)
    Xte, _ = _challenger_frame(test, t, cats)
    ch = _challenger(t).fit(Xtr, train['y'])
    return base.predict_proba(test)[:, 1], ch.predict_proba(Xte)[:, 1], base


def _bootstrap_gain(y, p_base, p_ch, seed: int = 0) -> tuple[float, float, float]:
    """Log-loss gain of the challenger (baseline minus challenger; > 0 = better), with a 95% interval."""
    rng = np.random.default_rng(seed)
    y = np.asarray(y)
    lb = -(y * np.log(np.clip(p_base, 1e-6, 1)) + (1 - y) * np.log(np.clip(1 - p_base, 1e-6, 1)))
    lc = -(y * np.log(np.clip(p_ch, 1e-6, 1)) + (1 - y) * np.log(np.clip(1 - p_ch, 1e-6, 1)))
    d = lb - lc
    boots = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(BOOTSTRAP)]
    return float(d.mean()), float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))


def run(target: str) -> dict:
    started = time.time()
    spec = TARGETS[target]
    raw = load(target)
    t = method.type_variables(raw, spec['features'], spec.get('ordinal'))
    df = method.split_nulls(raw, t)

    cut = df['start_day'].max() - pd.Timedelta(days=HOLDOUT_DAYS - 1)
    dev, hold = df[df['start_day'] < cut], df[df['start_day'] >= cut]

    # expanding time folds over the development rows
    edges = np.linspace(0, len(dev), CV_FOLDS + 2).astype(int)
    cv = {'baseline': [], 'challenger': []}
    for k in range(1, CV_FOLDS + 1):
        train, test = dev.iloc[:edges[k]], dev.iloc[edges[k]:edges[k + 1]]
        if train['y'].nunique() < 2 or test['y'].nunique() < 2:
            continue
        pb, pc, _ = _fit_predict(train, test, t)
        cv['baseline'].append(_scores(test['y'], pb))
        cv['challenger'].append(_scores(test['y'], pc))

    # the final holdout: fit on all development rows, score once
    pb, pc, base = _fit_predict(dev, hold, t)
    gain, lo, hi = _bootstrap_gain(hold['y'], pb, pc)
    winner = 'challenger' if lo > 0 else 'baseline'
    board = {
        'target': target,
        'question': spec['question'],
        'built_at': datetime.now().isoformat(timespec='seconds'),
        'rows': {'development': int(len(dev)), 'holdout': int(len(hold)),
                 'holdout_from': str(cut.date()), 'holdout_to': str(df['start_day'].max().date())},
        'cv': {m: {k: round(float(np.mean([s[k] for s in v])), 4) for k in ('log_loss', 'auc', 'brier')} if v else None
               for m, v in cv.items()},
        'holdout': {'baseline': _scores(hold['y'], pb), 'challenger': _scores(hold['y'], pc)},
        'challenger_gain': {'log_loss': round(gain, 4), 'ci95': [round(lo, 4), round(hi, 4)]},
        'winner': winner,
        'baseline_weights': method.explain(base),
        'variables': t.summary(),
        'data_quality': spec['notes'],
        'seconds': round(time.time() - started, 1),
    }
    out = OUT / target
    out.mkdir(parents=True, exist_ok=True)
    (out / 'scoreboard.json').write_text(json.dumps(board, indent=2), encoding='utf-8')
    return board


def _print(b: dict) -> None:
    print(f"{b['target']}: {b['question']}")
    print(f"  rows: {b['rows']['development']:,} development, {b['rows']['holdout']:,} holdout "
          f"({b['rows']['holdout_from']} to {b['rows']['holdout_to']})")
    for m in ('baseline', 'challenger'):
        h, c = b['holdout'][m], b['cv'][m] or {}
        print(f"  {m:<10} holdout log loss {h['log_loss']:.4f}  AUC {h['auc']:.3f}  | CV log loss {c.get('log_loss', 0):.4f}  AUC {c.get('auc', 0):.3f}")
    g = b['challenger_gain']
    print(f"  challenger gain {g['log_loss']:+.4f} (95% {g['ci95'][0]:+.4f} to {g['ci95'][1]:+.4f}) -> winner: {b['winner']}")
    print('  baseline weights: ' + ', '.join(f"{w['feature']} {w['weight']:+.2f}" for w in b['baseline_weights'][:8]))
    print(f"  {b['seconds']}s; wrote {OUT / b['target'] / 'scoreboard.json'}")


if __name__ == '__main__':
    p = argparse.ArgumentParser(description='Run the model factory on one target.')
    p.add_argument('target', choices=sorted(TARGETS))
    _print(run(p.parse_args().target))
