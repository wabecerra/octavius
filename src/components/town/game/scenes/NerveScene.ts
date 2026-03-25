/**
 * NerveScene — Organic multi-room Phaser scene for the Octavius Nerve Center.
 *
 * Uses an organic room layout (variable-size rooms on a 1920×1080 canvas)
 * with a walk-graph for actor routing instead of grid-based A* pathfinding.
 * 4 generalist workers + 1 player (Octavius boss). Workers route to rooms
 * via telemetry events and persist position across tab switches.
 *
 * Room concept:
 *   Vault (memory), Forge (skills/obsidian), Bridge (lcm/gateway),
 *   Watchtower (health/monitoring), Ledger (costs), Hub (central),
 *   Dispatch (agents), Workshop (tasks), Quarters (idle/rest)
 */

import * as Phaser from 'phaser'
import { Player } from '../entities/Player'
import { Worker, resetWanderClock } from '../entities/Worker'
import { SPRITE_KEY, SPRITE_PATH, WORKER_SPRITES } from '../config/animations'
import { EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, EMOTE_FRAME_SIZE, EMOTE_FRAMES } from '../config/emotes'
import { Pathfinder } from '../utils/Pathfinder'
import {
  buildSpriteFrames, parseSpawns, parsePOIs, buildCollisionRects,
  renderTileObjectLayer, type AnimatedProp,
} from '../utils/MapHelpers'
import { townEvents } from '@/lib/town/events'
import { gatewayEvents } from '@/lib/gateway-view/events'
import { parseRoomManifest } from '@/lib/gateway-view/manifest-parser'
import { validateNerveCenterTilemap } from '@/lib/town/tilemap-validator'
import { BotStateStore } from '@/lib/town/bot-state-store'
import { EVENT_TO_ROOM } from '@/lib/gateway-view/constants'
import {
  PF_PADDING, ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX, ZOOM_SENSITIVITY,
  CAMERA_LERP, INTERACT_DISTANCE, PRESS_E_STYLE,
} from '@/lib/town/constants'
import type { RoomManifest, RoomDef, TelemetryEvent, WorkZoneDef, WalkGraph } from '@/lib/gateway-view/types'

// ---- Worker home rooms (one per generalist) --------------------------------
const WORKER_HOME_ROOMS = ['room-vault', 'room-forge', 'room-dispatch', 'room-workshop']
const WORKER_LABELS = ['Archivist', 'Artisan', 'Commander', 'Builder']

// ---- Visual style constants ------------------------------------------------
const ROOM_BORDER_COLOR = 0x4a9eff
const ROOM_BORDER_ALPHA = 0.35
const ROOM_BORDER_WIDTH = 1
const ROOM_FILL_ALPHA = 0.0
const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: '"SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
  fontSize: '12px',
  color: '#ffffff',
  align: 'center',
  stroke: '#000000',
  strokeThickness: 3,
  shadow: { offsetX: 1, offsetY: 1, color: '#000000', blur: 2, fill: true, stroke: true },
}
const ERROR_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: '"SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
  fontSize: '14px',
  color: '#ff6b6b',
  backgroundColor: 'rgba(30, 10, 10, 0.9)',
  padding: { x: 12, y: 8 },
  align: 'center',
  wordWrap: { width: 480 },
}

const MANIFEST_URL = '/town/gateway/gateway-map.logic.json'
const BOT_STATE_SAVE_INTERVAL = 500

// ---- Helpers ---------------------------------------------------------------

/** Extract bounds from a RoomDef (supports both bounds array and legacy x/y/w/h). */
function roomBounds(room: RoomDef): { x: number; y: number; width: number; height: number } {
  if (room.bounds && room.bounds.length === 4) {
    return { x: room.bounds[0], y: room.bounds[1], width: room.bounds[2], height: room.bounds[3] }
  }
  // Legacy fallback
  return { x: room.x ?? 0, y: room.y ?? 0, width: room.width ?? 128, height: room.height ?? 128 }
}

