# Nerve Center Pixel Art Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the NerveCenterView CSS grid with a Phaser pixel-art scene where 12 agents walk between 10 redesigned rooms via BFS pathfinding. Tier A (view-only monitor) only.

**Architecture:** Fresh `NerveCenterScene.ts` + `Agent.ts` entity, cherry-picking existing event buses (`townEvents`, `gatewayEvents`), `FleetStore`, `bot-state-store`, and character sprites. No changes to event bus or FleetStore code.

**Tech Stack:** Phaser 3, Next.js 14, TypeScript, styled-jsx

**Spec:** `docs/superpowers/specs/2026-04-02-nerve-center-pixel-art-redesign.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/components/town/game/scenes/room-id-map.ts` | Old room ID → new room ID translation for telemetry routing |
| `src/components/town/game/scenes/NerveCenterScene.ts` | Phaser scene: loads map, renders rooms, spawns agents, wires events, manages camera |
| `src/components/town/game/entities/Agent.ts` | Agent entity: walk-graph BFS pathfinding, emote bubbles, idle wandering, break room migration |
| `public/town/gateway/nerve-center-map.logic.json` | Room definitions, walk graph nodes/edges, work zones, seats — all in 1280×720 coordinate space |

### Modified files

| File | Change |
|------|--------|
| `src/components/town/game/config/animations.ts` | Add `SPECIALIST_SPRITES` array mapping 8 specialist IDs to existing sprite files + tint colors |
| `src/components/town/game/config.ts` | Replace `NerveScene` with `NerveCenterScene` in scene array |
| `src/components/views/NerveCenterView.tsx` | Replace CSS grid with `<PhaserGame />` mount + tooltip overlay + activity feed + status bar |

### Untouched files (for reference only)

| File | Used for |
|------|----------|
| `src/lib/town/events.ts` | `townEvents` bus — subscribe to task-assigned, task-completed, etc. |
| `src/lib/town/fleet-store.ts` | `getFleetStore()` — read agent state, subscribe to changes |
| `src/lib/town/bot-state-store.ts` | `BotStateStore` — persist agent positions across page refreshes |
| `src/lib/gateway-view/events.ts` | `gatewayEvents` bus — subscribe to telemetry-event |
| `src/lib/gateway-view/constants.ts` | `EVENT_TO_ROOM`, `EVENT_TO_WORK_STATE`, `WORK_STATE_EMOTES` |
| `src/lib/town/constants.ts` | `GAME_WIDTH` (1280), `GAME_HEIGHT` (720), speeds, thresholds |
| `src/components/town/game/config/emotes.ts` | `EMOTE_SHEET_KEY`, `EMOTE_FRAMES` mapping |
| `src/components/town/game/config/animations.ts` | `makeAnims()`, `FRAME_WIDTH`, `FRAME_HEIGHT`, `SHEET_COLUMNS` (also modified — listed in both tables since existing exports are consumed AND new exports are added) |
| `src/components/town/game/PhaserGame.tsx` | React component that mounts Phaser — no changes needed |
| `src/components/town/game/entities/Worker.ts` | Reference for Agent.ts patterns (do NOT import from this) |

---

## Task 1: Room ID Translation Map

**Files:**
- Create: `src/components/town/game/scenes/room-id-map.ts`

- [ ] **Step 1: Create the room-id-map module**

```typescript
// src/components/town/game/scenes/room-id-map.ts

/**
 * Translates legacy room IDs (used by EVENT_TO_ROOM in constants.ts)
 * to the new Nerve Center room IDs.
 *
 * This avoids modifying constants.ts (which NerveScene still references).
 */
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

/** Translate an old room ID to a new one, or return the input if already new. */
export function translateRoomId(oldId: string): string {
  return OLD_TO_NEW_ROOM[oldId] ?? oldId
}

/**
 * Agent ID → home room mapping.
 * Generalists live in their quadrant room; specialists in their functional room.
 */
export const AGENT_HOME_ROOM: Record<string, string> = {
  'gen-lifeforce': 'vitality-lab',
  'gen-industry': 'task-forge',
  'gen-fellowship': 'commons',
  'gen-essence': 'soul-workshop',
  'specialist-architect': 'task-forge',
  'specialist-coder': 'task-forge',
  'specialist-research': 'research-lab',
  'specialist-engineering': 'task-forge',  // alias for architect+coder room
  'specialist-marketing': 'writing-room',
  'specialist-writing': 'writing-room',
  'specialist-video': 'media-studio',
  'specialist-image': 'media-studio',
  'specialist-n8n': 'automations',
}

/**
 * Room color palette — used for border glow and agent tinting.
 * Hex string → Phaser color number mapping done at usage site.
 */
export const ROOM_COLORS: Record<string, string> = {
  'vitality-lab': '#34d399',
  'task-forge': '#60a5fa',
  'writing-room': '#a78bfa',
  'research-lab': '#818cf8',
  'commons': '#f87171',
  'command-hub': '#ff5c5c',
  'automations': '#fb923c',
  'soul-workshop': '#c084fc',
  'media-studio': '#f472b6',
  'break-room': '#a3a3a3',
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/components/town/game/scenes/room-id-map.ts`
Expected: No errors (or run via `npx next build` later)

- [ ] **Step 3: Commit**

```bash
git add src/components/town/game/scenes/room-id-map.ts
git commit -m "feat(nerve-center): add room ID translation map for new layout"
```

---

## Task 2: Map Manifest JSON

**Files:**
- Create: `public/town/gateway/nerve-center-map.logic.json`

This defines all 10 rooms with bounds, walk graph, and seat positions in 1280×720 coordinate space.

- [ ] **Step 1: Create the map manifest**

Layout: 2 rows. Top row has 4 rooms (padding=10, gap=10). Bottom row has 6 rooms (narrower).
Canvas: 1280×720. Room height: ~300px per row with 20px top margin and 20px corridor gap between rows.

