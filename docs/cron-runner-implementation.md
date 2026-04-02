# Cron Runner Implementation

**Date:** 2026-03-25
**Agent:** code-monkey
**Status:** Complete

## Overview

Implemented `node-cron` integration for Octavius scheduled jobs system. The cron runner loads enabled jobs from the `scheduled_agent_jobs` table, schedules them with node-cron, and manages job execution + logging. Additionally, it includes a stale task picker that runs every hour to re-dispatch tasks stuck in-progress for over 24 hours.

## Files Created

### 1. `/local/workplace/wabo/ocbot/octavius/src/lib/cron-runner.ts`

**Purpose:** Core cron runner module with three main functions:
- `startCronRunner()` - Initialize the cron system
- `scheduleJob()` - Schedule individual jobs
- `reloadCronJobs()` - Reload jobs after CRUD operations
- `pickUpStaleTasks()` - Hourly job to re-dispatch stale tasks

**Key Features:**
- Loads enabled jobs from `scheduled_agent_jobs` table on startup
- Validates cron expressions before scheduling
- Dispatches jobs via internal fetch to `/api/agents/dispatch`
- Logs all job runs to `job_runs` table (success/failure, timing, errors)
- Maintains active cron task map for hot reloading
- Stale task picker runs every hour (`0 * * * *`) to find tasks stuck in-progress for 24+ hours

**Database Integration:**
- Reads from: `scheduled_agent_jobs` (enabled jobs), `dashboard_tasks` (stale task detection)
- Writes to: `job_runs` (execution logs)

**Error Handling:**
- Invalid cron expressions are logged as warnings and skipped
- Job execution errors are caught, logged to DB, and don't crash the runner
- Stale task pickup failures are logged but don't interrupt the schedule

## Files Modified

### 1. `/local/workplace/wabo/ocbot/octavius/server.ts`

**Changes:**
- Added import: `import { startCronRunner } from './src/lib/cron-runner'`
- Added call to `startCronRunner()` in the `server.listen()` callback
- Added log statement: `log('INFO', 'Cron runner started')`

**Result:** Cron runner now starts automatically when the Octavius server starts.

### 2. `/local/workplace/wabo/ocbot/octavius/extensions/openclaw-octavius/index.ts`

**Changes:**
- Added new tool: `octavius_active_jobs` in the system category
- Tool fetches from `GET /api/agents/active` (no parameters required)
- Returns active agent jobs and pending specialist spawns

**Tool Details:**
```typescript
{
  name: "octavius_active_jobs",
  category: "system",
  description: "Query active agent jobs and pending specialist spawns. Shows what agents are currently working on and what specialists are queued for spawning.",
  keywords: ["active", "jobs", "running", "queue", "specialist", "spawn", "agents", "tasks", "current"],
  parameters: { type: "object", properties: {} },
  execute: async (api) => json(await octFetch(api, "/api/agents/active")),
}
```

## Architecture

### Execution Flow

1. **Server Start:**
   - Next.js server initializes
   - `startCronRunner()` is called
   - Enabled jobs are loaded from SQLite
   - Each job is scheduled with node-cron
   - Stale task picker is scheduled (hourly)

2. **Job Execution (Cron Trigger):**
   - Cron expression matches → job callback fires
   - Internal HTTP POST to `/api/agents/dispatch`
   - Dispatch creates agent task and routes to appropriate agent
   - Success/failure logged to `job_runs` table
   - Console logs provide visibility

3. **Stale Task Recovery (Hourly):**
   - Query `dashboard_tasks` for tasks in-progress > 24 hours
   - Limit 10 per batch to avoid overwhelming agents
   - Re-dispatch each task with special instruction
   - Log re-dispatch attempts

4. **Hot Reload (Future API Integration):**
   - When scheduled job CRUD API is built, call `reloadCronJobs()`
   - All active cron tasks are stopped
   - Jobs are reloaded from database
   - Fresh schedules are created

## Database Schema

