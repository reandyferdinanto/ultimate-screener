import React from 'react';

interface TimeframeSelectorProps {
  interval: string;
  onIntervalChange: (interval: string) => void;
}

export default function TimeframeSelector({ interval, onIntervalChange }: TimeframeSelectorProps) {
  return (
    <div className="timeframe-selector">
      {['15m', '1h', '4h', '1d'].map(tf => (
        <button 
          key={tf} 
          className={`tf-pill ${interval === tf ? 'active' : ''}`}
          onClick={() => onIntervalChange(tf)}
          aria-label={`Select ${tf} timeframe`}
        >
          {tf.toUpperCase()}
        </button>
      ))}
    </div>
  );
}