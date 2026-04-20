import { rsi as i_rsi, mfi as i_mfi, kdj as i_kdj, vortex as i_vortex } from 'indicatorts';
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

/**
 * KDJ Indicator
 */
export function calculateKDJ(quotes: OHLCV[], rPeriod = 9, kPeriod = 3, dPeriod = 3) {
  return i_kdj(
    quotes.map(q => q.high),
    quotes.map(q => q.low),
    quotes.map(q => q.close),
    { rPeriod, kPeriod, dPeriod }
  );
}

/**
 * Vortex Indicator
 */
export function calculateVortex(quotes: OHLCV[], period = 14) {
  return i_vortex(
    quotes.map(q => q.high),
    quotes.map(q => q.low),
    quotes.map(q => q.close),
    { period }
  );
}
