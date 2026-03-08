# Migration Workspace

Ce dossier centralise les artefacts de migration `Rust/Tauri/Bun -> React/FastAPI`.

## Fichiers

- `generated/inventory.json`: inventaire machine des commandes Rust, appels `invoke(...)` et imports Tauri.
- `generated/inventory.md`: version lisible de cet inventaire avec colonnes de migration.

## Commandes

```bash
pnpm run migration:inventory
pnpm run migration:parity
```

## Convention de suivi

- `non commence`: aucune implémentation FastAPI/React disponible.
- `en cours`: backend ou frontend de remplacement existe partiellement.
- `valide`: la fonctionnalité a un équivalent `web + api` et les tests de parité sont en place.
