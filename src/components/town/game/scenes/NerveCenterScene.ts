/**
 * NerveCenterScene — pixel-art Phaser scene for the redesigned Nerve Center.
 *
 * Renders 10 rooms, spawns 13 agents (4 generalists + 9 specialists),
 * wires town/gateway events, and manages the camera.
 *
 * Rooms are drawn as colored rounded rectangles from a manifest JSON.
 * Agents use BFS pathfinding on the walk graph to navigate between rooms.
 * Specialist sprites start hidden and become visible when FleetStore reports
 * their status as non-empty.
 */

import * as Phaser from 'phaser'
import { Agent, type AgentConfig, type WalkGraphData } from '../entities/Agent'
import { FRAME_WIDTH, FRAME_HEIGHT, WORKER_SPRITES, SPECIALIST_SPRITES } from '../config/animations'
import { EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, EMOTE_FRAME_SIZE } from '../config/emotes'
import { buildSpriteFrames } from '../utils/MapHelpers'
import { translateRoomId, AGENT_HOME_ROOM } from './room-id-map'
import { townEvents, type SeatStatus } from '@/lib/town/events'
import { gatewayEvents } from '@/lib/gateway-view/events'
import { getFleetStore } from '@/lib/town/fleet-store'
import { EVENT_TO_ROOM, EVENT_TO_WORK_STATE } from '@/lib/gateway-view/constants'
import { ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX, ZOOM_SENSITIVITY, CAMERA_LERP } from '@/lib/town/constants'
import type { TelemetryEvent } from '@/lib/gateway-view/types'

// ---------------------------------------------------------------------------
// Manifest shape (nerve-center-map.logic.json v3)
// ---------------------------------------------------------------------------

interface ManifestSeat {
  id: string
  agentId: string
  x: number
  y: number
}

interface ManifestRoom {
  id: string
  label: string
  color: string
  bounds: [number, number, number, number]
  seats: ManifestSeat[]
}

interface ManifestMeta {
  version: string
  schema: string
  canvas: { width: number; height: number }
}

interface NerveCenterManifest {
  meta: ManifestMeta
  rooms: ManifestRoom[]
  walkGraph: WalkGraphData
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIFEST_URL = '/town/gateway/nerve-center-map.logic.json'
const TOOLTIP_TTL = 4000
const GENERALIST_IDS = ['gen-lifeforce', 'gen-industry', 'gen-fellowship', 'gen-essence']

// ---------------------------------------------------------------------------
// NerveCenterScene
// ---------------------------------------------------------------------------

export class NerveCenterScene extends Phaser.Scene {
  private manifest!: NerveCenterManifest
  private manifestJson: string | null = null
  private agents: Agent[] = []
  private agentMap = new Map<string, Agent>()

  private cameraTarget: { x: number; y: number } | null = null
  private tooltip: Phaser.GameObjects.Text | null = null
  private tooltipTimer: ReturnType<typeof setTimeout> | null = null
  private eventCleanups: Array<() => void> = []

  constructor() {
    super({ key: 'NerveCenterScene' })
  }

  // ── preload ──────────────────────────────────────────────────────────────

  preload(): void {
    // Generalist sprites
    for (const ws of WORKER_SPRITES) {
      this.load.image(ws.key, ws.path)
    }

    // Specialist sprites
    for (const ss of SPECIALIST_SPRITES) {
      this.load.image(ss.key, ss.sourcePath)
    }

    // Emote spritesheet
    this.load.spritesheet(EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, {
      frameWidth: EMOTE_FRAME_SIZE,
      frameHeight: EMOTE_FRAME_SIZE,
    })

    // Fetch manifest JSON (outside Phaser loader to avoid type mismatch)
    fetch(MANIFEST_URL)
      .then(r => r.text())
      .then(text => { this.manifestJson = text })
      .catch(err => { console.error('[NerveCenterScene] Failed to fetch manifest:', err) })
  }

  // ── create ───────────────────────────────────────────────────────────────

