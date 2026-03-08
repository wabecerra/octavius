import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/memory/db'
import { AlertService } from '@/lib/llm-cost'

/** POST /api/llm-cost/alerts/evaluate — Evaluate all enabled alert rules. */
export async function POST() {
  try {
    const svc = new AlertService(getDatabase())
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
