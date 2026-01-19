# /review_plan

Review an implementation plan created by Claude Code and provide structured feedback that can be fed back for iteration.

## Context
This plan was created collaboratively with Claude Code. Your role is to provide a second opinion - identify blind spots, suggest improvements, and flag potential issues. Your feedback will be fed back to Claude Code for analysis.

## What to do
1) Ask: "Which implementation plan should I review? (e.g., docs/STOCK_PRICE_CHART_PLAN.md)"
2) Read the plan thoroughly.
3) Review against these dimensions:
   - **Correctness**: Will this actually work? Any logical flaws?
   - **Completeness**: Missing steps, edge cases, error handling?
   - **Architecture**: Does it fit the existing codebase patterns?
   - **Simplicity**: Is anything over-engineered? Could it be simpler?
   - **Risks**: What could go wrong? Dependencies? Breaking changes?
   - **Testing**: How will we verify this works?
   - **Sequencing**: Is the order of steps optimal?
4) Append a new section titled `## Review Feedback (Cursor Agent)` with:
   - **Agreements**: What's solid about this plan
   - **Concerns**: Issues or risks identified
   - **Suggested Changes**: Specific improvements (be actionable)
   - **Questions for Claude Code**: Clarifications needed before proceeding
5) Save and report back.

## Important
- Keep original plan intact - only append the review section
- Be specific and actionable, not vague
- If you disagree with an approach, explain why and propose an alternative
- Claude Code will analyze your feedback and update the plan if warranted