```json
{
  "meta": {
    "version": "3.0.0",
    "schema": "octavius/nerve-center.v3",
    "canvas": { "width": 1280, "height": 720 }
  },
  "rooms": [
    {
      "id": "vitality-lab",
      "label": "Vitality Lab",
      "color": "#34d399",
      "bounds": [10, 20, 290, 300],
      "seats": [
        { "id": "seat-0", "agentId": "gen-lifeforce", "x": 155, "y": 170 }
      ]
    },
    {
      "id": "task-forge",
      "label": "Task Forge",
      "color": "#60a5fa",
      "bounds": [310, 20, 370, 300],
      "seats": [
        { "id": "seat-1", "agentId": "gen-industry", "x": 400, "y": 120 },
        { "id": "specialist-architect", "agentId": "specialist-architect", "x": 500, "y": 120 },
        { "id": "specialist-coder", "agentId": "specialist-coder", "x": 600, "y": 120 },
        { "id": "specialist-engineering", "agentId": "specialist-engineering", "x": 550, "y": 220 }
      ]
    },
    {
      "id": "writing-room",
      "label": "Writing Room",
      "color": "#a78bfa",
      "bounds": [690, 20, 290, 300],
      "seats": [
        { "id": "specialist-writing", "agentId": "specialist-writing", "x": 780, "y": 120 },
        { "id": "specialist-marketing", "agentId": "specialist-marketing", "x": 880, "y": 120 }
      ]
    },
    {
      "id": "research-lab",
      "label": "Research Lab",
      "color": "#818cf8",
      "bounds": [990, 20, 280, 300],
      "seats": [
        { "id": "specialist-research", "agentId": "specialist-research", "x": 1130, "y": 170 }
      ]
    },
    {
      "id": "commons",
      "label": "Commons",
      "color": "#f87171",
      "bounds": [10, 400, 190, 300],
      "seats": [
        { "id": "seat-2", "agentId": "gen-fellowship", "x": 105, "y": 550 }
      ]
    },
    {
      "id": "media-studio",
      "label": "Media Studio",
      "color": "#f472b6",
      "bounds": [210, 400, 220, 300],
      "seats": [
        { "id": "specialist-video", "agentId": "specialist-video", "x": 280, "y": 500 },
        { "id": "specialist-image", "agentId": "specialist-image", "x": 370, "y": 500 }
      ]
    },
    {
      "id": "command-hub",
      "label": "Command Hub",
      "color": "#ff5c5c",
      "bounds": [440, 400, 320, 300],
      "seats": []
    },
    {
      "id": "automations",
      "label": "Automations Bay",
      "color": "#fb923c",
      "bounds": [770, 400, 180, 300],
      "seats": [
        { "id": "specialist-n8n", "agentId": "specialist-n8n", "x": 860, "y": 550 }
      ]
    },
    {
      "id": "soul-workshop",
      "label": "Soul Workshop",
      "color": "#c084fc",
      "bounds": [960, 400, 190, 300],
      "seats": [
        { "id": "seat-3", "agentId": "gen-essence", "x": 1055, "y": 550 }
      ]
    },
    {
      "id": "break-room",
      "label": "Break Room",
      "color": "#a3a3a3",
      "bounds": [1160, 400, 110, 300],
      "seats": []
    }
  ],
  "walkGraph": {
    "nodes": {
      "vitality-center": { "x": 155, "y": 170, "roomId": "vitality-lab" },
      "task-forge-center": { "x": 495, "y": 170, "roomId": "task-forge" },
      "writing-center": { "x": 835, "y": 170, "roomId": "writing-room" },
      "research-center": { "x": 1130, "y": 170, "roomId": "research-lab" },
      "corridor-top-1": { "x": 300, "y": 350 },
      "corridor-top-2": { "x": 500, "y": 350 },
      "corridor-top-3": { "x": 840, "y": 350 },
      "corridor-top-4": { "x": 1130, "y": 350 },
      "commons-center": { "x": 105, "y": 550, "roomId": "commons" },
      "media-center": { "x": 320, "y": 550, "roomId": "media-studio" },
      "hub-center": { "x": 600, "y": 550, "roomId": "command-hub" },
      "auto-center": { "x": 860, "y": 550, "roomId": "automations" },
      "soul-center": { "x": 1055, "y": 550, "roomId": "soul-workshop" },
      "break-center": { "x": 1215, "y": 550, "roomId": "break-room" },
      "corridor-bot-1": { "x": 105, "y": 370 },
      "corridor-bot-2": { "x": 320, "y": 370 },
      "corridor-bot-3": { "x": 600, "y": 370 },
      "corridor-bot-4": { "x": 860, "y": 370 },
      "corridor-bot-5": { "x": 1055, "y": 370 },
      "corridor-bot-6": { "x": 1215, "y": 370 }
    },
    "edges": [
      ["vitality-center", "corridor-top-1"],
      ["task-forge-center", "corridor-top-2"],
      ["writing-center", "corridor-top-3"],
      ["research-center", "corridor-top-4"],
      ["corridor-top-1", "corridor-top-2"],
      ["corridor-top-2", "corridor-top-3"],
      ["corridor-top-3", "corridor-top-4"],
      ["corridor-top-1", "corridor-bot-1"],
      ["corridor-top-2", "corridor-bot-2"],
      ["corridor-top-2", "corridor-bot-3"],
      ["corridor-top-3", "corridor-bot-4"],
      ["corridor-top-4", "corridor-bot-5"],
      ["corridor-bot-1", "commons-center"],
      ["corridor-bot-1", "corridor-bot-2"],
      ["corridor-bot-2", "media-center"],
      ["corridor-bot-2", "corridor-bot-3"],
      ["corridor-bot-3", "hub-center"],
      ["corridor-bot-3", "corridor-bot-4"],
      ["corridor-bot-4", "auto-center"],
      ["corridor-bot-4", "corridor-bot-5"],
      ["corridor-bot-5", "soul-center"],
      ["corridor-bot-5", "corridor-bot-6"],
      ["corridor-bot-6", "break-center"]
    ]
  }
}
```

- [ ] **Step 2: Validate JSON is well-formed**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/town/gateway/nerve-center-map.logic.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add public/town/gateway/nerve-center-map.logic.json
git commit -m "feat(nerve-center): add v3 room manifest with 10 rooms and walk graph"
```

---

## Task 3: Specialist Sprite Configuration

**Files:**
- Modify: `src/components/town/game/config/animations.ts`

Add sprite configs for the 8 specialists. Each reuses an existing character PNG with a Phaser `setTint()` color to differentiate.

- [ ] **Step 1: Add SPECIALIST_SPRITES to animations.ts**

After the existing `WORKER_SPRITES` array (line 39), add:

```typescript
/**
 * Specialist agent sprite configs.
 * Each reuses an existing character PNG; differentiated via Phaser `setTint()`.
 * Tint is the room's quadrant color (from ROOM_COLORS).
 */
