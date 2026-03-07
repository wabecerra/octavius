# page.tsx Rewrite Task

## Context
You are rewriting `/home/wabo/workplace/ocbot/octavius/src/app/page.tsx` to remove ALL Zustand/store dependencies and use SQLite-backed API hooks instead.

## What to do

1. Read the current `src/app/page.tsx` (2200+ lines)
2. Read the hooks at `src/hooks/` (all the `use-*.ts` files)
3. Rewrite page.tsx to:

### Replace these imports:
```typescript
// REMOVE:
import { useOctaviusStore, latestCheckIn, overdueConnections } from '@/store'

// ADD:
import { useTasks, useCheckins, useJournal, useConnections, useGoals, useProfile, useGratitude, useFocusGoals, useSchedule } from '@/hooks'
```

### Replace ALL 65 useOctaviusStore calls:

**Profile:**
- `useOctaviusStore((s) => s.profile)` → `const { profile, updateProfile } = useProfile()`

**Health/Check-ins:**
- `useOctaviusStore((s) => s.health.checkIns)` → `const { checkins, createCheckin } = useCheckins()`
- `useOctaviusStore((s) => s.addCheckIn)` → use `createCheckin` from useCheckins
- `useOctaviusStore((s) => s.health.metrics)` → Remove or derive from latest checkin
- `useOctaviusStore((s) => s.updateMetrics)` → Remove

**Tasks:**
- `useOctaviusStore((s) => s.career.tasks)` → `const { tasks, createTask, updateTask, deleteTask } = useTasks()`
- `useOctaviusStore((s) => s.createTask)` → use `createTask` from useTasks
- `useOctaviusStore((s) => s.editTask)` → use `updateTask` from useTasks
- `useOctaviusStore((s) => s.deleteTask)` → use `deleteTask` from useTasks

**Focus Goals:**
- `useOctaviusStore((s) => s.career.focusGoals)` → `const { goals: focusGoals, addGoal: addFocusGoal } = useFocusGoals()`

**Schedule:**
- `useOctaviusStore((s) => s.career.scheduleItems)` → `const { items: scheduleItems, addItem: addScheduleItem } = useSchedule()`

**Connections:**
- `useOctaviusStore((s) => s.relationships.connections)` → `const { connections, addConnection, updateConnection } = useConnections()`
- `useOctaviusStore((s) => s.logActivity)` → just log to memory API (or skip)
- `useOctaviusStore((s) => s.setReminderFrequency)` → use updateConnection

**Journal:**
- `useOctaviusStore((s) => s.soul.journalEntries)` → `const { entries: journalEntries, addEntry: addJournalEntry } = useJournal()`

**Gratitude:**
- `useOctaviusStore((s) => s.addGratitudeEntry)` → `const { addGratitude } = useGratitude()`

**Goals:**
- Goals are used via `useGoals()` hook

**Gateway state** (keep as local React state):
- `gatewayStatus`, `connectedAt`, `lastHealthyAt`, `registeredAgents`, `activeSessions`, `recentSessions`, `chatMessages`, `scheduledJobs`, `heartbeatActions`, `dailyTokenUsage`
- These come from the `useGatewayInit` hook which already exists
- Keep the gateway hook, but store its state in useState instead of Zustand

**Agent state** (keep as local React state):
- `agents`, `agentTasks`, `updateAgentStatus`, `createAgentTask`, `updateAgentTaskStatus`
- Use useState for these

**Router config, local model status, escalation log** → useState

### Key patterns:

For `latestCheckIn(checkIns)` helper:
```typescript
const latest = checkins.length > 0 ? checkins[0] : null // Already sorted by timestamp DESC from API
```

For `overdueConnections(connections)`:
```typescript
const overdue = connections.filter(c => {
  const lastContact = new Date(c.lastContactDate)
  const daysSince = (Date.now() - lastContact.getTime()) / 86400000
  return daysSince > c.reminderFrequencyDays
})
```

For task operations (the kanban board maps `completed` to status):
- Create task → `createTask({ title, description, priority, status: 'backlog' })`
- Move to column → `updateTask(id, { status: 'in-progress' })` 
- Complete → `updateTask(id, { status: 'done', completed: true })`
- Delete → `deleteTask(id)`

### WellnessCheckInForm changes:
The current form calls `addCheckIn({ id: nanoid(), timestamp, mood, energy, stress })`.
Replace with: `createCheckin({ mood, energy, stress })` (API generates id and timestamp).

### Important: Memory dual-write
When creating tasks, checkins, journal entries etc, the API already handles SQLite writes.
The QMD memory system integration (writing episodic memories for each dashboard action) should be done IN THE API ROUTES, not in the frontend. So after this refactor, update the API routes to also create memory_items.

## Files to modify:
- `src/app/page.tsx` — Full rewrite (remove all store deps)
- `src/lib/gateway/use-gateway.ts` — Remove Zustand dependency, use callback props instead

## Files to delete AFTER page.tsx works:
- `src/store/index.ts`
- `src/store/gateway.ts`
- `src/store/*.test.ts` (all store tests)
- `src/lib/memory/sync-layer.ts`
- `src/lib/memory/sync-layer.test.ts`

## Constraints:
- `npm run build` MUST pass
- Keep ALL existing components (QuadrantCard, BiometricDataSection, health charts, etc.)
- Keep the gateway hooks (useGatewayInit, useGatewayReconnect)
- TypeScript must be clean
