// ---------------------------------------------------------------------------
// Gateway View – Manifest Parsers (Req 1.6, 5.2, 5.3, 5.5, 10.1, 10.2, 10.5)
// ---------------------------------------------------------------------------

import type {
  ParseResult,
  RoomManifest,
  RoomDef,
  WaypointDef,
  AssetManifest,
  RoomAssetConfig,
  SceneArtManifest,
  RoomArtConfig,
} from './types'

// ---- Helpers --------------------------------------------------------------

function fail<T>(error: string): ParseResult<T> {
  return { ok: false, error }
}

function ok<T>(value: T): ParseResult<T> {
  return { ok: true, value }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function requireString(obj: Record<string, unknown>, field: string, ctx: string): string | null {
  if (typeof obj[field] !== 'string') return `${ctx}: "${field}" must be a string`
  return null
}

function requireNumber(obj: Record<string, unknown>, field: string, ctx: string): string | null {
  if (typeof obj[field] !== 'number') return `${ctx}: "${field}" must be a number`
  return null
}

function requireArray(obj: Record<string, unknown>, field: string, ctx: string): string | null {
  if (!Array.isArray(obj[field])) return `${ctx}: "${field}" must be an array`
  return null
}

function requireStringArray(obj: Record<string, unknown>, field: string, ctx: string): string | null {
  const err = requireArray(obj, field, ctx)
  if (err) return err
  const arr = obj[field] as unknown[]
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] !== 'string') return `${ctx}: "${field}[${i}]" must be a string`
  }
  return null
}

// ---- RoomDef validation ---------------------------------------------------

function validateRoomDef(raw: unknown, index: number): string | null {
  const ctx = `rooms[${index}]`
  if (!isObject(raw)) return `${ctx}: must be an object`

  const idErr = requireString(raw, 'roomId', ctx)
  if (idErr) return idErr
  const labelErr = requireString(raw, 'label', ctx)
  if (labelErr) return labelErr
  const iconErr = requireString(raw, 'icon', ctx)
  if (iconErr) return iconErr

  // Accept either bounds array or legacy x/y/width/height
  const hasBounds = Array.isArray(raw.bounds) && (raw.bounds as unknown[]).length === 4
  const hasLegacy = typeof raw.x === 'number' && typeof raw.y === 'number'
    && typeof raw.width === 'number' && typeof raw.height === 'number'

  if (!hasBounds && !hasLegacy) {
    return `${ctx}: must have either "bounds" array [x,y,w,h] or x/y/width/height fields`
  }

  const connErr = requireStringArray(raw, 'connections', ctx)
  if (connErr) return connErr

  return null
}

// ---- WaypointDef validation -----------------------------------------------

function validateWaypointDef(raw: unknown, index: number): string | null {
  const ctx = `waypoints[${index}]`
  if (!isObject(raw)) return `${ctx}: must be an object`
  return (
    requireString(raw, 'id', ctx) ??
    requireNumber(raw, 'x', ctx) ??
    requireNumber(raw, 'y', ctx) ??
    requireStringArray(raw, 'connectedWaypoints', ctx) ??
    requireString(raw, 'nearestRoom', ctx)
  )
}

// ---- parseRoomManifest ----------------------------------------------------

export function parseRoomManifest(json: string): ParseResult<RoomManifest> {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return fail('Invalid JSON: failed to parse RoomManifest')
  }

  if (!isObject(raw)) return fail('RoomManifest: root must be an object')

  // Version can be in meta.version or top-level version
  const hasMeta = isObject(raw.meta)
  const hasVersion = typeof raw.version === 'number'
  if (!hasMeta && !hasVersion) {
    const verr = requireNumber(raw, 'version', 'RoomManifest')
    if (verr) return fail(verr)
  }

  const rerr = requireArray(raw, 'rooms', 'RoomManifest')
  if (rerr) return fail(rerr)

  const rooms = raw.rooms as unknown[]
  for (let i = 0; i < rooms.length; i++) {
    const err = validateRoomDef(rooms[i], i)
    if (err) return fail(`RoomManifest.${err}`)
  }

  // Waypoints are optional in v2 (walk graph replaces them)
  const waypoints: unknown[] = Array.isArray(raw.waypoints) ? raw.waypoints as unknown[] : []
  for (let i = 0; i < waypoints.length; i++) {
    const err = validateWaypointDef(waypoints[i], i)
    if (err) return fail(`RoomManifest.${err}`)
  }

  const herr = requireString(raw, 'hubRoomId', 'RoomManifest')
  if (herr) return fail(herr)

  return ok({
    meta: hasMeta ? raw.meta as RoomManifest['meta'] : undefined,
    version: hasVersion ? raw.version as number : undefined,
    rooms: rooms as RoomDef[],
    waypoints: waypoints as WaypointDef[],
    walkGraph: isObject(raw.walkGraph) ? raw.walkGraph as RoomManifest['walkGraph'] : undefined,
    walkableZones: Array.isArray(raw.walkableZones) ? raw.walkableZones as RoomManifest['walkableZones'] : undefined,
    workZones: Array.isArray(raw.workZones) ? raw.workZones as RoomManifest['workZones'] : undefined,
    occluders: Array.isArray(raw.occluders) ? raw.occluders as RoomManifest['occluders'] : undefined,
    collisionPolygons: Array.isArray(raw.collisionPolygons) ? raw.collisionPolygons as RoomManifest['collisionPolygons'] : undefined,
    hubRoomId: raw.hubRoomId as string,
  })
}

