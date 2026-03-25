// ---------------------------------------------------------------------------
// Unit tests: Manifest parser error cases
// Validates: Requirements 10.2, 5.5
// ---------------------------------------------------------------------------
// Requirement 10.2: WHEN an invalid manifest JSON string is provided,
//   THE Manifest_Parser SHALL return a descriptive error identifying the
//   first invalid or missing field.
// Requirement 5.5: IF any manifest file fails validation against the expected
//   TypeScript interface, THEN THE Gateway_View SHALL log a descriptive error
//   identifying the invalid field.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import {
  parseRoomManifest,
  parseAssetManifest,
  parseSceneArtManifest,
} from './manifest-parser'

// ---- Minimal valid fixtures -----------------------------------------------

const validRoomManifest = {
  version: 1,
  rooms: [
    {
      roomId: 'room-hub',
      label: 'Hub',
      icon: 'emote:star',
      x: 100,
      y: 100,
      width: 64,
      height: 64,
      connections: ['room-memory'],
    },
  ],
  waypoints: [
    {
      id: 'wp-1',
      x: 120,
      y: 120,
      connectedWaypoints: ['wp-2'],
      nearestRoom: 'room-hub',
    },
  ],
  hubRoomId: 'room-hub',
}

const validAssetManifest = {
  version: 1,
  rooms: [
    {
      roomId: 'room-memory',
      apiEndpoint: '/api/memory/items',
      columns: [{ field: 'text', label: 'Text', width: 50 }],
      filters: [{ field: 'type', label: 'Type', type: 'enum', options: ['a'] }],
      sorts: [{ field: 'created_at', label: 'Created', defaultDirection: 'desc' }],
      previewTemplate: 'memory-item',
    },
  ],
}

const validSceneArtManifest = {
  version: 1,
  tilemap: 'maps/gateway.json',
  tilesets: [{ name: 'base', path: 'tilesets/base.png' }],
  rooms: [
    {
      roomId: 'room-hub',
      tilesetLayers: ['ground', 'walls'],
      spriteOverlays: [{ spriteKey: 'desk', x: 10, y: 20 }],
      ambientAnimations: [
        { spriteKey: 'fire', x: 5, y: 5, frameStart: 0, frameEnd: 3, frameRate: 8 },
      ],
    },
  ],
}

// ---- Helper: assert parse failure with error containing a keyword ----------

function expectFailure(
  result: { ok: boolean; error?: string },
  keyword: string,
) {
  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect((result as { ok: false; error: string }).error).toContain(keyword)
  }
}

// ===========================================================================
// parseRoomManifest
// ===========================================================================

