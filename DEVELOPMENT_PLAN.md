# Development Plan

Builds the core scaffolding and a Hello World module that proves the full system end-to-end. Each phase produces a working, testable checkpoint before the next begins.

**Environment:** Windows (Git Bash for shell scripts), SQLite for development, PostgreSQL for production.  
**Stack:** Python 3.12+, Django 5.x, DRF, Node 20 LTS, Vite, React 18, Bulma.

---

## Phase 0 — Repository & Environment Setup

Goal: reproducible local environment on Windows; nothing hardcoded.

### 0.1 Project root repository

- DONE: Initialise `project_root` as a git repo.
- Create `.gitignore` covering: `__pycache__`, `*.pyc`, `.env`, `node_modules`, `dist`, `venv`, `*.sqlite3`, `.DS_Store`.
- Create `.env.example` in `core/backend/` with all required keys and placeholder values (see Phase 2.1).
- Commit initial skeleton: empty `modules/`, `core/`, `install.sh` stub, this plan, and `ARCHITECTURE.md`.

### 0.2 Python environment

- DONE Create `venv` at project root `venv/` using `python -m venv venv`. (Note: venv lives at project root, not `core/backend/venv/` — `install.sh` reflects this.)
- DONE Add `venv/` to `.gitignore`.
- DONE Pin Python version in `.python-version` at project root (Python 3.12.2).
- DONE Install initial packages: `django`, `djangorestframework`, `python-dotenv`, `sentry-sdk`.
- DONE Freeze to `core/backend/requirements.txt` (includes `django-cors-headers`).

### 0.3 Node environment

- DONE: Initialise `core/frontend/` with `npm create vite@latest . -- --template react`.
- DONE: Install Bulma: `npm install bulma`.
- Configure `vite.config.js` with proxy: all `/api/` requests forwarded to `http://localhost:8000` during development. This means the React dev server and Django can run simultaneously with no CORS issues in development.
- Add `node_modules/` and `dist/` to `.gitignore`.

### 0.4 Git Bash on Windows

- All `.sh` scripts use `#!/usr/bin/env bash` and Unix line endings (LF). Configure git: `git config core.autocrlf input`.
- Document in README: developers run scripts via Git Bash, not PowerShell or CMD.
- `install.sh` is runnable from project root: `bash install.sh add <module>`.

**Checkpoint:** `python manage.py check` passes (Phase 2 prerequisite). `npm run dev` starts Vite. No hardcoded paths or secrets anywhere.

---

## Phase 1 — Core Backend Foundation

Goal: a Django project that starts cleanly, has a custom User model, and is structured for long-term safety.

### 1.1 Django project scaffold

- Create Django project inside `core/backend/`: `django-admin startproject core .`  
  (The `.` puts `manage.py` at `core/backend/manage.py` and the project package at `core/backend/core/`.)
- Split settings into three files:
  - `core/settings/base.py` — shared config.
  - `core/settings/development.py` — imports base, sets `DEBUG=True`, SQLite, console logging.
  - `core/settings/production.py` — imports base, sets `DEBUG=False`, reads DB from env, Sentry, file/stream logging.
- `manage.py` uses `development.py` by default; production uses an environment variable `DJANGO_SETTINGS_MODULE=core.settings.production`.

### 1.2 Environment variable loading

- `base.py` loads `.env` via `python-dotenv` at startup (development only — production vars come from the server environment).
- All secrets (`SECRET_KEY`, `DATABASE_URL`, `SENTRY_DSN`) are read from environment, never hardcoded.
- `SECRET_KEY` in development can be a fixed dev-only value documented in `.env.example`; production must use a generated key.

### 1.3 Custom User model

- Create a `core` Django app: `python manage.py startapp core_app` (named `core_app` to avoid collision with the project package `core`).
- Define `CustomUser(AbstractUser)` — initially just extends `AbstractUser` with no changes. Doing this now prevents a painful migration later.
- Set `AUTH_USER_MODEL = "core_app.CustomUser"` in `base.py`.
- Write and run the initial migration.

### 1.4 Logging setup

- Development: `logging` to console at `DEBUG` level, formatted with timestamp, level, and logger name.
- Production: `logging` to a rotating file at `WARNING` level plus Sentry for `ERROR` and above.
- A single `get_logger(__name__)` call at the top of each module file is the convention.
- Sentry initialised in `production.py` only, reading `SENTRY_DSN` from env. If `SENTRY_DSN` is absent, Sentry is silently skipped.

