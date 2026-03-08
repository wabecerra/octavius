import { NextResponse } from 'next/server'
import { getService } from '../service'

/** GET /api/llm-cost/stats — Dashboard stats for the cost tracker. */
export async function GET() {
  const service = getService()
  const stats = service.getDashboardStats()
  const modelStats = service.getRegistry().getStats()

  return NextResponse.json({
    ...stats,
    registry: modelStats,
  })
}
