import { NextResponse } from 'next/server'
import { getAlertService } from '../../service'

/** POST /api/llm-cost/alerts/evaluate — Evaluate all enabled alert rules. */
export async function POST() {
  try {
    const svc = getAlertService()
    const events = svc.evaluate()

    return NextResponse.json({
      evaluated: true,
      events_fired: events.length,
      events,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