### `scheduled_agent_jobs` Table
```sql
CREATE TABLE scheduled_agent_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  task_template TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### `job_runs` Table
```sql
CREATE TABLE job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  success INTEGER NOT NULL,
  details TEXT,
  error TEXT
);
```

### `dashboard_tasks` Table (Used by Stale Picker)
```sql
-- Relevant columns:
id TEXT PRIMARY KEY,
title TEXT NOT NULL,
status TEXT NOT NULL,  -- 'backlog', 'in-progress', 'done'
updated_at TEXT NOT NULL
```

## Configuration

### Environment Variables
- `PORT` - Server port (default: 3000) - used for internal dispatch URLs

### Cron Expressions
Jobs use standard cron syntax validated by `node-cron.validate()`:
```
┌────────────── second (optional, 0-59)
│ ┌──────────── minute (0-59)
│ │ ┌────────── hour (0-23)
│ │ │ ┌──────── day of month (1-31)
│ │ │ │ ┌────── month (1-12)
│ │ │ │ │ ┌──── day of week (0-7, 0 and 7 are Sunday)
* * * * * *
```

### Hardcoded Schedules
- **Stale Task Picker:** `0 * * * *` (every hour at minute 0)

## Testing Considerations

### Unit Testing Strategy
- Mock `getDatabase()` to return test SQLite instance
- Mock `fetch()` for dispatch calls
- Test cron expression validation
- Test job scheduling/cancellation
- Test stale task query logic
- Test error handling paths

### Integration Testing
- Verify cron jobs actually execute at scheduled times
- Verify dispatch API receives correct payloads
- Verify job_runs logging works correctly
- Verify stale task re-dispatch works end-to-end

### Manual Testing Checklist
1. Start server → verify cron runner logs startup
2. Add enabled job to DB → restart server → verify job is scheduled
3. Add job with invalid cron expression → verify warning logged
4. Wait for job execution → verify dispatch API called + job_runs entry created
5. Create task, set to in-progress, backdate updated_at by 25 hours → wait for hourly run → verify re-dispatch
6. Call `reloadCronJobs()` manually → verify jobs are reloaded

## Future Enhancements

### API Routes for Scheduled Job CRUD
Currently, `GatewayJobScheduler` exists but isn't exposed via API. Recommended routes:

```
POST   /api/gateway/scheduled-jobs        - Create job + call reloadCronJobs()
GET    /api/gateway/scheduled-jobs        - List jobs
GET    /api/gateway/scheduled-jobs/:id    - Get job
PATCH  /api/gateway/scheduled-jobs/:id    - Update job + call reloadCronJobs()
DELETE /api/gateway/scheduled-jobs/:id    - Delete job + call reloadCronJobs()
POST   /api/gateway/scheduled-jobs/:id/trigger - Manual trigger
```

### Enhanced Monitoring
- Add `/api/cron/status` endpoint to show:
  - Active cron jobs (count, names, next run times)
  - Last 10 job executions (success/failure stats)
  - Stale task picker last run time
- Dashboard view for cron job management (UI for CRUD operations)

### Configurable Stale Task Threshold
- Move 24-hour threshold to config table or environment variable
- Allow per-task override of stale threshold

### Retry Logic
- Add exponential backoff for failed dispatches
- Configurable max retry attempts
- Dead letter queue for permanently failed jobs

### Job Execution Timeouts
- Add configurable timeout per job
- Cancel long-running dispatches
- Log timeout events

## Known Limitations

1. **No API for CRUD:** Scheduled jobs must be managed directly in SQLite until API routes are built
2. **No Job Prioritization:** All jobs execute when cron expression matches (FIFO)
3. **No Distributed Lock:** If multiple Octavius instances run, jobs will execute multiple times
4. **Single-threaded Execution:** Jobs block if dispatch takes a long time (node-cron limitation)
5. **No Task Creation in Cron Job:** Jobs dispatch with `taskId: null`, so dispatch endpoint must create task

## Build Instructions

The implementation is complete and ready to test:

```bash
# Navigate to Octavius directory
cd /local/workplace/wabo/ocbot/octavius

# Install dependencies (node-cron should already be installed)
npm install

# Start the server (cron runner starts automatically)
npm run dev
# or
npm run build && npm start
```

## Verification Steps

1. **Verify cron runner starts:**
   ```bash
   # Start server and check logs
   npm run dev
   # Look for: "[INFO] Cron runner started"
   # Look for: "[cron] Started with N scheduled jobs + stale task picker"
   ```

2. **Verify scheduled jobs loaded:**
   ```bash
   # Check database
   sqlite3 .data/memory.sqlite "SELECT id, name, cron_expression, enabled FROM scheduled_agent_jobs WHERE enabled = 1;"
   ```

3. **Test active jobs tool:**
   ```bash
   # From OpenClaw CLI
   > octavius_active_jobs
   ```

4. **Monitor job execution:**
   ```bash
   # Watch server logs for:
   # "[cron] Triggering job: <job_name>"
   # "[cron] Job completed successfully: <job_name>"
   # Check job_runs table:
   sqlite3 .data/memory.sqlite "SELECT * FROM job_runs ORDER BY id DESC LIMIT 10;"
   ```

5. **Test stale task picker:**
   ```bash
   # Create a stale task
   sqlite3 .data/memory.sqlite "INSERT INTO dashboard_tasks (id, title, status, updated_at) VALUES ('test-stale', 'Test Stale Task', 'in-progress', datetime('now', '-25 hours'));"
   # Wait for next hour mark (or modify cron to run more frequently for testing)
   # Check logs for: "[cron] Found N stale tasks, re-dispatching..."
   ```

## Dependencies

- **node-cron** ^3.x - Already installed in package.json
- **better-sqlite3** - Already used for database access
- **Internal:** `/api/agents/dispatch`, `/api/agents/active`, `getDatabase()`

## Rollback Plan

If issues arise:
1. Comment out `startCronRunner()` call in `server.ts`
2. Restart server
3. Scheduled jobs will not execute, but system remains functional

## Success Criteria

- [x] Cron runner module created with `startCronRunner()`, `scheduleJob()`, `reloadCronJobs()`
- [x] Server.ts imports and calls `startCronRunner()` on startup
- [x] Jobs are loaded from `scheduled_agent_jobs` table
- [x] Cron expressions are validated before scheduling
- [x] Job execution logs to `job_runs` table
- [x] Stale task picker runs hourly
- [x] `octavius_active_jobs` tool added to OpenClaw plugin
- [x] Console logging provides visibility into cron activity
- [x] Error handling prevents crashes
- [x] Documentation complete

## Next Steps (For Next Agent)

1. **old-fart agent:** Build and test the implementation
   - Run `npm run build` or `npm run dev`
   - Verify no TypeScript errors
   - Check for any missing dependencies
   - Monitor server logs for cron runner startup

2. **code-reviewer agent:** Review the implementation
   - Check error handling robustness
   - Verify database query safety (SQL injection prevention)
   - Review logging practices
   - Ensure TypeScript types are correct

3. **conan agent (or tpm):** Create API routes for scheduled job CRUD
   - Implement REST endpoints listed in "Future Enhancements"
   - Integrate `reloadCronJobs()` after mutations
   - Add input validation for cron expressions

4. **tech-writer agent:** Update user documentation
   - Document how to create scheduled jobs
   - Explain cron expression syntax
   - Show example use cases
   - Add troubleshooting guide
