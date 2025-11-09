## Preference‑Driven Response Styling (Content Plan + Style Templates)

This document defines how we’ll let you compare multiple answer styles side‑by‑side (A/B/n), choose a favorite, and automatically fold those preferences back into our prompts safely. It separates “what to say” (content plan) from “how to say it” (style template), and enforces quality/safety gates before promoting changes. The approach mirrors the comparative + boolean eval pattern described in Fiscal.ai’s Copilot Evals overview, which runs boolean pass/fail suites and comparative similarity checks against a production baseline to control regressions. See: How FinChat Improves AI Performance — Copilot Evals (https://fiscal.ai/blog/exploring-copilot-evals-how-finchat-improves-ai-performance/).


### Goals
- Offer multiple, clearly different writing styles for the same underlying facts so you can pick what reads best.
- Learn from your choices (tags/reasons) and propose minimal prompt edits that encode your preferences.
- Prevent regressions with hard gates (boolean safety/numerics) and stability checks (cross‑run similarity) before promoting prompt changes.


### Why separate “content plan” from “style template”?
- Content plan = what to say (facts, numbers, citations, outline) from our tools/RAG.
- Style template = how to say it (tone, structure, headings, bullets, tables, length, citation formatting).
- Keeping content fixed and only varying style makes comparisons fair (no factual drift) and makes your preferences actionable (prompt changes target style, not facts).


## End‑to‑End Flow
1) Question arrives → tools run (financials, prices, filings).
2) Build a Content Plan object (facts, key points, numbers, citations, outline).
3) Render A/B/n drafts using:
   - Style templates (deterministic rendering of the content plan), or
   - A distinct “Stylist” model that rewrites only presentation (forbidden to add new facts).
4) Show a side‑by‑side chooser (A/B/n). You pick the winner and select quick tags (e.g., “clearer”, “more numbers”, “better citations”, “shorter”).
5) Log all metadata (question, drafts, styleId, model, tokens, tools used, your choice + tags).
6) Analyze preferences over time and auto‑propose a small prompt/few‑shot diff for our “house style”.
7) Run eval gates before promotion:
   - Boolean suites (e.g., safety “No Advice”, numeric accuracy) → 100% pass required.
   - Baseline Q&A (Quality + Stability): require average rubric score ≥ threshold and cross‑run similarity ≥ threshold on stability items.
8) If gates pass, promote the prompt change; otherwise, iterate.

This mirrors Fiscal.ai’s approach of boolean + comparative testing with production baselines to evaluate intentional vs. unintended changes (https://fiscal.ai/blog/exploring-copilot-evals-how-finchat-improves-ai-performance/).


## Key Concepts

### Content Plan (what to say)
- A neutral, factual structure produced from tool outputs.
- Includes:
  - intent: high‑level goal (“Explain Apple’s segments”)
  - outline: ordered sections to cover
  - keyPoints: bullet points, each with a claim, numbers, and citation refs
  - numbers: normalized metrics and units (e.g., USD billions)
  - citations: filing passages, page refs, or dataset links
  - constraints: must/not‑do (no new facts, word limits, citation rules)

Example (schematic):
```json
{
  "intent": "Explain Apple revenue segments and recent drivers",
  "outline": ["Summary", "Segments", "Drivers", "Risks"],
  "keyPoints": [
    { "section": "Segments", "text": "iPhone drives ~52% FY24 revenue", "numbers": [{"label":"iPhone %","value":0.52}], "citations":[{"filing":"10-K","page":12}] },
    { "section": "Drivers", "text": "Services grew YoY with margin expansion", "numbers":[{"label":"ServicesGrowth","value":0.11}], "citations":[{"filing":"10-K","page":35}] }
  ],
  "citations": [{"filing":"AAPL 10-K 2024","sections":["MD&A"],"pages":[12,35]}],
  "constraints": { "noNewFacts": true, "maxWords": 250, "citationFormat": "inline [source]" }
}
```


### Style Template (how to say it)
- A deterministic renderer that takes the same content plan and outputs different presentations.
- Controls: tone, structure, headings, bullets/tables, ordering, sentence rhythm, and citation formatting.

Suggested initial templates (A/B/C):
- A) Executive Summary First
  - 2‑sentence TL;DR → 3 bullets with numbers → 2 citations at end
- B) Bulleted Brief
  - Heading → 5 short bullets (each with a number + citation) → “So what” line
- C) What / Why / So‑What
  - What happened → Why it matters → So what for investors; cite at end of each section

Optional: “Stylist” LLM
- Use a second model to rewrite the content plan into a specified style, with hard constraints:
  - Must only use provided facts/citations
  - Temperature 0 (deterministic), no new claims


## UI/UX
- Compare view: show A/B/C drafts side‑by‑side.
- Inputs captured: chosenDraftId, tags (checkboxes like Clearer, More numbers, Better citations, Concise, Actionable), optional comment.
- Show metadata toggle: tokens, model, latency, styleId, tool calls (for debugging).


## Data and Logging
Minimum fields to log per comparison:
```json
{
  "runId": "2025-11-09T21:15:22Z",
  "questionId": "q-apple-segments-001",
  "question": "Explain Apple's revenue segments and recent drivers.",
  "contentPlanId": "cp-xyz",
  "drafts": [
    { "draftId": "A", "styleId": "exec-summary", "model": "gpt-4o-mini", "temperature": 0, "tokens": 620, "latencyMs": 850, "textHash": "..." },
    { "draftId": "B", "styleId": "bulleted-brief", "model": "gpt-4o-mini", "temperature": 0, "tokens": 610, "latencyMs": 830, "textHash": "..." },
    { "draftId": "C", "styleId": "what-why-so-what", "model": "gpt-4o-mini", "temperature": 0, "tokens": 655, "latencyMs": 910, "textHash": "..." }
  ],
  "choice": { "winnerDraftId": "B", "tags": ["Clearer", "More numbers"], "comment": "Fast to scan" },
  "toolsUsed": ["getAaplFinancialsByMetric", "searchFilings"],
  "version": { "promptVersion": "v7", "fewShotPack": "pack-2" }
}
```


