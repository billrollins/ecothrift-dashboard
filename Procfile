release: python manage.py migrate && python manage.py createcachetable
web: gunicorn ecothrift.wsgi --log-file - --timeout 120 --worker-class gthread --workers 2 --threads 8 --max-requests 2000 --max-requests-jitter 200
