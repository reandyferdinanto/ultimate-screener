import { GoogleGenerativeAI, SchemaType, Schema } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY || "AIzaSyA73HYqtjNgTBoi6RYXG6S-OI9YO9_rze0";
const genAI = new GoogleGenerativeAI(apiKey);

// We define a strict JSON schema for the output
const analysisSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    verdict: {
      type: SchemaType.STRING,
      description: "A short 2-3 word summary of the setup (e.g., 'Bullish Breakout', 'Exhaustion Top', 'Fakeout Risk').",
    },
    key_driver: {
      type: SchemaType.STRING,
      description: "The primary technical reason for the move (e.g., 'Volume spike 4x on 1H MACD Cross', 'Broke Daily MA200 resistance').",
    },
    support: {
      type: SchemaType.NUMBER,
      description: "The nearest significant support level in price.",
    },
    resistance: {
      type: SchemaType.NUMBER,
      description: "The next significant resistance level in price.",
    },
    trend_1d: {
      type: SchemaType.STRING,
      description: "The daily trend interpretation based on the provided technicals.",
    },
    trend_1h: {
      type: SchemaType.STRING,
      description: "The 1-hour trend interpretation based on the provided technicals.",
    },
    trend_15m: {
      type: SchemaType.STRING,
      description: "The 15-minute trend interpretation based on the provided technicals.",
    },
    actionable_insight: {
      type: SchemaType.STRING,
      description: "What should a trader do next? (e.g., 'Wait for pullback to 120', 'Hold if closes above 150', 'High risk of mean reversion').",
    },
    pattern_score: {
      type: SchemaType.NUMBER,
      description: "Rate the strength of this breakout pattern from 1 to 10 (10 being perfect).",
    }
  },
  required: ["verdict", "key_driver", "support", "resistance", "trend_1d", "trend_1h", "trend_15m", "actionable_insight", "pattern_score"],
};

export async function analyzeStockWithGemini(ticker: string, technicalDataJSON: any) {
  try {
    // We use gemini-1.5-pro for complex reasoning or gemini-1.5-flash for speed.
    // Flash is usually sufficient for structured JSON output and is cheaper.
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro-latest",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        temperature: 0.1, // Low temperature for more deterministic/factual analysis
      },
    });

    const prompt = `
You are an expert technical analyst and quantitative trader specializing in the Indonesian Stock Exchange (IHSG).
A stock (${ticker}) has just surged over 20% in the last 1-2 days.
I am providing you with the exact technical indicator snapshot calculated just now.

Analyze this data and return your insights STRICTLY in the requested JSON format.
Focus on identifying WHY it broke out (e.g., did volume explode on a moving average crossover? Is it severely overbought on the 15m but just starting on the 1D?).

Here is the technical data snapshot for ${ticker}:
${JSON.stringify(technicalDataJSON, null, 2)}
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // The response is guaranteed to be JSON matching the schema
    const analysisData = JSON.parse(responseText);
    return analysisData;

  } catch (error) {
    console.error(`Error analyzing ${ticker} with Gemini:`, error);
    return null;
  }
}
