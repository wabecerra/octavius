/**
 * GatewayScene — Phaser 3 scene for the Octavius Gateway View.
 *
 * Loads three manifest JSON files, builds a tilemap, renders room
 * boundaries/labels/icons as RoomVisual objects, spawns a GatewayActor at
 * the hub room, and wires up the GatewayEventBus for pointer input and
 * telemetry-driven navigation.
 *
 * Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 2.1, 2.2, 4.1, 5.1, 5.2, 5.5,
 *               8.3, 8.4
 */

import * as Phaser from 'phaser'
import { GatewayActor } from '../entities/GatewayActor'
import { Pathfinder } from '../utils/Pathfinder'
import { buildCollisionRects, buildSpriteFrames } from '../utils/MapHelpers'
import { EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, EMOTE_FRAME_SIZE, EMOTE_FRAMES } from '../config/emotes'
import { SPRITE_KEY, SPRITE_PATH } from '../config/animations'
import {
  parseRoomManifest,
  parseAssetManifest,
  parseSceneArtManifest,
} from '@/lib/gateway-view/manifest-parser'
import { gatewayEvents } from '@/lib/gateway-view/events'
import { EVENT_TO_ROOM } from '@/lib/gateway-view/constants'
import { PF_PADDING, ZOOM_DEFAULT, ZOOM_MIN, ZOOM_MAX, ZOOM_SENSITIVITY, CAMERA_LERP } from '@/lib/town/constants'
import type {
  RoomManifest,
  AssetManifest,
  SceneArtManifest,
  RoomDef,
  RoomVisual,
  TelemetryEvent,
} from '@/lib/gateway-view/types'

// ---- Manifest cache keys (loaded via Phaser loader as text) ---------------
const KEY_ROOM_MANIFEST = 'gateway-room-manifest'
const KEY_ASSET_MANIFEST = 'gateway-asset-manifest'
const KEY_SCENE_ART_MANIFEST = 'gateway-scene-art-manifest'
const KEY_TILEMAP = 'gateway-tilemap'

// ---- Visual style constants -----------------------------------------------
const ROOM_BORDER_COLOR = 0x4a9eff
const ROOM_BORDER_ALPHA = 0.6
const ROOM_BORDER_WIDTH = 2
const ROOM_FILL_COLOR = 0x1a2a4a
const ROOM_FILL_ALPHA = 0.25
const ROOM_HOVER_BORDER_COLOR = 0x88ccff
const ROOM_HOVER_FILL_ALPHA = 0.45
const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: '"SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
  fontSize: '11px',
  color: '#c9e8ff',
  align: 'center',
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

export class GatewayScene extends Phaser.Scene {
  // Parsed manifests (available after create())
  private roomManifest!: RoomManifest
  private assetManifest!: AssetManifest
  private sceneArtManifest!: SceneArtManifest

  // Scene objects
  private actor!: GatewayActor
  private rooms: Map<string, RoomVisual> = new Map()
  private pathfinder!: Pathfinder

  // Event bus unsubscribe handles
  private eventUnsubs: Array<() => void> = []

  // Error display text (shown on manifest parse failure)
  private errorText: Phaser.GameObjects.Text | null = null

  constructor() {
    super({ key: 'GatewayScene' })
  }

  // ---------------------------------------------------------------------------
  // preload — load manifests and tilemap/tileset assets
  // ---------------------------------------------------------------------------

  preload() {
    // Load the three manifest JSON files as plain text so we can parse them
    // ourselves with full validation.
    this.load.text(KEY_ROOM_MANIFEST, '/town/gateway/gateway-map.logic.json')
    this.load.text(KEY_ASSET_MANIFEST, '/town/gateway/gateway-asset.manifest.json')
    this.load.text(KEY_SCENE_ART_MANIFEST, '/town/gateway/gateway-scene-art.manifest.json')

    // Load the tilemap JSON — we need to inspect it to discover tilesets.
    // We load it as a tilemapTiledJSON so Phaser can parse it natively.
    this.load.tilemapTiledJSON(KEY_TILEMAP, '/town/gateway/maps/gateway.json')

    // NOTE: Tileset images are loaded dynamically only if they exist.
    // The scene works without them — rooms render as labeled rectangles.

    // Character sprite for the actor
    this.load.image(SPRITE_KEY, SPRITE_PATH)

    // Emote spritesheet
    this.load.spritesheet(EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, {
      frameWidth: EMOTE_FRAME_SIZE,
      frameHeight: EMOTE_FRAME_SIZE,
    })
  }

  // ---------------------------------------------------------------------------
  // create — validate manifests, build scene, wire events
  // ---------------------------------------------------------------------------

  create() {
    try {
      this._createInternal()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[GatewayScene] create() crashed:', err)
      this.handleManifestError(`Scene initialization failed: ${msg}`)
    }
  }

