release: python manage.py migrate && python manage.py createcachetable
web: gunicorn ecothrift.wsgi --log-file - --timeout 120