// ---- ColumnDef validation -------------------------------------------------

function validateColumnDef(raw: unknown, index: number, ctx: string): string | null {
  const path = `${ctx}.columns[${index}]`
  if (!isObject(raw)) return `${path}: must be an object`
  return (
    requireString(raw, 'field', path) ??
    requireString(raw, 'label', path) ??
    requireNumber(raw, 'width', path)
  )
  // truncate is optional
}

// ---- FilterFieldDef validation --------------------------------------------

const VALID_FILTER_TYPES = new Set(['enum', 'date-range', 'text'])

function validateFilterFieldDef(raw: unknown, index: number, ctx: string): string | null {
  const path = `${ctx}.filters[${index}]`
  if (!isObject(raw)) return `${path}: must be an object`
  const err =
    requireString(raw, 'field', path) ??
    requireString(raw, 'label', path) ??
    requireString(raw, 'type', path)
  if (err) return err
  if (!VALID_FILTER_TYPES.has(raw.type as string)) {
    return `${path}: "type" must be one of enum, date-range, text`
  }
  // options is optional, but if present must be string[]
  if (raw.options !== undefined) {
    if (!Array.isArray(raw.options)) return `${path}: "options" must be an array`
    for (let j = 0; j < (raw.options as unknown[]).length; j++) {
      if (typeof (raw.options as unknown[])[j] !== 'string') {
        return `${path}: "options[${j}]" must be a string`
      }
    }
  }
  return null
}

// ---- SortFieldDef validation ----------------------------------------------

function validateSortFieldDef(raw: unknown, index: number, ctx: string): string | null {
  const path = `${ctx}.sorts[${index}]`
  if (!isObject(raw)) return `${path}: must be an object`
  const err =
    requireString(raw, 'field', path) ??
    requireString(raw, 'label', path)
  if (err) return err
  if (raw.defaultDirection !== undefined) {
    if (raw.defaultDirection !== 'asc' && raw.defaultDirection !== 'desc') {
      return `${path}: "defaultDirection" must be "asc" or "desc"`
    }
  }
  return null
}

// ---- RoomAssetConfig validation -------------------------------------------

function validateRoomAssetConfig(raw: unknown, index: number): string | null {
  const ctx = `rooms[${index}]`
  if (!isObject(raw)) return `${ctx}: must be an object`

  const err =
    requireString(raw, 'roomId', ctx) ??
    requireString(raw, 'apiEndpoint', ctx) ??
    requireArray(raw, 'columns', ctx) ??
    requireArray(raw, 'filters', ctx) ??
    requireArray(raw, 'sorts', ctx) ??
    requireString(raw, 'previewTemplate', ctx)
  if (err) return err

  const columns = raw.columns as unknown[]
  for (let i = 0; i < columns.length; i++) {
    const cerr = validateColumnDef(columns[i], i, ctx)
    if (cerr) return cerr
  }

  const filters = raw.filters as unknown[]
  for (let i = 0; i < filters.length; i++) {
    const ferr = validateFilterFieldDef(filters[i], i, ctx)
    if (ferr) return ferr
  }

  const sorts = raw.sorts as unknown[]
  for (let i = 0; i < sorts.length; i++) {
    const serr = validateSortFieldDef(sorts[i], i, ctx)
    if (serr) return serr
  }

  return null
}

// ---- parseAssetManifest ---------------------------------------------------

