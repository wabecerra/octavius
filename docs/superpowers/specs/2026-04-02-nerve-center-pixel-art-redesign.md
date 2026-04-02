# Nerve Center Pixel Art Redesign

**Date:** 2026-04-02
**Status:** Approved
**Approach:** Option C — Full Pixel Art with Canvas/Phaser
**Asset Strategy:** Free tilesets + custom agent sprites
**Architecture:** Fresh scene, cherry-pick event bus + FleetStore integration
**Implementation:** Tier A first, then B, then C layered on top

---

## 1. Problem Statement

The current Nerve Center has five problems:
1. **Dispatch Bay** — name has no relationship to Fellowship (social/relationships)
2. **Memory Vault** — confusing name for Lifeforce (health/wellness)
3. **Break Room** — always empty because idle agents stay in their home rooms
4. **Media Studio** — n8n (automation) doesn't belong with video/image
5. **Engine Room** — "engineering" specialist is actually "architect + coder" now

The current layout is a 4x3 CSS grid of colored boxes with no visual identity, no agent movement, and no spatial awareness of what agents are doing.

## 2. Solution Overview

Replace the CSS grid with a full Phaser pixel-art scene: Canvas-rendered rooms with tileset graphics, 12 sprite-animated agents that walk between rooms via BFS pathfinding, emote bubbles for status, and corridors connecting rooms. Three progressive interactivity tiers (A → B → C).

## 3. Architecture

### What we keep (cherry-pick from existing code)

| Component | File | Why |
|-----------|------|-----|
| React mount | `components/town/game/PhaserGame.tsx` | Already handles Phaser lifecycle in React |
| Town event bus | `lib/town/events.ts` | Bridges Phaser ↔ React, untouched |
| Gateway event bus | `lib/gateway-view/events.ts` | Telemetry routing, untouched |
| Fleet store | `lib/town/fleet-store.ts` | Agent state singleton, untouched |
| Fleet hooks | `lib/town/use-fleet.ts`, `use-fleet-sse.ts` | React bindings for agent state |
| Bot state store | `lib/town/bot-state-store.ts` | Worker position persistence |
| Character sprites | `public/town/characters/Premade_Character_48x48_*.png` | 48x48, 6 frames/direction |
| Emotes spritesheet | `public/town/sprites/emotes_48x48.png` | 48x48, 8 columns |
| Tilesets | `public/town/tilesets/*.png` | 48x48 room themes |
| Game config | `components/town/game/config.ts` | 1280x720, pixelArt mode |
| Constants | `lib/gateway-view/constants.ts` | WORK_STATE_EMOTES (EVENT_TO_ROOM needs translation — see below) |

### What we write fresh

| Component | File | Purpose |
|-----------|------|---------|
| New scene | `components/town/game/scenes/NerveCenterScene.ts` | Loads map, spawns 12 agents, wires events, camera |
| Agent entity | `components/town/game/entities/Agent.ts` | Pathfinding, work state, emote display, idle wandering |
| Room ID map | `components/town/game/scenes/room-id-map.ts` | Translates old EVENT_TO_ROOM IDs → new room IDs |
| Room map | `public/town/gateway/nerve-center-map.logic.json` | Room definitions, bounds, walk graph, work zones |
| Updated view | `components/views/NerveCenterView.tsx` | Swap CSS grid for PhaserGame mount + tooltip overlay |

**Room ID translation layer** (`room-id-map.ts`): The existing `EVENT_TO_ROOM` in `constants.ts` maps telemetry events to old room IDs (`room-vault`, `room-forge`, etc.). Rather than modifying `constants.ts` (which NerveScene still uses), NerveCenterScene includes a translation map:

```typescript
export const OLD_TO_NEW_ROOM: Record<string, string> = {
  'room-vault': 'vitality-lab',
  'room-forge': 'task-forge',
  'room-bridge': 'command-hub',
  'room-watchtower': 'research-lab',
  'room-ledger': 'automations',
  'room-hub': 'command-hub',
  'room-dispatch': 'commons',
  'room-workshop': 'soul-workshop',
  'room-quarters': 'break-room',
}
```

NerveCenterScene calls `OLD_TO_NEW_ROOM[EVENT_TO_ROOM[event.type]]` to route telemetry events to the correct new room.

### What we do NOT touch

- `townEvents` / `gatewayEvents` event buses
- `FleetStore` singleton or its React hooks
- `bot-state-store.ts` persistence layer
- `useFleetSSE` / `useFleetActivitySync` polling
- Any API routes or backend logic

## 4. Room Layout

### 10 Rooms (renamed to match purpose)

