# Octavius: Real-time Kanban, Agent Flow, Product Readiness

**Date:** 2026-03-25
**Status:** Approved

## 1. Real-time Kanban + Active Jobs

- `useTasks()` hook: 10-second polling via `setInterval` + refetch
- `GET /api/agents/active`: query `task_activity_log` for in-flight agents
- KanbanBoard cards: animated indicator for active agent work
- TaskBoardSection: merge active-agent data into task props

## 2. Cron Runner + Agent Delegation

- Integrate `node-cron` into server startup, load enabled `scheduled_agent_jobs`
- Stale task pickup cron: re-dispatch tasks stuck in-progress >24h
- Surface specialist results in task activity UI
- New plugin tool: `octavius_active_jobs`

## 3. LCM / Memory / Obsidian Integration

- Verify LCM bridge reads (graceful degradation)
- Verify Obsidian sync endpoints (config, sync, graph)
- Verify Memory context flows into agent prompts
- Fix broken wiring

## 4. Product Readiness + runaq Landing

- Post-login onboarding wizard (name, quadrants, first task)
- `/landing` page: public, runaq brand, Octavius features, CTA
- Empty state guidance per view

## 5. UAT

- Playwright E2E: login → onboard → task → agent → kanban verify
- API integration tests for critical flows
- All views load without error
