# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Fincept Terminal is a financial intelligence platform (React 19 + FastAPI). It's a pnpm monorepo with two services:

- **Frontend** (`apps/web`): React 19 + Vite 7 + TypeScript, port 5173
- **Backend** (`apps/api`): FastAPI + SQLite (auto-provisioned), port 8000

### Running services

Standard commands from `RUN.md`:

```bash
# Terminal 1 — API
pnpm run dev:api

# Terminal 2 — Frontend
pnpm run dev:web
```

### Non-obvious caveats

- **`~/.local/bin` must be on PATH** for `uvicorn` (and `pytest`) to work. The update script ensures this, but if you get `uvicorn: not found`, run `export PATH="$HOME/.local/bin:$PATH"`.
- **`pip install -e apps/api` fails** due to setuptools discovering both `app/` and `legacy_scripts/` as top-level packages. Install dependencies directly instead: read `apps/api/pyproject.toml` `[project].dependencies` and pass them to `pip install`.
- **API tests must run from `apps/api/`** directory so that `from app.main import app` resolves: `cd apps/api && python3 -m pytest tests/ -v`.
- **TypeScript lint (`pnpm lint:web`)** has many pre-existing errors from the Tauri desktop-to-web migration (references to `@tauri-apps/api/*`). This is expected.
- **Frontend test (`pnpm test:web`)** has a pre-existing failure — `akshareDataParser.test.ts` is a test data file with no actual vitest test suites.
- **.env files**: copy from `.env.example` before first run — `cp apps/api/.env.example apps/api/.env && cp apps/web/.env.example apps/web/.env`.
- **SQLite database** is auto-created at `apps/api/data/fincept.db` on first API startup — no external DB required.
