# Flow Visualization Feature - Implementation Plan

## Overview

A real-time visualization panel that shows the step-by-step execution flow when answering user questions. This feature provides transparency into the LLM decision-making process, tool selection, data fetching, and validation steps.

**🔑 Key Feature: "Why" Explanations**

The visualization doesn't just show *what* happened—it explains *why* each decision was made:
- Why the LLM chose a specific tool
- Why it selected certain arguments (e.g., 5 years vs 10 years)
- Why a line chart was chosen instead of a bar chart
- Why validation passed or failed
- Why specific data points are displayed

This reasoning layer helps you understand the system's decision-making process at a deep level, making it easier to debug issues, improve prompts, and optimize performance.

**Primary Goals:**
1. **Education** - Help developers understand how the system works
2. **Debugging** - Identify bottlenecks and failures in the query flow
3. **Optimization** - Track timing metrics to improve performance
4. **Demo-ability** - Showcase system intelligence to users/investors
5. **Transparency** - Show reasoning behind every decision (💡 "Why" feature)

---

## UI/UX Design

### Layout: Right Sidebar Panel

**Dimensions:**
- Width: 400px on desktop
- Fixed position on right side of screen
- Full height (minus header)
- Collapsible with toggle button

**Mobile Behavior:**
- Drawer that slides up from bottom
- Half-screen overlay
- Swipe down to dismiss

**Position in DOM:**
- Right of main chat area
- Chat area width adjusts when panel is open
- Main chat: `lg:mr-0` (panel closed) → `lg:mr-[400px]` (panel open)

### Visual Design: Vertical Timeline with "Why" Explanations

```
┌─────────────────────────────────────────────┐
│ Flow Visualization                    [✕]   │
├─────────────────────────────────────────────┤
│                                             │
│  ● Tool Selection                      324ms│  ← Active step (blue, pulsing)
│  │  Analyzing question...                   │
│  │                                          │
│  ├─ Selected: getAaplFinancialsByMetric    │
│  ├─ 💡 Why: User asked "revenue last 5     │
│  │   years" → needs historical financial   │
│  │   data, not price or filing search      │
│  ├─ Args: { metric: "revenue", limit: 5 }  │
│  └─ 💡 Why 5 years: User explicitly said   │
│      "last 5 years" in question            │
│                                             │
│  ✓ Fetching Data                       142ms│  ← Completed (green)
│  │  Source: Supabase financials_std        │
│  ├─ Retrieved: 5 rows (2020-2024)          │
│  └─ 💡 Why: Queried revenue for AAPL       │
│      sorted by year DESC, limit 5          │
│                                             │
│  ✓ Generating Answer                  1823ms│
│  │  Model: GPT-5-nano                      │
│  ├─ Input tokens: 1,234                    │
│  ├─ Output tokens: 567                     │
│  └─ 💡 Why: Using retrieved data to        │
│      answer question with exact numbers    │
│                                             │
│  ✓ Validation                           45ms│
│  │  Numbers: ✓ All accurate                │
│  │  Years: ✓ 2020-2024 all in data         │
│  ├─ Citations: ✓ Valid                     │
│  └─ 💡 Why passed: All numbers match       │
│      source data within 2% tolerance       │
│                                             │
│  ✓ Chart Generated                      89ms│
│  │  Type: Line chart                       │
│  ├─ Data points: 5                         │
│  └─ 💡 Why line chart: Time series data    │
│      (year-over-year) → line shows trend   │
│                                             │
└─────────────────────────────────────────────┘
```

### Step Grouping

- Group related steps into collapsible sections to keep long flows scannable:
  - **Planning** — tool selection, prompt prep
  - **Data** — tool execution, fetching, validation
  - **Answering** — answer generation, charting, follow-up
- Collapse completed groups by default on desktop; keep active group expanded.
- Show a progress bar or breadcrumb at the top summarizing group completion (e.g., `Planning ✓  |  Data ●  |  Answering ☐`).

### Quick Filters & Highlights