export interface SpecialistSpriteConfig {
  agentId: string
  key: string            // Phaser texture key (must be unique per agent)
  sourcePath: string     // The actual PNG file on disk
  label: string
  tint: number           // Phaser color hex (0xRRGGBB)
}

export const SPECIALIST_SPRITES: SpecialistSpriteConfig[] = [
  { agentId: 'specialist-architect', key: 'char_architect', sourcePath: '/town/characters/Premade_Character_48x48_01.png', label: 'Architect', tint: 0x60a5fa },
  { agentId: 'specialist-coder', key: 'char_coder', sourcePath: '/town/characters/Premade_Character_48x48_06.png', label: 'Coder', tint: 0x60a5fa },
  { agentId: 'specialist-research', key: 'char_research', sourcePath: '/town/characters/Premade_Character_48x48_03.png', label: 'Research', tint: 0x818cf8 },
  { agentId: 'specialist-marketing', key: 'char_marketing', sourcePath: '/town/characters/Premade_Character_48x48_04.png', label: 'Marketing', tint: 0xa78bfa },
  { agentId: 'specialist-writing', key: 'char_writing', sourcePath: '/town/characters/Premade_Character_48x48_05.png', label: 'Writing', tint: 0xa78bfa },
  { agentId: 'specialist-video', key: 'char_video', sourcePath: '/town/characters/Premade_Character_48x48_01.png', label: 'Video', tint: 0xf472b6 },
  { agentId: 'specialist-image', key: 'char_image', sourcePath: '/town/characters/Premade_Character_48x48_02.png', label: 'Image', tint: 0xf472b6 },
  { agentId: 'specialist-n8n', key: 'char_n8n', sourcePath: '/town/characters/Premade_Character_48x48_06.png', label: 'n8n', tint: 0xfb923c },
  { agentId: 'specialist-engineering', key: 'char_engineering', sourcePath: '/town/characters/Premade_Character_48x48_01.png', label: 'Engineering', tint: 0x60a5fa },
]
```

Note: Each specialist gets a unique `key` so Phaser can address them independently even though multiple share the same source PNG. The PNG is loaded once per key via `this.load.image(key, sourcePath)` in the scene's `preload()`.

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/components/town/game/config/animations.ts`

- [ ] **Step 3: Commit**

```bash
git add src/components/town/game/config/animations.ts
git commit -m "feat(nerve-center): add specialist sprite configs with tint colors"
```

---

## Task 4: Agent Entity

**Files:**
- Create: `src/components/town/game/entities/Agent.ts`

This is the core entity — handles walk-graph BFS pathfinding, emote display, idle wandering, and break room migration. Inspired by Worker.ts but purpose-built for the new scene.

> **Deferred:** BotStateStore position persistence is NOT implemented in Tier A. Agents always start at home room seats on page reload. BotStateStore integration (serialize/restore position, path, work state) will be added as a Tier B enhancement when the player character is introduced.

- [ ] **Step 1: Create Agent.ts with walk-graph BFS and core behavior**

