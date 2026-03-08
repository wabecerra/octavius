import { NextResponse } from 'next/server'
import { getService } from '../service'

/** GET /api/llm-cost/models — List models in registry. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const service = getService()

  const models = service.getRegistry().listModels({
    provider: searchParams.get('provider') ?? undefined,
    mode: searchParams.get('mode') ?? undefined,
    include_deprecated: searchParams.get('include_deprecated') === 'true',
  })

  return NextResponse.json({ models, total: models.length })
}
