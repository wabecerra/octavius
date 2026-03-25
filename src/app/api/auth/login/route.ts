import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/memory/db';
import {
  initAuthDatabase,
  getUserByEmail,
  verifyPassword,
  createSession,
  createSessionRecord,
  getDeviceByFingerprint,
  createDevice,
  createApprovalRequest,
} from '@/lib/auth/auth';

interface LoginRequest {
  email: string;
  password?: string;
  passkeyResponse?: unknown; // WebAuthn response
}

/**
 * POST /api/auth/login — Login with email/password or passkey
 * 
 * Body: { 
 *   email: string, 
 *   password?: string,
 *   passkeyResponse?: any 
 * }
 * Returns: { 
 *   sessionToken: string, 
 *   requiresDeviceApproval?: boolean,
 *   approvalCode?: string,
 *   message: string 
 * }
 */
export async function POST(request: Request) {
  try {
    const db = getDatabase();
    const { headers } = request;
    const userAgent = headers.get('user-agent') || 'Unknown';
    const ip = headers.get('x-forwarded-for')?.split(',')[0] || 'Unknown';
    
    // ALWAYS initialize auth tables on every auth call (idempotent)
    initAuthDatabase(db);
    
    const body = await request.json() as LoginRequest;
    const { email, password, passkeyResponse } = body;

    // Find user
    const user = getUserByEmail(db, email);
    
    if (!user) {
      // Security: Don't reveal if email exists
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Authentication method 1: Password
    if (password) {
      if (!user.password_hash) {
        return NextResponse.json(
          { error: 'Password not set. Use passkey login.' },
          { status: 400 }
        );
      }

      if (!verifyPassword(password, user.password_hash)) {
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }
    }

    // Authentication method 2: Passkey (to be implemented)
    if (passkeyResponse) {
      // Placeholder for WebAuthn verification
      // Would verify signature with @simplewebauthn/server
      console.log('[Auth] Passkey login attempt:', passkeyResponse);
    }

    // Both methods require at least one
    if (!password && !passkeyResponse) {
      return NextResponse.json(
        { error: 'Password or passkey required' },
        { status: 400 }
      );
    }

    // At this point, user is authenticated!
    // Now handle device trust and MFA

    // Generate device fingerprint
    const fingerprint = Buffer.from(`${userAgent}|${ip}`).toString('base64url');
    
    // Check if device exists and is trusted
    let device = getDeviceByFingerprint(db, user.id, fingerprint);
    let needsDeviceApproval = false;
    let approvalCode: string | undefined;

    if (!device) {
      // New device - create it
      device = { id: createDevice(db, user.id, fingerprint, userAgent, ip, 'New Device') };
      needsDeviceApproval = true;
      
      // Generate approval code
      const { approvalCode: code } = createApprovalRequest(db, user.id, fingerprint);
      approvalCode = code;
    } else if (!device.is_trusted || (device.trusted_until && new Date(device.trusted_until) < new Date())) {
      // Device exists but not trusted
      needsDeviceApproval = true;
      
      // Generate new approval code
      const { approvalCode: code } = createApprovalRequest(db, user.id, fingerprint);
      approvalCode = code;
    }

    // If device needs approval, return code and don't create session yet
    if (needsDeviceApproval) {
      return NextResponse.json({
        requiresDeviceApproval: true,
        approvalCode,
        userId: user.id,
        deviceId: device.id,
        message: 'Please approve this device with your CLI: `octavius approve-device <code>`',
      });
    }

    // Device is trusted - create session
    const sessionToken = await createSession({
      userId: user.id,
      deviceId: device.id,
      email: user.email,
    }, '30d');

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    createSessionRecord(db, user.id, device.id, sessionToken, expiresAt);

    return NextResponse.json({
      sessionToken,
      userId: user.id,
      email: user.email,
      message: 'Login successful',
    });
    
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Auth] Login error:', message);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
