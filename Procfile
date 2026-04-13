release: python manage.py migrate && python manage.py createcachetable
web: gunicorn ecothrift.wsgi --log-file - --timeout 120 --workers 2 --max-requests 500 --max-requests-jitter 50
