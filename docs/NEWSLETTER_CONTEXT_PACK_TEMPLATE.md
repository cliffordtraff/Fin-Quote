# Newsletter Context Pack Template

This file is the standard fact bundle you paste into a fresh Codex or ChatGPT chat after the model has read the newsletter playbook.

Its job is simple:

- give the model the facts for this specific newsletter
- keep those facts compact
- avoid giant raw dumps
- make every generation start from the same structure

Think of this as the case file.

The playbook tells the model how to behave.
This context pack tells the model what happened.

## How To Use It

1. Open a fresh chat.
2. Tell the model to read [NEWSLETTER_GENERATION_PLAYBOOK.md](/C:/Users/cliff/OneDrive/Desktop/Fin-Quote/docs/NEWSLETTER_GENERATION_PLAYBOOK.md).
3. Paste a filled-in version of this template.
4. Ask for JSON only.

## Single-Stock Template

```text
Mode: single_stock
Ticker: [TICKER]
Company: [COMPANY NAME]
User brief: [WHAT SHOULD THIS NEWSLETTER FOCUS ON?]
Generated at: [ISO TIMESTAMP OR DATE]

Price context:
- Last price: [PRICE]
- Daily move: [CHANGE %]
- Daily dollar change: [CHANGE $]
- 1M return: [VALUE]
- 3M return: [VALUE]
- 6M return: [VALUE]
- 1Y return: [VALUE]
- 52W high: [VALUE]
- 52W low: [VALUE]
- Distance to 52W high: [VALUE]
- Distance to 52W low: [VALUE]
- 50D SMA: [VALUE]
- 200D SMA: [VALUE]
- Above 50D SMA: [yes/no]
- Above 200D SMA: [yes/no]

Financial context:
- Latest period label: [EXAMPLE: FY2025 or Q4 2025]
- Revenue: [VALUE]
- Revenue YoY growth: [VALUE]
- Net income: [VALUE]
- Net income YoY growth: [VALUE]
- Gross margin: [VALUE]
- Operating margin: [VALUE]
- Free cash flow: [VALUE]
- EPS: [VALUE]

Supporting financial trend notes:
- [NOTE 1]
- [NOTE 2]
- [NOTE 3]

Recent headlines:
- [HEADLINE 1]
- [HEADLINE 2]
- [HEADLINE 3]

Why it matters now:
- [SHORT EXPLANATION 1]
- [SHORT EXPLANATION 2]

Draft requirements:
- Return a full newsletter draft document
- Return exactly 3 blocks
- Every block must name the company or ticker in the heading or first sentence
- Every sentence must contain at least one specific number from the context above
- Keep bodies to 1-2 sentences
- Set chartImageUrl to a placeholder if no image exists yet
- Set chartNeedsRegeneration to true if using placeholder images
```

## Market Roundup Template

```text
Mode: market_roundup
Roundup size: [3-5]
Theme: [WHAT IS THE SESSION ABOUT?]
User brief: [OPTIONAL FOCUS]
Generated at: [ISO TIMESTAMP OR DATE]

Market overview:
- Index backdrop: [SHORT SUMMARY]
- Sector/theme backdrop: [SHORT SUMMARY]
- Main catalyst: [SHORT SUMMARY]

Featured stocks:

1. [TICKER] - [COMPANY NAME]
- Daily move: [VALUE]
- Last price: [VALUE]
- 1M return: [VALUE]
- Key financial metric: [VALUE]
- Headline 1: [TEXT]
- Why included: [TEXT]

2. [TICKER] - [COMPANY NAME]
- Daily move: [VALUE]
- Last price: [VALUE]
- 1M return: [VALUE]
- Key financial metric: [VALUE]
- Headline 1: [TEXT]
- Why included: [TEXT]

3. [TICKER] - [COMPANY NAME]
- Daily move: [VALUE]
- Last price: [VALUE]
- 1M return: [VALUE]
- Key financial metric: [VALUE]
- Headline 1: [TEXT]
- Why included: [TEXT]

Draft requirements:
- Return a full newsletter draft document
- Use format "market_roundup"
- Return one intro paragraph summarizing the session theme
- Return one block per featured stock
- Every block must explicitly name the company or ticker
- Every sentence must contain at least one specific number from the context above
- Keep blocks concise and distinct
- Set chartImageUrl to a placeholder if no image exists yet
- Set chartNeedsRegeneration to true if using placeholder images
```

## Good Context Pack Principles

Use:

- curated numbers
- short bullets
- the few facts that actually matter
- clear “why now” framing

Avoid:

- raw statement dumps
- 50 headlines
- duplicate facts
- vague notes like “strong company” or “bullish setup”

## Best Practice

Before you paste the context pack, make sure it already answers:

- What stock or stocks are we talking about?
- Why now?
- What are the most important numbers?
- What is the angle?

If the input is fuzzy, the newsletter will be fuzzy.