### 1.5 Base API structure

- Install and configure `djangorestframework` in `INSTALLED_APPS`.
- Set default renderer to JSON only in production (browsable API on in development).
- Create `core/backend/core/urls.py` with a single health-check endpoint: `GET /api/health/` returns `{"status": "ok", "version": "..."}`. This endpoint is used by the deployment pipeline to verify a successful deploy.
- Write a test for the health endpoint.

### 1.6 CORS

- Install `django-cors-headers`.
- Development: allow `http://localhost:5173` (Vite dev server).
- Production: allow only the configured `ALLOWED_HOSTS` domain.

**Checkpoint:** `python manage.py test` passes. `GET /api/health/` returns 200. No warnings from `python manage.py check`.

---

## Phase 2 — Core Frontend Foundation

Goal: React shell with Bulma layout, React Router, and a clean pattern for loading module routes.

### 2.1 App shell

- `App.jsx` renders a Bulma `navbar`, a `<main>` content area, and a `footer`.
- Navbar links are populated from the module manifest at runtime (not hardcoded).
- `main.jsx` wraps the app in `<BrowserRouter>` and a `CoreProvider` context (provides auth state — initially just `{user: null}`).

### 2.2 Routing architecture

- Install `react-router-dom`.
- `main.jsx` imports `moduleRoutes` from `./modules.js` (the generated manifest) and passes them to a `<Routes>` block alongside core routes.
- Core routes initially: `/` (home placeholder), `*` (404 page).
- Module routes are injected: `moduleRoutes.forEach(r => <Route path={r.path} element={r.element} />)`.

### 2.3 `modules.js` — initial state

- Create the file with empty exports so the app compiles before any module is installed:
  ```js
  // Generated by install.sh — do not edit by hand
  export const moduleRoutes = [];
  export const moduleNavItems = [];
  ```

### 2.4 API client utility

- Create `core/frontend/src/api.js` — a thin wrapper around `fetch` that:
  - Prefixes all calls with `/api/`.
  - Attaches a CSRF token header (reads from cookie).
  - Handles non-2xx responses by throwing a structured error.
  - Logs errors to console in development.
- All module `api.js` files import and use this utility; they do not call `fetch` directly.

### 2.5 Bulma baseline

- Import Bulma in `main.jsx`: `import "bulma/css/bulma.min.css"`.
- Create a `core/frontend/src/components/` folder with two starter components:
  - `Notification.jsx` — wraps Bulma's notification for displaying API errors.
  - `LoadingSpinner.jsx` — Bulma-based spinner for async states.
- These are available to all modules via the core package (once workspaces are configured).

### 2.6 npm workspaces

- Add `"workspaces": ["../../modules/*/frontend"]` to `core/frontend/package.json`.
- This means `npm install` run from `core/frontend/` installs all module frontend packages as linked local packages. No publishing required.

**Checkpoint:** `npm run dev` shows the Bulma shell with empty nav and a working 404 page. No console errors. `npm run build` produces a clean dist.

---

## Phase 3 — Module Auto-Discovery System

Goal: dropping a folder into `modules/` and running `install.sh` is the only action needed to integrate a module.

### 3.1 Backend auto-discovery

In `core/settings/base.py`, after the static `INSTALLED_APPS` list, add a discovery block:

```python
import os
from pathlib import Path

MODULES_DIR = BASE_DIR.parent.parent / "modules"

def _discover_modules():
    """Scan modules/ and return list of Django app labels for installed modules."""
    apps = []
    if MODULES_DIR.exists():
        for entry in sorted(MODULES_DIR.iterdir()):
            app_dir = entry / "backend" / entry.name
            if app_dir.is_dir() and (app_dir / "apps.py").exists():
                apps.append(entry.name)
    return apps

INSTALLED_APPS += _discover_modules()
```

Write a test that asserts `_discover_modules()` returns the correct list given a known directory structure (use `tmp_path` fixture to create fake module dirs).

### 3.2 URL auto-discovery

In `core/urls.py`, replace the static `urlpatterns` list tail with a discovery block:

```python
import importlib

def _module_urlpatterns():
    patterns = []
    for module_name in settings.INSTALLED_APPS:
        try:
            urls_module = importlib.import_module(f"{module_name}.urls")
            prefix = module_name.replace("_", "-")
            patterns.append(path(f"api/{prefix}/", include(urls_module)))
        except ModuleNotFoundError:
            pass
    return patterns

urlpatterns += _module_urlpatterns()
```

