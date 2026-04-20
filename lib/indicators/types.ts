export interface OHLCV {
  time: number | Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type IndicatorResult = number[];

export interface ComplexIndicatorResult {
  [key: string]: number[] | any;
}
