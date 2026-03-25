import { NextResponse } from 'next/server'
import { LcmBridgeClient } from '@/lib/lcm/client'

/**
 * GET /api/lcm/status — LCM integration status for the dashboard.
 * Returns conversation count, summary DAG stats, DB size, etc.
 */
export async function GET() {
  const client = new LcmBridgeClient()
  try {
    const status = client.getStatus()
    return NextResponse.json(status)
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to read LCM status' },
      { status: 500 },
    )
  } finally {
    client.close()
  }
}