/** Center of a room's bounds. */
function roomCenter(room: RoomDef): { x: number; y: number } {
  const b = roomBounds(room)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
}

// ---- Walk-graph BFS pathfinder ---------------------------------------------

interface WalkRoute { x: number; y: number }

function walkGraphRoute(
  graph: WalkGraph,
  fromX: number, fromY: number,
  toX: number, toY: number,
): WalkRoute[] {
  if (!graph || graph.nodes.length === 0) return [{ x: toX, y: toY }]

  // Find nearest start and end nodes
  const nearest = (px: number, py: number) => {
    let best = graph.nodes[0]
    let bestD = Infinity
    for (const n of graph.nodes) {
      const d = (n.x - px) ** 2 + (n.y - py) ** 2
      if (d < bestD) { best = n; bestD = d }
    }
    return best
  }

  const startNode = nearest(fromX, fromY)
  const endNode = nearest(toX, toY)
  if (startNode.id === endNode.id) return [{ x: toX, y: toY }]

  // Build adjacency
  const adj = new Map<string, string[]>()
  for (const n of graph.nodes) adj.set(n.id, [])
  for (const [a, b] of graph.edges) {
    adj.get(a)?.push(b)
    adj.get(b)?.push(a)
  }

  // BFS
  const visited = new Set<string>([startNode.id])
  const parent = new Map<string, string>()
  const queue = [startNode.id]

  while (queue.length > 0) {
    const cur = queue.shift()!
    if (cur === endNode.id) break
    for (const nb of (adj.get(cur) ?? [])) {
      if (visited.has(nb)) continue
      visited.add(nb)
      parent.set(nb, cur)
      queue.push(nb)
    }
  }

  if (!visited.has(endNode.id)) return [{ x: toX, y: toY }]

  // Reconstruct path
  const ids: string[] = []
  let cursor: string | undefined = endNode.id
  while (cursor) { ids.push(cursor); cursor = parent.get(cursor) }
  ids.reverse()

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]))
  const route: WalkRoute[] = ids
    .map(id => nodeMap.get(id))
    .filter((n): n is typeof graph.nodes[0] => !!n)
    .map(n => ({ x: n.x, y: n.y }))

  // Append exact destination
  route.push({ x: toX, y: toY })
  return route
}

// ---- NerveScene class -------------------------------------------------------

export class NerveScene extends Phaser.Scene {
  private player!: Player
  workers: Worker[] = []
  private cameraFollowing = true
  private eKey!: Phaser.Input.Keyboard.Key
  private nearestWorker: Worker | null = null
  private promptText: Phaser.GameObjects.Text | null = null
  private interactionOpen = false
  private eventUnsubs: Array<() => void> = []

  private roomManifest: RoomManifest | null = null
  private roomDefs: Map<string, RoomDef> = new Map()
  private workZones: Map<string, WorkZoneDef> = new Map()
  private walkGraph: WalkGraph | null = null
  private botStateStore!: BotStateStore
  private manifestJson: string | null = null
  private lastBotSave = 0
  private roundRobinIdx = 0
  private roomVisuals: Map<string, { border: Phaser.GameObjects.Graphics; zone: Phaser.GameObjects.Zone }> = new Map()

  constructor() { super({ key: 'NerveScene' }) }

  // ---------------------------------------------------------------------------
  // preload
  // ---------------------------------------------------------------------------

