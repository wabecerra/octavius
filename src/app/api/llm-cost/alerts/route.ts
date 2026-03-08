import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { AlertService } from '@/lib/llm-cost'

function getAlertService() {
  return new AlertService(getDatabase())
}

/** GET /api/llm-cost/alerts — List alert rules + recent events. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const svc = getAlertService()
  const includeDisabled = searchParams.get('include_disabled') === 'true'

  const rules = svc.listRules(includeDisabled)
  const events = svc.getEvents({
    limit: Number(searchParams.get('event_limit') ?? 20),
    rule_id: searchParams.get('rule_id') ?? undefined,
    severity: searchParams.get('severity') ?? undefined,
  })

  return NextResponse.json({ rules, events })
}

/** POST /api/llm-cost/alerts — Create an alert rule. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name: string
      type: string
      condition: { metric: string; operator: string; threshold: number; window_minutes?: number }
      severity?: string
      enabled?: boolean
    }

    if (!body.name || !body.type || !body.condition) {
      return NextResponse.json({ error: 'name, type, and condition required' }, { status: 400 })
    }

    const svc = getAlertService()
    const rule = svc.createRule({
      name: body.name,
      type: body.type as 'budget_threshold' | 'cost_absolute' | 'error_rate' | 'latency_threshold',
      condition: body.condition as { metric: string; operator: 'gt' | 'gte' | 'lt' | 'lte'; threshold: number; window_minutes?: number },
      severity: (body.severity as 'info' | 'warning' | 'critical') ?? 'warning',
      enabled: body.enabled,
    })

    return NextResponse.json(rule, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/** PATCH /api/llm-cost/alerts — Update a rule. Body must include `id`. */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id: string
      name?: string
      enabled?: boolean
      condition?: { metric: string; operator: string; threshold: number; window_minutes?: number }
      severity?: string
    }

    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const svc = getAlertService()
    const updated = svc.updateRule(body.id, {
      name: body.name,
      enabled: body.enabled,
      condition: body.condition as { metric: string; operator: 'gt' | 'gte' | 'lt' | 'lte'; threshold: number; window_minutes?: number },
      severity: body.severity as 'info' | 'warning' | 'critical',
    })

    if (!updated) return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    return NextResponse.json(updated)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/** DELETE /api/llm-cost/alerts — Delete a rule (id in query). */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const svc = getAlertService()
  if (!svc.deleteRule(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