describe('parseRoomManifest', () => {
  it('parses a valid manifest', () => {
    const result = parseRoomManifest(JSON.stringify(validRoomManifest))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.hubRoomId).toBe('room-hub')
      expect(result.value.rooms).toHaveLength(1)
      expect(result.value.rooms[0].roomId).toBe('room-hub')
      expect(result.value.waypoints).toHaveLength(1)
    }
  })

  // ---- Invalid JSON -------------------------------------------------------

  it('returns error on invalid JSON', () => {
    expectFailure(parseRoomManifest('not json'), 'Invalid JSON')
  })

  it('returns error on empty string', () => {
    expectFailure(parseRoomManifest(''), 'Invalid JSON')
  })

  // ---- Root-level issues --------------------------------------------------

  it('returns error when root is not an object', () => {
    expectFailure(parseRoomManifest('"hello"'), 'root must be an object')
  })

  it('returns error when root is an array', () => {
    expectFailure(parseRoomManifest('[]'), 'root must be an object')
  })

  it('returns error when root is null', () => {
    expectFailure(parseRoomManifest('null'), 'root must be an object')
  })

  // ---- Missing required fields --------------------------------------------

  it('returns error when version is missing', () => {
    expectFailure(
      parseRoomManifest(JSON.stringify({ rooms: [], waypoints: [], hubRoomId: 'x' })),
      'version',
    )
  })

  it('returns error when rooms is missing', () => {
    expectFailure(
      parseRoomManifest(JSON.stringify({ version: 1, waypoints: [], hubRoomId: 'x' })),
      'rooms',
    )
  })

  it('accepts manifest when waypoints is missing (v2 format)', () => {
    const result = parseRoomManifest(JSON.stringify({ version: 1, rooms: [], hubRoomId: 'x' }))
    expect(result.ok).toBe(true)
  })

  it('returns error when hubRoomId is missing', () => {
    const { hubRoomId, ...rest } = validRoomManifest
    expectFailure(parseRoomManifest(JSON.stringify(rest)), 'hubRoomId')
  })

  // ---- Wrong types for top-level fields -----------------------------------

  it('returns error when version is a string', () => {
    expectFailure(
      parseRoomManifest(JSON.stringify({ ...validRoomManifest, version: 'one' })),
      'version',
    )
  })

  it('returns error when rooms is not an array', () => {
    expectFailure(
      parseRoomManifest(JSON.stringify({ version: 1, rooms: 'bad', waypoints: [], hubRoomId: 'x' })),
      'rooms',
    )
  })

  it('accepts manifest when waypoints is an object (treated as absent)', () => {
    const result = parseRoomManifest(JSON.stringify({ version: 1, rooms: [], waypoints: {}, hubRoomId: 'x' }))
    // Non-array waypoints are treated as empty (not an error in v2)
    expect(result.ok).toBe(true)
  })

  it('returns error when hubRoomId is a number', () => {
    expectFailure(
      parseRoomManifest(JSON.stringify({ ...validRoomManifest, hubRoomId: 42 })),
      'hubRoomId',
    )
  })

  // ---- RoomDef field errors -----------------------------------------------

  it('returns error when a room entry is not an object', () => {
    expectFailure(
      parseRoomManifest(JSON.stringify({ ...validRoomManifest, rooms: ['not-an-object'] })),
      'rooms[0]',
    )
  })

  it('returns error when room is missing roomId', () => {
    const bad = {
      ...validRoomManifest,
      rooms: [{ label: 'X', icon: 'i', x: 0, y: 0, width: 1, height: 1, connections: [] }],
    }
    expectFailure(parseRoomManifest(JSON.stringify(bad)), 'roomId')
  })

  it('returns error when room label is a number', () => {
    const bad = {
      ...validRoomManifest,
      rooms: [{ roomId: 'r', label: 123, icon: 'i', x: 0, y: 0, width: 1, height: 1, connections: [] }],
    }
    expectFailure(parseRoomManifest(JSON.stringify(bad)), 'label')
  })

  it('returns error when room x is a string', () => {
    const bad = {
      ...validRoomManifest,
      rooms: [{ roomId: 'r', label: 'L', icon: 'i', x: 'ten', y: 0, width: 1, height: 1, connections: [] }],
    }
    expectFailure(parseRoomManifest(JSON.stringify(bad)), 'x')
  })

  it('returns error when room connections is not an array', () => {
    const bad = {
      ...validRoomManifest,
      rooms: [{ roomId: 'r', label: 'L', icon: 'i', x: 0, y: 0, width: 1, height: 1, connections: 'room-a' }],
    }
    expectFailure(parseRoomManifest(JSON.stringify(bad)), 'connections')
  })

  it('returns error when room connections contains a non-string', () => {
    const bad = {
      ...validRoomManifest,
      rooms: [{ roomId: 'r', label: 'L', icon: 'i', x: 0, y: 0, width: 1, height: 1, connections: [42] }],
    }
    expectFailure(parseRoomManifest(JSON.stringify(bad)), 'connections[0]')
  })

  // ---- WaypointDef field errors -------------------------------------------

  it('returns error when waypoint entry is not an object', () => {
    expectFailure(
      parseRoomManifest(JSON.stringify({ ...validRoomManifest, waypoints: [null] })),
      'waypoints[0]',
    )
  })

  it('returns error when waypoint is missing id', () => {
    const bad = {
      ...validRoomManifest,
      waypoints: [{ x: 0, y: 0, connectedWaypoints: [], nearestRoom: 'r' }],
    }
    expectFailure(parseRoomManifest(JSON.stringify(bad)), 'id')
  })

  it('returns error when waypoint is missing nearestRoom', () => {
    const bad = {
      ...validRoomManifest,
      waypoints: [{ id: 'wp', x: 0, y: 0, connectedWaypoints: [] }],
    }
    expectFailure(parseRoomManifest(JSON.stringify(bad)), 'nearestRoom')
  })

  it('returns error when waypoint connectedWaypoints contains a non-string', () => {
    const bad = {
      ...validRoomManifest,
      waypoints: [{ id: 'wp', x: 0, y: 0, connectedWaypoints: [99], nearestRoom: 'r' }],
    }
    expectFailure(parseRoomManifest(JSON.stringify(bad)), 'connectedWaypoints[0]')
  })

  // ---- Empty arrays (valid — parser should accept) ------------------------

  it('accepts empty rooms array', () => {
    const m = { ...validRoomManifest, rooms: [] }
    const result = parseRoomManifest(JSON.stringify(m))
    expect(result.ok).toBe(true)
  })

  it('accepts empty waypoints array', () => {
    const m = { ...validRoomManifest, waypoints: [] }
    const result = parseRoomManifest(JSON.stringify(m))
    expect(result.ok).toBe(true)
  })
})


