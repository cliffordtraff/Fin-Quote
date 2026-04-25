# Newsletter Generation Playbook

This file is the reusable operating manual for generating The Intraday newsletter in a fresh Codex or ChatGPT chat.

Use it when you want a manual, low-cost workflow:

1. prepare the newsletter request in Fin Quote
2. open a fresh chat
3. point the model at this file
4. ask for strict JSON output
5. paste or import that JSON back into the app

This is the clean alternative to paying for repeated API-backed generation runs.

## Why This Exists

The app can store prompts and context, but a prompt file by itself does nothing. Something still has to execute it.

For a one-user workflow, the fastest practical non-API option is often:

- you manually trigger a fresh Codex or ChatGPT chat
- the model reads this playbook
- the model returns the newsletter draft structure directly

This avoids turning the website into a brittle agent-runtime experiment.

## What The App Expects

The newsletter editor ultimately wants a structured draft document.

The most important shape is:

```json
{
  "ticker": "AMZN",
  "format": "single_stock",
  "featuredTickers": ["AMZN"],
  "generationPrompt": "Recent news and trading information.",
  "generatedAt": "2026-04-24T14:30:00.000Z",
  "subjectLine": "Amazon tests a fresh breakout after earnings",
  "introText": "Amazon is back in focus as price strength and fresh operating leverage put the stock back on traders' screens.",
  "editorialHook": "Amazon is trying to turn a post-earnings reaction into a broader momentum leg.",
  "autoPickedStock": false,
  "blocks": [
    {
      "id": "block-1",
      "layoutId": "chart-top-copy-bottom",
      "templateId": "price_breakout_6m",
      "selectionReason": "Recent price action is the clearest story.",
      "heading": "Amazon pushes toward a fresh six-month high",
      "body": "AMZN is up **4.82%** over the last month and sits **3.10%** below its 52-week high, keeping momentum traders focused on the next breakout test.",
      "chartImageUrl": "/newsletter-charts/placeholder.png",
      "chartAlt": "Amazon price breakout chart",
      "chartExportUrl": "https://charts.theintraday.com",
      "chartSpec": {},
      "chartNeedsRegeneration": true,
      "caption": "Amazon price action over the recent breakout window."
    }
  ]
}
```

Important:

- `chartSpec` can be left as `{}` only for rough manual drafting, but the real app flow works best if chart choice is handled separately.
- `chartImageUrl` can be a placeholder in a manual draft workflow.
- `blocks` must be present.
- `heading` and `body` must be strong enough to stand alone even if the chart image fails.

## Core Editorial Standard

Every block should still make sense without relying on the chart image.

That means:

- the company name or ticker must appear in the heading or the first sentence
- the body must contain specific numbers
- the writing should name the catalyst, trend, or setup clearly
- the copy should feel like market commentary, not generic marketing copy

Bad:

- "Big Breakout After Earnings Sparks Massive Rally"

Better:

- "Intel jumps after earnings as margins stabilize"
- "INTC clears key averages after a **22.73%** surge"

The second version is better because a reader immediately knows who the section is about.

## Output Rules

When generating newsletter JSON, follow these rules:

1. Return JSON only.
2. Do not wrap the JSON in markdown fences.
3. Do not add explanation before or after the JSON.
4. Use concrete, financial language.
5. Put the company name or ticker in the heading or first sentence of each block.
6. Include at least one real number in every sentence.
7. Do not invent figures that are not present in the provided context.
8. If data is missing, omit the claim instead of faking precision.
9. Keep headlines punchy and specific.
10. Keep bodies short. Usually 1-2 sentences.

## Single-Stock Rules

Use `format: "single_stock"` when the issue is one company.

Expected structure:

- one subject line
- one intro paragraph
- usually 3 blocks
- all blocks focused on the same ticker

Each block should emphasize a different angle:

- price / technical action
- financial trend or earnings trend
- valuation, margins, free cash flow, or a second supporting setup

Avoid making all 3 blocks say the same thing in different words.

## Market Roundup Rules

Use `format: "market_roundup"` when the issue is a basket of movers.

Expected structure:

- one subject line
- one intro paragraph summarizing the session theme
- usually 3-5 featured stocks
- one block per stock

Each roundup block must:

- explicitly name the company or ticker
- explain why this stock made the roundup
- include numbers from price action, earnings, margins, returns, or other provided data

Roundup blocks should be narrower than single-stock blocks. They are snapshots, not mini essays.

## Writing Style