- Add pill-shaped filter chips in the panel header for `All`, `Errors`, `Warnings`, `Slow > 1s`, and `High Cost`.
- Highlight counts inside each chip so users can see, e.g., `Warnings (2)`.
- Persist the selected filter in `localStorage` so power users keep their preferred view.
- Surface a compact “Latest run summary” badge near the chips showing the slowest step and cost to guide attention.

### Color Coding

- **Blue** (`bg-blue-500`) - Step in progress (with pulse animation)
- **Green** (`bg-green-500`) - Step completed successfully
- **Yellow** (`bg-yellow-500`) - Step completed with warnings
- **Red** (`bg-red-500`) - Step failed
- **Gray** (`bg-gray-300`) - Step not yet started

### Step States

Each step has 3 states:
1. **Pending** - Gray dot, no content
2. **Active** - Blue pulsing dot, "Loading..." message
3. **Complete** - Checkmark/X, full details, timing

---

## "Why" Explanations - Key Feature

**Goal:** Show reasoning behind every decision, not just what happened.

### Where "Why" Explanations Appear

**1. Tool Selection**
- **Why this tool:** Extract LLM's reasoning from tool selection response
  - Example: "User asked about revenue trend → needs financial data, not price or filing search"
- **Why these arguments:** Explain specific parameter choices
  - Example: "Why 5 years: User explicitly said 'last 5 years' in question"
  - Example: "Why metric='net_income': Question asks about profit/earnings"

**2. Tool Execution**
- **Why this data:** Explain what data was fetched and why
  - Example: "Queried revenue for AAPL 2020-2024 because user asked for 'last 5 years'"
  - Example: "Retrieved 5 rows (2020-2024) sorted by year DESC"

**3. Answer Generation**
- **Why this approach:** Explain how the LLM is using the data
  - Example: "Using retrieved data to calculate year-over-year growth percentages"
  - Example: "Comparing 2024 vs 2020 to show 5-year trend"

**4. Validation**
- **Why passed/failed:** Explain validation results in plain language
  - Example: "✓ All numbers match source data within 2% tolerance"
  - Example: "⚠ Answer mentions 2019 but database only has 2020-2024"
  - Example: "✓ Gross margin calculation correct: (gross_profit / revenue) × 100"

**5. Chart Generation**
- **Why this chart type:** Explain chart selection logic
  - Example: "Line chart chosen because data is time series (year-over-year)"
  - Example: "Bar chart chosen because comparing discrete categories"
- **Why these data points:** Explain what's displayed
  - Example: "Showing all 5 years from query result (2020-2024)"
  - Example: "Displaying latest 10 years to show long-term trend"

### How to Generate "Why" Explanations

**From LLM (Already Available):**
The tool selection prompt already asks the LLM to explain its reasoning. We just need to extract it:

```typescript
// In tool selection response, LLM provides reasoning like:
{
  tool: "getAaplFinancialsByMetric",
  args: { metric: "revenue", limit: 5 },
  reasoning: "User asked about revenue over last 5 years, so need historical financial data"
}
```

**From Code Logic (Need to Add):**
For steps without LLM reasoning, generate explanations based on code logic:

**Chart Type Selection:**
```typescript
// In chart-helpers.ts
function explainChartType(chartConfig: ChartConfig): string {
  if (chartConfig.type === 'line') {
    return "Line chart: Time series data (year-over-year) shows trends over time"
  } else if (chartConfig.type === 'bar') {
    return "Bar chart: Comparing values across discrete categories"
  }
  // ... more logic
}
```

**Validation Results:**
```typescript
// In validators.ts
function explainValidation(validationResult: ValidationResult): string {
  if (validationResult.overall_passed) {
    return `All checks passed: Numbers accurate (${validationResult.number_validation.matches}/${validationResult.number_validation.total}), years correct, citations valid`
  } else {
    const issues = []
    if (!validationResult.number_validation.passed) {
      issues.push(`Number mismatch: ${validationResult.number_validation.details}`)
    }
    if (!validationResult.year_validation.passed) {
      issues.push(`Year issue: ${validationResult.year_validation.details}`)
    }
    return `Validation issues: ${issues.join('; ')}`
  }
}
```