export function parseAssetManifest(json: string): ParseResult<AssetManifest> {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return fail('Invalid JSON: failed to parse AssetManifest')
  }

  if (!isObject(raw)) return fail('AssetManifest: root must be an object')

  const verr = requireNumber(raw, 'version', 'AssetManifest')
  if (verr) return fail(verr)

  const rerr = requireArray(raw, 'rooms', 'AssetManifest')
  if (rerr) return fail(rerr)

  const rooms = raw.rooms as unknown[]
  for (let i = 0; i < rooms.length; i++) {
    const err = validateRoomAssetConfig(rooms[i], i)
    if (err) return fail(`AssetManifest.${err}`)
  }

  return ok({
    version: raw.version as number,
    rooms: rooms as RoomAssetConfig[],
  })
}

// ---- AmbientAnimDef validation --------------------------------------------

function validateAmbientAnimDef(raw: unknown, index: number, ctx: string): string | null {
  const path = `${ctx}.ambientAnimations[${index}]`
  if (!isObject(raw)) return `${path}: must be an object`
  return (
    requireString(raw, 'spriteKey', path) ??
    requireNumber(raw, 'x', path) ??
    requireNumber(raw, 'y', path) ??
    requireNumber(raw, 'frameStart', path) ??
    requireNumber(raw, 'frameEnd', path) ??
    requireNumber(raw, 'frameRate', path)
  )
}

// ---- SpriteOverlayDef validation ------------------------------------------

function validateSpriteOverlayDef(raw: unknown, index: number, ctx: string): string | null {
  const path = `${ctx}.spriteOverlays[${index}]`
  if (!isObject(raw)) return `${path}: must be an object`
  const err =
    requireString(raw, 'spriteKey', path) ??
    requireNumber(raw, 'x', path) ??
    requireNumber(raw, 'y', path)
  if (err) return err
  if (raw.frame !== undefined && typeof raw.frame !== 'number') {
    return `${path}: "frame" must be a number`
  }
  if (raw.scale !== undefined && typeof raw.scale !== 'number') {
    return `${path}: "scale" must be a number`
  }
  return null
}

// ---- RoomArtConfig validation ---------------------------------------------

function validateRoomArtConfig(raw: unknown, index: number): string | null {
  const ctx = `rooms[${index}]`
  if (!isObject(raw)) return `${ctx}: must be an object`

  const err =
    requireString(raw, 'roomId', ctx) ??
    requireStringArray(raw, 'tilesetLayers', ctx) ??
    requireArray(raw, 'spriteOverlays', ctx) ??
    requireArray(raw, 'ambientAnimations', ctx)
  if (err) return err

  const overlays = raw.spriteOverlays as unknown[]
  for (let i = 0; i < overlays.length; i++) {
    const oerr = validateSpriteOverlayDef(overlays[i], i, ctx)
    if (oerr) return oerr
  }

  const anims = raw.ambientAnimations as unknown[]
  for (let i = 0; i < anims.length; i++) {
    const aerr = validateAmbientAnimDef(anims[i], i, ctx)
    if (aerr) return aerr
  }

  return null
}

// ---- parseSceneArtManifest ------------------------------------------------

export function parseSceneArtManifest(json: string): ParseResult<SceneArtManifest> {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return fail('Invalid JSON: failed to parse SceneArtManifest')
  }

  if (!isObject(raw)) return fail('SceneArtManifest: root must be an object')

  const verr = requireNumber(raw, 'version', 'SceneArtManifest')
  if (verr) return fail(verr)

  const terr = requireString(raw, 'tilemap', 'SceneArtManifest')
  if (terr) return fail(terr)

  const tserr = requireArray(raw, 'tilesets', 'SceneArtManifest')
  if (tserr) return fail(tserr)

  const tilesets = raw.tilesets as unknown[]
  for (let i = 0; i < tilesets.length; i++) {
    const ts = tilesets[i]
    const ctx = `SceneArtManifest.tilesets[${i}]`
    if (!isObject(ts)) return fail(`${ctx}: must be an object`)
    const nerr = requireString(ts, 'name', ctx)
    if (nerr) return fail(nerr)
    const perr = requireString(ts, 'path', ctx)
    if (perr) return fail(perr)
  }

  const rerr = requireArray(raw, 'rooms', 'SceneArtManifest')
  if (rerr) return fail(rerr)

  const rooms = raw.rooms as unknown[]
  for (let i = 0; i < rooms.length; i++) {
    const err = validateRoomArtConfig(rooms[i], i)
    if (err) return fail(`SceneArtManifest.${err}`)
  }

  return ok({
    version: raw.version as number,
    tilemap: raw.tilemap as string,
    tilesets: tilesets as Array<{ name: string; path: string }>,
    rooms: rooms as RoomArtConfig[],
  })
}
