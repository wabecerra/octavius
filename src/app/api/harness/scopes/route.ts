/**
 * GET /api/harness/scopes — Get all tool scope definitions
 * GET /api/harness/scopes?agent=specialist-coder — Get scope for a specific agent type
 */

import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_TOOL_SCOPES, resolveToolScope } from '@/lib/harness/tool-scopes'

export async function GET(request: NextRequest) {
  const agent = request.nextUrl.searchParams.get('agent')

  if (agent) {
    const scope = DEFAULT_TOOL_SCOPES[agent]
    if (!scope) {
      return NextResponse.json({ error: `Unknown agent type: ${agent}` }, { status: 404 })
    }
    return NextResponse.json({
      agentType: agent,
      scope,
      resolvedTools: resolveToolScope(agent),
    })
  }

  const scopes = Object.entries(DEFAULT_TOOL_SCOPES).map(([type, scope]) => ({
    ...scope,
    agentType: type,
    resolvedToolCount: resolveToolScope(type).length,
  }))

  return NextResponse.json({ scopes })
}