**Data Fetching:**
```typescript
// In ask-question.ts
function explainDataFetch(tool: string, args: any, result: any): string {
  if (tool === 'getAaplFinancialsByMetric') {
    return `Fetched ${result.data.length} years of ${args.metric} data for AAPL (${result.data[0]?.year}-${result.data[result.data.length-1]?.year})`
  } else if (tool === 'searchFilings') {
    return `Searched SEC filings for "${args.query}", found ${result.data.length} relevant passages`
  }
  // ... more tools
}
```

### UI Design for "Why" Explanations

**Visual Indicator:** 💡 lightbulb icon before each "why" explanation

**Styling:**
- Slightly indented from main content
- Lighter text color (gray-600)
- Italic font style
- Separated with subtle border or background
- Use compact badges (`<Badge variant="outline">Why</Badge>`) to label explanations; swap badge color to orange when the reasoning contains warnings or uncertainty flags so they stand out immediately.
- Allow users to expand a “View full explanation” popover for lengthy rationales to keep the timeline concise.

**Example in code:**
```tsx
{step.reasoning && (
  <div className="ml-4 mt-2 text-sm text-gray-600 dark:text-gray-400 italic border-l-2 border-yellow-400 pl-3">
    <span className="not-italic">💡</span> {step.reasoning}
  </div>
)}
```

---

## Data Structure

### Flow Event Types

```typescript
type FlowEventType =
  | 'tool_selection_start'
  | 'tool_selection_complete'
  | 'tool_execution_start'
  | 'tool_execution_complete'
  | 'answer_generation_start'
  | 'answer_generation_complete'
  | 'validation_start'
  | 'validation_complete'
  | 'chart_generation_start'
  | 'chart_generation_complete'
  | 'followup_generation_start'
  | 'followup_generation_complete'
  | 'error'

type FlowEventStatus = 'pending' | 'active' | 'success' | 'warning' | 'error'

interface FlowEvent {
  id: string // Unique event ID
  type: FlowEventType
  status: FlowEventStatus
  timestamp: string
  duration?: number // milliseconds
  reasoning?: string // 💡 "Why" explanation for this step
  data?: {
    // Tool Selection
    tool?: string
    toolReasoning?: string // Why this tool was chosen
    arguments?: Record<string, any>
    argumentReasoning?: string // Why these specific arguments

    // Tool Execution
    source?: string
    rowCount?: number
    query?: string
    queryReasoning?: string // Why this specific query

    // Answer Generation
    model?: string
    inputTokens?: number
    outputTokens?: number
    cost?: number
    answerReasoning?: string // How the LLM is using the data

    // Validation
    validationResults?: {
      numberValidation: { passed: boolean; details: string }
      yearValidation: { passed: boolean; details: string }
      filingValidation: { passed: boolean; details: string }
      overallSeverity: 'none' | 'low' | 'medium' | 'high'
    }
    validationReasoning?: string // Why validation passed/failed

    // Chart
    chartType?: string
    dataPoints?: number
    chartReasoning?: string // Why this chart type was chosen
    dataReasoning?: string // Why these specific data points

    // Follow-up
    questionsGenerated?: number
    followupReasoning?: string // Why these questions were suggested

    // Error
    error?: string
    errorDetails?: string
    errorReasoning?: string // Why the error occurred
  }
}

interface FlowSession {
  sessionId: string
  questionId: string
  question: string
  events: FlowEvent[]
  startTime: string
  endTime?: string
  totalDuration?: number
}
```

---

## Architecture

### Server-Side Changes

#### 1. Modify `ask-question.ts` to Emit Events

Instead of just logging, emit events that can be streamed to the client:

