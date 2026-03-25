# Octavius Fix Priority List -- 2026-03-25

Consolidated from: E2E test results (71 tests), deep feature audit (10 integration points), and integration gaps analysis.

---

## P0 -- Critical (Blocks core functionality)

### 1. Agent Dispatch Returns 500 Internal Server Error
- **Source**: E2E Test #33-35
- **As-Is**: POST `/api/agents/dispatch` crashes with 500. Assigning tasks to agents from Nerve Center is completely broken. Agent status never changes, live activity feed never updates.
- **To-Be**: Dispatch endpoint successfully routes tasks to agents via OpenClaw CLI. Agent status transitions to "running" in fleet store, live activity feed shows task progress, and results are surfaced back to the UI.
- **Files**: `src/app/api/agents/dispatch/route.ts`, `src/lib/agent-spawner.ts`
- **Investigation**: Check server logs for the 500 error. Likely related to OpenClaw CLI invocation, ANSI stripping, or JSON parsing of response.

---

## P1 -- High (Feature broken but workaround exists)

### 2. Fellowship Connection Not Refreshed After Creation
- **Source**: E2E Test #23
- **As-Is**: User adds a connection via modal, API returns 201 Created, but the connection list does not update. User must manually refresh the page to see the new connection.
- **To-Be**: After successful POST to `/api/dashboard/connections`, the UI immediately shows the new connection in the list and Log Activity dropdown.
- **Files**: `src/components/views/FellowshipView.tsx`, `src/hooks/use-connections.ts`
- **Root Cause**: Missing `mutate()` call after successful creation.

### 3. Multi-Quadrant Fan-Out Not Wired
- **Source**: Integration Gap #1
- **As-Is**: `fanOutToQuadrantAgents()` exists in codebase but is never called from the main dispatch flow. Tasks only route to a single quadrant agent.
- **To-Be**: When a task spans multiple quadrants, orchestrator fans out to all relevant generalist agents in parallel, collects results, and surfaces combined output.
- **Files**: `src/app/api/agents/dispatch/route.ts`, `src/lib/agent-spawner.ts`

### 4. FleetStore Activity Not Persisted to DB
- **Source**: Integration Gap #2
- **As-Is**: Fleet activity (agent status, task progress, live feed) is stored in sessionStorage only. All activity is lost on page reload.
- **To-Be**: Fleet activity is persisted to SQLite (`gateway_events` or new table). On page load, recent activity is restored from DB. SessionStorage serves as hot cache only.
- **Files**: `src/lib/town/fleet-store.ts`, new API route for fleet persistence

---

## P2 -- Medium (UX/functionality gaps)

### 5. Edit Task Modal Missing Status Field
- **Source**: E2E Test #16-17, Issue #6
- **As-Is**: Task status (Backlog/In Progress/Done) can only be changed via drag-and-drop. Edit modal has no status selector. Keyboard-only users cannot move tasks.
- **To-Be**: Edit Task modal includes a status dropdown (Backlog / In Progress / Done). Changing status via modal updates the kanban board immediately.
- **Files**: `src/components/views/IndustryView.tsx` or relevant kanban component

### 6. Budget Gate Incomplete
- **Source**: Integration Gap #3, Feature Audit (only STUBBED feature)
- **As-Is**: `getDailySpend()` always returns 0. Budget limits are never enforced. Agents can dispatch unlimited tasks regardless of cost.
- **To-Be**: `getDailySpend()` queries `llm_cost_log` table for actual daily spend. When daily budget is exceeded, dispatch is blocked with a clear error message. Budget status visible in LLM Costs view.
- **Files**: `src/lib/budget.ts` (or similar), `src/app/api/agents/dispatch/route.ts`

### 7. Gateway Fallback Doesn't Update Nerve Center UI
- **Source**: Integration Gap #5
- **As-Is**: When gateway falls back to browser adapter, the Nerve Center UI doesn't reflect agent activity from the fallback path.
- **To-Be**: Both CLI and browser fallback paths publish events to fleet store, keeping Nerve Center visualization consistent regardless of dispatch method.
- **Files**: `src/lib/gateway/client.ts`, `src/lib/town/fleet-store.ts`

