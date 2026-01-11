# 10 Questions to Ask Your Tutor About the Chatbot

## Understanding How It Works

### 1. **"How does the tool selection process actually work? Can you walk me through what happens when I ask 'What's AAPL's revenue?'"**
**Why This Matters**: Understanding the flow helps you debug issues and make improvements.

**What to Listen For**:
- How the prompt is constructed
- How the AI decides between tools
- What happens when it picks wrong
- How conversation history affects selection

**Follow-up Questions**:
- "What makes the AI pick `limit: 4` vs `limit: 20`?"
- "How can I see what the AI is thinking during tool selection?"

---

### 2. **"Why do we send JSON data to the LLM instead of formatted text? What's the advantage?"**
**Why This Matters**: Understanding data format helps you optimize what the LLM sees.

**What to Listen For**:
- Pros/cons of JSON vs text
- How the LLM parses JSON
- Best practices for structuring data
- How to format numbers for better understanding

**Follow-up Questions**:
- "Should we format numbers before sending (e.g., $383.3B) or let the LLM format them?"
- "How much does the JSON structure affect answer quality?"

---

## Debugging & Problem Solving

### 3. **"When the chatbot gives a wrong answer, how do I figure out where it went wrong? Is it tool selection, data fetching, or answer generation?"**
**Why This Matters**: Systematic debugging saves time and helps you fix issues faster.

**What to Listen For**:
- How to check each step (tool → data → answer)
- What logs to look at
- How to use the evaluation dashboard
- Common failure patterns

**Follow-up Questions**:
- "How do I know if the data is wrong vs the answer is wrong?"
- "What's the best way to test if my fix worked?"

---

### 4. **"I see validation catches errors, but sometimes regeneration doesn't fix them. Why does that happen?"**
**Why This Matters**: Understanding validation helps you improve answer quality.

**What to Listen For**:
- How validation works
- When regeneration triggers
- Why regeneration might fail
- How to improve regeneration prompts

**Follow-up Questions**:
- "Should we regenerate multiple times if it still fails?"
- "How do I make the error messages in regeneration prompts clearer?"

---

## Improving Performance

### 5. **"The chatbot takes 5-8 seconds to answer. Where is most of that time spent, and how can we speed it up?"**
**Why This Matters**: Faster responses = better user experience.

**What to Listen For**:
- Breakdown of latency (tool selection, data fetch, answer generation)
- Which step is slowest
- How to parallelize operations
- Caching strategies

**Follow-up Questions**:
- "Can we cache tool selection results?"
- "Should we fetch data while generating the answer?"

---

### 6. **"I see we're spending money on API calls. How can I see which queries are expensive, and how do I reduce costs?"**
**Why This Matters**: Cost optimization keeps the app sustainable.

**What to Listen For**:
- How to read cost data from `query_logs`
- Which operations are expensive
- How to reduce token usage
- When to use cheaper models

**Follow-up Questions**:
- "Should we use a cheaper model for tool selection?"
- "How much can we reduce costs by optimizing prompts?"

---

## Code Structure & Best Practices

### 7. **"The prompts in `lib/tools.ts` are really long. How do I know what parts are actually important vs what's just documentation?"**
**Why This Matters**: Understanding prompt structure helps you make targeted improvements.

**What to Listen For**:
- Which parts of the prompt the LLM actually uses
- How to test if removing something hurts performance
- Best practices for prompt organization
- How to add examples effectively

**Follow-up Questions**:
- "Should I add more examples or make the rules clearer?"
- "How do I test if a prompt change actually helps?"

---

### 8. **"We have two different database tables for financial data (`financials_std` and `financial_metrics`). Should we unify them, and how?"**
**Why This Matters**: Consistent data structure = better chatbot performance.

**What to Listen For**:
- Pros/cons of each approach
- Migration strategy
- How it affects chatbot queries
- Best practices for database design

**Follow-up Questions**:
- "Should we create a view that combines both?"
- "How does this affect the JSON we send to the LLM?"

---

## Advanced Topics

