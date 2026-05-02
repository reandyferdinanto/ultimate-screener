'use client';

import React from 'react';
import { Search, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Symbol {
  symbol: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  status: 'normal' | 'suspicious' | 'darkpool';
}

interface SymbolSearchProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredSymbols: Symbol[];
  onSymbolSelect: (symbol: string) => void;
}

export default function SymbolSearch({ 
  searchTerm, 
  setSearchTerm, 
  filteredSymbols, 
  onSymbolSelect 
}: SymbolSearchProps) {
  const getStatusColor = (status: Symbol['status']) => {
    switch (status) {
      case 'suspicious': return 'text-orange-600';
      case 'darkpool': return 'text-red-600';
      default: return 'text-green-600';
    }
  };

  const getStatusIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-3 w-3 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-gray-500" />;
  };

  return (
    <div className="mb-8">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Search symbols..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {searchTerm && (
        <div className="mt-4 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto">
          {filteredSymbols.length > 0 ? (
            filteredSymbols.map((symbol) => (
              <div
                key={symbol.symbol}
                className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                onClick={() => onSymbolSelect(symbol.symbol)}
              >
                <div className="flex items-center space-x-3">
                  <div>
                    <div className="font-semibold text-gray-900">{symbol.symbol}</div>
                    <div className={`text-xs ${getStatusColor(symbol.status)}`}>
                      {symbol.status}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-gray-900">
                    ${symbol.lastPrice.toFixed(2)}
                  </div>
                  <div className="flex items-center space-x-1">
                    {getStatusIcon(symbol.change)}
                    <span className={`text-xs ${
                      symbol.change > 0 ? 'text-green-600' : 
                      symbol.change < 0 ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {symbol.changePercent >= 0 ? '+' : ''}{symbol.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-gray-500">
              No symbols found
            </div>
          )}
        </div>
      )}
    </div>
  );
}