import React from 'react';

interface ChartTypeSelectorProps {
  chartType: 'candle' | 'line';
  onChartTypeChange: (type: 'candle' | 'line') => void;
}

export default function ChartTypeSelector({ chartType, onChartTypeChange }: ChartTypeSelectorProps) {
  return (
    <div className="toggle-group">
      <div className="toggle-title">
        <span className="toggle-header">CHART TYPE</span>
      </div>
      <div className="toggle-list">
        <div 
          className={`toggle-item ${chartType === 'candle' ? 'active' : 'inactive'}`}
          onClick={() => onChartTypeChange('candle')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onChartTypeChange('candle');
            }
          }}
          aria-label="Select candle chart type"
        >
          <span className="toggle-label">CANDLE</span>
          <span className={`toggle-knob ${chartType === 'candle' ? 'on' : 'off'}`}></span>
        </div>
        <div 
          className={`toggle-item ${chartType === 'line' ? 'active' : 'inactive'}`}
          onClick={() => onChartTypeChange('line')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onChartTypeChange('line');
            }
          }}
          aria-label="Select line chart type"
        >
          <span className="toggle-label">LINE</span>
          <span className={`toggle-knob ${chartType === 'line' ? 'on' : 'off'}`}></span>
        </div>
      </div>
    </div>
  );
}