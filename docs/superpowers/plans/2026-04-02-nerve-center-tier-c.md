# Nerve Center Tier C — Full Game-Like Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add speech bubbles, room-aware idle animations, dynamic furniture, agent mood system, and day/night ambient tinting to the Nerve Center Phaser scene.

**Architecture:** All Tier C features layer onto existing Agent.ts and NerveCenterScene.ts. New config files keep room behaviors and mood rules separate from core logic. No new dependencies — all visuals use Phaser Graphics/Text/Tween primitives already in use.

**Tech Stack:** Phaser 3 (Graphics, Tweens, Text), TypeScript, existing emote spritesheet

---

### Task C-1: Enhanced Speech Bubbles

**Files:**
- Modify: `src/components/town/game/entities/Agent.ts` (showBubble/clearBubble methods, lines 493-514)
- Modify: `src/components/town/game/scenes/NerveCenterScene.ts` (wireEvents, lines 425-506)

**Goal:** Show truncated current task text above agents as styled speech bubbles (not just emote icons). Auto-dismiss after 5s. Show on task assignment and when FleetStore reports a currentTask.

- [ ] **Step 1: Upgrade showBubble() in Agent.ts**

Replace the plain white text bubble with a styled speech bubble that has:
- Dark background (`rgba(15, 23, 42, 0.92)`) with light text (`#e2e8f0`)
- Rounded padding, max 120px word wrap
- Truncate text to 40 chars with ellipsis
- Add a small triangle pointer underneath (Graphics object)
- Increase default TTL from 4000ms to 5000ms

```typescript
// In Agent.ts showBubble():
private showBubble(text: string, ttl = 5000): void {
  this.clearBubble()
  const truncated = text.length > 40 ? text.slice(0, 37) + '...' : text
  // Background container
  this.bubbleBg = this.scene.add.graphics()
  this.bubbleBg.setDepth(20)
  // Text
  this.bubbleText = this.scene.add.text(
    this.sprite.x, this.sprite.y - FRAME_HEIGHT * BUBBLE_Y_OFFSET,
    truncated,
    { fontFamily: 'monospace', fontSize: '9px', color: '#e2e8f0',
      padding: { x: 6, y: 4 }, wordWrap: { width: 120 } }
  ).setOrigin(0.5, 1).setDepth(21)
  // Draw bg + pointer behind text
  this.updateBubbleBg()
  this.bubbleTimer = setTimeout(() => this.clearBubble(), ttl)
}
```

- [ ] **Step 2: Add bubble background drawing helper**

```typescript
private updateBubbleBg(): void {
  if (!this.bubbleBg || !this.bubbleText) return
  this.bubbleBg.clear()
  const b = this.bubbleText.getBounds()
  const pad = 4
  // Rounded rect
  this.bubbleBg.fillStyle(0x0f172a, 0.92)
  this.bubbleBg.fillRoundedRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2, 4)
  // Pointer triangle
  const cx = b.x + b.width / 2
  const bottom = b.y + b.height + pad
  this.bubbleBg.fillTriangle(cx - 4, bottom, cx + 4, bottom, cx, bottom + 6)
}
```

- [ ] **Step 3: Update clearBubble() to also destroy bubbleBg**

- [ ] **Step 4: Update update() to reposition bubbleBg alongside bubbleText**

- [ ] **Step 5: Wire FleetStore currentTask to speech bubbles in NerveCenterScene**

In the FleetStore subscription (wireEvents), when a fleet agent has a `currentTask` string and the scene agent doesn't have an active bubble, show the task text:

```typescript
if (fleetAgent.currentTask && agent.sprite.visible && !agent.hasBubble()) {
  agent.showTaskBubble(fleetAgent.currentTask)
}
```

- [ ] **Step 6: Commit**

```
git commit -m "feat(nerve-center): enhanced speech bubbles with task text (Tier C)"
```

---

### Task C-2: Room-Aware Idle Animations

**Files:**
- Create: `src/components/town/game/config/room-behaviors.ts`
- Modify: `src/components/town/game/entities/Agent.ts` (scheduleWander, lines 418-441)

**Goal:** Agents perform room-specific idle behaviors instead of generic wandering. Task Forge: typing emote cycle. Research Lab: thinking emote. Break Room: sleep emote + no wander. Vitality Lab: device emote. Other rooms: default wander.

- [ ] **Step 1: Create room-behaviors.ts config**