  private _createInternal() {
    // ---- Build sprite frames for character and emote sheets -----------------
    buildSpriteFrames(this, SPRITE_KEY)

    // ---- Set dark background ------------------------------------------------
    this.cameras.main.setBackgroundColor('#0d1117')

    // ---- Parse manifests ----------------------------------------------------

    const roomManifestRaw = this.cache.text.get(KEY_ROOM_MANIFEST) as string | undefined
    const assetManifestRaw = this.cache.text.get(KEY_ASSET_MANIFEST) as string | undefined
    const sceneArtManifestRaw = this.cache.text.get(KEY_SCENE_ART_MANIFEST) as string | undefined

    const roomResult = parseRoomManifest(roomManifestRaw ?? '')
    const assetResult = parseAssetManifest(assetManifestRaw ?? '')
    const artResult = parseSceneArtManifest(sceneArtManifestRaw ?? '')

    // Collect all parse errors
    const errors: string[] = []
    if (!roomResult.ok) errors.push(`RoomManifest: ${roomResult.error}`)
    if (!assetResult.ok) errors.push(`AssetManifest: ${assetResult.error}`)
    if (!artResult.ok) errors.push(`SceneArtManifest: ${artResult.error}`)

    if (errors.length > 0) {
      this.handleManifestError(errors.join('\n'))
      return
    }

    // TypeScript discriminated union narrowing — errors already checked above
    if (!roomResult.ok || !assetResult.ok || !artResult.ok) return
    this.roomManifest = roomResult.value
    this.assetManifest = assetResult.value
    this.sceneArtManifest = artResult.value

    // ---- Build tilemap -------------------------------------------------------

    const map = this.make.tilemap({ key: KEY_TILEMAP })
    const allTilesets: Phaser.Tilemaps.Tileset[] = []

    for (const ts of this.sceneArtManifest.tilesets) {
      // Only add if the image was actually loaded (tileset may not exist in dev)
      if (this.textures.exists(ts.name)) {
        const added = map.addTilesetImage(ts.name, ts.name)
        if (added) allTilesets.push(added)
      }
    }

    // Render tile layers if the tilemap has them
    const layerNames = ['floor', 'walls', 'ground', 'furniture', 'objects']
    for (const layerName of layerNames) {
      if (map.getLayer(layerName) && allTilesets.length > 0) {
        map.createLayer(layerName, allTilesets)
      }
    }

    // Overhead layer rendered above actor
    if (map.getLayer('overhead') && allTilesets.length > 0) {
      const overheadLayer = map.createLayer('overhead', allTilesets)
      if (overheadLayer) overheadLayer.setDepth(10)
    }

    // ---- Build Pathfinder from collision data --------------------------------

    const collisionGroup = this.physics.add.staticGroup()
    const collisionRects = buildCollisionRects(map, collisionGroup)
    this.pathfinder = new Pathfinder(
      map.widthInPixels || 640,
      map.heightInPixels || 480,
      collisionRects,
      PF_PADDING,
    )

    // ---- Render room visuals -------------------------------------------------

    for (const roomDef of this.roomManifest.rooms) {
      this.createRoomVisual(roomDef)
    }

    // ---- Spawn GatewayActor at hub room -------------------------------------

    const hubRoom = this.roomManifest.rooms.find(
      r => r.roomId === this.roomManifest.hubRoomId,
    )
    const spawnX = hubRoom ? hubRoom.x + hubRoom.width / 2 : 224
    const spawnY = hubRoom ? hubRoom.y + hubRoom.height / 2 : 224

    this.actor = new GatewayActor(this, spawnX, spawnY, this.pathfinder)

    // ---- Camera setup -------------------------------------------------------

    const mapW = map.widthInPixels || 640
    const mapH = map.heightInPixels || 480
    this.cameras.main.setBounds(0, 0, mapW, mapH)
    this.cameras.main.setZoom(ZOOM_DEFAULT)
    this.cameras.main.startFollow(this.actor.sprite, true, CAMERA_LERP, CAMERA_LERP)

    // Mouse wheel zoom
    this.input.on(
      'wheel',
      (_pointer: unknown, _gos: unknown, _dx: number, _dy: number, dz: number) => {
        const cam = this.cameras.main
        cam.setZoom(
          Phaser.Math.Clamp(cam.zoom - dz * ZOOM_SENSITIVITY, ZOOM_MIN, ZOOM_MAX),
        )
      },
    )

    // ---- Wire GatewayEventBus listeners -------------------------------------

    this.eventUnsubs.push(
      gatewayEvents.on('telemetry-event', (event: TelemetryEvent) => {
        this.handleTelemetryEvent(event)
      }),
    )

    // ---- Scene lifecycle cleanup --------------------------------------------

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup())

