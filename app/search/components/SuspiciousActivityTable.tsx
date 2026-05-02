'use client';

import React from 'react';
import { AlertTriangle, Eye } from 'lucide-react';

interface Symbol {
  symbol: string;
  status: 'suspicious' | 'darkpool';
  lastPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
}

interface SuspiciousActivityTableProps {
  suspiciousSymbols: Symbol[];
  onViewDetails: (symbol: string) => void;
}

export default function SuspiciousActivityTable({ 
  suspiciousSymbols, 
  onViewDetails 
}: SuspiciousActivityTableProps) {
  const getStatusIcon = (status: Symbol['status']) => {
    return (
      <AlertTriangle 
        className={`h-4 w-4 ${
          status === 'darkpool' ? 'text-red-500' : 'text-orange-500'
        }`} 
      />
    );
  };

  const getVolumeRatio = (volume: number, avgVolume: number) => {
    if (avgVolume === 0) return 0;
    return volume / avgVolume;
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Suspicious Activity
        </h2>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Symbol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Change
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Volume Ratio
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {suspiciousSymbols.map((symbol) => (
              <tr key={symbol.symbol} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {symbol.symbol}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(symbol.status)}
                    <span className={`text-sm capitalize ${
                      symbol.status === 'darkpool' ? 'text-red-600' : 'text-orange-600'
                    }`}>
                      {symbol.status}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ${symbol.lastPrice.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium">
                    <span className={
                      symbol.change > 0 ? 'text-green-600' : 
                      symbol.change < 0 ? 'text-red-600' : 'text-gray-600'
                    }>
                      {symbol.changePercent >= 0 ? '+' : ''}{symbol.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {getVolumeRatio(symbol.volume, symbol.avgVolume).toFixed(1)}x
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => onViewDetails(symbol.symbol)}
                    className="text-blue-600 hover:text-blue-900 flex items-center space-x-1"
                  >
                    <Eye className="h-4 w-4" />
                    <span>View</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {suspiciousSymbols.length === 0 && (
        <div className="px-6 py-8 text-center text-gray-500">
          No suspicious activity detected
        </div>
      )}
    </div>
  );
}