import { NextResponse } from 'next/server'
import { getGatewayBridge } from '@/lib/gateway/bridge'

/** GET /api/agents/fleet-status — Live fleet state from bridge */
export async function GET() {
  const bridge = getGatewayBridge()
  const fleet = bridge.getFleetSnapshot()
  const running = fleet.filter(a => a.status === 'running').length
  const idle = fleet.filter(a => a.status === 'idle').length
  const failed = fleet.filter(a => a.status === 'failed').length

  return NextResponse.json({
    bridgeStatus: bridge.status,
    agents: fleet,
    summary: { running, idle, failed, total: fleet.length },
  })
}
