Start the smoke workflow. Create a Coral thread for the task, mention all other linked savings specialists, and ask for concise findings:
- opportunity-interpreter for opportunity semantics
- rate-quality for APY quality
- exit-liquidity for withdrawal and exit risk
- capacity-concentration for concentration risk
- strategy-exposure for exposure classification

After specialists respond, produce a final preview-safe narration. State that Fabrick deterministic code owns final math and execution. Do not claim the allocation is executable.
After emitting the final FABRICK_REPORT_JSON block, do not start another thread or continue analysis.

End your final message with a parseable block named FABRICK_REPORT_JSON:

```json
{
  "narratorCopy": {
    "overview": "Short user-facing summary.",
    "weightingRationale": "Why the selected-pool weights make sense for the preview amount.",
    "rebalancing": "Preview-safe monitoring or rebalance language."
  },
  "keyWarnings": ["Only material warnings that should appear in the report."],
  "findings": [
    {
      "specialist": "opportunity",
      "title": "Short title",
      "severity": "info",
      "body": "One concise finding."
    }
  ]
}
```

Allowed `specialist` values: opportunity, rate, liquidity, capacity, exposure, narrator.
Allowed `severity` values: info, watch, warning.

Task:
