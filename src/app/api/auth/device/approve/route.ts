import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/memory/db';
import {
  initAuthDatabase,
  getApprovalRequest,
  approveDeviceRequest,
  createSession,
  createSessionRecord,
  getDeviceByFingerprint,
  getUserById,
} from '@/lib/auth/auth';

interface ApproveRequest {
  approvalCode: string;
}

/**
 * POST /api/auth/device/approve — Approve device with code
 * 
 * Body: { approvalCode: string }
 * Returns: { success: boolean, sessionToken?: string, message: string }
 */
export async function POST(request: Request) {
  try {
    const db = getDatabase();
    initAuthDatabase(db);
    
    const body = await request.json() as ApproveRequest;
    const { approvalCode } = body;

    if (!approvalCode || typeof approvalCode !== 'string') {
      return NextResponse.json(
        { error: 'Approval code required' },
        { status: 400 }
      );
    }

    // Find approval request
    const approval = getApprovalRequest(db, approvalCode.toUpperCase());

    if (!approval) {
      return NextResponse.json(
        { error: 'Invalid or expired approval code' },
        { status: 404 }
      );
    }

    // Approve the device
    const success = approveDeviceRequest(db, approval.id);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to approve device' },
        { status: 500 }
      );
    }

    // Now trusted - create session
    const device = getDeviceByFingerprint(db, approval.user_id, approval.device_fingerprint);
    
    if (!device) {
      return NextResponse.json(
        { error: 'Device not found' },
        { status: 404 }
      );
    }

    const user = getUserById(db, approval.user_id);
    const sessionToken = await createSession({
      userId: approval.user_id,
      deviceId: device.id,
      email: user?.email || '',
    }, '30d');

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    createSessionRecord(db, approval.user_id, device.id, sessionToken, expiresAt);

    return NextResponse.json({
      success: true,
      sessionToken,
      message: 'Device approved! You can now access Octavius.',
    });
    
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Auth] Device approval error:', message);
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 });
  }
}
