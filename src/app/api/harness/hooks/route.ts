/**
 * GET /api/harness/hooks — List registered hooks
 */

import { NextResponse } from 'next/server'
import { getHookPipeline } from '@/lib/harness/hooks'

export async function GET() {
  const pipeline = getHookPipeline()
  return NextResponse.json({ hooks: pipeline.listHooks() })
}
