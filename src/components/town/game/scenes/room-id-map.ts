/**
 * Translates legacy room IDs (used by EVENT_TO_ROOM in constants.ts)
 * to the new Nerve Center room IDs.
 *
 * This avoids modifying constants.ts (which NerveScene still references).
 */
export const OLD_TO_NEW_ROOM: Record<string, string> = {
  'room-vault': 'vitality-lab',
  'room-forge': 'task-forge',
  'room-bridge': 'command-hub',
  'room-watchtower': 'research-lab',
  'room-ledger': 'automations',
  'room-hub': 'command-hub',
  'room-dispatch': 'commons',
  'room-workshop': 'soul-workshop',
  'room-quarters': 'break-room',
}

/** Translate an old room ID to a new one, or return the input if already new. */
export function translateRoomId(oldId: string): string {
  return OLD_TO_NEW_ROOM[oldId] ?? oldId
}

/**
 * Agent ID → home room mapping.
 * Generalists live in their quadrant room; specialists in their functional room.
 */
export const AGENT_HOME_ROOM: Record<string, string> = {
  'gen-lifeforce': 'vitality-lab',
  'gen-industry': 'task-forge',
  'gen-fellowship': 'commons',
  'gen-essence': 'soul-workshop',
  'specialist-architect': 'task-forge',
  'specialist-coder': 'task-forge',
  'specialist-research': 'research-lab',
  'specialist-engineering': 'task-forge',
  'specialist-marketing': 'writing-room',
  'specialist-writing': 'writing-room',
  'specialist-video': 'media-studio',
  'specialist-image': 'media-studio',
  'specialist-n8n': 'automations',
}

/**
 * Room color palette — used for border glow and agent tinting.
 */
export const ROOM_COLORS: Record<string, string> = {
  'vitality-lab': '#34d399',
  'task-forge': '#60a5fa',
  'writing-room': '#a78bfa',
  'research-lab': '#818cf8',
  'commons': '#f87171',
  'command-hub': '#ff5c5c',
  'automations': '#fb923c',
  'soul-workshop': '#c084fc',
  'media-studio': '#f472b6',
  'break-room': '#a3a3a3',
}
