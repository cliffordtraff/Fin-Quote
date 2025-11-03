# Fin Quote Model Migration Notes

## Overview of the App
Fin Quote is a web-based financial assistant focused on Apple (AAPL). It lets users ask plain-language questions about revenues, margins, cash flow, filings, and stock prices. Behind the scenes it:
- Routes each question to the right data tool (financial metrics, prices, filings, or semantic search).
- Generates a grounded natural-language answer and, when possible, a Highcharts visualization plus a data table.
- Logs every query for validation, feedback, and cost tracking.

The entire flow relies on an OpenAI chat completion model to select tools, compose answers, and perform regenerations if validations fail.

## Migration from `gpt-4o-mini` to `gpt-5-nano`
We originally ran the application on `gpt-4o-mini`. The goals for migrating to `gpt-5-nano` were:
- Reduce per-token cost (nano is cheaper than 4o-mini).
- Gain access to the newer “reasoning” capabilities for more complex instructions.

### What Changed in the Migration
- All OpenAI calls now point at `gpt-5-nano`.
- We updated API parameters to use `max_completion_tokens` (required by GPT-5 models).
- Temperature is omitted for GPT-5 because the new models don’t accept `temperature: 0`.
- Token budgets were increased (up to 4,000 for answer generation) to leave room for the model’s internal reasoning.
- Conversation history passed to the answer model was trimmed to the last four turns to keep prompts manageable.

## Observed Impact: Latency and Delays
- Responses now take noticeably longer. GPT-5 nano spends a large share of the completion budget on internal reasoning tokens before emitting text.
- If the reasoning tokens exhaust the limit, the model returns empty output (`finish_reason: "length"`). To mitigate that we kept raising `max_completion_tokens`, but the latency continues to grow.
- The new model also removed deterministic temperature control, so outputs vary run to run.

## Attempt to Reduce Reasoning
We tried lowering the reasoning overhead by instructing the model to “answer briefly” and “avoid reasoning,” but that did not prevent internal reasoning tokens. Attempts to set temperature or reasoning parameters outside the supported defaults returned errors.

## Open Questions / Next Steps
1. Can we decrease latency without sacrificing answer quality? Options might include:
   - Shortening prompts even further.
   - Switching back to `gpt-4o-mini` for simple questions and reserving GPT-5 nano only for complex queries.
   - Testing an alternative model such as `gpt-5-mini` to see if reasoning is more efficient.
2. Is there a supported way to limit reasoning tokens in GPT-5 nano? Our attempts to “turn reasoning low” produced API errors.
3. Are there other prompt adjustments (system message, validation format) that reduce hidden reasoning load while keeping accuracy? 

Feedback and experimentation ideas welcome—latency is the main pain point after the migration, and we are looking for approaches that keep answers grounded while speeding up the experience.
