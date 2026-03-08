# Ajouter de nouvelles fonctionnalités à Fincept Terminal

Ce guide décrit **exactement** les étapes pour intégrer de nouvelles fonctionnalités dans l’app : sources de données, widgets, onglets (tabs), et optionnellement templates de dashboard.

Les templates de code sont dans [`docs/development/templates/`](./templates/).

---

## 1. Ajouter une nouvelle source de données

Une source de données apparaît dans l’onglet **Data Sources** et peut être utilisée par les widgets (ex. DataSourceWidget) et le Node Editor.

### 1.1 Déclarer la config (formulaire de connexion)

**Fichiers concernés :**

- **Bases de données** : `apps/web/src/app/components/tabs/data-sources/dataSourceConfigsDatabases.ts`
- **APIs / Marché / Fichiers** : `apps/web/src/app/components/tabs/data-sources/dataSourceConfigsMarket.ts`

**Étapes :**

1. Ouvrir le fichier adapté à la catégorie (database → Databases, api/streaming/market-data → Market).
2. Copier le bloc d’objet depuis [`docs/development/templates/dataSourceConfig.template.ts`](./templates/dataSourceConfig.template.ts) et l’ajouter au tableau existant (`RELATIONAL_DB_CONFIGS`, `API_SOURCE_CONFIGS`, etc.).
3. Remplacer :
   - `id` / `type` : identifiant unique (ex. `my-api`)
   - `name` : libellé affiché
   - `category` : `'database' | 'api' | 'file' | 'streaming' | 'cloud' | 'timeseries' | 'market-data'`
   - `icon`, `color`, `description`
   - `fields` : champs du formulaire (voir `DataSourceField` dans `data-sources/types.ts` : `text`, `password`, `number`, `url`, `select`, `textarea`, `checkbox`, `file`).
4. Si vous avez créé un **nouveau fichier** de config (ex. `dataSourceConfigsMySource.ts`), dans `dataSourceConfigs.ts` :
   - importer le tableau
   - l’ajouter à `DATA_SOURCE_CONFIGS` : `[...MARKET_SOURCE_CONFIGS, ...MY_SOURCE_CONFIGS]`.

La nouvelle source apparaît dans l’UI Data Sources ; les connexions sont gérées par `dataSourceRegistry` (persistance SQLite).

### 1.2 (Optionnel) Adapter pour test / requêtes

Si la source doit être **testable** ou **requêtable** côté front (test connexion, appels API), il faut un **adapter**.

**Étapes :**

1. Copier [`docs/development/templates/Adapter.template.ts`](./templates/Adapter.template.ts) dans  
   `apps/web/src/app/components/tabs/data-sources/adapters/`  
   et renommer en `MySourceAdapter.ts` (nom cohérent avec le `type` de la config).
2. Dans le fichier :
   - Renommer la classe (ex. `MySourceAdapter`).
   - Implémenter `testConnection()` (obligatoire) : utiliser `this.getConfig('...')` pour lire la config, puis `this.createSuccessResult()` / `this.createErrorResult()`.
   - Optionnel : surcharger `query()`, `connect()`, `disconnect()` si besoin.
3. Enregistrer l’adapter dans **`adapters/index.ts`** :
   - Ajouter : `import { MySourceAdapter } from './MySourceAdapter';`
   - Dans `ADAPTER_MAP`, ajouter : `'my-source-id': MySourceAdapter` (la clé doit être le `type` de la config).

Après cela, le bouton « Test » dans l’onglet Data Sources utilisera cet adapter pour votre type.

---

## 2. Ajouter un nouveau widget (Dashboard)

Un widget apparaît dans le **Dashboard** (grille) et dans la modale « Add Widget ».

**Fichiers à modifier :**

| Fichier | Rôle |
|--------|------|
| `apps/web/src/app/components/tabs/dashboard/widgets/MyFeatureWidget.tsx` | Composant (à créer) |
| `apps/web/src/app/components/tabs/dashboard/widgets/index.ts` | Exports, `WidgetType`, `DEFAULT_WIDGET_CONFIGS` |
| `apps/web/src/app/components/tabs/dashboard/DashboardTab.tsx` | `renderWidget()` + liste des widgets configurables |
| `apps/web/src/app/components/tabs/dashboard/AddWidgetModal.tsx` | `WIDGET_OPTIONS` |
| (optionnel) `apps/web/src/app/components/tabs/dashboard/dashboardTemplates.ts` | Templates de layout |

### Checklist détaillée

1. **Créer le composant widget**
   - Copier [`docs/development/templates/Widget.template.tsx`](./templates/Widget.template.tsx) dans  
     `apps/web/src/app/components/tabs/dashboard/widgets/`  
     et renommer en `MyFeatureWidget.tsx`.
   - Adapter les props (`id`, config spécifique, `onRemove`, `onNavigate`, etc.) et le contenu.
   - Utiliser `BaseWidget` pour le cadre (titre, refresh, remove, loading, error).

2. **Exporter et typer dans `widgets/index.ts`**
   - Ajouter : `export { MyFeatureWidget } from './MyFeatureWidget';`
   - Dans le type **`WidgetType`** : ajouter une valeur, ex. `| 'myfeature'`.
   - Dans **`DEFAULT_WIDGET_CONFIGS`** : ajouter une entrée, ex. :
     ```ts
     myfeature: {
       type: 'myfeature',
       title: 'My Feature',
       config: { myOption: 'default' }
     },
     ```
   - Si votre widget a des options de config, les documenter dans l’interface `WidgetConfig['config']` (optionnel mais recommandé).

