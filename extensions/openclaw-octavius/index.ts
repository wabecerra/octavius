/**
 * Octavius OpenClaw Plugin — Full Tool Suite
 *
 * 42 agent tools organized into 6 categories:
 * 1. Dashboard State (tasks, checkins, journal, goals, connections, etc.)
 * 2. Memory System (QMD search, context, graph, consolidation, evolution)
 * 3. Agent Fleet (provision, delegate, workspace management)
 * 4. Health Integration (import, query, ingest)
 * 5. System (gateway, jobs, heartbeat)
 * 6. Meta Discovery (octavius_discover — the keystone tool)
 *
 * Install:
 *   openclaw plugins install ./extensions/openclaw-octavius
 */

interface OctaviusConfig {
  url?: string;
  apiSecret?: string;
}

function getConfig(api: any): { url: string; headers: Record<string, string> } {
  const cfg = (api.runtime?.config?.loadConfig?.() ?? {}) as Record<string, any>;
  const octCfg = (cfg?.plugins?.entries?.octavius?.config ?? {}) as OctaviusConfig;
  const url = octCfg.url || "http://localhost:3000";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (octCfg.apiSecret) {
    headers["Authorization"] = `Bearer ${octCfg.apiSecret}`;
  }
  return { url, headers };
}

async function octFetch(api: any, path: string, options?: RequestInit): Promise<any> {
  const { url, headers } = getConfig(api);
  const resp = await fetch(`${url}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers ?? {}) },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Octavius ${resp.status}: ${text}`);
  }
  return resp.json();
}

