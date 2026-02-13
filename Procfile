release: python manage.py migrate && python manage.py create_cache_table
web: gunicorn ecothrift.wsgi --log-file - --timeout 120