## Learning Loop (Turning Preferences into Prompt Edits)
1) Aggregate wins by styleId and tag over N comparisons.
2) Use an LLM to summarize “why winners win” and produce a minimal prompt diff proposal, e.g.:
   - “Start with 2‑sentence summary, then 3 bullets each with a number and source; add a one‑line ‘So what’.”
3) Open a review: show current prompt excerpt vs. proposed diff, plus recent wins/tags.
4) If approved, run eval gates before promoting (see below).


## Safety and Quality Gates (before promotion)
Use our existing eval framework and extend with cross‑run similarity:
- Boolean Safety (“No Advice”): 100% pass required.
- Numeric Accuracy (“Numbers Canon”): 100% pass with rounding tolerance (e.g., ≤ 0.5%).
- Filing Grounding (Citations): ≥ 98% pass; 0 critical fails.
- Baseline Q&A (Quality + Stability):
  - Quality (LLM‑as‑judge): average ≥ 8.0, no single < 6.5.
  - Stability: cross‑run similarity ≥ 0.95 for stability subset (unchanged prompts).

If any hard gate fails, reject the prompt change and inspect reasons. This aligns with Fiscal.ai’s boolean datasets and comparative baselines for controlled change (https://fiscal.ai/blog/exploring-copilot-evals-how-finchat-improves-ai-performance/).


## Determinism and Cost
- Temperature 0 for both content plan and style rendering to ensure repeatability.
- Keep model constant when comparing styles (attribution is cleaner).
- Cache content plans per question for 24h to avoid re‑ingesting the same facts during comparisons.


## Implementation Plan (Phased)

### Phase 1 — Foundations (1–2 days)
- Add “Content Plan Builder”:
  - Collect tool outputs (financials, filings) and normalize numbers/units.
  - Build the plan object (intent, outline, keyPoints, citations, constraints).
- Implement 3 deterministic Style Templates (A/B/C) → render answers from the same content plan.
- Add minimal Compare UI: show A/B/C, accept a winner + tags; log comparison JSON to Supabase.
- Keep current production prompt unchanged; this phase is style exploration only.

### Phase 2 — Preference Analysis + Proposal (1–2 days)
- Batch job / API:
  - Aggregate wins by styleId and tags over the last N comparisons.
  - Generate a minimal prompt/few‑shot diff proposal via an LLM summarizer.
- Reviewer screen: show proposed changes + supporting stats (win rates, common tags).
- “Dry‑run” promotion: run evals with the candidate prompt (no deploy yet).

### Phase 3 — Gates + Promotion (1–2 days)
- Integrate eval gates:
  - Boolean suites (safety, numbers, citations) → 100% pass required.
  - Baseline Q&A → quality and stability thresholds using cross‑run similarity vs. production baseline.
- If gates pass, promote prompt version; store runId, suite results, similarity metrics, commit the prompt diff.
- Rollback button: revert to previous prompt version immediately if post‑deploy issues arise.


## Interfaces (Sketches)

### Content Plan Builder (server)
- Input: question, tool outputs
- Output: contentPlan JSON (as above)
- Notes: strip ambiguity, normalize units (USD B vs mm), attach citation handles.

### Style Renderer (server)
- Input: contentPlan, styleId
- Output: answer text (deterministic), metadata
- Constraints: no new facts; must include citations per style rules.

### Compare UI (client)
- Input props: drafts[], question
- Actions: choose winner, tags[], comment?, submit
- Telemetry: logs comparison + metadata

### Preference Analyzer (server/cron)
- Input: comparisons over window
- Output: prompt diff proposal (text), rationale summary, supporting stats

### Promotion Runner (server/CI)
- Input: candidate prompt version
- Steps: run eval suites → check gates → promote or reject


## Risks and Mitigations
- Style accidentally changes content: forbid new facts, require citations, and validate with our boolean checks.
- “Pretty but wrong” drafts: gates block promotion unless numeric/citation suites are clean.
- Drift outside intended questions: stability subset + cross‑run similarity catches unintended changes.
- Cost: deterministic templates are cheap; stylist model can be optional.


## Success Metrics
- Preference engagement: % sessions using compare; average tags per choice.
- Win clarity: one style reaches ≥ 60% win rate on target categories.
- Gate pass rate: ≥ 99% boolean pass in pre‑promotion evals; 0 critical fails.
- Support load: fewer manual rewrites needed post‑promotion.


## Appendix — Initial Style Templates (concrete rules)

1) Executive Summary First (styleId: exec-summary)
- Format: 2‑sentence TL;DR → 3 bullets (each must contain one number and one citation) → 2 citations at end.
- Tone: concise, neutral, investor‑focused.
- Length: 180–250 words.

2) Bulleted Brief (styleId: bulleted-brief)
- Format: Heading (one line) → 5 short bullets (≤ 20 words each, include a number + source) → “So what” line.
- Tone: scannable, fact‑dense.
- Length: 120–200 words.

3) What / Why / So‑What (styleId: what-why-so-what)
- Format: “What happened” (2–3 sentences) → “Why it matters” (2 bullets) → “So what for investors” (1–2 sentences).
- Citations: inline at end of each section.
- Length: 160–240 words.


## References
- Fiscal.ai Copilot Evals (three‑pillar system; boolean + comparative datasets; production baseline vs sandbox): https://fiscal.ai/blog/exploring-copilot-evals-how-finchat-improves-ai-performance/



