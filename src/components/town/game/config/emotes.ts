/**
 * Emote spritesheet config — 48×48 emote icons.
 */

export const EMOTE_SHEET_KEY = 'emotes'
export const EMOTE_SHEET_PATH = '/town/sprites/emotes_48x48.png'
export const EMOTE_FRAME_SIZE = 48

// Emote frame indices (row × 8 cols)
export const EMOTE_FRAMES: Record<string, number> = {
  'emote:heart': 0,
  'emote:broken-heart': 1,
  'emote:star': 2,
  'emote:exclaim': 3,
  'emote:question': 4,
  'emote:music': 5,
  'emote:sleep': 6,
  'emote:angry': 7,
  'emote:sweat': 8,
  'emote:happy': 9,
  'emote:sad': 10,
  'emote:thinking': 11,
  'emote:device': 12,
  'emote:confused': 13,
  'emote:idea': 14,
  'emote:thumbsup': 15,
}
