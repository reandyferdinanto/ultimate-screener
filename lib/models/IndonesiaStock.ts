import { Schema, Document, model, models } from "mongoose";

export interface IndonesiaStock {
  ticker: string;
  symbol: string;
  name: string;
  active: boolean;
  exchange: string;
  lastPrice: number;
  marketCapText: string;
  sector: string;
  industry: string;
  updatedAt: Date;
}

interface IndonesiaStockDocument extends Document, IndonesiaStock {}

const indonesiaStockSchema = new Schema<IndonesiaStockDocument>({
  ticker: { type: String, required: true, unique: true },
  symbol: { type: String, required: true },
  name: { type: String, required: true },
  active: { type: Boolean, default: true },
  exchange: { type: String },
  lastPrice: { type: Number },
  marketCapText: { type: String },
  sector: { type: String },
  industry: { type: String },
}, { timestamps: true });

export const IndonesiaStockModel = models.IndonesiaStock || model<IndonesiaStockDocument>("IndonesiaStock", indonesiaStockSchema, "indonesiastocks");
