/**
 * Octavius Authentication System
 * Handles passkeys, email/password, and device approval
 */

import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// ───────────────────────────────────────────────────────────────────────────
// Password Hashing (bcrypt alternative using scrypt)
// ───────────────────────────────────────────────────────────────────────────

const SCRYPT_PARAMS = {
  N: 16384, // Cost factor (reduced from 32768 for server compatibility)
  r: 8,      // Block size
  p: 1,      // Parallelization
  dklen: 64, // Key length
  saltlen: 16
};

export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_PARAMS.saltlen).toString('hex');
  const key = scryptSync(password, salt, SCRYPT_PARAMS.dklen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  return `${SCRYPT_PARAMS.N}$${salt}$${key.toString('hex')}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  try {
    const [n, salt, key] = hash.split('$');
    const expectedKey = scryptSync(password, salt, SCRYPT_PARAMS.dklen, {
      N: parseInt(n, 10),
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
    });
    return timingSafeEqual(Buffer.from(key, 'hex'), expectedKey);
  } catch {
    return false;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Device Fingerprinting
// ───────────────────────────────────────────────────────────────────────────

import { createHash } from 'crypto';

export function generateDeviceFingerprint(
  userAgent: string,
  ipAddress: string,
  screenResolution?: string,
  timezone?: string
): string {
  const fingerprint = `${userAgent}|${ipAddress}|${screenResolution || ''}|${timezone || ''}`;
  return createHash('sha256').update(fingerprint).digest('hex');
}

// ───────────────────────────────────────────────────────────────────────────
// Session Management
// ───────────────────────────────────────────────────────────────────────────

import { SignJWT, jwtVerify } from 'jose';

const SESSION_SECRET = process.env.OCTAVIUS_SESSION_SECRET || nanoid(32);
const secret = new TextEncoder().encode(SESSION_SECRET);

export interface SessionPayload {
  userId: string;
  deviceId: string;
  email: string;
}

export async function createSession(payload: SessionPayload, expiresIn: string = '30d'): Promise<string> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setJti(nanoid())
    .sign(secret);
  
  return token;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// TOTP Generation (for device approval codes)
// ───────────────────────────────────────────────────────────────────────────

export function generateApprovalCode(): string {
  // Generate 6-digit TOTP-like code
  const timestamp = Math.floor(Date.now() / 1000 / 30); // 30-second window
  const hash = createHash('sha256')
    .update(timestamp.toString() + SESSION_SECRET)
    .digest('hex');
  return hash.substring(0, 6).toUpperCase();
}

// ───────────────────────────────────────────────────────────────────────────
// Database Helpers
// ───────────────────────────────────────────────────────────────────────────

let authDbInitialized = false;

export function initAuthDatabase(db: Database.Database): void {
  if (authDbInitialized) return; // Only initialize once
  
  try {
    // Run schema from SQL file - use absolute path that works in both dev and prod
    const fs = require('fs');
    const path = require('path');
    // Try multiple possible locations for the schema file
    const possiblePaths = [
      path.join(process.cwd(), 'src/lib/auth/database-schema.sql'),
      path.join(__dirname, 'database-schema.sql'),
      path.join(__dirname, '..', 'auth', 'database-schema.sql'),
    ];
    
    let schemaPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        schemaPath = p;
        break;
      }
    }
    
    if (schemaPath) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      db.exec(schema);
      console.log('[Auth] ✅ Database schema initialized from:', schemaPath);
      authDbInitialized = true;
    } else {
      console.warn('[Auth] ⚠️ Schema file not found in any expected location');
      console.warn('[Auth] Tried:', possiblePaths.join(', '));
    }
  } catch (err) {
    console.error('[Auth] ❌ Failed to initialize database:', err);
    throw err; // Re-throw so API calls fail visibly
  }
}

// ───────────────────────────────────────────────────────────────────────────
// User Management
// ───────────────────────────────────────────────────────────────────────────

export function createUser(db: Database.Database, email: string, password?: string): { id: string; email: string } {
  const id = nanoid();
  const now = new Date().toISOString();
  const passwordHash = password ? hashPassword(password) : null;

  db.prepare(`
    INSERT INTO users (id, email, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, email, passwordHash, now, now);

  return { id, email };
}

