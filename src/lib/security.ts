import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * Escapes HTML special characters to prevent XSS in raw string interpolation contexts.
 * React's JSX already escapes by default — this utility is for any edge case
 * where a raw string is used outside of React's rendering (e.g. title attributes
 * built via string concatenation, or injected into non-React DOM APIs).
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
}

const HTML_ESCAPE_RE = /[&<>"']/g

export function escapeHtml(str: string): string {
  return str.replace(HTML_ESCAPE_RE, (char) => HTML_ESCAPE_MAP[char] ?? char)
}

// ---------------------------------------------------------------------------
// Token encryption — AES-256-GCM for gateway token storage (Req 3.1)
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LENGTH)
}

/**
 * Encrypt a plaintext token string.
 * Returns a base64 string: salt(16) + iv(12) + authTag(16) + ciphertext.
 */
export function encryptToken(plaintext: string, passphrase: string = 'octavius-default-key'): string {
  const salt = randomBytes(16)
  const key = deriveKey(passphrase, salt)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([salt, iv, authTag, encrypted]).toString('base64')
}

/**
 * Decrypt a token previously encrypted with encryptToken.
 */
export function decryptToken(encoded: string, passphrase: string = 'octavius-default-key'): string {
  const packed = Buffer.from(encoded, 'base64')
  const salt = packed.subarray(0, 16)
  const iv = packed.subarray(16, 16 + IV_LENGTH)
  const authTag = packed.subarray(16 + IV_LENGTH, 16 + IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = packed.subarray(16 + IV_LENGTH + AUTH_TAG_LENGTH)
  const key = deriveKey(passphrase, salt)
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
