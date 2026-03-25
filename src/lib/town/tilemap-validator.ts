/**
 * Tilemap JSON validator for the Nerve Center multi-room scene.
 * Validates Tiled-format JSON structure: required layers, spawn points.
 * Validates: Requirements 10.1, 10.2, 10.3
 */

import type { Direction } from '../../components/town/game/config/animations'

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface SpawnDef {
  name: string
  x: number
  y: number
  facing: Direction
}

export interface TilemapValidationResult {
  ok: boolean
  errors: string[]
  spawns: {
    boss: SpawnDef | null
    workers: SpawnDef[]
  }
}

// ---------------------------------------------------------------------------
// Internal Tiled JSON shape helpers
// ---------------------------------------------------------------------------

interface TiledProperty {
  name: string
  type?: string
  value: unknown
}

interface TiledObject {
  name?: string
  x?: number
  y?: number
  properties?: TiledProperty[]
}

interface TiledLayer {
  name?: string
  type?: string
  objects?: TiledObject[]
}

interface TiledMap {
  layers?: TiledLayer[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_DIRECTIONS = new Set<string>(['up', 'down', 'left', 'right'])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function getFacing(obj: TiledObject): Direction {
  const props = obj.properties
  if (!Array.isArray(props)) return 'down'
  const facingProp = props.find(p => p.name === 'facing')
  if (facingProp && typeof facingProp.value === 'string' && VALID_DIRECTIONS.has(facingProp.value)) {
    return facingProp.value as Direction
  }
  return 'down'
}

function toSpawnDef(obj: TiledObject): SpawnDef {
  return {
    name: obj.name ?? '',
    x: typeof obj.x === 'number' ? obj.x : 0,
    y: typeof obj.y === 'number' ? obj.y : 0,
    facing: getFacing(obj),
  }
}

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

export function validateNerveCenterTilemap(mapData: unknown): TilemapValidationResult {
  const errors: string[] = []
  const result: TilemapValidationResult = {
    ok: false,
    errors,
    spawns: { boss: null, workers: [] },
  }

  // Basic shape check
  if (!isRecord(mapData) || !Array.isArray((mapData as TiledMap).layers)) {
    errors.push('Invalid tilemap: missing "layers" array')
    return result
  }

  const layers = (mapData as TiledMap).layers!

  // Required layers
  const REQUIRED_LAYERS: Array<{ name: string; type: string }> = [
    { name: 'floor', type: 'tilelayer' },
    { name: 'collisions', type: 'objectgroup' },
    { name: 'spawns', type: 'objectgroup' },
  ]

  for (const req of REQUIRED_LAYERS) {
    const found = layers.find(l => l.name === req.name && l.type === req.type)
    if (!found) {
      errors.push(`Missing required layer: "${req.name}" (expected type: ${req.type})`)
    }
  }

  // If any required layer is missing, return early
  if (errors.length > 0) {
    return result
  }

  // Extract spawns
  const spawnsLayer = layers.find(l => l.name === 'spawns' && l.type === 'objectgroup')!
  const objects = spawnsLayer.objects ?? []

  const bossObj = objects.find(o => o.name === 'boss')
  if (bossObj) {
    result.spawns.boss = toSpawnDef(bossObj)
  } else {
    errors.push('Spawns layer missing required "boss" spawn point')
  }

  const workerObjs = objects.filter(o => o.name !== 'boss' && o.name !== undefined && o.name !== '')
  result.spawns.workers = workerObjs.map(toSpawnDef)

  if (workerObjs.length === 0) {
    errors.push('Spawns layer missing worker spawn points (need at least one)')
  }

  result.ok = errors.length === 0
  return result
}
