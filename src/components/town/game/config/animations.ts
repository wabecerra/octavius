/**
 * Character spritesheet animation config.
 * Adapted from agent-town — all Premade_Character sheets share the same layout:
 *   48×96 frames, 56 cols
 *   Row 1: idle (right/up/left/down × 6 frames)
 *   Row 2: walk (right/up/left/down × 6 frames)
 */

export const FRAME_WIDTH = 48
export const FRAME_HEIGHT = 96
export const SHEET_COLUMNS = 56
const FRAMES_PER_DIR = 6
export const MOVE_SPEED = 160

export interface AnimDef {
  key: string
  start: number
  end: number
  frameRate: number
  repeat: number
}

// Boss (player) sprite
export const SPRITE_KEY = 'character_09'
export const SPRITE_PATH = '/town/characters/Premade_Character_48x48_09.png'

export interface WorkerSpriteConfig {
  key: string
  path: string
  label: string
}

// Octavius quadrant agents mapped to character sprites
export const WORKER_SPRITES: WorkerSpriteConfig[] = [
  { key: 'character_02', path: '/town/characters/Premade_Character_48x48_02.png', label: 'Lifeforce' },
  { key: 'character_03', path: '/town/characters/Premade_Character_48x48_03.png', label: 'Industry' },
  { key: 'character_04', path: '/town/characters/Premade_Character_48x48_04.png', label: 'Fellowship' },
  { key: 'character_05', path: '/town/characters/Premade_Character_48x48_05.png', label: 'Essence' },
]

const directions = ['right', 'up', 'left', 'down'] as const
export type Direction = (typeof directions)[number]

export function makeAnims(spriteKey: string, prefix: string, row: number, frameRate: number): AnimDef[] {
  return directions.map((dir, i) => ({
    key: `${spriteKey}:${prefix}-${dir}`,
    start: row * SHEET_COLUMNS + i * FRAMES_PER_DIR,
    end: row * SHEET_COLUMNS + i * FRAMES_PER_DIR + FRAMES_PER_DIR - 1,
    frameRate,
    repeat: -1,
  }))
}

function rowAnims(prefix: string, row: number, frameRate: number): AnimDef[] {
  return directions.map((dir, i) => ({
    key: `${prefix}-${dir}`,
    start: row * SHEET_COLUMNS + i * FRAMES_PER_DIR,
    end: row * SHEET_COLUMNS + i * FRAMES_PER_DIR + FRAMES_PER_DIR - 1,
    frameRate,
    repeat: -1,
  }))
}

export const IDLE_ANIMS = rowAnims('idle', 1, 8)
export const WALK_ANIMS = rowAnims('walk', 2, 10)
export const ALL_ANIMS: AnimDef[] = [...IDLE_ANIMS, ...WALK_ANIMS]
