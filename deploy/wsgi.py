"""Production entrypoint: Babel, private secret, no remote configuration UI."""
import os
from flask import abort, request
from flask_babel import Babel
from werkzeug.middleware.proxy_fix import ProxyFix
from web_app import app as application, get_locale, sc, settings

secret = os.environ['TSAKORPUS_SECRET_KEY']
if len(secret) < 32 or secret.startswith('replace-'):
    raise RuntimeError('Set a unique TSAKORPUS_SECRET_KEY of at least 32 characters')
application.secret_key = secret
application.config.update(DEBUG=False, SESSION_COOKIE_HTTPONLY=True,
                          SESSION_COOKIE_SECURE=os.environ.get('COOKIE_SECURE', 'true') == 'true')
application.wsgi_app = ProxyFix(application.wsgi_app, x_for=1, x_proto=1, x_host=1)
Babel(application, locale_selector=get_locale)


@application.before_request
def block_configuration():
    if request.path == '/config' or request.path.startswith('/config/'):
        abort(404)


@application.get('/healthz')
def health():
    if not settings.ready_for_work or not sc.is_alive():
        return {'status': 'not-ready'}, 503
    return {'status': 'ok'}
