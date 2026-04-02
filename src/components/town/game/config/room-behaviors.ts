/**
 * Room-specific idle behavior config for agents in the Nerve Center (Tier C).
 * Controls wandering, emote cycling, and ambient chat bubbles per room type.
 */

export interface RoomBehavior {
  /** Whether agents wander within room bounds when idle. */
  wanderEnabled: boolean
  /** Wander offset multiplier (1.0 = normal +-30px, 0.5 = +-15px). */
  wanderSpeed: number
  /** Emotes to cycle through while idle in this room. */
  idleEmotes: string[]
  /** Milliseconds between emote changes. */
  emoteCycleMs: number
  /** Random idle chat bubbles (30% chance per emote cycle). */
  idleBubbles: string[]
}

export const ROOM_BEHAVIORS: Record<string, RoomBehavior> = {
  'task-forge': {
    wanderEnabled: true, wanderSpeed: 1.0,
    idleEmotes: ['emote:device'],
    emoteCycleMs: 8000,
    idleBubbles: ['Coding...', 'Building...', 'Shipping...'],
  },
  'research-lab': {
    wanderEnabled: true, wanderSpeed: 0.7,
    idleEmotes: ['emote:thinking', 'emote:idea'],
    emoteCycleMs: 10000,
    idleBubbles: ['Researching...', 'Interesting...', 'Hmm...'],
  },
  'break-room': {
    wanderEnabled: false, wanderSpeed: 0,
    idleEmotes: ['emote:sleep'],
    emoteCycleMs: 15000,
    idleBubbles: ['Zzz...', '*stretches*', '*coffee*'],
  },
  'vitality-lab': {
    wanderEnabled: true, wanderSpeed: 0.8,
    idleEmotes: ['emote:device', 'emote:heart'],
    emoteCycleMs: 12000,
    idleBubbles: ['Checking vitals...', 'Heart rate good!'],
  },
  'writing-room': {
    wanderEnabled: true, wanderSpeed: 0.6,
    idleEmotes: ['emote:idea', 'emote:thinking'],
    emoteCycleMs: 10000,
    idleBubbles: ['Writing...', 'Editing...', 'Drafting...'],
  },
  'commons': {
    wanderEnabled: true, wanderSpeed: 1.0,
    idleEmotes: ['emote:happy', 'emote:music'],
    emoteCycleMs: 8000,
    idleBubbles: ['Connecting...', 'Hey there!'],
  },
  'media-studio': {
    wanderEnabled: true, wanderSpeed: 0.8,
    idleEmotes: ['emote:star', 'emote:device'],
    emoteCycleMs: 9000,
    idleBubbles: ['Rendering...', 'Composing...'],
  },
  'automations': {
    wanderEnabled: true, wanderSpeed: 0.9,
    idleEmotes: ['emote:device', 'emote:exclaim'],
    emoteCycleMs: 7000,
    idleBubbles: ['Automating...', 'Running flows...'],
  },
  'soul-workshop': {
    wanderEnabled: true, wanderSpeed: 0.5,
    idleEmotes: ['emote:heart', 'emote:music'],
    emoteCycleMs: 12000,
    idleBubbles: ['Reflecting...', 'Finding meaning...'],
  },
  'command-hub': {
    wanderEnabled: true, wanderSpeed: 1.0,
    idleEmotes: ['emote:exclaim'],
    emoteCycleMs: 10000,
    idleBubbles: ['Coordinating...', 'Status check...'],
  },
}

export const DEFAULT_BEHAVIOR: RoomBehavior = {
  wanderEnabled: true, wanderSpeed: 1.0, idleEmotes: [], emoteCycleMs: 10000, idleBubbles: [],
}
