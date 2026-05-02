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

export interface FlyerRadarConfig {
  targetPriceFactor: number;
}

export const DEFAULT_CONFIG: FlyerRadarConfig = {
  targetPriceFactor: 1.3
};

export async function getFlyerRadarConfig(): Promise<FlyerRadarConfig> {
  try {
    const setting = await SettingsModel.findOne({ key: 'flyerRadarConfig' });
    return setting?.value as FlyerRadarConfig || DEFAULT_CONFIG;
  } catch (error) {
    console.error('Error getting flyer radar config:', error);
    return DEFAULT_CONFIG;
  }
}

export async function updateFlyerRadarConfig(config: Partial<FlyerRadarConfig>): Promise<FlyerRadarConfig> {
  try {
    const currentConfig = await getFlyerRadarConfig();
    const newConfig = { ...currentConfig, ...config };

    await SettingsModel.findOneAndUpdate(
      { key: 'flyerRadarConfig' },
      { value: newConfig },
      { upsert: true, new: true }
    );

    return newConfig;
  } catch (error) {
    console.error('Error updating flyer radar config:', error);
    throw error;
  }
}