```typescript
export interface RoomBehavior {
  wanderEnabled: boolean
  wanderSpeed: number       // multiplier (1.0 = normal, 0.5 = slow)
  idleEmotes: string[]      // cycle through these emotes
  emoteCycleMs: number      // how often to change emote
  idleBubbles: string[]     // random idle chat bubbles
}

export const ROOM_BEHAVIORS: Record<string, RoomBehavior> = {
  'task-forge':    { wanderEnabled: true,  wanderSpeed: 1.0, idleEmotes: ['emote:device'], emoteCycleMs: 8000, idleBubbles: ['Coding...', 'Building...', 'Shipping...'] },
  'research-lab':  { wanderEnabled: true,  wanderSpeed: 0.7, idleEmotes: ['emote:thinking', 'emote:idea'], emoteCycleMs: 10000, idleBubbles: ['Researching...', 'Interesting...', 'Hmm...'] },
  'break-room':    { wanderEnabled: false, wanderSpeed: 0,   idleEmotes: ['emote:sleep'], emoteCycleMs: 15000, idleBubbles: ['Zzz...', '*stretches*', '*coffee*'] },
  'vitality-lab':  { wanderEnabled: true,  wanderSpeed: 0.8, idleEmotes: ['emote:device', 'emote:heart'], emoteCycleMs: 12000, idleBubbles: ['Checking vitals...', 'Heart rate good!'] },
  'writing-room':  { wanderEnabled: true,  wanderSpeed: 0.6, idleEmotes: ['emote:idea', 'emote:thinking'], emoteCycleMs: 10000, idleBubbles: ['Writing...', 'Editing...', 'Drafting...'] },
  'commons':       { wanderEnabled: true,  wanderSpeed: 1.0, idleEmotes: ['emote:happy', 'emote:music'], emoteCycleMs: 8000, idleBubbles: ['Connecting...', 'Hey there!'] },
  'media-studio':  { wanderEnabled: true,  wanderSpeed: 0.8, idleEmotes: ['emote:star', 'emote:device'], emoteCycleMs: 9000, idleBubbles: ['Rendering...', 'Composing...'] },
  'automations':   { wanderEnabled: true,  wanderSpeed: 0.9, idleEmotes: ['emote:device', 'emote:exclaim'], emoteCycleMs: 7000, idleBubbles: ['Automating...', 'Running flows...'] },
  'soul-workshop': { wanderEnabled: true,  wanderSpeed: 0.5, idleEmotes: ['emote:heart', 'emote:music'], emoteCycleMs: 12000, idleBubbles: ['Reflecting...', 'Finding meaning...'] },
  'command-hub':   { wanderEnabled: true,  wanderSpeed: 1.0, idleEmotes: ['emote:exclaim'], emoteCycleMs: 10000, idleBubbles: ['Coordinating...', 'Status check...'] },
}

export const DEFAULT_BEHAVIOR: RoomBehavior = {
  wanderEnabled: true, wanderSpeed: 1.0, idleEmotes: [], emoteCycleMs: 10000, idleBubbles: [],
}
```

- [ ] **Step 2: Add idle emote cycling to Agent.ts**

New private property `idleEmoteCycleTimer`. In `scheduleWander()`, also start an emote cycle timer that periodically shows room-appropriate emotes:

```typescript
private startIdleEmoteCycle(): void {
  this.stopIdleEmoteCycle()
  const behavior = ROOM_BEHAVIORS[this.currentRoomId ?? ''] ?? DEFAULT_BEHAVIOR
  if (behavior.idleEmotes.length === 0) return
  this.idleEmoteCycleTimer = setInterval(() => {
    if (this.status !== 'empty') return
    const emote = behavior.idleEmotes[Math.floor(Math.random() * behavior.idleEmotes.length)]
    this.showEmote(emote)
    // Occasionally show idle bubble
    if (behavior.idleBubbles.length > 0 && Math.random() < 0.3) {
      const bubble = behavior.idleBubbles[Math.floor(Math.random() * behavior.idleBubbles.length)]
      this.showBubble(bubble, 3000)
    }
  }, behavior.emoteCycleMs)
}
```

- [ ] **Step 3: Modify scheduleWander() to respect room behavior**

Check `ROOM_BEHAVIORS[this.currentRoomId]` — if `wanderEnabled` is false, skip scheduling wander movement. Apply `wanderSpeed` multiplier to wander offset range.

- [ ] **Step 4: Start/stop emote cycle on room transitions**

When `currentRoomId` changes (in `assignTask`, `completeTask`, `failTask`, `migrateToBreakRoom`), restart the idle emote cycle for the new room.