| Room ID | Name | Agents | Color | Grid Position |
|---------|------|--------|-------|---------------|
| `vitality-lab` | Vitality Lab | gen-lifeforce | #34d399 | Top-left |
| `task-forge` | Task Forge | gen-industry, architect, coder | #60a5fa | Top-center (larger) |
| `writing-room` | Writing Room | writing, marketing | #a78bfa | Top-right |
| `research-lab` | Research Lab | research | #818cf8 | Top-far-right |
| `commons` | Commons | gen-fellowship | #f87171 | Bottom-left |
| `command-hub` | Command Hub | gateway/orchestrator status | #ff5c5c | Bottom-center (largest) |
| `automations` | Automations Bay | n8n | #fb923c | Bottom, flanking hub |
| `soul-workshop` | Soul Workshop | gen-essence | #c084fc | Bottom-right |
| `media-studio` | Media Studio | video, image | #f472b6 | Bottom, flanking hub |
| `break-room` | Break Room | all idle agents | #a3a3a3 | Bottom-far-right |

### Spatial arrangement

```
┌─────────────┬──────────────────┬─────────────┬──────────────┐
│ Vitality Lab│   Task Forge     │ Writing Room│ Research Lab  │
│  (lifeforce)│ (industry+arch+  │  (writing+  │  (research)  │
│             │   coder)         │  marketing) │              │
├─────┬───────┴────┬─────────────┼─────┬───────┴──────┬───────┤
│       │  Media     │  Command    │Auto-│ Soul         │ Break │
│Commons│  Studio    │   Hub       │ Bay │ Workshop     │ Room  │
│       │(video+img) │ (gateway)   │(n8n)│  (essence)   │(idle) │
└─────┴────────────┴─────────────┴─────┴──────────────┴───────┘
```

Dashed corridors connect adjacent rooms horizontally and vertically. Agents pathfind along corridor waypoints using BFS.

## 5. Agent System

### 12 Agents

Agent IDs use the `specialist-` prefix to match FleetStore's existing naming convention.

| Agent ID | Type | Sprite | Home Room |
|----------|------|--------|-----------|
| gen-lifeforce | generalist | character_02 | vitality-lab |
| gen-industry | generalist | character_03 | task-forge |
| gen-fellowship | generalist | character_04 | commons |
| gen-essence | generalist | character_05 | soul-workshop |
| specialist-architect | specialist | character_01 | task-forge |
| specialist-coder | specialist | character_06 | task-forge |
| specialist-research | specialist | character_03 (alt palette) | research-lab |
| specialist-marketing | specialist | character_04 (alt palette) | writing-room |
| specialist-writing | specialist | character_05 (alt palette) | writing-room |
| specialist-video | specialist | character_01 (alt palette) | media-studio |
| specialist-image | specialist | character_02 (alt palette) | media-studio |
| specialist-n8n | specialist | character_06 (alt palette) | automations |