```typescript
// src/components/town/game/entities/Agent.ts

import * as Phaser from 'phaser'
import { makeAnims, FRAME_WIDTH, FRAME_HEIGHT, MOVE_SPEED, type Direction } from '../config/animations'
import { EMOTE_SHEET_KEY, EMOTE_FRAMES } from '../config/emotes'
import {
  ARRIVE_THRESHOLD, WORKER_SPEED_FACTOR, WANDER_MIN_DELAY, WANDER_MAX_DELAY,
  BODY_SIZE_RATIO_W, BODY_SIZE_RATIO_H, BODY_OFFSET_RATIO_X, BODY_OFFSET_RATIO_Y,
  EMOTE_Y_OFFSET, BUBBLE_Y_OFFSET,
} from '@/lib/town/constants'
import type { SeatStatus } from '@/lib/town/events'
import { WORK_STATE_EMOTES, IDLE_TIMEOUT_MS } from '@/lib/gateway-view/constants'
import type { WorkState } from '@/lib/gateway-view/types'

// ── Walk graph BFS types ──

export interface WalkNode {
  x: number
  y: number
  roomId?: string
}

export interface WalkGraphData {
  nodes: Record<string, WalkNode>
  edges: [string, string][]
}

interface PathStep { x: number; y: number }

/** BFS on walk graph to find shortest path between two nodes. */
function bfsPath(graph: WalkGraphData, fromId: string, toId: string): PathStep[] | null {
  if (fromId === toId) return [graph.nodes[fromId]]
  const adjacency = new Map<string, string[]>()
  for (const id of Object.keys(graph.nodes)) adjacency.set(id, [])
  for (const [a, b] of graph.edges) {
    adjacency.get(a)?.push(b)
    adjacency.get(b)?.push(a)
  }
  const visited = new Set<string>([fromId])
  const parent = new Map<string, string>()
  const queue = [fromId]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === toId) {
      // Reconstruct path
      const path: PathStep[] = []
      let node = toId
      while (node) {
        const n = graph.nodes[node]
        path.unshift({ x: n.x, y: n.y })
        node = parent.get(node)!
      }
      return path
    }
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        parent.set(neighbor, current)
        queue.push(neighbor)
      }
    }
  }
  return null // no path found
}

/** Find the walk graph node closest to a world position. */
function nearestNode(graph: WalkGraphData, x: number, y: number): string {
  let best = ''
  let bestDist = Infinity
  for (const [id, node] of Object.entries(graph.nodes)) {
    const d = (node.x - x) ** 2 + (node.y - y) ** 2
    if (d < bestDist) { bestDist = d; best = id }
  }
  return best
}

/** Find the walk graph node that belongs to a specific room. */
function roomNode(graph: WalkGraphData, roomId: string): string | null {
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (node.roomId === roomId) return id
  }
  return null
}

// ── Agent config ──

export interface AgentConfig {
  agentId: string
  spriteKey: string
  label: string
  homeRoomId: string
  startX: number
  startY: number
  facing: Direction
  tint?: number     // Phaser hex color for specialist differentiation
  isSpecialist: boolean
}

// ── Agent class ──

export class Agent {
  sprite: Phaser.Physics.Arcade.Sprite
  agentId: string
  label: string
  homeRoomId: string
  isSpecialist: boolean
  status: SeatStatus = 'empty'
  workState: WorkState = 'idle'
  currentRoomId: string | null = null

  private scene: Phaser.Scene
  private spriteKey: string
  private homeX: number
  private homeY: number
  private facing: Direction
  private walkGraph: WalkGraphData
  private path: PathStep[] = []
  private pathIdx = 0
  private wanderTimer: ReturnType<typeof setTimeout> | null = null
  private emoteSprite: Phaser.GameObjects.Sprite | null = null
  private bubbleText: Phaser.GameObjects.Text | null = null
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null
  private nameLabel: Phaser.GameObjects.Text
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private glowCircle: Phaser.GameObjects.Arc | null = null

  constructor(scene: Phaser.Scene, config: AgentConfig, walkGraph: WalkGraphData) {
    this.scene = scene
    this.agentId = config.agentId
    this.spriteKey = config.spriteKey
    this.label = config.label
    this.homeRoomId = config.homeRoomId
    this.homeX = config.startX
    this.homeY = config.startY
    this.facing = config.facing
    this.walkGraph = walkGraph
    this.isSpecialist = config.isSpecialist

    // Create animations
    const idleAnims = makeAnims(config.spriteKey, 'idle', 1, 8)
    const walkAnims = makeAnims(config.spriteKey, 'walk', 2, 10)
    for (const anim of [...idleAnims, ...walkAnims]) {
      if (scene.anims.exists(anim.key)) continue
      const frames: Phaser.Types.Animations.AnimationFrame[] = []
      for (let i = anim.start; i <= anim.end; i++) frames.push({ key: config.spriteKey, frame: i })
      scene.anims.create({ key: anim.key, frames, frameRate: anim.frameRate, repeat: anim.repeat })
    }

    // Create sprite
    this.sprite = scene.physics.add.sprite(config.startX, config.startY, config.spriteKey, 0)
    this.sprite.setDepth(5)
    if (config.tint) this.sprite.setTint(config.tint)

    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    body.setSize(FRAME_WIDTH * BODY_SIZE_RATIO_W, FRAME_HEIGHT * BODY_SIZE_RATIO_H)
    body.setOffset(FRAME_WIDTH * BODY_OFFSET_RATIO_X, FRAME_HEIGHT * BODY_OFFSET_RATIO_Y)
    this.sprite.anims.play(`${config.spriteKey}:idle-${config.facing}`)

    // Name label
    this.nameLabel = scene.add.text(config.startX, config.startY + FRAME_HEIGHT * 0.15, config.label, {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffffff',
      backgroundColor: 'rgba(0,0,0,0.6)', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 0).setDepth(15)

    // Pulse glow (hidden until running)
    this.glowCircle = scene.add.circle(config.startX, config.startY + 20, 18, 0xffffff, 0)
      .setDepth(1)

    this.currentRoomId = config.homeRoomId
    this.scheduleWander()
  }

  // ── Public API ──

  /** React to a task being assigned: walk to target room and show working state. */
  assignTask(targetRoomId: string, taskSnippet?: string): void {
    this.status = 'running'
    this.cancelWander()
    this.cancelIdleTimeout()

    // Show pulse glow
    if (this.glowCircle) {
      this.glowCircle.setAlpha(0.3)
      this.scene.tweens.add({
        targets: this.glowCircle, alpha: { from: 0.3, to: 0.1 },
        duration: 800, yoyo: true, repeat: -1,
      })
    }

    // Navigate to room
    this.navigateToRoom(targetRoomId)
    this.showEmote('emote:device')
    if (taskSnippet) this.showBubble(taskSnippet, 4000)
  }

  /** Task completed: show done emote, return to idle after delay. */
  completeTask(): void {
    this.status = 'done'
    this.showEmote('emote:star')
    this.showBubble('Done!', 3000)
    this.hideGlow()
    setTimeout(() => {
      this.status = 'empty'
      this.clearEmote()
      this.navigateToRoom(this.homeRoomId)
      this.scheduleIdleTimeout()
    }, 4000)
  }

  /** Task failed: show fail emote, return to idle after delay. */
  failTask(): void {
    this.status = 'failed'
    this.showEmote('emote:angry')
    this.showBubble('Failed...', 3000)
    this.hideGlow()
    setTimeout(() => {
      this.status = 'empty'
      this.clearEmote()
      this.navigateToRoom(this.homeRoomId)
      this.scheduleIdleTimeout()
    }, 4000)
  }

  /** Update work state from telemetry event. */
  setWorkState(state: WorkState): void {
    this.workState = state
    const emoteKey = WORK_STATE_EMOTES[state]
    if (emoteKey) this.showEmote(emoteKey)
    else this.clearEmote()
  }

  /** Phaser update loop — call every frame. */
  update(): void {
    // Update positions of overlay elements
    if (this.emoteSprite) this.emoteSprite.setPosition(this.sprite.x, this.sprite.y - FRAME_HEIGHT * EMOTE_Y_OFFSET)
    if (this.bubbleText) this.bubbleText.setPosition(this.sprite.x, this.sprite.y - FRAME_HEIGHT * BUBBLE_Y_OFFSET)
    this.nameLabel.setPosition(this.sprite.x, this.sprite.y + FRAME_HEIGHT * 0.15)
    if (this.glowCircle) this.glowCircle.setPosition(this.sprite.x, this.sprite.y + 20)

    // Path following
    if (this.path.length === 0 || this.pathIdx >= this.path.length) {
      const body = this.sprite.body as Phaser.Physics.Arcade.Body
      body.setVelocity(0, 0)
      const idleKey = `${this.spriteKey}:idle-${this.facing}`
      if (this.sprite.anims.currentAnim?.key !== idleKey) this.sprite.anims.play(idleKey)
      return
    }

    const target = this.path[this.pathIdx]
    const dx = target.x - this.sprite.x
    const dy = target.y - this.sprite.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < ARRIVE_THRESHOLD) {
      this.pathIdx++
      if (this.pathIdx >= this.path.length) {
        this.path = []
        return
      }
      return
    }

    const speed = MOVE_SPEED * WORKER_SPEED_FACTOR
    const vx = (dx / dist) * speed
    const vy = (dy / dist) * speed
    const body = this.sprite.body as Phaser.Physics.Arcade.Body
    body.setVelocity(vx, vy)

    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx < 0 ? 'left' : 'right'
    else this.facing = dy < 0 ? 'up' : 'down'
    const walkKey = `${this.spriteKey}:walk-${this.facing}`
    if (this.sprite.anims.currentAnim?.key !== walkKey) this.sprite.anims.play(walkKey)
  }

  /** Navigate to break room when idle too long. Scene-local, does not change FleetStore. */
  migrateToBreakRoom(): void {
    if (this.status !== 'empty') return
    this.navigateToRoom('break-room')
    this.currentRoomId = 'break-room'
  }

  destroy(): void {
    this.cancelWander()
    this.cancelIdleTimeout()
    this.clearEmote()
    this.clearBubble()
    this.hideGlow()
    this.nameLabel.destroy()
    this.sprite.destroy()
  }

  // ── Private ──

  private navigateToRoom(roomId: string): void {
    const fromNodeId = nearestNode(this.walkGraph, this.sprite.x, this.sprite.y)
    const toNodeId = roomNode(this.walkGraph, roomId)
    if (!toNodeId) return

    const route = bfsPath(this.walkGraph, fromNodeId, toNodeId)
    if (route && route.length > 0) {
      this.path = route
      this.pathIdx = 0
      this.currentRoomId = roomId
    }
  }

  private scheduleWander(): void {
    if (this.status === 'running') return
    this.cancelWander()
    const delay = WANDER_MIN_DELAY + Math.random() * (WANDER_MAX_DELAY - WANDER_MIN_DELAY)
    this.wanderTimer = setTimeout(() => {
      if (this.status === 'running') return
      // Wander within current room bounds (random offset from current position)
      const offsetX = (Math.random() - 0.5) * 60
      const offsetY = (Math.random() - 0.5) * 40
      this.path = [{ x: this.sprite.x + offsetX, y: this.sprite.y + offsetY }]
      this.pathIdx = 0
      this.scheduleWander()
    }, delay)
  }

  private cancelWander(): void {
    if (this.wanderTimer) { clearTimeout(this.wanderTimer); this.wanderTimer = null }
  }

  private scheduleIdleTimeout(): void {
    this.cancelIdleTimeout()
    this.idleTimer = setTimeout(() => {
      if (this.status === 'empty') {
        this.migrateToBreakRoom()
      }
    }, IDLE_TIMEOUT_MS)
  }

  private cancelIdleTimeout(): void {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null }
  }

  private showEmote(emoteKey: string): void {
    this.clearEmote()
    const frameIdx = EMOTE_FRAMES[emoteKey] ?? 0
    this.emoteSprite = this.scene.add.sprite(
      this.sprite.x, this.sprite.y - FRAME_HEIGHT * EMOTE_Y_OFFSET,
      EMOTE_SHEET_KEY, frameIdx,
    ).setDepth(20).setScale(0.6)
  }

  private clearEmote(): void {
    if (this.emoteSprite) { this.emoteSprite.destroy(); this.emoteSprite = null }
  }

  private showBubble(text: string, ttl: number): void {
    this.clearBubble()
    this.bubbleText = this.scene.add.text(
      this.sprite.x, this.sprite.y - FRAME_HEIGHT * BUBBLE_Y_OFFSET, text,
      {
        fontFamily: 'monospace', fontSize: '11px', color: '#222',
        backgroundColor: '#fff', padding: { x: 6, y: 3 }, wordWrap: { width: 140 },
      },
    ).setOrigin(0.5, 1).setDepth(20)
    this.bubbleTimer = setTimeout(() => this.clearBubble(), ttl)
  }

  private clearBubble(): void {
    if (this.bubbleTimer) { clearTimeout(this.bubbleTimer); this.bubbleTimer = null }
    if (this.bubbleText) { this.bubbleText.destroy(); this.bubbleText = null }
  }

  private hideGlow(): void {
    if (this.glowCircle) {
      this.scene.tweens.killTweensOf(this.glowCircle)
      this.glowCircle.setAlpha(0)
    }
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit src/components/town/game/entities/Agent.ts`

