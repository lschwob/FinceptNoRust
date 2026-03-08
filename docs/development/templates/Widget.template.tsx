/**
 * TEMPLATE: Nouveau widget Dashboard
 *
 * Utilisation:
 * 1. Copier ce fichier dans apps/web/src/app/components/tabs/dashboard/widgets/
 *    et le renommer en MyFeatureWidget.tsx.
 * 2. Remplacer MyFeatureWidget, 'myfeature', et les props par vos besoins.
 * 3. Suivre la checklist dans docs/development/ADDING_FEATURES.md (index, WidgetType, renderWidget, AddWidgetModal, etc.)
 */

import React from 'react';
import { BaseWidget } from './BaseWidget';

interface MyFeatureWidgetProps {
  id: string;
  /** Optionnel: config spécifique au widget (ex: limit, category) */
  myOption?: string;
  onRemove?: () => void;
  onNavigate?: () => void;
}

export const MyFeatureWidget: React.FC<MyFeatureWidgetProps> = ({
  id,
  myOption = 'default',
  onRemove,
  onNavigate,
}) => {
  return (
    <BaseWidget
      id={id}
      title="MY FEATURE"
      onRemove={onRemove}
      onRefresh={() => window.location.reload()}
      isLoading={false}
      error={null}
      headerColor="var(--ft-color-primary)"
    >
      <div style={{ padding: '12px', color: 'var(--ft-color-text-muted)', fontSize: 'var(--ft-font-size-small)' }}>
        Content: {myOption}
        {onNavigate && (
          <button
            onClick={onNavigate}
            style={{
              marginTop: '8px',
              background: 'var(--ft-color-primary)',
              color: '#000',
              border: 'none',
              padding: '6px 12px',
              fontSize: 'var(--ft-font-size-tiny)',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
          >
            OPEN TAB
          </button>
        )}
      </div>
    </BaseWidget>
  );
};
