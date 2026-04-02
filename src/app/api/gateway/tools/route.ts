/**
 * GET /api/gateway/tools — Tool manifest endpoint
 *
 * Returns all available tools with specs, queryable without invocation.
 * Implements the manifest-first pattern from claw-code.
 *
 * Query params:
 *   ?category=Tasks   — filter by tool category
 *   ?search=memory    — filter by name substring match
 */

import { NextRequest, NextResponse } from 'next/server'
import { PLUGIN_TOOL_CATEGORIES } from '@/lib/gateway/env-bootstrap'
import { getSpecialistTools } from '@/lib/agents/specialist-tools'

interface ToolEntry {
  name: string
  category: string
  description?: string
  parameters?: Record<string, unknown>
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const categoryFilter = searchParams.get('category')?.toLowerCase()
  const searchFilter = searchParams.get('search')?.toLowerCase()

  const tools: ToolEntry[] = []

  // 1. Plugin tools from the environment bootstrap categories
  for (const cat of PLUGIN_TOOL_CATEGORIES) {
    for (const toolName of cat.tools) {
      tools.push({
        name: toolName,
        category: cat.category,
      })
    }
  }

  // 2. Specialist tools with full OpenAI-compatible specs
  const specialistDefs = getSpecialistTools()
  for (const def of specialistDefs) {
    tools.push({
      name: def.function.name,
      category: 'Specialists',
      description: def.function.description,
      parameters: def.function.parameters,
    })
  }

  // Apply filters
  let filtered = tools

  if (categoryFilter) {
    filtered = filtered.filter((t) => t.category.toLowerCase() === categoryFilter)
  }

  if (searchFilter) {
    filtered = filtered.filter((t) => t.name.toLowerCase().includes(searchFilter))
  }

  // Collect unique categories from unfiltered set
  const categories = [...new Set(tools.map((t) => t.category))]

  return NextResponse.json({
    tools: filtered,
    categories,
    totalCount: filtered.length,
  })
}
