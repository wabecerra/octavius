import type { MemoryConfig } from '@/lib/memory/models'

/**
 * Obsidian Local REST API client.
 * Communicates with the obsidian-local-rest-api plugin over HTTPS.
 * @see https://github.com/coddingtonbear/obsidian-local-rest-api
 */

export interface VaultFile {
  path: string
  isDir: boolean
}

export interface NoteContent {
  path: string
  content: string
}

export interface SearchHit {
  filename: string
  score: number
  matches: Array<{ match: { start: number; end: number }; context: string }>
}

export class ObsidianClient {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(config: Pick<MemoryConfig, 'obsidian_api_url' | 'obsidian_api_key' | 'obsidian_insecure_ssl'>) {
    this.baseUrl = config.obsidian_api_url.replace(/\/$/, '')
    this.apiKey = config.obsidian_api_key
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      ...extra,
    }
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    // Node.js fetch supports rejectUnauthorized via agent, but for simplicity
    // we set NODE_TLS_REJECT_UNAUTHORIZED at the call site when insecureSsl is true
    const res = await fetch(url, {
      ...init,
      headers: { ...this.headers(), ...init?.headers },
    })
    return res
  }

  /** Check if the Obsidian REST API is reachable. */
  async ping(): Promise<{ ok: boolean; status?: number; authenticated?: boolean }> {
    try {
      const res = await this.request('/')
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        return { ok: true, status: res.status, authenticated: data.authenticated ?? true }
      }
      return { ok: false, status: res.status }
    } catch {
      return { ok: false }
    }
  }

  /** List files in a vault directory. Returns file paths. */
  async listFiles(dir = '/'): Promise<string[]> {
    const res = await this.request(`/vault/${dir.replace(/^\//, '')}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`listFiles failed: ${res.status}`)
    const data = await res.json()
    return (data.files ?? []) as string[]
  }

  /** Read a note's raw markdown content. */
  async readNote(path: string): Promise<string> {
    const res = await this.request(`/vault/${encodeURIComponent(path)}`, {
      headers: { Accept: 'text/markdown' },
    })
    if (!res.ok) throw new Error(`readNote failed: ${res.status} for ${path}`)
    return res.text()
  }

  /** Create or overwrite a note. */
  async writeNote(path: string, content: string): Promise<void> {
    const res = await this.request(`/vault/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown' },
      body: content,
    })
    if (!res.ok) throw new Error(`writeNote failed: ${res.status} for ${path}`)
  }

  /** Append content to a note (creates if doesn't exist). */
  async appendNote(path: string, content: string): Promise<void> {
    const res = await this.request(`/vault/${encodeURIComponent(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/markdown' },
      body: content,
    })
    if (!res.ok) throw new Error(`appendNote failed: ${res.status} for ${path}`)
  }

  /** Delete a note. */
  async deleteNote(path: string): Promise<void> {
    const res = await this.request(`/vault/${encodeURIComponent(path)}`, {
      method: 'DELETE',
    })
    if (!res.ok && res.status !== 404) throw new Error(`deleteNote failed: ${res.status}`)
  }

  /** Simple text search across the vault. */
  async search(query: string): Promise<SearchHit[]> {
    const res = await this.request('/search/simple/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    if (!res.ok) throw new Error(`search failed: ${res.status}`)
    return res.json()
  }
}
