# Données de marché SWAP (template)

Pour utiliser des **données de swaps en temps réel** que vous remplissez vous-même :

1. **Copiez** `swap_market_data_template.json` (à la racine du projet) vers **`swap_market_data.json`**.
2. Placez `swap_market_data.json` à la **racine du projet** ou dans le dossier **`data/`**.
3. **Renseignez** les champs (€STR, EURIBOR, courbe des taux, IRS, futures). Les valeurs du template sont des exemples.
4. L’onglet **SWAP** charge automatiquement ce fichier et l’utilise pour **compléter ou remplacer** les données ECB lorsque celles-ci sont indisponibles ou pour forcer vos propres flux.

Pour désactiver le fichier sans le supprimer, mettez `"_disabled": true` en tête du JSON.

Vous pouvez aussi définir la variable d’environnement **`FINCEPT_SWAP_DATA`** vers le chemin complet de votre fichier JSON.