Write a test that mounts a minimal fake module and asserts its URL is reachable.

### 3.3 `install.sh` — manifest regeneration

The script's regeneration step writes `core/frontend/src/modules.js`:

```bash
generate_manifest() {
  local output="core/frontend/src/modules.js"
  echo "// Generated by install.sh — do not edit by hand" > "$output"
  
  local routes="[]"
  local nav="[]"
  
  for module_dir in modules/*/; do
    local name
    name=$(basename "$module_dir")
    local manifest="$module_dir/module.json"
    
    if [[ -f "$manifest" ]]; then
      echo "import { routes as ${name}Routes, navItems as ${name}Nav } from '@modules/${name}';" >> "$output"
    fi
  done
  
  echo "export const moduleRoutes = [$(join_routes)];" >> "$output"
  echo "export const moduleNavItems = [$(join_nav)];" >> "$output"
}
```

The exact join logic is implemented in Phase 5. The pattern is established here.

### 3.4 `AppConfig.ready()` convention

Document and enforce the pattern for module signal registration:

```python
# modules/auth/backend/auth/apps.py
class AuthConfig(AppConfig):
    name = "auth"

    def ready(self):
        import auth.signals  # noqa: F401 — side effects only
```

Write a test asserting that `AuthConfig.ready()` does not raise and that signal handlers are connected after `django.setup()`.

**Checkpoint:** With an empty `modules/` directory, Django starts cleanly, all tests pass, and the frontend compiles with no module routes.

---

## Phase 4 — `install.sh` Script

Goal: a single, reliable script that manages the full module lifecycle.

### 4.1 Script structure

```
install.sh add <module_name>
install.sh remove <module_name>
```

Steps for `add`:

1. Verify `modules/<name>/` exists and contains `module.json`.
2. Parse `requires` from `module.json` (use `python -c` or `jq` if available, with a pure-bash fallback).
3. For each required module, verify it is present in `modules/`; abort with a clear message if not.
4. Run `pip install -r modules/<name>/backend/requirements.txt` inside the active venv.
5. Run `python core/backend/manage.py migrate`.
6. Run `npm install` from `core/frontend/` (workspaces links the new package automatically).
7. Regenerate `core/frontend/src/modules.js`.
8. Print a summary: module name, steps completed, any warnings.

Steps for `remove`:

1. Check whether any other installed module lists `<name>` in its `requires`; warn and abort if so.
2. Remove the module's pip packages (best-effort — warn if unable).
3. Regenerate `core/frontend/src/modules.js`.
4. Print instructions for any manual cleanup (e.g. squash or reverse migrations before removing from production DB).

### 4.2 Error handling

- The script uses `set -euo pipefail` so any failure exits immediately.
- Each major step is wrapped with a descriptive error message on failure.
- The script is idempotent: running `add` on an already-installed module is a no-op with a notice.

### 4.3 Venv activation

- The script activates the venv automatically: `source core/backend/venv/Scripts/activate` (Windows Git Bash path) with a fallback to `venv/bin/activate` (Linux/Mac, used in CI and production).
- The script detects the OS and uses the appropriate path.

**Checkpoint:** `bash install.sh add <nonexistent>` fails with a clear error. Calling `add` with a valid module dir (even an empty stub with only `module.json`) completes without error.

---

## Phase 5 — Hello World Module

Goal: a fully working module that exercises every part of the system — backend view, frontend component, auto-discovery, install/remove cycle, and end-to-end connectivity.

### 5.1 Module scaffold

Create `modules/helloworld/` with the full required structure:

```
modules/helloworld/
├── backend/
│   └── helloworld/
│       ├── __init__.py
│       ├── apps.py
│       ├── models.py       # empty — no models needed for this module
│       ├── views.py
│       ├── urls.py
│       ├── serializers.py  # empty
│       ├── signals.py      # empty
│       ├── migrations/
│       │   └── __init__.py
│       └── tests/
│           ├── __init__.py
│           └── test_views.py
│   └── requirements.txt    # empty
├── frontend/
│   └── src/
│       ├── routes.jsx
│       ├── components/
│       │   └── HelloWorldPage.jsx
│       ├── api.js
│       └── index.js
│   └── package.json
└── module.json
```

