# Screener Parameters Berdasarkan Analisis JAWA dan COAL

## Screener 1: Squeeze Breakout Detector

### Deskripsi
Screener ini mengidentifikasi saham yang sedang dalam fase squeeze dan menunjukkan tanda-tanda breakout potensial berdasarkan pola yang terlihat pada JAWA dan COAL.

### Parameter Teknikal

```json
{
  "name": "Squeeze Breakout Detector",
  "description": "Mengidentifikasi saham yang sedang dalam fase squeeze dengan potensi breakout",
  "filters": [
    {
      "indicator": "squeeze",
      "condition": "active",
      "value": "high,mid,low",
      "operator": "in"
    },
    {
      "indicator": "momentum",
      "condition": "negative_to_positive",
      "value": "any",
      "operator": "transition"
    },
    {
      "indicator": "flux",
      "condition": "positive_trend",
      "value": ">25",
      "operator": ">="
    }
  ],
  "weight": 0.85,
  "category": "momentum"
}
```

### Logika Screener
1. Identifikasi saham dalam fase squeeze (high/mid/low compression)
2. Momentum berubah dari negatif ke positif
3. Flux tetap positif dan konsisten meningkat
4. Breakout terjadi ketika momentum positif dan flux tinggi

## Screener 2: Momentum Reversal Detector

### Deskripsi
Screener ini mengidentifikasi saham yang menunjukkan pola reversal momentum yang kuat.

### Parameter Teknikal

```json
{
  "name": "Momentum Reversal Detector",
  "description": "Mengidentifikasi saham dengan pola momentum reversal",
  "filters": [
    {
      "indicator": "momentum",
      "condition": "reversal",
      "value": "negative_to_positive",
      "operator": "transition"
    },
    {
      "indicator": "flux",
      "condition": "rising",
      "value": "increasing",
      "operator": "trend"
    },
    {
      "indicator": "squeeze",
      "condition": "breakout",
      "value": "no_compression",
      "operator": "equals"
    }
  ],
  "weight": 0.90,
  "category": "momentum"
}
```

### Logika Screener
1. Deteksi perubahan momentum dari negatif ke positif
2. Flux menunjukkan tren positif
3. Breakout dari fase squeeze
4. Saham dengan kondisi ini memiliki potensi kenaikan tinggi

## Screener 3: Elite Bounce Detector

### Deskripsi
Screener ini mengidentifikasi saham dengan pola "elite bounce" yang terlihat pada JAWA dan COAL.

### Parameter Teknikal

```json
{
  "name": "Elite Bounce Detector",
  "description": "Mengidentifikasi saham dengan pola elite bounce",
  "filters": [
    {
      "indicator": "ema20",
      "condition": "reclaim",
      "value": "under_to_above",
      "operator": "transition"
    },
    {
      "indicator": "volume_score",
      "condition": "high",
      "value": ">=4",
      "operator": ">="
    },
    {
      "indicator": "conviction_score",
      "condition": "high",
      "value": ">=85",
      "operator": ">="
    }
  ],
  "weight": 0.95,
  "category": "momentum"
}
```

### Logika Screener
1. Saham harus menunjukkan pola "reclaim" di area EMA20
2. Volume score tinggi (>=4 indikator volume positif)
3. Conviction score tinggi (>=85)
4. Kombinasi yang tepat antara harga, volume, dan momentum

## Kesimpulan

Pola yang terlihat pada JAWA dan COAL menunjukkan bahwa screener yang efektif harus dapat mengidentifikasi:
1. Saham dalam fase squeeze (kompresi) dengan momentum yang akan segera melepas (breakout)
2. Saham dengan momentum reversal yang kuat
3. Saham dengan elite bounce pattern

Dengan menggunakan parameter ini, screener dapat mengidentifikasi saham dengan potensi kenaikan tinggi berdasarkan pola teknikal yang terbukti efektif.