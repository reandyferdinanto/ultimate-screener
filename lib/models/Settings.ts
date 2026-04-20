import { Schema, Document, model, models } from "mongoose";

export interface Settings {
  key: string;
  value: unknown;
}

interface SettingsDocument extends Document, Settings {}

const settingsSchema = new Schema<SettingsDocument>({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true });

export const SettingsModel = models.Settings || model<SettingsDocument>("Settings", settingsSchema);