`module.json`:
```json
{
  "name": "helloworld",
  "version": "1.0.0",
  "django_app": "helloworld",
  "npm_package": "@modules/helloworld",
  "url_prefix": "helloworld",
  "requires": [],
  "description": "Reference implementation. Demonstrates the full module system."
}
```

### 5.2 Backend view

`views.py` — a single DRF `APIView`:

```python
class HelloWorldView(APIView):
    """Returns a greeting. Proves the module is installed and reachable."""

    def get(self, request):
        logger.debug("HelloWorldView called")
        return Response({"message": "Hello from the helloworld module.", "module": "helloworld"})
```

`urls.py` mounts it at the root of the module's prefix:

```python
urlpatterns = [path("", HelloWorldView.as_view(), name="helloworld")]
```

After auto-discovery this is reachable at `GET /api/helloworld/`.

Write tests:
- `GET /api/helloworld/` returns 200 and the expected JSON.
- Module is present in `INSTALLED_APPS` after discovery.
- URL is registered in `urlpatterns`.

### 5.3 Frontend component

`HelloWorldPage.jsx` — calls `GET /api/helloworld/` on mount and displays the response:

```jsx
export default function HelloWorldPage() {
  const [message, setMessage] = useState(null);
  const [error, setError]     = useState(null);

  useEffect(() => {
    get("helloworld/")
      .then(data => setMessage(data.message))
      .catch(err => setError(err.message));
  }, []);

  return (
    <section className="section">
      <div className="container">
        <h1 className="title">Hello World</h1>
        {error   && <Notification color="danger">{error}</Notification>}
        {message && <p className="subtitle">{message}</p>}
        {!message && !error && <LoadingSpinner />}
      </div>
    </section>
  );
}
```

`routes.jsx`:
```jsx
import HelloWorldPage from "./components/HelloWorldPage";
export const routes    = [{ path: "/helloworld", element: <HelloWorldPage /> }];
export const navItems  = [{ label: "Hello World", path: "/helloworld" }];
```

`index.js`:
```js
export { routes, navItems } from "./routes.jsx";
```

### 5.4 Integration test

With the module installed:

1. Start Django dev server.
2. Start Vite dev server.
3. Navigate to `http://localhost:5173/helloworld`.
4. Assert: page loads, spinner shows briefly, then "Hello from the helloworld module." appears.
5. Assert: navbar contains a "Hello World" link.

This is a manual test for now; it becomes an automated Playwright test in a future phase.

### 5.5 Install/remove cycle test

Run these in sequence and assert each succeeds:

```bash
bash install.sh add helloworld
# assert: module in INSTALLED_APPS, /api/helloworld/ returns 200, nav link visible

bash install.sh remove helloworld
# assert: module not in INSTALLED_APPS, /api/helloworld/ returns 404, nav link gone

bash install.sh add helloworld
# assert: system returns to working state cleanly
```

**Checkpoint:** Full install/remove/reinstall cycle works. Django tests pass. Frontend shows the greeting retrieved from the API.

---

## Phase 6 — CI / CD Pipeline

Goal: every push to `main` runs tests; merges to `main` deploy to the production server.

### 6.1 GitHub Actions — test workflow

File: `.github/workflows/test.yml`  
Trigger: push and pull_request to any branch.

Steps:
1. Checkout repo with submodules (`submodules: recursive`).
2. Set up Python 3.12, cache pip.
3. Install deps: `pip install -r core/backend/requirements.txt`.
4. Run Django tests: `python core/backend/manage.py test --settings=core.settings.development`.
5. Set up Node 20, cache npm.
6. `npm install` from `core/frontend/`.
7. `npm run build` — fails the build if the frontend does not compile.

No secrets needed for the test workflow.

### 6.2 GitHub Actions — deploy workflow

File: `.github/workflows/deploy.yml`  
Trigger: push to `main` only.