```typescript
// Current approach (logging only):
console.log('Tool selection:', toolSelection)

// New approach (emit events):
emitFlowEvent({
  type: 'tool_selection_complete',
  status: 'success',
  duration: toolSelectionLatency,
  data: {
    tool: toolSelection.tool,
    arguments: toolSelection.args,
    reasoning: toolSelection.reasoning
  }
})
```

#### 2. Create Flow Event Emitter

**File:** `lib/flow-events.ts`

```typescript
type FlowEventListener = (event: FlowEvent) => void

class FlowEventEmitter {
  private listeners: FlowEventListener[] = []

  subscribe(listener: FlowEventListener) {
    this.listeners.push(listener)
  }

  emit(event: FlowEvent) {
    this.listeners.forEach(listener => listener(event))
  }
}

export const flowEmitter = new FlowEventEmitter()
```

#### 3. Update SSE Stream to Include Flow Events

In `ask-question.ts`, the existing SSE stream already sends:
- `answer` events (answer text chunks)
- `chart` events (chart config)
- `followup` events (follow-up questions)
- `validation` events (validation results)
- `latency` events (timing data)

**Add new event type:**
- `flow` events (flow visualization data)

```typescript
// Send flow event via SSE
encoder.enqueue(
  `data: ${JSON.stringify({
    type: 'flow',
    event: flowEvent
  })}\n\n`
)
```

### Frontend Changes

#### 1. Create Flow Visualization Component

**File:** `components/FlowVisualization.tsx`

**Props:**
- `events: FlowEvent[]` - Array of flow events for current question
- `isOpen: boolean` - Whether panel is visible
- `onToggle: () => void` - Toggle panel visibility

**Features:**
- Real-time updates as events arrive
- Smooth animations for new events
- Expandable/collapsible details per step
- Auto-scroll to latest event

#### 2. Create Individual Step Components

**File:** `components/FlowStep.tsx`

Displays a single step in the timeline with:
- Icon/dot with status color
- Step title
- Timing (if complete)
- Expandable details
- Connection line to next step

#### 3. Update `page.tsx` to Handle Flow Events

**State Management:**
```typescript
const [flowEvents, setFlowEvents] = useState<FlowEvent[]>([])
const [flowPanelOpen, setFlowPanelOpen] = useState(true)
```

**SSE Handler:**
```typescript
// In handleSubmitStreaming, add flow event handler:
if (data.type === 'flow') {
  setFlowEvents(prev => [...prev, data.event])
}
```

**Layout Adjustment:**
```typescript
// Adjust chat width when panel is open
<div className={`
  flex-1 overflow-y-auto
  ${flowPanelOpen ? 'lg:mr-[400px]' : 'lg:mr-0'}
`}>
```

---

## Implementation Steps

Deliver the feature in thin slices so we can demo value early and de-risk the "why" explanations. Phase 1 should focus on producing clean, structured events (even if `why` strings are placeholders). Phase 2 can render the timeline UI using that contract, and Phase 3+ can iterate on richer reasoning, costs, and polish once the pipeline is proven end-to-end.

### Phase 1: Backend Event Emission (Days 1-2)

**Priority: High**

1. **Create `lib/flow-events.ts`**
   - Define FlowEvent types
   - Create event emitter utility
   - Add helper functions for common events

2. **Update `app/actions/ask-question.ts`**
   - Import flow event emitter
   - Emit events at each major step:
     - Tool selection start/complete
     - Tool execution start/complete
     - Answer generation start/complete
     - Validation start/complete
     - Chart generation complete
     - Follow-up generation complete
   - Include all relevant data in events
   - Update upstream LLM/tool prompts to return structured `why` reasoning and arguments needed for the panel

3. **Define Event Contract**
   - Document `FlowEvent` interface (id, step, status, timing, why, metadata)
   - Specify allowed `status` values (`pending`, `active`, `success`, `warning`, `error`)
   - Ensure payload size remains small (<2 KB per event) by trimming large objects
   - Share schema with frontend before implementation begins