- [ ] **Step 3: Commit**

```bash
git add src/components/town/game/entities/Agent.ts
git commit -m "feat(nerve-center): add Agent entity with BFS pathfinding and emote system"
```

---

## Task 5: NerveCenterScene

**Files:**
- Create: `src/components/town/game/scenes/NerveCenterScene.ts`

The main Phaser scene. Loads the map manifest, renders rooms as colored rectangles with labels, spawns all 12 agents, wires up event listeners, and manages the auto-follow camera.

- [ ] **Step 1: Create NerveCenterScene.ts**

```typescript
// src/components/town/game/scenes/NerveCenterScene.ts

import * as Phaser from 'phaser'
import { Agent, type AgentConfig, type WalkGraphData } from '../entities/Agent'
import { WORKER_SPRITES, SPECIALIST_SPRITES, FRAME_WIDTH, FRAME_HEIGHT } from '../config/animations'
import { EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, EMOTE_FRAME_SIZE } from '../config/emotes'
import { buildSpriteFrames } from '../utils/MapHelpers'
import { townEvents } from '@/lib/town/events'
import { gatewayEvents } from '@/lib/gateway-view/events'
import { getFleetStore } from '@/lib/town/fleet-store'
import { EVENT_TO_ROOM, EVENT_TO_WORK_STATE } from '@/lib/gateway-view/constants'
import { translateRoomId, AGENT_HOME_ROOM, ROOM_COLORS } from './room-id-map'
import {
  ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX, ZOOM_SENSITIVITY,
  CAMERA_LERP,
} from '@/lib/town/constants'
import type { TelemetryEvent } from '@/lib/gateway-view/types'

const MANIFEST_URL = '/town/gateway/nerve-center-map.logic.json'

// Room manifest types (parsed from JSON)
interface RoomManifestRoom {
  id: string
  label: string
  color: string
  bounds: [number, number, number, number]
  seats: Array<{ id: string; agentId: string; x: number; y: number }>
}
interface RoomManifest {
  meta: { version: string; canvas: { width: number; height: number } }
  rooms: RoomManifestRoom[]
  walkGraph: WalkGraphData
}

// Corridor rendering style
const CORRIDOR_COLOR = 0x252a3a
const CORRIDOR_ALPHA = 0.6
const CORRIDOR_WIDTH = 2

export class NerveCenterScene extends Phaser.Scene {
  private agents: Map<string, Agent> = new Map()
  private manifest: RoomManifest | null = null
  private manifestJson: string | null = null
  private roomGraphics: Phaser.GameObjects.Graphics | null = null
  private cameraTarget: { x: number; y: number } | null = null
  private eventCleanups: Array<() => void> = []
  private fleetUnsub: (() => void) | null = null
  private breakRoomAgents = new Set<string>()

  constructor() { super({ key: 'NerveCenterScene' }) }

  // ── Preload ──

  preload(): void {
    // Character sprites — generalists
    for (const ws of WORKER_SPRITES) {
      this.load.image(ws.key, ws.path)
    }
    // Character sprites — specialists (unique keys, may share source PNGs)
    // Phaser deduplicates loader requests by key, so no exists() check needed
    for (const ss of SPECIALIST_SPRITES) {
      this.load.image(ss.key, ss.sourcePath)
    }
    // Emotes
    this.load.spritesheet(EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, {
      frameWidth: EMOTE_FRAME_SIZE,
      frameHeight: EMOTE_FRAME_SIZE,
    })
    // Fetch room manifest
    fetch(MANIFEST_URL)
      .then(r => r.text())
      .then(text => { this.manifestJson = text })
      .catch(err => console.error('[NerveCenterScene] Failed to fetch manifest:', err))
  }

  // ── Create ──

  create(): void {
    // Parse manifest
    if (!this.manifestJson) {
      this.showError('Failed to load nerve center manifest')
      return
    }
    try {
      this.manifest = JSON.parse(this.manifestJson) as RoomManifest
    } catch (err) {
      this.showError(`Manifest parse error: ${(err as Error).message}`)
      return
    }

    // Build sprite frames for all character sheets
    for (const ws of WORKER_SPRITES) buildSpriteFrames(this, ws.key)
    for (const ss of SPECIALIST_SPRITES) buildSpriteFrames(this, ss.key)

    // Render rooms
    this.renderRooms()
    this.renderCorridors()

    // Spawn agents
    this.spawnAgents()

    // Wire events
    this.wireEvents()

    // Camera setup
    const cam = this.cameras.main
    cam.setZoom(ZOOM_DEFAULT)
    cam.centerOn(640, 360)

    // Mouse wheel zoom
    this.input.on('wheel', (_p: unknown, _gos: unknown, _dx: number, dy: number) => {
      const newZoom = Phaser.Math.Clamp(cam.zoom - dy * ZOOM_SENSITIVITY, ZOOM_MIN, ZOOM_MAX)
      cam.setZoom(newZoom)
    })

    // Click detection for rooms and agents
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const worldX = pointer.worldX
      const worldY = pointer.worldY
      this.handleClick(worldX, worldY)
    })

    gatewayEvents.emit('gateway-scene-ready')
  }

  // ── Update ──

  update(): void {
    for (const agent of this.agents.values()) {
      agent.update()
    }

    // Smooth camera follow
    if (this.cameraTarget) {
      const cam = this.cameras.main
      const cx = cam.scrollX + cam.width / (2 * cam.zoom)
      const cy = cam.scrollY + cam.height / (2 * cam.zoom)
      const newX = cx + (this.cameraTarget.x - cx) * CAMERA_LERP
      const newY = cy + (this.cameraTarget.y - cy) * CAMERA_LERP
      cam.centerOn(newX, newY)
    }
  }

  // ── Room rendering ──

  private renderRooms(): void {
    if (!this.manifest) return
    this.roomGraphics = this.add.graphics().setDepth(0)

    for (const room of this.manifest.rooms) {
      const [x, y, w, h] = room.bounds
      const color = parseInt(room.color.replace('#', ''), 16)

      // Room fill (dark, subtle)
      this.roomGraphics.fillStyle(color, 0.08)
      this.roomGraphics.fillRoundedRect(x, y, w, h, 12)

      // Room border
      this.roomGraphics.lineStyle(1.5, color, 0.4)
      this.roomGraphics.strokeRoundedRect(x, y, w, h, 12)

      // Room label
      this.add.text(x + w / 2, y + 16, room.label, {
        fontFamily: '"SF Mono", Consolas, monospace',
        fontSize: '11px',
        color: room.color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(2)
    }
  }

  private renderCorridors(): void {
    if (!this.manifest) return
    const g = this.add.graphics().setDepth(0)
    g.lineStyle(CORRIDOR_WIDTH, CORRIDOR_COLOR, CORRIDOR_ALPHA)

    const nodes = this.manifest.walkGraph.nodes
    for (const [a, b] of this.manifest.walkGraph.edges) {
      const na = nodes[a]
      const nb = nodes[b]
      if (!na || !nb) continue
      // Only draw corridors between nodes that are NOT both in rooms (i.e., corridor segments)
      if (!na.roomId || !nb.roomId || na.roomId !== nb.roomId) {
        g.lineBetween(na.x, na.y, nb.x, nb.y)
      }
    }
  }

  // ── Agent spawning ──

  private spawnAgents(): void {
    if (!this.manifest) return
    const walkGraph = this.manifest.walkGraph

    // Build seat lookup from manifest
    const seatLookup = new Map<string, { x: number; y: number; roomId: string }>()
    for (const room of this.manifest.rooms) {
      for (const seat of room.seats) {
        seatLookup.set(seat.agentId, { x: seat.x, y: seat.y, roomId: room.id })
      }
    }

    // Generalists (use WORKER_SPRITES for sprite keys)
    const generalistIds = ['gen-lifeforce', 'gen-industry', 'gen-fellowship', 'gen-essence']
    for (let i = 0; i < generalistIds.length; i++) {
      const agentId = generalistIds[i]
      const ws = WORKER_SPRITES[i]
      const seat = seatLookup.get(agentId)
      if (!seat || !ws) continue

      const config: AgentConfig = {
        agentId,
        spriteKey: ws.key,
        label: ws.label,
        homeRoomId: seat.roomId,
        startX: seat.x,
        startY: seat.y,
        facing: 'down',
        isSpecialist: false,
      }
      this.agents.set(agentId, new Agent(this, config, walkGraph))
    }

    // Specialists (use SPECIALIST_SPRITES for sprite keys + tints)
    for (const ss of SPECIALIST_SPRITES) {
      const seat = seatLookup.get(ss.agentId)
      if (!seat) continue

      const config: AgentConfig = {
        agentId: ss.agentId,
        spriteKey: ss.key,
        label: ss.label,
        homeRoomId: AGENT_HOME_ROOM[ss.agentId] ?? seat.roomId,
        startX: seat.x,
        startY: seat.y,
        facing: 'down',
        tint: ss.tint,
        isSpecialist: true,
      }
      const agent = new Agent(this, config, walkGraph)
      // Specialists default to hidden; shown when FleetStore reports active status.
      // This handles specialist-n8n (not in DEFAULT_AGENTS) correctly.
      agent.sprite.setVisible(false)
      this.agents.set(ss.agentId, agent)
    }
  }

  // ── Event wiring ──

  private wireEvents(): void {
    // Clean up previous listeners
    this.eventCleanups.forEach(fn => fn())
    this.eventCleanups = []

    const fleet = getFleetStore()

    // townEvents: task lifecycle
    this.eventCleanups.push(
      townEvents.on('task-assigned', (seatId, message) => {
        const agent = this.resolveAgent(seatId)
        if (agent) {
          agent.assignTask(agent.homeRoomId, message)
          this.cameraTarget = { x: agent.sprite.x, y: agent.sprite.y }
          this.breakRoomAgents.delete(agent.agentId)
        }
      }),
      townEvents.on('task-completed', (seatId) => {
        const agent = this.resolveAgent(seatId)
        if (agent) {
          agent.completeTask()
          this.cameraTarget = { x: agent.sprite.x, y: agent.sprite.y }
        }
      }),
      townEvents.on('task-failed', (seatId) => {
        const agent = this.resolveAgent(seatId)
        if (agent) {
          agent.failTask()
          this.cameraTarget = { x: agent.sprite.x, y: agent.sprite.y }
        }
      }),
    )

    // gatewayEvents: telemetry routing
    this.eventCleanups.push(
      gatewayEvents.on('telemetry-event', (event: TelemetryEvent) => {
        const oldRoomId = EVENT_TO_ROOM[event.type]
        if (!oldRoomId) return
        const newRoomId = translateRoomId(oldRoomId)
        const workState = EVENT_TO_WORK_STATE[event.type]

        // Route to the first available agent (round-robin across agents in the target room)
        const roomAgents = [...this.agents.values()].filter(a => a.homeRoomId === newRoomId || a.currentRoomId === newRoomId)
        if (roomAgents.length > 0) {
          const agent = roomAgents[0]
          agent.assignTask(newRoomId)
          agent.setWorkState(workState)
          this.cameraTarget = { x: agent.sprite.x, y: agent.sprite.y }
        }
      }),
    )

    // FleetStore subscription: sync agent visibility for specialists
    this.fleetUnsub = fleet.subscribe(() => {
      const snapshot = fleet.getSnapshot()
      for (const fleetAgent of snapshot.agents) {
        const agent = this.agents.get(fleetAgent.id)
        if (!agent) continue
        // Sync status from FleetStore for specialist visibility
        if (agent.isSpecialist) {
          agent.sprite.setVisible(fleetAgent.status !== 'empty')
        }
      }
    })
  }

  // ── Click handling ──

  private handleClick(worldX: number, worldY: number): void {
    if (!this.manifest) return

    // Check if clicking on an agent
    for (const agent of this.agents.values()) {
      const dx = worldX - agent.sprite.x
      const dy = worldY - agent.sprite.y
      if (Math.abs(dx) < FRAME_WIDTH / 2 && Math.abs(dy) < FRAME_HEIGHT / 2) {
        this.showAgentTooltip(agent)
        return
      }
    }

    // Check if clicking on a room
    for (const room of this.manifest.rooms) {
      const [rx, ry, rw, rh] = room.bounds
      if (worldX >= rx && worldX <= rx + rw && worldY >= ry && worldY <= ry + rh) {
        this.showRoomTooltip(room)
        return
      }
    }
  }

  private showAgentTooltip(agent: Agent): void {
    const fleet = getFleetStore().getSnapshot()
    const fleetAgent = fleet.agents.find(a => a.id === agent.agentId)
    const text = [
      agent.label,
      `Status: ${fleetAgent?.status ?? agent.status}`,
      fleetAgent?.currentTask ? `Task: ${fleetAgent.currentTask}` : '',
    ].filter(Boolean).join('\n')

    this.showTooltip(agent.sprite.x, agent.sprite.y - FRAME_HEIGHT, text)
  }

  private showRoomTooltip(room: RoomManifestRoom): void {
    const [x, y, w] = room.bounds
    const roomAgents = [...this.agents.values()].filter(a => a.currentRoomId === room.id)
    const text = [
      room.label,
      `Agents: ${roomAgents.length > 0 ? roomAgents.map(a => a.label).join(', ') : 'none'}`,
    ].join('\n')

    this.showTooltip(x + w / 2, y - 10, text)
  }

  private tooltipText: Phaser.GameObjects.Text | null = null
  private tooltipTimer: ReturnType<typeof setTimeout> | null = null

  private showTooltip(x: number, y: number, text: string): void {
    if (this.tooltipTimer) clearTimeout(this.tooltipTimer)
    if (this.tooltipText) this.tooltipText.destroy()

    this.tooltipText = this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: '11px', color: '#e6edf3',
      backgroundColor: 'rgba(22, 27, 34, 0.95)',
      padding: { x: 8, y: 6 },
      lineSpacing: 4,
    }).setOrigin(0.5, 1).setDepth(50)

    this.tooltipTimer = setTimeout(() => {
      if (this.tooltipText) { this.tooltipText.destroy(); this.tooltipText = null }
    }, 4000)
  }

  // ── Helpers ──

  private resolveAgent(seatId: string): Agent | undefined {
    // Direct agentId match
    if (this.agents.has(seatId)) return this.agents.get(seatId)
    // seat-N → generalist
    const match = seatId.match(/seat-(\d+)/)
    if (match) {
      const idx = parseInt(match[1], 10)
      const ids = ['gen-lifeforce', 'gen-industry', 'gen-fellowship', 'gen-essence']
      if (idx < ids.length) return this.agents.get(ids[idx])
    }
    return undefined
  }

  private showError(message: string): void {
    this.add.text(640, 360, message, {
      fontFamily: 'monospace', fontSize: '14px', color: '#ff6b6b',
      backgroundColor: 'rgba(30, 10, 10, 0.9)',
      padding: { x: 12, y: 8 }, align: 'center',
    }).setOrigin(0.5)
    gatewayEvents.emit('gateway-scene-error', message)
  }

  shutdown(): void {
    this.eventCleanups.forEach(fn => fn())
    this.eventCleanups = []
    if (this.fleetUnsub) { this.fleetUnsub(); this.fleetUnsub = null }
    for (const agent of this.agents.values()) agent.destroy()
    this.agents.clear()
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit src/components/town/game/scenes/NerveCenterScene.ts`

