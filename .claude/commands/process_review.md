# /process_review

Process feedback from Cursor Agent review and update the implementation plan accordingly.

## What to do
1) Ask: "Which plan has review feedback to process? (e.g., docs/STOCK_PRICE_CHART_PLAN.md)"
2) Read the plan, focusing on the `## Review Feedback (Cursor Agent)` section.
3) For each piece of feedback:
   - **Agreements**: Acknowledge briefly
   - **Concerns**: Address each - either explain why it's not an issue, or update the plan to mitigate
   - **Suggested Changes**: Either incorporate into the plan, or explain why not
   - **Questions**: Answer them directly
4) Update the plan:
   - Modify existing sections if the feedback warrants changes
   - Add a `## Review Resolution (Claude Code)` section summarizing:
     - Changes made based on feedback
     - Feedback acknowledged but not acted on (with reasoning)
     - Any remaining open questions
5) Report what changed.

## Guidelines
- Be objective - good feedback should be incorporated regardless of source
- Don't be defensive - if the feedback is valid, update the plan
- If you disagree, explain your reasoning clearly
- The goal is the best possible plan, not "winning" the review