- [ ] **Step 5: Commit**

```
git commit -m "feat(nerve-center): room-aware idle animations with emote cycling (Tier C)"
```

---

### Task C-3: Dynamic Furniture

**Files:**
- Modify: `src/components/town/game/scenes/NerveCenterScene.ts` (renderRooms, wireEvents)

**Goal:** Draw desk/furniture graphics in each room that change appearance based on workload. Clean desks (0-1 active tasks), busy desks with paper stacks (2-4 tasks), overloaded with red warning glow (5+ tasks).

- [ ] **Step 1: Add room furniture data structure**

```typescript
interface RoomFurniture {
  roomId: string
  desks: Phaser.GameObjects.Graphics
  papers: Phaser.GameObjects.Graphics | null
  warningGlow: Phaser.GameObjects.Graphics | null
  warningTween: Phaser.Tweens.Tween | null
}
```

Track as `private roomFurniture = new Map<string, RoomFurniture>()`

- [ ] **Step 2: Draw base desks in renderRooms()**

For each room with seats, draw small desk rectangles (20x12px) at seat positions, offset down by 24px (below agent sprite). Color matches room color at 0.3 alpha.

```typescript
for (const seat of room.seats) {
  const deskGfx = this.add.graphics()
  deskGfx.fillStyle(colorHex, 0.3)
  deskGfx.fillRoundedRect(seat.x - 10, seat.y + 24, 20, 12, 2)
  deskGfx.setDepth(2)
}
```

- [ ] **Step 3: Add updateRoomWorkload() method**

Count active agents per room. Update furniture visuals:
- 0-1: clean desks only
- 2-4: add paper stack graphics (small rectangles offset on desks)
- 5+: red warning glow pulsing behind room

```typescript
private updateRoomWorkload(): void {
  for (const room of this.manifest.rooms) {
    const activeCount = this.agents.filter(
      a => a.sprite.visible && a.currentRoomId === room.id && a.status === 'running'
    ).length
    const furniture = this.roomFurniture.get(room.id)
    if (!furniture) continue

    // Papers
    if (activeCount >= 2 && !furniture.papers) {
      furniture.papers = this.add.graphics()
      // draw paper stacks...
    } else if (activeCount < 2 && furniture.papers) {
      furniture.papers.destroy()
      furniture.papers = null
    }

    // Warning glow for overloaded
    if (activeCount >= 5 && !furniture.warningGlow) {
      // red pulsing border
    } else if (activeCount < 5 && furniture.warningGlow) {
      furniture.warningTween?.stop()
      furniture.warningGlow.destroy()
      furniture.warningGlow = null
      furniture.warningTween = null
    }
  }
}
```

- [ ] **Step 4: Call updateRoomWorkload() on agent state changes**

Hook into task-assigned, task-completed, task-failed, and FleetStore subscription to call `updateRoomWorkload()`.

- [ ] **Step 5: Commit**

```
git commit -m "feat(nerve-center): dynamic furniture reacts to room workload (Tier C)"
```

---

### Task C-4: Agent Mood System

**Files:**
- Create: `src/components/town/game/config/mood.ts`
- Modify: `src/components/town/game/entities/Agent.ts`

**Goal:** Agents show visual mood based on their state. Happy (completing tasks): green tint + slight bounce. Stressed (many tasks queued): red tint + faster walk. Sleeping (idle in Break Room): zzz emote + no movement.

- [ ] **Step 1: Create mood.ts config**

```typescript
export type AgentMood = 'neutral' | 'happy' | 'stressed' | 'sleeping'

export interface MoodVisuals {
  tintColor: number | null   // null = no extra tint
  speedMultiplier: number
  bounceAmplitude: number    // 0 = no bounce
  emote: string | null
}

export const MOOD_VISUALS: Record<AgentMood, MoodVisuals> = {
  neutral:  { tintColor: null,     speedMultiplier: 1.0, bounceAmplitude: 0, emote: null },
  happy:    { tintColor: 0x88ffaa, speedMultiplier: 1.0, bounceAmplitude: 2, emote: 'emote:happy' },
  stressed: { tintColor: 0xff8888, speedMultiplier: 1.3, bounceAmplitude: 0, emote: 'emote:sweat' },
  sleeping: { tintColor: null,     speedMultiplier: 0,   bounceAmplitude: 0, emote: 'emote:sleep' },
}
```

- [ ] **Step 2: Add mood tracking to Agent.ts**

