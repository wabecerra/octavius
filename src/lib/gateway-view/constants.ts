// ---------------------------------------------------------------------------
// Gateway View – Mapping Tables & Defaults
// ---------------------------------------------------------------------------

import type { TelemetryEventType, WorkState } from './types'

// ---- Event → WorkState mapping (Req 2.3, 3.4) ----------------------------

export const EVENT_TO_WORK_STATE: Record<TelemetryEventType, WorkState> = {
  'agent-dispatch': 'executing',
  'agent-complete': 'idle',
  'agent-fail': 'error',
  'memory-write': 'cataloging',
  'memory-search': 'processing',
  'memory-consolidation': 'writing',
  'health-import': 'monitoring',
  'health-checkin': 'monitoring',
  'lcm-status-change': 'processing',
  'cost-alert': 'monitoring',
  'cost-update': 'monitoring',
  'obsidian-sync': 'writing',
  'obsidian-push': 'writing',
  'obsidian-pull': 'cataloging',
  'task-create': 'writing',
  'task-complete': 'idle',
  'task-update': 'processing',
  'gateway-online': 'idle',
  'gateway-offline': 'error',
}

// ---- Event → target roomId mapping (Req 2.3) -----------------------------
// Rooms: vault (memory), forge (skills/obsidian), bridge (lcm/gateway),
//        watchtower (health/monitoring), ledger (costs), hub (central),
//        dispatch (agents/tasks), workshop (tasks/creation), quarters (idle/rest)

export const EVENT_TO_ROOM: Record<TelemetryEventType, string> = {
  'agent-dispatch': 'room-dispatch',
  'agent-complete': 'room-dispatch',
  'agent-fail': 'room-dispatch',
  'memory-write': 'room-vault',
  'memory-search': 'room-vault',
  'memory-consolidation': 'room-vault',
  'health-import': 'room-watchtower',
  'health-checkin': 'room-watchtower',
  'lcm-status-change': 'room-bridge',
  'cost-alert': 'room-ledger',
  'cost-update': 'room-ledger',
  'obsidian-sync': 'room-forge',
  'obsidian-push': 'room-forge',
  'obsidian-pull': 'room-vault',
  'task-create': 'room-workshop',
  'task-complete': 'room-workshop',
  'task-update': 'room-workshop',
  'gateway-online': 'room-hub',
  'gateway-offline': 'room-hub',
}

// ---- WorkState → emote key mapping (Req 3.4) -----------------------------

export const WORK_STATE_EMOTES: Record<WorkState, string | null> = {
  idle: null,
  processing: 'emote:thinking',
  monitoring: 'emote:device',
  writing: 'emote:idea',
  cataloging: 'emote:star',
  executing: 'emote:exclaim',
  error: 'emote:angry',
  resting: 'emote:sleep',
}

// ---- Timing & limits (Req 2.6, 6.4, 7.4) ---------------------------------

/** Idle timeout before Actor transitions to idle state (ms) */
export const IDLE_TIMEOUT_MS = 30_000

/** Maximum number of events retained in the Activity HUD */
export const HUD_MAX_EVENTS = 100

/** Sliding window for telemetry event deduplication (ms) */
export const DEDUP_WINDOW_MS = 5_000
