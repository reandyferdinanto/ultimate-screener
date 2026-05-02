import React from 'react';
import { Settings } from 'lucide-react';

interface ToggleItem {
  id: string;
  label: string;
  enabled: boolean;
  color: string;
  setEnabled: (enabled: boolean) => void;
}

interface ToggleGroupProps {
  items: ToggleItem[];
}

export default function ToggleGroup({ items }: ToggleGroupProps) {
  return (
    <div className="toggle-group">
      <div className="toggle-title">
        <Settings className="toggle-icon" size={16} />
        <span className="toggle-header">VISUAL INDICATORS</span>
      </div>
      <div className="toggle-list">
        {items.map(item => (
          <div 
            key={item.id} 
            className={`toggle-item ${item.enabled ? 'active' : 'inactive'}`}
            onClick={() => item.setEnabled(!item.enabled)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                item.setEnabled(!item.enabled);
              }
            }}
            aria-label={`Toggle ${item.label} indicator`}
          >
            <span className="toggle-label">{item.label}</span>
            <span className={`toggle-knob ${item.enabled ? 'on' : 'off'}`}></span>
          </div>
        ))}
      </div>
    </div>
  );
}