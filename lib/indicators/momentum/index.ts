import { rsi as i_rsi, mfi as i_mfi } from 'indicatorts';
import { OHLCV } from '../types';

/**
 * Relative Strength Index
 */
export function calculateRSI(data: number[], period = 14): number[] {
  return i_rsi(data, { period });
}

/**
 * Money Flow Index
 */
export function calculateMFI(quotes: OHLCV[], period = 14): number[] {
  return i_mfi(
    quotes.map(q => q.high),
    quotes.map(q => q.low),
    quotes.map(q => q.close),
    quotes.map(q => q.volume),
    { period }
  );
}

// Export AO functions
export { calculateAO, detectAODivergence, detectAOMomentumShift } from './ao';
