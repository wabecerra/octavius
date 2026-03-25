/**
 * Tilemap parsing utilities — sprite frames, spawn points, collisions, POIs.
 * Ported from agent-town with Octavius paths.
 */

import * as Phaser from 'phaser'
import { FRAME_WIDTH, FRAME_HEIGHT, SHEET_COLUMNS, type Direction } from '../config/animations'

export interface SeatDef {
  seatId: string; x: number; y: number; facing: Direction; index: number
}

export interface POIDef {
  name: string; x: number; y: number; facing: Direction | null
}

export function buildSpriteFrames(scene: Phaser.Scene, key: string) {
  const tex = scene.textures.get(key)
  if (!tex.source.length) return
  const rows = Math.floor(tex.source[0].height / FRAME_HEIGHT)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < SHEET_COLUMNS; col++) {
      tex.add(row * SHEET_COLUMNS + col, 0, col * FRAME_WIDTH, row * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT)
    }
  }
}

export function parseSpawns(map: Phaser.Tilemaps.Tilemap) {
  const layer = map.getObjectLayer('spawns')
  const fallback = { x: map.widthInPixels / 2, y: map.heightInPixels / 2, facing: 'down' as Direction }
  if (!layer || layer.objects.length === 0) return { bossSpawn: fallback, workerSpawns: [] as SeatDef[] }

  const getFacing = (obj: Phaser.Types.Tilemaps.TiledObject): Direction => {
    const props = obj.properties as Array<{ name: string; value: string }> | undefined
    return (props?.find(p => p.name === 'facing')?.value as Direction) ?? 'down'
  }

  let bossObj = layer.objects.find(o => o.name === 'boss')
  if (!bossObj) { const sorted = [...layer.objects].sort((a, b) => a.x! - b.x!); bossObj = sorted.pop() }
  if (!bossObj) return { bossSpawn: fallback, workerSpawns: [] as SeatDef[] }

  const bossSpawn = { x: bossObj.x!, y: bossObj.y!, facing: getFacing(bossObj) }
  const workerSpawns: SeatDef[] = layer.objects
    .filter(obj => obj !== bossObj)
    .map((obj, index) => ({
      seatId: obj.name && obj.name !== 'boss' ? obj.name : `seat-${index}`,
      x: obj.x!, y: obj.y!, facing: getFacing(obj), index,
    }))

  return { bossSpawn, workerSpawns }
}

export function parsePOIs(map: Phaser.Tilemaps.Tilemap): POIDef[] {
  const layer = map.getObjectLayer('pois')
  if (!layer) return []
  return layer.objects
    .filter(obj => obj.name && typeof obj.x === 'number' && typeof obj.y === 'number')
    .map(obj => {
      const props = obj.properties as Array<{ name: string; value: string }> | undefined
      return { name: obj.name!, x: obj.x!, y: obj.y!, facing: (props?.find(p => p.name === 'facing')?.value as Direction) ?? null }
    })
}

export function buildCollisionRects(map: Phaser.Tilemaps.Tilemap, group: Phaser.Physics.Arcade.StaticGroup) {
  const rects: { x: number; y: number; width: number; height: number }[] = []
  const layer = map.getObjectLayer('collisions')
  if (layer) {
    for (const obj of layer.objects) {
      const ox = obj.x ?? 0, oy = obj.y ?? 0, ow = obj.width ?? 0, oh = obj.height ?? 0
      if (ow === 0 || oh === 0) continue
      const rect = group.create(ox + ow/2, oy + oh/2, undefined, undefined, false) as Phaser.Physics.Arcade.Sprite
      rect.body!.setSize(ow, oh); rect.setVisible(false); rect.setActive(true)
      ;(rect.body as Phaser.Physics.Arcade.StaticBody).enable = true
      rects.push({ x: ox, y: oy, width: ow, height: oh })
    }
  }
  // Block exterior
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0
  for (const r of rects) { minX = Math.min(minX, r.x); minY = Math.min(minY, r.y); maxX = Math.max(maxX, r.x+r.width); maxY = Math.max(maxY, r.y+r.height) }
  const mW = map.widthInPixels, mH = map.heightInPixels
  if (minX > 0) rects.push({ x: 0, y: 0, width: minX, height: mH })
  if (minY > 0) rects.push({ x: 0, y: 0, width: mW, height: minY })
  if (maxX < mW) rects.push({ x: maxX, y: 0, width: mW - maxX, height: mH })
  if (maxY < mH) rects.push({ x: 0, y: maxY, width: mW, height: mH - maxY })
  return rects
}

export interface AnimatedProp {
  tilesetName: string; anchorLocalId: number; skipLocalIds: Set<number>
  spriteKey: string; frameWidth: number; frameHeight: number; endFrame: number; frameRate: number
}

export function renderTileObjectLayer(
  scene: Phaser.Scene, map: Phaser.Tilemaps.Tilemap, layerName: string,
  tilesets: Phaser.Tilemaps.Tileset[], depth: number, animatedProps?: AnimatedProp[],
) {
  const objectLayer = map.getObjectLayer(layerName)
  if (!objectLayer) return
  for (const obj of objectLayer.objects) {
    if (!obj.gid) continue
    let tileset: Phaser.Tilemaps.Tileset | null = null
    for (let i = tilesets.length - 1; i >= 0; i--) { if (obj.gid >= tilesets[i].firstgid) { tileset = tilesets[i]; break } }
    if (!tileset) continue
    const localId = obj.gid - tileset.firstgid
    const anim = animatedProps?.find(a => a.tilesetName === tileset!.name && a.skipLocalIds.has(localId))
    if (anim) {
      if (localId === anim.anchorLocalId) {
        const animKey = `${anim.spriteKey}-anim`
        if (!scene.anims.exists(animKey)) {
          scene.anims.create({ key: animKey, frames: scene.anims.generateFrameNumbers(anim.spriteKey, { start: 0, end: anim.endFrame }), frameRate: anim.frameRate, repeat: -1 })
        }
        scene.add.sprite(obj.x!, obj.y! - anim.frameHeight + tileset.tileHeight, anim.spriteKey).setOrigin(0, 0).setDepth(depth).play(animKey)
      }
      continue
    }
    const tileW = tileset.tileWidth, tileH = tileset.tileHeight
    const srcX = (localId % tileset.columns) * tileW, srcY = Math.floor(localId / tileset.columns) * tileH
    if (!scene.textures.exists(`${tileset.name}_${localId}`)) {
      scene.textures.get(tileset.name).add(localId, 0, srcX, srcY, tileW, tileH)
    }
    scene.add.image(obj.x!, obj.y! - tileH, tileset.name, localId).setOrigin(0, 0).setDepth(depth)
  }
}