// ===========================================================================
// parseAssetManifest
// ===========================================================================

describe('parseAssetManifest', () => {
  it('parses a valid manifest', () => {
    const result = parseAssetManifest(JSON.stringify(validAssetManifest))
    expect(result).toEqual({ ok: true, value: validAssetManifest })
  })

  // ---- Invalid JSON -------------------------------------------------------

  it('returns error on invalid JSON', () => {
    expectFailure(parseAssetManifest('{bad'), 'Invalid JSON')
  })

  it('returns error on empty string', () => {
    expectFailure(parseAssetManifest(''), 'Invalid JSON')
  })

  // ---- Root-level issues --------------------------------------------------

  it('returns error when root is not an object', () => {
    expectFailure(parseAssetManifest('42'), 'root must be an object')
  })

  it('returns error when root is an array', () => {
    expectFailure(parseAssetManifest('[1,2]'), 'root must be an object')
  })

  // ---- Missing / wrong-type top-level fields ------------------------------

  it('returns error when version is missing', () => {
    expectFailure(
      parseAssetManifest(JSON.stringify({ rooms: [] })),
      'version',
    )
  })

  it('returns error when version is a string', () => {
    expectFailure(
      parseAssetManifest(JSON.stringify({ version: 'v1', rooms: [] })),
      'version',
    )
  })

  it('returns error when rooms is missing', () => {
    expectFailure(
      parseAssetManifest(JSON.stringify({ version: 1 })),
      'rooms',
    )
  })

  it('returns error when rooms is not an array', () => {
    expectFailure(
      parseAssetManifest(JSON.stringify({ version: 1, rooms: {} })),
      'rooms',
    )
  })

  // ---- RoomAssetConfig field errors ---------------------------------------

  it('returns error when room entry is not an object', () => {
    expectFailure(
      parseAssetManifest(JSON.stringify({ version: 1, rooms: ['bad'] })),
      'rooms[0]',
    )
  })

  it('returns error when room is missing roomId', () => {
    const bad = {
      version: 1,
      rooms: [{
        apiEndpoint: '/api', previewTemplate: 'x',
        columns: [], filters: [], sorts: [],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'roomId')
  })

  it('returns error when room is missing apiEndpoint', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', previewTemplate: 'x',
        columns: [], filters: [], sorts: [],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'apiEndpoint')
  })

  it('returns error when room is missing previewTemplate', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api',
        columns: [], filters: [], sorts: [],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'previewTemplate')
  })

  it('returns error when room columns is not an array', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api', previewTemplate: 'x',
        columns: 'bad', filters: [], sorts: [],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'columns')
  })

  // ---- ColumnDef errors ---------------------------------------------------

  it('returns error when column is missing field', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api', previewTemplate: 'x',
        columns: [{ label: 'L', width: 10 }],
        filters: [], sorts: [],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'field')
  })

  it('returns error when column is missing label', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api', previewTemplate: 'x',
        columns: [{ field: 'f', width: 10 }],
        filters: [], sorts: [],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'label')
  })

  it('returns error when column width is a string', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api', previewTemplate: 'x',
        columns: [{ field: 'f', label: 'L', width: 'wide' }],
        filters: [], sorts: [],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'width')
  })

  it('returns error when column entry is not an object', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api', previewTemplate: 'x',
        columns: [null],
        filters: [], sorts: [],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'columns[0]')
  })

  // ---- FilterFieldDef errors ----------------------------------------------

  it('returns error when filter type is invalid', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api', previewTemplate: 'x',
        columns: [], sorts: [],
        filters: [{ field: 'f', label: 'L', type: 'invalid' }],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'type')
  })

  it('returns error when filter is missing field', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api', previewTemplate: 'x',
        columns: [], sorts: [],
        filters: [{ label: 'L', type: 'text' }],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'field')
  })

  it('returns error when filter options is not an array', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api', previewTemplate: 'x',
        columns: [], sorts: [],
        filters: [{ field: 'f', label: 'L', type: 'enum', options: 'not-array' }],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'options')
  })

  it('returns error when filter options contains a non-string', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api', previewTemplate: 'x',
        columns: [], sorts: [],
        filters: [{ field: 'f', label: 'L', type: 'enum', options: [123] }],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'options[0]')
  })

  // ---- SortFieldDef errors ------------------------------------------------

  it('returns error when sort defaultDirection is invalid', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api', previewTemplate: 'x',
        columns: [], filters: [],
        sorts: [{ field: 'f', label: 'L', defaultDirection: 'sideways' }],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'defaultDirection')
  })

  it('returns error when sort is missing field', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api', previewTemplate: 'x',
        columns: [], filters: [],
        sorts: [{ label: 'L' }],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'field')
  })

  it('returns error when sort entry is not an object', () => {
    const bad = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api', previewTemplate: 'x',
        columns: [], filters: [],
        sorts: [42],
      }],
    }
    expectFailure(parseAssetManifest(JSON.stringify(bad)), 'sorts[0]')
  })

  // ---- Empty arrays (valid) -----------------------------------------------

  it('accepts empty rooms array', () => {
    const result = parseAssetManifest(JSON.stringify({ version: 1, rooms: [] }))
    expect(result.ok).toBe(true)
  })

  it('accepts room with empty columns, filters, and sorts', () => {
    const m = {
      version: 1,
      rooms: [{
        roomId: 'r', apiEndpoint: '/api', previewTemplate: 'x',
        columns: [], filters: [], sorts: [],
      }],
    }
    const result = parseAssetManifest(JSON.stringify(m))
    expect(result.ok).toBe(true)
  })
})


