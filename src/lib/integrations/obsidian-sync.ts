/**
 * Obsidian Integration — Automatic export from Octavius to Obsidian vault
 * 
 * Zero-config: Auto-detects Obsidian vault and exports journal, insights, patterns.
 * Runs nightly and can be triggered via API.
 * 
 * Features:
 * - Detects ~/Obsidian Vault or common vault paths
 * - Exports to OpenClaw/Octavius subfolder
 * - Organizes by date and quadrant
 * - Creates Dataview-friendly metadata
 * - Prevents duplicates via frontmatter IDs
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import type { MemoryService } from '../memory/service'

/** Common Obsidian vault paths to check */
const VAULT_PATHS = [
  resolve(homedir(), 'Obsidian Vault'),
  resolve(homedir(), 'Documents', 'Obsidian Vault'),
  resolve(homedir(), 'OneDrive', 'Obsidian Vault'),
  resolve(homedir(), 'iCloudDrive', 'Obsidian'),
  process.env.OBSIDIAN_VAULT_PATH || '',
].filter(Boolean)

/** Octavius export subfolder */
const EXPORT_FOLDER = 'OpenClaw/Octavius'

/** Detect Obsidian vault */
export function findObsidianVault(): string | null {
  for (const path of VAULT_PATHS) {
    if (existsSync(path)) {
      console.log(`[Obsidian] Vault detected: ${path}`)
      return path
    }
  }
  console.log('[Obsidian] No vault detected')
  return null
}

/** Get export directory (creates if needed) */
function getExportDirectory(vaultPath: string): string {
  const exportPath = join(vaultPath, EXPORT_FOLDER)
  if (!existsSync(exportPath)) {
    mkdirSync(exportPath, { recursive: true })
    console.log(`[Obsidian] Created export folder: ${exportPath}`)
  }
  return exportPath
}

/** Memory item with quadrant tag */
interface QuadrantMemory {
  memory_id: string
  text: string
  type: string
  layer: string
  tags: string[]
  created_at: string
  quadrant?: string
}

/**
 * Extract quadrant from memory tags.
 */
function extractQuadrant(tags: string[]): string | undefined {
  const quadrantTag = tags.find((t) => t.startsWith('quadrant:'))
  if (quadrantTag) {
    return quadrantTag.replace('quadrant:', '')
  }
  return undefined
}

/**
 * Export memories to Obsidian as markdown files.
 * 
 * Categories:
 * - Journal entries → journal/YYYY-MM-DD.md
 * - Insights/patterns → insights/YYYY-MM-DD-<id>.md
 * - Weekly reviews → reviews/YYYY-MM-DD-review.md
 * - Consolidated daily notes → daily/YYYY-MM-DD.md
 */
export function exportToObsidian(
  memoryService: MemoryService,
  options: { days?: number; types?: string[] } = {},
): { exported: number; skipped: number; errors: number } {
  const vaultPath = findObsidianVault()
  if (!vaultPath) {
    console.log('[Obsidian] Skipping export — no vault found')
    return { exported: 0, skipped: 0, errors: 0 }
  }

  const exportDir = getExportDirectory(vaultPath)
  const { days = 1, types } = options
  const now = new Date()
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  const cutoffStr = cutoff.toISOString()

  console.log(`[Obsidian] Exporting memories since ${cutoffStr}...`)

  // Fetch memories from last N days
  const result = memoryService.list({
    limit: 100,
    ...(types && types.length > 0 && (types[0] === 'episodic' || types[0] === 'semantic' || types[0] === 'procedural') ? { type: types[0] as 'episodic' | 'semantic' | 'procedural' } : {}),
  })

  let exported = 0
  let skipped = 0
  let errors = 0

  for (const memory of result.items) {
    try {
      // Skip if too old
      if (memory.created_at < cutoffStr) {
        continue
      }

      // Skip if already exported (check tags)
      if (memory.tags.includes('obsidian-exported')) {
        skipped++
        continue
      }

      // Determine export category
      const category = categorizeMemory(memory)
      if (!category) {
        continue
      }

      // Create markdown file
      const filename = generateFilename(memory, category)
      const filepath = join(exportDir, category, filename)

      // Ensure category folder exists
      const categoryDir = join(exportDir, category)
      if (!existsSync(categoryDir)) {
        mkdirSync(categoryDir, { recursive: true })
      }

      // Generate markdown content
      const content = generateMarkdown(memory, category)

      // Write file
      writeFileSync(filepath, content, 'utf-8')

      // Tag memory as exported
      memoryService.update(memory.memory_id, {
        tags: [...memory.tags, 'obsidian-exported'],
      })

      console.log(`[Obsidian] Exported ${filename}`)
      exported++
    } catch (err) {
      console.error(`[Obsidian] Error exporting ${memory.memory_id}:`, err)
      errors++
    }
  }

  console.log(`[Obsidian] Export complete: ${exported} exported, ${skipped} skipped, ${errors} errors`)
  return { exported, skipped, errors }
}

/**
 * Categorize memory for export.
 */
function categorizeMemory(memory: QuadrantMemory): string | null {
  const { tags, type } = memory

  // Weekly reviews
  if (tags.includes('weekly-review')) {
    return 'reviews'
  }

  // Journal entries
  if (type === 'episodic' && tags.includes('journal')) {
    return 'journal'
  }

  // Insights/patterns from evolution
  if (tags.includes('pattern') || tags.includes('insight')) {
    return 'insights'
  }

  // Consolidated daily notes
  if (memory.layer === 'life_directory' || tags.includes('consolidated')) {
    return 'daily'
  }

  // Check-in summaries (mood/energy/stress trends)
  if (tags.includes('wellness') || tags.includes('checkin')) {
    return 'wellness'
  }

  // Quadrant-specific notes
  const quadrant = extractQuadrant(tags)
  if (quadrant) {
    return `quadrants/${quadrant}`
  }

  return null
}