  preload() {
    // Tilemap (optional — scene works without it via fallback rendering)
    this.load.tilemapTiledJSON('nerve-center', '/town/maps/nerve-center.json')
    this.load.once('filecomplete-tilemapJSON-nerve-center', () => {
      const cached = this.cache.tilemap.get('nerve-center')
      if (!cached?.data?.tilesets) return
      for (const ts of cached.data.tilesets) {
        const basename = (ts.image as string).split('/').pop()!
        this.load.image(ts.name, `/town/tilesets/${basename}`)
      }
    })

    // Character sprites
    this.load.image(SPRITE_KEY, SPRITE_PATH)
    for (const ws of WORKER_SPRITES) this.load.image(ws.key, ws.path)

    // Emote sheet
    this.load.spritesheet(EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, {
      frameWidth: EMOTE_FRAME_SIZE,
      frameHeight: EMOTE_FRAME_SIZE,
    })

    // Animated props
    this.load.spritesheet('boss-arrow', '/town/sprites/arrow_down_48x48.png', { frameWidth: 48, frameHeight: 48 })
    this.load.spritesheet('anim-cauldron', '/town/sprites/animated_witch_cauldron_48x48.png', { frameWidth: 96, frameHeight: 96 })
    this.load.spritesheet('anim-door', '/town/sprites/animated_door_big_4_48x48.png', { frameWidth: 48, frameHeight: 144 })

    // Room manifest via fetch
    fetch(MANIFEST_URL)
      .then(r => r.text())
      .then(text => { this.manifestJson = text })
      .catch(err => { console.error('[NerveScene] Failed to fetch room manifest:', err) })
  }

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------

