# WebTemplate Architecture

A modular Django + React + Bulma scaffolding for internal web applications. Modules (e.g. `auth`, `fileupload`, `stripe`) are self-contained units that add functionality by being dropped into the project and installed.

---

## Design Principles

- **Isolation first.** Backend and frontend code within a module are independent of each other. Neither should import directly from the other's layer.
- **Core is the only glue.** Inter-module dependencies are declared in `module.json` and resolved by `core`. Modules never import from each other directly.
- **Convention over configuration.** Auto-discovery removes the need to manually register modules in settings, urls, or the React app. Follow the conventions and it works.
- **Each module is a git repo.** Modules live as git submodules under `modules/`. This makes versioning, sharing, and swapping modules straightforward.

---

## Repository Layout

```
project_root/
├── core/                        # Host Django project + React shell (git repo)
│   ├── backend/
│   │   ├── core/
│   │   │   ├── settings.py      # Auto-discovers modules/*/backend/
│   │   │   ├── urls.py          # Auto-includes module urlconfs
│   │   │   ├── wsgi.py
│   │   │   └── asgi.py
│   │   ├── manage.py
│   │   └── requirements.txt     # Core deps only
│   └── frontend/
│       ├── src/
│       │   ├── main.jsx         # Bootstraps React; loads module routes
│       │   ├── App.jsx          # Shell layout (nav, footer, Bulma wrappers)
│       │   └── modules.js       # Generated manifest — do not edit by hand
│       └── package.json         # npm workspaces: ["../../modules/*/frontend"]
│
├── modules/                     # One subdirectory per installed module
│   ├── auth/                    # git submodule
│   ├── fileupload/              # git submodule
│   └── stripe/                  # git submodule
│
└── install.py                   # Installs/uninstalls a module (cross-platform)
```

---

## Module Layout

Every module follows this structure exactly. Deviating breaks auto-discovery.

```
modules/auth/
├── backend/
│   └── auth/                    # Django app — name matches module folder
│       ├── __init__.py
│       ├── apps.py              # AppConfig.name = "auth"
│       ├── models.py
│       ├── views.py
│       ├── urls.py              # Mounted at /api/<module_name>/
│       ├── serializers.py
│       ├── admin.py
│       ├── signals.py           # Registered in AppConfig.ready()
│       ├── migrations/
│       └── tests/
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── routes.jsx           # Exported route definitions (path + component)
│       ├── components/          # Internal components
│       ├── api.js               # All API calls for this module
│       └── index.js             # Public exports: routes, components, nav items
│   └── package.json             # name: "@modules/auth"
└── module.json                  # Module manifest
```

---

## Module Manifest (`module.json`)

Declares everything `install.py` and the auto-discovery system need to know.

```json
{
  "name": "auth",
  "version": "1.0.0",
  "django_app": "auth",
  "npm_package": "@modules/auth",
  "url_prefix": "auth",
  "requires": [],
  "pip_packages": [
    "djangorestframework-simplejwt>=5.3"
  ],
  "description": "JWT authentication, user management, and permission groups."
}
```

`requires` lists other module names that must be installed first. `install.py` checks this before proceeding.

`pip_packages` lists Python packages (pip specifiers) that `install.py` will install into the venv. This is the authoritative declaration of a module's Python dependencies. If omitted, `install.py` falls back to `backend/requirements.txt`.

---

## Auto-Discovery

### Backend

`core/settings.py` scans `modules/*/backend/` at startup and appends each Django app to `INSTALLED_APPS`. `core/urls.py` does the same for `urlpatterns`, mounting each module's `urls.py` at `/api/<url_prefix>/`.

No manual edits to `settings.py` or `urls.py` are ever needed.

### Frontend

`install.py` regenerates `core/frontend/src/modules.js` after any module change. `main.jsx` imports this file to register routes with React Router. Nav items are also sourced from it.

`modules.js` is a generated file — it must never be edited by hand and must be committed after any install/uninstall.

---

## Install Workflow

```bash
# Install a module
python install.py add auth

# Remove a module
python install.py remove auth
```

`install.py` does the following in order:

1. Reads `modules/<name>/module.json`
2. Checks `requires` — aborts if dependencies are missing
3. Runs `pip install -r modules/<name>/backend/requirements.txt`
4. Runs `python core/backend/manage.py migrate`
5. Runs `npm install` from `core/frontend/` (workspaces picks up the new package)
6. Regenerates `core/frontend/src/modules.js`
7. On remove: reverses steps 3–6, warns if other modules depend on this one

---

## Inter-Module Communication

Modules must not import from each other. Cross-module communication uses:

- **Django signals** — a module emits a signal; another listens. Signal definitions live in the emitting module.
- **REST API** — frontend modules call each other's API endpoints, never import JS across module boundaries.
- **Shared models from `core`** — the `core` Django app owns the `User` model and any other primitives shared across modules. Modules import from `core`, not from each other.

---

## Frontend Conventions

- All API calls for a module live in that module's `api.js`. No fetch/axios calls in components.
- Routes exported from `routes.jsx` use the module name as a path prefix: `/auth/login`, `/auth/register`.
- Bulma classes are used directly. No additional CSS framework. Module-specific styles go in a `styles.css` co-located with the component.
- No global state library is assumed. `core` provides a React context for auth state; modules may provide their own contexts but must export them from `index.js`.

---

## Backend Conventions

- Each module's `urls.py` uses a consistent namespace matching the module name.
- All views are class-based (DRF `APIView` or `ViewSet`).
- Models use `core.models.User` (via `settings.AUTH_USER_MODEL`) for any user FK — never Django's `auth.User` directly.
- Migrations are committed to the module repo and must not depend on migrations in other modules.
- `AppConfig.ready()` is the only place signal handlers are connected.

---

## Development vs Production

| Concern | Development | Production |
|---|---|---|
| Error handling | `logging` to console / file | Sentry |
| Django debug | `DEBUG=True`, sqlite | `DEBUG=False`, PostgreSQL |
| React | Vite dev server (port 5173) | Built and served as static via Django |
| Auth secrets | `.env` file (not committed) | Environment variables |

A `.env.example` is maintained in `core/` documenting all required variables. `.env` is always in `.gitignore`.

---

## Rules Summary

1. **Never edit `modules.js` by hand.** It is generated by `install.py`.
2. **Modules never import from each other.** Use signals or the API.
3. **All inter-module dependencies are declared in `module.json`.** If it's not declared, it won't be enforced.
4. **Module folder name, Django app label, and `module.json` `name` field must all match.**
5. **All API calls live in `api.js`.** No inline fetch in components.
6. **Migrations are self-contained.** A module's migrations must run cleanly with only `core` present.
7. **`core` owns shared models.** No module defines a model that another module's migration depends on.
8. **`.env` is never committed.** `.env.example` is always kept current.
9. **Each module is a git submodule.** Pin versions; do not use floating HEAD in production.
10. **Run `install.py` for all module changes.** Do not manually pip-install or npm-install module packages.
