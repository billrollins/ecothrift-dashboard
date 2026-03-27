"""
Train the price estimation model on historical sold items.

Requires: scikit-learn, lightgbm (or xgboost), joblib, pandas
Install:  pip install -r workspace/notebooks/_shared/requirements-notebooks.txt

Usage:
    python manage.py train_price_model
    python manage.py train_price_model --min-samples 200
    python manage.py train_price_model --output workspace/models/price_model.joblib

The trained model is saved to workspace/models/price_model.joblib.
This path is gitignored. Re-run this command after significant new sales data.

FEATURES USED
-------------
  title (text, TF-IDF)
  brand (text, TF-IDF)
  category (one-hot)
  condition (one-hot)
  source (one-hot)
  retail_value (numeric)

TARGET
------
  Item.sold_for (actual sale price)
"""

from __future__ import annotations

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

DEFAULT_OUTPUT = Path(__file__).parent.parent.parent.parent.parent / 'workspace' / 'models' / 'price_model.joblib'
MIN_SAMPLES_DEFAULT = 100


class Command(BaseCommand):
    help = 'Train the price estimation model on sold inventory items.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--min-samples',
            type=int,
            default=MIN_SAMPLES_DEFAULT,
            help=f'Minimum number of sold items required (default: {MIN_SAMPLES_DEFAULT}).',
        )
        parser.add_argument(
            '--output',
            type=str,
            default=str(DEFAULT_OUTPUT),
            help='Path to save the trained model file.',
        )
        parser.add_argument(
            '--test-split',
            type=float,
            default=0.15,
            help='Fraction of data to hold out for evaluation (default: 0.15).',
        )

    def handle(self, *args, **options):
        try:
            import joblib
            import pandas as pd
            from sklearn.compose import ColumnTransformer
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.linear_model import Ridge
            from sklearn.metrics import mean_absolute_error, r2_score
            from sklearn.model_selection import train_test_split
            from sklearn.pipeline import Pipeline
            from sklearn.preprocessing import OneHotEncoder, StandardScaler
        except ImportError as exc:
            raise CommandError(
                f'Required ML packages not installed.\n'
                f'Run: pip install -r workspace/notebooks/_shared/requirements-notebooks.txt\n'
                f'Error: {exc}'
            ) from exc

        output_path = Path(options['output'])
        min_samples = options['min_samples']
        test_split = options['test_split']

        self.stdout.write('Loading training data from database...')
        data = self._load_training_data()

        if len(data) < min_samples:
            raise CommandError(
                f'Only {len(data)} sold items with sufficient data found. '
                f'Minimum required: {min_samples}. '
                f'Import more historical data (Phase 0) before training.'
            )

        self.stdout.write(f'  Loaded {len(data)} training samples.')

        import pandas as pd
        df = pd.DataFrame(data)

        # Features and target
        X = df[['title', 'brand', 'category', 'condition', 'source', 'retail_value']]
        y = df['sold_for'].astype(float)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_split, random_state=42
        )

        # Build preprocessing pipeline
        text_features = ['title', 'brand']
        cat_features = ['category', 'condition', 'source']
        num_features = ['retail_value']

        preprocessor = ColumnTransformer(transformers=[
            ('title_tfidf', TfidfVectorizer(max_features=500, ngram_range=(1, 2)), 'title'),
            ('brand_tfidf', TfidfVectorizer(max_features=200), 'brand'),
            ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), cat_features),
            ('num', StandardScaler(), num_features),
        ])

        # Try LightGBM first, fall back to Ridge regression
        model = self._build_model()

        pipeline = Pipeline([
            ('preprocessor', preprocessor),
            ('model', model),
        ])

        self.stdout.write('Training model...')
        pipeline.fit(X_train, y_train)

        # Evaluate
        y_pred = pipeline.predict(X_test)
        y_pred = [max(p, 0.50) for p in y_pred]
        mae = mean_absolute_error(y_test, y_pred)
        r2 = r2_score(y_test, y_pred)

        self.stdout.write(f'\nEvaluation on {len(y_test)} held-out samples:')
        self.stdout.write(f'  Mean Absolute Error (MAE): ${mae:.2f}')
        self.stdout.write(f'  R² Score:                  {r2:.3f}')

        if mae > 20:
            self.stdout.write(self.style.WARNING(
                f'\nWARNING: MAE of ${mae:.2f} is high. Consider:\n'
                '  - Importing more historical sales data (Phase 0)\n'
                '  - Running backfill_categories to improve category features\n'
                '  - Using a more powerful model (try lightgbm)'
            ))
        elif r2 < 0.50:
            self.stdout.write(self.style.WARNING(
                f'\nWARNING: R² of {r2:.3f} is low. Model explains less than 50% of price variation.\n'
                '  More data and better categories will improve this.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS('\nModel performance looks good!'))

        # Save
        output_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump((pipeline, preprocessor), output_path)
        self.stdout.write(self.style.SUCCESS(f'\nModel saved to: {output_path}'))

        # Also save a category model if enough labeled data exists
        self._train_category_model(df)

    def _load_training_data(self) -> list[dict]:
        """Load sold items with sufficient data for training."""
        from apps.inventory.models import Item

        qs = Item.objects.filter(
            status='sold',
            sold_for__isnull=False,
        ).exclude(
            sold_for=0,
        ).select_related(
            'manifest_row', 'product__category_ref',
        ).values(
            'title', 'brand', 'category', 'condition', 'source',
            'sold_for', 'price',
            'manifest_row__retail_value',
            'product__category_ref__name',
        )

        data = []
        for item in qs:
            # Skip items with no title
            if not item['title']:
                continue

            category = (
                item.get('product__category_ref__name')
                or item.get('category')
                or 'unknown'
            )
            retail = item.get('manifest_row__retail_value')

            data.append({
                'title': (item['title'] or '').lower()[:200],
                'brand': (item['brand'] or '').lower()[:100],
                'category': (category or 'unknown').lower(),
                'condition': item['condition'] or 'unknown',
                'source': item['source'] or 'purchased',
                'retail_value': float(retail) if retail else 0.0,
                'sold_for': float(item['sold_for']),
            })

        return data

    def _build_model(self):
        """Try LightGBM; fall back to Ridge regression."""
        try:
            from lightgbm import LGBMRegressor
            self.stdout.write('  Using LightGBM regressor.')
            return LGBMRegressor(
                n_estimators=300,
                learning_rate=0.05,
                num_leaves=31,
                min_child_samples=10,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                verbose=-1,
            )
        except ImportError:
            pass

        try:
            from xgboost import XGBRegressor
            self.stdout.write('  Using XGBoost regressor.')
            return XGBRegressor(
                n_estimators=300,
                learning_rate=0.05,
                max_depth=6,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                verbosity=0,
            )
        except ImportError:
            pass

        from sklearn.linear_model import Ridge
        self.stdout.write(self.style.WARNING(
            '  LightGBM and XGBoost not found — using Ridge regression (lower accuracy).\n'
            '  Install: pip install lightgbm  for better results.'
        ))
        return Ridge(alpha=1.0)

    def _train_category_model(self, df):
        """Also train a category text classifier if enough labeled items exist."""
        labeled = df[df['category'] != 'unknown']
        if len(labeled) < 50:
            self.stdout.write(
                f'  Skipping category model — only {len(labeled)} labeled items '
                '(need 50+).'
            )
            return

        try:
            import joblib
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.linear_model import LogisticRegression
            from sklearn.pipeline import Pipeline
            from sklearn.preprocessing import LabelEncoder

            le = LabelEncoder()
            y_cat = le.fit_transform(labeled['category'])
            X_cat = labeled['title'] + ' ' + labeled['brand']

            cat_pipeline = Pipeline([
                ('tfidf', TfidfVectorizer(max_features=2000, ngram_range=(1, 2))),
                ('clf', LogisticRegression(max_iter=500, C=1.0)),
            ])
            cat_pipeline.fit(X_cat, y_cat)

            cat_model_path = DEFAULT_OUTPUT.parent / 'category_model.joblib'
            joblib.dump((cat_pipeline, le), cat_model_path)
            self.stdout.write(f'  Category model saved to: {cat_model_path}')
        except Exception as exc:
            self.stdout.write(self.style.WARNING(f'  Category model training failed: {exc}'))
