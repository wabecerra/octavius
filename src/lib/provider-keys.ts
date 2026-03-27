/**
 * Provider Keys — encrypted storage and retrieval for API keys.
 *
 * Keys are encrypted with AES-256-GCM using a server-side secret.
 * The secret is derived from PROVIDER_KEY_SECRET env var or a
 * deterministic fallback for development (not secure for production).
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { getDatabase } from './memory/db'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

function getEncryptionKey(): Buffer {
  const secret = process.env.PROVIDER_KEY_SECRET || 'octavius-dev-key-not-for-production'
  return scryptSync(secret, 'octavius-salt', 32)
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return ''
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Store as iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ''
  const key = getEncryptionKey()
  const [ivHex, tagHex, encHex] = ciphertext.split(':')
  if (!ivHex || !tagHex || !encHex) return ''
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

// ─── Provider Definitions ───

export interface ProviderKeyConfig {
  providerId: string
  displayName: string
  fields: { key: string; label: string; type: 'apikey' | 'text' | 'url' }[]
}

export const PROVIDER_DEFINITIONS: ProviderKeyConfig[] = [
  {
    providerId: 'openrouter',
    displayName: 'OpenRouter',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'apikey' }],
  },
  {
    providerId: 'bedrock',
    displayName: 'Amazon Bedrock',
    fields: [
      { key: 'region', label: 'AWS Region', type: 'text' },
      { key: 'accessKeyId', label: 'Access Key ID', type: 'apikey' },
      { key: 'secretAccessKey', label: 'Secret Access Key', type: 'apikey' },
    ],
  },
  {
    providerId: 'nanobanana',
    displayName: 'Nano Banana (Google Vision)',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'apikey' }],
  },
  {
    providerId: 'kimi',
    displayName: 'Kimi Search (Moonshot AI)',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'apikey' }],
  },
  {
    providerId: 'n8n',
    displayName: 'N8N Automation',
    fields: [
      { key: 'endpoint', label: 'MCP Endpoint URL', type: 'url' },
      { key: 'apiKey', label: 'API Key (optional)', type: 'apikey' },
    ],
  },
]

// ─── CRUD Operations ───

export interface StoredProviderKey {
  providerId: string
  displayName: string
  enabled: boolean
  hasKey: boolean
  config: Record<string, string>
  updatedAt: string
}

/** Get all provider keys (decrypted config, keys masked for display). */
export function listProviderKeys(): StoredProviderKey[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM provider_keys').all() as Array<{
    provider_id: string; display_name: string; encrypted_key: string;
    config_json: string; enabled: number; updated_at: string
  }>

  const stored = new Map(rows.map(r => [r.provider_id, r]))

  return PROVIDER_DEFINITIONS.map(def => {
    const row = stored.get(def.providerId)
    if (!row) {
      return {
        providerId: def.providerId,
        displayName: def.displayName,
        enabled: false,
        hasKey: false,
        config: {},
        updatedAt: '',
      }
    }
    const config = JSON.parse(row.config_json || '{}') as Record<string, string>
    // Decrypt the primary key
    const decryptedKey = decrypt(row.encrypted_key)
    if (decryptedKey) config.apiKey = decryptedKey

    return {
      providerId: def.providerId,
      displayName: def.displayName,
      enabled: row.enabled === 1,
      hasKey: !!decryptedKey || Object.keys(config).length > 0,
      config,
      updatedAt: row.updated_at,
    }
  })
}

/** Get a single provider's decrypted API key. Used by llm-caller at runtime. */
export function getProviderKey(providerId: string): string {
  const db = getDatabase()
  const row = db.prepare(
    'SELECT encrypted_key FROM provider_keys WHERE provider_id = ? AND enabled = 1'
  ).get(providerId) as { encrypted_key: string } | undefined
  if (!row?.encrypted_key) return process.env.OPENROUTER_API_KEY || ''
  return decrypt(row.encrypted_key)
}

/** Get full provider config (decrypted). Used for multi-field providers like Bedrock. */
export function getProviderConfig(providerId: string): Record<string, string> {
  const db = getDatabase()
  const row = db.prepare(
    'SELECT encrypted_key, config_json FROM provider_keys WHERE provider_id = ? AND enabled = 1'
  ).get(providerId) as { encrypted_key: string; config_json: string } | undefined
  if (!row) return {}
  const config = JSON.parse(row.config_json || '{}') as Record<string, string>
  const key = decrypt(row.encrypted_key)
  if (key) config.apiKey = key
  return config
}

/** Save or update a provider's key and config. */
export function saveProviderKey(
  providerId: string,
  apiKey: string,
  config: Record<string, string>,
  enabled: boolean,
): void {
  const db = getDatabase()
  const def = PROVIDER_DEFINITIONS.find(d => d.providerId === providerId)
  if (!def) throw new Error(`Unknown provider: ${providerId}`)

  const now = new Date().toISOString()
  const encryptedKey = encrypt(apiKey)
  // Don't store the apiKey in config_json — it goes in encrypted_key
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { apiKey: _ak, ...configWithoutKey } = config

  db.prepare(`
    INSERT OR REPLACE INTO provider_keys (provider_id, display_name, encrypted_key, config_json, enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(providerId, def.displayName, encryptedKey, JSON.stringify(configWithoutKey), enabled ? 1 : 0, now)
}