export function getUserByEmail(db: Database.Database, email: string): any {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

export function getUserById(db: Database.Database, id: string): any {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// ───────────────────────────────────────────────────────────────────────────
// Session Management (Database)
// ───────────────────────────────────────────────────────────────────────────

export function createSessionRecord(
  db: Database.Database,
  userId: string,
  deviceId: string,
  token: string,
  expiresAt: string
): string {
  const id = nanoid();
  db.prepare(`
    INSERT INTO sessions (id, user_id, device_id, session_token, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(id, userId, deviceId, token, expiresAt);
  
  return id;
}

export function getSessionByToken(db: Database.Database, token: string): any {
  return db.prepare(`
    SELECT s.*, u.email, u.id as user_id
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.session_token = ? AND s.expires_at > datetime('now')
  `).get(token);
}

export function revokeSession(db: Database.Database, sessionId: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function revokeAllUserSessions(db: Database.Database, userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// ───────────────────────────────────────────────────────────────────────────
// Device Management
// ───────────────────────────────────────────────────────────────────────────

export function createDevice(
  db: Database.Database,
  userId: string,
  fingerprint: string,
  userAgent: string,
  ipAddress: string,
  deviceName?: string
): string {
  const id = nanoid();
  db.prepare(`
    INSERT INTO devices (id, user_id, fingerprint_hash, device_name, user_agent, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(id, userId, fingerprint, deviceName || 'Unknown Device', userAgent, ipAddress);
  
  return id;
}

export function getDeviceByFingerprint(db: Database.Database, userId: string, fingerprint: string): any {
  return db.prepare('SELECT * FROM devices WHERE user_id = ? AND fingerprint_hash = ?').get(userId, fingerprint);
}

export function trustDevice(db: Database.Database, deviceId: string, days: number = 30): void {
  const trustedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    UPDATE devices
    SET is_trusted = TRUE, trusted_until = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(trustedUntil, deviceId);
}

export function getUserDevices(db: Database.Database, userId: string): any[] {
  return db.prepare(`
    SELECT id, device_name, is_trusted, trusted_until, created_at, user_agent
    FROM devices
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);
}

// ───────────────────────────────────────────────────────────────────────────
// Device Approval
// ───────────────────────────────────────────────────────────────────────────

export function createApprovalRequest(
  db: Database.Database,
  userId: string,
  deviceFingerprint: string
): { id: string; approvalCode: string } {
  const id = nanoid();
  const approvalCode = generateApprovalCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  db.prepare(`
    INSERT INTO device_approvals (id, user_id, device_fingerprint, approval_code, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(id, userId, deviceFingerprint, approvalCode, expiresAt);

  return { id, approvalCode };
}

export function getApprovalRequest(db: Database.Database, code: string): any {
  return db.prepare(`
    SELECT * FROM device_approvals
    WHERE approval_code = ? AND expires_at > datetime('now') AND approved = FALSE
  `).get(code);
}

export function approveDeviceRequest(db: Database.Database, approvalId: string): boolean {
  const request = db.prepare('SELECT * FROM device_approvals WHERE id = ?').get(approvalId);
  
  if (!request) return false;

  const tx = db.transaction(() => {
    // Mark approval as done
    db.prepare('UPDATE device_approvals SET approved = TRUE WHERE id = ?').run(approvalId);
    
    // Trust the device
    const device = db.prepare('SELECT id FROM devices WHERE user_id = ? AND fingerprint_hash = ?')
      .get(request.user_id, request.device_fingerprint);
    
    if (device) {
      trustDevice(db, device.id as string, 30);
    }
  });

  tx();
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// Passkey Helpers (placeholder - will use @simplewebauthn/server)
// ───────────────────────────────────────────────────────────────────────────

export function savePasskey(
  db: Database.Database,
  userId: string,
  credentialId: string,
  publicKey: string,
  deviceType?: string
): string {
  const id = nanoid();
  db.prepare(`
    INSERT INTO passkeys (id, user_id, credential_id, public_key, device_type, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(id, userId, credentialId, publicKey, deviceType);
  
  return id;
}

export function getPasskey(db: Database.Database, credentialId: string): any {
  return db.prepare('SELECT * FROM passkeys WHERE credential_id = ?').get(credentialId);
}

export function getUserPasskeys(db: Database.Database, userId: string): any[] {
  return db.prepare(`
    SELECT id, credential_id, device_type, last_used_at, created_at
    FROM passkeys
    WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(userId);
}

export function updatePasskeyCounter(db: Database.Database, credentialId: string, counter: number): void {
  db.prepare(`
    UPDATE passkeys
    SET counter = ?, last_used_at = datetime('now')
    WHERE credential_id = ?
  `).run(counter, credentialId);
}
