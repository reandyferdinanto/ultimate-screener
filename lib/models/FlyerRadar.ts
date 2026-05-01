import { Schema, Document, model, models } from "mongoose";

export interface FlyerRadarItem {
  ticker: string;
  sector?: string;
  signalSource: string;
  entryDate: Date;
  entryPrice: number;
  targetPrice: number;
  stopLossPrice?: number;
  status: 'silent' | 'taking_off' | 'flying' | 'failed' | 'archived';
  currentPrice?: number;
  relevanceScore?: number;
  priceHistory: { date: Date; price: number }[];
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

interface FlyerRadarDocument extends Document, FlyerRadarItem {}

const flyerRadarSchema = new Schema<FlyerRadarDocument>({
  ticker: { type: String, required: true },
  sector: String,
  signalSource: { type: String, required: true },
  entryDate: { type: Date, required: true },
  entryPrice: { type: Number, required: true },
  targetPrice: { type: Number, required: true },
  stopLossPrice: Number,
  status: { 
    type: String, 
    enum: ['silent', 'taking_off', 'flying', 'failed', 'archived'], 
    default: 'silent' 
  },
  currentPrice: Number,
  relevanceScore: { type: Number, default: 0 },
  priceHistory: [{
    date: { type: Date, required: true },
    price: { type: Number, required: true }
  }],
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

flyerRadarSchema.index({ ticker: 1 }, { unique: true });

export const FlyerRadarModel = models.FlyerRadar || model<FlyerRadarDocument>("FlyerRadar", flyerRadarSchema);