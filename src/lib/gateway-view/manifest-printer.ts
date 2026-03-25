// ---------------------------------------------------------------------------
// Gateway View – Manifest Printers
// ---------------------------------------------------------------------------
// Pure serialization functions that produce 2-space indented JSON strings
// with a trailing newline. Used for round-trip fidelity with the parsers
// in manifest-parser.ts.
// Requirements: 10.3, 10.5
// ---------------------------------------------------------------------------

import type { RoomManifest, AssetManifest, SceneArtManifest } from './types'

/** Serialize a RoomManifest to pretty-printed JSON. */
export function printRoomManifest(manifest: RoomManifest): string {
  return JSON.stringify(manifest, null, 2) + '\n'
}

/** Serialize an AssetManifest to pretty-printed JSON. */
export function printAssetManifest(manifest: AssetManifest): string {
  return JSON.stringify(manifest, null, 2) + '\n'
}

/** Serialize a SceneArtManifest to pretty-printed JSON. */
export function printSceneArtManifest(manifest: SceneArtManifest): string {
  return JSON.stringify(manifest, null, 2) + '\n'
}
