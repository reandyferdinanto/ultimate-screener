# Secret Sauce Manual Review Prompt

Use this prompt together with the latest review log from `artifacts/secret-sauce-review/`.

## Prompt

```text
Read the attached Secret Sauce review log JSON carefully.

Your job is to manually review the current Secret Sauce formula and recommend the next formula revision.

Primary goals:
- identify whether the current formula is too loose, too strict, or acceptable
- compare the active thresholds against the real pre-breakout fingerprint from historical top gainers
- inspect recent candidates and recent backtests if available
- propose concrete threshold changes for the next Secret Sauce version

Hard requirements:
- be explicit and numerical
- do not give vague trading advice
- only propose threshold changes that are justified by the review log
- if you suggest a new filter that does not exist yet, put it in addFilters
- if you think an existing filter is hurting recall or precision, put it in removeFilters
- if no change is needed for a field, do not include it in thresholdChanges

Return ONLY valid JSON in this exact shape:

{
  "verdict": "tighten|loosen|keep",
  "why": "short explanation",
  "thresholdChanges": [
    {
      "field": "minRvol|maxDistEma20Pct|maxCompressionPct|minCloseNearHighPct|minRsi|maxRsi|minMfi|minDistEma20Pct|targetGainPct|stopLossPct|holdingDays|lookbackCandles",
      "current": 0,
      "proposed": 0,
      "reason": "why this change helps"
    }
  ],
  "addFilters": [
    "optional new filter to add later"
  ],
  "removeFilters": [
    "optional existing filter to remove later"
  ],
  "notes": "extra observations"
}
```

## Apply The AI Result

Save the AI response to a file, for example:

`artifacts/secret-sauce-review/manual-revision-001.json`

Then apply it with:

```powershell
npm run secret-sauce:apply-revision -- "artifacts/secret-sauce-review/manual-revision-001.json"
```