function txt(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function json(data: any) {
  return txt(JSON.stringify(data, null, 2));
}

// ═══════════════════════════════════════════════════════════════
// Tool Registry — every tool is defined here for the meta search
// ═══════════════════════════════════════════════════════════════

interface ToolDef {
  name: string;
  category: string;
  description: string;
  keywords: string[];
  parameters: any;
  execute: (api: any, id: string, params: any) => Promise<any>;
}

const TOOL_REGISTRY: ToolDef[] = [

  // ─────────────────────────────────────────────────────────────
  // 1. DASHBOARD STATE — Tasks
  // ─────────────────────────────────────────────────────────────

  {
    name: "octavius_tasks_list",
    category: "dashboard",
    description: "List tasks from the Octavius kanban board. Filter by status (backlog/in-progress/done) or priority (high/medium/low).",
    keywords: ["task", "kanban", "todo", "backlog", "in-progress", "done", "productivity", "work", "project"],
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["backlog", "in-progress", "done"] },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        limit: { type: "number", default: 20 },
      },
    },
    execute: async (api, _id, params) => {
      const qs = new URLSearchParams();
      if (params.status) qs.set("status", params.status);
      if (params.priority) qs.set("priority", params.priority);
      if (params.limit) qs.set("limit", String(params.limit));
      return json(await octFetch(api, `/api/dashboard/tasks?${qs}`));
    },
  },
  {
    name: "octavius_task_create",
    category: "dashboard",
    description: "Create a new task on the Octavius kanban board.",
    keywords: ["task", "create", "add", "new", "kanban", "todo", "productivity"],
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        description: { type: "string" },
        priority: { type: "string", enum: ["high", "medium", "low"], default: "medium" },
        status: { type: "string", enum: ["backlog", "in-progress", "done"], default: "backlog" },
        dueDate: { type: "string", description: "ISO date" },
      },
      required: ["title"],
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, "/api/dashboard/tasks", { method: "POST", body: JSON.stringify(params) });
      return txt(`Task created: ${data.id} — "${data.title}" [${data.status}]`);
    },
  },
  {
    name: "octavius_task_update",
    category: "dashboard",
    description: "Update a task — change status (move across kanban), priority, title, or mark complete.",
    keywords: ["task", "update", "move", "kanban", "complete", "done", "status", "priority"],
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task ID" },
        status: { type: "string", enum: ["backlog", "in-progress", "done"] },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        completed: { type: "boolean" },
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["id"],
    },
    execute: async (api, _id, params) => {
      const { id, ...updates } = params;
      const data = await octFetch(api, `/api/dashboard/tasks/${id}`, { method: "PATCH", body: JSON.stringify(updates) });
      return txt(`Task updated: "${data.title}" → ${data.status}${data.completed ? " ✓" : ""}`);
    },
  },
  {
    name: "octavius_task_delete",
    category: "dashboard",
    description: "Delete a task from the kanban board.",
    keywords: ["task", "delete", "remove", "kanban"],
    parameters: {
      type: "object",
      properties: { id: { type: "string", description: "Task ID" } },
      required: ["id"],
    },
    execute: async (api, _id, params) => {
      await octFetch(api, `/api/dashboard/tasks/${params.id}`, { method: "DELETE" });
      return txt(`Task deleted: ${params.id}`);
    },
  },

  // ─────────────────────────────────────────────────────────────
  // 1. DASHBOARD STATE — Check-ins
  // ─────────────────────────────────────────────────────────────

  {
    name: "octavius_checkin",
    category: "dashboard",
    description: "Log a wellness check-in (mood, energy, stress on 1-5 scale).",
    keywords: ["wellness", "checkin", "mood", "energy", "stress", "health", "lifeforce", "how are you"],
    parameters: {
      type: "object",
      properties: {
        mood: { type: "number", minimum: 1, maximum: 5 },
        energy: { type: "number", minimum: 1, maximum: 5 },
        stress: { type: "number", minimum: 1, maximum: 5 },
      },
      required: ["mood", "energy", "stress"],
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, "/api/dashboard/checkins", { method: "POST", body: JSON.stringify(params) });
      return txt(`Check-in logged: mood=${data.mood} energy=${data.energy} stress=${data.stress}`);
    },
  },
  {
    name: "octavius_checkins_list",
    category: "dashboard",
    description: "List past wellness check-ins for trend analysis.",
    keywords: ["wellness", "checkin", "history", "trend", "mood", "energy", "stress", "health"],
    parameters: {
      type: "object",
      properties: {
        since: { type: "string", description: "ISO date to filter from" },
        limit: { type: "number", default: 50 },
      },
    },
    execute: async (api, _id, params) => {
      const qs = new URLSearchParams({ limit: String(params.limit || 50) });
      if (params.since) qs.set("since", params.since);
      return json(await octFetch(api, `/api/dashboard/checkins?${qs}`));
    },
  },

  // ─────────────────────────────────────────────────────────────
  // 1. DASHBOARD STATE — Journal
  // ─────────────────────────────────────────────────────────────

  {
    name: "octavius_journal",
    category: "dashboard",
    description: "Write a journal entry.",
    keywords: ["journal", "diary", "write", "reflect", "reflection", "essence", "soul", "thought"],
    parameters: {
      type: "object",
      properties: { text: { type: "string", description: "Journal entry text" } },
      required: ["text"],
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, "/api/dashboard/journal", { method: "POST", body: JSON.stringify(params) });
      return txt(`Journal entry saved: ${data.id}`);
    },
  },
  {
    name: "octavius_journal_list",
    category: "dashboard",
    description: "List past journal entries.",
    keywords: ["journal", "diary", "entries", "history", "past", "reflection"],
    parameters: {
      type: "object",
      properties: { limit: { type: "number", default: 20 } },
    },
    execute: async (api, _id, params) => {
      return json(await octFetch(api, `/api/dashboard/journal?limit=${params.limit || 20}`));
    },
  },

  // ─────────────────────────────────────────────────────────────
  // 1. DASHBOARD STATE — Goals
  // ─────────────────────────────────────────────────────────────

  {
    name: "octavius_goal_create",
    category: "dashboard",
    description: "Create a goal in any life quadrant (health, career, relationships, soul).",
    keywords: ["goal", "objective", "target", "ambition", "quadrant", "plan"],
    parameters: {
      type: "object",
      properties: {
        quadrant: { type: "string", enum: ["health", "career", "relationships", "soul"] },
        title: { type: "string" },
        description: { type: "string" },
        targetDate: { type: "string", description: "ISO date" },
      },
      required: ["quadrant", "title"],
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, "/api/dashboard/goals", { method: "POST", body: JSON.stringify(params) });
      return txt(`Goal created: "${data.title}" in ${data.quadrant}`);
    },
  },
  {
    name: "octavius_goals_list",
    category: "dashboard",
    description: "List goals, optionally filtered by quadrant.",
    keywords: ["goal", "goals", "list", "progress", "quadrant", "objectives"],
    parameters: {
      type: "object",
      properties: { quadrant: { type: "string", enum: ["health", "career", "relationships", "soul"] } },
    },
    execute: async (api, _id, params) => {
      const url = params.quadrant ? `/api/dashboard/goals?quadrant=${params.quadrant}` : "/api/dashboard/goals";
      return json(await octFetch(api, url));
    },
  },
  {
    name: "octavius_goal_update",
    category: "dashboard",
    description: "Update goal progress or details.",
    keywords: ["goal", "progress", "update", "percentage", "complete"],
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        progressPct: { type: "number", minimum: 0, maximum: 100 },
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["id"],
    },
    execute: async (api, _id, params) => {
      await octFetch(api, "/api/dashboard/goals", { method: "PATCH", body: JSON.stringify(params) });
      return txt(`Goal updated: ${params.id}${params.progressPct !== undefined ? ` → ${params.progressPct}%` : ""}`);
    },
  },

  // ─────────────────────────────────────────────────────────────
  // 1. DASHBOARD STATE — Connections (Fellowship)
  // ─────────────────────────────────────────────────────────────

  {
    name: "octavius_connections_list",
    category: "dashboard",
    description: "List connections/relationships tracked in Fellowship.",
    keywords: ["connection", "relationship", "friend", "family", "colleague", "fellowship", "people", "contact"],
    parameters: { type: "object", properties: {} },
    execute: async (api) => json(await octFetch(api, "/api/dashboard/connections")),
  },
  {
    name: "octavius_connection_create",
    category: "dashboard",
    description: "Add a new connection/relationship to track.",
    keywords: ["connection", "relationship", "add", "new", "friend", "colleague", "fellowship"],
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        relationshipType: { type: "string", description: "e.g. friend, family, colleague, mentor" },
        reminderFrequencyDays: { type: "number", default: 14 },
      },
      required: ["name", "relationshipType"],
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, "/api/dashboard/connections", { method: "POST", body: JSON.stringify(params) });
      return txt(`Connection added: ${data.name} (${data.relationshipType})`);
    },
  },
  {
    name: "octavius_connection_update",
    category: "dashboard",
    description: "Update a connection — log contact, change reminder frequency.",
    keywords: ["connection", "update", "contact", "reminder", "fellowship", "touch base"],
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        lastContactDate: { type: "string", description: "ISO date" },
        reminderFrequencyDays: { type: "number" },
        name: { type: "string" },
      },
      required: ["id"],
    },
    execute: async (api, _id, params) => {
      await octFetch(api, "/api/dashboard/connections", { method: "PATCH", body: JSON.stringify(params) });
      return txt(`Connection updated: ${params.id}`);
    },
  },

  // ─────────────────────────────────────────────────────────────
  // 1. DASHBOARD STATE — Gratitude, Focus Goals, Schedule, Profile
  // ─────────────────────────────────────────────────────────────

  {
    name: "octavius_gratitude_create",
    category: "dashboard",
    description: "Log gratitude items (1-3 things you're grateful for).",
    keywords: ["gratitude", "grateful", "thankful", "appreciation", "soul", "essence", "positive"],
    parameters: {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
        date: { type: "string", description: "ISO date (defaults to today)" },
      },
      required: ["items"],
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, "/api/dashboard/gratitude", { method: "POST", body: JSON.stringify(params) });
      return txt(`Gratitude logged: ${data.items.join(", ")}`);
    },
  },
  {
    name: "octavius_gratitude_list",
    category: "dashboard",
    description: "List past gratitude entries.",
    keywords: ["gratitude", "grateful", "history", "past", "positive"],
    parameters: {
      type: "object",
      properties: { limit: { type: "number", default: 10 } },
    },
    execute: async (api, _id, params) => json(await octFetch(api, `/api/dashboard/gratitude?limit=${params.limit || 10}`)),
  },
  {
    name: "octavius_focus_goals_set",
    category: "dashboard",
    description: "Set today's focus goals (max 3 per day).",
    keywords: ["focus", "goal", "today", "priority", "daily", "intention"],
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Focus goal for today" },
        date: { type: "string", description: "ISO date (defaults to today)" },
      },
      required: ["title"],
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, "/api/dashboard/focus-goals", { method: "POST", body: JSON.stringify(params) });
      return txt(`Focus goal set: "${data.title}" for ${data.date}`);
    },
  },
  {
    name: "octavius_schedule_add",
    category: "dashboard",
    description: "Add an item to the daily schedule.",
    keywords: ["schedule", "calendar", "time", "appointment", "plan", "day", "routine"],
    parameters: {
      type: "object",
      properties: {
        time: { type: "string", description: "Time in HH:MM format" },
        title: { type: "string" },
        date: { type: "string", description: "ISO date (defaults to today)" },
      },
      required: ["time", "title"],
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, "/api/dashboard/schedule", { method: "POST", body: JSON.stringify(params) });
      return txt(`Schedule: ${data.time} — ${data.title}`);
    },
  },
  {
    name: "octavius_schedule_toggle",
    category: "dashboard",
    description: "Mark a schedule item as done/undone.",
    keywords: ["schedule", "done", "complete", "toggle", "check"],
    parameters: {
      type: "object",
      properties: { id: { type: "string" }, done: { type: "boolean" } },
      required: ["id", "done"],
    },
    execute: async (api, _id, params) => {
      await octFetch(api, "/api/dashboard/schedule", { method: "PATCH", body: JSON.stringify(params) });
      return txt(`Schedule item ${params.done ? "completed ✓" : "unchecked"}`);
    },
  },
  {
    name: "octavius_profile_get",
    category: "dashboard",
    description: "Read the user profile (name, timezone, values, vision).",
    keywords: ["profile", "user", "name", "identity", "who", "about"],
    parameters: { type: "object", properties: {} },
    execute: async (api) => json(await octFetch(api, "/api/dashboard/profile")),
  },
  {
    name: "octavius_profile_update",
    category: "dashboard",
    description: "Update user profile fields.",
    keywords: ["profile", "update", "name", "timezone", "values", "vision", "settings"],
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        timezone: { type: "string" },
        coreValues: { type: "string" },
        lifeVision: { type: "string" },
      },
    },
    execute: async (api, _id, params) => {
      await octFetch(api, "/api/dashboard/profile", { method: "PUT", body: JSON.stringify(params) });
      return txt("Profile updated");
    },
  },

  // ─────────────────────────────────────────────────────────────
  // 2. MEMORY SYSTEM (QMD)
  // ─────────────────────────────────────────────────────────────

  {
    name: "octavius_memory_search",
    category: "memory",
    description: "Search the Octavius memory system using FTS5 full-text search. Filters by tags and type.",
    keywords: ["memory", "search", "find", "recall", "remember", "knowledge", "past"],
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Search query" },
        tags: { type: "array", items: { type: "string" }, description: "Filter tags (e.g. quadrant:industry)" },
        type: { type: "string", enum: ["episodic", "semantic", "procedural", "entity_profile"] },
        limit: { type: "number", default: 10 },
      },
      required: ["text"],
    },
    execute: async (api, _id, params) => json(await octFetch(api, "/api/memory/search", { method: "POST", body: JSON.stringify(params) })),
  },
  {
    name: "octavius_memory_context",
    category: "memory",
    description: "Hybrid context retrieval — combines FTS5 + vector similarity + RRF fusion + context annotations. The most powerful search mode.",
    keywords: ["context", "hybrid", "semantic", "search", "recall", "relevant", "QMD", "understand"],
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language query" },
        tags: { type: "array", items: { type: "string" } },
        limit: { type: "number", default: 10 },
      },
      required: ["query"],
    },
    execute: async (api, _id, params) => json(await octFetch(api, "/api/memory/context", { method: "POST", body: JSON.stringify(params) })),
  },
  {
    name: "octavius_memory_store",
    category: "memory",
    description: "Store a memory, learning, insight, or observation in the memory system.",
    keywords: ["memory", "store", "save", "remember", "learn", "insight", "knowledge"],
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Memory text" },
        type: { type: "string", enum: ["episodic", "semantic", "procedural", "entity_profile"], default: "episodic" },
        layer: { type: "string", enum: ["daily_notes", "life_directory", "tacit_knowledge"], default: "daily_notes" },
        tags: { type: "array", items: { type: "string" } },
        importance: { type: "number", minimum: 0, maximum: 1, default: 0.5 },
      },
      required: ["text"],
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, "/api/memory/items", {
        method: "POST",
        body: JSON.stringify({
          text: params.text,
          type: params.type || "episodic",
          layer: params.layer || "daily_notes",
          provenance: { source_type: "agent_output", source_id: `openclaw-${Date.now()}`, agent_id: null },
          confidence: 0.8,
          importance: params.importance || 0.5,
          tags: params.tags || [],
        }),
      });
      return txt(`Memory stored: ${data.memory_id}`);
    },
  },
  {
    name: "octavius_memory_update",
    category: "memory",
    description: "Update an existing memory item (text, importance, tags).",
    keywords: ["memory", "update", "edit", "change", "modify"],
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Memory ID" },
        text: { type: "string" },
        importance: { type: "number", minimum: 0, maximum: 1 },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
    execute: async (api, _id, params) => {
      const { id, ...updates } = params;
      await octFetch(api, `/api/memory/items/${id}`, { method: "PATCH", body: JSON.stringify(updates) });
      return txt(`Memory updated: ${id}`);
    },
  },
  {
    name: "octavius_memory_delete",
    category: "memory",
    description: "Delete or archive a memory item.",
    keywords: ["memory", "delete", "remove", "archive", "forget"],
    parameters: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    execute: async (api, _id, params) => {
      await octFetch(api, `/api/memory/items/${params.id}`, { method: "DELETE" });
      return txt(`Memory deleted: ${params.id}`);
    },
  },
  {
    name: "octavius_memory_graph_traverse",
    category: "memory",
    description: "Traverse the knowledge graph from a memory node — follow relationships to discover connected memories.",
    keywords: ["graph", "traverse", "relationships", "connections", "linked", "related", "knowledge graph"],
    parameters: {
      type: "object",
      properties: {
        memoryId: { type: "string", description: "Starting memory ID" },
        depth: { type: "number", default: 2, description: "How many hops to traverse" },
        relationshipType: { type: "string", description: "Filter by relationship type" },
      },
      required: ["memoryId"],
    },
    execute: async (api, _id, params) => json(await octFetch(api, "/api/memory/graph/traverse", { method: "POST", body: JSON.stringify(params) })),
  },
  {
    name: "octavius_memory_graph_link",
    category: "memory",
    description: "Create a relationship edge between two memories in the knowledge graph.",
    keywords: ["graph", "link", "edge", "relationship", "connect", "associate"],
    parameters: {
      type: "object",
      properties: {
        sourceMemoryId: { type: "string" },
        targetMemoryId: { type: "string" },
        relationshipType: { type: "string", description: "e.g. causes, relates_to, contradicts, supports, follows" },
        weight: { type: "number", minimum: 0, maximum: 1, default: 0.5 },
      },
      required: ["sourceMemoryId", "targetMemoryId", "relationshipType"],
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, "/api/memory/graph/edges", { method: "POST", body: JSON.stringify(params) });
      return txt(`Edge created: ${params.sourceMemoryId} —[${params.relationshipType}]→ ${params.targetMemoryId}`);
    },
  },
  {
    name: "octavius_memory_graph_export",
    category: "memory",
    description: "Export the full knowledge graph (nodes + edges) for visualization or analysis.",
    keywords: ["graph", "export", "visualization", "full", "network", "knowledge"],
    parameters: { type: "object", properties: {} },
    execute: async (api) => json(await octFetch(api, "/api/memory/graph/export")),
  },
  {
    name: "octavius_memory_consolidate",
    category: "memory",
    description: "Trigger memory consolidation — groups daily notes by quadrant/tags into consolidated life_directory memories. Normally runs at 2 AM.",
    keywords: ["consolidate", "consolidation", "daily notes", "compress", "summarize", "merge"],
    parameters: {
      type: "object",
      properties: { dryRun: { type: "boolean", default: false } },
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, "/api/memory/jobs", { method: "POST", body: JSON.stringify({ job: "consolidation", dryRun: params.dryRun }) });
      return json(data);
    },
  },
  {
    name: "octavius_memory_evolve",
    category: "memory",
    description: "Trigger the evolution job — extracts behavioral patterns from memories and updates agent workspace files (AGENTS.md, USER.md). Normally runs at 4 AM.",
    keywords: ["evolution", "evolve", "patterns", "learn", "adapt", "behavioral", "workspace"],
    parameters: {
      type: "object",
      properties: { dryRun: { type: "boolean", default: false } },
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, "/api/memory/jobs", { method: "POST", body: JSON.stringify({ job: "evolution", dryRun: params.dryRun }) });
      return json(data);
    },
  },
  {
    name: "octavius_memory_config",
    category: "memory",
    description: "Get or update memory system configuration (embedding settings, schedules, thresholds).",
    keywords: ["config", "configuration", "settings", "embedding", "schedule", "threshold"],
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["get", "update"], default: "get" },
        updates: { type: "object", description: "Config fields to update (only for action=update)" },
      },
    },
    execute: async (api, _id, params) => {
      if (params.action === "update" && params.updates) {
        return json(await octFetch(api, "/api/memory/config", { method: "PUT", body: JSON.stringify(params.updates) }));
      }
      return json(await octFetch(api, "/api/memory/config"));
    },
  },

  // ─────────────────────────────────────────────────────────────
  // 3. AGENT FLEET MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  {
    name: "octavius_agents_provision",
    category: "agents",
    description: "Deploy agent workspaces to disk and register with the OpenClaw gateway. Creates SOUL.md, AGENTS.md, USER.md for all 11 agents (4 generalists + 6 specialists + orchestrator).",
    keywords: ["agents", "provision", "deploy", "register", "workspace", "setup", "initialize"],
    parameters: {
      type: "object",
      properties: { basePath: { type: "string", description: "Base path for workspaces (defaults to ~/.openclaw)" } },
    },
    execute: async (api, _id, params) => json(await octFetch(api, "/api/gateway/provision", { method: "POST", body: JSON.stringify(params) })),
  },
  {
    name: "octavius_agents_workspace_read",
    category: "agents",
    description: "Read an agent's workspace files (SOUL.md, AGENTS.md, USER.md, TOOLS.md, HEARTBEAT.md).",
    keywords: ["agent", "workspace", "read", "soul", "agents.md", "personality", "instructions"],
    parameters: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "e.g. octavius-orchestrator, agent-lifeforce, specialist-research" },
        file: { type: "string", enum: ["SOUL.md", "AGENTS.md", "USER.md", "TOOLS.md", "HEARTBEAT.md"] },
      },
      required: ["agentId", "file"],
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, `/api/gateway/workspace-files?agentId=${params.agentId}&file=${params.file}`);
      return json(data);
    },
  },
  {
    name: "octavius_agents_workspace_write",
    category: "agents",
    description: "Update an agent's workspace file (personality, instructions, user profile, etc.).",
    keywords: ["agent", "workspace", "write", "update", "soul", "personality", "instructions", "configure"],
    parameters: {
      type: "object",
      properties: {
        agentId: { type: "string" },
        file: { type: "string", enum: ["SOUL.md", "AGENTS.md", "USER.md", "TOOLS.md", "HEARTBEAT.md"] },
        content: { type: "string", description: "Full Markdown content" },
      },
      required: ["agentId", "file", "content"],
    },
    execute: async (api, _id, params) => {
      await octFetch(api, "/api/gateway/workspace-files", { method: "PUT", body: JSON.stringify(params) });
      return txt(`Updated ${params.file} for ${params.agentId}`);
    },
  },
  {
    name: "octavius_agents_delegate",
    category: "agents",
    description: "Delegate a task to a specific Octavius agent. Generalists handle quadrant work; specialists handle domain expertise. Generalists can spawn specialists if needed.",
    keywords: ["delegate", "assign", "route", "agent", "specialist", "generalist", "orchestrate"],
    parameters: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          enum: [
            "agent-lifeforce", "agent-industry", "agent-fellowship", "agent-essence",
            "specialist-research", "specialist-engineering", "specialist-marketing",
            "specialist-video", "specialist-image", "specialist-writing",
          ],
          description: "Target agent",
        },
        task: { type: "string", description: "Task description for the agent" },
        priority: { type: "string", enum: ["high", "medium", "low"], default: "medium" },
      },
      required: ["agentId", "task"],
    },
    execute: async (api, _id, params) => {
      // Create the task in memory + dashboard, tagged for the target agent
      const quadrantMap: Record<string, string> = {
        "agent-lifeforce": "quadrant:lifeforce", "agent-industry": "quadrant:industry",
        "agent-fellowship": "quadrant:fellowship", "agent-essence": "quadrant:essence",
      };
      const tag = quadrantMap[params.agentId] || `agent:${params.agentId}`;
      const memResult = await octFetch(api, "/api/memory/items", {
        method: "POST",
        body: JSON.stringify({
          text: `Delegated task to ${params.agentId}: ${params.task}`,
          type: "episodic", layer: "daily_notes",
          provenance: { source_type: "agent_output", source_id: `delegation-${Date.now()}`, agent_id: "octavius-orchestrator" },
          confidence: 0.9, importance: 0.7,
          tags: [tag, "delegation", `priority:${params.priority || "medium"}`],
        }),
      });
      return txt(`Task delegated to ${params.agentId}: "${params.task}" (memory: ${memResult.memory_id})`);
    },
  },

  // ─────────────────────────────────────────────────────────────
  // 4. HEALTH INTEGRATION
  // ─────────────────────────────────────────────────────────────

  {
    name: "octavius_health_import",
    category: "health",
    description: "Import health data from a CSV file (RingConn, Apple Health, etc.).",
    keywords: ["health", "import", "csv", "biometric", "ringconn", "wearable", "data"],
    parameters: {
      type: "object",
      properties: {
        csvContent: { type: "string", description: "CSV file content as string" },
        source: { type: "string", description: "Data source name (e.g. ringconn, apple_health)" },
      },
      required: ["csvContent"],
    },
    execute: async (api, _id, params) => json(await octFetch(api, "/api/health/import", { method: "POST", body: JSON.stringify(params) })),
  },
  {
    name: "octavius_health_ingest",
    category: "health",
    description: "Ingest normalized health readings (from ROOK SDK or Apple Health webhooks).",
    keywords: ["health", "ingest", "biometric", "heart rate", "hrv", "spo2", "sleep", "webhook"],
    parameters: {
      type: "object",
      properties: {
        readings: { type: "array", items: { type: "object" }, description: "Array of canonical health readings" },
        source: { type: "string", enum: ["rook", "apple_health", "manual"] },
      },
      required: ["readings"],
    },
    execute: async (api, _id, params) => json(await octFetch(api, "/api/health/ingest", { method: "POST", body: JSON.stringify(params) })),
  },

  // ─────────────────────────────────────────────────────────────
  // 5. SYSTEM
  // ─────────────────────────────────────────────────────────────

  {
    name: "octavius_gateway_status",
    category: "system",
    description: "Check the OpenClaw gateway connection status.",
    keywords: ["gateway", "status", "connection", "openclaw", "health", "system"],
    parameters: { type: "object", properties: {} },
    execute: async (api, _id, _params) => {
      try {
        const data = await octFetch(api, "/api/gateway/validate-token");
        return json({ status: "connected", ...data });
      } catch {
        return txt("Gateway: disconnected or unreachable");
      }
    },
  },
  {
    name: "octavius_jobs_list",
    category: "system",
    description: "List background job run history (consolidation, decay, evolution).",
    keywords: ["jobs", "background", "consolidation", "decay", "evolution", "schedule", "cron"],
    parameters: { type: "object", properties: {} },
    execute: async (api) => json(await octFetch(api, "/api/memory/jobs")),
  },
  {
    name: "octavius_weekly_review",
    category: "dashboard",
    description: "Create a weekly review entry — what went well, what didn't, next week's focus.",
    keywords: ["weekly", "review", "reflect", "retrospective", "week", "summary"],
    parameters: {
      type: "object",
      properties: {
        wentWell: { type: "string" },
        didNotGoWell: { type: "string" },
        nextWeekFocus: { type: "string" },
      },
      required: ["wentWell", "didNotGoWell", "nextWeekFocus"],
    },
    execute: async (api, _id, params) => {
      const data = await octFetch(api, "/api/memory/items", {
        method: "POST",
        body: JSON.stringify({
          text: `Weekly review:\n- Went well: ${params.wentWell}\n- Didn't go well: ${params.didNotGoWell}\n- Next week focus: ${params.nextWeekFocus}`,
          type: "episodic", layer: "daily_notes",
          provenance: { source_type: "user_input", source_id: `weekly-review-${Date.now()}`, agent_id: null },
          confidence: 0.95, importance: 0.8,
          tags: ["weekly-review"],
        }),
      });
      return txt(`Weekly review saved: ${data.memory_id}`);
    },
  },
];

