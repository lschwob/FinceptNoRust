# Lancer l’app (React + FastAPI uniquement)

Ce dépôt contient uniquement le code pour faire tourner le frontend React et l’API FastAPI (pas la desktop Tauri).

## Prérequis

- **Node.js** 18+ et **pnpm** (`npm install -g pnpm`)
- **Python** 3.11+

## Installation

```bash
# Dépendances frontend
pnpm install

# Dépendances API (depuis la racine)
pip install -e apps/api
# ou avec uv :
# uv pip install -e apps/api
```

## Lancer

```bash
# Terminal 1 — API
pnpm run dev:api

# Terminal 2 — Frontend
pnpm run dev:web
```

- Frontend : http://localhost:5173  
- API : http://localhost:8000

## Onglet Economics

Les scripts Python (World Bank, FRED, BLS, Fed, etc.) sont dans `apps/api/legacy_scripts/` (récupérés depuis [FinceptTerminal/scripts](https://github.com/Fincept-Corporation/FinceptTerminal/tree/main/fincept-terminal-desktop/src-tauri/resources/scripts)). Certaines sources nécessitent une clé API (FRED, BLS, BEA, WTO, EIA) : configure-les via l’icône clé dans l’onglet Economics.