// ===========================================================================
// parseSceneArtManifest
// ===========================================================================

describe('parseSceneArtManifest', () => {
  it('parses a valid manifest', () => {
    const result = parseSceneArtManifest(JSON.stringify(validSceneArtManifest))
    expect(result).toEqual({ ok: true, value: validSceneArtManifest })
  })

  // ---- Invalid JSON -------------------------------------------------------

  it('returns error on invalid JSON', () => {
    expectFailure(parseSceneArtManifest('nope'), 'Invalid JSON')
  })

  it('returns error on empty string', () => {
    expectFailure(parseSceneArtManifest(''), 'Invalid JSON')
  })

  // ---- Root-level issues --------------------------------------------------

  it('returns error when root is not an object', () => {
    expectFailure(parseSceneArtManifest('true'), 'root must be an object')
  })

  it('returns error when root is an array', () => {
    expectFailure(parseSceneArtManifest('[]'), 'root must be an object')
  })

  // ---- Missing / wrong-type top-level fields ------------------------------

  it('returns error when version is missing', () => {
    expectFailure(
      parseSceneArtManifest(JSON.stringify({ tilemap: 'x', tilesets: [], rooms: [] })),
      'version',
    )
  })

  it('returns error when version is a boolean', () => {
    expectFailure(
      parseSceneArtManifest(JSON.stringify({ version: true, tilemap: 'x', tilesets: [], rooms: [] })),
      'version',
    )
  })

  it('returns error when tilemap is missing', () => {
    expectFailure(
      parseSceneArtManifest(JSON.stringify({ version: 1, tilesets: [], rooms: [] })),
      'tilemap',
    )
  })

  it('returns error when tilemap is a number', () => {
    expectFailure(
      parseSceneArtManifest(JSON.stringify({ version: 1, tilemap: 42, tilesets: [], rooms: [] })),
      'tilemap',
    )
  })

  it('returns error when tilesets is missing', () => {
    expectFailure(
      parseSceneArtManifest(JSON.stringify({ version: 1, tilemap: 'x', rooms: [] })),
      'tilesets',
    )
  })

  it('returns error when rooms is missing', () => {
    expectFailure(
      parseSceneArtManifest(JSON.stringify({ version: 1, tilemap: 'x', tilesets: [] })),
      'rooms',
    )
  })

  // ---- Tileset entry errors -----------------------------------------------

  it('returns error when tileset entry is not an object', () => {
    expectFailure(
      parseSceneArtManifest(JSON.stringify({ version: 1, tilemap: 'x', tilesets: ['bad'], rooms: [] })),
      'tilesets[0]',
    )
  })

  it('returns error when tileset entry is missing name', () => {
    const bad = { version: 1, tilemap: 'x', tilesets: [{ path: 'p.png' }], rooms: [] }
    expectFailure(parseSceneArtManifest(JSON.stringify(bad)), 'name')
  })

  it('returns error when tileset entry is missing path', () => {
    const bad = { version: 1, tilemap: 'x', tilesets: [{ name: 'base' }], rooms: [] }
    expectFailure(parseSceneArtManifest(JSON.stringify(bad)), 'path')
  })

  // ---- RoomArtConfig errors -----------------------------------------------

  it('returns error when room entry is not an object', () => {
    expectFailure(
      parseSceneArtManifest(JSON.stringify({ version: 1, tilemap: 'x', tilesets: [], rooms: [null] })),
      'rooms[0]',
    )
  })

  it('returns error when room is missing roomId', () => {
    const bad = {
      version: 1, tilemap: 'x', tilesets: [],
      rooms: [{ tilesetLayers: [], spriteOverlays: [], ambientAnimations: [] }],
    }
    expectFailure(parseSceneArtManifest(JSON.stringify(bad)), 'roomId')
  })

  it('returns error when room is missing tilesetLayers', () => {
    const bad = {
      version: 1, tilemap: 'x', tilesets: [],
      rooms: [{ roomId: 'r', spriteOverlays: [], ambientAnimations: [] }],
    }
    expectFailure(parseSceneArtManifest(JSON.stringify(bad)), 'tilesetLayers')
  })

  it('returns error when tilesetLayers contains a non-string', () => {
    const bad = {
      version: 1, tilemap: 'x', tilesets: [],
      rooms: [{ roomId: 'r', tilesetLayers: [42], spriteOverlays: [], ambientAnimations: [] }],
    }
    expectFailure(parseSceneArtManifest(JSON.stringify(bad)), 'tilesetLayers[0]')
  })

  it('returns error when room is missing spriteOverlays', () => {
    const bad = {
      version: 1, tilemap: 'x', tilesets: [],
      rooms: [{ roomId: 'r', tilesetLayers: [], ambientAnimations: [] }],
    }
    expectFailure(parseSceneArtManifest(JSON.stringify(bad)), 'spriteOverlays')
  })

  it('returns error when room is missing ambientAnimations', () => {
    const bad = {
      version: 1, tilemap: 'x', tilesets: [],
      rooms: [{ roomId: 'r', tilesetLayers: [], spriteOverlays: [] }],
    }
    expectFailure(parseSceneArtManifest(JSON.stringify(bad)), 'ambientAnimations')
  })

  // ---- SpriteOverlayDef errors --------------------------------------------

  it('returns error when spriteOverlay is missing spriteKey', () => {
    const bad = {
      version: 1, tilemap: 'x', tilesets: [],
      rooms: [{
        roomId: 'r', tilesetLayers: [], ambientAnimations: [],
        spriteOverlays: [{ x: 0, y: 0 }],
      }],
    }
    expectFailure(parseSceneArtManifest(JSON.stringify(bad)), 'spriteKey')
  })

  it('returns error when spriteOverlay has non-number frame', () => {
    const bad = {
      version: 1, tilemap: 'x', tilesets: [],
      rooms: [{
        roomId: 'r', tilesetLayers: [], ambientAnimations: [],
        spriteOverlays: [{ spriteKey: 's', x: 0, y: 0, frame: 'bad' }],
      }],
    }
    expectFailure(parseSceneArtManifest(JSON.stringify(bad)), 'frame')
  })

  it('returns error when spriteOverlay has non-number scale', () => {
    const bad = {
      version: 1, tilemap: 'x', tilesets: [],
      rooms: [{
        roomId: 'r', tilesetLayers: [], ambientAnimations: [],
        spriteOverlays: [{ spriteKey: 's', x: 0, y: 0, scale: 'big' }],
      }],
    }
    expectFailure(parseSceneArtManifest(JSON.stringify(bad)), 'scale')
  })

  // ---- AmbientAnimDef errors ----------------------------------------------

  it('returns error when ambientAnimation is missing spriteKey', () => {
    const bad = {
      version: 1, tilemap: 'x', tilesets: [],
      rooms: [{
        roomId: 'r', tilesetLayers: [], spriteOverlays: [],
        ambientAnimations: [{ x: 0, y: 0, frameStart: 0, frameEnd: 3, frameRate: 8 }],
      }],
    }
    expectFailure(parseSceneArtManifest(JSON.stringify(bad)), 'spriteKey')
  })

  it('returns error when ambientAnimation is missing frameRate', () => {
    const bad = {
      version: 1, tilemap: 'x', tilesets: [],
      rooms: [{
        roomId: 'r', tilesetLayers: [], spriteOverlays: [],
        ambientAnimations: [{ spriteKey: 's', x: 0, y: 0, frameStart: 0, frameEnd: 3 }],
      }],
    }
    expectFailure(parseSceneArtManifest(JSON.stringify(bad)), 'frameRate')
  })

  it('returns error when ambientAnimation frameStart is a string', () => {
    const bad = {
      version: 1, tilemap: 'x', tilesets: [],
      rooms: [{
        roomId: 'r', tilesetLayers: [], spriteOverlays: [],
        ambientAnimations: [{ spriteKey: 's', x: 0, y: 0, frameStart: 'zero', frameEnd: 3, frameRate: 8 }],
      }],
    }
    expectFailure(parseSceneArtManifest(JSON.stringify(bad)), 'frameStart')
  })

  // ---- Empty arrays (valid) -----------------------------------------------

  it('accepts empty rooms array', () => {
    const result = parseSceneArtManifest(
      JSON.stringify({ version: 1, tilemap: 'x', tilesets: [], rooms: [] }),
    )
    expect(result.ok).toBe(true)
  })

  it('accepts empty tilesets array', () => {
    const result = parseSceneArtManifest(
      JSON.stringify({ version: 1, tilemap: 'x', tilesets: [], rooms: [] }),
    )
    expect(result.ok).toBe(true)
  })

  it('accepts room with empty spriteOverlays and ambientAnimations', () => {
    const m = {
      version: 1, tilemap: 'x', tilesets: [],
      rooms: [{ roomId: 'r', tilesetLayers: [], spriteOverlays: [], ambientAnimations: [] }],
    }
    const result = parseSceneArtManifest(JSON.stringify(m))
    expect(result.ok).toBe(true)
  })
})
