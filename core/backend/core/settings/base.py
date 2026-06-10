"""
Shared settings for all environments.
Environment-specific files (development.py, production.py) import from here.
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# BASE_DIR = core/backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Load .env for local development; no-op when file is absent (production uses real env vars).
load_dotenv(BASE_DIR / '.env')

# Required -- fail loudly if missing rather than running with an unsafe default.
SECRET_KEY = os.environ['SECRET_KEY']

DEBUG = False  # Always overridden by environment settings.

ALLOWED_HOSTS = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'core_app',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

AUTH_USER_MODEL = 'core_app.CustomUser'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS':  True,
}

SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'APP': {
            'client_id': os.environ.get('GOOGLE_CLIENT_ID', ''),
            'secret':    os.environ.get('GOOGLE_CLIENT_SECRET', ''),
            'key':       '',
        },
        'SCOPE': ['profile', 'email'],
        'AUTH_PARAMS': {'access_type': 'online'},
    }
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Module auto-discovery -- scans modules/*/backend/<name>/apps.py.
# Exposed as functions so they can be unit-tested in isolation.
MODULES_DIR = BASE_DIR.parent.parent / "modules"


def _topo_sort(graph):
    """Topological sort of module names so dependencies precede dependents.

    graph: dict mapping module_name -> list of required module names.
    Only edges to modules present in the graph are followed (unknown
    requirements are silently ignored -- install.py enforces completeness).
    Raises ValueError on circular dependency.
    """
    from collections import deque

    installed = set(graph)
    in_degree = {name: 0 for name in installed}
    dependents = {name: [] for name in installed}

    for name, requires in graph.items():
        for req in requires:
            if req in installed:
                in_degree[name] += 1
                dependents[req].append(name)

    queue = deque(sorted(n for n in installed if in_degree[n] == 0))
    result = []
    while queue:
        node = queue.popleft()
        result.append(node)
        for dep in sorted(dependents[node]):
            in_degree[dep] -= 1
            if in_degree[dep] == 0:
                queue.append(dep)

    if len(result) != len(installed):
        cycle = sorted(n for n in installed if n not in result)
        raise ValueError(f"Circular dependency detected among modules: {cycle}")

    return result


def _discover_modules(modules_dir):
    """Return (module_apps, extra_apps, extra_middleware, settings_defaults) for all valid modules.

    module_apps       — Django app labels for the modules themselves, topo-sorted.
    extra_apps        — Third-party Django apps declared via module.json django_apps.
    extra_middleware  — Middleware strings declared via module.json middleware.
    settings_defaults — Dict of plain key/value settings from module.json settings_defaults.
                        Earlier modules win (first declaration wins on key collision).

    Reads module.json `requires` for topological ordering.
    Inserts each module's backend/ directory into sys.path.
    Safe to call multiple times (no duplicate paths).
    """
    import json
    import logging

    if not modules_dir.exists():
        return [], [], [], {}

    graph = {}            # name -> [required module names]
    extra_apps_map = {}   # name -> [extra django app strings]
    extra_mw_map = {}     # name -> [extra middleware strings]
    settings_map = {}     # name -> {key: value}

    for entry in sorted(modules_dir.iterdir()):
        if not entry.is_dir():
            continue
        app_dir = entry / "backend" / entry.name
        if not (app_dir / "apps.py").exists():
            continue

        backend_path = str(entry / "backend")
        if backend_path not in sys.path:
            sys.path.insert(0, backend_path)

        requires = []
        extra_apps_map[entry.name] = []
        extra_mw_map[entry.name] = []
        settings_map[entry.name] = {}

        manifest = entry / "module.json"
        if manifest.exists():
            try:
                data = json.loads(manifest.read_text())
                requires = data.get("requires", [])
                assert isinstance(requires, list), "requires must be a list"
                extra_apps = data.get("django_apps", [])
                assert isinstance(extra_apps, list), "django_apps must be a list"
                extra_mw = data.get("middleware", [])
                assert isinstance(extra_mw, list), "middleware must be a list"
                s_defaults = data.get("settings_defaults", {})
                assert isinstance(s_defaults, dict), "settings_defaults must be a dict"
                extra_apps_map[entry.name] = extra_apps
                extra_mw_map[entry.name] = extra_mw
                settings_map[entry.name] = s_defaults
            except (json.JSONDecodeError, AssertionError, OSError) as exc:
                logging.getLogger(__name__).warning(
                    "module.json in %s is invalid (%s); ignoring extra config", entry.name, exc
                )

        graph[entry.name] = requires

    ordered = _topo_sort(graph)

    seen_apps = set()
    extra_apps = []
    for name in ordered:
        for app in extra_apps_map.get(name, []):
            if app not in seen_apps:
                seen_apps.add(app)
                extra_apps.append(app)

    seen_mw = set()
    extra_middleware = []
    for name in ordered:
        for mw in extra_mw_map.get(name, []):
            if mw not in seen_mw:
                seen_mw.add(mw)
                extra_middleware.append(mw)

    settings_defaults = {}
    for name in ordered:
        for key, value in settings_map.get(name, {}).items():
            if key not in settings_defaults:
                settings_defaults[key] = value

    return ordered, extra_apps, extra_middleware, settings_defaults


# Kept separate from INSTALLED_APPS so urls.py can iterate only module apps.
INSTALLED_MODULE_APPS, _module_extra_apps, _module_extra_middleware, _module_settings = (
    _discover_modules(MODULES_DIR)
)
INSTALLED_APPS += _module_extra_apps + INSTALLED_MODULE_APPS
MIDDLEWARE += _module_extra_middleware

# Apply module settings_defaults — only sets keys not already defined in this file.
import importlib as _importlib
_current_module = _importlib.import_module(__name__)
for _key, _val in _module_settings.items():
    if not hasattr(_current_module, _key):
        globals()[_key] = _val
del _current_module, _importlib, _key, _val

# Required by django.contrib.sites (added automatically when a module declares it).
if 'django.contrib.sites' in INSTALLED_APPS:
    SITE_ID = 1