4. **Modify SSE Stream**
   - Add `flow` event type to SSE stream
   - Emit flow events alongside existing events
   - Test with console.log on frontend

5. **Testing**
   - Verify events emit in correct order
   - Verify timing data is accurate
   - Test with different question types

### Phase 2: Frontend Components (Days 3-4)

**Priority: High**

1. **Create `components/FlowStep.tsx`**
   - Build individual step component
   - Add status icons and colors
   - Add expand/collapse functionality
   - Add timing display
   - Style with Tailwind
   - Include inline “View inspector” affordance that opens the FlowInspector drawer with deep links to logs/prompts

2. **Create `components/FlowVisualization.tsx`**
   - Build main panel component
   - Add vertical timeline layout
   - Add auto-scroll to latest event
   - Add toggle button
   - Add empty state ("Ask a question to see the flow")
   - Make responsive (desktop + mobile)
   - Add header-level filter chips (e.g., `All`, `Errors`, `Warnings`, `Slow > 1s`, `High Cost`) and remember selection in state/localStorage

3. **Update `app/ask/page.tsx`**
   - Add flow events state
   - Handle flow events from SSE
   - Integrate FlowVisualization component
   - Add panel toggle button to header
   - Adjust layout for panel width
   - Persist panel open/close state to localStorage
   - Subscribe/unsubscribe to the inspector data channel only when the drawer is open to control load

4. **Testing**
   - Test real-time updates
   - Test panel toggle
   - Test mobile responsiveness
   - Test with multiple questions in conversation

### Phase 3: Polish & Enhancements (Days 5-6)

**Priority: Medium**

1. **Animations**
   - Add smooth slide-in for panel
   - Add pulse animation for active steps
   - Add fade-in for new events
   - Add success checkmark animation

2. **Details Expansion**
   - Add "View Details" button per step
   - Show full JSON data on expand
   - Syntax highlight JSON
   - Add copy button for debugging

3. **Performance**
   - Clear old events after N questions
   - Virtualize list for long sessions
   - Debounce rapid events
   - Compute rolling aggregates (avg / p95 per step, total cost) and render a summary chip under the header filters

4. **Accessibility**
   - Add ARIA labels
   - Keyboard navigation
   - Screen reader support

### Phase 4: Advanced Features (Future)

**Priority: Low**

1. **Export Flow Data**
   - Download as JSON
   - Share flow link
   - Copy to clipboard

2. **Historical View**
   - Show flow for previous questions
   - Compare flows side-by-side
   - Search through past flows

3. **Metrics Dashboard**
   - Average timing per step
   - Success rate tracking
   - Cost tracking over time

4. **Developer Mode**
   - Show actual SQL queries
   - Show full LLM prompts
   - Show raw API responses

---

## Streaming Event Contract

To keep the frontend and backend aligned, every flow update must conform to a shared schema.

### `FlowEvent` Interface

```typescript
type FlowEventStatus = 'pending' | 'active' | 'success' | 'warning' | 'error'

interface FlowEvent {
  id: string                // monotonic id or UUID
  step: string              // e.g. 'tool_selection'
  group: 'planning' | 'data' | 'answering'
  sequence: number          // incremental index within the flow
  parentId?: string         // optional parent event for sub-tasks/retries
  status: FlowEventStatus
  startedAt: string         // ISO timestamp
  durationMs?: number       // present when status resolves
  why?: string              // short explanation (<200 chars)
  summary?: string          // human-readable headline
  details?: Record<string, unknown> // trimmed metadata for expand panel
  costUsd?: number          // optional incremental cost
  inspectorRef?: {
    type: 'query_log' | 'prompt' | 'validation_log' | 'custom'
    id: string
  }
}
```

