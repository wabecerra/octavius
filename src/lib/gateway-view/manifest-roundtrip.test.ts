// ---------------------------------------------------------------------------
// Property-based test: Manifest round-trip consistency
// Validates: Requirements 10.4
// ---------------------------------------------------------------------------
// Property 1: Round-trip consistency — for all valid RoomManifest objects,
// `parse(print(manifest))` produces an identical object.
// Also covers AssetManifest and SceneArtManifest.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  parseRoomManifest,
  parseAssetManifest,
  parseSceneArtManifest,
} from './manifest-parser'
import {
  printRoomManifest,
  printAssetManifest,
  printSceneArtManifest,
} from './manifest-printer'
import type {
  RoomDef,
  WaypointDef,
  RoomManifest,
  ColumnDef,
  FilterFieldDef,
  SortFieldDef,
  RoomAssetConfig,
  AssetManifest,
  AmbientAnimDef,
  SpriteOverlayDef,
  RoomArtConfig,
  SceneArtManifest,
} from './types'

// ---- Arbitraries ----------------------------------------------------------

// Use JSON-safe strings (no lone surrogates) and finite numbers to ensure
// JSON.stringify → JSON.parse round-trips cleanly.

const safeString = fc.string({ minLength: 1, maxLength: 30 }).filter(
  (s) => s === JSON.parse(JSON.stringify(s)),
)

// Avoid -0 since JSON.stringify(-0) === "0", breaking deep-equal round-trip.
const safeNumber = fc.double({
  min: -1e6,
  max: 1e6,
  noNaN: true,
  noDefaultInfinity: true,
}).map((n) => {
  const rounded = Math.round(n * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
})

const positiveNumber = fc.integer({ min: 1, max: 10000 })

// ---- RoomManifest arbitraries ---------------------------------------------

const arbRoomDef: fc.Arbitrary<RoomDef> = fc.record({
  roomId: safeString,
  label: safeString,
  icon: safeString,
  bounds: fc.tuple(safeNumber, safeNumber, positiveNumber, positiveNumber),
  connections: fc.array(safeString, { minLength: 0, maxLength: 5 }),
  x: safeNumber,
  y: safeNumber,
  width: positiveNumber,
  height: positiveNumber,
})

const arbWaypointDef: fc.Arbitrary<WaypointDef> = fc.record({
  id: safeString,
  x: safeNumber,
  y: safeNumber,
  connectedWaypoints: fc.array(safeString, { minLength: 0, maxLength: 5 }),
  nearestRoom: safeString,
})

const arbRoomManifest: fc.Arbitrary<RoomManifest> = fc.record({
  version: fc.integer({ min: 1, max: 100 }),
  rooms: fc.array(arbRoomDef, { minLength: 0, maxLength: 5 }),
  waypoints: fc.array(arbWaypointDef, { minLength: 0, maxLength: 5 }),
  hubRoomId: safeString,
})


// ---- AssetManifest arbitraries --------------------------------------------

const arbColumnDef: fc.Arbitrary<ColumnDef> = fc.record({
  field: safeString,
  label: safeString,
  width: positiveNumber,
  truncate: fc.option(positiveNumber, { nil: undefined }),
})

const arbFilterFieldDef: fc.Arbitrary<FilterFieldDef> = fc.record({
  field: safeString,
  label: safeString,
  type: fc.constantFrom('enum' as const, 'date-range' as const, 'text' as const),
  options: fc.option(fc.array(safeString, { minLength: 0, maxLength: 5 }), { nil: undefined }),
})

const arbSortFieldDef: fc.Arbitrary<SortFieldDef> = fc.record({
  field: safeString,
  label: safeString,
  defaultDirection: fc.option(fc.constantFrom('asc' as const, 'desc' as const), { nil: undefined }),
})

const arbRoomAssetConfig: fc.Arbitrary<RoomAssetConfig> = fc.record({
  roomId: safeString,
  apiEndpoint: safeString,
  columns: fc.array(arbColumnDef, { minLength: 0, maxLength: 4 }),
  filters: fc.array(arbFilterFieldDef, { minLength: 0, maxLength: 4 }),
  sorts: fc.array(arbSortFieldDef, { minLength: 0, maxLength: 4 }),
  previewTemplate: safeString,
})

const arbAssetManifest: fc.Arbitrary<AssetManifest> = fc.record({
  version: fc.integer({ min: 1, max: 100 }),
  rooms: fc.array(arbRoomAssetConfig, { minLength: 0, maxLength: 4 }),
})

// ---- SceneArtManifest arbitraries -----------------------------------------

const arbAmbientAnimDef: fc.Arbitrary<AmbientAnimDef> = fc.record({
  spriteKey: safeString,
  x: safeNumber,
  y: safeNumber,
  frameStart: fc.integer({ min: 0, max: 100 }),
  frameEnd: fc.integer({ min: 0, max: 100 }),
  frameRate: fc.integer({ min: 1, max: 60 }),
})

const arbSpriteOverlayDef: fc.Arbitrary<SpriteOverlayDef> = fc.record({
  spriteKey: safeString,
  x: safeNumber,
  y: safeNumber,
  frame: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
  scale: fc.option(fc.double({ min: 0.1, max: 10, noNaN: true, noDefaultInfinity: true }), { nil: undefined }),
})

const arbRoomArtConfig: fc.Arbitrary<RoomArtConfig> = fc.record({
  roomId: safeString,
  tilesetLayers: fc.array(safeString, { minLength: 0, maxLength: 5 }),
  spriteOverlays: fc.array(arbSpriteOverlayDef, { minLength: 0, maxLength: 3 }),
  ambientAnimations: fc.array(arbAmbientAnimDef, { minLength: 0, maxLength: 3 }),
})

const arbSceneArtManifest: fc.Arbitrary<SceneArtManifest> = fc.record({
  version: fc.integer({ min: 1, max: 100 }),
  tilemap: safeString,
  tilesets: fc.array(
    fc.record({ name: safeString, path: safeString }),
    { minLength: 0, maxLength: 5 },
  ),
  rooms: fc.array(arbRoomArtConfig, { minLength: 0, maxLength: 4 }),
})

// ---- Property tests -------------------------------------------------------

/**
 * **Validates: Requirements 10.4**
 *
 * Property 1: Round-trip consistency — for all valid manifest objects,
 * `parse(print(manifest))` produces an identical object.
 */
describe('Manifest round-trip consistency (property-based)', () => {
  it('RoomManifest: parse(print(m)) ≡ m', () => {
    fc.assert(
      fc.property(arbRoomManifest, (manifest) => {
        const printed = printRoomManifest(manifest)
        const parsed = parseRoomManifest(printed)
        expect(parsed.ok).toBe(true)
        if (parsed.ok) {
          expect(parsed.value).toEqual(manifest)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('AssetManifest: parse(print(m)) ≡ m', () => {
    fc.assert(
      fc.property(arbAssetManifest, (manifest) => {
        const printed = printAssetManifest(manifest)
        const parsed = parseAssetManifest(printed)
        expect(parsed.ok).toBe(true)
        if (parsed.ok) {
          expect(parsed.value).toEqual(manifest)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('SceneArtManifest: parse(print(m)) ≡ m', () => {
    fc.assert(
      fc.property(arbSceneArtManifest, (manifest) => {
        const printed = printSceneArtManifest(manifest)
        const parsed = parseSceneArtManifest(printed)
        expect(parsed.ok).toBe(true)
        if (parsed.ok) {
          expect(parsed.value).toEqual(manifest)
        }
      }),
      { numRuns: 200 },
    )
  })
})
