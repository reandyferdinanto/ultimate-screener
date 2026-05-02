'use client';

import React from 'react';
import { X, TrendingUp, TrendingDown, Minus, BarChart3, DollarSign, AlertTriangle } from 'lucide-react';

interface Symbol {
  symbol: string;
  status: 'normal' | 'suspicious' | 'darkpool';
  lastPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  lastUpdated: string;
}

interface SymbolDetailsProps {
  selectedSymbol: Symbol | null;
  onClose: () => void;
}

export default function SymbolDetails({ selectedSymbol, onClose }: SymbolDetailsProps) {
  if (!selectedSymbol) return null;

  const getStatusColor = (status: Symbol['status']) => {
    switch (status) {
      case 'suspicious': return 'text-orange-600';
      case 'darkpool': return 'text-red-600';
      default: return 'text-green-600';
    }
  };

  const getStatusIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-6 w-6 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-6 w-6 text-red-500" />;
    return <Minus className="h-6 w-6 text-gray-500" />;
  };

  const getVolumeRatio = (volume: number, avgVolume: number) => {
    if (avgVolume === 0) return 0;
    return volume / avgVolume;
  };

  const volumeRatio = getVolumeRatio(selectedSymbol.volume, selectedSymbol.avgVolume);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedSymbol.symbol}
              </h2>
              <div className={`text-sm font-medium ${getStatusColor(selectedSymbol.status)}`}>
                {selectedSymbol.status.toUpperCase()}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="flex items-center space-x-3">
              {getStatusIcon(selectedSymbol.change)}
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  ${selectedSymbol.lastPrice.toFixed(2)}
                </div>
                <div className={`text-sm font-medium ${
                  selectedSymbol.change > 0 ? 'text-green-600' : 
                  selectedSymbol.change < 0 ? 'text-red-600' : 'text-gray-600'
                }`}>
                  {selectedSymbol.changePercent >= 0 ? '+' : ''}{selectedSymbol.changePercent.toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <BarChart3 className="h-6 w-6 text-blue-500" />
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {volumeRatio.toFixed(1)}x
                </div>
                <div className="text-sm font-medium text-gray-600">
                  Volume Ratio
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-t border-gray-200">
              <div className="flex items-center space-x-2">
                <DollarSign className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">Current Volume</span>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {selectedSymbol.volume.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-gray-200">
              <div className="flex items-center space-x-2">
                <BarChart3 className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">Average Volume</span>
              </div>
              <span className="text-sm font-medium text-gray-900">
                {selectedSymbol.avgVolume.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-gray-200">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">Risk Level</span>
              </div>
              <span className={`text-sm font-medium ${getStatusColor(selectedSymbol.status)}`}>
                {selectedSymbol.status === 'darkpool' ? 'High' : 
                 selectedSymbol.status === 'suspicious' ? 'Medium' : 'Low'}
              </span>
            </div>

            <div className="flex items-center justify-between py-3 border-t border-gray-200">
              <span className="text-sm font-medium text-gray-600">Last Updated</span>
              <span className="text-sm font-medium text-gray-900">
                {new Date(selectedSymbol.lastUpdated).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}