**Guidelines**
- Keep each payload under ~2 KB; strip large objects, only send IDs or counts.
- Normalize `step` names so the UI can map to icons/titles.
- Populate `why` directly from LLM/tool reasoning; fall back to a sensible default if none returned.
- Emit `pending` → `active` → resolved events in order; the UI relies on monotonic timestamps.
- Only subscribe the client to the `flow` SSE channel when the debug panel is open to avoid unnecessary traffic.
- Use `group` and `sequence` to drive timeline layout and progress summaries; ensure parent/child events share the same sequence window for retries.
- Prefer `inspectorRef` pointers over embedding bulky payloads; the inspector drawer uses the ref to fetch the full artifact on demand.

### Sample SSE Message

```
event: flow
data: {
  "id": "tool_selection:1747073289123",
  "step": "tool_selection",
  "group": "planning",
  "sequence": 1,
  "parentId": null,
  "status": "success",
  "startedAt": "2025-05-12T18:08:09.123Z",
  "durationMs": 312,
  "why": "User asked for revenue trend → requires financials tool",
  "summary": "Selected getAaplFinancialsByMetric",
  "details": {
    "arguments": { "metric": "revenue", "limit": 5 }
  },
  "inspectorRef": { "type": "prompt", "id": "prompt_v42" }
}
```

Share this contract with both teams before implementation so backend work can run in parallel with the React components.

---

## Component Structure

```
components/
├── FlowVisualization.tsx          (Main panel)
│   ├── FlowHeader.tsx             (Title + toggle)
│   ├── FlowTimeline.tsx           (Timeline container)
│   │   └── FlowStep.tsx           (Individual step)
│   │       ├── StepIcon.tsx       (Status icon)
│   │       ├── StepTitle.tsx      (Step name + timing)
│   │       └── StepDetails.tsx    (Expandable details)
│   │       └── StepFilterChips.tsx (Status + slow/cost filters)
│   └── FlowEmpty.tsx              (Empty state)
└── FlowToggleButton.tsx           (Floating toggle button)

Add an optional `FlowInspectorDrawer.tsx` that slides over the panel to show raw tool logs, SQL queries, or prompt excerpts when a user clicks “Inspect” on any step.
```

---

## Server-Side Event Emission Points

### `app/actions/ask-question.ts`

**Current Code → Add Event Emission**

1. **Line ~224 - Tool Selection Start**
```typescript
// BEFORE tool selection API call
emitFlowEvent({ type: 'tool_selection_start', status: 'active' })
```

2. **Line ~313 - Tool Selection Complete**
```typescript
// AFTER receiving tool selection
emitFlowEvent({
  type: 'tool_selection_complete',
  status: 'success',
  duration: toolSelectionLatency,
  data: {
    tool: toolSelection.tool,
    arguments: toolSelection.args
  }
})
```

3. **Line ~316 - Tool Execution Start**
```typescript
// BEFORE tool execution
emitFlowEvent({
  type: 'tool_execution_start',
  status: 'active',
  data: { tool: toolSelection.tool }
})
```

4. **Line ~438 - Tool Execution Complete**
```typescript
// AFTER tool returns data
emitFlowEvent({
  type: 'tool_execution_complete',
  status: 'success',
  duration: toolExecutionLatency,
  data: {
    source: 'Supabase',
    rowCount: toolData?.data?.length || 0,
    inspectorRef: { type: 'query_log', id: queryLogId }
  }
})
```

5. **Line ~441 - Answer Generation Start**
```typescript
// BEFORE answer generation
emitFlowEvent({
  type: 'answer_generation_start',
  status: 'active',
  data: { model: OPENAI_MODEL }
})
```

6. **Line ~500 - Answer Generation Complete**
```typescript
// AFTER answer generated
emitFlowEvent({
  type: 'answer_generation_complete',
  status: 'success',
  duration: answerGenerationLatency,
  data: {
    model: OPENAI_MODEL,
    inputTokens: answerUsage.prompt_tokens,
    outputTokens: answerUsage.completion_tokens,
    inspectorRef: { type: 'prompt', id: promptVersionId }
  }
})
```

7. **Line ~503 - Validation Start**
```typescript
// BEFORE validation
emitFlowEvent({ type: 'validation_start', status: 'active' })
```