3. **Brancher le rendu dans `DashboardTab.tsx`**
   - Importer : `import { MyFeatureWidget } from './widgets';`
   - Dans **`renderWidget()`**, ajouter un `case` :
     ```ts
     case 'myfeature':
       return <MyFeatureWidget id={widget.id} myOption={widget.config?.myOption} onRemove={() => handleRemoveWidget(widget.id)} onNavigate={() => onNavigateToTab?.('my-feature-tab')} />;
     ```
   - Si le widget est **configurable** (bouton réglages), ajouter `'myfeature'` dans la liste `isConfigurable` (même fonction).

4. **Apparition dans la modale « Add Widget »**
   - Dans **`AddWidgetModal.tsx`**, dans **`WIDGET_OPTIONS`**, ajouter un objet :
     ```ts
     { type: 'myfeature', label: 'MY FEATURE', description: 'Short description', icon: <YourIcon size={14} />, color: FC.CYAN, category: 'data' },
     ```
   - `category` : `'markets' | 'data' | 'analysis' | 'tools'`.

5. **(Optionnel) Templates de dashboard**
   - Dans `dashboardTemplates.ts`, dans un `DashboardTemplate` existant (ou un nouveau), ajouter une entrée dans `widgets` avec `type: 'myfeature'`, `title`, `config`, et `layout` (grille react-grid-layout).

Après ces étapes, le widget est ajoutable depuis le Dashboard et rendu correctement.

---

## 3. Ajouter un nouvel onglet (Tab)

Un nouvel onglet apparaît dans la barre d’onglets / le menu et affiche un écran dédié.

**Fichiers à modifier :**

| Fichier | Rôle |
|--------|------|
| `apps/web/src/app/types/tabConfig.ts` | Définition de l’onglet + menu |
| `apps/web/src/app/components/dashboard/DashboardScreen.tsx` | Import du composant + `TabsContent` |
| `apps/web/src/app/components/tabs/my-feature-tab/` | Composant du tab (à créer) |

### Checklist détaillée

1. **Créer le composant d’onglet**
   - Créer le dossier : `apps/web/src/app/components/tabs/my-feature-tab/`.
   - Copier le contenu de [`docs/development/templates/Tab.template.tsx`](./templates/Tab.template.tsx) dans `MyFeatureTab.tsx`.
   - Créer `index.ts` :
     ```ts
     export { default } from './MyFeatureTab';
     export { default as MyFeatureTab } from './MyFeatureTab';
     ```
   - Adapter le contenu et le style (Design System : `var(--ft-color-*)`, `TabFooter` si besoin).

2. **Déclarer l’onglet dans `tabConfig.ts`**
   - Dans **`DEFAULT_TABS`**, ajouter une entrée :
     ```ts
     { id: 'my-feature', label: 'My Feature', value: 'my-feature', shortcut: 'Ctrl+Shift+F', component: 'MyFeatureTab' },
     ```
   - (Optionnel) Dans **`DEFAULT_TAB_CONFIG`** :
     - Pour l’en-tête : ajouter `'my-feature'` dans `headerTabs`.
     - Pour le menu : ajouter `'my-feature'` dans un `menuSections[].tabs` existant ou créer une nouvelle section.

3. **Importer et rendre dans `DashboardScreen.tsx`**
   - **Import** (en haut du fichier) :
     - Onglet léger : `import MyFeatureTab from '@/components/tabs/my-feature-tab';`
     - Onglet lourd :  
       `const MyFeatureTab = React.lazy(() => import('@/components/tabs/my-feature-tab'));`
   - **Rendu** : dans la zone des `<TabsContent>`, ajouter :
     ```tsx
     <TabsContent value="my-feature" className="h-full m-0 p-0">
       <React.Suspense fallback={<TabLoadingFallback />}>
         <MyFeatureTab />
       </React.Suspense>
     </TabsContent>
     ```
     (Sans `Suspense` si l’import n’est pas lazy.)

4. **(Optionnel) Raccourci clavier**
   - Si vous avez mis un `shortcut` dans `tabConfig`, les F1–F12 sont déjà gérés dans `DashboardScreen.tsx`. Pour un raccourci personnalisé (ex. Ctrl+Q), ajouter un `useEffect` avec `keydown` qui appelle `setActiveTab('my-feature')`.

5. **(Optionnel) Menu Navigate**
   - Dans `DashboardScreen.tsx`, dans `navigateMenuItems`, ajouter une entrée, ex. :
     ```ts
     { label: 'My Feature', action: () => setActiveTab('my-feature') },
     ```

Après ces étapes, l’onglet est accessible depuis l’UI et le menu.

---

## 4. Récapitulatif des emplacements

| Élément | Fichiers principaux |
|--------|----------------------|
| **Config source de données** | `data-sources/dataSourceConfigs*.ts`, `dataSourceConfigs.ts` |
| **Adapter source de données** | `data-sources/adapters/MyAdapter.ts`, `adapters/index.ts` |
| **Widget** | `dashboard/widgets/MyWidget.tsx`, `widgets/index.ts`, `DashboardTab.tsx`, `AddWidgetModal.tsx` |
| **Tab** | `types/tabConfig.ts`, `DashboardScreen.tsx`, `tabs/my-feature-tab/` |
| **Templates de dashboard** | `dashboard/dashboardTemplates.ts` |

---

## 5. Templates de code

- **Config source de données** : [`templates/dataSourceConfig.template.ts`](./templates/dataSourceConfig.template.ts)
- **Adapter source de données** : [`templates/Adapter.template.ts`](./templates/Adapter.template.ts)
- **Widget** : [`templates/Widget.template.tsx`](./templates/Widget.template.tsx)
- **Tab** : [`templates/Tab.template.tsx`](./templates/Tab.template.tsx)

En suivant ce README et en copiant/adaptant ces templates, toute nouvelle source de données, widget ou onglet est directement intégrable dans l’app.
