/**
 * Octavius Office Scene — pixel art office where quadrant agents work.
 * Full interaction system: walk up to a worker, press E, assign a task.
 */

import * as Phaser from 'phaser'
import { Player } from '../entities/Player'
import { Worker, resetWanderClock } from '../entities/Worker'
import { SPRITE_KEY, SPRITE_PATH, WORKER_SPRITES } from '../config/animations'
import { EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, EMOTE_FRAME_SIZE } from '../config/emotes'
import { Pathfinder } from '../utils/Pathfinder'
import {
  buildSpriteFrames, parseSpawns, parsePOIs, buildCollisionRects,
  renderTileObjectLayer, type AnimatedProp,
} from '../utils/MapHelpers'
import { townEvents } from '@/lib/town/events'
import {
  PF_PADDING, ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX, ZOOM_SENSITIVITY,
  CAMERA_LERP, INTERACT_DISTANCE, PRESS_E_STYLE,
} from '@/lib/town/constants'

const QUADRANTS = ['lifeforce', 'industry', 'fellowship', 'essence']
const QUADRANT_LABELS = ['Lifeforce', 'Industry', 'Fellowship', 'Essence']

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable
}

export class OfficeScene extends Phaser.Scene {
  private player!: Player
  workers: Worker[] = []
  private cameraFollowing = true
  private eKey!: Phaser.Input.Keyboard.Key
  private nearestWorker: Worker | null = null
  private promptText: Phaser.GameObjects.Text | null = null
  private interactionOpen = false
  private eventUnsubs: Array<() => void> = []

  constructor() { super({ key: 'OfficeScene' }) }

  preload() {
    this.load.tilemapTiledJSON('office', '/town/maps/office2.json')
    this.load.once('filecomplete-tilemapJSON-office', () => {
      const cached = this.cache.tilemap.get('office')
      if (!cached?.data?.tilesets) return
      for (const ts of cached.data.tilesets) {
        const basename = (ts.image as string).split('/').pop()!
        this.load.image(ts.name, `/town/tilesets/${basename}`)
      }
    })
    this.load.image(SPRITE_KEY, SPRITE_PATH)
    for (const ws of WORKER_SPRITES) this.load.image(ws.key, ws.path)
    this.load.spritesheet(EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, { frameWidth: EMOTE_FRAME_SIZE, frameHeight: EMOTE_FRAME_SIZE })
    this.load.spritesheet('boss-arrow', '/town/sprites/arrow_down_48x48.png', { frameWidth: 48, frameHeight: 48 })
    this.load.spritesheet('anim-cauldron', '/town/sprites/animated_witch_cauldron_48x48.png', { frameWidth: 96, frameHeight: 96 })
    this.load.spritesheet('anim-door', '/town/sprites/animated_door_big_4_48x48.png', { frameWidth: 48, frameHeight: 144 })
  }

