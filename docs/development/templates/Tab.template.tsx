/**
 * TEMPLATE: Nouvel onglet (Tab)
 *
 * Utilisation:
 * 1. Créer un dossier apps/web/src/app/components/tabs/my-feature-tab/
 * 2. Copier ce fichier en MyFeatureTab.tsx et index.ts (voir ci-dessous).
 * 3. Suivre la checklist dans docs/development/ADDING_FEATURES.md (tabConfig, DashboardScreen, menu).
 */

import React from 'react';
import { TabFooter } from '@/components/common/TabFooter';

export default function MyFeatureTab() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--ft-color-bg)',
        fontFamily: '"IBM Plex Mono", "Consolas", monospace',
      }}
    >
      {/* En-tête optionnel */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--ft-border-color)',
          backgroundColor: 'var(--ft-color-panel)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '14px', color: 'var(--ft-color-primary)' }}>
          MY FEATURE TAB
        </h2>
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        <p style={{ color: 'var(--ft-color-text-muted)', fontSize: 'var(--ft-font-size-small)' }}>
          Contenu de l'onglet.
        </p>
      </div>

      <TabFooter />
    </div>
  );
}

/* ----- index.ts (à créer dans le même dossier) -----
export { default } from './MyFeatureTab';
export { default as MyFeatureTab } from './MyFeatureTab';
*/
