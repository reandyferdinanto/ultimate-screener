import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface AnalysisSummaryProps {
  symbol: string;
  data: any;
}

export default function AnalysisSummary({ symbol, data }: AnalysisSummaryProps) {
  const stats = data?.statistics;
  const price = stats?.price;

  if (!price) return null;

  const currentPrice = price.close[price.close.length - 1];
  const previousPrice = price.close[price.close.length - 2];
  const change = ((currentPrice - previousPrice) / previousPrice) * 100;
  
  const TrendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const trendColor = change > 0 ? 'text-green-500' : change < 0 ? 'text-red-500' : 'text-gray-500';

  return (
    <div className="analysis-summary">
      <div className="symbol-display">
        <span className="symbol-name">{symbol}</span>
        <div className="symbol-details">
          <span className="price-value">Rp {currentPrice.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
          <div className={`trend-indicator ${trendColor}`}>
            <TrendIcon size={16} />
            <span className="change-percent">{change > 0 ? '+' : ''}{change.toFixed(2)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}