  create() {
    buildSpriteFrames(this, SPRITE_KEY)
    for (const ws of WORKER_SPRITES) buildSpriteFrames(this, ws.key)

    const map = this.make.tilemap({ key: 'office' })
    const allTilesets: Phaser.Tilemaps.Tileset[] = []
    for (const ts of map.tilesets) {
      const added = map.addTilesetImage(ts.name, ts.name)
      if (added) allTilesets.push(added)
    }
    if (allTilesets.length === 0) {
      console.error('[OfficeScene] No tilesets loaded')
      return
    }

    // Create tile layers
    map.createLayer('floor', allTilesets)
    map.createLayer('walls', allTilesets)
    map.createLayer('ground', allTilesets)
    map.createLayer('furniture', allTilesets)
    map.createLayer('objects', allTilesets)

    // Animated props
    const animatedProps: AnimatedProp[] = [{
      tilesetName: '11_Halloween_48x48', anchorLocalId: 130,
      skipLocalIds: new Set([130, 131, 146, 147]),
      spriteKey: 'anim-cauldron', frameWidth: 96, frameHeight: 96, endFrame: 11, frameRate: 8,
    }]
    renderTileObjectLayer(this, map, 'props', allTilesets, 5, animatedProps)
    renderTileObjectLayer(this, map, 'props-over', allTilesets, 11)

    const overheadLayer = map.createLayer('overhead', allTilesets)
    if (overheadLayer) overheadLayer.setDepth(10)

    // Collisions
    const collisionGroup = this.physics.add.staticGroup()
    const collisionRects = buildCollisionRects(map, collisionGroup)
    const pathfinder = new Pathfinder(map.widthInPixels, map.heightInPixels, collisionRects, PF_PADDING)

    // Spawns & POIs
    const { bossSpawn, workerSpawns } = parseSpawns(map)
    const pois = parsePOIs(map)

    console.log(`[OfficeScene] Boss at (${bossSpawn.x}, ${bossSpawn.y}), ${workerSpawns.length} worker spawns, ${pois.length} POIs`)

    // Player
    this.player = new Player(this, bossSpawn.x, bossSpawn.y, bossSpawn.facing)
    this.physics.add.collider(this.player.sprite, collisionGroup)
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.player.sprite.setCollideWorldBounds(true)
    this.input.keyboard?.disableGlobalCapture()

    // Camera
    this.cameras.main.startFollow(this.player.sprite, true, CAMERA_LERP, CAMERA_LERP)
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.cameras.main.setZoom(ZOOM_DEFAULT)

    // Mouse wheel zoom
    this.input.on('wheel', (_pointer: unknown, _gos: unknown, _dx: number, _dy: number, dz: number) => {
      const cam = this.cameras.main
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dz * ZOOM_SENSITIVITY, ZOOM_MIN, ZOOM_MAX))
    })

    // E key for interaction
    const kb = this.input.keyboard
    if (kb) {
      this.eKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E, false)
    }

    // "Press E" prompt text (hidden by default)
    this.promptText = this.add
      .text(0, 0, '', PRESS_E_STYLE as Phaser.Types.GameObjects.Text.TextStyle)
      .setResolution(window.devicePixelRatio * 2)
      .setOrigin(0.5, 1)
      .setDepth(25)
      .setVisible(false)
    this.promptText.texture.setFilter(Phaser.Textures.FilterMode.LINEAR)

    // Create workers for each quadrant agent
    resetWanderClock()
    const numWorkers = Math.min(workerSpawns.length, WORKER_SPRITES.length)
    for (let i = 0; i < numWorkers; i++) {
      const spawn = workerSpawns[i]
      const spriteConfig = WORKER_SPRITES[i]
      const quadrant = QUADRANTS[i] ?? 'industry'
      const label = QUADRANT_LABELS[i] ?? spriteConfig.label
      const worker = new Worker(
        this, spawn.seatId, label, quadrant,
        spriteConfig.key, spawn.x, spawn.y, spawn.facing,
        pathfinder, pois,
      )
      this.physics.add.collider(worker.sprite, collisionGroup)
      this.workers.push(worker)
      console.log(`[OfficeScene] Worker "${label}" (${quadrant}) at (${spawn.x}, ${spawn.y})`)
    }

    // Emit discovered seats
    townEvents.emit('seats-discovered', workerSpawns)

    // Listen for task events from Octavius
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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup())
  }

  private cleanup() {
    for (const w of this.workers) w.destroy()
    this.workers = []
    // Unsubscribe all townEvents listeners
    for (const unsub of this.eventUnsubs) unsub()
    this.eventUnsubs = []
  }

  update() {
    // Don't process input when interaction menu is open or input is focused
    if (this.interactionOpen || isInputFocused()) {
      for (const w of this.workers) w.update()
      return
    }

    this.player.update()

    // Resume camera follow when player moves
    if (!this.cameraFollowing && this.player.isMoving()) {
      this.cameras.main.startFollow(this.player.sprite, true, CAMERA_LERP, CAMERA_LERP)
      this.cameraFollowing = true
    }

    // Update all workers
    for (const w of this.workers) w.update()

    // Find nearest worker within interaction distance
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

    this.nearestWorker = nearest

    // Show/hide "Press E" prompt
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

    // E key interaction
    if (nearest && this.eKey && Phaser.Input.Keyboard.JustDown(this.eKey)) {
      this.interactionOpen = true
      this.promptText?.setVisible(false)

      // Emit open-terminal event with the worker's seatId
      // The React HUD will handle showing the task assignment UI
      townEvents.emit('open-terminal', nearest.seatId)
    }
  }
}
