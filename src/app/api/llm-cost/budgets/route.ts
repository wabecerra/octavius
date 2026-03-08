import { NextResponse } from 'next/server'
import { getService } from '../service'
import { nanoid } from 'nanoid'
import type { BudgetPeriod, BudgetEnforcement } from '@/lib/llm-cost'

/** GET /api/llm-cost/budgets — List all budgets. */
export async function GET() {
  const service = getService()
  const budgets = service.listBudgets()
  return NextResponse.json({ budgets })
}

/** POST /api/llm-cost/budgets — Create a budget. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name: string
      period: BudgetPeriod
      limit_usd: number
      enforcement?: BudgetEnforcement
      project_id?: string
      model?: string
      provider?: string
    }

    if (!body.name || !body.period || body.limit_usd == null) {
      return NextResponse.json(
        { error: 'name, period, and limit_usd are required' },
        { status: 400 },
      )
    }

    const service = getService()
    const budget = service.createBudget({
      id: nanoid(),
      name: body.name,
      period: body.period,
      limit_usd: body.limit_usd,
      enforcement: body.enforcement ?? 'monitor_only',
      project_id: body.project_id,
      model: body.model,
      provider: body.provider,
    })

    return NextResponse.json(budget, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/** DELETE /api/llm-cost/budgets — Delete a budget (pass id in query). */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const service = getService()
  const deleted = service.deleteBudget(id)
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ success: true })
}
