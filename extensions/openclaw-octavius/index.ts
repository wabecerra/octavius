/**
 * Octavius OpenClaw Plugin
 *
 * Registers agent tools so any OpenClaw agent can interact with the
 * Octavius life dashboard: create/move tasks, log check-ins, write
 * journal entries, track goals, manage connections, and search memories.
 *
 * Install:
 *   openclaw plugins install ./extensions/openclaw-octavius
 *
 * Config (openclaw.json):
 *   plugins.entries.octavius.config.url = "http://localhost:3000"
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

export default function register(api: any) {
  // ─── Tasks (Kanban) ──────────────────────────────────────

  api.registerTool({
    name: "octavius_tasks_list",
    description: "List tasks from the Octavius kanban board. Filter by status (backlog/in-progress/done) or priority (high/medium/low).",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["backlog", "in-progress", "done"], description: "Filter by kanban column" },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        limit: { type: "number", default: 20 },
      },
    },
    async execute(_id: string, params: any) {
      const qs = new URLSearchParams();
      if (params.status) qs.set("status", params.status);
      if (params.priority) qs.set("priority", params.priority);
      if (params.limit) qs.set("limit", String(params.limit));
      const data = await octFetch(api, `/api/dashboard/tasks?${qs}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  api.registerTool({
    name: "octavius_task_create",
    description: "Create a new task on the Octavius kanban board.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Task description" },
        priority: { type: "string", enum: ["high", "medium", "low"], default: "medium" },
        status: { type: "string", enum: ["backlog", "in-progress", "done"], default: "backlog" },
        dueDate: { type: "string", description: "ISO date" },
      },
      required: ["title"],
    },
    async execute(_id: string, params: any) {
      const data = await octFetch(api, "/api/dashboard/tasks", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return { content: [{ type: "text", text: `Task created: ${data.id} — "${data.title}" [${data.status}]` }] };
    },
  });

  api.registerTool({
    name: "octavius_task_update",
    description: "Move or update tasks on the Octavius kanban board. Can change status, priority, or mark complete.",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Task IDs to update" },
        updates: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["backlog", "in-progress", "done"] },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            completed: { type: "boolean" },
            title: { type: "string" },
          },
        },
      },
      required: ["ids", "updates"],
    },
    async execute(_id: string, params: any) {
      const data = await octFetch(api, "/api/dashboard/tasks", {
        method: "PATCH",
        body: JSON.stringify(params),
      });
      return { content: [{ type: "text", text: `Updated ${data.updated} task(s)` }] };
    },
  });

  // ─── Wellness Check-ins ──────────────────────────────────

  api.registerTool({
    name: "octavius_checkin",
    description: "Log a wellness check-in to Octavius (mood, energy, stress on 1-5 scale).",
    parameters: {
      type: "object",
      properties: {
        mood: { type: "number", minimum: 1, maximum: 5 },
        energy: { type: "number", minimum: 1, maximum: 5 },
        stress: { type: "number", minimum: 1, maximum: 5 },
      },
      required: ["mood", "energy", "stress"],
    },
    async execute(_id: string, params: any) {
      const data = await octFetch(api, "/api/dashboard/checkins", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return { content: [{ type: "text", text: `Check-in logged: mood=${data.mood} energy=${data.energy} stress=${data.stress}` }] };
    },
  });

  // ─── Journal ─────────────────────────────────────────────

  api.registerTool({
    name: "octavius_journal",
    description: "Write a journal entry to Octavius.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Journal entry text" },
      },
      required: ["text"],
    },
    async execute(_id: string, params: any) {
      const data = await octFetch(api, "/api/dashboard/journal", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return { content: [{ type: "text", text: `Journal entry saved: ${data.id}` }] };
    },
  });

  // ─── Goals ───────────────────────────────────────────────

  api.registerTool({
    name: "octavius_goal_create",
    description: "Create a goal in Octavius for a specific life quadrant.",
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
    async execute(_id: string, params: any) {
      const data = await octFetch(api, "/api/dashboard/goals", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return { content: [{ type: "text", text: `Goal created: "${data.title}" in ${data.quadrant}` }] };
    },
  });

  // ─── Memory Search ───────────────────────────────────────

  api.registerTool({
    name: "octavius_memory_search",
    description: "Search the Octavius memory system (hybrid FTS5 + semantic search across all life quadrants).",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Search query" },
        tags: { type: "array", items: { type: "string" }, description: "Filter tags (e.g. quadrant:industry)" },
        limit: { type: "number", default: 10 },
      },
      required: ["text"],
    },
    async execute(_id: string, params: any) {
      const data = await octFetch(api, "/api/memory/search", {
        method: "POST",
        body: JSON.stringify(params),
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    },
  });

  // ─── Memory Store ────────────────────────────────────────

  api.registerTool({
    name: "octavius_memory_store",
    description: "Store a memory/learning/insight in the Octavius memory system.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Memory text" },
        type: { type: "string", enum: ["episodic", "semantic", "procedural"], default: "episodic" },
        tags: { type: "array", items: { type: "string" }, description: "Tags (e.g. quadrant:lifeforce)" },
        importance: { type: "number", minimum: 0, maximum: 1, default: 0.5 },
      },
      required: ["text"],
    },
    async execute(_id: string, params: any) {
      const data = await octFetch(api, "/api/memory/items", {
        method: "POST",
        body: JSON.stringify({
          text: params.text,
          type: params.type || "episodic",
          layer: "daily_notes",
          provenance: { source_type: "agent_output", source_id: `openclaw-${Date.now()}`, agent_id: null },
          confidence: 0.8,
          importance: params.importance || 0.5,
          tags: params.tags || [],
        }),
      });
      return { content: [{ type: "text", text: `Memory stored: ${data.memory_id}` }] };
    },
  });

  // ─── System context injection ────────────────────────────

  api.on?.("before_prompt_build", () => {
    return {
      appendSystemContext: [
        "\n## Octavius Life Dashboard",
        "You have access to the Octavius life dashboard via tools prefixed with octavius_.",
        "Use octavius_task_create to create tasks, octavius_checkin for wellness, octavius_journal for journal entries.",
        "Use octavius_memory_search to recall past context and octavius_memory_store to save learnings.",
        "Quadrants: health (Lifeforce), career (Industry), relationships (Fellowship), soul (Essence).",
      ].join("\n"),
    };
  }, { priority: 5 });

  api.logger?.info?.("octavius: plugin loaded — dashboard tools registered");
}