  create() {
    // 1. Build sprite frames
    buildSpriteFrames(this, SPRITE_KEY)
    for (const ws of WORKER_SPRITES) buildSpriteFrames(this, ws.key)

    // 2. Parse room manifest
    if (!this.manifestJson) {
      this.showError('Failed to load room manifest')
      gatewayEvents.emit('gateway-scene-error', 'Failed to load room manifest')
      return
    }

    const manifestResult = parseRoomManifest(this.manifestJson)
    if (!manifestResult.ok) {
      this.showError(`Room manifest error: ${manifestResult.error}`)
      gatewayEvents.emit('gateway-scene-error', manifestResult.error)
      return
    }

    this.roomManifest = manifestResult.value
    for (const room of this.roomManifest.rooms) {
      this.roomDefs.set(room.roomId, room)
    }

    // Parse walk graph and work zones from manifest
    this.walkGraph = this.roomManifest.walkGraph ?? null
    if (this.roomManifest.workZones) {
      for (const wz of this.roomManifest.workZones) {
        this.workZones.set(wz.roomId, wz)
      }
    }

    // 3. Determine rendering mode
    // If manifest is v2 (has walkGraph), skip the old grid tilemap entirely —
    // it was designed for the old 4×3 layout and is incompatible with organic rooms.
    const isV2Manifest = !!this.roomManifest.walkGraph
    const tilemapData = isV2Manifest ? null : this.cache.tilemap.get('nerve-center')?.data
    const validation = isV2Manifest
      ? { ok: false, errors: ['Skipped: v2 manifest uses organic layout'], spawns: { boss: null, workers: [] } }
      : validateNerveCenterTilemap(this.cache.tilemap.get('nerve-center')?.data)
    let useFallback = isV2Manifest

    if (!useFallback && !validation.ok) {
      console.warn('[NerveScene] Tilemap validation failed, using organic fallback:', validation.errors)
      useFallback = true
    }

    // 4. Build tilemap layers (or fallback)
    let map: Phaser.Tilemaps.Tilemap | null = null
    let collisionRects: { x: number; y: number; width: number; height: number }[] = []
    const collisionGroup = this.physics.add.staticGroup()

    // Canvas size from manifest base resolution
    const baseW = this.roomManifest.meta?.baseResolution?.width ?? 1920
    const baseH = this.roomManifest.meta?.baseResolution?.height ?? 1080

    if (!useFallback && tilemapData) {
      map = this.make.tilemap({ key: 'nerve-center' })
      const allTilesets: Phaser.Tilemaps.Tileset[] = []
      for (const ts of map.tilesets) {
        const added = map.addTilesetImage(ts.name, ts.name)
        if (added) allTilesets.push(added)
      }

      if (allTilesets.length === 0) {
        console.warn('[NerveScene] No tilesets loaded, falling back to organic rendering')
        useFallback = true
      } else {
        map.createLayer('floor', allTilesets)
        map.createLayer('walls', allTilesets)
        map.createLayer('ground', allTilesets)
        map.createLayer('furniture', allTilesets)
        map.createLayer('objects', allTilesets)
        const overheadLayer = map.createLayer('overhead', allTilesets)
        if (overheadLayer) overheadLayer.setDepth(10)

        const animatedProps: AnimatedProp[] = [{
          tilesetName: '11_Halloween_48x48', anchorLocalId: 130,
          skipLocalIds: new Set([130, 131, 146, 147]),
          spriteKey: 'anim-cauldron', frameWidth: 96, frameHeight: 96, endFrame: 11, frameRate: 8,
        }]
        renderTileObjectLayer(this, map, 'props', allTilesets, 5, animatedProps)
        renderTileObjectLayer(this, map, 'props-over', allTilesets, 11)
        collisionRects = buildCollisionRects(map, collisionGroup)
      }
    }

    // Fallback: render rooms as organic labeled rectangles
    if (useFallback) {
      this.renderFallbackRooms()
    }

    // Always render interactive room visuals
    this.renderRoomVisuals()

    // 5. Build Pathfinder (for physics movement, walk graph handles room routing)
    const mapW = map?.widthInPixels ?? baseW
    const mapH = map?.heightInPixels ?? baseH
    const pathfinder = new Pathfinder(mapW, mapH, collisionRects, PF_PADDING)

    // 6. Parse spawns and POIs
    const spawns = map ? parseSpawns(map) : this.getFallbackSpawns()
    const pois = map ? parsePOIs(map) : this.getWorkZonePOIs()

    console.log(`[NerveScene] Boss at (${spawns.bossSpawn.x}, ${spawns.bossSpawn.y}), ${spawns.workerSpawns.length} worker spawns, ${pois.length} POIs`)

    // 7. BotStateStore
    this.botStateStore = new BotStateStore()
    const persistedStates = this.botStateStore.load()

    // 8. Spawn Player at hub center
    const hubRoom = this.roomDefs.get(this.roomManifest.hubRoomId)
    const hubCenter = hubRoom ? roomCenter(hubRoom) : { x: mapW / 2, y: mapH / 2 }
    const bossX = spawns.bossSpawn.x || hubCenter.x
    const bossY = spawns.bossSpawn.y || hubCenter.y
    this.player = new Player(this, bossX, bossY, spawns.bossSpawn.facing)

    // 9. Physics
    this.physics.add.collider(this.player.sprite, collisionGroup)
    this.physics.world.setBounds(0, 0, mapW, mapH)
    this.player.sprite.setCollideWorldBounds(true)
    this.input.keyboard?.disableGlobalCapture()

    // 10. Camera
    this.cameras.main.startFollow(this.player.sprite, true, CAMERA_LERP, CAMERA_LERP)
    this.cameras.main.setBounds(0, 0, mapW, mapH)
    this.cameras.main.setZoom(ZOOM_DEFAULT)

    // 11. Mouse wheel zoom
    this.input.on('wheel', (_pointer: unknown, _gos: unknown, _dx: number, _dy: number, dz: number) => {
      const cam = this.cameras.main
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dz * ZOOM_SENSITIVITY, ZOOM_MIN, ZOOM_MAX))
    })

    // 12. E key
    const kb = this.input.keyboard
    if (kb) {
      this.eKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E, false)
    }

    // 13. "Press E" prompt
    this.promptText = this.add
      .text(0, 0, '', PRESS_E_STYLE as Phaser.Types.GameObjects.Text.TextStyle)
      .setResolution(window.devicePixelRatio * 2)
      .setOrigin(0.5, 1)
      .setDepth(25)
      .setVisible(false)
    this.promptText.texture.setFilter(Phaser.Textures.FilterMode.LINEAR)

    // 14. Spawn Workers — one per home room
    resetWanderClock()
    const numWorkers = Math.min(WORKER_HOME_ROOMS.length, WORKER_SPRITES.length)
    for (let i = 0; i < numWorkers; i++) {
      const homeRoomId = WORKER_HOME_ROOMS[i]
      const homeRoom = this.roomDefs.get(homeRoomId)
      const homeWz = this.workZones.get(homeRoomId)
      const spriteConfig = WORKER_SPRITES[i]
      const label = WORKER_LABELS[i] ?? spriteConfig.label
      // Quadrant names for theming compatibility
      const quadrant = ['lifeforce', 'industry', 'fellowship', 'essence'][i] ?? 'industry'

      // Spawn at work zone anchor or room center
      const defaultPos = homeWz
        ? { x: homeWz.anchor.x, y: homeWz.anchor.y }
        : homeRoom
          ? roomCenter(homeRoom)
          : { x: bossX + (i - 1.5) * 120, y: bossY + 100 }

      const seatId = `seat-${i}`
      const persisted = persistedStates.find(s => s.seatId === seatId)
      const startX = persisted ? persisted.x : defaultPos.x
      const startY = persisted ? persisted.y : defaultPos.y
      const startFacing = persisted ? persisted.facing : 'down' as const

      const worker = new Worker(
        this, seatId, label, quadrant,
        spriteConfig.key, startX, startY, startFacing,
        pathfinder, pois,
      )
      this.physics.add.collider(worker.sprite, collisionGroup)

      if (persisted) worker.restoreState(persisted)

      this.workers.push(worker)
      console.log(`[NerveScene] Worker "${label}" → ${homeRoomId} at (${startX}, ${startY})`)
    }

    // 15. Emit seats-discovered
    townEvents.emit('seats-discovered', spawns.workerSpawns)

    // 16. Wire townEvents
    this.eventUnsubs.push(
      townEvents.on('task-assigned', (seatId, message) => {
        const w = this.workers.find(w => w.seatId === seatId)
        if (w) w.setStatus('running', message)
      }),
      townEvents.on('task-completed', (seatId) => {
        const w = this.workers.find(w => w.seatId === seatId)
        if (w) w.setStatus('done')
      }),
      townEvents.on('task-failed', (seatId) => {
        const w = this.workers.find(w => w.seatId === seatId)
        if (w) w.setStatus('failed')
      }),
      townEvents.on('task-bubble', (seatId, text, ttl) => {
        const w = this.workers.find(w => w.seatId === seatId)
        if (w) w.showBubble(text, ttl)
      }),
      townEvents.on('agent-status', (seatId, status) => {
        const w = this.workers.find(w => w.seatId === seatId)
        if (w) w.setStatus(status)
      }),
      townEvents.on('terminal-closed', () => {
        this.interactionOpen = false
      }),
    )

    // 17. Wire telemetry routing
    this.eventUnsubs.push(
      gatewayEvents.on('telemetry-event', (event: TelemetryEvent) => {
        this.handleTelemetryEvent(event)
      }),
    )

    // 18. Cleanup
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup())
  }

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------

  update(_time: number, _delta: number) {
    if (this.interactionOpen || isInputFocused()) {
      for (const w of this.workers) w.update()
      return
    }

    this.player.update()

    if (!this.cameraFollowing && this.player.isMoving()) {
      this.cameras.main.startFollow(this.player.sprite, true, CAMERA_LERP, CAMERA_LERP)
      this.cameraFollowing = true
    }

    for (const w of this.workers) w.update()

    // Throttled bot state persistence
    const now = Date.now()
    if (now - this.lastBotSave > BOT_STATE_SAVE_INTERVAL) {
      this.lastBotSave = now
      this.botStateStore.save(this.workers.map(w => w.getSerializableState()))
    }

    // Find nearest worker for interaction
    let nearest: Worker | null = null
    let nearestDist = Infinity
    for (const w of this.workers) {
      const dist = Phaser.Math.Distance.Between(
        this.player.sprite.x, this.player.sprite.y,
        w.sprite.x, w.sprite.y,
      )
      if (dist < INTERACT_DISTANCE && dist < nearestDist) {
        nearest = w
        nearestDist = dist
      }
    }

    if (this.promptText) {
      if (nearest) {
        const statusLabel = nearest.status === 'running' ? '(working)' : ''
        this.promptText.setText(`Press E — ${nearest.label} ${statusLabel}`)
        this.promptText.setPosition(nearest.sprite.x, nearest.sprite.y - 60)
        this.promptText.setVisible(true)
      } else {
        this.promptText.setVisible(false)
      }
    }

    if (nearest && this.eKey && Phaser.Input.Keyboard.JustDown(this.eKey)) {
      this.interactionOpen = true
      this.promptText?.setVisible(false)
      townEvents.emit('open-terminal', nearest.seatId)
    }
  }

  // ---------------------------------------------------------------------------
  // cleanup
  // ---------------------------------------------------------------------------

  private cleanup() {
    for (const w of this.workers) w.destroy()
    this.workers = []
    for (const unsub of this.eventUnsubs) unsub()
    this.eventUnsubs = []
  }

  // ---------------------------------------------------------------------------
  // Telemetry routing — uses walk graph to route workers to target rooms
  // ---------------------------------------------------------------------------

  private handleTelemetryEvent(event: TelemetryEvent): void {
    const targetRoomId = EVENT_TO_ROOM[event.type]
    if (!targetRoomId) return

    // Resolve target position: prefer work zone anchor, fall back to room center
    const wz = this.workZones.get(targetRoomId)
    const roomDef = this.roomDefs.get(targetRoomId)
    if (!wz && !roomDef) return

    const targetX = wz ? wz.anchor.x : roomCenter(roomDef!).x
    const targetY = wz ? wz.anchor.y : roomCenter(roomDef!).y

    const worker = this.findAvailableWorker()
    if (!worker) return

    worker.enqueueEvent(event, targetRoomId, targetX, targetY)
  }

  private findAvailableWorker(): Worker | null {
    if (this.workers.length === 0) return null
    const idle = this.workers.filter(w => w.workState === 'idle')
    if (idle.length > 0) return idle[0]
    const worker = this.workers[this.roundRobinIdx % this.workers.length]
    this.roundRobinIdx = (this.roundRobinIdx + 1) % this.workers.length
    return worker
  }

  // ---------------------------------------------------------------------------
  // Error / fallback helpers
  // ---------------------------------------------------------------------------

  private showError(message: string): void {
    console.error('[NerveScene]', message)
    const cx = this.cameras.main.width / 2
    const cy = this.cameras.main.height / 2
    this.add
      .text(cx, cy, `Nerve Center Error\n\n${message}`, ERROR_STYLE)
      .setOrigin(0.5, 0.5)
      .setDepth(100)
      .setScrollFactor(0)
  }

  /** Render rooms as an organic floor plan when no tilemap is used. */
  private renderFallbackRooms(): void {
    if (!this.roomManifest) return

    const baseW = this.roomManifest.meta?.baseResolution?.width ?? 1920
    const baseH = this.roomManifest.meta?.baseResolution?.height ?? 1080

    // Floor background
    const bg = this.add.graphics()
    bg.fillStyle(0x1a1d28, 1)
    bg.fillRect(0, 0, baseW, baseH)
    bg.setDepth(0)

    // Subtle grid pattern on floor
    const grid = this.add.graphics()
    grid.lineStyle(1, 0x252838, 0.4)
    for (let x = 0; x < baseW; x += 48) grid.lineBetween(x, 0, x, baseH)
    for (let y = 0; y < baseH; y += 48) grid.lineBetween(0, y, baseW, y)
    grid.setDepth(0)

    // Room colors for variety
    const ROOM_COLORS: Record<string, number> = {
      'room-vault': 0x1e2a3a,
      'room-forge': 0x2a1e2a,
      'room-bridge': 0x1e2a2a,
      'room-watchtower': 0x2a2a1e,
      'room-ledger': 0x2a1e1e,
      'room-hub': 0x1e2438,
      'room-dispatch': 0x1e2e2a,
      'room-workshop': 0x2a241e,
      'room-quarters': 0x1e1e2a,
    }

    const ROOM_BORDER_COLORS: Record<string, number> = {
      'room-vault': 0x4a7aff,
      'room-forge': 0xc06aff,
      'room-bridge': 0x4adaff,
      'room-watchtower': 0xffc04a,
      'room-ledger': 0xff6a6a,
      'room-hub': 0x4a9eff,
      'room-dispatch': 0x4affa0,
      'room-workshop': 0xffa04a,
      'room-quarters': 0x8a8aff,
    }

    for (const room of this.roomManifest.rooms) {
      const { roomId, label, icon } = room
      const b = roomBounds(room)
      const fillColor = ROOM_COLORS[roomId] ?? 0x141824
      const borderColor = ROOM_BORDER_COLORS[roomId] ?? 0x4a9eff

      const gfx = this.add.graphics()

      // Room floor fill
      gfx.fillStyle(fillColor, 0.85)
      gfx.fillRoundedRect(b.x, b.y, b.width, b.height, 6)

      // Inner floor pattern (lighter grid inside room)
      gfx.lineStyle(1, borderColor, 0.06)
      for (let x = b.x + 24; x < b.x + b.width; x += 24) {
        gfx.lineBetween(x, b.y + 4, x, b.y + b.height - 4)
      }
      for (let y = b.y + 24; y < b.y + b.height; y += 24) {
        gfx.lineBetween(b.x + 4, y, b.x + b.width - 4, y)
      }

      // Room border
      gfx.lineStyle(2, borderColor, 0.5)
      gfx.strokeRoundedRect(b.x, b.y, b.width, b.height, 6)

      // Corner accents
      const cornerSize = 12
      gfx.lineStyle(2, borderColor, 0.7)
      // Top-left
      gfx.lineBetween(b.x, b.y + cornerSize, b.x, b.y)
      gfx.lineBetween(b.x, b.y, b.x + cornerSize, b.y)
      // Top-right
      gfx.lineBetween(b.x + b.width - cornerSize, b.y, b.x + b.width, b.y)
      gfx.lineBetween(b.x + b.width, b.y, b.x + b.width, b.y + cornerSize)
      // Bottom-left
      gfx.lineBetween(b.x, b.y + b.height - cornerSize, b.x, b.y + b.height)
      gfx.lineBetween(b.x, b.y + b.height, b.x + cornerSize, b.y + b.height)
      // Bottom-right
      gfx.lineBetween(b.x + b.width - cornerSize, b.y + b.height, b.x + b.width, b.y + b.height)
      gfx.lineBetween(b.x + b.width, b.y + b.height - cornerSize, b.x + b.width, b.y + b.height)

      gfx.setDepth(1)

      // Room label
      const lx = room.labelAnchor?.x ?? (b.x + b.width / 2)
      const ly = room.labelAnchor?.y ?? (b.y + 18)
      this.add.text(lx, ly, label, {
        ...LABEL_STYLE,
        fontSize: b.width > 400 ? '14px' : '11px',
        color: `#${borderColor.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5, 0.5).setDepth(3).setAlpha(0.9)

      // Icon
      const frameIdx = EMOTE_FRAMES[icon] ?? 0
      this.add.sprite(b.x + b.width / 2, b.y + b.height / 2, EMOTE_SHEET_KEY, frameIdx)
        .setDepth(3).setScale(0.5).setAlpha(0.3)
    }

    // Draw corridors between connected rooms
    if (this.walkGraph) {
      const nodeMap = new Map(this.walkGraph.nodes.map(n => [n.id, n]))
      const corridorGfx = this.add.graphics()

      // Draw walk edges as corridor paths
      for (const [a, b] of this.walkGraph.edges) {
        const na = nodeMap.get(a)
        const nb = nodeMap.get(b)
        if (!na || !nb) continue

        // Thicker corridor line
        corridorGfx.lineStyle(6, 0x252838, 0.6)
        corridorGfx.lineBetween(na.x, na.y, nb.x, nb.y)

        // Thinner center line
        corridorGfx.lineStyle(2, 0x4a9eff, 0.08)
        corridorGfx.lineBetween(na.x, na.y, nb.x, nb.y)
      }

      corridorGfx.setDepth(1)
    }

    // Draw work zone markers
    for (const [, wz] of this.workZones) {
      const marker = this.add.graphics()
      // Pulsing work zone circle
      marker.lineStyle(1, 0x4a9eff, 0.2)
      marker.strokeCircle(wz.anchor.x, wz.anchor.y, wz.radius)
      marker.fillStyle(0x4a9eff, 0.04)
      marker.fillCircle(wz.anchor.x, wz.anchor.y, wz.radius)
      marker.setDepth(2)
    }
  }

  /** Render interactive hover/click zones for rooms. Visual rendering is handled by renderFallbackRooms. */
  private renderRoomVisuals(): void {
    if (!this.roomManifest) return

    for (const room of this.roomManifest.rooms) {
      const { roomId } = room
      const b = roomBounds(room)

      // Hover highlight graphics (starts empty)
      const gfx = this.add.graphics()
      gfx.setDepth(2)

      // Interactive zone for hover/click
      const zone = this.add
        .zone(b.x + b.width / 2, b.y + b.height / 2, b.width, b.height)
        .setInteractive({ useHandCursor: true })
        .setDepth(2)

      zone.on('pointerover', () => {
        gfx.clear()
        gfx.fillStyle(0x4a9eff, 0.06)
        gfx.fillRoundedRect(b.x, b.y, b.width, b.height, 6)
        gfx.lineStyle(2, 0x88ccff, 0.6)
        gfx.strokeRoundedRect(b.x, b.y, b.width, b.height, 6)
      })

      zone.on('pointerout', () => {
        gfx.clear()
      })

      zone.on('pointerdown', () => {
        gatewayEvents.emit('room-clicked', roomId)
        gatewayEvents.emit('room-modal-open', roomId)
      })

      this.roomVisuals.set(roomId, { border: gfx, zone })
    }
  }

  /** Generate fallback spawns from room manifest work zones. */
  private getFallbackSpawns() {
    const hubRoom = this.roomDefs.get(this.roomManifest?.hubRoomId ?? '')
    const hubWz = this.workZones.get('room-hub')
    const hubPos = hubWz
      ? { x: hubWz.anchor.x, y: hubWz.anchor.y }
      : hubRoom
        ? roomCenter(hubRoom)
        : { x: 960, y: 540 }

    const bossSpawn = { x: hubPos.x, y: hubPos.y, facing: 'down' as const }

    const workerSpawns = WORKER_HOME_ROOMS.map((roomId, index) => {
      const wz = this.workZones.get(roomId)
      const roomDef = this.roomDefs.get(roomId)
      const pos = wz
        ? { x: wz.anchor.x, y: wz.anchor.y }
        : roomDef
          ? roomCenter(roomDef)
          : { x: bossSpawn.x + (index - 1.5) * 120, y: bossSpawn.y + 100 }

      return { seatId: `seat-${index}`, x: pos.x, y: pos.y, facing: 'down' as const, index }
    })

    return { bossSpawn, workerSpawns }
  }

  /** Convert work zones to POI targets for worker wandering. */
  private getWorkZonePOIs() {
    const pois: Array<{ name: string; x: number; y: number; facing: null }> = []
    for (const [, wz] of this.workZones) {
      pois.push({ name: wz.label, x: wz.anchor.x, y: wz.anchor.y, facing: null })
    }
    return pois
  }
}