### 8. Agent Config Doesn't Affect CLI Dispatch
- **Source**: Integration Gap #6
- **As-Is**: Agent configuration (model, parameters) set in the Agents view has no effect on actual CLI dispatch. OpenClaw CLI always uses its own defaults.
- **To-Be**: Agent config is passed as parameters to the OpenClaw CLI invocation. Model selection, temperature, and other settings from the config UI are respected.
- **Files**: `src/app/api/agents/dispatch/route.ts`, `src/app/api/agents/config/route.ts`

---

## P3 -- Low (Polish, environment, minor UX)

### 9. Chat Credentials Not Configured
- **Source**: E2E Test #63
- **As-Is**: Chat pipeline works but orchestrator responds with "Could not load credentials from any providers".
- **To-Be**: LLM API credentials configured in OpenClaw gateway. Chat produces meaningful AI responses.
- **Note**: Environment configuration issue, not a code bug.

### 10. Recharts Container Sizing Warnings
- **Source**: E2E Test console warnings
- **As-Is**: Multiple views log "width(-1) and height(-1) of chart should be greater than 0" on initial render.
- **To-Be**: Chart containers have `minWidth`/`minHeight` or use `aspect` ratio to prevent negative dimension warnings.
- **Files**: Any component using `ResponsiveContainer` from recharts

### 11. Sub-Agent Results Not Surfaced in Task UI
- **Source**: Integration Gap #10
- **As-Is**: When specialist cascade produces results, they're not visible in the task card or detail view.
- **To-Be**: Task detail shows sub-agent results (specialist output) as nested activity within the parent task.
- **Files**: Task UI components, fleet store

### 12. Kanban Updates Not Real-Time Synced to Fleet Activity
- **Source**: Integration Gap #9
- **As-Is**: Manual kanban changes (drag task to Done) don't appear in Nerve Center live activity feed.
- **To-Be**: Task state changes publish events to fleet store, visible in Nerve Center.
- **Files**: Kanban component, `src/lib/town/fleet-store.ts`

---

## P4 -- Backlog (Nice to have)

### 13. Autonomous Mode Has No UI Toggle
- **Source**: Integration Gap #4
- **As-Is**: No way for user to enable/disable autonomous agent mode from the UI.
- **To-Be**: Settings view has an autonomous mode toggle with clear description of behavior.

### 14. Health Data Not Connected to Lifeforce Agent Tasks
- **Source**: Integration Gap #7
- **As-Is**: Biometric data uploaded in Lifeforce view is not used by the Lifeforce agent for health insights.
- **To-Be**: Lifeforce agent can query health data to provide personalized recommendations.

### 15. Obsidian Bidirectional Sync Not Implemented
- **Source**: Integration Gap #8
- **As-Is**: `/api/obsidian/*` endpoints are stubs. No actual sync with Obsidian vault.
- **To-Be**: Memory items sync bidirectionally with Obsidian markdown files.

### 16. Missing Dialog Descriptions (Accessibility)
- **Source**: E2E console warnings
- **As-Is**: New Task, Edit Task, Add Connection modals missing `aria-describedby`.
- **To-Be**: All Radix UI dialogs have `DialogDescription` component for screen reader support.

---

## What Works Well (60/71 tests passed)

- Authentication flow (login, redirect, session management)
- All 11 views render correctly with no crashes
- Task creation and kanban board display
- Check-in creation (mood/energy/stress)
- Journal and gratitude entry creation
- Nerve Center room grid (10 rooms, agent chips, room routing, live activity panels)
- Agent topology visualization
- LLM cost tracking ($8.67 total, 91 requests, 5 models)
- Memory knowledge graph (4 items, search interface, stats)
- Theme toggling (3-state: System/Light/Dark)
- Nerve Center forced dark theme
- Gateway status monitoring (6 service cards)
- Chat panel toggle and message sending
- Rapid navigation across all 11 views without crashes
- Design token consistency across light/dark modes