- [ ] **Step 3: Commit**

```bash
git add src/components/town/game/scenes/NerveCenterScene.ts
git commit -m "feat(nerve-center): add NerveCenterScene with 10 rooms, 12 agents, and event wiring"
```

---

## Task 6: Wire NerveCenterScene into Game Config

**Files:**
- Modify: `src/components/town/game/config.ts`

- [ ] **Step 1: Replace NerveScene with NerveCenterScene**

Change the import and scene array:

```typescript
// Before:
import { NerveScene } from './scenes/NerveScene'
// ...
scene: [NerveScene],

// After:
import { NerveCenterScene } from './scenes/NerveCenterScene'
// ...
scene: [NerveCenterScene],
```

- [ ] **Step 2: Verify the config compiles**

Run: `npx tsc --noEmit src/components/town/game/config.ts`

- [ ] **Step 3: Commit**

```bash
git add src/components/town/game/config.ts
git commit -m "feat(nerve-center): switch game config to NerveCenterScene"
```

---

## Task 7: Update NerveCenterView (React Mount + Overlays)

**Files:**
- Modify: `src/components/views/NerveCenterView.tsx`

Replace the CSS grid with PhaserGame mount + overlay components for status bar and activity feed.

- [ ] **Step 1: Read the current NerveCenterView.tsx**