  create(): void {
    // 1. Parse manifest
    if (!this.manifestJson) {
      console.error('[NerveCenterScene] Manifest not loaded')
      gatewayEvents.emit('gateway-scene-error', 'Failed to load nerve-center manifest')
      return
    }

    try {
      this.manifest = JSON.parse(this.manifestJson) as NerveCenterManifest
    } catch (err) {
      console.error('[NerveCenterScene] Invalid manifest JSON:', err)
      gatewayEvents.emit('gateway-scene-error', 'Invalid nerve-center manifest JSON')
      return
    }

    // 2. Build sprite frames for each loaded character sheet
    for (const ws of WORKER_SPRITES) {
      buildSpriteFrames(this, ws.key)
    }
    for (const ss of SPECIALIST_SPRITES) {
      buildSpriteFrames(this, ss.key)
    }

    // 3. Render rooms and corridors
    this.renderRooms()
    this.renderCorridors()

    // 4. Spawn agents
    this.spawnAgents()

    // 5. Wire events
    this.wireEvents()

    // 6. Camera setup — auto-fit world into viewport
    const canvasW = this.manifest.meta.canvas.width
    const canvasH = this.manifest.meta.canvas.height

    const cam = this.cameras.main
    // Fit the 1280x720 world into the actual viewport
    const fitZoom = Math.min(cam.width / canvasW, cam.height / canvasH)
    cam.setZoom(fitZoom)
    cam.centerOn(canvasW / 2, canvasH / 2)
    cam.setBounds(0, 0, canvasW, canvasH)
    this.physics.world.setBounds(0, 0, canvasW, canvasH)

    // Re-fit on resize
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      cam.setZoom(Math.min(gameSize.width / canvasW, gameSize.height / canvasH))
      cam.centerOn(canvasW / 2, canvasH / 2)
    })