8. **Line ~658 - Validation Complete**
```typescript
// AFTER validation
emitFlowEvent({
  type: 'validation_complete',
  status: validationResult.overall_passed ? 'success' : 'warning',
  data: {
    validationResults: validationResult.summary,
    inspectorRef: { type: 'validation_log', id: validationResult.id }
  }
})
```

9. **Chart Generation** (if applicable)
```typescript
// AFTER chart config created
emitFlowEvent({
  type: 'chart_generation_complete',
  status: 'success',
  data: {
    chartType: chartConfig.type,
    dataPoints: chartConfig.data.length
  }
})
```

10. **Follow-up Generation** (if applicable)
```typescript
// AFTER follow-up questions generated
emitFlowEvent({
  type: 'followup_generation_complete',
  status: 'success',
  data: { questionsGenerated: followUpQuestions.length }
})
```

---

## Styling Guidelines

### Colors (Dark Mode Compatible)

```typescript
const statusColors = {
  pending: 'bg-gray-300 dark:bg-gray-600',
  active: 'bg-blue-500 dark:bg-blue-400',
  success: 'bg-green-500 dark:bg-green-400',
  warning: 'bg-yellow-500 dark:bg-yellow-400',
  error: 'bg-red-500 dark:bg-red-400'
}

const textColors = {
  pending: 'text-gray-500 dark:text-gray-400',
  active: 'text-blue-600 dark:text-blue-400',
  success: 'text-green-600 dark:text-green-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
  error: 'text-red-600 dark:text-red-400'
}
```

### Spacing

- Timeline padding: `p-4`
- Step gap: `space-y-4`
- Icon size: `w-6 h-6`
- Connection line: `h-full w-0.5`
- Panel width: `w-[400px]`
- Mobile height: `h-[50vh]`

### Animations

```css
/* Pulse animation for active step */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Slide in from right */
@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.slide-in-right {
  animation: slideInRight 0.3s ease-out;
}
```

---

## User Settings

Store in localStorage:

```typescript
interface FlowVisualizationSettings {
  isOpen: boolean           // Panel visibility
  autoScroll: boolean       // Auto-scroll to latest event
  showTimings: boolean      // Show timing numbers
  expandDetails: boolean    // Auto-expand details
}

const defaultSettings: FlowVisualizationSettings = {
  isOpen: true,
  autoScroll: true,
  showTimings: true,
  expandDetails: false
}
```

---

## Testing Plan

### Unit Tests

1. **FlowEvent Type Guards**
   - Verify event types are correctly typed
   - Test event validation

2. **FlowStep Component**
   - Test all status states render correctly
   - Test expand/collapse works
   - Test timing display formats correctly

3. **FlowVisualization Component**
   - Test empty state
   - Test event list renders
   - Test auto-scroll works

### Integration Tests

1. **SSE Stream**
   - Verify flow events are emitted in order
   - Verify events contain correct data
   - Verify timing accuracy

2. **Full Question Flow**
   - Ask question
   - Verify all expected events appear
   - Verify timings are reasonable
   - Verify final state is success

### Manual Testing Checklist

- [ ] Panel opens/closes smoothly
- [ ] Events appear in real-time
- [ ] Active step pulses
- [ ] Completed steps show checkmark
- [ ] Timings are accurate
- [ ] Details expand/collapse
- [ ] Works on mobile
- [ ] Works in dark mode
- [ ] Multiple questions don't break panel
- [ ] Long sessions perform well

---

## Performance Considerations

1. **Event Limit**
   - Keep max 100 events in memory
   - Clear old events after 10 questions
   - Offer "Export" before clearing

2. **Virtualization**
   - Use react-window for long event lists
   - Only render visible events

3. **Debouncing**
   - Debounce rapid SSE events
   - Batch multiple events if <50ms apart

4. **Subscription & Memory**
   - Only subscribe to the `flow` SSE channel when the panel is open; tear it down on close
   - Clear events on page navigation
   - Gate heavy detail fetches (e.g. raw SQL) behind an explicit “View details” action

