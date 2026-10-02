"""
The owner's modelling method (data_platform Phase 5), as code. Every step is fit on training rows only.

1. **Type** each variable: categorical, ordinal, continuous, or mostly-null (dropped).
2. **Split** a variable with nulls into `is_<var>_null` and `<var>` (the value, nulls filled).
3. **Uniform:** continuous and ordinal variables go to uniform through an estimated CDF (quantiles fit
   on the training fold).
4. **Select** with lasso (L1 logistic, strength by CV), then fit **logistic regression** (L2) on the
   kept features: the explainable baseline.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, OneToOneFeatureMixin, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression, LogisticRegressionCV
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, QuantileTransformer

MOSTLY_NULL = 0.8       # a variable null on more than this share of rows is dropped (typed mostly_null)
MIN_LEVEL_ROWS = 50     # categorical levels with fewer training rows are pooled as "infrequent"


@dataclass
class Typed:
    categorical: list[str] = field(default_factory=list)
    ordinal: dict[str, list] = field(default_factory=dict)   # name -> levels, low to high
    continuous: list[str] = field(default_factory=list)
    mostly_null: list[str] = field(default_factory=list)
    null_flags: list[str] = field(default_factory=list)      # is_<var>_null columns added by split()

    def summary(self) -> dict:
        return {'categorical': self.categorical, 'ordinal': list(self.ordinal), 'continuous': self.continuous,
                'mostly_null': self.mostly_null, 'null_flags': self.null_flags}


def type_variables(df: pd.DataFrame, features: list[str], ordinal: dict[str, list] | None = None) -> Typed:
    """Step 1. `ordinal` names the ordered variables and their levels; the rest are typed by dtype."""
    ordinal = ordinal or {}
    t = Typed()
    for col in features:
        if df[col].isna().mean() > MOSTLY_NULL:
            t.mostly_null.append(col)
        elif col in ordinal:
            t.ordinal[col] = ordinal[col]
        elif pd.api.types.is_bool_dtype(df[col]) or not pd.api.types.is_numeric_dtype(df[col]):
            t.categorical.append(col)
        else:
            t.continuous.append(col)
    return t


def split_nulls(df: pd.DataFrame, t: Typed) -> pd.DataFrame:
    """Step 2. Ordinal levels become their rank; a null gets its own flag and a neutral fill."""
    out = df.copy()
    for col, levels in t.ordinal.items():
        out[col] = out[col].map({v: i for i, v in enumerate(levels)})
    for col in [*t.continuous, *t.ordinal]:
        out[col] = pd.to_numeric(out[col], errors='coerce').astype(float)  # nullable ints / decimals -> float
        if out[col].isna().any():
            flag = f'is_{col}_null'
            out[flag] = out[col].isna().astype(int)
            if flag not in t.null_flags:
                t.null_flags.append(flag)
    for col in t.categorical:
        out[col] = out[col].astype('string').fillna('(missing)')
    return out


def _preprocess(t: Typed) -> ColumnTransformer:
    """Step 3 (uniform) and the one-hot for categoricals. Numeric nulls are filled by the CDF's median."""
    numeric = [*t.continuous, *t.ordinal]
    return ColumnTransformer([
        ('uniform', Pipeline([
            ('fill', _MedianFill()),
            ('cdf', QuantileTransformer(n_quantiles=200, output_distribution='uniform', subsample=100_000)),
        ]), numeric),
        ('cat', OneHotEncoder(min_frequency=MIN_LEVEL_ROWS, handle_unknown='infrequent_if_exist'), t.categorical),
        ('flags', 'passthrough', t.null_flags),
    ])


class _MedianFill(OneToOneFeatureMixin, BaseEstimator, TransformerMixin):
    """Fill numeric nulls with the training median (the null itself is carried by the is_null flag)."""

    def fit(self, X, y=None):
        if hasattr(X, 'columns'):
            self.feature_names_in_ = np.asarray(X.columns, dtype=object)
        self.n_features_in_ = X.shape[1]
        self.median_ = np.nanmedian(np.asarray(X, dtype=float), axis=0)
        return self

    def transform(self, X):
        X = np.asarray(X, dtype=float).copy()
        rows, cols = np.where(np.isnan(X))
        X[rows, cols] = np.take(self.median_, cols)
        return X


class _Lasso(BaseEstimator, TransformerMixin):
    """Step 4a: keep the columns an L1 logistic (strength by 3-fold CV) gives a non-zero weight."""

    def fit(self, X, y):
        # liblinear handles L1 on this size of data reliably (saga stopped short of converging).
        m = LogisticRegressionCV(Cs=8, cv=3, l1_ratios=[1.0], solver='liblinear', max_iter=1000,
                                 scoring='neg_log_loss', use_legacy_attributes=False)
        m.fit(X, y)
        self.keep_ = np.flatnonzero(np.abs(m.coef_[0]) > 1e-6)
        if self.keep_.size == 0:
            self.keep_ = np.arange(X.shape[1])
        return self

    def transform(self, X):
        return X[:, self.keep_]


def baseline(t: Typed) -> Pipeline:
    """Steps 3 and 4: the explainable baseline."""
    return Pipeline([
        ('prep', _preprocess(t)),
        ('lasso', _Lasso()),
        ('logit', LogisticRegression(C=1.0, max_iter=1000)),
    ])


def explain(model: Pipeline, top: int = 15) -> list[dict]:
    """The baseline's largest weights, by feature name (after the uniform and one-hot steps)."""
    names = model.named_steps['prep'].get_feature_names_out()[model.named_steps['lasso'].keep_]
    coef = model.named_steps['logit'].coef_[0]
    order = np.argsort(-np.abs(coef))[:top]
    return [{'feature': str(names[i]), 'weight': round(float(coef[i]), 3)} for i in order]