    // Mouse wheel zoom
    this.input.on('wheel', (_pointer: unknown, _gos: unknown, _dx: number, _dy: number, dz: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dz * ZOOM_SENSITIVITY, ZOOM_MIN, ZOOM_MAX))
    })

    // 7. Click detection
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const worldX = pointer.worldX
      const worldY = pointer.worldY
      this.handleClick(worldX, worldY)
    })

    // 8. Signal ready
    gatewayEvents.emit('gateway-scene-ready')

    // 9. Cleanup on shutdown/destroy
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.shutdown())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.shutdown())
  }

  // ── update ───────────────────────────────────────────────────────────────

  update(): void {
    // Update each agent
    for (const agent of this.agents) {
      agent.update()
    }

    // Smooth camera follow toward camera target
    if (this.cameraTarget) {
      const cam = this.cameras.main
      const cx = cam.scrollX + cam.width / 2
      const cy = cam.scrollY + cam.height / 2
      const dx = this.cameraTarget.x - cx
      const dy = this.cameraTarget.y - cy

      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        cam.scrollX += dx * CAMERA_LERP
        cam.scrollY += dy * CAMERA_LERP
      }
    }
  }

  // ── renderRooms ──────────────────────────────────────────────────────────

  private renderRooms(): void {
    // Background
    const canvasW = this.manifest.meta.canvas.width
    const canvasH = this.manifest.meta.canvas.height
    const bg = this.add.graphics()
    bg.fillStyle(0x0e1117, 1)
    bg.fillRect(0, 0, canvasW, canvasH)
    bg.setDepth(0)

    for (const room of this.manifest.rooms) {
      const [x, y, w, h] = room.bounds
      const colorHex = parseInt(room.color.replace('#', ''), 16)
      const gfx = this.add.graphics()

      // Fill
      gfx.fillStyle(colorHex, 0.15)
      gfx.fillRoundedRect(x, y, w, h, 12)

      // Stroke
      gfx.lineStyle(2, colorHex, 0.6)
      gfx.strokeRoundedRect(x, y, w, h, 12)

      gfx.setDepth(1)

      // Label
      this.add.text(x + w / 2, y + 16, room.label, {
        fontFamily: 'monospace',
        fontSize: '11px',
        fontStyle: 'bold',
        color: room.color,
      }).setOrigin(0.5, 0.5).setDepth(2)
    }
  }

  // ── renderCorridors ──────────────────────────────────────────────────────

  private renderCorridors(): void {
    const nodes = this.manifest.walkGraph.nodes
    const edges = this.manifest.walkGraph.edges
    const gfx = this.add.graphics()
    gfx.setDepth(1)

    for (const [aId, bId] of edges) {
      const nodeA = nodes[aId]
      const nodeB = nodes[bId]
      if (!nodeA || !nodeB) continue

      // Only draw corridors between nodes that are NOT in the same room
      const roomA = nodeA.roomId ?? null
      const roomB = nodeB.roomId ?? null
      if (roomA && roomB && roomA === roomB) continue

      gfx.lineStyle(2, 0x4a5568, 0.5)
      gfx.lineBetween(nodeA.x, nodeA.y, nodeB.x, nodeB.y)
    }
  }

  // ── spawnAgents ──────────────────────────────────────────────────────────

  private spawnAgents(): void {
    // Build seat lookup: agentId → {x, y}
    const seatLookup = new Map<string, { x: number; y: number }>()
    for (const room of this.manifest.rooms) {
      for (const seat of room.seats) {
        seatLookup.set(seat.agentId, { x: seat.x, y: seat.y })
      }
    }

    // Spawn 4 generalists
    for (let i = 0; i < GENERALIST_IDS.length; i++) {
      const agentId = GENERALIST_IDS[i]
      const spriteConfig = WORKER_SPRITES[i]
      if (!spriteConfig) continue

      const pos = seatLookup.get(agentId) ?? { x: 640, y: 360 }
      const homeRoom = AGENT_HOME_ROOM[agentId] ?? 'command-hub'

      const config: AgentConfig = {
        agentId,
        spriteKey: spriteConfig.key,
        label: spriteConfig.label,
        homeRoomId: homeRoom,
        startX: pos.x,
        startY: pos.y,
        facing: 'down',
        isSpecialist: false,
      }

      const agent = new Agent(this, config, this.manifest.walkGraph)
      this.agents.push(agent)
      this.agentMap.set(agentId, agent)
    }

    // Spawn 9 specialists (SPECIALIST_SPRITES includes engineering)
    for (const ss of SPECIALIST_SPRITES) {
      const pos = seatLookup.get(ss.agentId) ?? { x: 640, y: 360 }
      const homeRoom = AGENT_HOME_ROOM[ss.agentId] ?? 'command-hub'

      const config: AgentConfig = {
        agentId: ss.agentId,
        spriteKey: ss.key,
        label: ss.label,
        homeRoomId: homeRoom,
        startX: pos.x,
        startY: pos.y,
        facing: 'down',
        tint: ss.tint,
        isSpecialist: true,
      }

      const agent = new Agent(this, config, this.manifest.walkGraph)

      // Specialists start hidden — shown when FleetStore reports active
      agent.setVisible(false)

      this.agents.push(agent)
      this.agentMap.set(ss.agentId, agent)
    }

    console.log(`[NerveCenterScene] Spawned ${this.agents.length} agents (${GENERALIST_IDS.length} generalists, ${SPECIALIST_SPRITES.length} specialists)`)
  }

  // ── wireEvents ───────────────────────────────────────────────────────────

  private wireEvents(): void {
    // Task lifecycle
    this.eventCleanups.push(
      townEvents.on('task-assigned', (seatId: string, message: string) => {
        const agent = this.resolveAgent(seatId)
        if (!agent) return
        const homeRoom = AGENT_HOME_ROOM[agent.agentId]
        agent.assignTask(homeRoom ?? 'command-hub', message)
        this.cameraTarget = { x: agent.sprite.x, y: agent.sprite.y }
      }),
    )

    this.eventCleanups.push(
      townEvents.on('task-completed', (seatId: string) => {
        const agent = this.resolveAgent(seatId)
        if (!agent) return
        agent.completeTask()
        this.cameraTarget = { x: agent.sprite.x, y: agent.sprite.y }
      }),
    )

    this.eventCleanups.push(
      townEvents.on('task-failed', (seatId: string) => {
        const agent = this.resolveAgent(seatId)
        if (!agent) return
        agent.failTask()
        this.cameraTarget = { x: agent.sprite.x, y: agent.sprite.y }
      }),
    )

    // Agent status updates
    this.eventCleanups.push(
      townEvents.on('agent-status', (seatId: string, status: SeatStatus) => {
        const agent = this.resolveAgent(seatId)
        if (agent) agent.status = status
      }),
    )

    // Telemetry routing
    this.eventCleanups.push(
      gatewayEvents.on('telemetry-event', (event: TelemetryEvent) => {
        const oldRoomId = EVENT_TO_ROOM[event.type]
        if (!oldRoomId) return

        const newRoomId = translateRoomId(oldRoomId)
        const workState = EVENT_TO_WORK_STATE[event.type]

        // Find an agent in (or assigned to) that room, or pick the first idle generalist
        let agent = this.findAgentForRoom(newRoomId)
        if (!agent) {
          agent = this.agents.find(a => !a.sprite.visible ? false : a.workState === 'idle') ?? null
        }
        if (!agent) return

        agent.assignTask(newRoomId)
        if (workState) {
          agent.setWorkState(workState)
        }
      }),
    )

    // FleetStore subscription — sync specialist visibility
    const store = getFleetStore()
    const unsubStore = store.subscribe(() => {
      const snapshot = store.getSnapshot()
      for (const fleetAgent of snapshot.agents) {
        const agent = this.agentMap.get(fleetAgent.id)
        if (!agent) continue

        // Only toggle visibility for specialists
        const ss = SPECIALIST_SPRITES.find(s => s.agentId === fleetAgent.id)
        if (ss) {
          agent.setVisible(fleetAgent.status !== 'empty')
        }
      }
    })
    this.eventCleanups.push(unsubStore)
  }

  // ── resolveAgent ─────────────────────────────────────────────────────────

  private resolveAgent(seatId: string): Agent | null {
    // Direct match on agentId
    const direct = this.agentMap.get(seatId)
    if (direct) return direct

    // Parse seat-N → generalist ID
    const match = seatId.match(/^seat-(\d+)$/)
    if (match) {
      const idx = parseInt(match[1], 10)
      const genId = GENERALIST_IDS[idx]
      if (genId) return this.agentMap.get(genId) ?? null
    }

    return null
  }

  // ── findAgentForRoom ─────────────────────────────────────────────────────

  private findAgentForRoom(roomId: string): Agent | null {
    // Find an agent whose home room matches
    for (const agent of this.agents) {
      if (!agent.sprite.visible) continue
      const home = AGENT_HOME_ROOM[agent.agentId]
      if (home === roomId) return agent
    }
    return null
  }

  // ── handleClick ──────────────────────────────────────────────────────────

  private handleClick(worldX: number, worldY: number): void {
    // Check agent sprites first
    for (const agent of this.agents) {
      if (!agent.sprite.visible) continue
      const dx = Math.abs(worldX - agent.sprite.x)
      const dy = Math.abs(worldY - agent.sprite.y)
      if (dx < FRAME_WIDTH / 2 && dy < FRAME_HEIGHT / 2) {
        // Look up current task from FleetStore
        const store = getFleetStore()
        const fleetAgent = store.getSnapshot().agents.find(a => a.id === agent.agentId)
        const taskLine = fleetAgent?.currentTask ? `\nTask: ${fleetAgent.currentTask}` : ''
        this.showTooltip(agent.sprite.x, agent.sprite.y - FRAME_HEIGHT / 2 - 10,
          `${agent.label} (${agent.agentId})\nStatus: ${agent.status} | State: ${agent.workState}${taskLine}`)
        this.cameraTarget = { x: agent.sprite.x, y: agent.sprite.y }

        // Emit open-terminal so React view can show TaskAssignModal
        townEvents.emit('open-terminal', agent.agentId)
        return
      }
    }

    // Check room bounds
    for (const room of this.manifest.rooms) {
      const [rx, ry, rw, rh] = room.bounds
      if (worldX >= rx && worldX <= rx + rw && worldY >= ry && worldY <= ry + rh) {
        // List agents currently in this room
        const roomAgents = this.agents.filter(a => a.sprite.visible && a.currentRoomId === room.id)
        const agentLine = roomAgents.length > 0
          ? `\nAgents: ${roomAgents.map(a => a.label).join(', ')}`
          : '\nAgents: none'
        gatewayEvents.emit('room-clicked', room.id)
        this.showTooltip(rx + rw / 2, ry - 10, `${room.label}${agentLine}`)
        return
      }
    }
  }

  // ── showTooltip ──────────────────────────────────────────────────────────

  private showTooltip(x: number, y: number, text: string): void {
    this.clearTooltip()

    this.tooltip = this.add.text(x, y, text, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#e2e8f0',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      padding: { x: 8, y: 5 },
    }).setOrigin(0.5, 1).setDepth(30)

    this.tooltipTimer = setTimeout(() => this.clearTooltip(), TOOLTIP_TTL)
  }

  private clearTooltip(): void {
    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer)
      this.tooltipTimer = null
    }
    if (this.tooltip) {
      this.tooltip.destroy()
      this.tooltip = null
    }
  }

  // ── shutdown ─────────────────────────────────────────────────────────────

  private shutdown(): void {
    // Clean up event listeners
    for (const cleanup of this.eventCleanups) {
      cleanup()
    }
    this.eventCleanups = []

    // Destroy all agents
    for (const agent of this.agents) {
      agent.destroy()
    }
    this.agents = []
    this.agentMap.clear()

    this.clearTooltip()
  }
}