5. **Aggregate Metrics Capture**
   - Record rolling averages (e.g., mean/95th percentile duration per step, cumulative cost) on the client for the current session.
   - Expose these summaries in a small header widget (“Last question: Data 420 ms, Answer 1.8 s, Cost $0.004”) to highlight hotspots without scanning the full list.
   - Optionally emit aggregate telemetry back to analytics for longer-term monitoring.

---

## Future Enhancements

### Phase 2 Ideas

1. **Flow Comparison**
   - Compare two question flows side-by-side
   - Identify differences in tool selection or timing

2. **Metrics Dashboard**
   - Average timing per step over time
   - Success rate tracking
   - Cost analysis

3. **Export & Share**
   - Export flow as JSON
   - Share flow via URL
   - Embed flow in documentation

4. **Developer Mode**
   - Show full LLM prompts
   - Show actual SQL queries
   - Show raw API responses
   - Copy-paste friendly format

5. **Search & Filter**
   - Search through past flows
   - Filter by tool used
   - Filter by success/failure

6. **Notifications**
   - Toast when step takes >3 seconds
   - Warning when validation fails
   - Error alerts

---

## Success Metrics

How we'll know this feature is successful:

1. **Developer Usage**
   - % of dev sessions with panel open
   - Average time spent viewing panel

2. **Performance Insights**
   - Bottlenecks identified and fixed
   - Average latency improvement over time

3. **Error Detection**
   - Faster identification of tool selection errors
   - Quicker debugging of validation failures

4. **Demo Value**
   - Used in user onboarding
   - Featured in investor demos
   - Mentioned in user feedback

---

## Open Questions

1. Should panel be visible to end users or developer-only?
   - **Recommendation:** Toggle via URL param `?debug=true` for now

2. Should we persist flow history across sessions?
   - **Recommendation:** No for MVP, add later if needed

3. Should we show cost estimates in real-time?
   - **Recommendation:** Yes, add to answer generation step

4. Mobile: Bottom drawer or full-screen overlay?
   - **Recommendation:** Bottom drawer (half-screen)

---

## Summary

This feature will provide unprecedented transparency into your LLM system's decision-making process. By visualizing each step in real-time, you'll be able to:

- Understand how your system works at a deep level
- Identify and fix bottlenecks quickly
- Improve prompt engineering based on tool selection patterns
- Debug validation failures easily
- Showcase system intelligence to stakeholders

**Estimated Implementation Time:** 5-6 days
**Complexity:** Medium
**Value:** Very High

## Implementation Status (May 2025)

- ✅ **Backend event pipeline in place:** `/api/ask` now instantiates a flow emitter, emits structured `flow` SSE events for tool selection, execution, chart generation, answer streaming, validation, and follow-up, and reports warnings/errors with reason strings.
- ✅ **Frontend panel shipped (Phase 1-2):** `FlowVisualization` panel renders grouped timelines, filter chips (`All`, `Errors`, `Warnings`, `Slow >1s`, `Cost`), summary badges (slowest step, total cost), and persists open/filter state. Chat layout/input bar shift when the panel opens; the floating "Flow" button reopens it.
- ✅ **Chart + typing updates:** Shared `ChartConfig` accepts optional color; Highcharts formatters/callbacks use `AxisLabelsFormatterContextObject`; copy-to-clipboard builds CSV rows safely.
- ✅ **Assistant shim & type cleanup:** Added module shims for `@assistant-ui/*`, updated `AssistantChat` streaming logic, tightened Supabase result types, standardized OpenAI message builders, and fixed all TypeScript errors (`npx tsc --noEmit` now passes).
- ⚠️ **Pending manual QA:** `npm run dev` currently fails with `EPERM` because port 3000 is blocked. Once a port is available, run the chat flow to verify real-time updates, filters, and layout shifts.
- 🚧 **Remaining roadmap:** Inspector drawer, detail expansion, richer aggregates, animations, and other Phase 3+ polish items are still outstanding.

