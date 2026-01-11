# Upwork Job Posting

## Job Title

**Full Stack Next.js Developer for AI-Powered Financial Data Platform (Supabase, OpenAI)**

---

## Job Description

We're building **Fin Quote**, a financial data platform that combines AI-powered stock analysis with real-time market tracking. We're looking for an experienced full-stack developer to help extend features, improve performance, and build new functionality.

### What We've Built

**1. AI-Powered Stock Q&A Chatbot**
- Natural language questions about stock data ("What was Apple's revenue in 2023?")
- Two-step LLM architecture: tool selection → data fetching → answer generation → validation
- Semantic search over SEC filings using RAG (vector embeddings)
- Auto-regeneration when answers fail validation
- Cost tracking and query logging

**2. Real-Time Stock Watchlist**
- Live stock quotes with 10-second polling
- Multi-source news aggregation (WSJ, NYT, Bloomberg, Yahoo)
- TradingView-style interactive charts with candlesticks
- Analyst ratings, earnings tracking, extended hours data
- User authentication and data persistence

### Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 19, Next.js 15 (App Router), TypeScript, Tailwind CSS |
| **Backend** | Next.js Server Actions, API Routes |
| **Database** | Supabase (PostgreSQL + pgvector for embeddings) |
| **Auth** | Supabase Auth (Google OAuth, email/password) |
| **AI/LLM** | OpenAI API (GPT-4o, GPT-5-nano), text-embedding-3-small |
| **Charts** | Highcharts, TradingView Lightweight Charts, HTML5 Canvas |
| **Data APIs** | Financial Modeling Prep (FMP), SEC EDGAR |
| **Architecture** | Monorepo with npm workspaces |
| **Testing** | Vitest, Testing Library |

### What You'll Work On

- Extend the AI chatbot to support additional stocks (currently Apple-only)
- Improve LLM prompt engineering for better accuracy and lower costs
- Build new watchlist features (alerts, portfolio tracking, screeners)
- Optimize performance and API efficiency
- Write tests and improve code quality
- Debug and fix issues as they arise
- Potentially integrate additional data sources

### Project Stats

- ~30+ server actions
- ~20+ API routes
- ~40+ React components
- ~130 files in the watchlist package
- Well-documented codebase with comprehensive CLAUDE.md

---

## Requirements

### Must Have

- **3+ years** with React and TypeScript
- Strong experience with **Next.js** (App Router, Server Actions, API Routes)
- Experience with **PostgreSQL** and Supabase (or similar like Firebase)
- Understanding of REST APIs and data fetching patterns
- Clean code practices and attention to detail
- Good English communication skills
- Available for at least **15-20 hours/week**

### Nice to Have

- Experience with **OpenAI API** or other LLM integrations
- Knowledge of **prompt engineering** and AI application development
- Familiarity with **vector databases** and RAG patterns
- Experience with **financial data** or fintech applications
- Experience with JavaScript charting libraries (Highcharts, TradingView Lightweight Charts, Chart.js, D3, Recharts, etc.)
- Knowledge of real-time data patterns (WebSockets, polling)
- Experience with monorepo setups (npm workspaces, Turborepo)

---

## Engagement Details

| Detail | Info |
|--------|------|
| **Type** | Ongoing contract (part-time to start, potential full-time) |
| **Hours** | 15-20 hours/week (flexible) |
| **Duration** | 3+ months, ongoing |
| **Timezone** | Flexible, but some overlap with US Eastern preferred |
| **Communication** | Slack/Discord for async, weekly video calls |

---

## How to Apply

Please include in your proposal:

1. **Brief intro** - Tell me about yourself and your relevant experience

2. **Next.js/React experience** - Share 1-2 projects you've built with Next.js (App Router preferred). GitHub links or live demos are great.

3. **AI/LLM experience** (if any) - Have you integrated OpenAI or other LLMs into applications? Briefly describe.

4. **Supabase/Database experience** - What databases have you worked with? Any Supabase or Firebase experience?

5. **Availability** - Your weekly availability and timezone

6. **Rate** - Your hourly rate in USD

### Bonus Points

- Experience with financial/stock market applications
- Contributions to open source projects
- Strong GitHub profile with code samples
- Experience optimizing LLM costs and latency

---

## What Success Looks Like

**First 2 weeks:**
- Get familiar with the codebase and architecture
- Fix a few small bugs or make minor improvements
- Understand the LLM pipeline and data flow

**First month:**
- Ship a meaningful feature or improvement
- Contribute to code quality (tests, refactoring)
- Participate in technical discussions and planning

**Ongoing:**
- Own features end-to-end
- Proactively identify and fix issues
- Help shape the product direction

---

## Questions?

Feel free to ask questions in your proposal. I'm happy to share more details about the project, codebase, or what we're trying to build.

Looking forward to hearing from you!

---

## Tags/Skills to Add on Upwork

When posting, add these skills:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase
- PostgreSQL
- OpenAI API
- Node.js
- REST APIs
- Git

---

## Upwork Settings Checklist

- [ ] Job Type: Hourly
- [ ] Experience Level: Intermediate to Expert
- [ ] Project Length: More than 6 months
- [ ] Hours per week: 15-20 hrs/week
- [ ] Talent Preference: Freelancers only
- [ ] Screening Questions: Add 1-2 (see below)

### Suggested Screening Questions

1. "Describe a Next.js project you've built using the App Router. What challenges did you face?"

2. "Have you worked with OpenAI's API or other LLMs? If so, briefly describe the use case."

3. "What's your experience with Supabase or similar backend-as-a-service platforms?"
