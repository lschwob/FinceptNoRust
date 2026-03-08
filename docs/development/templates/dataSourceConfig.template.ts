/**
 * TEMPLATE: Nouvelle source de données (config)
 *
 * Utilisation:
 * 1. Coller l'objet ci-dessous dans dataSourceConfigsMarket.ts OU dataSourceConfigsDatabases.ts
 *    (dans apps/web/src/app/components/tabs/data-sources/).
 *    Ces fichiers importent déjà DataSourceConfig depuis './types'.
 * 2. Remplacer my-source-id, "My Source Name", etc. par vos valeurs.
 * 3. Si vous créez un nouveau fichier de config, l'ajouter dans dataSourceConfigs.ts.
 *
 * Catégories: 'database' | 'api' | 'file' | 'streaming' | 'cloud' | 'timeseries' | 'market-data'
 * Types de champs: 'text' | 'password' | 'number' | 'url' | 'select' | 'textarea' | 'checkbox' | 'file'
 */
// Dans dataSourceConfigsMarket.ts ou dataSourceConfigsDatabases.ts, ajouter cet objet au tableau
// (API_SOURCE_CONFIGS ou RELATIONAL_DB_CONFIGS / autre). DataSourceConfig est déjà importé.

{
  id: 'my-source-id',                    // identifiant unique (kebab-case)
  name: 'My Source Name',                 // nom affiché
  type: 'my-source-id',                   // même que id en général
  category: 'api',                        // database | api | file | streaming | cloud | timeseries | market-data
  icon: '🔌',                             // emoji ou caractère
  color: '#00A8E8',                       // couleur hex
  description: 'Short description for the connection form',
  testable: true,                         // peut-on tester la connexion ?
  requiresAuth: false,                    // authentification requise ?
  fields: [
    {
      name: 'endpoint',
      label: 'Endpoint URL',
      type: 'url',
      placeholder: 'https://api.example.com',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      placeholder: 'your-api-key',
      required: false,
    },
    // Exemple select:
    // { name: 'region', label: 'Region', type: 'select', required: true, defaultValue: 'us', options: [
    //   { label: 'US', value: 'us' },
    //   { label: 'EU', value: 'eu' },
    // ]},
  ],
}

// Puis dans dataSourceConfigs.ts : inclure ce config dans DATA_SOURCE_CONFIGS
// (soit en l'ajoutant au tableau existant MARKET_SOURCE_CONFIGS ou DATABASE_SOURCE_CONFIGS,
//  soit en créant un fichier dédié et en l'étalant dans DATA_SOURCE_CONFIGS).