**Sprite availability:** 7 premade character sprites exist on disk (01-06, 09). character_09 is reserved for the boss/player in Tier B. Generalists use characters 02-05. Specialists reuse existing sprites with tinted palettes (Phaser's `setTint()`) to differentiate them visually — no new sprite files needed. Each specialist gets a unique tint based on their room's quadrant color.

**Note:** FleetStore's DEFAULT_AGENTS includes `specialist-engineering` but no `specialist-n8n`. The scene maps `specialist-engineering` → task-forge as an alias for the architect+coder room. `specialist-n8n` is resolved via FleetStore's `applyServerState()` when the n8n agent is spawned.

### Agent lifecycle

```
Idle (home room, wander within bounds, 3-10s random delay)
  ↓ townEvents 'task-assigned'
Walk to target room (BFS pathfinding via corridor waypoints)
  ↓ arrive at room
Working (play work animation + emote bubble from WORK_STATE_EMOTES)
  ↓ townEvents 'task-completed' or 'task-failed'
Walk back to home room
  ↓ 30s idle timeout
Walk to Break Room (solves empty Break Room problem)
  ↓ townEvents 'task-assigned'
Leave Break Room, walk to target room
```

### Agent entity (Agent.ts)

Fresh implementation inspired by Worker.ts patterns. Key design points:
- Supports all 12 agent types (not just 4 workers)
- Each agent has a `homeRoomId` and can be in Break Room when idle
- Idle timeout triggers Break Room migration (scene-local behavior — does NOT change FleetStore status)
- Specialist agents only render when active (empty desk/chair otherwise)
- Status tracked via FleetStore, not internal state

**seatId mapping:** townEvents uses `seatId` as the first parameter for task events. The scene maintains a bidirectional map: `agentId ↔ seatId`. For generalists, seatIds are `seat-0` through `seat-3` (existing SEAT_INDEX_TO_AGENT mapping). For specialists, seatId equals agentId (e.g., `specialist-architect`). FleetStore's `resolveAgentId()` handles both formats.

### Pathfinding

- **Inter-room:** Walk graph BFS (nodes = room centers + corridor waypoints, edges from manifest)
- **Intra-room wandering:** Simple random-point-in-bounds (no grid pathfinding needed for small rooms)
- Agent speed: `160 * 0.55 = 88px/s`
- Arrival threshold: 8px
- Path serialized to bot-state-store for persistence across page refreshes

### Idle wandering

- When in home room or Break Room, agents wander within room bounds
- Random delay between moves: 3000-10000ms
- Wander target = random point within room bounds (with 16px padding from edges)

### Break Room behavior

Break Room migration is **purely visual/scene-level** — it does not modify FleetStore agent status. An agent in the Break Room still has FleetStore status `empty`. The scene tracks which agents are in the Break Room via an internal `Set<string>`. When a task arrives, the agent is removed from the Break Room set and walks to the target room.

## 6. Interactivity Tiers

### Tier A — View-Only Monitor (implement first)

**Rendering:**
- Rooms rendered using existing tilesets (Modern_Office, Room_Builder themes)
- Each room has border glow matching quadrant color, brighter when agents active
- Corridors shown as dashed lines between room doors
- Camera auto-follows most recent activity (lerps with 0.1 factor), mouse wheel zoom (0.5x-2x)

**Agent visuals:**
- Sprite-animated agents walking between rooms
- Emote bubbles above agents showing work state (from WORK_STATE_EMOTES mapping)
- Pulse glow under active agents (matches quadrant color)

**Information display:**
- Status bar at bottom: agent count, active tasks, gateway connection
- Click room → tooltip: room name, assigned agents, current task queue
- Click agent → tooltip: name, status, current task description

**No player character in Tier A** — pure observation mode.

**Event wiring:**
- Subscribe to `townEvents`: task-assigned, task-completed, task-failed, agent-status
- Subscribe to `gatewayEvents`: telemetry-event (routes agents to rooms)
- Subscribe to FleetStore: agent state changes trigger sprite updates
- Camera follows agent that most recently changed state

### Tier B — Light Interaction (layer on A)

**Player character:**
- Restore boss sprite with WASD/arrow key movement
- Press E near agent (within 48px) → opens task panel sidebar
- Existing `open-terminal` event flow

**Room interaction:**
- Click room → room detail panel (sidebar slide-in from right)
- Panel shows: queue, history, assigned agents, completion stats
- Right-click room → context menu: "Assign task", "View history"

**Agent management:**
- Drag agent between rooms → reassigns home room
- Emits `task-assigned` event to trigger walk animation
- Sidebar panel replaces NerveCenterView CSS grid information display

### Tier C — Full Game-Like (layer on B)

**Speech bubbles:**
- Truncated current task text above agents (not just emote icons)
- Auto-dismiss after 5s, show on task assignment

**Room-aware animations:**
- Task Forge: agents tap keyboards at desks
- Research Lab: agents read books, take notes
- Break Room: agents drink coffee, stretch, sleep
- Vitality Lab: agents check monitors, stretch

**Dynamic furniture:**
- Empty room: clean desks
- Busy room (2+ tasks queued): stacked papers on desks
- Overloaded (5+ tasks): papers overflowing, red warning glow

**Agent mood:**
- Happy (tasks completing on time): green tint, bounce walk
- Stressed (many queued tasks): red tint, faster walk
- Sleeping (idle in Break Room): zzz emote, slow breathing animation

**Ambient features (optional):**
- Day/night tinting based on system clock
- Sound effects per room (mutable): keyboard clacking, ambient hum
- Click agent → inline chat interface (speech bubble → chat panel)

## 7. Map Manifest Format

`nerve-center-map.logic.json` schema (v3, extends existing v2):

```json
{
  "version": "3.0",
  "canvas": { "width": 1280, "height": 720 },  // ALL coordinates use this space (not 1920x1080)
  "rooms": [
    {
      "id": "task-forge",
      "label": "Task Forge",
      "bounds": [x, y, width, height],
      "color": "#60a5fa",
      "tileset": "Modern_Office_48x48",
      "doors": [{ "x": 580, "y": 260, "direction": "south" }],
      "seats": [
        { "id": "seat-industry", "agentId": "gen-industry", "x": 620, "y": 120 },
        { "id": "seat-architect", "agentId": "specialist-architect", "x": 700, "y": 120 },
        { "id": "seat-coder", "agentId": "specialist-coder", "x": 780, "y": 120 }
      ],
      "workZone": { "x": 600, "y": 80, "w": 280, "h": 200 }
    }
  ],
  "walkGraph": {
    "nodes": {
      "vitality-lab-center": { "x": 160, "y": 180 },
      "corridor-1": { "x": 350, "y": 260 },
      "task-forge-center": { "x": 640, "y": 150 }
    },
    "edges": [
      ["vitality-lab-center", "corridor-1"],
      ["corridor-1", "task-forge-center"]
    ]
  }
}
```

## 8. NerveCenterView.tsx Changes

The React component transforms from a CSS grid to a Phaser game mount with thin overlay:

```
Before:
  <div className="nc-grid">
    {ROOMS.map(room => <RoomCard ... />)}
    <ActivitySidebar />
  </div>

After:
  <div className="nc-container">
    <PhaserGame />
    <TooltipOverlay />        <!-- HTML overlay for click tooltips -->
    <StatusBar />             <!-- Bottom bar: agent count, tasks, gateway -->
    <ActivityFeed />          <!-- Scrollable live activity log (preserves existing sidebar info) -->
    <TaskAssignModal />       <!-- Existing modal, triggered by events -->
  </div>
```

**PhaserGame mount:** PhaserGame.tsx takes no props — it imports config internally. We replace `NerveScene` with `NerveCenterScene` in `config.ts`'s scene array (not both — only the new scene). This means the old NerveScene is no longer loaded.

**ActivityFeed:** Preserves the "LIVE ACTIVITY" and "ROOM ROUTING" information from the current sidebar. Rendered as a collapsible panel on the right edge, semi-transparent over the Phaser canvas. Uses the same `useFleet()` hook data.

## 9. File Inventory

### New files to create

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `components/town/game/scenes/NerveCenterScene.ts` | ~600 | Main scene: room rendering, agent spawning, event wiring |
| `components/town/game/entities/Agent.ts` | ~400 | Agent entity: pathfinding, emotes, idle behavior, work state |
| `components/town/game/scenes/room-id-map.ts` | ~30 | Old room ID → new room ID translation |
| `public/town/gateway/nerve-center-map.logic.json` | ~200 | Room definitions, walk graph, work zones (1280x720 coords) |

### Files to modify

| File | Change |
|------|--------|
| `components/views/NerveCenterView.tsx` | Replace CSS grid with PhaserGame mount + overlay + ActivityFeed |
| `components/town/game/config.ts` | Replace NerveScene with NerveCenterScene in scene array |

### Files explicitly untouched

- `lib/town/events.ts` — event bus
- `lib/town/fleet-store.ts` — agent state
- `lib/town/bot-state-store.ts` — persistence
- `lib/town/use-fleet.ts` — React hooks
- `lib/town/use-fleet-sse.ts` — SSE subscription
- `lib/gateway-view/events.ts` — gateway events
- `lib/gateway-view/constants.ts` — mappings
- All API routes

## 10. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Specialist sprites | Only 7 character PNGs on disk; use `setTint()` palette swap on existing sprites for specialists |
| Phaser bundle size (~1MB) | Already in the bundle from existing NerveScene; no new dependency |
| Break Room empty again | Idle timeout (30s) forces agents to walk to Break Room |
| NerveCenterView features lost | Tooltip overlay + StatusBar + TaskAssignModal preserve all info |
| Performance with 12 agents | Phaser handles 100+ sprites easily at 48x48; 12 is trivial |
| Mobile layout | Scale mode RESIZE already adapts; touch events map to click |

## 11. Success Criteria

**Tier A complete when:**
- [ ] 10 rooms render as colored rounded rectangles with border glow (tileset overlays deferred to Tier B)
- [ ] 12 agent sprites spawn in their home rooms
- [ ] Agents walk between rooms when tasks are assigned (via FleetStore events)
- [ ] Emote bubbles show work state above active agents
- [ ] Idle agents migrate to Break Room after 30s timeout
- [ ] Click room/agent shows tooltip with status info
- [ ] Camera auto-follows activity
- [ ] Existing TaskAssignModal still works
- [ ] Gateway SSE + activity polling still update agent state

**Tier B complete when:**
- [ ] Player character moves with WASD/arrows
- [ ] E key near agent opens task panel
- [ ] Click room opens detail sidebar
- [ ] Drag-assign agents between rooms works

**Tier C complete when:**
- [ ] Speech bubbles show task text
- [ ] Room-specific idle animations play
- [ ] Furniture density changes with workload
- [ ] Agent mood system reflects task state
