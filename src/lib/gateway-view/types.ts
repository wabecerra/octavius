// ---------------------------------------------------------------------------
// Gateway View – Type Definitions
// ---------------------------------------------------------------------------

// ---- Telemetry Event Types (Req 7.1, 2.3) --------------------------------

export type TelemetryEventType =
  | 'agent-dispatch' | 'agent-complete' | 'agent-fail'
  | 'memory-write' | 'memory-search' | 'memory-consolidation'
  | 'health-import' | 'health-checkin'
  | 'lcm-status-change'
  | 'cost-alert' | 'cost-update'
  | 'obsidian-sync' | 'obsidian-push' | 'obsidian-pull'
  | 'task-create' | 'task-complete' | 'task-update'
  | 'gateway-online' | 'gateway-offline'

export interface TelemetryEvent {
  eventId: string                          // unique, used for dedup
  type: TelemetryEventType
  subsystem: string                        // matches a roomId
  timestamp: string                        // ISO 8601
  summary: string                          // max 120 chars
  metadata?: Record<string, unknown>
}

// ---- Work State (Req 3.1) -------------------------------------------------

export type WorkState =
  | 'idle' | 'processing' | 'monitoring' | 'writing'
  | 'cataloging' | 'executing' | 'error' | 'resting'

// ---- Room Manifest types (Req 1.3, 5.2) -----------------------------------

export interface RoomDef {
  roomId: string
  label: string
  icon: string                             // emote key or sprite reference
  /** bounds: [x, y, width, height] — organic pixel rect on 1920×1080 canvas */
  bounds: [number, number, number, number]
  labelAnchor?: { x: number; y: number }
  connections: string[]                    // roomIds this room connects to
  // Legacy grid fields (deprecated — use bounds instead)
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface WaypointDef {
  id: string
  x: number
  y: number
  connectedWaypoints: string[]             // waypoint IDs
  nearestRoom: string                      // roomId
}

export interface WalkNode {
  id: string
  x: number
  y: number
  roomId: string
}

export interface WalkGraph {
  nodes: WalkNode[]
  edges: [string, string][]
}

export interface WorkZoneDef {
  id: string
  label: string
  roomId: string
  type: string
  anchor: { x: number; y: number }
  radius: number
}

export interface WalkableZone {
  id: string
  points: Array<{ x: number; y: number }>
}

export interface OccluderRect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface RoomManifest {
  meta?: { version: string; schema: string; baseResolution?: { width: number; height: number } }
  version?: number
  rooms: RoomDef[]
  waypoints: WaypointDef[]
  walkGraph?: WalkGraph
  walkableZones?: WalkableZone[]
  workZones?: WorkZoneDef[]
  occluders?: OccluderRect[]
  collisionPolygons?: unknown[]
  hubRoomId: string                        // starting room for Actor
}

// ---- Asset Manifest types (Req 4.3, 5.3) ----------------------------------

export interface ColumnDef {
  field: string
  label: string
  width: number                            // percentage or px
  truncate?: number                        // max chars before truncation
}

export interface FilterFieldDef {
  field: string
  label: string
  type: 'enum' | 'date-range' | 'text'
  options?: string[]                       // for enum type
}

export interface SortFieldDef {
  field: string
  label: string
  defaultDirection?: 'asc' | 'desc'
}

export interface RoomAssetConfig {
  roomId: string
  apiEndpoint: string                      // e.g. '/api/memory/items'
  columns: ColumnDef[]
  filters: FilterFieldDef[]
  sorts: SortFieldDef[]
  previewTemplate: string                  // 'memory-item' | 'agent-card' | 'task-card' | etc.
}

export interface AssetManifest {
  version: number
  rooms: RoomAssetConfig[]
}

// ---- Scene Art Manifest types (Req 5.4) -----------------------------------

export interface AmbientAnimDef {
  spriteKey: string
  x: number
  y: number
  frameStart: number
  frameEnd: number
  frameRate: number
}

export interface SpriteOverlayDef {
  spriteKey: string
  x: number
  y: number
  frame?: number
  scale?: number
}

export interface RoomArtConfig {
  roomId: string
  tilesetLayers: string[]                  // tileset names for this room's area
  spriteOverlays: SpriteOverlayDef[]
  ambientAnimations: AmbientAnimDef[]
}

export interface SceneArtManifest {
  version: number
  tilemap: string                          // path to tilemap JSON
  tilesets: Array<{ name: string; path: string }>
  rooms: RoomArtConfig[]
}

// ---- RoomVisual (GatewayScene rendering) ----------------------------------

export interface RoomVisual {
  roomId: string
  zone: Phaser.GameObjects.Zone            // click target
  border: Phaser.GameObjects.Graphics      // room outline
  label: Phaser.GameObjects.Text
  icon: Phaser.GameObjects.Sprite
  bounds: { x: number; y: number; width: number; height: number }
}

// ---- Queued Telemetry Event (Actor queue) ---------------------------------

export interface QueuedTelemetryEvent {
  event: TelemetryEvent
  targetRoom: RoomDef
}

// ---- Manifest Parse Result (Req 10.1, 10.5) ------------------------------

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

// ---- Polling Source (TelemetryPipeline) -----------------------------------

export interface PollingSource {
  subsystem: string
  endpoint: string
  intervalMs: number
  transform: (data: unknown) => TelemetryEvent[]
}
