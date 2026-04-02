/**
 * GET /api/gateway/cache-stats — Context cache statistics
 */

import { NextResponse } from 'next/server'
import { getContextCache } from '@/lib/gateway/context-cache'

export async function GET() {
  const cache = getContextCache()
  return NextResponse.json(cache.getStats())
}