// ═══════════════════════════════════════════════════════════════
// PHASE 6: THE META TOOL — octavius_discover
// ═══════════════════════════════════════════════════════════════

function discoverTools(query: string, category?: string, limit: number = 5): Array<{ name: string; category: string; description: string }> {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

  let candidates = TOOL_REGISTRY;
  if (category) {
    candidates = candidates.filter(t => t.category === category);
  }

  // Score each tool by keyword + description match
  const scored = candidates.map(tool => {
    let score = 0;
    const searchText = `${tool.name} ${tool.description} ${tool.keywords.join(" ")}`.toLowerCase();

    // Exact keyword matches (highest weight)
    for (const kw of tool.keywords) {
      if (queryLower.includes(kw)) score += 10;
      for (const qw of queryWords) {
        if (kw.includes(qw) || qw.includes(kw)) score += 5;
      }
    }

    // Description word matches
    for (const qw of queryWords) {
      if (searchText.includes(qw)) score += 2;
    }

    // Boost exact name matches
    if (searchText.includes(queryLower)) score += 20;

    return { tool, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => ({
      name: s.tool.name,
      category: s.tool.category,
      description: s.tool.description,
    }));
}

// ═══════════════════════════════════════════════════════════════
// PLUGIN REGISTRATION
// ═══════════════════════════════════════════════════════════════

export default function register(api: any) {
  // Register the meta discovery tool FIRST — this is the keystone
  api.registerTool({
    name: "octavius_discover",
    description: "Search available Octavius tools by natural language or keywords. Use this FIRST to find what tools are available before calling specific ones. Returns matching tools with descriptions.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language description of what you want to do" },
        category: { type: "string", enum: ["dashboard", "memory", "agents", "health", "system"], description: "Optional category filter" },
        limit: { type: "number", default: 5 },
      },
      required: ["query"],
    },
    async execute(_id: string, params: any) {
      const results = discoverTools(params.query, params.category, params.limit || 5);
      if (results.length === 0) {
        return txt("No matching tools found. Try broader keywords. Available categories: dashboard, memory, agents, health, system.");
      }
      const lines = results.map((r, i) => `${i + 1}. **${r.name}** [${r.category}]\n   ${r.description}`);
      return txt(`Found ${results.length} matching tools:\n\n${lines.join("\n\n")}`);
    },
  });

  // Register ALL tools from the registry
  for (const tool of TOOL_REGISTRY) {
    const execFn = tool.execute;
    api.registerTool({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      async execute(id: string, params: any) {
        return execFn(api, id, params);
      },
    });
  }

  // System context injection
  api.on?.("before_prompt_build", () => {
    return {
      appendSystemContext: [
        "\n## Octavius Life Dashboard",
        "You have the Octavius life dashboard connected. Use `octavius_discover` to find available tools by describing what you need.",
        "Categories: dashboard (tasks, journal, goals, checkins), memory (search, store, graph), agents (provision, delegate), health (import, ingest), system (gateway, jobs).",
        "Quadrants: health (Lifeforce), career (Industry), relationships (Fellowship), soul (Essence).",
        `Total tools available: ${TOOL_REGISTRY.length + 1} (use octavius_discover to find the right one).`,
      ].join("\n"),
    };
  }, { priority: 5 });

  api.logger?.info?.(`octavius: plugin loaded — ${TOOL_REGISTRY.length + 1} tools registered (including meta-discovery)`);
}