Read the full file to understand its structure before modifying.

- [ ] **Step 2: Replace the view with Phaser mount + overlays**

The new NerveCenterView renders:
1. `<PhaserGame />` — full-size Phaser canvas
2. A semi-transparent status bar at the bottom (agent count, active tasks, gateway status)
3. A collapsible activity feed panel on the right edge
4. The existing `TaskAssignModal` (already inline-styled from previous fix)

Replace the entire component body. Keep the `useFleet()` hook for status bar / activity feed data. Remove the CSS grid rooms rendering, but keep the TaskAssignModal function.

Key changes:
- Remove the `ROOMS` array and room-card rendering
- Remove the styled-jsx grid layout
- Import and render `PhaserGame`
- Add status bar overlay (positioned absolute, bottom)
- Add activity feed overlay (positioned absolute, right, collapsible)
- Keep `TaskAssignModal` with its inline styles

- [ ] **Step 3: Verify it compiles and renders**

Run: `npx next build` (or check via dev server at localhost:3000)
Navigate to Nerve Center view — should show the Phaser canvas with rooms and agents.

- [ ] **Step 4: Commit**

```bash
git add src/components/views/NerveCenterView.tsx
git commit -m "feat(nerve-center): replace CSS grid with Phaser pixel-art scene + overlays"
```