    // ---- Signal ready -------------------------------------------------------

    gatewayEvents.emit('gateway-scene-ready')
  }

  // ---------------------------------------------------------------------------
  // update — actor movement and telemetry-driven navigation
  // ---------------------------------------------------------------------------

  update() {
    if (!this.actor) return
    this.actor.update()
  }

  // ---------------------------------------------------------------------------
  // pause / resume — for view switching
  // ---------------------------------------------------------------------------

  pause() {
    // Freeze the physics and game loop while preserving state
    this.physics.pause()
    this.scene.pause()
  }

  resume() {
    this.physics.resume()
    this.scene.resume()
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Create a RoomVisual (border, fill, label, icon, zone) for a single room.
   */
  private createRoomVisual(roomDef: RoomDef): void {
    const { roomId, x, y, width, height, label, icon } = roomDef

    // Graphics for border + fill
    const border = this.add.graphics()
    this.drawRoomBorder(border, x, y, width, height, false)
    border.setDepth(1)

    // Label centred at bottom of room
    const labelText = this.add
      .text(x + width / 2, y + height - 14, label, LABEL_STYLE)
      .setOrigin(0.5, 0.5)
      .setDepth(3)
      .setResolution(window.devicePixelRatio * 2)

    // Icon sprite (emote frame)
    const frameIdx = EMOTE_FRAMES[icon] ?? 0
    const iconSprite = this.add
      .sprite(x + width / 2, y + 20, EMOTE_SHEET_KEY, frameIdx)
      .setDepth(3)
      .setScale(0.5)

    // Interactive zone covering the room area
    const zone = this.add
      .zone(x + width / 2, y + height / 2, width, height)
      .setDepth(2)
      .setInteractive({ useHandCursor: true })

    // Hover effects
    zone.on('pointerover', () => {
      this.drawRoomBorder(border, x, y, width, height, true)
    })
    zone.on('pointerout', () => {
      this.drawRoomBorder(border, x, y, width, height, false)
    })

    // Click → emit room-clicked and room-modal-open on the bus
    zone.on('pointerdown', () => {
      gatewayEvents.emit('room-clicked', roomId)
      gatewayEvents.emit('room-modal-open', roomId)
    })

    const visual: RoomVisual = {
      roomId,
      zone,
      border,
      label: labelText,
      icon: iconSprite,
      bounds: { x, y, width, height },
    }

    this.rooms.set(roomId, visual)
  }

  /**
   * Draw (or redraw) the room border + fill graphics.
   */
  private drawRoomBorder(
    gfx: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    hovered: boolean,
  ): void {
    gfx.clear()
    gfx.fillStyle(ROOM_FILL_COLOR, hovered ? ROOM_HOVER_FILL_ALPHA : ROOM_FILL_ALPHA)
    gfx.fillRect(x, y, width, height)
    gfx.lineStyle(
      ROOM_BORDER_WIDTH,
      hovered ? ROOM_HOVER_BORDER_COLOR : ROOM_BORDER_COLOR,
      ROOM_BORDER_ALPHA,
    )
    gfx.strokeRect(x, y, width, height)
  }

  /**
   * Handle an incoming telemetry event: find the target room and enqueue it
   * on the actor.
   */
  private handleTelemetryEvent(event: TelemetryEvent): void {
    const targetRoomId = EVENT_TO_ROOM[event.type]
    if (!targetRoomId) return

    const targetRoom = this.roomManifest?.rooms.find(r => r.roomId === targetRoomId)
    if (!targetRoom) return

    this.actor.enqueueEvent(event, targetRoom)
  }

  /**
   * Display an error message in the scene, log to console, and emit the
   * gateway-scene-error event on the bus.
   */
  private handleManifestError(message: string): void {
    console.error('[GatewayScene] Manifest parse failure:', message)

    const cx = this.cameras.main.width / 2
    const cy = this.cameras.main.height / 2

    this.errorText = this.add
      .text(cx, cy, `Gateway Scene Error\n\n${message}`, ERROR_STYLE)
      .setOrigin(0.5, 0.5)
      .setDepth(100)
      .setScrollFactor(0)

    gatewayEvents.emit('gateway-scene-error', message)
  }

  /**
   * Clean up all resources and event subscriptions.
   */
  private cleanup(): void {
    for (const unsub of this.eventUnsubs) unsub()
    this.eventUnsubs = []

    if (this.actor) {
      this.actor.destroy()
    }

    for (const visual of this.rooms.values()) {
      visual.zone.destroy()
      visual.border.destroy()
      visual.label.destroy()
      visual.icon.destroy()
    }
    this.rooms.clear()

    if (this.errorText) {
      this.errorText.destroy()
      this.errorText = null
    }
  }
}
