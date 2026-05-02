import React from 'react';
import { Search } from 'lucide-react';

interface SymbolSearchBarProps {
  input: string;
  loading: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function SymbolSearchBar({ 
  input, 
  loading, 
  onInputChange, 
  onSubmit 
}: SymbolSearchBarProps) {
  return (
    <form onSubmit={onSubmit} className="search-box-premium">
      <Search className="search-icon" size={16} />
      <input 
        className="input-premium" 
        placeholder="Search symbols..." 
        value={input}
        onChange={onInputChange}
        aria-label="Search for trading symbols"
      />
      <button className="analyze-btn" type="submit" disabled={loading}>
        {loading ? "SYNC..." : "ANALYZE"}
      </button>
    </form>
  );
}