The voice should sound like a market editor writing for active investors.

Target style:

- plain English
- specific
- sharp
- no hype
- no empty adjectives
- no filler like "in today's fast-paced environment"

Good style:

- "Amazon is up **6.14%** in the last month while operating margin improved to **11.2%**, giving the breakout a stronger fundamental backdrop."

Weak style:

- "Amazon has shown impressive strength and investors are optimistic about its future trajectory."

## Strong Block Checklist

Before returning the JSON, verify each block:

- Does the heading or first sentence identify the company?
- Does every sentence contain a real number or measurable fact?
- Is there a clear editorial angle?
- Is the language concise?
- Does the block avoid repeating another block?

If the answer to any of those is no, rewrite it.

## Practical Manual Workflow

Use this workflow in a fresh chat:

1. Tell the model to read this file.
2. Paste the company context or roundup context from Fin Quote.
3. Ask for newsletter JSON only.
4. Paste the result back into the editor or an import helper.

## Recommended Starter Prompt

Paste this into a fresh chat and adjust the placeholders:

```text
Read C:\Users\cliff\OneDrive\Desktop\Fin-Quote\docs\NEWSLETTER_GENERATION_PLAYBOOK.md first.

You are generating newsletter draft JSON for The Intraday.
Return JSON only. No markdown fences. No explanation.

Mode: single_stock
Ticker: AMZN
User brief: recent news and trading information

Use the provided company context and follow the playbook exactly.

Requirements:
- Return a full newsletter draft document.
- Use format "single_stock".
- Include subjectLine, introText, editorialHook, and blocks.
- Return exactly 3 blocks.
- Every block must name the company or ticker in the heading or first sentence.
- Every sentence must contain at least one specific number from the provided context.
- Keep the language concise and editorial.
- Leave chartImageUrl as a placeholder if no rendered chart asset is available yet.
- Set chartNeedsRegeneration to true if the chart asset is placeholder-only.

Context:
[PASTE CONTEXT HERE]
```

For a roundup version, change:

- `Mode: market_roundup`
- include the list of featured stocks
- require 3-5 blocks, one per stock

## Minimal JSON Contract For Manual Drafting

If you are doing the simplest possible manual workflow, these fields matter most:

```json
{
  "ticker": "NVDA",
  "format": "single_stock",
  "featuredTickers": ["NVDA"],
  "generatedAt": "2026-04-24T14:30:00.000Z",
  "subjectLine": "Nvidia extends the AI trade with another momentum test",
  "introText": "Nvidia remains one of the market's clearest leadership names as price strength and earnings power stay aligned.",
  "editorialHook": "Nvidia is still trading like an institutional leadership stock.",
  "autoPickedStock": false,
  "blocks": [
    {
      "id": "block-1",
      "layoutId": "chart-top-copy-bottom",
      "templateId": "manual_placeholder",
      "selectionReason": "Manual draft block",
      "heading": "Nvidia keeps momentum as price holds above trend",
      "body": "NVDA is up **8.20%** over the last month and remains above its **50-day** and **200-day** moving averages, keeping momentum intact.",
      "chartImageUrl": "/newsletter-charts/placeholder.png",
      "chartAlt": "Nvidia newsletter chart",
      "chartExportUrl": "",
      "chartSpec": {},
      "chartNeedsRegeneration": true
    }
  ]
}
```

If a fresh chat returns this minimum shape cleanly, it is already useful.

## What To Provide As Context

The model works best when you provide a compact brief, not a giant raw data dump.

Best context includes:

- company name
- ticker
- latest price
- daily move
- 1-month / 3-month / 1-year return if available
- 52-week high / low context
- 50-day and 200-day moving-average context
- latest revenue, earnings, margins, free cash flow, or other key financial metrics
- top headlines
- why the stock matters now

Bad context:

- hundreds of lines of raw financial statement JSON with no curation

Better context:

- a compact editorial snapshot with the numbers most relevant to the story

## What This Playbook Is Not For

This file is for newsletter generation.

It is not the same thing as the WIIM summary flow.

The WIIM / "why moving" feature in this codebase is not powered by Codex, Claude Code, or another LLM. It scrapes and parses Finviz data separately.

## Final Reminder

The goal is not just to produce valid JSON.

The goal is to produce JSON that already reads like a finished market newsletter:

- clear subject line
- useful intro
- sharp block headlines
- commentary with numbers
- no anonymous sections
- no generic AI filler

If the output feels vague, it is not done yet.
