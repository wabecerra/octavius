import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/memory/db';
import { initAuthDatabase, createUser } from '@/lib/auth/auth';

interface RegisterRequest {
  email: string;
  password?: string;
}

/**
 * POST /api/auth/register — Create new account
 * 
 * Body: { email: string, password?: string }
 * Returns: { userId: string, email: string, message: string }
 */
export async function POST(request: Request) {
  try {
    const db = getDatabase();
    
    // ALWAYS initialize auth tables (idempotent - safe to call multiple times)
    initAuthDatabase(db);
    
    const body = await request.json() as RegisterRequest;
    const { email, password } = body;

    // Validation
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409 }
      );
    }

    // Create user (password is optional for passkey-only accounts)
    const user = createUser(db, email, password);

    return NextResponse.json({
      userId: user.id,
      email: user.email,
      message: 'Account created. Sign in to continue — the device owner will need to approve your device.',
    }, { status: 201 });
    
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Auth] Registration error:', message);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
