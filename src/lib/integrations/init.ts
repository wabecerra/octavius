/**
 * Initialize Octavius Integrations on startup.
 * Auto-detects LCM and Obsidian, runs imports/exports automatically.
 */

import { autoImportLCM } from './lcm-sync'
import { scheduleObsidianExport } from './obsidian-sync'
import { getDatabase } from '../memory/db'
import { MemoryService } from '../memory/service'

let initialized = false

export function initializeIntegrations(): void {
  if (initialized) return
  initialized = true

  console.log('[Integrations] Initializing...')

  // Wait for database to be ready
  setTimeout(() => {
    try {
      const db = getDatabase()
      const memoryService = new MemoryService(db)

      // Auto-import LCM conversations on startup
      autoImportLCM(memoryService)

      // Schedule nightly Obsidian export
      scheduleObsidianExport(memoryService)

      console.log('[Integrations] Initialization complete')
    } catch (err) {
      console.error('[Integrations] Initialization failed:', err)
    }
  }, 3000)
}