New properties:
- `mood: AgentMood = 'neutral'`
- `moodBounceOffset = 0` (for y-axis bounce)
- `baseTint: number | undefined` (original config tint)

New method `updateMood()` called periodically:
```typescript
updateMood(): void {
  if (this.currentRoomId === 'break-room' && this.status === 'empty') {
    this.setMood('sleeping')
  } else if (this.status === 'running') {
    // Check if agent has been running for a while (stressed) or just started (neutral)
    this.setMood('neutral')
  } else if (this.status === 'done') {
    this.setMood('happy')
  } else {
    this.setMood('neutral')
  }
}
```

- [ ] **Step 3: Implement setMood() with visual effects**

```typescript
private setMood(mood: AgentMood): void {
  if (this.mood === mood) return
  this.mood = mood
  const visuals = MOOD_VISUALS[mood]

  // Apply tint (combine with base tint if any)
  if (visuals.tintColor) {
    this.sprite.setTint(visuals.tintColor)
  } else if (this.baseTint !== undefined) {
    this.sprite.setTint(this.baseTint)
  } else {
    this.sprite.clearTint()
  }

  // Show mood emote (only if not already showing a task emote)
  if (visuals.emote && this.workState === 'idle') {
    this.showEmote(visuals.emote)
  }
}
```

- [ ] **Step 4: Apply speed multiplier in update() path following**

In the path-following section of update(), multiply speed by `MOOD_VISUALS[this.mood].speedMultiplier`.

- [ ] **Step 5: Add bounce effect for happy mood**

In update(), if `MOOD_VISUALS[this.mood].bounceAmplitude > 0`, apply a small sine-wave y offset to the sprite position.

- [ ] **Step 6: Trigger mood updates on state changes**

Call `updateMood()` in `assignTask()`, `completeTask()`, `failTask()`, `migrateToBreakRoom()`, and periodically in `update()` (every 60 frames).

- [ ] **Step 7: Commit**

```
git commit -m "feat(nerve-center): agent mood system with visual tints and behaviors (Tier C)"
```

---

### Task C-5: Day/Night Ambient Tinting

**Files:**
- Modify: `src/components/town/game/scenes/NerveCenterScene.ts` (create method + update)

**Goal:** Subtle ambient color overlay that shifts based on system clock. Morning = warm, afternoon = neutral, evening = orange, night = blue.

- [ ] **Step 1: Add ambient overlay in create()**

```typescript
// After renderRooms, before spawnAgents
this.ambientOverlay = this.add.graphics()
this.ambientOverlay.setDepth(0.5) // Between bg (0) and rooms (1)
this.updateAmbientTint()

// Update every 60s
this.ambientTimer = setInterval(() => this.updateAmbientTint(), 60000)
```

- [ ] **Step 2: Implement updateAmbientTint()**

```typescript
private updateAmbientTint(): void {
  if (!this.ambientOverlay) return
  const hour = new Date().getHours()
  let color: number, alpha: number

  if (hour >= 6 && hour < 10) {
    color = 0xffd700; alpha = 0.04  // morning gold
  } else if (hour >= 10 && hour < 16) {
    color = 0xffffff; alpha = 0.0   // midday — no tint
  } else if (hour >= 16 && hour < 20) {
    color = 0xff8c00; alpha = 0.05  // evening amber
  } else {
    color = 0x4466aa; alpha = 0.08  // night blue
  }

  this.ambientOverlay.clear()
  if (alpha > 0) {
    const { width, height } = this.manifest.meta.canvas
    this.ambientOverlay.fillStyle(color, alpha)
    this.ambientOverlay.fillRect(0, 0, width, height)
  }
}
```

- [ ] **Step 3: Clean up timer in shutdown()**

- [ ] **Step 4: Commit**

```
git commit -m "feat(nerve-center): day/night ambient tinting based on system clock (Tier C)"
```

---

### Task C-6: Integration Verification

**Files:**
- All modified files from C-1 through C-5

**Goal:** Verify all Tier C features work together, fix any conflicts, take Playwright screenshots.

- [ ] **Step 1: Verify speech bubbles display on task assignment**
- [ ] **Step 2: Verify room-specific emote cycling works**
- [ ] **Step 3: Verify furniture updates with workload changes**
- [ ] **Step 4: Verify mood tints apply correctly**
- [ ] **Step 5: Verify day/night overlay renders**
- [ ] **Step 6: Run TypeScript compilation check**
- [ ] **Step 7: Final commit if any fixes needed**
