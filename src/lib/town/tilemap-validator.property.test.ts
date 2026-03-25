/**
 * Property-based test: Round-trip spawn extraction
 * **Validates: Requirements 10.4**
 *
 * For all valid tilemap JSON structures, loading then extracting spawn points
 * then serializing spawn data back to the same format SHALL produce equivalent
 * spawn definitions.
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { validateNerveCenterTilemap, type SpawnDef } from './tilemap-validator'

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const directionArb = fc.constantFrom('up', 'down', 'left', 'right' as const)

/** Generate a Tiled spawn object with a given name */
function tiledSpawnObjectArb(name: string) {
  return fc.record({
    name: fc.constant(name),
    x: fc.double({ min: 0, max: 4096, noNaN: true, noDefaultInfinity: true }),
    y: fc.double({ min: 0, max: 4096, noNaN: true, noDefaultInfinity: true }),
    facing: directionArb,
  }).map(({ name, x, y, facing }) => ({
    name,
    x,
    y,
    properties: [{ name: 'facing', type: 'string', value: facing }],
  }))
}

/** Generate 1–6 worker spawn objects with seat-N naming */
const workerSpawnsArb = fc
  .integer({ min: 1, max: 6 })
  .chain(count =>
    fc.tuple(...Array.from({ length: count }, (_, i) => tiledSpawnObjectArb(`seat-${i}`)))
  )

/** Generate a complete valid Tiled-format tilemap with floor, collisions, and spawns layers */
const validTilemapArb = fc
  .tuple(tiledSpawnObjectArb('boss'), workerSpawnsArb)
  .map(([bossObj, workerObjs]) => ({
    layers: [
      { name: 'floor', type: 'tilelayer', data: [1, 2, 3] },
      { name: 'collisions', type: 'objectgroup', objects: [] },
      {
        name: 'spawns',
        type: 'objectgroup',
        objects: [bossObj, ...workerObjs],
      },
    ],
  }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert extracted SpawnDef back to Tiled object format */
function spawnDefToTiledObject(spawn: SpawnDef) {
  return {
    name: spawn.name,
    x: spawn.x,
    y: spawn.y,
    properties: [{ name: 'facing', type: 'string', value: spawn.facing }],
  }
}

/** Rebuild a tilemap from extracted spawns, keeping the same structural layers */
function rebuildTilemap(originalMap: unknown, boss: SpawnDef, workers: SpawnDef[]) {
  const map = originalMap as { layers: Array<{ name: string; type: string; objects?: unknown[]; data?: number[] }> }
  return {
    layers: map.layers.map(layer => {
      if (layer.name === 'spawns' && layer.type === 'objectgroup') {
        return {
          ...layer,
          objects: [spawnDefToTiledObject(boss), ...workers.map(spawnDefToTiledObject)],
        }
      }
      return layer
    }),
  }
}

// ---------------------------------------------------------------------------
// Property test
// ---------------------------------------------------------------------------

describe('tilemap-validator property tests', () => {
  it('Property 1: round-trip spawn extraction — extract then re-serialize produces equivalent spawns', () => {
    fc.assert(
      fc.property(validTilemapArb, (tilemap) => {
        // Step 1: Validate and extract spawns from the generated tilemap
        const firstPass = validateNerveCenterTilemap(tilemap)
        expect(firstPass.ok).toBe(true)
        expect(firstPass.errors).toEqual([])
        expect(firstPass.spawns.boss).not.toBeNull()
        expect(firstPass.spawns.workers.length).toBeGreaterThanOrEqual(1)

        // Step 2: Re-serialize extracted spawns back to Tiled object format
        //         and rebuild the tilemap
        const rebuilt = rebuildTilemap(
          tilemap,
          firstPass.spawns.boss!,
          firstPass.spawns.workers,
        )

        // Step 3: Re-validate the rebuilt tilemap
        const secondPass = validateNerveCenterTilemap(rebuilt)
        expect(secondPass.ok).toBe(true)
        expect(secondPass.errors).toEqual([])

        // Step 4: Verify spawn equivalence (round-trip)
        expect(secondPass.spawns.boss).toEqual(firstPass.spawns.boss)
        expect(secondPass.spawns.workers).toEqual(firstPass.spawns.workers)
      }),
      { numRuns: 200 },
    )
  })
})