Steps:
1. Tests pass (depends on test workflow or inline test run).
2. SSH into production server using a deploy key stored as a GitHub secret (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`).
3. On server, run deploy script `scripts/deploy.sh` (committed to repo).

`scripts/deploy.sh` on the server:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$DEPLOY_PATH"

git pull --ff-only
git submodule update --init --recursive

source venv/bin/activate
pip install -r core/backend/requirements.txt --quiet

python core/backend/manage.py migrate --settings=core.settings.production --no-input
python core/backend/manage.py collectstatic --settings=core.settings.production --no-input

cd core/frontend
npm install --quiet
npm run build

# Reload app server (adjust to match server setup — gunicorn via systemd)
sudo systemctl reload gunicorn
```

### 6.3 Production server assumptions

- Ubuntu server running Nginx + Gunicorn + systemd.
- Gunicorn serves `core.wsgi` from the venv.
- Nginx serves `core/frontend/dist/` as static files and proxies `/api/` to Gunicorn.
- PostgreSQL running locally; credentials in environment variables loaded by systemd unit.
- The deploy user has passwordless `sudo` rights only for `systemctl reload gunicorn`.

Document these assumptions in a `docs/server-setup.md` (written when setting up the production server, not now).

### 6.4 Deployment verification

After `systemctl reload gunicorn`, the deploy script calls:

```bash
curl -sf https://<domain>/api/health/ | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d['status']=='ok' else 1)"
```

If the health check fails, the script exits non-zero, marking the GitHub Actions run as failed and alerting the team.

### 6.5 Secrets management

GitHub Actions secrets required:

| Secret | Description |
|---|---|
| `DEPLOY_SSH_KEY` | Private key for deploy user on production server |
| `DEPLOY_HOST` | Production server hostname or IP |
| `DEPLOY_USER` | SSH username |
| `DEPLOY_PATH` | Absolute path to project root on server |
| `SENTRY_DSN` | Injected into server environment via systemd unit |

No secrets are ever committed to the repo. `.env.example` documents what is needed locally.

**Checkpoint:** A push to `main` triggers tests, then deploy. Health check passes post-deploy. A deliberate test failure blocks the deploy.

---

## Phase 7 — Hardening & Documentation

Goal: the system is ready to use as a foundation for real modules.

### 7.1 Backend hardening

- Add `django-extensions` for development utilities.
- Add `whitenoise` to serve static files from Gunicorn without Nginx involvement (simplifies low-traffic deployments).
- Review `SECURITY_*` Django settings for production (`HSTS`, `SECURE_COOKIES`, `X_FRAME_OPTIONS` etc.) and set appropriately.
- Add a `scripts/create_superuser.py` management command that creates an admin user from environment variables — used in initial server setup and CI if needed.

### 7.2 Frontend hardening

- `npm run build` output analysed with `vite-bundle-visualizer` — confirm no unexpected large dependencies.
- Environment variable handling: Vite exposes `VITE_API_BASE_URL` which the API client uses in production to target the correct domain.
- Add `eslint` and a `.eslintrc` with sensible defaults.

### 7.3 Documentation

- `README.md` at project root: prerequisites, local setup steps (numbered, copy-pasteable), how to add a module, how to run tests.
- `docs/new-module.md`: step-by-step guide for creating a new module from scratch, using `helloworld` as the reference.
- `docs/server-setup.md`: production server provisioning checklist (Nginx config, Gunicorn systemd unit, PostgreSQL setup, initial deploy).

### 7.4 Final integration check

Run through the complete workflow from a clean checkout:

1. Clone repo with `--recurse-submodules`.
2. Follow README setup steps verbatim.
3. `bash install.sh add helloworld`.
4. Run all tests — zero failures.
5. Confirm frontend dev server shows Hello World page with live API response.
6. Push to a test branch; confirm CI passes.

**Checkpoint:** A new developer can follow the README from zero to running in under 30 minutes.

---

## Build Order Summary

| Phase | Deliverable | Tests |
|---|---|---|
| 0 | Repo, venv, Vite scaffold, `.gitignore`, `.env.example` | Manual: both servers start |
| 1 | Django project, custom User, settings split, health endpoint, CORS | `manage.py test` |
| 2 | React shell, Bulma layout, Router, empty `modules.js`, API client | `npm run build` clean |
| 3 | Auto-discovery (settings + urls), `modules.js` generation logic | Unit tests for discovery fns |
| 4 | `install.sh` add/remove, venv detection, idempotency | Script error-path tests |
| 5 | `helloworld` module, install/remove cycle, end-to-end API call | Django tests + manual E2E |
| 6 | GitHub Actions test + deploy workflows, health-check gate | CI run on push |
| 7 | Security settings, README, new-module guide, clean-clone test | Full regression |

Each phase merges to `main` only when its checkpoint is met.
