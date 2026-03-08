// SaveLayoutModal — Save current dashboard layout with a custom name and description.
// Same concept as dashboard templates; saved layouts appear in the template picker under "My layouts".

import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

const FC = {
  ORANGE: '#FF8800',
  WHITE: '#FFFFFF',
  GRAY: '#787878',
  DARK_BG: '#000000',
  PANEL_BG: '#0F0F0F',
  BORDER: '#2A2A2A',
  MUTED: '#4A4A4A',
  GREEN: '#00D66F',
  RED: '#FF3B3B',
};

export interface SaveLayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  widgetCount: number;
}

export const SaveLayoutModal: React.FC<SaveLayoutModalProps> = ({
  isOpen,
  onClose,
  onSave,
  widgetCount,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, description.trim());
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9998,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        backgroundColor: FC.DARK_BG,
        border: `1px solid ${FC.BORDER}`,
        width: '90vw',
        maxWidth: '420px',
        fontFamily: '"IBM Plex Mono", monospace',
      }}>
        <div style={{
          padding: '14px 16px',
          borderBottom: `1px solid ${FC.BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#0A0A0A',
        }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: FC.ORANGE, letterSpacing: '0.5px' }}>
            SAVE LAYOUT AS TEMPLATE
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: FC.GRAY, padding: '4px' }}
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '16px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: FC.MUTED, letterSpacing: '0.5px', marginBottom: '4px' }}>
              NAME *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. My Trading Desk"
              autoFocus
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                fontSize: '11px',
                fontFamily: '"IBM Plex Mono", monospace',
                backgroundColor: FC.PANEL_BG,
                border: `1px solid ${FC.BORDER}`,
                borderRadius: '2px',
                color: FC.WHITE,
                outline: 'none',
              }}
            />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '9px', fontWeight: 700, color: FC.MUTED, letterSpacing: '0.5px', marginBottom: '4px' }}>
              DESCRIPTION (OPTIONAL)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Short description of this layout"
              rows={2}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                fontSize: '10px',
                fontFamily: '"IBM Plex Mono", monospace',
                backgroundColor: FC.PANEL_BG,
                border: `1px solid ${FC.BORDER}`,
                borderRadius: '2px',
                color: FC.WHITE,
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>
          <div style={{ fontSize: '9px', color: FC.MUTED, marginBottom: '12px' }}>
            {widgetCount} widget{widgetCount !== 1 ? 's' : ''} will be saved. You can load this layout later from TEMPLATE → My layouts.
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 14px',
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.5px',
                fontFamily: '"IBM Plex Mono", monospace',
                backgroundColor: 'transparent',
                border: `1px solid ${FC.BORDER}`,
                color: FC.GRAY,
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              style={{
                padding: '6px 14px',
                fontSize: '9px',
                fontWeight: 700,
                letterSpacing: '0.5px',
                fontFamily: '"IBM Plex Mono", monospace',
                backgroundColor: name.trim() ? FC.GREEN : FC.MUTED,
                border: 'none',
                color: name.trim() ? FC.DARK_BG : FC.GRAY,
                cursor: name.trim() ? 'pointer' : 'not-allowed',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Save size={10} />
              SAVE LAYOUT
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
