import { NextResponse } from 'next/server'
import { getCachedModels, refreshModelCatalog } from '@/lib/model-catalog'

/** GET /api/models — list cached models */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const provider = searchParams.get('provider') || undefined
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100

  const models = getCachedModels({ provider, limit })
  return NextResponse.json({ models, count: models.length })
}

/** POST /api/models — trigger a manual refresh */
export async function POST() {
  try {
    const result = await refreshModelCatalog()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Refresh failed' },
      { status: 500 },
    )
  }
}
