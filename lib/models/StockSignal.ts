import { Schema, Document, model, models } from "mongoose";

export interface StockSignal {
  id: string;
  ticker: string;
  sector: string;
  signalSource: string;
  entryDate: Date;
  entryPrice: number;
  targetPrice: number;
  stopLossPrice?: number;
  status: 'pending' | 'success' | 'failed' | 'archived';
  daysHeld: number;
  currentPrice?: number;
  relevanceScore?: number;
  priceHistory: { date: Date, price: number }[];
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

interface StockSignalDocument extends Document, StockSignal {}

const stockSignalSchema = new Schema<StockSignalDocument>({
  ticker: { type: String, required: true },
  sector: { type: String, required: true },
  signalSource: { type: String, required: true },
  entryDate: { type: Date, required: true },
  entryPrice: { type: Number, required: true },
  targetPrice: { type: Number, required: true },
  stopLossPrice: Number,
  status: { type: String, enum: ['pending', 'success', 'failed', 'archived'], default: 'pending' },
  daysHeld: { type: Number, default: 0 },
  currentPrice: Number,
  relevanceScore: { type: Number, default: 0 },
  priceHistory: [{
    date: { type: Date, required: true },
    price: { type: Number, required: true }
  }],
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export const StockSignalModel = models.StockSignal || model<StockSignalDocument>("StockSignal", stockSignalSchema);
