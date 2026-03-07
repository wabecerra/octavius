# Refactor: Remove Zustand, Replace with SQLite API Hooks

## Goal
Remove ALL Zustand/localStorage state management. Make SQLite (via /api/dashboard/* and /api/memory/*) the single source of truth. The QMD-inspired memory system becomes the backbone of the app.

## Architecture After Refactor

```
Browser (React) → fetch() → Next.js API → SQLite (better-sqlite3)
                                          ├── dashboard_tasks
                                          ├── dashboard_checkins  
                                          ├── dashboard_journal
                                          ├── dashboard_goals
                                          ├── dashboard_connections
                                          ├── dashboard_gratitude
                                          ├── memory_items (QMD hybrid search)
                                          └── config, jobs, etc.
```

No more localStorage. No more Zustand. React state (useState/useReducer) for ephemeral UI state only (form inputs, modals, active tab).

## New Files to Create

### `src/hooks/use-api.ts` — Generic fetch hook with SWR-like caching
```typescript
// Simple hook: { data, loading, error, mutate }
// Caches in memory (Map), revalidates on mutate()
// No external deps needed
```

### `src/hooks/use-tasks.ts`
```typescript
export function useTasks(filter?: { status?: string; priority?: string }) {
  // GET /api/dashboard/tasks?status=...
  // Returns: { tasks, loading, error, createTask, updateTask, deleteTask }
}
```

### `src/hooks/use-checkins.ts`
```typescript
export function useCheckins(since?: string) {
  // GET /api/dashboard/checkins?since=...
  // Returns: { checkins, loading, createCheckin }
}
```

### `src/hooks/use-journal.ts`
### `src/hooks/use-goals.ts`
### `src/hooks/use-connections.ts`
### `src/hooks/use-profile.ts`
### `src/hooks/use-gratitude.ts`

## New API Endpoints Needed

These are missing from the current dashboard API:

### POST /api/dashboard/tasks/[id] — Single task operations (DELETE)
### GET/PUT /api/dashboard/profile — User profile
### GET/POST /api/dashboard/gratitude — Gratitude entries
### GET/POST /api/dashboard/focus-goals — Daily focus goals
### GET/POST /api/dashboard/schedule — Daily schedule items

## Files to Modify

### `src/app/page.tsx` — THE BIG ONE
Replace all 65 `useOctaviusStore` calls with the new hooks.

Key replacements:
- `s.career.tasks` → `useTasks()`
- `s.health.checkIns` → `useCheckins()`
- `s.soul.journalEntries` → `useJournal()`
- `s.relationships.connections` → `useConnections()`
- `s.profile` → `useProfile()`
- `s.createTask` → `createTask()` from useTasks
- `s.addCheckIn` → `createCheckin()` from useCheckins
- etc.

Gateway state (gatewayStatus, chatMessages, agents, sessions) stays as React useState — it's ephemeral runtime state, not persisted data.

### `src/components/*.tsx` — Various components
- `ChatPanel.tsx` — Keep, but use local state for messages
- `GatewayStatusPanel.tsx` — Keep, use gateway hook
- `MemoryConfigSection.tsx` — Already uses fetch, keep as-is
- Health components — Already fetch from API, keep as-is

## Files to Delete
- `src/store/index.ts` — The entire Zustand store
- `src/store/gateway.ts` — Gateway slice (replace with React state)
- `src/store/*.test.ts` — All store tests (replace with API tests)
- `src/lib/memory/sync-layer.ts` — No longer needed (API is source of truth)
- `src/lib/memory/sync-layer.test.ts` — If exists

## Files to Keep
- `src/lib/memory/*` — The QMD memory system (db, service, hybrid-search, consolidation, decay, evolution, etc.)
- `src/lib/gateway/*` — Gateway client, provisioner, etc.
- `src/app/api/*` — All API routes
- All components except store-dependent ones

## Package.json Changes
- Remove `zustand` dependency
- Keep everything else

## Constraints
- `npm run build` must pass
- Existing API tests must still pass
- Store tests will be deleted (replaced by API tests)
- No external dependencies added (no SWR, no react-query — use built-in fetch + useState)

## QMD Features to Leverage
The memory system has:
- **FTS5 full-text search** — use for searching tasks, journal, memories
- **Hybrid search (FTS5 + vector + RRF)** — for context retrieval
- **Consolidation job** — daily_notes → life_directory (runs at 2 AM)
- **Decay job** — reduces importance of unused memories (runs at 3 AM)
- **Evolution job** — extracts patterns, updates agent files (runs at 4 AM)
- **Knowledge graph** — memory_edges for relationship traversal
- **Smart chunking** — auto-chunks long text
- **Context annotations** — enriches search results

Dashboard mutations should ALSO create memory_items (episodic/daily_notes) so the QMD pipeline processes them. This means:
- Creating a task → also creates a memory "Task created: ..."
- Completing a task → memory "Task completed: ..."  
- Check-in → memory "Wellness: mood=4 energy=3 stress=2"
- Journal entry → memory with the full text

This way the consolidation/evolution jobs can learn patterns from dashboard usage.