---

## Task 8: Integration Testing & Verification

- [ ] **Step 1: Start dev server and verify visually**

Run: `npm run dev`
Navigate to `http://localhost:3000` → Nerve Center view.

Verify:
- 10 rooms render as colored rounded rectangles with labels
- 4 generalist agents visible at their home positions (character sprites with walking idle animation)
- Specialist agents visible only when active (check FleetStore state)
- Room labels match new names (Vitality Lab, Task Forge, etc.)
- Corridor lines visible between rooms
- Mouse wheel zooms in/out
- Clicking a room shows tooltip with room name and agents
- Clicking an agent shows tooltip with name and status

- [ ] **Step 2: Test task lifecycle**

In the browser console:
```javascript
// Import townEvents
const { townEvents } = await import('/src/lib/town/events.ts')

// Assign a task to gen-industry
townEvents.emit('task-assigned', 'seat-1', 'Build the dashboard widget')
// → gen-industry should show emote + bubble, camera follows

// Wait 5 seconds, then complete
setTimeout(() => townEvents.emit('task-completed', 'seat-1'), 5000)
// → gen-industry shows star emote, then returns to idle
```

- [ ] **Step 3: Test break room migration**

Wait 30+ seconds with no tasks assigned. Agents should walk to the break room.
Assign a task → agent should leave break room and walk to target room.

- [ ] **Step 4: Verify existing functionality preserved**

- TaskAssignModal still opens when triggered
- Activity feed shows live entries
- Status bar shows agent count and gateway status
- SSE updates from `/api/events/stream` still update agent state

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(nerve-center): integration fixes from visual testing"
```

---

## Task Summary

| Task | Description | Est. |
|------|------------|------|
| 1 | Room ID translation map | 5 min |
| 2 | Map manifest JSON (10 rooms + walk graph) | 15 min |
| 3 | Specialist sprite configuration | 5 min |
| 4 | Agent entity (BFS, emotes, wandering, break room) | 30 min |
| 5 | NerveCenterScene (room rendering, agent spawning, events) | 30 min |
| 6 | Wire into game config | 2 min |
| 7 | Update NerveCenterView (React mount + overlays) | 20 min |
| 8 | Integration testing & verification | 15 min |