### 9. **"How does the conversation history work? When I ask a follow-up like 'What about net income?', how does it know I mean the same time period?"**
**Why This Matters**: Better context handling = smarter conversations.

**What to Listen For**:
- How conversation history is passed to prompts
- How the AI resolves pronouns and references
- Best practices for context management
- Token limits and history truncation

**Follow-up Questions**:
- "How many previous messages should we include?"
- "What happens when the conversation gets too long?"

---

### 10. **"The filing search sometimes returns irrelevant results. How does semantic search work, and how can we improve it?"**
**Why This Matters**: Better search = better answers about filings.

**What to Listen For**:
- How vector embeddings work
- How similarity search finds relevant passages
- Why some queries fail
- How to improve chunking and search

**Follow-up Questions**:
- "Should we re-rank results after semantic search?"
- "How do we know if chunks are the right size?"

---

## Bonus: Questions About Testing

### 11. **"How do I know if my improvements are actually working? What metrics should I track?"**
**Why This Matters**: Measuring success helps you prioritize improvements.

**What to Listen For**:
- Key metrics (accuracy, latency, cost)
- How to use the evaluation dashboard
- Before/after comparisons
- Statistical significance

**Follow-up Questions**:
- "How many test questions do I need to see real improvement?"
- "What's a good accuracy target?"

---

### 12. **"I see we have an evaluation system. How do I add new test questions, and how do I know if they're good test cases?"**
**Why This Matters**: Good test coverage = confidence in improvements.

**What to Listen For**:
- How to add questions to test set
- What makes a good test question
- Edge cases to test
- How to maintain the test set

**Follow-up Questions**:
- "Should I test edge cases or common questions?"
- "How often should I update the test set?"

---

## How to Use These Questions

### Before Your Session:
1. Pick 3-5 questions that interest you most
2. Review the relevant code/files mentioned
3. Try to answer them yourself first
4. Write down what you think the answer might be

### During Your Session:
1. Start with question #1 or #3 (understanding/debugging)
2. Ask follow-up questions as you go
3. Take notes on what you learn
4. Ask for code examples if helpful

### After Your Session:
1. Try implementing what you learned
2. Test your changes
3. Come back with more specific questions
4. Share what worked/didn't work

---

## Questions Organized by Priority

### Must Ask (Start Here):
1. **Question #3** - How to debug wrong answers
2. **Question #1** - How tool selection works
3. **Question #5** - How to speed things up

### Should Ask (Next Session):
4. **Question #2** - Why JSON format
5. **Question #7** - Prompt structure
6. **Question #9** - Conversation context

### Nice to Ask (Later):
7. **Question #4** - Validation/regeneration
8. **Question #6** - Cost optimization
9. **Question #8** - Database structure
10. **Question #10** - Filing search

---

## Tips for Asking Questions

1. **Be Specific**: Instead of "How does it work?", ask "How does tool selection decide between getAaplFinancialsByMetric and getFinancialMetric?"

2. **Show Examples**: Bring a specific question that failed and ask "Why did this fail?"

3. **Ask for Code**: "Can you show me in the code where this happens?"

4. **Test Understanding**: "So if I understand correctly, the AI picks the tool first, then fetches data, then generates the answer?"

5. **Ask for Best Practices**: "What's the best way to do X?" or "What would you do differently?"

---

## Example Conversation Flow

**You**: "I'm confused about tool selection. When I ask 'What's revenue?', how does it know to use getAaplFinancialsByMetric instead of getFinancialMetric?"

**Tutor**: [Explains the prompt and decision logic]

**You**: "So the prompt has examples that help it decide?"

**Tutor**: [Shows you the examples in the prompt]

**You**: "I see. What if I want to add a new example? How do I know if it helps or hurts?"

**Tutor**: [Explains how to test with evaluation script]

**You**: "Got it. Can we try adding an example together and test it?"

---

## Remember

- **There are no dumb questions** - If you're confused, ask!
- **Ask for examples** - Code examples help you understand
- **Take notes** - Write down what you learn
- **Try it yourself** - After the session, implement what you learned
- **Come back with results** - Share what worked/didn't work next time
