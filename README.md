# WebTemplate

Modular Django + React + Bulma scaffolding. Add or remove modules to compose the functionality a site needs.

See `ARCHITECTURE.md` for structural decisions and `DEVELOPMENT_PLAN.md` for the build roadmap.

---

## Prerequisites

- Python 3.12+
- Node 20 LTS
- Git Bash (Windows) — all shell scripts require Bash, not PowerShell or CMD

---

## First-time setup

### 1. Clone with submodules

```bash
git clone --recurse-submodules <repo-url>
cd WebTemplate
```

### 2. Regenerate manifests

`modules.js` and `installed_modules.py` are generated files and not tracked in git. After cloning, run:

```bash
python install.py regen
```

This regenerates `core/frontend/src/modules.js` and `core/backend/core/installed_modules.py` from the installed modules. Safe to run with no modules installed.

### 3. Create and activate the virtual environment

```bash
python -m venv venv
```

Windows (Git Bash):
```bash
source venv/Scripts/activate
```

Mac / Linux:
```bash
source venv/bin/activate
```

### 3. Install Python dependencies

```bash
pip install -r backend/requirements.txt
```

### 4. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

The default values in `.env` are safe for local development — no edits needed to get started. For a real project, replace `SECRET_KEY` with a generated value:

```bash
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
```

### 5. Run database migrations

```bash
python backend/manage.py makemigrations core_app
python backend/manage.py migrate
```

### 6. Verify the backend

```bash
python backend/manage.py check
python backend/manage.py test
```

Both should complete with no errors. Then start the dev server:

```bash
python backend/manage.py runserver
```

`GET http://localhost:8000/api/health/` should return:
```json
{"status": "ok", "version": "0.1.0"}
```

### 7. Install frontend dependencies

```bash
cd frontend && npm install
```

### 8. Start the frontend dev server

```bash
npm run dev
```

The app is available at `http://localhost:5173`. API calls to `/api/` are proxied automatically to Django on port 8000 — both servers need to be running.

---

## Installing a module

From the project root with the venv activated:

```bash
python install.py add <module_name>
```

The script installs Python and Node dependencies, creates symlinks in `backend/` and `frontend/modules/`, runs migrations, and regenerates the frontend route manifest. No manual edits to settings or URLs are needed.

To remove a module:

```bash
python install.py remove <module_name>
```

---

## Running tests

Backend:
```bash
python backend/manage.py test
```

Frontend (lint):
```bash
cd frontend && npm run lint
```

---

## Adding a new module

See `docs/new-module.md`
The `modules/helloworld` module is the reference implementation.
