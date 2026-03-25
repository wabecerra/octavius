/**
 * Unit tests for tilemap validator
 * Validates: Requirements 10.1, 10.2, 10.3
 */

import { describe, it, expect } from 'vitest'
import { validateNerveCenterTilemap } from './tilemap-validator'

// ---------------------------------------------------------------------------
// Helpers — build minimal valid Tiled-format tilemaps
// ---------------------------------------------------------------------------

function makeSpawnObject(name: string, x = 100, y = 200, facing = 'down') {
  return {
    name,
    x,
    y,
    properties: [{ name: 'facing', type: 'string', value: facing }],
  }
}

function makeValidTilemap() {
  return {
    layers: [
      { name: 'floor', type: 'tilelayer', data: [1, 2, 3] },
      { name: 'collisions', type: 'objectgroup', objects: [] },
      {
        name: 'spawns',
        type: 'objectgroup',
        objects: [
          makeSpawnObject('boss', 50, 60, 'up'),
          makeSpawnObject('seat-0', 100, 200, 'right'),
          makeSpawnObject('seat-1', 300, 400, 'left'),
        ],
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateNerveCenterTilemap', () => {
  it('returns ok: true with correct spawns for a valid tilemap', () => {
    const result = validateNerveCenterTilemap(makeValidTilemap())

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.spawns.boss).toEqual({
      name: 'boss',
      x: 50,
      y: 60,
      facing: 'up',
    })
    expect(result.spawns.workers).toHaveLength(2)
    expect(result.spawns.workers[0]).toEqual({
      name: 'seat-0',
      x: 100,
      y: 200,
      facing: 'right',
    })
    expect(result.spawns.workers[1]).toEqual({
      name: 'seat-1',
      x: 300,
      y: 400,
      facing: 'left',
    })
  })

  it('returns error when floor layer is missing', () => {
    const tilemap = {
      layers: [
        { name: 'collisions', type: 'objectgroup', objects: [] },
        {
          name: 'spawns',
          type: 'objectgroup',
          objects: [makeSpawnObject('boss'), makeSpawnObject('seat-0')],
        },
      ],
    }

    const result = validateNerveCenterTilemap(tilemap)

    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('floor'),
    )
  })

  it('returns error when collisions layer is missing', () => {
    const tilemap = {
      layers: [
        { name: 'floor', type: 'tilelayer', data: [1] },
        {
          name: 'spawns',
          type: 'objectgroup',
          objects: [makeSpawnObject('boss'), makeSpawnObject('seat-0')],
        },
      ],
    }

    const result = validateNerveCenterTilemap(tilemap)

    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('collisions'),
    )
  })

  it('returns error when spawns layer is missing', () => {
    const tilemap = {
      layers: [
        { name: 'floor', type: 'tilelayer', data: [1] },
        { name: 'collisions', type: 'objectgroup', objects: [] },
      ],
    }

    const result = validateNerveCenterTilemap(tilemap)

    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('spawns'),
    )
  })

  it('returns error when spawns layer has no boss spawn', () => {
    const tilemap = {
      layers: [
        { name: 'floor', type: 'tilelayer', data: [1] },
        { name: 'collisions', type: 'objectgroup', objects: [] },
        {
          name: 'spawns',
          type: 'objectgroup',
          objects: [makeSpawnObject('seat-0'), makeSpawnObject('seat-1')],
        },
      ],
    }

    const result = validateNerveCenterTilemap(tilemap)

    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('boss'),
    )
  })

  it('returns error when spawns layer has no worker spawns', () => {
    const tilemap = {
      layers: [
        { name: 'floor', type: 'tilelayer', data: [1] },
        { name: 'collisions', type: 'objectgroup', objects: [] },
        {
          name: 'spawns',
          type: 'objectgroup',
          objects: [makeSpawnObject('boss')],
        },
      ],
    }

    const result = validateNerveCenterTilemap(tilemap)

    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(
      expect.stringContaining('worker'),
    )
  })
})