/**
 * Generate filename for memory.
 */
function generateFilename(memory: QuadrantMemory, category: string): string {
  const date = memory.created_at.slice(0, 10) // YYYY-MM-DD
  const id = memory.memory_id.slice(0, 8) // First 8 chars

  // Weekly reviews get special naming
  if (category === 'reviews') {
    return `${date}-weekly-review.md`
  }

  // Journal entries by date
  if (category === 'journal') {
    return `${date}-journal.md`
  }

  // Others get ID suffix
  return `${date}-${id}.md`
}

/**
 * Generate markdown content with Dataview-friendly frontmatter.
 */
function generateMarkdown(memory: QuadrantMemory, category: string): string {
  const quadrant = extractQuadrant(memory.tags) || 'unknown'
  const tags = memory.tags.filter((t) => !t.includes(':')).join(', ')

  const frontmatter = [
    '---',
    `alias: "${category.replace('/', '-')} ${memory.created_at.slice(0, 10)}"`,
    `created: ${memory.created_at}`,
    `memory_id: ${memory.memory_id}`,
    `type: ${memory.type}`,
    `layer: ${memory.layer}`,
    `quadrant: ${quadrant}`,
    `tags: [${tags}]`,
    'exported_by: octavius',
    '---',
    '',
  ].join('\n')

  const body = [
    `# ${capitalize(category)}: ${memory.created_at.slice(0, 10)}`,
    '',
    '---',
    '',
    memory.text,
    '',
    '---',
    '',
    `## Metadata`,
    '',
    `- **Memory ID:** ${memory.memory_id}`,
    `- **Type:** ${memory.type}`,
    `- **Layer:** ${memory.layer}`,
    `- **Quadrant:** ${quadrant}`,
    `- **Tags:** ${memory.tags.join(', ')}`,
    '',
    '---',
    '',
    '*Exported automatically by Octavius*',
  ].join('\n')

  return frontmatter + body
}

/**
 * Create Dataview index files for each category.
 */
function createDataviewIndexes(vaultPath: string): void {
  const exportDir = join(vaultPath, EXPORT_FOLDER)

  const indexes = [
    {
      folder: 'journal',
      query: `TABLE file.day as "Date", alias as "Title" FROM "${EXPORT_FOLDER}/journal" SORT file.day DESC`,
    },
    {
      folder: 'insights',
      query: `TABLE file.day as "Date", quadrant as "Quadrant", tags as "Tags" FROM "${EXPORT_FOLDER}/insights" SORT file.day DESC`,
    },
    {
      folder: 'reviews',
      query: `TABLE file.day as "Date", alias as "Title" FROM "${EXPORT_FOLDER}/reviews" SORT file.day DESC`,
    },
    {
      folder: 'daily',
      query: `TABLE file.day as "Date", quadrant as "Quadrant" FROM "${EXPORT_FOLDER}/daily" SORT file.day DESC`,
    },
  ]

  for (const idx of indexes) {
    const indexPath = join(exportDir, idx.folder, '📊 Index.md')
    const content = [
      '---',
      `created: ${new Date().toISOString()}`,
      '---',
      '',
      `# ${capitalize(idx.folder)} Index`,
      '',
      '```dataview',
      idx.query,
      '```',
      '',
      '*Auto-generated by Octavius*',
    ].join('\n')

    writeFileSync(indexPath, content, 'utf-8')
  }

  console.log('[Obsidian] Created Dataview indexes')
}

/**
 * Trigger Obsidian export via API endpoint.
 * 
 * POST /api/integrations/obsidian/export
 * Body: { days?: number; types?: string[] }
 */
export function createObsidianExportEndpoint(memoryService: MemoryService) {
  return async (request: Request) => {
    try {
      const body = (await request.json().catch(() => ({}))) as { days?: number; types?: string[] }
      const result = exportToObsidian(memoryService, body)
      
      // Create Dataview indexes
      const vaultPath = findObsidianVault()
      if (vaultPath) {
        createDataviewIndexes(vaultPath)
      }

      return Response.json({ success: true, ...result })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json({ success: false, error: message }, { status: 500 })
    }
  }
}

/**
 * Auto-run Obsidian export nightly.
 * 
 * Call this from your scheduled jobs system.
 */
export function scheduleObsidianExport(memoryService: MemoryService): void {
  const vaultPath = findObsidianVault()
  if (!vaultPath) {
    console.log('[Obsidian Integration] No vault — skipping auto-export')
    return
  }

  console.log('[Obsidian Integration] Vault detected — scheduling nightly export')
  
  // Schedule for 9 PM Pacific (midnight UTC)
  const delay = (ms: number) => setTimeout(() => {
    try {
      console.log('[Obsidian] Running scheduled export...')
      exportToObsidian(memoryService, { days: 1 })
      console.log('[Obsidian] Scheduled export complete')
    } catch (err) {
      console.error('[Obsidian] Scheduled export failed:', err)
    }
    
    // Re-schedule for next day
    scheduleObsidianExport(memoryService)
  }, ms)

  // Calculate ms until next midnight UTC
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setUTCHours(0, 0, 0, 0)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const msUntilMidnight = tomorrow.getTime() - now.getTime()

  console.log(`[Obsidian] Next export in ${Math.round(msUntilMidnight / 1000 / 60)} minutes`)
  delay(msUntilMidnight)
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
